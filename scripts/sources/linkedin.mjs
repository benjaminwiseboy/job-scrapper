// LinkedIn — la page de recherche "invité" est rendue côté serveur pour le SEO,
// donc un simple GET suffit : pas de navigateur, pas de compte. L'endpoint
// `seeMoreJobPostings` est celui qu'appelle le bouton "voir plus" et renvoie
// des cartes propres, 25 par page.
import { UA } from "../lib/browser.mjs";
import { makeOffer, cleanText } from "../lib/normalize.mjs";
import { parseFrenchDate } from "../lib/dates.mjs";

export const id = "linkedin";
export const label = "LinkedIn";
export const needsBrowser = false;

const ENDPOINT = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";

// L'endpoint renvoie 10 cartes par appel et ignore `sortBy=DD` : les dates
// reviennent dans un ordre arbitraire. On s'appuie donc sur le filtre de
// récence côté serveur (`f_TPR=r<secondes>`), beaucoup plus fiable que trier
// nous-mêmes des pages non ordonnées.
const PAGE_SIZE = 10;

export async function scrape({ query, location, maxPages = 3, searchId, since }) {
  const offers = [];
  const seen = new Set();

  const recency = since ? Math.max(3600, Math.ceil((Date.now() - new Date(since).getTime()) / 1000)) : null;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      keywords: query,
      location,
      start: String(page * PAGE_SIZE),
      sortBy: "DD",
    });
    if (recency) params.set("f_TPR", `r${recency}`);

    const res = await fetch(`${ENDPOINT}?${params}`, {
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
    });
    if (!res.ok) {
      if (page === 0) throw new Error(`LinkedIn HTTP ${res.status}`);
      break;
    }
    const html = await res.text();
    const cards = html.split(/<li[\s>]/).slice(1);
    if (cards.length === 0) break;

    const before = offers.length;
    for (const card of cards) {
      const idMatch = card.match(/data-entity-urn="urn:li:jobPosting:(\d+)"/) || card.match(/\/jobs\/view\/[^"?]*?-(\d+)\?/);
      if (!idMatch || seen.has(idMatch[1])) continue;
      seen.add(idMatch[1]);

      const title = card.match(/base-search-card__title"[^>]*>\s*([\s\S]*?)<\//)?.[1];
      if (!title) continue;
      const company = card.match(/base-search-card__subtitle"[^>]*>\s*(?:<a[^>]*>)?\s*([\s\S]*?)\s*<\//)?.[1];
      const loc = card.match(/job-search-card__location"[^>]*>\s*([\s\S]*?)\s*<\//)?.[1];
      const datetime = card.match(/datetime="([^"]+)"/)?.[1];

      const { date, confidence } = parseFrenchDate(datetime);
      offers.push(
        makeOffer({
          source: id,
          externalId: idMatch[1],
          title: stripTags(title),
          company: stripTags(company),
          location: stripTags(loc),
          salary: "",
          url: `https://www.linkedin.com/jobs/view/${idMatch[1]}`,
          postedAt: date,
          dateConfidence: confidence,
          searchId,
        })
      );
    }
    if (offers.length === before) break; // plus rien de neuf : fin de pagination
  }
  return offers;
}

function stripTags(value) {
  return cleanText(String(value || "").replace(/<[^>]*>/g, ""));
}
