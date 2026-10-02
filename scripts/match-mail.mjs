// Relie des mails de candidature (confirmation, entretien, refus) aux offres
// en base et calcule les mises à jour de statut.
//
// Le script ne lit pas la boîte mail et n'écrit pas en base : Claude lit les
// mails, en extrait l'essentiel dans un JSON, puis applique les écritures
// imprimées ici. Garder cette séparation (voir CLAUDE.md).
//
//   node scripts/match-mail.mjs --offers .veille-tmp/mail/offers \
//     --mails .veille-tmp/mail/mails.json [--state .veille-tmp/mail/state.json] \
//     [--decisions .veille-tmp/mail/decisions.json]
//
// --offers    : dossier de fichiers JSON, un par offre, nommés `<docId>.json`
//               (tel que produit par une lecture `query ... out_dir`).
// --mails     : tableau de {messageId, date, kind, company, title, location,
//               urls, platform}. `kind` ∈ confirmation · entretien · refus.
// --state     : document `mailsync/state` ({processed: [...]}) : les mails
//               déjà traités lors d'un passage précédent sont ignorés.
// --decisions : {messageId: docId | null} — réponses de l'utilisateur aux
//               correspondances à valider. null = mail à ignorer.
//
// Sortie : {sures, a_valider, hors_dashboard, sans_effet, deja_traites,
// ecritures, traites}. `traites` liste les mails à ajouter à `mailsync/state`. `ecritures` ne porte pas de if_version : le script ne connaît pas
// les versions, Claude relit chaque offre visée avant d'écrire.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { slug, cityKey } from "./lib/normalize.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.offers || !args.mails) {
  console.error("usage: match-mail.mjs --offers <dir> --mails <file> [--state <file>] [--decisions <file>]");
  process.exit(1);
}

const offers = loadOffers(args.offers);
const mails = JSON.parse(readFileSync(args.mails, "utf8"));
const processed = new Set(loadJson(args.state)?.processed || []);
const decisions = loadJson(args.decisions) || {};

const KINDS = new Set(["confirmation", "entretien", "refus"]);
const STRONG = 0.6; // titres quasi identiques une fois le bruit retiré
const WEAK = 0.35; // en dessous, deux intitulés n'ont presque rien en commun

// Formes juridiques et mots creux : « RecrutoYou SAS » et « RECRUTOYOU » sont
// la même entreprise.
const LEGAL = new Set([
  "sa", "sas", "sasu", "sarl", "eurl", "sci", "snc", "scop", "gie", "se", "inc", "ltd", "llc", "gmbh", "bv", "nv", "ag", "spa",
  "group", "groupe", "france", "the", "et", "and", "co", "cie", "holding", "international",
]);

// Mots qui ne distinguent pas deux postes : genre, contrat, articles.
const NOISE = new Set([
  "h", "f", "m", "x", "hf", "fh", "cdi", "cdd", "stage", "stagiaire", "alternance", "alternant", "apprentissage", "apprenti",
  "de", "des", "du", "d", "la", "le", "les", "l", "en", "et", "a", "au", "aux", "un", "une", "pour", "sur", "chez",
  "of", "the", "and", "for", "with", "in", "at", "poste", "offre", "emploi", "job",
]);

const out = { sures: [], a_valider: [], hors_dashboard: [], sans_effet: [], deja_traites: 0, ignores: 0 };
// État de travail par offre : plusieurs mails peuvent viser la même offre
// (confirmation puis refus). On les applique dans l'ordre chronologique et on
// n'émet qu'une écriture par document, un lot n'acceptant qu'une entrée par doc.
const working = new Map();

const sorted = [...mails].sort((a, b) => String(a.date).localeCompare(String(b.date)));
for (const mail of sorted) {
  if (processed.has(mail.messageId)) { out.deja_traites++; continue; }
  if (!KINDS.has(mail.kind)) {
    out.hors_dashboard.push({ ...summary(mail), raison: `type inconnu « ${mail.kind} »` });
    continue;
  }

  if (mail.messageId in decisions) {
    const docId = decisions[mail.messageId];
    if (!docId) { out.ignores++; continue; }
    const offer = offers.get(docId);
    if (!offer) {
      out.a_valider.push({ ...summary(mail), raison: `offre ${docId} introuvable en base`, candidats: [] });
      continue;
    }
    apply(mail, offer, "validé par l'utilisateur", true);
    continue;
  }

  const found = match(mail);
  if (found.sure) apply(mail, found.sure, found.raison);
  else if (found.candidats.length) out.a_valider.push({ ...summary(mail), raison: found.raison, candidats: found.candidats });
  else out.hors_dashboard.push({ ...summary(mail), raison: found.raison });
}

