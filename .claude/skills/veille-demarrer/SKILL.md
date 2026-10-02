---
name: demarrer
description: Onboarding de Veille Emploi — vérifie l'installation, crée le dashboard d'un nouveau profil, pré-remplit le profil depuis un CV ou un export LinkedIn, définit les objectifs (stage, alternance, CDI…) et les métiers visés, puis lance le premier scraping. Utiliser à la première utilisation, quand l'utilisateur demande par où commencer ou comment utiliser l'outil, ou veut créer un nouveau profil de recherche.
---

# Démarrer — onboarding guidé

But : qu'en une quinzaine de minutes l'utilisateur ait un dashboard à son nom,
un profil exploitable, des recherches configurées et une première vague
d'offres classées. Lis d'abord `${CLAUDE_PLUGIN_ROOT}/docs/CONTEXTE.md` (règles
communes, profil actif) et garde `${CLAUDE_PLUGIN_ROOT}/docs/SCHEMA.md` sous la
main.

Ton : accueillant et concret, en français, tutoiement. Annonce les étapes au
départ (installation → profil → objectifs → premier scraping) et dis à chaque
fois où on en est. L'utilisateur peut s'arrêter à tout moment : tout ce qui est
validé est enregistré aussitôt, `/veille:demarrer` reprend là où on s'est
arrêté.

## 1. Vérifier l'installation

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs"
```

- `node.ok` faux : Node 18 ou plus est requis. Explique comment l'installer
  (https://nodejs.org, version LTS) et arrête-toi.
- `deps` faux : lance `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" --install-deps`.
- `chromium` faux : demande (`AskUserQuestion`) s'il faut l'installer
  maintenant — un navigateur sans interface d'environ 150 Mo, téléchargé une
  fois par machine, qui débloque Indeed, Météojob, l'APEC et l'export PDF des
  CV. Sans lui, LinkedIn et Hellowork fonctionnent quand même. Si oui :
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" --install-browser` (une à deux
  minutes).

**Profils existants** (`profiles` non vide) : demande si l'on crée un nouveau
profil — pour une autre recherche, ou pour quelqu'un d'autre — ou si l'on
continue avec un profil existant. Dans le second cas, montre la liste, oriente
vers `/veille:scrape`, `/veille:profil` ou `/veille:profils`, et arrête-toi.

**Aucun profil local, mais peut-être des dashboards sur le compte** (nouvelle
machine) : `Artifact` `action: "list"` et cherche des artefacts intitulés
« Veille Emploi ». S'il y en a, propose de les rebrancher plutôt que d'en créer
un nouveau — suis alors la section « Rebrancher » de
`${CLAUDE_PLUGIN_ROOT}/skills/profils/SKILL.md`.

## 2. Créer le dashboard du profil

Demande le prénom (et, s'il y aura plusieurs profils, un nom court pour
celui-ci : « Camille — alternance »). Déduis-en :

- `id` : le prénom en minuscules sans accents, suffixé si déjà pris
  (`camille`, `camille-alternance`) ;
- `label` : « Camille » ou « Camille — alternance ».

Publie le dashboard :

1. Copie `${CLAUDE_PLUGIN_ROOT}/dashboard/index.html` dans ton dossier
   scratchpad sous `veille-<id>.html`, en remplaçant
   `<title>Veille Emploi</title>` par `<title>Veille Emploi · <label></title>`.
   Ne change rien d'autre : le dashboard lit tout depuis sa base.
2. `Artifact` publish avec ce fichier, les `capabilities` données dans
   `CONTEXTE.md` (« Publier le dashboard »),
   `icon: "briefcase"`, et une `description` d'une phrase (« Recherche d'emploi
   de Camille : offres classées, CV, événements, profil »). Note l'URL rendue.
