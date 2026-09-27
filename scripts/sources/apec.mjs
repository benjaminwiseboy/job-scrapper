// APEC — Angular également. La carte est imbriquée DANS l'ancre du lien, donc on
// part de l'ancre et on descend : remonter avec closest() attrape un conteneur
// global qui englobe tous les résultats. Les métadonnées sont dans des <li>
// identifiés par l'attribut alt de leur icône, et la date est exacte.
import { newPage, dismissCookies } from "../lib/browser.mjs";
import { makeOffer } from "../lib/normalize.mjs";
import { parseFrenchDate } from "../lib/dates.mjs";

export const id = "apec";
export const label = "APEC";
export const needsBrowser = true;

export async function scrape({ browser, query, location, maxPages = 3, searchId, since }) {
  const page = await newPage(browser);
  const offers = [];
  const seen = new Set();

  try {
    for (let p = 0; p < maxPages; p++) {
      const params = new URLSearchParams({ motsCles: query, sortsType: "DATE", page: String(p) });
      if (location && !/^france$/i.test(location)) params.set("lieux", location);
      await page.goto(`https://www.apec.fr/candidat/recherche-emploi.html/emploi?${params}`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(2000);
      if (p === 0) await dismissCookies(page);
      await page.waitForTimeout(1500);

      const cards = await page.$$eval('a[href*="/detail-offre/"]', (anchors) =>
        anchors.map((a) => {
          const card = a.querySelector(".card-offer");
          const meta = {};
          for (const li of card?.querySelectorAll("ul.details-offer li") || []) {
            const alt = (li.querySelector("img")?.getAttribute("alt") || "").toLowerCase();
            meta[alt] = li.textContent.replace(/\s+/g, " ").trim();
          }
          return {
            offerId: a.getAttribute("href")?.match(/detail-offre\/(\w+)/)?.[1] || "",
            title: card?.querySelector(".card-title")?.textContent?.replace(/\s+/g, " ").trim() || "",
            company: card?.querySelector(".card-offer__company")?.textContent?.replace(/\s+/g, " ").trim() || "",
            location: meta["localisation"] || "",
            contract: meta["type de contrat"] || "",
            salary: meta["salaire texte"] || "",
            date: meta["date de publication"] || "",
          };
        })
      );

      const before = offers.length;
      let newestOnPage = null;
      for (const c of cards) {
        if (!c.offerId || !c.title || seen.has(c.offerId)) continue;
        seen.add(c.offerId);
        const { date, confidence } = parseFrenchDate(c.date);
        if (date && (!newestOnPage || date > newestOnPage)) newestOnPage = date;
        offers.push(
          makeOffer({
            source: id,
            externalId: c.offerId,
            title: c.title,
            company: c.company,
            location: c.location,
            contract: c.contract,
            salary: c.salary,
            url: `https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/${c.offerId}`,
            postedAt: date,
            dateConfidence: confidence,
            searchId,
          })
        );
      }
      if (offers.length === before) break;
      // Résultats triés par date décroissante : si même la plus récente de la
      // page est hors fenêtre, les suivantes le seront aussi.
      if (since && newestOnPage && newestOnPage < since) break;
    }
  } finally {
    await page.close();
  }
  return offers;
}
