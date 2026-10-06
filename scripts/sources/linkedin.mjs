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

    const res = await getWithRetry(`${ENDPOINT}?${params}`);
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

// Search cards carry no contract. When the run filters on contracts, the
// orchestrator asks for the posting's own text: LinkedIn's employment type
// ("Stage") plus the description, where "CDI" or "alternance" is usually
// written out. Returns "" on failure — the offer then stays "unknown".
export async function contractText(offer) {
  const res = await getWithRetry(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${offer.externalId}`);
  if (!res.ok) return "";
  const html = await res.text();
  const criteria = [...html.matchAll(/description__job-criteria-subheader[^>]*>\s*([\s\S]*?)\s*<\/h3>\s*<span[^>]*>\s*([\s\S]*?)\s*<\/span>/g)];
  const employment = criteria.find((m) => /type d.emploi|employment type/i.test(m[1]))?.[2] || "";
  const description = html.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/)?.[1] || "";
  return cleanText(`${stripTags(employment)} ${stripTags(description.replace(/<br\s*\/?>|<\/(p|li)>/gi, " "))}`);
}

// Is the posting still taking applications? A closed one keeps its page but
// shows "Les candidatures ne sont plus acceptées" (class closed-job__flavor--closed);
// a deleted one answers 404. Anything else (429, 999, network) is "unknown":
// never close an offer on a guess.
export async function checkOpen(offer) {
  const res = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${offer.externalId}`, {
    headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
  });
  if (res.status === 404 || res.status === 410) return { state: "closed", reason: "offre retirée" };
  if (!res.ok) return { state: "unknown", status: res.status };
  const html = await res.text();
  if (/closed-job__flavor--closed/.test(html)) return { state: "closed", reason: "candidatures closes" };
  return /top-card-layout__title|topcard__title/.test(html) ? { state: "open" } : { state: "unknown", status: res.status };
}

// LinkedIn answers 429 as soon as requests come a little too close together.
// Backing off and retrying twice is enough to get through a burst.
async function getWithRetry(url, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" } });
    if (res.status !== 429 || attempt >= retries) return res;
    res.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 2500 * (attempt + 1)));
  }
}

function stripTags(value) {
  return cleanText(String(value || "").replace(/<[^>]*>/g, ""));
}
