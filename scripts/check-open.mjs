// Checks whether offers already in the database still accept applications,
// and reports the closed ones as JSON. Writes nothing to the database: the
// /veille-scrape command reads the report and acts on the offers itself.
//
//   node scripts/check-open.mjs --ids <seen.json|dir|file.json>... --cache <checks.json> [--out report.json] [--limit N]
//
// `--ids` (repeatable) takes `seen/<id>` documents ({ids, screened}: the
// screened ones were never written and are left out), JSON arrays,
// folders of one file per doc_id, or full offer documents: a doc_id is
// `<source>_<externalId>`, which is all a check needs. `--offers` is kept as
// an alias.
//
// The cache is a local file (never the base) remembering each answer: an offer
// found open is not asked again for RECHECK_DAYS, one found closed or purged
// never again. Without it, every run re-asked about every offer ever seen.
//
// Only sources that expose a reliable signal are checked (LinkedIn, Hellowork);
// the others are counted as skipped. Sources run in parallel, a few requests at
// a time each. A source that starts refusing requests (429, 999...) is
// abandoned for the rest of the run rather than hammered, and its remaining
// offers stay unchecked — never closed on a guess.

import { readFileSync, readdirSync, writeFileSync, statSync, existsSync, mkdirSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { mapLimit, sleep } from "./lib/pool.mjs";

import * as linkedin from "./sources/linkedin.mjs";
import * as hellowork from "./sources/hellowork.mjs";

const CHECKERS = { linkedin, hellowork };
const LANES = { linkedin: 3, hellowork: 4 };
const PAUSE_MS = 200;
const RECHECK_DAYS = 3;
// Consecutive "unknown" answers before a source is considered to be blocking us.
const MAX_UNKNOWN_STREAK = 6;

const args = parseArgs(process.argv.slice(2));
const offers = loadOffers([...(args.ids || []), ...(args.offers || [])]);
const limit = Number(args.limit || 0);
const cachePath = args.cache;
const cache = cachePath && existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};
const now = new Date();
const recheckBefore = new Date(now.getTime() - RECHECK_DAYS * 86400000).toISOString();

const fresh = (o) => {
  const c = cache[o.docId];
  if (!c) return false;
  if (c.state === "closed" || c.state === "purged") return true;
  return c.state === "open" && c.at >= recheckBefore;
};
const inScope = offers.filter((o) => CHECKERS[o.source] && !o.closed && o.status !== "rejected");
const todo = inScope.filter((o) => !fresh(o));
const queue = limit ? todo.slice(0, limit) : todo;

const report = {
  checkedAt: now.toISOString(),
  total: offers.length,
  checked: 0,
  open: 0,
  closed: [],
  unknown: 0,
  recent: inScope.length - todo.length,
  skipped: offers.length - inScope.length,
  unchecked: todo.length - queue.length,
  abandoned: {},
};

const started = Date.now();
await Promise.all(
  Object.keys(CHECKERS).map((source) => checkSource(source, queue.filter((o) => o.source === source)))
);

if (cachePath) {
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(cache));
}
const json = JSON.stringify(report, null, 2);
if (args.out) writeFileSync(args.out, json);
else console.log(json);
console.error(
  `\n${report.checked} vérifiées · ${report.open} ouvertes · ${report.closed.length} fermées · ${report.unknown} sans réponse · ` +
    `${report.recent} vérifiées récemment · ${report.unchecked} non vérifiées · ${report.skipped} hors périmètre · ` +
    `${Math.round((Date.now() - started) / 1000)} s`
);

async function checkSource(source, list) {
  let streak = 0;
  await mapLimit(list, LANES[source] || 1, async (offer) => {
    if (report.abandoned[source]) {
      report.unchecked++;
      return;
    }
    let result;
    try {
      result = await CHECKERS[source].checkOpen(offer);
    } catch (err) {
      result = { state: "unknown", error: String(err.message || err) };
    }
    report.checked++;
    if (result.state === "closed") {
      report.closed.push({ docId: offer.docId, source, externalId: offer.externalId, reason: result.reason });
      cache[offer.docId] = { at: now.toISOString(), state: "closed" };
      streak = 0;
    } else if (result.state === "open") {
      report.open++;
      cache[offer.docId] = { at: now.toISOString(), state: "open" };
      streak = 0;
    } else {
      report.unknown++;
      if (++streak >= MAX_UNKNOWN_STREAK) {
        report.abandoned[source] = `${MAX_UNKNOWN_STREAK} réponses inexploitables d'affilée (dernière : ${result.status || result.error})`;
      }
    }
    process.stderr.write(`${result.state.padEnd(7)} ${offer.docId}${result.reason ? " — " + result.reason : ""}\n`);
    await sleep(PAUSE_MS);
  });
}

// ---------------------------------------------------------------- utilitaires

function loadOffers(paths) {
  const byId = new Map();
  const add = (docId, d = {}) => {
    const sep = docId.indexOf("_");
    if (sep < 1) return;
    byId.set(docId, {
      docId,
      source: d.source || docId.slice(0, sep),
      externalId: d.externalId || docId.slice(sep + 1),
      status: d.status,
      closed: d.closed,
    });
  };
  for (const path of paths) {
    if (!existsSync(path)) continue;
    if (statSync(path).isDirectory()) {
      for (const f of readdirSync(path)) {
        if (!f.endsWith(".json")) continue;
        const doc = JSON.parse(readFileSync(join(path, f), "utf8"));
        // An out_dir file holds the bare document; its name is the doc_id.
        add(basename(f, ".json"), doc.data || doc);
      }
      continue;
    }
    const raw = JSON.parse(readFileSync(path, "utf8"));
    const doc = raw.data || raw;
    // A `seen` document's `screened` ids were never written to the base.
    const screened = new Set(doc.screened || []);
    const list = (Array.isArray(doc) ? doc : doc.ids || doc.offers || []).filter((id) => !screened.has(id));
    for (const item of list) {
      if (typeof item === "string") add(item);
      else {
        const d = item.data || item;
        const id = item.id || item.docId || (d.source && d.externalId ? `${d.source}_${d.externalId}` : null);
        if (id) add(id, d);
      }
    }
  }
  return [...byId.values()];
}

function parseArgs(argv) {
  const out = {};
  const repeatable = new Set(["ids", "offers"]);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const value = argv[i + 1] === undefined || argv[i + 1].startsWith("--") ? true : argv[++i];
    if (repeatable.has(key)) (out[key] ||= []).push(value);
    else out[key] = value;
  }
  return out;
}
