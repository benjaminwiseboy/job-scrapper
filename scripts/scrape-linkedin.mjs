// Scrape LinkedIn's public "guest" job search page — it's server-rendered
// for SEO, so a plain HTTPS GET (no browser) returns full listings.
// No login, no JS execution needed.
//
// Usage: node scripts/scrape-linkedin.mjs "<query>" "<location>"
const query = process.argv[2] || "acheteur junior";
const location = process.argv[3] || "France";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

const url = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}`;

const res = await fetch(url, { headers: { "User-Agent": UA } });
if (!res.ok) {
  console.error(`HTTP ${res.status} en récupérant ${url}`);
  process.exit(1);
}
const html = await res.text();

const titles = [...html.matchAll(/base-search-card__title">\s*([^<]+?)\s*<\/h3>/gs)].map((m) => m[1].trim());
const companies = [...html.matchAll(/base-search-card__subtitle">\s*<a[^>]*>\s*([^<]+?)\s*<\/a>/gs)].map((m) =>
  m[1].trim()
);
const locations = [...html.matchAll(/job-search-card__location">\s*([^<]+?)\s*<\/span>/gs)].map((m) => m[1].trim());
const dates = [...html.matchAll(/datetime="([^"]+)"/g)].map((m) => m[1]);
const urns = [...html.matchAll(/data-entity-urn="urn:li:jobPosting:(\d+)"/g)].map((m) => m[1]);

const now = new Date().toISOString();
const seen = new Set();
const results = [];
for (let i = 0; i < urns.length; i++) {
  const id = urns[i];
  if (seen.has(id)) continue;
  seen.add(id);
  results.push({
    title: titles[i] || "",
    company: companies[i] || "",
    location: locations[i] || "",
    contract: "",
    salary: "",
    source: "linkedin",
    url: `https://www.linkedin.com/jobs/view/${id}`,
    docId: `linkedin_${id}`,
    query,
    status: "new",
    scrapedAt: dates[i] ? new Date(dates[i]).toISOString() : now,
  });
}

console.log(JSON.stringify(results, null, 2));
console.error(`${results.length} offres extraites pour "${query}" / "${location}"`);
