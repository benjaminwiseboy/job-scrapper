// Hellowork — la page de résultats est rendue côté serveur (Turbo/Stimulus), un
// simple GET suffit. Les champs portent des attributs `data-cy` stables, bien
// plus sûrs que les classes Tailwind qui changent au moindre restylage. Tri par
// date avec `st=date`, environ 30 cartes par page ; les dates sont relatives
// ("il y a 3 jours"), donc approximatives.
import { UA } from "../lib/browser.mjs";
import { makeOffer, cleanText, allKnown } from "../lib/normalize.mjs";
import { parseFrenchDate } from "../lib/dates.mjs";

export const id = "hellowork";
export const label = "Hellowork";
export const needsBrowser = false;

const ENDPOINT = "https://www.hellowork.com/fr-fr/emploi/recherche.html";

export async function scrape({ query, location, maxPages = 3, searchId, since, known }) {
  const offers = [];
  const seen = new Set();

  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({ k: query, l: location || "France", st: "date" });
    if (page > 1) params.set("p", String(page));

    const res = await fetch(`${ENDPOINT}?${params}`, {
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
    });
    if (!res.ok) {
      if (page === 1) throw new Error(`Hellowork HTTP ${res.status}`);
      break;
    }
    const html = await res.text();
    // Une carte = un <li> porteur de l'identifiant d'offre.
    const cards = html.split(/<li data-id-storage-target="item"/).slice(1);
    if (cards.length === 0) break;

    const before = offers.length;
    let newestOnPage = null;
    for (const card of cards) {
      const offerId = card.match(/href="\/fr-fr\/emplois\/(\d+)\.html"/)?.[1];
      if (!offerId || seen.has(offerId)) continue;
      seen.add(offerId);

      // Titre et entreprise sont dans le <h3> du lien data-cy="offerTitle".
      const heading = card.match(/data-cy="offerTitle"[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] || "";
      const [title, company] = [...heading.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => text(m[1]));
      if (!title) continue;

      const loc = text(card.match(/data-cy="localisationCard"[^>]*>([\s\S]*?)<\/div>/)?.[1]);
      const contract = text(card.match(/data-cy="contractCard"[^>]*>([\s\S]*?)<\/div>/)?.[1]);
      // Le salaire n'a pas de data-cy : c'est le seul tag en gras, absent quand non affiché.
      const salary = text(card.match(/tag-secondary-s typo-s-bold[^>]*>([\s\S]*?)<\/div>/)?.[1]);
      const rawDate = text(card.match(/text-grey-500 pl-1 pt-1">([\s\S]*?)<\/div>/)?.[1]);

      const { date, confidence } = parseFrenchDate(rawDate);
      if (date && (!newestOnPage || date > newestOnPage)) newestOnPage = date;
      offers.push(
        makeOffer({
          source: id,
          externalId: offerId,
          title,
          company,
          location: loc,
          contract,
          salary,
          url: `https://www.hellowork.com/fr-fr/emplois/${offerId}.html`,
          postedAt: date,
          dateConfidence: confidence,
          searchId,
        })
      );
    }
    if (offers.length === before) break;
    // Tri par date décroissante : si la plus récente de la page est déjà hors
    // fenêtre, les pages suivantes le seront aussi.
    if (since && newestOnPage && newestOnPage < since) break;
    if (allKnown(offers.slice(before), known)) break;
  }
  return offers;
}

// A withdrawn posting answers 410 Gone (404 for an unknown id); a live one 200.
// HEAD is not enough: some proxies answer it differently, so GET without reading.
export async function checkOpen(offer) {
  const res = await fetch(`https://www.hellowork.com/fr-fr/emplois/${offer.externalId}.html`, {
    headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
    redirect: "manual",
  });
  res.body?.cancel();
  if (res.status === 410 || res.status === 404) return { state: "closed", reason: "offre retirée" };
  if (res.status === 200) return { state: "open" };
  return { state: "unknown", status: res.status };
}

function text(value) {
  return cleanText(
    String(value || "")
      .replace(/<[^>]*>/g, "")
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
      .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;|&#x27;/g, "'")
  );
}
