// Décide quelles offres supprimer ou marquer fermées, à partir de lectures
// ciblées de la base. N'écrit rien en base : imprime le plan, que Claude
// exécute avec ArtifactData en épinglant chaque écriture sur la version lue.
//
//   node scripts/purge-plan.mjs --offers <dossier>... [--closed closed.json] \
//     [--cvs <dossier>] [--cache checks.json] [--out plan.json]
//
// --offers : dossiers `out_dir` de requêtes sur `offers` (répétable) — en
//            pratique les offres anciennes (`scrapedAt` < il y a 21 jours), les
//            offres `hors` encore en base, et celles que check-open a trouvées
//            fermées. Un fichier par doc_id.
// --closed : rapport de check-open.mjs ; ses offres fermées sont supprimées, ou
//            seulement marquées `closed` quand elles sont protégées.
// --cvs    : dossier `out_dir` de la collection `cvs` ; une offre citée par un
//            CV est protégée.
// --cache  : cache local de check-open.mjs ; les offres supprimées y sont
//            notées `purged`, pour ne plus jamais être vérifiées.
//
// Politique : voir la skill `purge`. Toujours protégées : candidatures
// (`applied`, `answered`) et offres citées par un CV.

import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const DAY = 86400000;
// Âge (jours, sur scrapedAt ou postedAt s'il est plus récent) au-delà duquel une
// offre non protégée est supprimée. `hors` : tout de suite — on ne les écrit
// plus, celles qui restent datent d'avant ce changement.
const MAX_AGE = { hors: 0, none: 21, rejected: 21, possible: 45, cible: 60 };

const args = parseArgs(process.argv.slice(2));
const now = Date.now();

const offers = new Map();
for (const dir of args.offers || []) for (const [id, doc] of readDir(dir)) offers.set(id, doc);

const protectedIds = new Set();
for (const [, cv] of args.cvs ? readDir(args.cvs) : []) if (cv.offerDocId) protectedIds.add(cv.offerDocId);

const closedReport = args.closed && existsSync(args.closed) ? JSON.parse(readFileSync(args.closed, "utf8")) : { closed: [] };
const closedById = new Map(closedReport.closed.map((c) => [c.docId, c]));

const deletes = [];
const markClosed = [];
const parMotif = {};
let protegees = 0;

for (const [docId, o] of offers) {
  const isProtected = o.status === "applied" || o.status === "answered" || protectedIds.has(docId);
  const closed = closedById.get(docId);

  if (closed) {
    if (isProtected) {
      if (!o.closed) markClosed.push({ docId, closedAt: closedReport.checkedAt, closedReason: closed.reason });
    } else push(docId, o, "fermée");
    continue;
  }
  if (isProtected) { protegees++; continue; }
  if (o.closed) { push(docId, o, "fermée"); continue; }

  const key = o.status === "rejected" ? "rejected" : o.tier || "none";
  const limit = MAX_AGE[key];
  if (limit === undefined) continue;
  if (ageDays(o) >= limit) push(docId, o, key === "none" ? "non classée" : key);
}

// Closed offers that the read could not find are already gone: nothing to do.
const introuvables = [...closedById.keys()].filter((id) => !offers.has(id));

if (args.cache && deletes.length) {
  const cache = existsSync(args.cache) ? JSON.parse(readFileSync(args.cache, "utf8")) : {};
  for (const d of deletes) cache[d.docId] = { at: new Date(now).toISOString(), state: "purged" };
  writeFileSync(args.cache, JSON.stringify(cache));
}

const plan = {
  lues: offers.size,
  a_supprimer: deletes.length,
  par_motif: parMotif,
  a_marquer_fermees: markClosed.length,
  protegees,
  fermees_deja_absentes: introuvables.length,
  deletes,
  markClosed,
};
const json = JSON.stringify(plan, null, 2);
if (args.out) writeFileSync(args.out, json);
console.log(json);

// ---------------------------------------------------------------- utilitaires

function push(docId, o, motif) {
  deletes.push({ docId, searchId: o.searchId, motif });
  parMotif[motif] = (parMotif[motif] || 0) + 1;
}

function ageDays(o) {
  const ref = [o.scrapedAt, o.postedAt].filter(Boolean).sort().pop();
  return ref ? (now - new Date(ref).getTime()) / DAY : Infinity;
}

/** Fichiers `out_dir` : un document par fichier, nommé d'après son doc_id (sous-dossiers compris). */
function readDir(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readDir(path));
    else if (entry.name.endsWith(".json") && statSync(path).isFile()) {
      const doc = JSON.parse(readFileSync(path, "utf8"));
      out.push([basename(entry.name, ".json"), doc.data || doc]);
    }
  }
  return out;
}

function parseArgs(argv) {
  const out = {};
  const repeatable = new Set(["offers"]);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const value = argv[i + 1] === undefined || argv[i + 1].startsWith("--") ? true : argv[++i];
    if (repeatable.has(key)) (out[key] ||= []).push(value);
    else out[key] = value;
  }
  return out;
}
