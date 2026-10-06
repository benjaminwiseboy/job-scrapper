// Transforme un rapport de scraping en écritures prêtes pour l'artefact.
//
// Les scripts ne peuvent pas appeler l'outil ArtifactData (c'est un outil de
// Claude), et recopier 100 offres en JSON dans un appel coûterait cher. Ce
// script écrit donc un fichier par offre et imprime les lots à passer tels
// quels dans `writes`, chaque entrée pointant vers son fichier.
//
// Deux temps :
//
//   1. Liste à classer, une ligne par offre nouvelle (rien n'est écrit) :
//      node scripts/prepare-db.mjs --report run.json --list
//
//   2. Écritures, une fois le classement posé dans un fichier :
//      node scripts/prepare-db.mjs --report run.json --search achats --code ACH \
//        --next-ref 1 --tiers tiers.json --seen seen.json --seen-version 3 --out db-writes/achats
//
// --tiers   : {"<docId>": {"tier": "cible", "rationale": "…"}, "<docId>": "hors", …}.
//             Les offres `hors` ne sont pas écrites en base : elles rejoignent
//             seulement `seen`, pour ne plus jamais revenir. Une offre absente du
//             fichier (ou sans --tiers, profil vide) est écrite non classée.
// --seen    : document `seen/<recherche>` lu en base ({ids: [...]}), s'il existe.
//             Le script en écrit la version fusionnée dans `<out>/_seen.json`.
// --known / --dismissed : garde-fous, mêmes formats ; une offre qui s'y trouve
//             n'est jamais réécrite.
//
// Les références (`ACH-042`) ne sont attribuées qu'aux offres écrites : écarter
// une offre hors cible ne laisse pas de trou dans la numérotation.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, rmSync, statSync } from "node:fs";
import { join, basename } from "node:path";

// Un document `seen` garde au plus ce nombre d'identifiants, les plus récents.
const SEEN_CAP = 15000;

const args = parseArgs(process.argv.slice(2));
const report = JSON.parse(readFileSync(args.report, "utf8"));
const searchId = args.search || report.searchId || "default";

const blocked = loadIds(args.known);
for (const id of loadIds(args.dismissed)) blocked.add(id);
for (const id of loadIds(args.seen)) blocked.add(id);
const offers = report.offers.filter((o) => !blocked.has(o.docId));

if (args.list) {
  printList(offers);
  process.exit(0);
}

const code = (args.code || searchId.slice(0, 3)).toUpperCase();
const outDir = args.out || "db-writes";
const tiers = args.tiers && existsSync(args.tiers) ? JSON.parse(readFileSync(args.tiers, "utf8")) : {};
let nextRef = Number(args["next-ref"] || 1);

if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const fresh = [];
const hors = [];
const parTier = { cible: 0, possible: 0, hors: 0, non_classees: 0 };

for (const offer of offers) {
  const { tier, rationale } = readTier(tiers[offer.docId]);
  if (tier === "hors") {
    hors.push(offer.docId);
    parTier.hors++;
    continue;
  }
  parTier[tier || "non_classees"]++;
  const doc = {
    ...offer,
    searchId,
    tier,
    rationale,
    ref: `${code}-${String(nextRef).padStart(3, "0")}`,
  };
  delete doc.docId; // l'identifiant vit dans le doc_id, pas dans le corps
  nextRef++;
  const file = join(outDir, `${offer.docId}.json`);
  writeFileSync(file, JSON.stringify(doc, null, 1));
  fresh.push({ docId: offer.docId, ref: doc.ref, file });
}

// Lots de 50 : la limite d'un batch ArtifactData.
const writes = fresh.map((f) => ({ op: "set", collection: "offers", doc_id: f.docId, file_path: slash(f.file) }));

