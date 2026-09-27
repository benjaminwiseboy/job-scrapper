// Les job boards français datent leurs offres de trois façons : une vraie date
// machine (LinkedIn), du relatif en toutes lettres ("il y a 3 jours"), ou rien.
// On rend systématiquement la confiance associée, parce que la fenêtre de
// scraping s'applique strictement aux dates sûres et souplement aux autres.

const MOIS = {
  janvier: 0, février: 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, août: 7, aout: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11, decembre: 11,
};

/**
 * @returns {{date: string|null, confidence: "exact"|"approx"|"unknown"}}
 */
export function parseFrenchDate(raw, now = new Date()) {
  if (!raw) return { date: null, confidence: "unknown" };
  const text = String(raw).toLowerCase().trim();

  // Date ISO ou attribut datetime -> fiable.
  const iso = text.match(/\d{4}-\d{2}-\d{2}(?:t[\d:.]+z?)?/);
  if (iso) {
    const d = new Date(iso[0]);
    if (!isNaN(d)) return { date: d.toISOString(), confidence: "exact" };
  }

  // 12/09/2026 ou 12/09/26
  const slash = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slash) {
    const [, d, m, y] = slash;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const date = new Date(Date.UTC(year, Number(m) - 1, Number(d)));
    if (!isNaN(date)) return { date: date.toISOString(), confidence: "exact" };
  }

  // 12 septembre 2026 / 12 septembre
  const litteral = text.match(/(\d{1,2})\s+([a-zéû]+)\.?\s*(\d{4})?/);
  if (litteral && MOIS[litteral[2]] !== undefined) {
    const year = litteral[3] ? Number(litteral[3]) : now.getUTCFullYear();
    const date = new Date(Date.UTC(year, MOIS[litteral[2]], Number(litteral[1])));
    // Sans année explicite, une date dans le futur vient de l'an dernier.
    if (!litteral[3] && date > now) date.setUTCFullYear(year - 1);
    if (!isNaN(date)) return { date: date.toISOString(), confidence: "exact" };
  }

  if (/aujourd'hui|à l'instant|just posted|new/i.test(text)) {
    return { date: now.toISOString(), confidence: "approx" };
  }
  if (/\bhier\b/.test(text)) {
    return { date: shift(now, -1).toISOString(), confidence: "approx" };
  }

  // "il y a 3 jours", "publié il y a 2 semaines", "30+ jours"
  const relatif = text.match(/(\d+)\s*\+?\s*(minute|heure|hour|jour|day|semaine|week|mois|month)/);
  if (relatif) {
    const n = Number(relatif[1]);
    const unit = relatif[2];
    const jours =
      /minute/.test(unit) ? 0 :
      /heure|hour/.test(unit) ? 0 :
      /jour|day/.test(unit) ? n :
      /semaine|week/.test(unit) ? n * 7 :
      n * 30;
    return { date: shift(now, -jours).toISOString(), confidence: "approx" };
  }

  return { date: null, confidence: "unknown" };
}

function shift(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Début de fenêtre : depuis le dernier scrape, plafonné à `maxDays`. */
export function windowStart(lastScrapeAt, maxDays = 7, now = new Date()) {
  const cap = shift(now, -maxDays);
  if (!lastScrapeAt) return cap;
  const last = new Date(lastScrapeAt);
  if (isNaN(last)) return cap;
  return last > cap ? last : cap;
}
