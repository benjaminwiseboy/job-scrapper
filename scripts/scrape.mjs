// Orchestrateur : lit une ou plusieurs configurations de recherche, interroge
// les sources activées, applique la fenêtre temporelle, écarte les offres déjà
// connues, dédoublonne, et écrit un rapport JSON par recherche. Les scripts ne
// parlent jamais à l'artefact — c'est la commande /veille-scrape qui lit ces
// JSON et écrit en base.
//
//   node scripts/scrape.mjs --config a.json [--config b.json] --out-dir <dossier> [--known <fichier|dossier>]...
//   node scripts/scrape.mjs --config <fichier.json> [--out <fichier.json>]
//   node scripts/scrape.mjs --query "acheteur junior" --location France [--contracts alternance,stage]
//
// Avec --out-dir, chaque recherche produit `run-<searchId>.json`.
//
// Parallélisme : toutes les sources tournent en même temps, et chacune ouvre
// quelques voies (LANES) qui se partagent les couples recherche × requête ×
// lieu. On reste poli avec chaque site — quelques requêtes simultanées au plus
// — mais on n'attend plus qu'une source ait fini pour lancer la suivante.
//
// --known : identifiants déjà en base ou déjà écartés (document `seen/<id>`,
// `dismissed/<id>`, tableau JSON, ou dossier d'un fichier par doc_id ; option
// répétable). Une offre connue est écartée avant toute requête supplémentaire,
// et une page de résultats entièrement connue arrête la pagination des sources
// triées par date.
//
// Fenêtre : depuis le dernier scrape de la source, plafonnée à maxDays (7 par
// défaut). Souplesse volontaire — les sources qui ne datent pas leurs offres
// (dateConfidence "unknown") ne sont jamais écartées par la fenêtre : c'est le
// dédoublonnage par les identifiants connus qui garantit la nouveauté.
//
// Contrat : une offre dont le contrat est connu et ne fait pas partie de
// `contracts` est écartée ici, avant la base. Un contrat inconnu passe. Pour
// une source qui ne l'affiche pas sur ses cartes (LinkedIn), on lit d'abord la
// fiche de l'offre — seulement pour les offres nouvelles.
//
// Écoles : une « alternance » publiée par une école ou un organisme de
// formation est du recrutement d'étudiants déguisé ; elle est écartée aussi.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { launchBrowser, newContext } from "./lib/browser.mjs";
import { windowStart } from "./lib/dates.mjs";
import { contractMismatch, dedupKey, mentionedContracts, schoolAd, slug } from "./lib/normalize.mjs";
import { mapLimit, sleep } from "./lib/pool.mjs";

import * as linkedin from "./sources/linkedin.mjs";
import * as indeed from "./sources/indeed.mjs";
import * as meteojob from "./sources/meteojob.mjs";
import * as apec from "./sources/apec.mjs";
import * as hellowork from "./sources/hellowork.mjs";

const SOURCES = { linkedin, indeed, meteojob, apec, hellowork };

// Priorité en cas de doublon inter-sources : on garde la fiche la plus riche.
const PRIORITE = ["apec", "hellowork", "meteojob", "indeed", "linkedin"];

// Simultaneous searches per source. LinkedIn answers 429 to a second
// concurrent search, so it stays on one lane (its posting pages, read for the
// contract, tolerate more). Indeed gets a fresh browser context per page.
const LANES = { linkedin: 1, hellowork: 3, indeed: 2, apec: 2, meteojob: 2 };
// LinkedIn posting pages read for their contract: simultaneous requests, and
// the pause each lane takes between two of them.
const CONTRACT_LANES = 3;
const CONTRACT_PAUSE_MS = 150;

const startedAt = Date.now();
const args = parseArgs(process.argv.slice(2));
const configs = buildConfigs(args);
const known = loadKnown(args.known);
const now = new Date();

const requested = Object.keys(SOURCES).filter((name) =>
  configs.some((c) => c.sources[name] && c.sources[name].enabled !== false)
);
const needsBrowser = requested.some((name) => SOURCES[name].needsBrowser);

// A missing Chromium only fails the browser sources, never the whole run.
let browser = null;
let browserError = null;
if (needsBrowser) {
  try {
    browser = await launchBrowser();
  } catch (err) {
    const reason = String(err.message || err).split(/\r?\n/)[0];
    browserError = `navigateur indisponible (${reason}) — installer Chromium : node scripts/setup.mjs --install-browser`;
  }
}

// rows[searchId][source] -> ligne du rapport ; kept[searchId] -> offres retenues
const rows = Object.fromEntries(configs.map((c) => [c.searchId, {}]));
const kept = Object.fromEntries(configs.map((c) => [c.searchId, []]));

