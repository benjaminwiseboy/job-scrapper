---
name: profils
description: Gère les profils de Veille Emploi — un dashboard par profil — pour les lister, changer de profil actif, en créer un nouveau, rebrancher un dashboard existant sur une nouvelle machine, ou republier un dashboard après une mise à jour du plugin. Utiliser quand l'utilisateur veut changer de profil, gérer plusieurs recherches séparées, retrouver ses dashboards ou mettre à jour le dashboard.
---

# Gérer les profils

Un profil = un artefact dashboard (sa base de données) + un dossier de travail
local. Le registre local est tenu par
`node "${CLAUDE_PLUGIN_ROOT}/scripts/veille-config.mjs"` (`list`, `use`, `add`,
`set`, `remove`) ; règles communes dans `${CLAUDE_PLUGIN_ROOT}/docs/CONTEXTE.md`.

Argument facultatif : `nouveau`, `maj`, `rebrancher`, ou l'id d'un profil à
activer. Sans argument, commence par l'état des lieux.

## État des lieux

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs"
```

Montre un tableau compact : profil, actif ou non, dashboard à jour ou non,
dossier de travail. Puis propose ce qui a du sens (changer d'actif, mettre à
jour un dashboard en retard, créer un profil).

## Changer de profil actif

`veille-config.mjs use <id>`. Toutes les commandes `/veille:*` travaillent
ensuite sur ce profil. Confirme en une ligne, avec son libellé.

## Créer un nouveau profil

Déroule `${CLAUDE_PLUGIN_ROOT}/skills/demarrer/SKILL.md` à partir de l'étape 2 :
chaque profil a son propre artefact, ses propres données et ses propres
recherches. Utile pour séparer deux projets (un stage maintenant, un CDI
ensuite) ou pour accompagner quelqu'un d'autre.

Pour quelqu'un d'autre, précise que le dashboard appartient au compte Claude
qui le crée. Si la personne veut piloter sa recherche elle-même, le plus simple
est qu'elle installe le plugin sur son propre Claude Code.

## Rebrancher un dashboard existant

Les dashboards et leurs données vivent sur le compte Claude, seul le registre
est local : sur une nouvelle machine, il suffit de les rebrancher.

1. `Artifact` `action: "list"` ; retiens ceux intitulés « Veille Emploi ».
2. Pour chacun, `ArtifactData` `get` sur `profile/identity` pour montrer à qui
   il appartient, et fais choisir.
3. `veille-config.mjs add --id <id> --label "<label>" --url <URL>`.

Ne note pas `--dashboard-hash` : on ignore quelle version y est publiée, la
section suivante s'en chargera si l'utilisateur veut la dernière.

## Mettre à jour un dashboard

Nécessaire quand le plugin apporte une nouvelle version du dashboard
(`dashboardUpToDate: false`). Les données ne bougent pas : elles vivent dans la
base, pas dans la page.

1. `Artifact` `action: "read"` sur l'URL du profil — obligatoire avant de
   republier un artefact d'une autre conversation. Repère son `<title>`.
2. Copie `${CLAUDE_PLUGIN_ROOT}/dashboard/index.html` dans ton scratchpad sous
   `veille-<id>.html` en y reportant ce `<title>`.
3. `Artifact` publish avec ce fichier, `url` = l'URL du profil, les
   `capabilities` données dans `CONTEXTE.md` (« Publier le dashboard ») — les
   dashboards anciens ne déclarent que `db`, et l'onglet Candidater resterait
   inactif — et sans `icon`.
4. `veille-config.mjs set --profile <id> --dashboard-hash <dashboardHash>`.

## Oublier un profil

`veille-config.mjs remove <id>` retire le profil du registre local, sans
toucher à l'artefact ni aux fichiers. Supprimer l'artefact lui-même efface
définitivement ses données pour tout le monde : ne le fais que sur demande
explicite, après confirmation.
