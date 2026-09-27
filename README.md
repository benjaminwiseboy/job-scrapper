# Veille Emploi

Assistant de recherche d'emploi piloté depuis Claude Code : scraping multi-sources
à la demande, classement des offres par adéquation, génération de CV adaptés, et
un dashboard partagé qui sert à la fois d'interface et de base de données.

Tout tourne **en local, sur invocation d'une commande** — aucune tâche planifiée.

## Les commandes

| Commande | Ce qu'elle fait |
|---|---|
| `/veille-scrape [recherche]` | Interroge les sources actives, dédoublonne, classe les nouvelles offres, purge les anciennes, écrit dans le dashboard |
| `/veille-profil` | Entretien guidé au format STAR : formation, expériences, compétences, aspirations |
| `/veille-cv <ref>` | Génère un CV adapté à une offre (ex. `/veille-cv ACH-042`), enregistré en local |
| `/veille-events` | Cherche salons, job datings et forums correspondant au profil |
| `/veille-source <url>` | Teste si un site est scrapable, rédige l'extracteur si oui |
| `/veille-purge` | Nettoie les anciennes offres non retenues |

## Installation sur une nouvelle machine

Le dashboard, ses données et les recherches vivent sur le **compte Claude** : ils
suivent l'utilisateur sans rien faire. Seule la partie locale se réinstalle.

```bash
git clone https://github.com/benjaminwiseboy/job-scrapper.git
cd job-scrapper
npm install
npx playwright install chromium
```

Puis ouvrir Claude Code dans le dossier : les commandes `/veille-*` sont
disponibles immédiatement (elles vivent dans `.claude/skills/`).

L'URL de l'artefact est inscrite dans les skills et dans `docs/SCHEMA.md` — rien
à configurer.

## Sources

| Source | Voie | Dates |
|---|---|---|
| LinkedIn | HTTP simple, page invité rendue côté serveur | exactes, filtre de récence côté serveur |
| Indeed | Navigateur (Cloudflare bloque l'HTTP nu) | absentes des cartes de résultats |
| Météojob | Navigateur (application Angular) | relatives (« il y a 3 jours ») |
| APEC | Navigateur (application Angular) | exactes |

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
scripts/
  scrape.mjs          orchestrateur : fenêtre, exclusions, dédoublonnage inter-sources
  prepare-db.mjs      attribue les références, écrit un fichier par offre, imprime les lots
  lib/                navigateur partagé, dates françaises, forme canonique
  sources/            un module par job board
dashboard/index.html  le dashboard (publié comme artefact)
docs/SCHEMA.md        structure de la base
.claude/skills/       les commandes
```

Les scripts ne parlent jamais à l'artefact : ils produisent du JSON, et c'est
Claude qui écrit en base via l'outil `ArtifactData`. `prepare-db.mjs` existe pour
que ces écritures passent par des fichiers plutôt que par de longs appels.

## Usage direct des scripts

```bash
node scripts/scrape.mjs --query "acheteur junior" --location France --maxPages 4
node scripts/scrape.mjs --config .veille-tmp/config-achats.json --out run.json
```

## Limites connues

- **5000 documents** par artefact : d'où la purge, appliquée à chaque scraping.
- Les sélecteurs **cassent** quand un site change son HTML. L'onglet Paramètres
  affiche le dernier passage et le volume par source ; un point ambre signale une
  source muette. `/veille-source` sert à la remettre d'aplomb.
- Le classement vaut ce que vaut le profil : sans `/veille-profil`, les offres
  arrivent non classées.
- Aucun score « ATS » n'est produit : aucun éditeur ne publie ses règles de
  parsing, un pourcentage serait inventé. Les CV respectent en revanche les
  contraintes de forme qui font échouer les parseurs (pas de tableaux, pas de
  colonnes, titres standards).