const ecritures = [];
for (const [docId, w] of working) {
  if (!Object.keys(w.data).length) continue;
  ecritures.push({ op: "update", collection: "offers", doc_id: docId, data: w.data });
}

// Tout mail tranché (appliqué, sans effet, hors dashboard, ignoré) est traité ;
// seuls ceux qui attendent une validation reviendront au passage suivant.
const pending = new Set(out.a_valider.map((m) => m.messageId));
const traites = mails.map((m) => m.messageId).filter((id) => !processed.has(id) && !pending.has(id));

console.log(JSON.stringify({ ...out, ecritures, traites }, null, 2));

// ------------------------------------------------------------- correspondance

function match(mail) {
  // 1. Lien ou identifiant de l'annonce cité dans le mail : aucune ambiguïté.
  for (const url of mail.urls || []) {
    for (const o of offers.values()) {
      if ((o.url && sameUrl(url, o.url)) || (o.externalId && String(url).includes(o.externalId))) {
        return { sure: o, raison: "lien de l'annonce présent dans le mail" };
      }
    }
  }

  const mailCo = companyTokens(mail.company);
  const atCompany = mailCo.length ? [...offers.values()].filter((o) => sameCompany(mailCo, companyTokens(o.company))) : [];

  if (!atCompany.length) {
    // Sans entreprise lisible (mail d'une plateforme), un titre très proche
    // mérite d'être montré, jamais appliqué.
    if (!mailCo.length && mail.title) {
      const close = rank([...offers.values()], mail).filter((c) => c.score >= 0.8);
      if (close.length) return { candidats: close.slice(0, 5), raison: "entreprise absente du mail, titre proche" };
    }
    return { candidats: [], raison: mailCo.length ? "aucune offre de cette entreprise en base" : "entreprise non identifiée" };
  }

  const ranked = rank(atCompany, mail);

  // 2. Une réponse (entretien, refus) porte sur une candidature existante : si
  // une seule offre de l'entreprise est marquée postulée, c'est elle — sauf si
  // le titre du mail la contredit.
  if (mail.kind !== "confirmation") {
    const open = atCompany.filter((o) => o.status === "applied" || o.status === "answered");
    if (open.length === 1) {
      const score = mail.title ? titleScore(mail.title, open[0].title) : 1;
      if (score >= WEAK) return { sure: open[0], raison: "seule candidature en cours chez cette entreprise" };
    }
  }

  // 3. Titre nettement meilleur que les autres offres de l'entreprise.
  const [best, second] = ranked;
  if (mail.title && best.score >= STRONG && (!second || second.score < WEAK)) {
    return { sure: offers.get(best.docId), raison: "même entreprise, même intitulé" };
  }

  // 4. Même intitulé publié dans plusieurs villes : la ville du mail tranche.
  const top = ranked.filter((c) => c.score >= STRONG);
  if (mail.title && mail.location && top.length > 1) {
    const here = top.filter((c) => cityKey(c.location) === cityKey(mail.location));
    const rest = ranked.filter((c) => !here.includes(c) && c.score >= WEAK);
    if (here.length === 1 && rest.every((c) => cityKey(c.location) !== cityKey(mail.location))) {
      return { sure: offers.get(here[0].docId), raison: "même entreprise, même intitulé, même ville" };
    }
  }

  return {
    candidats: ranked.slice(0, 5),
    raison: ranked.length > 1 ? `${ranked.length} offres chez cette entreprise` : "même entreprise, intitulé différent",
  };
}

function rank(list, mail) {
  return list
    .map((o) => ({
      docId: o.docId,
      ref: o.ref,
      title: o.title,
      company: o.company,
      location: o.location,
      status: o.status,
      score: round(mail.title ? titleScore(mail.title, o.title) : 0),
    }))
    .sort((a, b) => b.score - a.score);
}

// ----------------------------------------------------------------- transitions

