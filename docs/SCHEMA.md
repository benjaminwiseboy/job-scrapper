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
| `active` | bool | Incluse dans un `/veille:scrape` sans argument |
| `nextRef` | number | Prochain numéro de référence à attribuer |
| `maxDays` | number | Plafond de la fenêtre de scraping (7 par défaut) |
| `sources` | map | Par source : `{enabled, lastScrapeAt, lastCount}` |

## `offers/<source>_<externalId>` — une offre

Produit par `scripts/scrape.mjs`, enrichi par `scripts/prepare-db.mjs` (`ref`,
`searchId`), puis classé.

| Champ | Rôle |
|---|---|
| `ref` | Référence lisible : `ACH-042`. C'est ce que l'utilisateur fournit à `/veille:cv` |
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
| `tier` | `cible` · `possible` · `hors` · `null` (non classée) |
| `rationale` | Une phrase : ce qui correspond, ce qui manque |
| `status` | `new` · `seen` · `applied` · `answered` · `rejected` |
| `statusAt` | Horodatage du dernier changement de statut |
| `outcome` | `refused` quand l'employeur a répondu non, absent sinon |
| `outcomeAt` | Date du mail de refus |
| `scrapedAt` | Date de collecte |
| `closed` | `true` quand l'annonce n'accepte plus de candidatures, constaté par `scripts/check-open.mjs` (LinkedIn, Hellowork) ; absent sinon. Masquée du dashboard sauf candidature envoyée |
| `closedAt`, `closedReason` | Date du constat ; `candidatures closes` ou `offre retirée` |

Les mises à jour automatiques ne font jamais reculer le statut : `new` → `seen`
→ `applied` → `answered`.
`rejected` est réservé au bouton « Écarter » du dashboard — une décision de
l'utilisateur, que la purge conserve dans `dismissed`. Un refus de l'employeur
n'est donc pas un statut mais un `outcome` : la candidature reste `applied` ou
`answered`, comptée dans les KPIs et protégée de la purge.

## `profile/<section>` — le profil, alimenté par `/veille:profil`

- `profile/identity` : `{name, headline, location, mobility, email, phone, languages[]}`
- `profile/formation` : `{items: [{degree, school, dates, focus, highlights[]}]}`
- `profile/experiences` : `{items: [{role, company, sector, size, dates, situation, task, action, result, skills[]}]}` — le bloc STAR
- `profile/skills` : `{outils: [], methodes: [], langues: [], certifications: []}`
- `profile/aspirations` : `{secteurs, taille, valeurs, mobilite, remuneration, refus, contrats[], postes[], lieux[], disponibilite, rythme}` — les cinq derniers posés par `/veille:demarrer`

## `dismissed/<searchId>` — les offres écartées à la main

`{ids: ["indeed_...", ...], updatedAt}` — un seul document par recherche, pour ne
pas consommer le plafond de 5000.

Une offre écartée reste d'abord en base, donc le dédoublonnage suffit. Mais la
purge finit par la supprimer, et elle sort alors des identifiants connus : rien
n'empêcherait plus le scraping suivant de la réécrire comme une nouveauté. Ce
document fait donc survivre la décision à la suppression de la fiche. Il est
alimenté par `/veille:purge` et lu par `/veille:scrape`.

Seules les offres en `status: "rejected"` y entrent — une offre classée `hors`
par la machine n'est pas une décision humaine et peut être reclassée.

## `events/<id>` — salons et job datings

`{title, type, date, endDate, location, url, source, searchId, note, status}`

## `cvs/<id>` — trace des CV générés

`{offerRef, offerDocId, offerTitle, company, searchId, createdAt, …}` puis, selon
l'origine :

- **`/veille:cv`** : `filePath` (HTML) et `pdfPath`, chemins absolus locaux
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
`/veille:mail`. `lastRunAt` borne la recherche suivante ; `processed` évite de
retraiter un mail déjà appliqué (1000 identifiants au plus, les plus récents).
Aucun contenu de mail n'est stocké.
