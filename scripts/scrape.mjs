// Orchestrateur : lit une configuration de recherche, interroge les sources
// activées, applique la fenêtre temporelle, dédoublonne, et écrit un rapport
// JSON. Les scripts ne parlent jamais à l'artefact — c'est la commande
// /veille-scrape qui lit ce JSON et écrit en base.
//
//   node scripts/scrape.mjs --config <fichier.json> [--out <fichier.json>]
//   node scripts/scrape.mjs --query "acheteur junior" --location France
//
// Fenêtre : depuis le dernier scrape de la source, plafonnée à maxDays (7 par
// défaut). Souplesse volontaire — les sources qui ne datent pas leurs offres
// (dateConfidence "unknown") ne sont jamais écartées par la fenêtre : c'est le
// dédoublonnage côté base qui garantit qu'on ne revoit pas une offre connue.

import { readFileSync, writeFileSync } from "node:fs";
import { launchBrowser } from "./lib/browser.mjs";
import { windowStart } from "./lib/dates.mjs";
import { dedupKey, slug } from "./lib/normalize.mjs";

import * as linkedin from "./sources/linkedin.mjs";
import * as indeed from "./sources/indeed.mjs";
import * as meteojob from "./sources/meteojob.mjs";
import * as apec from "./sources/apec.mjs";
import * as hellowork from "./sources/hellowork.mjs";

const SOURCES = { linkedin, indeed, meteojob, apec, hellowork };

// Priorité en cas de doublon inter-sources : on garde la fiche la plus riche.
const PRIORITE = ["apec", "hellowork", "meteojob", "indeed", "linkedin"];

const args = parseArgs(process.argv.slice(2));
const config = buildConfig(args);
const now = new Date();

const requested = Object.entries(config.sources).filter(([name, s]) => s.enabled !== false && SOURCES[name]);
const needsBrowser = requested.some(([name]) => SOURCES[name].needsBrowser);
const browser = needsBrowser ? await launchBrowser() : null;

const report = [];
const collected = [];

try {
  for (const [name, sourceConfig] of requested) {
    const mod = SOURCES[name];
    const from = windowStart(sourceConfig.lastScrapeAt, config.maxDays, now);
    let found = 0;
    const kept = [];

    try {
      for (const query of config.queries) {
        for (const location of config.locations) {
          const offers = await mod.scrape({
            browser,
            query,
            location,
            maxPages: config.maxPages,
            searchId: config.searchId,
            since: from.toISOString(),
          });
          found += offers.length;
          for (const offer of offers) {
            offer.query = query;
            if (!insideWindow(offer, from)) continue;
            if (isExcluded(offer, config.excludeKeywords)) continue;
            kept.push(offer);
          }
        }
      }
      report.push({ source: name, label: mod.label, ok: true, from: from.toISOString(), found, kept: kept.length, error: null });
      collected.push(...kept);
    } catch (err) {
      report.push({ source: name, label: mod.label, ok: false, from: from.toISOString(), found, kept: 0, error: String(err.message || err) });
    }
  }
} finally {
  if (browser) await browser.close();
}

const offers = dedupeAcrossSources(collected);

const result = {
  searchId: config.searchId,
  runAt: now.toISOString(),
  maxDays: config.maxDays,
  report,
  counts: { collected: collected.length, afterDedupe: offers.length },
  offers,
};

const json = JSON.stringify(result, null, 2);
if (args.out) {
  writeFileSync(args.out, json);
  console.error(`Rapport écrit dans ${args.out}`);
} else {
  console.log(json);
}

for (const r of report) {
  const status = r.ok ? `${r.kept}/${r.found} retenues` : `ÉCHEC — ${r.error}`;
  console.error(`  ${r.label.padEnd(10)} ${status}`);
}
console.error(`  ${"TOTAL".padEnd(10)} ${offers.length} offres après dédoublonnage`);

// ---------------------------------------------------------------- utilitaires

function insideWindow(offer, from) {
  // Pas de date exploitable : on laisse passer, la base tranchera.
  if (!offer.postedAt || offer.dateConfidence === "unknown") return true;
  return new Date(offer.postedAt) >= from;
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

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const value = argv[i + 1]?.startsWith("--") ? true : argv[++i];
    out[key] = value;
  }
  return out;
}

function buildConfig(args) {
  if (args.config) {
    const raw = JSON.parse(readFileSync(args.config, "utf8"));
    return {
      searchId: raw.searchId || "default",
      maxDays: Number(raw.maxDays ?? 7),
      maxPages: Number(raw.maxPages ?? 3),
      queries: raw.queries?.length ? raw.queries : [raw.query || "acheteur junior"],
      locations: raw.locations?.length ? raw.locations : [raw.location || "France"],
      excludeKeywords: raw.excludeKeywords || [],
      sources: raw.sources || defaultSources(),
    };
  }
  return {
    searchId: args.search || "default",
    maxDays: Number(args.maxDays ?? 7),
    maxPages: Number(args.maxPages ?? 3),
    queries: [args.query || "acheteur junior"],
    locations: [args.location || "France"],
    excludeKeywords: [],
    sources: args.sources
      ? Object.fromEntries(String(args.sources).split(",").map((s) => [s.trim(), { enabled: true }]))
      : defaultSources(),
  };
}

function defaultSources() {
  return Object.fromEntries(Object.keys(SOURCES).map((name) => [name, { enabled: true, lastScrapeAt: null }]));
}
