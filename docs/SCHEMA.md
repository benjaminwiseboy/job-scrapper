# Schéma de la base de l'artefact

Artefact : `https://claude.ai/artifact/Wk81s5tNtTEtmydfobfjcx` (« Veille Emploi »).
Toutes les lectures et écritures passent par l'outil `ArtifactData` avec cette `url`.

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
| `excludeKeywords` | string[] | Écarte une offre si son titre contient l'un d'eux |
| `positioning` | string | Angle de réécriture du CV pour cet objectif |
| `active` | bool | Incluse dans un `/veille-scrape` sans argument |
| `nextRef` | number | Prochain numéro de référence à attribuer |
| `maxDays` | number | Plafond de la fenêtre de scraping (7 par défaut) |
| `sources` | map | Par source : `{enabled, lastScrapeAt, lastCount}` |

## `offers/<source>_<externalId>` — une offre

Produit par `scripts/scrape.mjs`, enrichi par `scripts/prepare-db.mjs` (`ref`,
`searchId`), puis classé.

| Champ | Rôle |
|---|---|
| `ref` | Référence lisible : `ACH-042`. C'est ce que l'utilisateur fournit à `/veille-cv` |
| `source` | `linkedin` · `indeed` · `meteojob` · `apec` |
| `externalId` | Identifiant chez la source |
| `title`, `company`, `location`, `contract`, `salary` | Champs extraits |
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
| `scrapedAt` | Date de collecte |

## `profile/<section>` — le profil, alimenté par `/veille-profil`

- `profile/identity` : `{name, headline, location, mobility, email, phone, languages[]}`
- `profile/formation` : `{items: [{degree, school, dates, focus, highlights[]}]}`
- `profile/experiences` : `{items: [{role, company, sector, size, dates, situation, task, action, result, skills[]}]}` — le bloc STAR
- `profile/skills` : `{outils: [], methodes: [], langues: [], certifications: []}`
- `profile/aspirations` : `{secteurs, taille, valeurs, mobilite, remuneration, refus}`

## `events/<id>` — salons et job datings

`{title, type, date, endDate, location, url, source, searchId, note, status}`

## `cvs/<id>` — trace des CV générés

`{offerRef, offerDocId, offerTitle, company, searchId, filePath, createdAt}`