// Le statut ne recule jamais : new/seen → applied → answered. Un refus est un
// résultat, pas un statut : il s'ajoute (`outcome`) sans effacer la candidature,
// qui reste comptée et protégée de la purge. `rejected` est réservé au bouton
// « Écarter » du dashboard, une décision de l'utilisateur.
function apply(mail, offer, raison, validated = false) {
  const w = working.get(offer.docId) || { status: offer.status, outcome: offer.outcome || null, data: {} };
  const line = { ...summary(mail), docId: offer.docId, ref: offer.ref, offre: `${offer.title} · ${offer.company}`, raison };
  const at = mail.date;

  // Une offre écartée à la main puis visée par un mail : contradiction à faire
  // trancher. Une fois l'utilisateur d'accord, elle repart comme une offre vue.
  if (w.status === "rejected" && validated) w.status = "seen";
  if (w.status === "rejected") {
    out.a_valider.push({
      ...line,
      raison: "offre écartée à la main dans le dashboard, mais un mail de candidature la concerne",
      candidats: [{ docId: offer.docId, ref: offer.ref, title: offer.title, company: offer.company, status: offer.status, score: 1 }],
    });
    return;
  }

  const before = w.status;
  let changed = false;
  if (mail.kind === "confirmation" && (w.status === "new" || w.status === "seen")) {
    w.status = "applied";
    changed = true;
  } else if (mail.kind === "entretien" && w.status !== "answered") {
    w.status = "answered";
    changed = true;
  } else if (mail.kind === "refus" && w.outcome !== "refused") {
    // Un refus prouve la candidature, même si la confirmation n'est jamais arrivée.
    if (w.status === "new" || w.status === "seen") w.status = "applied";
    w.outcome = "refused";
    w.data.outcome = "refused";
    w.data.outcomeAt = at;
    changed = true;
  }

  if (!changed) {
    out.sans_effet.push({ ...line, raison: `déjà à jour (statut ${w.status}${w.outcome ? `, ${w.outcome}` : ""})` });
    return;
  }
  // statusAt date le changement de statut lui-même : un refus arrivé plus tard
  // ne doit pas déplacer la date de candidature.
  if (w.status !== before) {
    w.data.status = w.status;
    w.data.statusAt = at;
  }
  working.set(offer.docId, w);
  out.sures.push({ ...line, avant: before, apres: w.status, refus: w.outcome === "refused" });
}

// ---------------------------------------------------------------- normalisation

function companyTokens(name) {
  return slug(name).split(" ").filter((t) => t && !LEGAL.has(t));
}

/** Même entreprise si l'un des noms contient tous les mots de l'autre. */
function sameCompany(a, b) {
  if (!a.length || !b.length) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const set = new Set(long);
  return short.every((t) => set.has(t));
}

function titleTokens(title) {
  return new Set(slug(title).split(" ").filter((t) => t.length > 0 && !NOISE.has(t) && !/^\d+$/.test(t)));
}

/** Coefficient de Dice sur les mots significatifs des deux intitulés. */
function titleScore(a, b) {
  const A = titleTokens(a);
  const B = titleTokens(b);
  if (!A.size || !B.size) return 0;
  let common = 0;
  for (const t of A) if (B.has(t)) common++;
  return (2 * common) / (A.size + B.size);
}

function sameUrl(a, b) {
  const norm = (u) => String(u).replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "");
  return norm(a) === norm(b);
}

// ------------------------------------------------------------------ utilitaires

function summary(mail) {
  return {
    messageId: mail.messageId,
    date: mail.date,
    kind: mail.kind,
    company: mail.company || null,
    title: mail.title || null,
    platform: mail.platform || null,
  };
}

function round(n) {
  return Math.round(n * 100) / 100;
}

function loadOffers(dir) {
  const map = new Map();
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry.endsWith(".json")) {
        const raw = JSON.parse(readFileSync(p, "utf8"));
        const doc = raw.data || raw;
        map.set(basename(entry, ".json"), { ...doc, docId: basename(entry, ".json") });
      }
    }
  };
  walk(dir);
  return map;
}

function loadJson(path) {
  if (!path || !existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return raw.data || raw;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    out[key] = argv[i + 1]?.startsWith("--") ? true : argv[++i];
  }
  return out;
}
