# Contexte du projet

Assistant de recherche d'emploi. Le dashboard est un artefact Claude qui sert
aussi de base de données : `https://claude.ai/artifact/Wk81s5tNtTEtmydfobfjcx`.
Sa structure est décrite dans `docs/SCHEMA.md` — s'y référer avant toute lecture
ou écriture plutôt que de deviner un nom de champ.

Les actions utilisateur passent par les commandes `/veille-*` définies dans
`.claude/skills/`. Il n'y a **aucune tâche planifiée** : tout se déclenche à la
main, en local.

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
- Commentaires et messages de commit en anglais ; interface, contenu et échanges
  avec l'utilisateur en français.
- `db-writes/`, `cv/` et `.veille-tmp/` sont des dossiers de travail, ignorés par
  git.

## Ce qui est hors limites

- Ne pas tenter de contourner un CAPTCHA interactif ni un mur d'authentification
  pour ajouter une source. Une source qui l'exige reste dehors.
- Ne jamais fabriquer une date de publication pour faire entrer une offre dans la
  fenêtre : la confiance (`exact` / `approx` / `unknown`) doit rester honnête.
- Ne jamais inventer un élément de profil, un chiffre de résultat ou une
  compétence dans un CV. Signaler le manque plutôt que le combler.
