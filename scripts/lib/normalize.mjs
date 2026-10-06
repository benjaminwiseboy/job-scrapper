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

// Canonical contract types, matched on slug() text (lowercase, no accents).
// Keys are the values of `searches/<id>.contracts`. "mission" is deliberately
// absent: too many permanent postings speak of "missions".
const CONTRATS = [
  ["alternance", "Alternance", /\b(alternance|alternant|alternante|apprenti|apprentie|apprentissage|contrat (de )?pro|contrat de professionnalisation|work study)\b/],
  ["stage", "Stage", /\b(stage|stages|stagiaire|internship|intern)\b/],
  ["vie", "VIE", /\b(v i e|volontariat international)\b/],
  ["cdi", "CDI", /\b(cdi|contrat a duree indeterminee)\b/],
  ["cdd", "CDD", /\b(cdd|contrat a duree determinee)\b/],
  ["interim", "Intérim", /\b(interim|interimaire|travail temporaire)\b/],
  ["freelance", "Freelance", /\b(freelance|independant|portage salarial)\b/],
  ["fonctionnaire", "Fonctionnaire", /\b(fonctionnaire|titulaire de la fonction publique)\b/],
];
// "VIE" must stay uppercase: lowercased, it is the French word "vie".
const VIE_SIGLE = /\bV\.?I\.?E\b/;

/** Every contract type a text mentions, taken literally. */
export function mentionedContracts(...texts) {
  const raw = texts.filter(Boolean).join(" ");
  const blob = slug(raw);
  return CONTRATS.filter(([key, , pattern]) => pattern.test(blob) || (key === "vie" && VIE_SIGLE.test(raw))).map(
    ([key]) => key
  );
}

/** Contract types of an offer, from its contract label and title. */
export function contractTypes(...texts) {
  const types = mentionedContracts(...texts);
  // An apprenticeship or internship is the real contract even when the board
  // files it as CDD/CDI (an apprenticeship is legally one or the other), or
  // when the title promises a hire afterwards.
  if (types.includes("alternance") || types.includes("stage")) return types.filter((t) => t !== "cdd" && t !== "cdi");
  return types;
}

/** Déduit le type de contrat du titre ou du texte de la carte (libellé affiché). */
export function guessContract(...texts) {
  const types = contractTypes(...texts);
  return types.map((key) => CONTRATS.find(([k]) => k === key)[1]).join(" / ");
}

/**
 * Should the offer be dropped for its contract? Only when its type is known and
 * shares nothing with the wanted ones: an unknown contract is kept, and a
 * posting that names several types (stage / alternance) is kept if one fits.
 */
export function contractMismatch(offer, wanted) {
  const keys = (wanted || []).map(slug).filter(Boolean);
  if (!keys.length) return false;
  const types = offer.contractTypes || contractTypes(offer.contract, offer.title);
  if (!types.length) return false;
  return !types.some((t) => keys.includes(t));
}

// Schools and training bodies post "alternance" ads that are really student
// recruitment: the "employer" is the school, the job is a pretext to sell a
// diploma. Their signature is the advertiser's name (a school, a training
// body, a brand built on the word "alternance") or a diploma in the title.
const ECOLE_ANNONCEUR = new RegExp(
  "\\b(" +
    [
      "ecole", "ecoles", "school", "campus", "academy", "academie", "cfa", "formation", "formations",
      "alternance", "business school", "bachelor factory",
      "iscod", "aurlom", "icademie", "mbway", "pigier", "ipac", "openclassrooms", "alticome", "formavenir",
      "irta", "ifcv", "ifae", "enaco", "aftral", "ecofac", "studi", "walter learning", "mydigitalschool",
      "my digital school", "iscpa", "esgci", "igensia", "ascencia", "ifag", "cesi", "sup de vente",
      "negoventis", "ifocop", "nextformation", "prisma academy", "efap", "eductive", "vendeurs d excellence",
    ].join("|") +
    ")\\b"
);
// A diploma named in the title: a company recruiting an apprentice names the
// job, a school names the course it is selling.
const ECOLE_TITRE = /\b(bts|bachelor|mastere|bac pro|bac professionnel|titre pro|rncp|mco|ndrc|gpme)\b/;

/** Is this "alternance" ad a school recruiting students rather than an employer hiring? */
export function schoolAd(offer) {
  const types = offer.contractTypes || contractTypes(offer.contract, offer.title);
  if (!types.includes("alternance") && !types.includes("stage")) return false;
  return ECOLE_ANNONCEUR.test(slug(offer.company)) || ECOLE_TITRE.test(slug(offer.title));
}

/**
 * True when every offer of a results page is already in the base. On a source
 * sorted by date, the next pages can only hold older, known offers too.
 */
export function allKnown(pageOffers, known) {
  return Boolean(known?.size) && pageOffers.length > 0 && pageOffers.every((o) => known.has(o.docId));
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
    contract: cleanText(contract) || guessContract(title),
    contractTypes: contractTypes(contract, title),
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
