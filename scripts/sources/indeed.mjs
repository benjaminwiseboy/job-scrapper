// Indeed — Cloudflare rejette les requêtes HTTP nues, mais laisse passer une
// vraie empreinte navigateur. Tri par date pour que la pagination puisse
// s'arrêter dès qu'on sort de la fenêtre.
import { newPage, waitForResults } from "../lib/browser.mjs";
import { makeOffer, guessContract, allKnown } from "../lib/normalize.mjs";
import { parseFrenchDate } from "../lib/dates.mjs";

export const id = "indeed";
export const label = "Indeed";
export const needsBrowser = true;

// Cloudflare lets a fresh browser through but challenges its second
// navigation ("Security Check"): every results page gets its own context.
export const freshPages = true;

export async function scrape({ browser, query, location, maxPages = 3, searchId, known }) {
  const offers = [];
  const seen = new Set();

  for (let p = 0; p < maxPages; p++) {
    const page = await newPage(browser);
    try {
      const url = `https://fr.indeed.com/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}&sort=date&start=${p * 10}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      if (!(await waitForResults(page, "[data-jk]", 5000))) {
        if (p === 0 && /security check|un instant/i.test(await page.title())) {
          throw new Error("contrôle anti-robot Cloudflare");
        }
        break;
      }

      const cards = await page.$$eval("[data-jk]", (els) =>
        els.map((el) => {
          const jk = el.getAttribute("data-jk");
          const root = el.closest("li") || el;
          return {
            jk,
            // [data-jk] porte le lien du titre : son propre texte EST l'intitulé.
            // (Indeed a déplacé le titre de h2 vers h3.jobTitle, d'où le repli.)
            title: (el.innerText || "").trim() || root.querySelector('[class*="jobTitle"]')?.textContent?.trim() || "",
            company: root.querySelector('[data-testid="company-name"]')?.textContent?.trim() || "",
            location: root.querySelector('[data-testid="text-location"]')?.textContent?.trim() || "",
            salary: root.querySelector('[data-testid*="salary-snippet"]')?.textContent?.trim() || "",
            text: (root.innerText || "").slice(0, 400),
          };
        })
      );

      const before = offers.length;
      for (const c of cards) {
        if (!c.jk || !c.title || seen.has(c.jk)) continue;
        seen.add(c.jk);
        // Indeed ne publie plus de date dans ses cartes de résultats : la
        // confiance retombe à "unknown" et la fenêtre laisse passer (c'est le
        // dédoublonnage en base qui assure la nouveauté).
        const { date, confidence } = parseFrenchDate(c.text);
        offers.push(
          makeOffer({
            source: id,
            externalId: c.jk,
            title: c.title,
            company: c.company,
            location: c.location,
            contract: guessContract(c.title, c.text),
            salary: c.salary,
            url: `https://fr.indeed.com/viewjob?jk=${c.jk}`,
            postedAt: date,
            dateConfidence: confidence,
            searchId,
          })
        );
      }
      if (offers.length === before) break; // plus rien de neuf : fin de pagination
      // Sans date sur les cartes, c'est le seul signal d'arrêt : trié par date,
      // une page entièrement déjà connue veut dire que la suite l'est aussi.
      if (allKnown(offers.slice(before), known)) break;
    } finally {
      await page.close();
    }
  }
  return offers;
}
