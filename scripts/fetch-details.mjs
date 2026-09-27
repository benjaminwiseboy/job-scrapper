// Récupère le texte complet des annonces, mis en cache par offre.
//
// La base ne stocke que les en-têtes ; l'analyse du marché a besoin du corps
// des annonces. Chaque offre n'est récupérée qu'une fois : le cache est le
// dossier de sortie, un fichier par offre.
//
//   node scripts/fetch-details.mjs --offers <dossier|fichier.json> --out details
//
// `--offers` accepte le dossier produit par une lecture `ArtifactData query
// ... out_dir` (un fichier par document), ou un tableau JSON d'offres.
//
// APEC : les pages de détail sont derrière un CAPTCHA DataDome. Elles ne sont
// pas récupérées, et c'est noté comme tel — on ne contourne pas.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { launchBrowser, newPage, dismissCookies, UA } from "./lib/browser.mjs";

const args = parseArgs(process.argv.slice(2));
const outDir = args.out || "details";
const limit = Number(args.limit || 0);
const offers = loadOffers(args.offers);

mkdirSync(outDir, { recursive: true });

const todo = offers.filter((o) => !existsSync(join(outDir, `${o.docId}.json`)));
const queue = limit ? todo.slice(0, limit) : todo;

const needsBrowser = queue.some((o) => o.source === "indeed" || o.source === "meteojob");
const browser = needsBrowser ? await launchBrowser() : null;

const stats = { deja_en_cache: offers.length - todo.length, recuperees: 0, vides: 0, echecs: 0, ignorees: 0 };

try {
  for (const offer of queue) {
    let record = { docId: offer.docId, source: offer.source, url: offer.url, fetchedAt: new Date().toISOString() };
    try {
      if (offer.source === "apec") {
        record = { ...record, ok: false, skipped: true, reason: "pages de détail protégées par CAPTCHA DataDome", text: "" };
        stats.ignorees++;
      } else {
        const { text, criteria } = await fetchOne(offer, browser);
        const clean = tidy(text);
        record = { ...record, ok: clean.length > 200, text: clean, criteria: criteria || {} };
        if (record.ok) stats.recuperees++;
        else stats.vides++;
      }
    } catch (err) {
      record = { ...record, ok: false, text: "", error: String(err.message || err) };
      stats.echecs++;
    }
    writeFileSync(join(outDir, `${offer.docId}.json`), JSON.stringify(record, null, 1));
    process.stderr.write(`${record.ok ? "ok  " : record.skipped ? "skip" : "--  "} ${offer.docId} ${record.text?.length || 0}\n`);
  }
} finally {
  if (browser) await browser.close();
}

console.log(JSON.stringify({ ...stats, total_en_cache: readdirSync(outDir).length, dossier: outDir }, null, 2));

// ------------------------------------------------------------------ sources

async function fetchOne(offer, browser) {
  if (offer.source === "linkedin") return fetchLinkedin(offer);
  if (offer.source === "meteojob") return fetchMeteojob(offer, browser);
  if (offer.source === "indeed") return fetchIndeed(offer, browser);
  throw new Error(`source inconnue: ${offer.source}`);
}

// Rendu serveur : un simple GET suffit, et la page expose en prime des
// critères structurés (niveau hiérarchique, fonction, secteur).
async function fetchLinkedin(offer) {
  const res = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${offer.externalId}`, {
    headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const markup = html.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/)?.[1] || "";
  const criteria = {};
  for (const m of html.matchAll(
    /description__job-criteria-subheader[^>]*>\s*([^<]+)[\s\S]*?description__job-criteria-text[^>]*>\s*([^<]+)/g
  )) {
    criteria[m[1].trim()] = m[2].trim();
  }
  return { text: stripTags(markup), criteria };
}

async function fetchMeteojob(offer, browser) {
  const page = await newPage(browser);
  try {
    await page.goto(offer.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);
    await dismissCookies(page);
    await page.waitForTimeout(1200);
    const text = await page.evaluate(() => document.querySelector("main")?.innerText || "");
    return { text: sliceFrom(text, /critères de l'offre|description du poste/i) };
  } finally {
    await page.close();
  }
}

// L'URL /viewjob directe renvoie une erreur ; le volet de détail de la page de
// résultats, lui, rend l'annonce entière.
async function fetchIndeed(offer, browser) {
  const page = await newPage(browser);
  try {
    const q = encodeURIComponent(offer.query || offer.title || "emploi");
    await page.goto(`https://fr.indeed.com/jobs?q=${q}&l=France&vjk=${offer.externalId}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
    await dismissCookies(page);
    await page.waitForTimeout(1500);
    const text = await page.evaluate(
      () =>
        document.querySelector("#jobDescriptionText")?.innerText ||
        document.querySelector(".jobsearch-RightPane")?.innerText ||
        ""
    );
    return { text: sliceFrom(text, /détails de l'emploi|description du poste|description du job/i) };
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------- utilitaires

function stripTags(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div|h\d)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Coupe l'en-tête de page pour ne garder que l'annonce à partir d'un repère. */
function sliceFrom(text, marker) {
  const s = String(text || "");
  const i = s.search(marker);
  return i > 0 ? s.slice(i) : s;
}

function tidy(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 12000);
}

function loadOffers(path) {
  if (!path) throw new Error("--offers est requis");
  const raw = [];
  if (statSync(path).isDirectory()) {
    for (const f of readdirSync(path)) {
      if (f.endsWith(".json")) raw.push(JSON.parse(readFileSync(join(path, f), "utf8")));
    }
  } else {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    raw.push(...(Array.isArray(parsed) ? parsed : parsed.offers || []));
  }
  // Les lectures ArtifactData enveloppent le document dans {id, data, version}.
  return raw
    .map((r) => {
      const d = r.data || r;
      const docId = r.id || r.docId || (d.source && d.externalId ? `${d.source}_${d.externalId}` : null);
      return docId && d.url ? { docId, source: d.source, externalId: d.externalId, url: d.url, query: d.query, title: d.title } : null;
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