try {
  await Promise.all(requested.map((name) => runSource(name)));
} finally {
  if (browser) await browser.close();
}

const results = configs.map((config) => {
  const offers = dedupeAcrossSources(kept[config.searchId]);
  const report = Object.keys(SOURCES)
    .map((name) => rows[config.searchId][name])
    .filter(Boolean);
  return {
    searchId: config.searchId,
    runAt: now.toISOString(),
    maxDays: config.maxDays,
    contracts: config.contracts,
    durationMs: Date.now() - startedAt,
    report,
    counts: { collected: kept[config.searchId].length, afterDedupe: offers.length },
    offers,
  };
});

if (args["out-dir"]) {
  mkdirSync(args["out-dir"], { recursive: true });
  for (const r of results) writeFileSync(join(args["out-dir"], `run-${r.searchId}.json`), JSON.stringify(r, null, 2));
  console.error(`Rapports écrits dans ${args["out-dir"]}`);
} else if (args.out) {
  writeFileSync(args.out, JSON.stringify(results[0], null, 2));
  console.error(`Rapport écrit dans ${args.out}`);
} else {
  console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
}

for (const r of results) {
  console.error(`\n[${r.searchId}]`);
  for (const row of r.report) {
    const motifs = [
      row.known && `${row.known} déjà connues`,
      row.wrongContract && `${row.wrongContract} contrat hors cible`,
      row.schoolAds && `${row.schoolAds} offres d'école`,
    ].filter(Boolean);
    const ecartees = motifs.length ? ` (écartées : ${motifs.join(", ")})` : "";
    const status = row.ok ? `${row.kept}/${row.found} retenues${ecartees}` : `ÉCHEC — ${row.error}`;
    console.error(`  ${row.label.padEnd(10)} ${status}  ${seconds(row.durationMs)}`);
  }
  console.error(`  ${"TOTAL".padEnd(10)} ${r.offers.length} offres nouvelles après dédoublonnage`);
}
console.error(`\nDurée totale : ${seconds(Date.now() - startedAt)}`);

// ------------------------------------------------------------------ sources

async function runSource(name) {
  const mod = SOURCES[name];
  const sourceStart = Date.now();
  const searches = configs.filter((c) => c.sources[name] && c.sources[name].enabled !== false);
  const stats = {};
  for (const c of searches) {
    const from = windowStart(c.sources[name].lastScrapeAt, c.maxDays, now);
    stats[c.searchId] = { source: name, label: mod.label, ok: true, from: from.toISOString(), found: 0, known: 0, kept: 0, wrongContract: 0, schoolAds: 0, error: null, durationMs: 0 };
    rows[c.searchId][name] = stats[c.searchId];
  }

  if (mod.needsBrowser && !browser) {
    for (const s of Object.values(stats)) Object.assign(s, { ok: false, error: browserError });
    return;
  }

  // 1. Listing pages: every search × query × location, over a few lanes.
  const tasks = searches.flatMap((config) =>
    config.queries.flatMap((query) => config.locations.map((location) => ({ config, query, location })))
  );
  const lanes = [];
  const listed = await mapLimit(tasks, LANES[name] || 1, async ({ config, query, location }, _i, lane) => {
    const s = stats[config.searchId];
    try {
      let page;
      if (mod.needsBrowser && !mod.freshPages) {
        lanes[lane] ||= newContext(browser).then((ctx) => ctx.newPage());
        page = await lanes[lane];
      }
      const offers = await mod.scrape({ browser, page, query, location, maxPages: config.maxPages, searchId: config.searchId, since: s.from, known });
      s.found += offers.length;
      return offers.map((offer) => ({ ...offer, query }));
    } catch (err) {
      s.ok = false;
      s.error ||= String(err.message || err).split(/\r?\n/)[0];
      return [];
    }
  });
  await Promise.all(lanes.map((p) => p.then((page) => page.context().close()).catch(() => {})));

  // 2. Cheap filters first, so that only new offers cost another request. An
  // offer found by several searches goes to the first one in config order.
  const claimed = new Set();
  const candidates = [];
  for (const config of searches) {
    const s = stats[config.searchId];
    const fromDate = new Date(s.from);
    for (const offer of listed.filter((_, i) => tasks[i].config === config).flat()) {
      if (claimed.has(offer.docId)) continue;
      claimed.add(offer.docId);
      if (known.has(offer.docId)) { s.known++; continue; }
      if (!insideWindow(offer, fromDate)) continue;
      if (isExcluded(offer, config.excludeKeywords)) continue;
      candidates.push({ config, offer });
    }
  }

  // 3. Contracts not shown on the cards (LinkedIn): read the posting, in parallel.
  if (mod.contractText) {
    const missing = candidates.filter(({ config, offer }) => config.contracts.length && !offer.contractTypes.length);
    await mapLimit(missing, CONTRACT_LANES, async ({ offer }) => {
      offer.contractTypes = mentionedContracts(await fetchContractText(mod, offer));
      await sleep(CONTRACT_PAUSE_MS);
    });
  }

  // 4. Contract and school filters.
  for (const { config, offer } of candidates) {
    const s = stats[config.searchId];
    if (contractMismatch(offer, config.contracts)) { s.wrongContract++; continue; }
    if (schoolAd(offer)) { s.schoolAds++; continue; }
    s.kept++;
    kept[config.searchId].push(offer);
  }

  const durationMs = Date.now() - sourceStart;
  for (const s of Object.values(stats)) s.durationMs = durationMs;
}

