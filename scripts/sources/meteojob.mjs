// Météojob — application Angular, donc navigateur obligatoire. Les champs
// portent des id préfixés par l'id de l'offre (`57045156-company-name`), ce qui
// donne une extraction stable. Les dates sont relatives ("Il y a 3 jours").
import { newPage, dismissCookies } from "../lib/browser.mjs";
import { makeOffer } from "../lib/normalize.mjs";
import { parseFrenchDate } from "../lib/dates.mjs";

export const id = "meteojob";
export const label = "Météojob";
export const needsBrowser = true;

export async function scrape({ browser, query, location, maxPages = 3, searchId, since }) {
  const page = await newPage(browser);
  const offers = [];
  const seen = new Set();

  try {
    for (let p = 1; p <= maxPages; p++) {
      const url = `https://www.meteojob.com/jobs?what=${encodeURIComponent(query)}&where=${encodeURIComponent(location)}&sort=date&page=${p}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1800);
      if (p === 1) await dismissCookies(page);
      await page.waitForTimeout(1200);

      const cards = await page.$$eval("div.cc-job-offer-main-content", (nodes) =>
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
    }
  } finally {
    await page.close();
  }
  return offers;
}