// L'index des offres vues : tout ce qui vient d'être écrit ou écarté, plus les
// identifiants connus par ailleurs (--known, --dismissed). Au premier passage,
// sans document `seen`, c'est ce qui l'amorce à partir de la base.
const newIds = [...fresh.map((f) => f.docId), ...hors];
const previousSeen = loadIds(args.seen);
const missingKnown = [...blocked].some((id) => !previousSeen.has(id));
if (newIds.length || missingKnown) {
  const ids = [...new Set([...blocked, ...newIds])].slice(-SEEN_CAP);
  const seenFile = join(outDir, "_seen.json");
  // `screened` : le sous-ensemble jamais écrit en base (hors cible), que
  // check-open.mjs n'a pas à vérifier.
  const previousScreened = readSeen(args.seen).screened || [];
  const screened = [...new Set([...previousScreened, ...hors])].slice(-SEEN_CAP);
  writeFileSync(seenFile, JSON.stringify({ ids, screened, updatedAt: new Date().toISOString() }));
  const entry = { op: "set", collection: "seen", doc_id: searchId, file_path: slash(seenFile) };
  if (args["seen-version"]) entry.if_version = Number(args["seen-version"]);
  writes.push(entry);
}

const batches = [];
for (let i = 0; i < writes.length; i += 50) batches.push(writes.slice(i, i + 50));

console.log(
  JSON.stringify(
    {
      searchId,
      code,
      nouvelles: offers.length,
      ecrites: fresh.length,
      hors_cible_non_ecrites: hors.length,
      par_tier: parTier,
      deja_connues: report.offers.length - offers.length,
      next_ref_apres: nextRef,
      lots: batches.length,
      refs: fresh.length ? `${fresh[0].ref} → ${fresh[fresh.length - 1].ref}` : null,
      par_source: report.report?.map((r) => ({ source: r.source, ok: r.ok, retenues: r.kept, erreur: r.error })),
    },
    null,
    2
  )
);

for (let i = 0; i < batches.length; i++) {
  console.log(`\n=== LOT ${i + 1}/${batches.length} (${batches[i].length} écritures)`);
  console.log(JSON.stringify(batches[i]));
}

// ---------------------------------------------------------------- utilitaires

/**
 * Une ligne par offre, séparée par des tabulations : juste ce qu'il faut pour
 * classer, sans ouvrir un fichier par offre.
 */
function printList(list) {
  console.log(["docId", "titre", "entreprise", "lieu", "contrats", "libellé contrat", "salaire"].join("\t"));
  for (const o of list) {
    console.log(
      [o.docId, o.title, o.company, o.location, (o.contractTypes || []).join(",") || "?", o.contract, o.salary]
        .map((v) => String(v ?? "").replace(/\s+/g, " ").trim())
        .join("\t")
    );
  }
  console.error(`${list.length} offres nouvelles à classer`);
}

function readTier(value) {
  if (!value) return { tier: null, rationale: "" };
  if (typeof value === "string") return { tier: value, rationale: "" };
  return { tier: value.tier || null, rationale: value.rationale || "" };
}

function readSeen(path) {
  if (!path || path === true || !existsSync(path)) return {};
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return raw.data || raw;
}

function slash(path) {
  return path.replace(/\\/g, "/");
}

/** Documents `{ids}` (enveloppés ou non), tableaux JSON, ou dossiers d'un fichier par doc_id. */
function loadIds(path) {
  const set = new Set();
  if (!path || path === true || !existsSync(path)) return set;
  if (statSync(path).isDirectory()) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.isDirectory()) for (const id of loadIds(join(path, entry.name))) set.add(id);
      else if (entry.name.endsWith(".json")) set.add(basename(entry.name, ".json"));
    }
    return set;
  }
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const doc = raw.data || raw;
  for (const id of Array.isArray(doc) ? doc : doc.ids || []) set.add(String(id));
  return set;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    out[key] = argv[i + 1] === undefined || argv[i + 1].startsWith("--") ? true : argv[++i];
  }
  return out;
}