// ---------------------------------------------------------------- utilitaires

function insideWindow(offer, from) {
  // Pas de date exploitable : on laisse passer, les identifiants connus trancheront.
  if (!offer.postedAt || offer.dateConfidence === "unknown") return true;
  return new Date(offer.postedAt) >= from;
}

// A failure only leaves the contract unknown.
async function fetchContractText(mod, offer) {
  try {
    return await mod.contractText(offer);
  } catch {
    return "";
  }
}

function isExcluded(offer, excludeKeywords) {
  if (!excludeKeywords?.length) return false;
  const titre = slug(offer.title);
  return excludeKeywords.some((kw) => titre.includes(slug(kw)));
}

function dedupeAcrossSources(offers) {
  const best = new Map();
  for (const offer of offers) {
    const key = offer.dedupKey || dedupKey(offer);
    const existing = best.get(key);
    if (!existing) {
      best.set(key, { ...offer, alsoOn: [] });
      continue;
    }
    const winner = PRIORITE.indexOf(offer.source) < PRIORITE.indexOf(existing.source) ? offer : existing;
    const loser = winner === offer ? existing : offer;
    const alsoOn = [...new Set([...(existing.alsoOn || []), loser.source])].filter((s) => s !== winner.source);
    best.set(key, { ...winner, alsoOn });
  }
  return [...best.values()].sort((a, b) => String(b.postedAt || "").localeCompare(String(a.postedAt || "")));
}

function seconds(ms) {
  return `${Math.round((ms || 0) / 100) / 10} s`;
}

/** Identifiants connus : documents `{ids}`, tableaux JSON ou dossiers de fichiers par doc_id. */
function loadKnown(paths) {
  const set = new Set();
  for (const path of [].concat(paths || [])) {
    if (!existsSync(path)) continue;
    if (statSync(path).isDirectory()) {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        if (entry.isDirectory()) for (const id of loadKnown([join(path, entry.name)])) set.add(id);
        else if (entry.name.endsWith(".json")) set.add(basename(entry.name, ".json"));
      }
      continue;
    }
    const raw = JSON.parse(readFileSync(path, "utf8"));
    const doc = raw.data || raw;
    for (const id of Array.isArray(doc) ? doc : doc.ids || []) set.add(String(id));
  }
  return set;
}

// `--config` and `--known` may be repeated; every other option keeps its last value.
function parseArgs(argv) {
  const out = {};
  const repeatable = new Set(["config", "known"]);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const value = argv[i + 1] === undefined || argv[i + 1].startsWith("--") ? true : argv[++i];
    if (repeatable.has(key)) (out[key] ||= []).push(value);
    else out[key] = value;
  }
  return out;
}

function buildConfigs(args) {
  if (args.config) {
    return args.config.map((path) => {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      return {
        searchId: raw.searchId || "default",
        maxDays: Number(raw.maxDays ?? 7),
        maxPages: Number(raw.maxPages ?? 3),
        queries: raw.queries?.length ? raw.queries : [raw.query || "acheteur junior"],
        locations: raw.locations?.length ? raw.locations : [raw.location || "France"],
        excludeKeywords: raw.excludeKeywords || [],
        contracts: raw.contracts || [],
        sources: raw.sources || defaultSources(),
      };
    });
  }
  return [
    {
      searchId: args.search || "default",
      maxDays: Number(args.maxDays ?? 7),
      maxPages: Number(args.maxPages ?? 3),
      queries: [args.query || "acheteur junior"],
      locations: [args.location || "France"],
      excludeKeywords: [],
      contracts: args.contracts ? String(args.contracts).split(",").map((c) => c.trim()) : [],
      sources: args.sources
        ? Object.fromEntries(String(args.sources).split(",").map((s) => [s.trim(), { enabled: true }]))
        : defaultSources(),
    },
  ];
}

function defaultSources() {
  return Object.fromEntries(Object.keys(SOURCES).map((name) => [name, { enabled: true, lastScrapeAt: null }]));
}
