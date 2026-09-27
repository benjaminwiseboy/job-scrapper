// Mesure ce que demande un corpus d'annonces : structure du marché (contrats,
// lieux, salaires) et termes récurrents dans le corps des annonces.
//
//   node scripts/analyse-corpus.mjs --offers .veille-tmp/state/offers \
//     --details details --tiers cible,possible --out .veille-tmp/corpus.json
//
// Le script produit les chiffres ; l'interprétation (quelles compétences
// développer, lesquelles mettre en avant) reste à Claude, qui lit en plus un
// échantillon d'annonces entières — `echantillon` désigne lesquelles.

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const args = parseArgs(process.argv.slice(2));
const tiers = String(args.tiers || "cible,possible").split(",").map((t) => t.trim());
const detailsDir = args.details || "details";

const offers = loadDir(args.offers).filter((o) => (!args.search || o.searchId === args.search) && tiers.includes(o.tier));
const details = new Map();
if (existsSync(detailsDir)) {
  for (const f of readdirSync(detailsDir)) {
    if (!f.endsWith(".json")) continue;
    const d = JSON.parse(readFileSync(join(detailsDir, f), "utf8"));
    if (d.ok && d.text) details.set(d.docId, d);
  }
}

const withText = offers.filter((o) => details.has(o.docId));

// ------------------------------------------------------- structure du marché

const contrats = tally(offers.map((o) => o.contract || "(non précisé)"));
const villes = tally(offers.map((o) => cityOf(o.location)));
const entreprises = tally(offers.map((o) => o.company));
const teletravail = offers.filter((o) => /t[ée]l[ée]travail|remote|hybride/i.test(`${o.location} ${o.title}`)).length;
const salaires = salaryStats(offers.map((o) => o.salary));

// Critères structurés de LinkedIn (niveau hiérarchique, fonction, secteur)
const criteres = {};
for (const d of details.values()) {
  for (const [k, v] of Object.entries(d.criteria || {})) {
    criteres[k] = criteres[k] || {};
    criteres[k][v] = (criteres[k][v] || 0) + 1;
  }
}

// ----------------------------------------------------- termes des annonces

const docsTokens = withText.map((o) => tokenize(details.get(o.docId).text));
const unigrammes = docFrequency(docsTokens.map((t) => new Set(t)));
const bigrammes = docFrequency(docsTokens.map((t) => new Set(bigrams(t))));

const n = withText.length || 1;
const asList = (map, min) =>
  [...map.entries()]
    .filter(([, c]) => c >= min)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 70)
    .map(([terme, docs]) => ({ terme, offres: docs, pct: Math.round((docs / n) * 100) }));

// Échantillon à lire : les annonces les plus étoffées, réparties par source.
const parSource = {};
const echantillon = [];
for (const o of [...withText].sort((a, b) => details.get(b.docId).text.length - details.get(a.docId).text.length)) {
  parSource[o.source] = (parSource[o.source] || 0) + 1;
  if (parSource[o.source] <= 5 && echantillon.length < 15) echantillon.push({ docId: o.docId, ref: o.ref, titre: o.title });
}

const result = {
  recherche: args.search || "(toutes)",
  niveaux: tiers,
  corpus: { offres: offers.length, avec_description: withText.length, sans_description: offers.length - withText.length },
  structure: {
    contrats,
    villes_frequentes: top(villes, 12),
    entreprises_recurrentes: top(entreprises, 10),
    offres_avec_teletravail: teletravail,
    salaires,
    criteres_linkedin: criteres,
  },
  termes: asList(unigrammes, Math.max(3, Math.ceil(n * 0.08))),
  expressions: asList(bigrammes, Math.max(3, Math.ceil(n * 0.06))),
  echantillon,
};

const json = JSON.stringify(result, null, 1);
if (args.out) {
  writeFileSync(args.out, json);
  console.error(`Analyse écrite dans ${args.out}`);
} else {
  console.log(json);
}
console.error(
  `${offers.length} offres (${tiers.join("+")}), ${withText.length} avec description, ${result.termes.length} termes retenus`
);

