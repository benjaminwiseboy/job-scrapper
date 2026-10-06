---
name: veille-source
description: Teste si un site d'offres d'emploi ou d'événements est scrapable, rédige l'extracteur si oui, et explique le blocage si non. Utiliser quand l'utilisateur veut ajouter une source de scraping, vérifier une source, ou diagnostiquer une source qui ne remonte plus rien.
---

# Tester et ajouter une source

Argument : une URL de page de résultats de recherche (pas la page d'accueil),
ou le nom d'une source déjà intégrée à diagnostiquer.

Deux usages : intégrer une nouvelle source, ou comprendre pourquoi une source
existante est revenue vide — c'est presque toujours un sélecteur qui a changé.

**Où écrire le code.** Le diagnostic (étapes 1 et 2) marche partout. Pour
intégrer ou réparer un extracteur, en revanche, il faut une copie modifiable du
dépôt : les fichiers d'une application installée par l'installeur
(`${VEILLE_ROOT}`) sont remplacés à chaque mise à jour, une modification
y serait perdue. Si `${VEILLE_ROOT}` est dans `~/.veille-emploi/app/`,
explique-le, livre le diagnostic et le code proposé, et suggère de l'ajouter au
dépôt (clone + pull request, voir la section « Contribuer » du README). Si c'est
un clone local du dépôt, écris directement dedans.

## 1. Diagnostiquer l'accès

Dans cet ordre, en t'arrêtant dès que ça marche :

1. **HTTP simple** — `curl` ou `fetch` avec un User-Agent de navigateur. Si le
   HTML contient déjà les offres, c'est le meilleur cas : pas de navigateur,
   rapide et robuste (c'est le cas de LinkedIn).
2. **Navigateur** — un script Playwright reprenant `${VEILLE_ROOT}/scripts/lib/browser.mjs`
   (`launchBrowser`, `newPage`, `waitForResults`). Nécessaire pour les
   applications client-rendered (Météojob, APEC) et pour passer un contrôle
   Cloudflare basique (Indeed).

Écris les scripts de sonde dans le répertoire temporaire, pas dans le dépôt.

Qualifie précisément ce que tu rencontres :

- **403 ou 429 sur HTTP nu, mais le navigateur passe** → protection anti-bot
  basique, source exploitable.
- **CAPTCHA interactif** (Cloudflare Turnstile et équivalents) → **source non
  exploitable. N'essaie pas de le contourner.** Note-le et arrête.
- **Contenu derrière un compte** → non exploitable sans identifiants ; signale-le
  et n'invente pas de connexion.
- **API publique ou documentée** (France Travail par exemple) → toujours
  préférable au scraping. Dis-le et oriente vers l'API.

## 2. Repérer la structure

Sur la page rendue, sonde les cartes de résultats : le sélecteur qui les isole,
et dans chaque carte l'intitulé, l'entreprise, le lieu, le contrat, le salaire,
la date, et l'identifiant de l'offre (dans un attribut ou dans l'URL).

Deux pièges déjà rencontrés, à vérifier systématiquement :

- **Ne remonte pas avec `closest()` sur un sélecteur vague** : sur l'APEC,
  `closest("div[class*='result']")` attrape un conteneur qui englobe *tous* les
  résultats, et chaque offre ressort avec le texte de la première. Si la carte
  est imbriquée dans le lien, descends depuis le lien.
- **Les icônes polluent le texte** : sur Météojob, les `<mat-icon>` injectent
  leur nom (« place », « sunny ») dans `textContent`. Clone le nœud et retire
  les icônes avant de lire.

Vérifie aussi la pagination (paramètre d'URL, taille de page réelle) et
l'existence d'un tri par date ou d'un filtre de récence côté serveur — c'est ce
qui rend la fenêtre temporelle efficace.

## 3. Écrire l'extracteur

Sur le modèle de `${VEILLE_ROOT}/scripts/sources/meteojob.mjs`. Le contrat d'un module de
source :

```js
export const id = "<slug>";
export const label = "<Nom affiché>";
export const needsBrowser = true | false;
export async function scrape({ browser, page, query, location, maxPages, searchId, since, known }) { /* -> offres[] */ }
```

Pour une source navigateur, l'orchestrateur fournit `page` : une page qu'une
voie réutilise d'une recherche à l'autre (le bandeau cookies n'est alors fermé
qu'une fois). Ne la ferme pas ; n'en ouvre une avec `newPage` que si elle est
absente. Si le site bloque une deuxième navigation dans la même page (Indeed),
exporte `freshPages = true` et ouvre une page neuve par page de résultats.

Attends les cartes avec `waitForResults(page, <sélecteur des cartes>)`, jamais
avec un `waitForTimeout` fixe : c'est ce qui coûtait le plus de temps au
scraping. Une page bloquée par un CAPTCHA doit lever une erreur tout de suite
(voir `apec.mjs`), pas attendre l'échéance.

Si la source peut recevoir plusieurs requêtes simultanées sans refuser, ajoute
son nombre de voies dans `LANES` de `scrape.mjs` (1 par défaut).

Construis chaque offre avec `makeOffer()` de `${VEILLE_ROOT}/scripts/lib/normalize.mjs` (clé de
dédoublonnage et forme canonique) et les dates avec `parseFrenchDate()` de
`${VEILLE_ROOT}/scripts/lib/dates.mjs`, en rendant honnêtement la confiance : `exact` pour une
date machine, `approx` pour du relatif, `unknown` quand il n'y en a pas. Ne
fabrique jamais une date pour faire passer une offre dans la fenêtre.

Si la source trie par date, ajoute les deux arrêts anticipés de pagination
(voir la fin de la boucle dans `apec.mjs`) : page hors fenêtre, et page
entièrement déjà connue (`allKnown(offres de la page, known)`).

**Teste sur au moins deux pages** et vérifie qu'aucun champ ne revient vide en
masse avant de considérer que ça marche.

## 4. Enregistrer

Après validation par l'utilisateur, et pas avant :

- Déclare le module dans `SOURCES` de `${VEILLE_ROOT}/scripts/scrape.mjs`, et sa place dans
  `PRIORITE` (l'ordre qui décide quelle fiche gagne en cas de doublon
  inter-sources : la plus riche d'abord).
- Ajoute la source dans le libellé `SOURCES` de `dashboard/index.html` et
  republie l'artefact.
- Ajoute-la dans `sources` de chaque `searches/<id>` concerné,
  `{enabled: true, lastScrapeAt: null, lastCount: null}`.
- Commite avec un message qui dit ce que la source apporte et quels pièges de
  sélecteur ont été rencontrés.

Pour une source d'événements plutôt que d'offres, note-la dans
`${VEILLE_ROOT}/docs/EVENT-SOURCES.md` (crée le fichier au besoin) : `/veille-events` s'en sert.

## 5. Rendre compte

Verdict net : exploitable ou non, par quelle voie, avec quel volume constaté et
quelle qualité de date. Si non exploitable, dis pourquoi en une phrase et
n'insiste pas — une source qui exige de casser un CAPTCHA ou de se connecter
reste dehors.
