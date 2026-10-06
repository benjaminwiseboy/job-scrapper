# Schéma de la base de l'artefact

Chaque profil a son propre artefact « Veille Emploi », donc sa propre base : son
URL est celle du profil actif, donnée par `scripts/veille-config.mjs` (voir
`CONTEXTE.md`). Toutes les lectures et écritures passent par l'outil
`ArtifactData` avec cette `url`.

Rappels d'usage : un lot (`batch`) accepte au maximum 50 écritures et s'applique
tout ou rien ; toute écriture sur un document déjà lu doit porter `if_version`,
sinon le lot entier est refusé. Plafond de 5000 documents par artefact — d'où la
purge.

## `searches/<id>` — un objectif de recherche

| Champ | Type | Rôle |
|---|---|---|
| `label` | string | Nom affiché (« Achats — stage & alternance ») |
| `code` | string | Préfixe des références, 3 lettres (`ACH`, `COM`) |
| `queries` | string[] | Requêtes envoyées aux sources |
| `locations` | string[] | Lieux (`France` = national) |
| `contracts` | string[] | Contrats visés : `stage` · `alternance` · `cdi` · `cdd` · `interim` · `freelance` · `vie` · `fonctionnaire`. Filtre dur : `scrape.mjs` écarte toute offre dont le contrat est connu et absent de la liste ; vide = aucun filtre |
| `excludeKeywords` | string[] | Écarte une offre si son titre contient l'un d'eux |
| `positioning` | string | Angle de réécriture du CV pour cet objectif |
| `active` | bool | Incluse dans un `/veille-scrape` sans argument |
| `nextRef` | number | Prochain numéro de référence à attribuer |
| `maxDays` | number | Plafond de la fenêtre de scraping (7 par défaut) |
| `sources` | map | Par source : `{enabled, lastScrapeAt, lastCount}` |

## `offers/<source>_<externalId>` — une offre

Produit par `scripts/scrape.mjs`, classé par Claude, puis écrit par
`scripts/prepare-db.mjs` (`ref`, `searchId`, `tier`, `rationale`) en une seule
écriture. Une offre classée `hors` n'est jamais écrite : elle ne figure que
dans `seen/<searchId>`.

