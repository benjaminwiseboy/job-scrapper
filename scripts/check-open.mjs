// Checks whether offers already in the database still accept applications,
// and reports the closed ones as JSON. Writes nothing to the database: the
// /veille:scrape command reads the report and marks the offers itself.
//
//   node scripts/check-open.mjs --offers <dir|file.json> [--out report.json] [--limit N]
//
// `--offers` takes the folder written by an `ArtifactData query ... out_dir`
// (one file per document, named after its doc_id) or a JSON array of offers.
//
// Only sources that expose a reliable signal are checked (LinkedIn, Hellowork);
// the others are counted as skipped. A source that starts refusing requests
// (429, 999...) is abandoned for the rest of the run rather than hammered, and
// its remaining offers stay unchecked — never closed on a guess.

import { readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";

import * as linkedin from "./sources/linkedin.mjs";
import * as hellowork from "./sources/hellowork.mjs";

const CHECKERS = { linkedin, hellowork };
const PAUSE_MS = 350;
// Consecutive "unknown" answers before a source is considered to be blocking us.
const MAX_UNKNOWN_STREAK = 5;

const args = parseArgs(process.argv.slice(2));
const offers = loadOffers(args.offers);
const limit = Number(args.limit || 0);

const todo = offers.filter((o) => CHECKERS[o.source] && !o.closed && o.status !== "rejected");
const queue = limit ? todo.slice(0, limit) : todo;

const report = {
  checkedAt: new Date().toISOString(),
  total: offers.length,
  checked: 0,
  open: 0,
  closed: [],
  unknown: 0,
  skipped: offers.length - todo.length,
  unchecked: todo.length - queue.length,
  abandoned: {},
};

const streak = {};
for (const offer of queue) {
  if (report.abandoned[offer.source]) {
    report.unchecked++;
    continue;
  }
  let result;
  try {
    result = await CHECKERS[offer.source].checkOpen(offer);
  } catch (err) {
    result = { state: "unknown", error: String(err.message || err) };
  }
  report.checked++;
  if (result.state === "closed") {
    report.closed.push({ docId: offer.docId, source: offer.source, externalId: offer.externalId, ref: offer.ref, title: offer.title, status: offer.status, reason: result.reason });
    streak[offer.source] = 0;
  } else if (result.state === "open") {
    report.open++;
    streak[offer.source] = 0;
  } else {
    report.unknown++;
    streak[offer.source] = (streak[offer.source] || 0) + 1;
    if (streak[offer.source] >= MAX_UNKNOWN_STREAK) {
      report.abandoned[offer.source] = `${MAX_UNKNOWN_STREAK} réponses inexploitables d'affilée (dernière : ${result.status || result.error})`;
    }
  }
  process.stderr.write(`${result.state.padEnd(7)} ${offer.docId}${result.reason ? " — " + result.reason : ""}\n`);
  await new Promise((r) => setTimeout(r, PAUSE_MS));
}

const json = JSON.stringify(report, null, 2);
if (args.out) writeFileSync(args.out, json);
else console.log(json);
console.error(
  `\n${report.checked} vérifiées · ${report.open} ouvertes · ${report.closed.length} fermées · ${report.unknown} sans réponse · ${report.unchecked} non vérifiées · ${report.skipped} hors périmètre`
);

// ---------------------------------------------------------------- utilitaires

function loadOffers(path) {
  if (!path) throw new Error("--offers est requis");
  const raw = [];
  if (statSync(path).isDirectory()) {
    for (const f of readdirSync(path)) {
      if (!f.endsWith(".json")) continue;
      const doc = JSON.parse(readFileSync(join(path, f), "utf8"));
      // An out_dir file holds the bare document; its name is the doc_id.
      raw.push(doc.data ? doc : { id: basename(f, ".json"), data: doc });
    }
  } else {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    raw.push(...(Array.isArray(parsed) ? parsed : parsed.offers || []));
  }
  return raw
    .map((r) => {
      const d = r.data || r;
      const docId = r.id || r.docId || (d.source && d.externalId ? `${d.source}_${d.externalId}` : null);
      return docId && d.externalId
        ? { docId, source: d.source, externalId: d.externalId, ref: d.ref, title: d.title, status: d.status, closed: d.closed }
        : null;
    })
    .filter(Boolean);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    out[argv[i].slice(2)] = argv[i + 1]?.startsWith("--") ? true : argv[++i];
  }
  return out;
}
