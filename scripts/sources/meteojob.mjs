// Météojob — application Angular, donc navigateur obligatoire. Les champs
// portent des id préfixés par l'id de l'offre (`57045156-company-name`), ce qui
// donne une extraction stable. Les dates sont relatives ("Il y a 3 jours").
import { newPage, waitForResults } from "../lib/browser.mjs";
import { makeOffer, allKnown } from "../lib/normalize.mjs";
import { parseFrenchDate } from "../lib/dates.mjs";

export const id = "meteojob";
export const label = "Météojob";
export const needsBrowser = true;

const CARD = "div.cc-job-offer-main-content";

export async function scrape({ browser, page: lanePage, query, location, maxPages = 3, searchId, since, known }) {
  const page = lanePage || (await newPage(browser));
  const offers = [];
  const seen = new Set();

  try {
    for (let p = 1; p <= maxPages; p++) {
      const url = `https://www.meteojob.com/jobs?what=${encodeURIComponent(query)}&where=${encodeURIComponent(location)}&sort=date&page=${p}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      if (!(await waitForResults(page, CARD))) break;

      const cards = await page.$$eval(CARD, (nodes) =>
        nodes.map((card) => {
          const href = card.querySelector('a[href^="/jobs/"]')?.getAttribute("href") || "";
          const offerId = href.match(/\/jobs\/(\d+)/)?.[1] || "";
          // Les <mat-icon> injectent leur nom ("place", "sunny") dans le texte.
          const clean = (el) => {
            if (!el) return "";
            const clone = el.cloneNode(true);
            clone.querySelectorAll("mat-icon").forEach((n) => n.remove());
            return clone.textContent.replace(/\s+/g, " ").trim();
          };
          const byId = (suffix) => clean(card.querySelector(`[id="${offerId}-${suffix}"]`));
          return {
            offerId,
            title: clean(card.querySelector("h2 a")),
            company: byId("company-name"),
            location: byId("job-locations"),
            contract: byId("contract-types"),
            salary: byId("salary"),
            text: clean(card),
          };
        })
      );

      const before = offers.length;
      let newestOnPage = null;
      for (const c of cards) {
        if (!c.offerId || !c.title || seen.has(c.offerId)) continue;
        seen.add(c.offerId);
        const rawDate = c.text.match(/il y a [^|]{1,20}?(?:jours?|heures?|semaines?|mois|minutes?)|hier|aujourd'hui/i)?.[0];
        const { date, confidence } = parseFrenchDate(rawDate);
        if (date && (!newestOnPage || date > newestOnPage)) newestOnPage = date;
        offers.push(
          makeOffer({
            source: id,
            externalId: c.offerId,
            title: c.title,
            company: c.company,
            location: c.location,
            contract: c.contract,
            salary: /non précisé/i.test(c.salary) ? "" : c.salary,
            url: `https://www.meteojob.com/jobs/${c.offerId}`,
            postedAt: date,
            dateConfidence: confidence,
            searchId,
          })
        );
      }
      if (offers.length === before) break;
      // Tri par date décroissante : page entièrement hors fenêtre -> on arrête.
      if (since && newestOnPage && newestOnPage < since) break;
      if (allKnown(offers.slice(before), known)) break;
    }
  } finally {
    if (!lanePage) await page.close();
  }
  return offers;
}