| Champ | Rôle |
|---|---|
| `ref` | Référence lisible : `ACH-042`. C'est ce que l'utilisateur fournit à `/veille-cv` |
| `source` | `linkedin` · `indeed` · `meteojob` · `apec` |
| `externalId` | Identifiant chez la source |
| `title`, `company`, `location`, `contract`, `salary` | Champs extraits (`contract` = libellé affiché, tel que donné par la source) |
| `contractTypes` | Contrats détectés, mêmes clés que `searches.contracts` ; `[]` = inconnu. Une alternance ou un stage étiqueté CDD/CDI ne garde que `alternance`/`stage` |
| `url` | Lien vers l'annonce |
| `postedAt` | Date de publication, ou `null` |
| `dateConfidence` | `exact` · `approx` · `unknown` (affiché par un `~` dans l'interface) |
| `dedupKey` | `titre|entreprise|ville` normalisé, sert au dédoublonnage inter-sources |
| `alsoOn` | Autres sources où la même offre a été vue |
| `searchId` | Recherche à laquelle l'offre appartient |
| `query` | Requête qui l'a ramenée |
| `tier` | `cible` · `possible` · `null` (non classée). `hors` n'apparaît plus que sur des offres écrites avant que le classement précède l'écriture ; la purge les supprime |
| `rationale` | Une phrase : ce qui correspond, ce qui manque |
| `status` | `new` · `seen` · `applied` · `answered` · `rejected` |
| `statusAt` | Horodatage du dernier changement de statut |
| `outcome` | `refused` quand l'employeur a répondu non, absent sinon |
| `outcomeAt` | Date du mail de refus |
| `scrapedAt` | Date de collecte |
| `closed` | `true` quand l'annonce n'accepte plus de candidatures, constaté par `scripts/check-open.mjs` (LinkedIn, Hellowork) ; absent sinon. Seules les offres protégées (candidature, CV) sont marquées ainsi, les autres sont supprimées. Masquée du dashboard sauf candidature envoyée |
| `closedAt`, `closedReason` | Date du constat ; `candidatures closes` ou `offre retirée` |
| `contacts` | Écrit par `/veille-contacts` (Hunter.io) : `{searchedAt, domain, pattern, agency, strategy, emails: [{email, name, position, type, confidence, verification, linkedin}]}`. `strategy` vaut `hr`, `generic`, `executive` ou `null` (rien trouvé — `emails` est alors vide, et la recherche n'est pas refaite avant 30 jours). `type` : `personal` ou `generic`. `agency` : l'offre vient d'un cabinet ou d'une agence d'intérim. Absent tant qu'aucune recherche n'a été faite |

Les mises à jour automatiques ne font jamais reculer le statut : `new` → `seen`
→ `applied` → `answered`.
`rejected` est réservé au bouton « Écarter » du dashboard — une décision de
l'utilisateur, que la purge conserve dans `dismissed`. Un refus de l'employeur
n'est donc pas un statut mais un `outcome` : la candidature reste `applied` ou
`answered`, comptée dans les KPIs et protégée de la purge.

## `profile/<section>` — le profil, alimenté par `/veille-profil`

- `profile/identity` : `{name, headline, location, mobility, email, phone, languages[]}`
- `profile/formation` : `{items: [{degree, school, dates, focus, highlights[]}]}`
- `profile/experiences` : `{items: [{role, company, sector, size, dates, situation, task, action, result, skills[]}]}` — le bloc STAR
- `profile/skills` : `{outils: [], methodes: [], langues: [], certifications: []}`
- `profile/aspirations` : `{secteurs, taille, valeurs, mobilite, remuneration, refus, contrats[], postes[], lieux[], disponibilite, rythme}` — les cinq derniers posés par `/veille-demarrer`

## `seen/<searchId>` — l'index des offres déjà vues

`{ids: ["linkedin_...", ...], screened: ["indeed_...", ...], updatedAt}` — un
seul document par recherche.

- `ids` : toutes les offres jamais écrites pour cette recherche, plus celles
  écartées comme hors cible. Le scraping les écarte avant toute requête
  supplémentaire : c'est ce qui évite de relire la base entière à chaque
  passage, et ce qui empêche une offre purgée de revenir.
- `screened` : le sous-ensemble jamais écrit en base (classé `hors`), que
  `check-open.mjs` n'a pas à vérifier.

Écrit par `prepare-db.mjs` à chaque scraping (15 000 identifiants au plus, les
plus récents). Amorcé au premier passage depuis les offres en base.

## `dismissed/<searchId>` — les offres écartées à la main (historique)

`{ids: ["indeed_...", ...], updatedAt}`. Gardait la trace des offres
`rejected` purgées, pour qu'elles ne reviennent pas. `seen` couvre désormais ce
besoin pour toute offre écrite ; ce document n'est plus alimenté, mais reste lu
par `/veille-scrape` pour les décisions qui le précèdent.

## `events/<id>` — salons et job datings

`{title, type, date, endDate, location, url, source, searchId, note, status}`

## `cvs/<id>` — trace des CV générés

`{offerRef, offerDocId, offerTitle, company, searchId, createdAt, …}` puis, selon
l'origine :

- **`/veille-cv`** : `filePath` (HTML) et `pdfPath`, chemins absolus locaux
  produits par `scripts/cv-pdf.mjs`.
- **onglet Candidater** (`origin: "dashboard"`) : le contenu lui-même, d'où le
  dashboard régénère les PDF à la demande —
  `cv: {name, title, contact[], summary, experiences[{role, company, place, dates, bullets[]}], education[{degree, school, dates, details}], skills[{label, items[]}], languages[], interests[]}`,
  `letter: {subject, salutation, paragraphs[], closing}`, `mail: {subject, body}`.
  Chacun peut manquer si l'utilisateur ne l'a pas demandé. `offerRef` et
  `offerDocId` sont vides pour une annonce hors dashboard ; le `doc_id` vaut
  alors `LIBRE_<horodatage>`.

`offerDocId` rattache le CV à son offre. Listés dans l'onglet CV du dashboard.

## `mailsync/state` — suivi de la lecture des mails

`{lastRunAt, processed: ["<messageId Gmail>", ...]}` — alimenté par
`/veille-mail`. `lastRunAt` borne la recherche suivante ; `processed` évite de
retraiter un mail déjà appliqué (1000 identifiants au plus, les plus récents).
Aucun contenu de mail n'est stocké.
