# Veille Emploi

Plugin Claude Code pour chercher un stage, une alternance ou un emploi :
onboarding à partir de ton CV ou de LinkedIn, scraping multi-sources à la
demande, classement des offres selon ton profil, CV adaptés à chaque annonce,
et un dashboard Claude qui sert à la fois d'interface et de base de données.

Tout tourne **en local, sur invocation d'une commande** — aucune tâche planifiée.

## Installation

Prérequis : [Claude Code](https://claude.com/claude-code) et
[Node.js](https://nodejs.org) 18 ou plus. Dans un terminal :

```bash
claude plugin marketplace add benjaminwiseboy/job-scrapper && claude plugin install veille@veille-emploi
```

Ou, depuis une session Claude Code :

```
/plugin marketplace add benjaminwiseboy/job-scrapper
/plugin install veille@veille-emploi
```

**Sans GitHub, avec un zip** : la personne dézippe `veille-emploi.zip` où elle
veut, puis double-clique sur `Installer.cmd` (Windows) ou `Installer.command`
(macOS ; sous Linux, `sh Installer.command`). Si Node.js manque, l'installeur
propose de l'installer (version LTS officielle de nodejs.org, empreinte SHA-256
vérifiée ; sous Linux il indique seulement la marche à suivre). Il copie le plugin dans
`~/.veille-emploi/plugin` — le dossier dézippé peut ensuite être supprimé — et
l'enregistre dans Claude Code. Relancer l'installeur d'un zip plus récent met à
jour le plugin sans toucher aux profils. Pour fabriquer le zip :
`npm run package` (écrit `dist/veille-emploi.zip`, dépendances incluses, sans
aucun fichier personnel : seuls les fichiers que git suit ou suivrait y entrent).

Puis, dans Claude Code (n'importe quel dossier) :

```
/veille:demarrer
```

L'onboarding vérifie l'installation, propose de télécharger le navigateur
utilisé par certaines sources, crée ton dashboard, pré-remplit ton profil à
partir d'un CV ou d'un export PDF LinkedIn, te fait choisir tes contrats (stage,
alternance, CDI…) et tes métiers visés, puis lance le premier scraping. Compter
un quart d'heure. Tant qu'aucun profil n'existe, Claude te le propose de
lui-même à l'ouverture d'une session.

Le mode d'emploi détaillé est dans l'onglet **Guide** du dashboard.

## Deux moitiés, jamais liées par un lancement

**Le dashboard est la vue, Claude Code est le moteur.**

- Le dashboard est un artefact publié sur ton compte Claude, privé par défaut.
  On l'ouvre depuis n'importe quel appareil, y compris pour changer le statut
  d'une offre. Il se met à jour tout seul pendant qu'une commande tourne.
- Les commandes `/veille:*` tournent dans Claude Code, sur ta machine : elles
  seules ont un navigateur, Node et un système de fichiers pour scraper et
  écrire des CV.

## Les commandes

| Commande | Ce qu'elle fait |
|---|---|
| `/veille:demarrer` | Onboarding : installation, dashboard, profil depuis CV/LinkedIn, objectifs, premier scraping. Crée aussi un nouveau profil |
| `/veille:scrape [recherche]` | Interroge les sources, dédoublonne, classe les nouvelles offres, purge les anciennes |
| `/veille:profil` | Entretien guidé au format STAR : formation, expériences, compétences, aspirations, recherches |
| `/veille:cv <ref>` | CV adapté à une offre (ex. `/veille:cv ACH-042`), en HTML et PDF |
| `/veille:mail` | Met à jour les statuts depuis Gmail : confirmations, entretiens, refus |
| `/veille:events` | Salons, job datings et forums liés aux recherches |
| `/veille:profils` | Liste, change, crée ou rebranche un profil ; met à jour un dashboard |
| `/veille:source <url>` | Teste si un site est scrapable, rédige l'extracteur si oui |
| `/veille:purge` | Nettoie les anciennes offres non retenues |

## Profils

Un **profil** = un dashboard (donc une base) + un dossier de travail local.
On peut en avoir plusieurs : un stage puis un CDI, ou accompagner quelqu'un
d'autre. Le registre local est `~/.veille-emploi/config.json` ; le dossier de
travail par défaut `~/Documents/Veille-Emploi/<profil>/` (CV générés,
fichiers intermédiaires).

Dans un même profil, chaque **recherche** correspond à un métier visé, avec ses
contrats, ses lieux et son angle de réécriture du CV.

**Nouvelle machine** : les dashboards et leurs données restent sur le compte
Claude. Réinstaller le plugin, puis `/veille:profils` pour les rebrancher.

**Mise à jour** : `claude plugin update veille@veille-emploi`. Si le dashboard
a changé, Claude le signale en début de session et `/veille:profils` le
republie sans toucher aux données.

## Sources

| Source | Voie | Dates |
|---|---|---|
| LinkedIn | HTTP simple, page invité rendue côté serveur | exactes, filtre de récence côté serveur |
| Indeed | Navigateur (Cloudflare bloque l'HTTP nu) | absentes des cartes de résultats |
| Météojob | Navigateur (application Angular) | relatives (« il y a 3 jours ») |
| APEC | Navigateur (application Angular) | exactes |
| Hellowork | HTTP simple, page rendue côté serveur | relatives |

Les sources « navigateur » demandent Chromium, que `/veille:demarrer` propose
d'installer (`node scripts/setup.mjs --install-browser`). Sans lui, LinkedIn et
Hellowork fonctionnent seules.

Non retenues : **Welcome to the Jungle** (plus de recherche publique),
**JobTeaser** (CAPTCHA interactif). **France Travail** propose une API
officielle, à préférer au scraping dès que les identifiants sont disponibles.

## Fenêtre temporelle

Chaque source repart de son dernier passage, plafonné à `maxDays` (7 par défaut).
La règle est volontairement souple : une source qui ne publie pas de date
exploitable n'est jamais écartée par la fenêtre, puisque le dédoublonnage par
identifiant garantit déjà qu'une offre connue ne remonte pas deux fois. Les
sources triées par date arrêtent de paginer dès qu'une page sort de la fenêtre.

## Architecture

```
.claude-plugin/       manifeste du plugin et catalogue (marketplace)
skills/               les commandes /veille:*
hooks/hooks.json      au démarrage de session : propose l'onboarding, signale un dashboard à mettre à jour
scripts/
  setup.mjs           état de l'installation, dépendances, Chromium, hook
  veille-config.mjs   registre local des profils (URL d'artefact, dossier de travail)
  scrape.mjs          orchestrateur : fenêtre, exclusions, dédoublonnage inter-sources
  prepare-db.mjs      attribue les références, écrit un fichier par offre, imprime les lots
  lib/                navigateur partagé, dates françaises, forme canonique, config
  sources/            un module par job board
dashboard/index.html  le modèle de dashboard, publié une fois par profil
docs/CONTEXTE.md      règles communes aux commandes (profil actif, base, interdits)
docs/SCHEMA.md        structure de la base
docs/CV-RULES*.md     règles de rédaction des CV
```

Les scripts ne parlent jamais à l'artefact : ils produisent du JSON, et c'est
Claude qui écrit en base via l'outil `ArtifactData`.

## Contribuer

Pour modifier le plugin et voir l'effet immédiatement, charge ton clone en
place plutôt que la copie installée depuis GitHub :

```bash
git clone https://github.com/benjaminwiseboy/job-scrapper.git
cd job-scrapper
npm install
claude plugin marketplace add ./
claude plugin install veille@veille-emploi
```

Un catalogue ajouté depuis un dossier local est chargé en place : une
modification prend effet à la session suivante ou après `/reload-plugins`.
Pour une seule session, `claude --plugin-dir .` suffit. `claude plugin validate .`
vérifie les manifestes.

## Usage direct des scripts

```bash
node scripts/scrape.mjs --query "acheteur junior" --location France --maxPages 4
node scripts/scrape.mjs --config .veille-tmp/config-achats.json --out run.json
```

## Limites connues

- **5000 documents** par artefact : d'où la purge, appliquée à chaque scraping.
- Les sélecteurs **cassent** quand un site change son HTML. L'onglet Paramètres
  affiche le dernier passage et le volume par source ; un point ambre signale une
  source muette. `/veille:source` sert à la remettre d'aplomb.
- Le classement vaut ce que vaut le profil : sans `/veille:profil`, les offres
  arrivent non classées.
- Aucun score « ATS » n'est produit : aucun éditeur ne publie ses règles de
  parsing, un pourcentage serait inventé. Les CV respectent en revanche les
  contraintes de forme qui font échouer les parseurs (pas de tableaux, pas de
  colonnes, titres standards).
