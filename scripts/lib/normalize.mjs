// Forme canonique d'une offre + clé de dédoublonnage inter-sources.
// Une même annonce remonte souvent sur plusieurs boards (l'APEC agrège
// Météojob, par exemple) : le docId seul ne suffit pas, il faut une clé
// métier calculée sur intitulé + entreprise + ville.

const BRUIT_TITRE = /\b(h\/?f|f\/?h|m\/?f|h-f|\(h\/f\)|cdi|cdd|stage|alternance|apprentissage|temps plein|urgent)\b/gi;

export function slug(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Ville seule, sans code postal ni région : "Paris (75)" -> "paris". */
export function cityKey(location) {
  return slug(
    String(location || "")
      .replace(/\(\s*\d+\s*\)/g, "")
      .replace(/\b\d{5}\b/g, "")
      .split(/[,–—-]/)[0]
  );
}

/** Clé métier : deux annonces qui la partagent sont la même offre. */
export function dedupKey(offer) {
  const titre = slug(String(offer.title || "").replace(BRUIT_TITRE, " "));
  return [titre, slug(offer.company), cityKey(offer.location)].join("|");
}

const CONTRATS = [
  [/\balternance|apprentissage|contrat pro/i, "Alternance"],
  [/\bstage|internship|stagiaire/i, "Stage"],
  [/\bcdi\b/i, "CDI"],
  [/\bcdd\b/i, "CDD"],
  [/\bint[ée]rim|mission\b/i, "Intérim"],
  [/\bfreelance|ind[ée]pendant/i, "Freelance"],
];

/** Déduit le type de contrat du titre ou du texte de la carte. */
export function guessContract(...texts) {
  const blob = texts.filter(Boolean).join(" ");
  for (const [pattern, label] of CONTRATS) if (pattern.test(blob)) return label;
  return "";
}

export function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

/**
 * Objet d'offre unique écrit en base. `ref` est ajouté plus tard par la
 * commande de scraping, qui seule connaît le compteur de la recherche.
 */
export function makeOffer({ source, externalId, title, company, location, contract, salary, url, postedAt, dateConfidence, searchId }) {
  return {
    docId: `${source}_${externalId}`,
    source,
    externalId: String(externalId),
    title: cleanText(title),
    company: cleanText(company),
    location: cleanText(location),
    contract: contract || guessContract(title),
    salary: cleanText(salary),
    url,
    postedAt: postedAt || null,
    dateConfidence: dateConfidence || "unknown",
    dedupKey: dedupKey({ title, company, location }),
    searchId: searchId || null,
    status: "new",
    tier: null,
    rationale: "",
    scrapedAt: new Date().toISOString(),
  };
}
