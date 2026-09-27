// Scrape Indeed France search results via a headless browser (plain HTTP is
// blocked by Cloudflare, but a real browser passes). Prints JSON array to stdout.
//
// Usage: node scripts/scrape-indeed.mjs "<query>" "<location>"
import { chromium } from "playwright";
import { existsSync } from "node:fs";

const query = process.argv[2] || "acheteur junior";
const location = process.argv[3] || "France";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

// Certains environnements cloud exposent un Chromium pré-installé à un chemin
// fixe, avec une révision différente de celle attendue par le paquet playwright
// installé -> on pointe dessus s'il existe plutôt que de retélécharger.
const launchOptions = {};
const preinstalledChromium = "/opt/pw-browsers/chromium";
if (existsSync(preinstalledChromium)) launchOptions.executablePath = preinstalledChromium;

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ userAgent: UA });

const url = `https://fr.indeed.com/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}&sort=date`;
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2000);

const jobs = await page.$$eval("[data-jk]", (els) => {
  const seen = new Set();
  const out = [];
  for (const el of els) {
    const jk = el.getAttribute("data-jk");
    if (!jk || seen.has(jk)) continue;
    const root = el.closest("li") || el;
    const title = root.querySelector("h2")?.textContent?.trim();
    if (!title) continue; // skip decoy/empty elements
    seen.add(jk);
    const company = root.querySelector('[data-testid="company-name"]')?.textContent?.trim() || "";
    const location = root.querySelector('[data-testid="text-location"]')?.textContent?.trim() || "";
    const salary = root.querySelector('[data-testid="attribute_snippet_testid"]')?.textContent?.trim() || "";
    out.push({ jk, title, company, location, salary });
  }
  return out;
});

await browser.close();

const now = new Date().toISOString();
const results = jobs.map((j) => ({
  title: j.title,
  company: j.company,
  location: j.location,
  contract: "",
  salary: j.salary,
  source: "indeed",
  url: `https://fr.indeed.com/viewjob?jk=${j.jk}`,
  docId: `indeed_${j.jk}`,
  query,
  status: "new",
  scrapedAt: now,
}));

console.log(JSON.stringify(results, null, 2));
console.error(`${results.length} offres extraites pour "${query}" / "${location}"`);
