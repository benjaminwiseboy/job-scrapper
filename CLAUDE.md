# Contexte du projet

Assistant de recherche d'emploi, distribué comme un **zip de skills Claude
Code** publié en Release GitHub. `Installer.cmd` / `Installer.command`
téléchargent la Release, vérifient son SHA-256 et lancent son `install.mjs`.
Ce fichier sert à qui travaille sur le dépôt : il n'est pas livré. Les règles que les
commandes doivent suivre chez l'utilisateur vivent dans `docs/CONTEXTE.md`, que
chaque skill cite — c'est là qu'il faut les modifier.

- Les commandes sont les skills de `.claude/skills/veille-<nom>/SKILL.md`,
  invoquées `/veille-<nom>` (livrées sous `skills/<nom>/` dans le zip). Elles
  référencent les fichiers de l'application par `${VEILLE_ROOT}`, remplacé par
  `scripts/install.mjs` à l'installation ; dans un clone, c'est la racine du dépôt.
- Chaque profil a son propre artefact dashboard (sa base) et son dossier de
  travail, résolus par `scripts/veille-config.mjs` depuis
  `~/.veille-emploi/config.json`. **Aucune URL d'artefact en dur** dans le code
  ni les skills.
- `dashboard/index.html` est un modèle, publié une fois par profil. Il ne doit
  rien contenir de propre à un utilisateur : tout vient de la base.
- La structure de la base est décrite dans `docs/SCHEMA.md` — s'y référer avant
  toute lecture ou écriture plutôt que de deviner un nom de champ.
- Il n'y a **aucune tâche planifiée** : tout se déclenche à la main, en local.

Pour tester ses modifications : ouvrir Claude Code dans ce dossier (les skills
de `.claude/skills/` y sont chargées), ou fabriquer le zip (`npm run package`),
le dézipper et lancer son `veille-emploi/scripts/install.mjs` : c'est, sans
téléchargement, ce qu'obtiendra un utilisateur.

## Versions

- La version vit dans `package.json`, seule source. `npm version
  patch|minor|major` vérifie la branche (`scripts/release-check.mjs`), fabrique
  le zip, commite, tague `vX.Y.Z` et pousse ; `.github/workflows/release.yml`
  publie alors la Release. Un tag avec tiret (`1.3.0-beta.1`) donne une
  pre-release, que `releases/latest` ne sert jamais.
- Les noms des assets ne changent jamais : les installeurs visent
  `releases/latest/download/veille-emploi.zip`.
- Ne jamais déplacer ni réutiliser un tag publié : une correction est une
  nouvelle version. Le rollback se fait sur GitHub (README, « Revenir en
  arrière »).
- Un changement de `docs/SCHEMA.md` doit rester lisible par la version
  précédente, ou être accompagné d'une migration : un rollback du code ne
  défait rien en base.

## Conventions

- Les scripts de `scripts/` produisent du JSON sur stdout ou dans un fichier et
  n'écrivent **jamais** en base : c'est Claude qui appelle `ArtifactData`. Garder
  cette séparation.
- Toute écriture sur un document déjà lu porte `if_version`, sinon le lot entier
  est refusé. Les lots font 50 écritures au maximum.
- Passer par `prepare-db.mjs` pour écrire des offres : il produit un fichier par
  document, ce qui évite de recopier des centaines de champs dans un appel.
- N'écrire en base que des URLs `http(s)`. Le dashboard valide déjà le schéma
  avant de produire un `href` (un `javascript:` échappé resterait exécutable),
  mais une URL douteuse n'a rien à faire en base pour autant.
- L'onglet Candidater du dashboard embarque un résumé des règles CV
  (`CV_RULES`, `LETTER_RULES`, `MAIL_RULES` dans `dashboard/index.html`). Toute
  modification de `docs/CV-RULES.md` ou de la skill `cv` se reporte là aussi.
- Les capacités déclarées à la publication du dashboard sont listées dans
  `docs/CONTEXTE.md` ; une nouvelle capacité utilisée par la page s'y ajoute.
- Playwright est importé paresseusement : une source HTTP ne doit jamais
  dépendre de la présence de Chromium.
- Commentaires et messages de commit en anglais ; interface, contenu et échanges
  avec l'utilisateur en français.
- `db-writes/`, `cv/`, `.veille-tmp/` et `.veille-cache/` sont des dossiers de
  travail, ignorés par git. Chez un utilisateur, ils vivent dans le dossier de travail du profil.

## Ce qui est hors limites

- Ne pas tenter de contourner un CAPTCHA interactif ni un mur d'authentification
  pour ajouter une source. Une source qui l'exige reste dehors.
- Ne jamais fabriquer une date de publication pour faire entrer une offre dans la
  fenêtre : la confiance (`exact` / `approx` / `unknown`) doit rester honnête.
- Ne jamais inventer un élément de profil, un chiffre de résultat ou une
  compétence dans un CV. Signaler le manque plutôt que le combler.
