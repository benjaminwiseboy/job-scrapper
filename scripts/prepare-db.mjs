// Transforme un rapport de scraping en écritures prêtes pour l'artefact.
//
// Les scripts ne peuvent pas appeler l'outil ArtifactData (c'est un outil de
// Claude), et recopier 100 offres en JSON dans un appel coûterait cher. Ce
// script écrit donc un fichier par offre et imprime les lots à passer tels
// quels dans `writes`, chaque entrée pointant vers son fichier.
//
//   node scripts/prepare-db.mjs --report run.json --search achats --code ACH \
//     --next-ref 1 --known known/ --out docs/
//
// --known : dossier contenant un fichier par docId déjà en base (tel que
//           produit par une lecture `query ... out_dir`), ou fichier JSON
//           listant les docId. Sert à ne réécrire que les nouveautés.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, basename } from "node:path";

const args = parseArgs(process.argv.slice(2));
const report = JSON.parse(readFileSync(args.report, "utf8"));
const searchId = args.search || report.searchId || "default";
const code = (args.code || searchId.slice(0, 3)).toUpperCase();
const outDir = args.out || "db-writes";

const known = loadKnown(args.known);
let nextRef = Number(args["next-ref"] || 1);

if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const fresh = [];
const skipped = [];

for (const offer of report.offers) {
  if (known.has(offer.docId)) {
    skipped.push(offer.docId);
    continue;
  }
  const doc = {
    ...offer,
    searchId,
    ref: `${code}-${String(nextRef).padStart(3, "0")}`,
  };
  delete doc.docId; // l'identifiant vit dans le doc_id, pas dans le corps
  nextRef++;
  const file = join(outDir, `${offer.docId}.json`);
  writeFileSync(file, JSON.stringify(doc, null, 1));
  fresh.push({ docId: offer.docId, ref: doc.ref, file });
}

// Lots de 50 : la limite d'un batch ArtifactData.
const batches = [];
for (let i = 0; i < fresh.length; i += 50) {
  batches.push(
    fresh.slice(i, i + 50).map((f) => ({
      op: "set",
      collection: "offers",
      doc_id: f.docId,
      file_path: f.file.replace(/\\/g, "/"),
    }))
  );
}

console.log(
  JSON.stringify(
    {
      searchId,
      code,
      nouvelles: fresh.length,
      deja_connues: skipped.length,
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

function loadKnown(path) {
  const set = new Set();
  if (!path || !existsSync(path)) return set;
  try {
    const stat = readdirSync(path, { withFileTypes: true });
    for (const entry of stat) {
      if (entry.isFile() && entry.name.endsWith(".json")) set.add(basename(entry.name, ".json"));
      else if (entry.isDirectory()) {
        for (const sub of readdirSync(join(path, entry.name))) {
          if (sub.endsWith(".json")) set.add(basename(sub, ".json"));
        }
      }
    }
  } catch {
    // pas un dossier : on tente un JSON listant les identifiants
    for (const id of JSON.parse(readFileSync(path, "utf8"))) set.add(String(id));
  }
  return set;
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
