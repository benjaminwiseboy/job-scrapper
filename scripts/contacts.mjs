// Finds HR contact emails for a company through the Hunter.io API, for
// spontaneous applications by email. Prints JSON on stdout and writes nothing
// to the database: /veille-contacts stores the result on the offer itself.
//
//   node scripts/contacts.mjs --company "Groupe Piment" [--domain piment.fr] [--limit 10] [--out file.json]
//   node scripts/contacts.mjs --name "Prénom Nom" --domain piment.fr   one named person (Email Finder)
//   node scripts/contacts.mjs --account          remaining Hunter credits, costs nothing
//
// The key comes from HUNTER_API_KEY or ~/.veille-emploi/secrets.json
// (`veille-config.mjs secret hunter <key>`), never from the command line.
//
// One Domain Search costs one credit as soon as Hunter returns addresses, even
// useless ones, and nothing when it returns none. The strategy walks from the
// most useful to the most general — HR people, then generic addresses
// (recrutement@, rh@, contact@), then executives (who hire directly in a small
// company) — and stops at the first billed answer: one credit per search at
// most, possibly for nothing usable. The free plan has 50 credits a month.
//
// Exit codes: 0 ok (even with no email found), 2 bad usage, 3 no API key,
// 4 Hunter refused the request (key, quota, rate limit).
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getSecret } from "./lib/config.mjs";

// fail() unwinds instead of calling process.exit(): on Windows, exiting right
// after a fetch can trip a libuv assertion and lose the exit code the skills
// rely on. Declared first: a class is not hoisted.
class Exit extends Error {}
process.on("uncaughtException", (e) => {
  if (e instanceof Exit) process.exitCode = e.code;
  else {
    console.error(e);
    process.exitCode = 1;
  }
});

const API = "https://api.hunter.io/v2";
const STRATEGIES = [
  { name: "hr", params: { department: "hr" } },
  { name: "generic", params: { type: "generic" } },
  { name: "executive", params: { department: "executive" } },
];
// An offer posted by one of these is the agency's, not the employer's: its
// recruiters are the right contacts for this offer, but not for a spontaneous
// application to the end client, whose name the posting usually hides.
const AGENCIES = /\b(michael page|page personnel|manpower|adecco|randstad|domino rh|start people|crit\b|proman|hays|robert half|robert walters|expectra|synergie|partnaire|kalixens|nextep|harry hope|lhh|menway|samsic|actual|temporis|groupe piment|interim|intérim|travail temporaire|recrutement|recruitment|rh\b|talents?\b|cabinet)/i;
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
// Generic mailboxes worth writing to for an application; the rest (vip@,
// promo@, noreply@...) is noise. contact@ is kept as a last resort.
const HIRING_BOX = /^(recrut\w*|rh|drh|hr|jobs?|emplois?|careers?|carrieres?|carrières?|candidat\w*|talents?|recruit\w*|stages?|contact)(?:[._-][a-z0-9]+)*@/i;

const args = parseArgs(process.argv.slice(2));
const key = getSecret("hunter");
if (!key) {
  // Each user brings their own key: none ships with the tool.
  const cmd = `node "${join(dirname(fileURLToPath(import.meta.url)), "veille-config.mjs")}" secret hunter`;
  fail(3, `Pas de clé Hunter. Crée un compte gratuit sur https://hunter.io, copie ta clé (https://hunter.io/api-keys), puis colle-la dans la conversation avec Claude, relance l'installeur, ou lance dans ton propre terminal : ${cmd}`);
}

