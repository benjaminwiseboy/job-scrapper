# Contexte du projet

Assistant de recherche d'emploi, distribué comme **plugin Claude Code**
(`veille`, catalogue `veille-emploi`). Ce fichier sert à qui travaille sur le
dépôt : un plugin ne charge pas le `CLAUDE.md` de sa racine. Les règles que les
commandes doivent suivre chez l'utilisateur vivent dans `docs/CONTEXTE.md`, que
chaque skill cite — c'est là qu'il faut les modifier.

- Les commandes sont les skills de `skills/<nom>/SKILL.md`, invoquées
  `/veille:<nom>`. Elles référencent les fichiers du plugin par
  `${CLAUDE_PLUGIN_ROOT}`, substitué au chargement.
- Chaque profil a son propre artefact dashboard (sa base) et son dossier de
  travail, résolus par `scripts/veille-config.mjs` depuis
  `~/.veille-emploi/config.json`. **Aucune URL d'artefact en dur** dans le code
  ni les skills.
- `dashboard/index.html` est un modèle, publié une fois par profil. Il ne doit
  rien contenir de propre à un utilisateur : tout vient de la base.
- La structure de la base est décrite dans `docs/SCHEMA.md` — s'y référer avant
  toute lecture ou écriture plutôt que de deviner un nom de champ.
- Il n'y a **aucune tâche planifiée** : tout se déclenche à la main, en local.

Pour tester ses modifications : `claude plugin marketplace add ./` puis
`claude plugin install veille@veille-emploi` (chargé en place), ou
`claude --plugin-dir .`. Valider avec `claude plugin validate .` — l'avertissement
sur ce `CLAUDE.md` est attendu.

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
- `db-writes/`, `cv/` et `.veille-tmp/` sont des dossiers de travail, ignorés par
  git. Chez un utilisateur, ils vivent dans le dossier de travail du profil.

## Ce qui est hors limites

- Ne pas tenter de contourner un CAPTCHA interactif ni un mur d'authentification
  pour ajouter une source. Une source qui l'exige reste dehors.
- Ne jamais fabriquer une date de publication pour faire entrer une offre dans la
  fenêtre : la confiance (`exact` / `approx` / `unknown`) doit rester honnête.
- Ne jamais inventer un élément de profil, un chiffre de résultat ou une
  compétence dans un CV. Signaler le manque plutôt que le combler.