3. Enregistre le profil localement :

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/veille-config.mjs" add --id <id> --label "<label>" --url <URL>
node "${CLAUDE_PLUGIN_ROOT}/scripts/veille-config.mjs" set --dashboard-hash <dashboardHash de l'étape 1>
```

Le premier imprime le `workspace` (`<W>`), le dossier où arriveront les CV —
donne-le à l'utilisateur.

Précise en une phrase que le dashboard est **privé** : lui seul le voit tant
qu'il ne le partage pas, et le partager exposerait son profil.

## 3. Pré-remplir le profil

Demande (`AskUserQuestion`) ce dont il dispose : un CV, son profil LinkedIn, les
deux, ou rien. Pour LinkedIn, explique comment obtenir l'export : sur son
profil, bouton « Plus » sous la photo, puis « Enregistrer au format PDF » — ou à
défaut copier-coller les sections. N'ouvre jamais l'URL d'un profil LinkedIn :
elle est derrière une connexion.

Lis les documents fournis — un PDF ou un texte directement avec `Read` ; pour
un DOCX, extrais-en le texte, ou demande-le en PDF — et extrais, selon
`${CLAUDE_PLUGIN_ROOT}/docs/SCHEMA.md` :

- `profile/identity` — nom, intitulé, ville, langues, email et téléphone
  **seulement s'ils figurent dans le document** ;
- `profile/formation` — `items[]` ;
- `profile/experiences` — `items[]` en ordre chronologique inverse ; remplis
  `situation`, `task`, `action`, `result` avec ce que le document dit, et laisse
  vide ce qu'il ne dit pas — ne comble rien par déduction ;
- `profile/skills`.

Montre un récapitulatif compact (une ligne par expérience et par diplôme) et
fais valider ou corriger, puis écris ces documents en un `batch` (création :
pas d'`if_version` ; si un document existe déjà, lis-le et reprends sa
version).

**Sans document**, pose seulement l'essentiel, en deux ou trois messages : nom
et ville, formation en cours ou dernier diplôme, expériences (stages et
alternances compris) en une ligne chacune, trois à cinq compétences.

Ne mène pas ici l'entretien STAR complet : il prend du temps et n'est pas
nécessaire pour un premier classement. Note les manques les plus coûteux
(expériences sans résultat chiffré) pour les signaler à la fin.

## 4. Définir les objectifs de recherche

Trois questions, avec `AskUserQuestion` quand les options s'y prêtent :

1. **Types de contrat** (choix multiple) : Stage, Alternance, CDI, CDD — les
   autres (intérim, freelance, VIE) passent par « Autre ». Pour un stage ou une
   alternance, demande ensuite la date de début, la durée et, pour
   l'alternance, le rythme école/entreprise s'il est connu.
2. **Postes visés** (choix multiple) : propose deux à quatre métiers déduits du
   profil, formulés comme les annonces françaises les titrent (« Acheteur
   junior », « Chargé de recrutement », « Développeur front-end »), plus
   « Autre » pour en saisir. Chaque métier retenu deviendra une recherche.
3. **Lieux** : ville(s) et rayon acceptable, ou France entière, et le
   télétravail éventuel.

Complète `profile/aspirations` avec ces réponses (contrats, postes, lieux,
disponibilité, rythme), puis construis une recherche `searches/<id>` par métier
en suivant la section « Configurer les recherches » de
`${CLAUDE_PLUGIN_ROOT}/skills/profil/SKILL.md` : `label`, `code`, `queries`
déclinées par contrat, `locations`, `contracts`, `excludeKeywords`,
`positioning`, et les valeurs initiales qu'elle donne.

Présente toutes les recherches d'un bloc (libellé, requêtes, exclusions) et
fais valider avant d'écrire — c'est le réglage qui détermine la qualité de tout
ce qui suit.

## 5. Premier scraping

Annonce qu'il prend quelques minutes, puis déroule entièrement
`${CLAUDE_PLUGIN_ROOT}/skills/scrape/SKILL.md` pour toutes les recherches
actives (lis-la, ne la résume pas de mémoire). Si Chromium n'est pas installé,
les sources navigateur apparaîtront en échec : c'est attendu, dis-le
simplement.

## 6. Clore

Affiche le dashboard (`Artifact` `action: "open"` avec l'URL) et invite à ouvrir
l'onglet **Guide**, qui explique l'outil de bout en bout. Propose une fois de
l'épingler dans la barre latérale de claude.ai (`action: "pin"` sur un oui).

Termine par trois prochaines étapes, pas plus :

- **Trier les offres** dans le dashboard : « Postulé » ou « Écarter » ;
- **`/veille:profil`** pour compléter les expériences au format STAR — cite les
  manques relevés à l'étape 3 : c'est ce qui rend les CV adaptés percutants ;
- **`/veille:cv <référence>`** devant une offre « Cible ».

Rappelle qu'il n'y a pas de tâche planifiée : relancer `/veille:scrape` tous les
deux ou trois jours suffit, chaque passage repart du précédent.
