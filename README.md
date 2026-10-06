# Veille Emploi

Commandes Claude Code pour chercher un stage, une alternance ou un emploi :
onboarding à partir de ton CV ou de LinkedIn, scraping multi-sources à la
demande, classement des offres selon ton profil, CV adaptés à chaque annonce,
et un dashboard Claude qui sert à la fois d'interface et de base de données.

Tout tourne **en local, sur invocation d'une commande** — aucune tâche planifiée.

## Ce qu'il faut pour l'utiliser

Chaque personne utilise **son propre compte et ses propres données** : rien de
ce que contient le compte de l'auteur (dashboard, profil, CV, clé Hunter) n'est
partagé ni nécessaire.

| Prérequis | Obligatoire ? | Pourquoi |
|---|---|---|
| Un compte Claude avec [Claude Code](https://claude.com/claude-code) | oui | les commandes tournent dans Claude Code ; le dashboard est un artefact publié sur ce compte |
| [Node.js](https://nodejs.org) 18 ou plus | oui | les scripts de scraping et de CV (l'installeur propose de l'installer s'il manque) |
| Chromium (téléchargé par `/veille-demarrer`, ~150 Mo) | conseillé | Indeed, Météojob et l'APEC ; sans lui, LinkedIn et Hellowork marchent seules |
| Le connecteur Gmail de claude.ai | facultatif | `/veille-mail`, qui met les statuts à jour depuis la boîte mail |
| Une clé [Hunter.io](https://hunter.io) personnelle | facultatif | `/veille-contacts` et le bouton « Contacts RH » (voir plus bas) |

## Installer

1. Télécharger l'installeur sur la
   [page des versions](https://github.com/benjaminwiseboy/job-scrapper/releases/latest) :
   `Installer.cmd` (Windows) ou `Installer-mac.zip` (macOS, à dézipper ; sous
   Linux, `sh Installer.command`).
2. Double-cliquer dessus. Windows peut afficher « Windows a protégé votre
   ordinateur » : *Informations complémentaires* puis *Exécuter quand même*.
   macOS peut refuser un fichier téléchargé : clic droit, *Ouvrir*.
   L'installeur télécharge la dernière version, vérifie son empreinte SHA-256,
   propose d'installer Node.js s'il manque (version LTS officielle, empreinte
   vérifiée ; sous Linux il indique la marche à suivre), copie l'application
   dans `~/.veille-emploi/app` et ajoute les commandes dans
   `~/.claude/skills/`.
3. Ouvrir Claude Code (le redémarrer s'il était ouvert), dans n'importe quel
   dossier, et taper :

```
/veille-demarrer
```

L'onboarding vérifie l'installation, propose de télécharger le navigateur
utilisé par certaines sources, crée **ton propre** dashboard sur ton compte
Claude, pré-remplit ton profil à partir d'un CV ou d'un export PDF LinkedIn, te
fait choisir tes contrats (stage, alternance, CDI…) et tes métiers visés, puis
lance le premier scraping. Compter un quart d'heure.

**Mise à jour** : relancer le même installeur, qui télécharge la dernière
version ; les profils, la clé Hunter et les données ne bougent pas.
`/veille-demarrer` et `/veille-profils` signalent quand une version plus
récente existe. Si le dashboard a changé, `/veille-profils` le republie sans
toucher aux données. **Une version précise** : `Installer.cmd 1.2.0` dans une
invite de commandes (ou `sh Installer.command 1.2.0`).
**Désinstaller** : supprimer `~/.veille-emploi/app` et les dossiers `veille-*`
de `~/.claude/skills/` (et `~/.veille-emploi/` en entier pour effacer aussi les
profils locaux et la clé Hunter).

Le mode d'emploi détaillé est dans l'onglet **Guide** du dashboard.

## Publier une version (pour l'auteur)

La version vit dans `package.json`. Depuis `main` à jour, arbre propre :

```bash
npm version patch
```

(`minor` pour une nouveauté, `major` pour un changement qui casse quelque
chose.) La commande vérifie la branche, fabrique le zip pour s'assurer qu'il
se construit, passe `package.json` à la version suivante, commite, tague
`vX.Y.Z` et pousse. Le workflow GitHub `Release` fabrique alors les fichiers et
publie la Release : `veille-emploi.zip`, son empreinte `.sha256`,
`Installer.cmd` et `Installer-mac.zip`. Dès qu'elle apparaît dans l'onglet
*Releases*, relancer l'installeur la récupère.

N'entrent dans le zip que les fichiers que git suit ou suivrait : les dossiers
de travail ignorés (`cv/`, `db-writes/`, `details/`, `.veille-tmp/`,
`.veille-cache/`) restent dehors, et la configuration personnelle
(`~/.veille-emploi/`) n'est jamais dans le dépôt.

**Tester avant de publier pour tout le monde** : `npm version prerelease
--preid beta` donne `1.2.1-beta.0`, publiée en *pre-release*. L'installeur ne
la prend que si on la demande : `Installer.cmd 1.2.1-beta.0`. Hors de `main`,
préfixer la commande de `VEILLE_RELEASE_ANY_BRANCH=1`.

### Revenir en arrière

Si une version pose problème, sur GitHub, onglet *Releases* :

1. Ouvrir la version fautive, *Edit*, cocher *Set as a pre-release*, *Update
   release*. Elle reste téléchargeable par son numéro, mais n'est plus servie
   par défaut.
2. Ouvrir la version précédente, *Edit*, cocher *Set as the latest release*,
   *Update release*.

À partir de là, relancer l'installeur réinstalle la version précédente
(« Retour à une version antérieure »), et `/veille-demarrer` prévient ceux qui
ont la version retirée. La correction est ensuite publiée comme une nouvelle
version (`npm version patch`) : ne jamais déplacer ni réutiliser un tag déjà
publié.

Un rollback remet le code, pas les données : si la version fautive a modifié la
base, la version précédente doit savoir la relire. Si le dashboard diffère,
`/veille-profils` republie celui de la version réinstallée.

## Ajouter sa clé Hunter.io (facultatif)

`/veille-contacts <ref>` et le bouton « Contacts RH » cherchent les emails RH de
l'entreprise d'une offre, pour une candidature spontanée par mail. Ils
utilisent l'API Hunter.io avec **la clé de la personne qui s'en sert** : aucune
clé n'est fournie avec l'outil, et sans clé tout le reste fonctionne.

> **50 crédits par mois, à utiliser avec parcimonie.** Le forfait gratuit de
> Hunter donne 50 crédits par mois : compte **au plus 50 recherches**. Une
> recherche consomme **1 crédit dès que Hunter renvoie des adresses, même si
> aucune n'est utile** (par exemple `vip@` ou `promo@`, que l'outil écarte) :
> tu peux donc payer un crédit et ne voir aucun contact. Seule une recherche
> où Hunter ne connaît strictement rien est gratuite. L'outil ne dépense jamais
> plus d'un crédit par recherche et ne refait pas une offre déjà cherchée avant
> 30 jours. Garde-le pour les offres qui comptent vraiment ; pour une offre
> publiée par un cabinet ou une agence d'intérim, il trouve souvent les
> recruteurs de l'agence, pas ceux de l'employeur.

**Obtenir la clé**

1. Créer un compte gratuit sur [hunter.io](https://hunter.io) (bouton
   d'inscription) et confirmer son email.
2. Une fois connecté, ouvrir [hunter.io/api-keys](https://hunter.io/api-keys)
   (menu du compte, rubrique API) et copier la clé. Aide officielle de Hunter :
   [où trouver sa clé API](https://help.hunter.io/en/articles/1970978-what-is-and-where-i-can-find-my-api-secret-key).

**L'enregistrer — le plus simple : la coller dans Claude Code**

3. Coller la clé dans la conversation, par exemple au moment où
   `/veille-contacts` la réclame. Claude l'enregistre dans
   `~/.veille-emploi/secrets.json`, vérifie qu'elle marche (sans dépenser de
   crédit) et annonce les crédits restants. La clé reste dans l'historique de
   la conversation, conservé sur l'ordinateur : `/clear` la retire du contexte
   de la session, pas de cet historique.

**Ou, sans la faire passer par la conversation : avec l'installeur**

   Double-cliquer sur `Installer.cmd` (Windows) ou `Installer.command` (Mac).
   À la fin, il demande la clé Hunter : la coller (clic droit dans une vieille
   fenêtre Windows), puis Entrée. Elle ne s'affiche pas. Déjà installé ?
   Relancer simplement l'installeur : il propose d'ajouter ou de remplacer la
   clé.

Pour qui préfère le terminal : `node ~/.veille-emploi/app/scripts/veille-config.mjs secret hunter`
fait la même chose (sous Windows, `$HOME` en PowerShell ou `%USERPROFILE%` en
cmd à la place de `~` ; depuis un clone du dépôt, `node scripts/veille-config.mjs secret hunter`).
La variable d'environnement `HUNTER_API_KEY` prime sur le fichier ;
`secret hunter --remove` efface la clé.

**Vérifier ses crédits** : `node ~/.veille-emploi/app/scripts/contacts.mjs --account`
(gratuit), ou demander à Claude « combien de crédits Hunter me reste-t-il ? ».

**Effacer une clé pour de bon** : la régénérer sur hunter.io (la page des clés
permet d'en créer une nouvelle et de supprimer l'ancienne), puis enregistrer
la nouvelle. L'ancienne ne sert alors plus à rien, où qu'elle traîne.

## Deux moitiés, jamais liées par un lancement

**Le dashboard est la vue, Claude Code est le moteur.**

- Le dashboard est un artefact publié sur ton compte Claude, privé par défaut.
  On l'ouvre depuis n'importe quel appareil, y compris pour changer le statut
  d'une offre. Il se met à jour tout seul pendant qu'une commande tourne.
- Les commandes `/veille-*` tournent dans Claude Code, sur ta machine : elles
  seules ont un navigateur, Node et un système de fichiers pour scraper et
  écrire des CV.

## Les commandes

| Commande | Ce qu'elle fait |
|---|---|
| `/veille-demarrer` | Onboarding : installation, dashboard, profil depuis CV/LinkedIn, objectifs, premier scraping. Crée aussi un nouveau profil |
| `/veille-scrape [recherche]` | Interroge les sources, dédoublonne, classe les nouvelles offres, purge les anciennes |
| `/veille-profil` | Entretien guidé au format STAR : formation, expériences, compétences, aspirations, recherches |
| `/veille-cv <ref>` | CV adapté à une offre (ex. `/veille-cv ACH-042`), en HTML et PDF |
| `/veille-contacts <ref>` | Emails RH de l'entreprise d'une offre (Hunter.io), pour une candidature spontanée par mail. Demande sa propre clé Hunter (voir plus haut) |
| `/veille-mail` | Met à jour les statuts depuis Gmail : confirmations, entretiens, refus |
| `/veille-events` | Salons, job datings et forums liés aux recherches |
| `/veille-profils` | Liste, change, crée ou rebranche un profil ; met à jour un dashboard |
| `/veille-source <url>` | Teste si un site est scrapable, rédige l'extracteur si oui |
| `/veille-purge` | Nettoie les anciennes offres non retenues |

## Profils

Un **profil** = un dashboard (donc une base) + un dossier de travail local.
On peut en avoir plusieurs : un stage puis un CDI, ou accompagner quelqu'un
d'autre. Le registre local est `~/.veille-emploi/config.json` ; le dossier de
travail par défaut `~/Documents/Veille-Emploi/<profil>/` (CV générés,
fichiers intermédiaires).

Dans un même profil, chaque **recherche** correspond à un métier visé, avec ses
contrats, ses lieux et son angle de réécriture du CV.

**Nouvelle machine** : les dashboards et leurs données restent sur le compte
Claude. Réinstaller avec l'installeur, puis `/veille-profils` pour les rebrancher,
et réenregistrer la clé Hunter si besoin (elle reste sur l'ancienne machine).

## Sources

| Source | Voie | Dates |
|---|---|---|
| LinkedIn | HTTP simple, page invité rendue côté serveur | exactes, filtre de récence côté serveur |
| Indeed | Navigateur (Cloudflare bloque l'HTTP nu) | absentes des cartes de résultats |
| Météojob | Navigateur (application Angular) | relatives (« il y a 3 jours ») |
| APEC | Navigateur (application Angular) | exactes |
| Hellowork | HTTP simple, page rendue côté serveur | relatives |

Les sources « navigateur » demandent Chromium, que `/veille-demarrer` propose
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
.claude/skills/veille-*/  les commandes (livrées sous skills/<nom>/ dans le zip)
Installer.cmd/.command    installeurs : téléchargent une Release GitHub et lancent son install.mjs
.github/workflows/        publication d'une Release à chaque tag vX.Y.Z
scripts/
  setup.mjs           état de l'installation, dépendances, Chromium, clé Hunter présente ou non
  veille-config.mjs   registre local des profils (URL d'artefact, dossier de travail) et des clés d'API
  contacts.mjs        emails RH d'une entreprise via Hunter.io (clé de l'utilisateur)
  package.mjs         fabrique le zip et les fichiers de la Release ; install.mjs l'installe
  release-check.mjs   avant npm version : branche main, à jour avec GitHub
  scrape.mjs          orchestrateur : fenêtre, exclusions, dédoublonnage inter-sources
  prepare-db.mjs      liste à classer, puis un fichier par offre retenue et les lots à écrire
  check-open.mjs      repère les offres fermées (LinkedIn, Hellowork), avec cache local
  purge-plan.mjs      décide quelles offres supprimer ou marquer fermées
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

Pour modifier l'outil et voir l'effet immédiatement, travaille dans un clone :

```bash
git clone https://github.com/benjaminwiseboy/job-scrapper.git
cd job-scrapper
npm install
claude
```

Ouvert dans ce dossier, Claude Code charge les commandes depuis
`.claude/skills/` (`/veille-scrape`, `/veille-cv`…) ; une modification prend
effet à la session suivante. Les chemins `${VEILLE_ROOT}` des skills
désignent alors la racine du clone. Pour tester ce que recevra quelqu'un
d'autre sans rien publier : `npm run package`, dézipper `dist/veille-emploi.zip`,
puis `node veille-emploi/scripts/install.mjs`.

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