// ---------------------------------------------------------------- mécanique

// Mots vides français + vocabulaire d'annonce sans valeur discriminante.
const STOP = new Set(
  `le la les un une des du de au aux et ou ni mais donc or car que qui quoi dont ou ce cet cette ces celui celle
   je tu il elle on nous vous ils elles me te se lui leur y en
   mon ma mes ton ta tes son sa ses notre nos votre vos leurs
   a as ai ont avez avons avoir eu est es sont etes etre ete suis sera seront serez etait etaient
   pour par avec sans sous sur dans entre vers chez depuis pendant afin ainsi aussi tout tous toute toutes
   plus moins tres bien deja encore alors comme si non oui ne pas peu
   vos etc cdi cdd h f hf poste offre emploi entreprise societe groupe equipe service mission missions profil
   recherche recherchons rejoindre candidature candidat candidats client clients site sites France
   ans an mois jours jour semaine annee annuel brut euros salaire remuneration contrat travail temps plein
   nouveau nouvelle grand grande petit fort forte bon bonne meilleur
   vous etes votre poste sein cadre place lieu type date reference`
    .split(/\s+/)
    .filter(Boolean)
);

function tokenize(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((w) => w.replace(/^[.+]+|[.+]+$/g, ""))
    .filter((w) => w.length >= 3 && w.length <= 22 && !STOP.has(w) && !/^\d+$/.test(w));
}

function bigrams(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length - 1; i++) out.push(`${tokens[i]} ${tokens[i + 1]}`);
  return out;
}

/** Fréquence documentaire : dans combien d'annonces le terme apparaît. */
function docFrequency(sets) {
  const counts = new Map();
  for (const set of sets) for (const t of set) counts.set(t, (counts.get(t) || 0) + 1);
  return counts;
}

function tally(values) {
  const out = {};
  for (const v of values) if (v) out[v] = (out[v] || 0) + 1;
  return out;
}

function top(obj, n) {
  return Object.fromEntries(Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n));
}

function cityOf(location) {
  return String(location || "")
    .replace(/\(\s*\d+\s*\)|\b\d{5}\b|-\s*\d{1,3}\b/g, "")
    .replace(/t[ée]l[ée]travail partiel [àa]\s*/i, "")
    .split(/[,•]/)[0]
    .trim();
}

/** Fourchettes annuelles, en euros, déduites des libellés de salaire. */
function salaryStats(labels) {
  const values = [];
  for (const raw of labels) {
    if (!raw) continue;
    const s = String(raw).replace(/ |\s/g, " ").toLowerCase();
    const nums = [...s.matchAll(/(\d[\d ]*[\d])\s*(k€|k\b)?/g)]
      .map((m) => Number(m[1].replace(/ /g, "")) * (m[2] ? 1000 : 1))
      .filter((v) => v > 0);
    if (!nums.length) continue;
    let annual = nums.filter((v) => v >= 14000 && v <= 200000);
    if (!annual.length && /heure/.test(s)) annual = nums.filter((v) => v >= 10 && v <= 80).map((v) => Math.round(v * 1607));
    if (!annual.length && /mois/.test(s)) annual = nums.filter((v) => v >= 900 && v <= 12000).map((v) => v * 12);
    if (annual.length) values.push(Math.round(annual.reduce((a, b) => a + b, 0) / annual.length));
  }
  if (!values.length) return { renseignes: 0 };
  values.sort((a, b) => a - b);
  const q = (p) => values[Math.min(values.length - 1, Math.floor(values.length * p))];
  return { renseignes: values.length, sur: labels.length, p25: q(0.25), median: q(0.5), p75: q(0.75), min: values[0], max: values[values.length - 1] };
}

function loadDir(path) {
  if (!path) throw new Error("--offers est requis");
  return readdirSync(path)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const j = JSON.parse(readFileSync(join(path, f), "utf8"));
      const d = j.data || j;
      return { ...d, docId: j.id || d.docId || f.replace(/\.json$/, "") };
    });
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    out[argv[i].slice(2)] = argv[i + 1]?.startsWith("--") ? true : argv[++i];
  }
  return out;
}
