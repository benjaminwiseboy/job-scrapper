// Prints each CV's HTML page to an A4 PDF next to it, then reports the
// absolute paths as JSON on stdout. Writes nothing to the database.
//   node scripts/cv-pdf.mjs cv/ACH-042-acme.html [more.html ...]
import { resolve } from "node:path";
import { existsSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { launchBrowser } from "./lib/browser.mjs";

const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error("usage: node scripts/cv-pdf.mjs <cv.html> [...]");
  process.exit(1);
}

const browser = await launchBrowser();
const results = [];
try {
  const page = await browser.newPage();
  for (const input of inputs) {
    const html = resolve(input);
    if (!existsSync(html)) {
      results.push({ html, ok: false, error: "file not found" });
      continue;
    }
    const pdf = html.replace(/\.html?$/i, "") + ".pdf";
    await page.goto(pathToFileURL(html).href, { waitUntil: "load" });
    // The CV sets its own @page margins; without preferCSSPageSize they are ignored.
    await page.pdf({ path: pdf, format: "A4", printBackground: true, preferCSSPageSize: true });
    results.push({ html, pdf, ok: true, bytes: statSync(pdf).size });
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(results, null, 2));
process.exit(results.every((r) => r.ok) ? 0 : 1);