if (args.account) {
  const data = await call("account", {});
  print({ credits: credits(data) });
} else if (typeof args.name === "string") {
  // A named person (the recruiter who signed the posting): Email Finder, one
  // credit when it finds something.
  const domain = typeof args.domain === "string" ? args.domain.trim().toLowerCase() : "";
  const company = typeof args.company === "string" ? args.company.trim() : "";
  if (!domain && !company) fail(2, "Usage : --name \"Prénom Nom\" --domain <domaine> | --company <nom>");
  const d = await call("email-finder", { full_name: args.name.trim(), ...(domain ? { domain } : { company }) });
  print({
    name: args.name.trim(),
    domain: d.domain || domain || null,
    searchedAt: new Date().toISOString(),
    email: EMAIL.test(d.email || "") ? d.email.toLowerCase() : null,
    position: d.position || null,
    confidence: d.score ?? null,
    verification: d.verification?.status || null,
    linkedin: httpUrl(d.linkedin_url),
  });
} else {
  const company = typeof args.company === "string" ? args.company.trim() : "";
  const domain = typeof args.domain === "string" ? args.domain.trim().toLowerCase() : "";
  if (!company && !domain) fail(2, "Usage : --company <nom> [--domain <domaine>] [--limit 10] [--out fichier]");
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 100);

  const target = domain ? { domain } : { company };
  let found = null;
  const tried = [];
  let charged = false;
  let discarded = 0;
  for (const s of STRATEGIES) {
    const data = await call("domain-search", { ...target, ...s.params, limit });
    tried.push(s.name);
    const raw = data.emails || [];
    data.emails = raw.filter((e) => e.type !== "generic" || HIRING_BOX.test(e.value || ""));
    if (data.emails.length) { found = { strategy: s.name, data }; }
    // Hunter bills any answer that holds addresses, even ones filtered out as
    // useless (vip@, promo@...). Stop at the first billed call, so a search
    // never costs more than one credit.
    if (raw.length) {
      charged = true;
      discarded = raw.length - data.emails.length;
      break;
    }
    // Hunter resolves the company name to a domain on the first call; reuse it
    // so the following calls cannot drift to a homonym.
    if (!target.domain && data.domain) {
      target.domain = data.domain;
      delete target.company;
    }
  }

  const d = found?.data || {};
  print({
    company: company || d.organization || domain,
    domain: d.domain || target.domain || null,
    organization: d.organization || null,
    pattern: d.pattern || null,
    agency: AGENCIES.test(company || d.organization || ""),
    strategy: found?.strategy || null,
    tried,
    creditUsed: charged,
    discarded,
    searchedAt: new Date().toISOString(),
    emails: (d.emails || [])
      .filter((e) => EMAIL.test(e.value || ""))
      .map((e) => ({
        email: e.value.toLowerCase(),
        name: [e.first_name, e.last_name].filter(Boolean).join(" ") || null,
        position: e.position || null,
        department: e.department || null,
        seniority: e.seniority || null,
        type: e.type || null,
        confidence: e.confidence ?? null,
        verification: e.verification?.status || null,
        linkedin: httpUrl(e.linkedin),
        sources: e.sources?.length || 0,
      }))
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)),
  });
}

async function call(path, params) {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  // The key goes in a header, not the URL, so it never lands in a log.
  const res = await fetch(url, { headers: { "X-API-KEY": key, accept: "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body.errors?.map((e) => e.details || e.id).join(" ; ") || res.statusText;
    const hint = res.status === 401 ? "clé refusée"
      : res.status === 429 ? "quota de crédits ou limite de débit atteint"
      : res.status === 403 ? "limite de requêtes atteinte, réessaie dans une minute"
      : `HTTP ${res.status}`;
    fail(4, `Hunter : ${hint} (${detail}).`);
  }
  return body.data || {};
}

function credits(account) {
  const s = account.requests?.searches || {};
  return { used: s.used ?? null, available: s.available ?? null, plan: account.plan_name || null, resetDate: account.reset_date || null };
}

function httpUrl(value) {
  if (!value) return null;
  const v = /^https?:\/\//i.test(value) ? value : `https://www.linkedin.com/in/${value}`;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

function print(obj) {
  const json = JSON.stringify(obj, null, 2);
  if (typeof args.out === "string") writeFileSync(args.out, json + "\n");
  console.log(json);
}

function fail(code, message) {
  console.error(message);
  throw Object.assign(new Exit(message), { code });
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const v = argv[i + 1] === undefined || argv[i + 1].startsWith("--") ? true : argv[++i];
    out[k] = v;
  }
  return out;
}
