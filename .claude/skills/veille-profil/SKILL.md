---
name: profil
description: Mène un entretien guidé au format STAR pour construire ou compléter le profil (formation, expériences, compétences, aspirations) stocké dans le dashboard « Veille Emploi ». Utiliser quand l'utilisateur veut définir, compléter ou corriger son profil, ou configurer une recherche.
---

# Construire le profil

Le profil sert deux usages, et c'est ce qui dicte le niveau de détail attendu :
il alimente le **classement des offres** et la **réécriture du CV**. Un profil
vague donne un classement inutile et un CV plat.

**Profil actif** : `node "${CLAUDE_PLUGIN_ROOT}/scripts/veille-config.mjs"` donne
`artifactUrl` (notée URL ci-dessous) et `workspace` (noté `<W>`) ; code de sortie
3 = aucun profil, propose `/veille:demarrer` et arrête-toi. Règles communes :
`${CLAUDE_PLUGIN_ROOT}/docs/CONTEXTE.md`. Schéma :
`${CLAUDE_PLUGIN_ROOT}/docs/SCHEMA.md`.

## Avant de poser la moindre question

Lis ce qui existe déjà : `ArtifactData` `list` sur `profile` et sur `searches`.
Ne repose jamais une question dont la réponse est déjà en base — récapitule au
contraire ce que tu sais et demande seulement à compléter.

**Demande d'abord si l'utilisateur a un CV ou un profil LinkedIn**, et propose
de le lire. Extraire un document puis combler les trous prend un quart d'heure ;
tout reconstruire par questions en prend deux. Sources acceptées :

- **Un CV** : un chemin vers un PDF, un DOCX ou un fichier texte (`Read`), ou le
  texte collé dans la conversation.
- **LinkedIn** : l'export PDF du profil — sur LinkedIn, bouton « Plus » sous la
  photo puis « Enregistrer au format PDF » — ou le texte des sections copiées-
  collées. N'essaie pas d'ouvrir l'URL d'un profil : LinkedIn la cache derrière
  une connexion, et on ne contourne pas un mur d'authentification.

Les deux se complètent : LinkedIn a souvent plus d'expériences, le CV plus de
détail. Extrais tout ce qu'ils contiennent, montre un récapitulatif à valider,
puis ne questionne que le manquant — en particulier les résultats chiffrés, qui
y sont presque toujours absents. Ce qui vient d'un document n'est pas vérifié
par toi : si deux sources se contredisent (dates, intitulé), demande.

## Conduite de l'entretien

Avance **par blocs**, en enregistrant après chaque bloc : l'utilisateur doit
pouvoir s'arrêter et reprendre plus tard sans rien perdre. Annonce combien de
blocs restent.

Pose **peu de questions à la fois** (trois ou quatre), précises, en langage
naturel. Jamais de questionnaire de quarante items d'un coup. Quand une réponse
est vague, relance une fois sur le point précis — c'est le cœur du travail.

### Bloc 1 — Identité et cadre

Nom, intitulé qui te décrit aujourd'hui, ville, mobilité géographique réelle
(prêt à déménager ? jusqu'où en transport ?), langues avec un niveau honnête,
permis si pertinent, email et téléphone tels qu'ils doivent figurer sur le CV.

→ `profile/identity`

### Bloc 2 — Formation

Pour chaque diplôme : intitulé exact, établissement, dates, spécialisation.
Puis ce qui est valorisable au-delà du diplôme : cours ou modules significatifs
pour la cible, projets concrets menés, mémoire et son sujet, mentions,
associations, échanges à l'étranger.

Une formation sans contenu explicité ne sert à rien dans un CV junior — c'est
souvent là qu'il y a de la matière inexploitée.

→ `profile/formation` avec `items[]`

### Bloc 3 — Expériences, au format STAR

Le bloc long. **Une expérience à la fois**, stages et alternances inclus (pour
un profil junior ce sont les plus utiles). Pour chacune :

- Cadre : entreprise, secteur, taille, intitulé du poste, dates, à qui tu
  rapportais.
- **Situation** — le contexte et l'enjeu : pourquoi ce poste existait, quel
  problème l'entreprise avait, quel était ton périmètre (budget, portefeuille,
  nombre de fournisseurs, de références, de clients).
- **Tâche** — de quoi tu étais responsable précisément, avec qui tu travaillais,
  quelle latitude tu avais.
- **Action** — ce que tu as fait concrètement, en verbes d'action : les outils
  et logiciels, les méthodes, les négociations menées, les analyses produites.
  Le détail compte ici, c'est la matière première du CV.
- **Résultat** — chiffré autant que possible : montants, pourcentages, délais,
  volumes, nombre de dossiers.

**Insiste sur le résultat.** C'est ce qui manque à presque tous les CV juniors
et ce qui fait la différence. C'est aussi ce que `/veille:cv` convertit ensuite
en puces au format X-Y-Z : le Résultat fournit le chiffre, l'Action la méthode,
la Situation l'échelle. Une expérience sans résultat ni volume ne produira
qu'une puce creuse — d'où l'insistance ici plutôt que plus tard. Si l'utilisateur n'a pas de chiffre, aide-le à en
reconstruire un par le raisonnement (« combien de fournisseurs dans ton
portefeuille ? sur quel volume d'achat ? »), et note-le comme une estimation
pour qu'on le formule prudemment plus tard. Ne fabrique jamais un chiffre
toi-même.

Termine chaque expérience par les compétences qu'elle démontre.

→ `profile/experiences` avec `items[]`, dans l'ordre chronologique inverse

### Bloc 4 — Compétences

Outils et logiciels (ERP, SAP, Excel niveau réel, outils métier), méthodes
maîtrisées, langues, certifications. Sépare ce qui est maîtrisé de ce qui a été
seulement approché — un CV qui surpromet se paie en entretien.

→ `profile/skills`

### Bloc 5 — Aspirations et cadre de recherche

Secteurs visés et secteurs refusés, taille d'entreprise souhaitée, ce qui
compte dans un poste, contraintes géographiques, fourchette de rémunération,
types de contrat recherchés, et ce qui serait un non catégorique.

→ `profile/aspirations`

## Configurer les recherches

À partir des aspirations, vérifie ou crée les documents `searches/<id>`. Pour
chacun, propose puis fais valider : `label`, `code` de trois lettres,
`queries` (les intitulés réellement employés par les annonces françaises, pas
un intitulé théorique — plusieurs variantes valent mieux qu'une), `locations`,
`contracts`, `excludeKeywords` pour écarter le bruit récurrent, et surtout le
`positioning` : deux ou trois phrases décrivant l'angle sous lequel réécrire le
CV pour cet objectif, et quelles expériences mettre en avant. C'est ce champ
que `/veille:cv` exploite.

Une recherche = **un métier visé** (une famille d'intitulés). Les contrats en
font partie, pas l'inverse : « Achats — stage & alternance » plutôt qu'une
recherche « stage » fourre-tout.

**`contracts`** — parmi `stage`, `alternance`, `cdi`, `cdd`, `interim`,
`freelance`, `vie`, `fonctionnaire` — ces clés exactement, en minuscules. Les
sources ne filtrent pas toutes par contrat : pour
`stage` et `alternance`, fais porter le mot aux requêtes (« stage acheteur »,
« alternance acheteur », « apprenti acheteur ») — c'est ainsi que les annonces
françaises sont titrées. Pour `cdi`/`cdd`, l'intitulé seul suffit, éventuellement
suivi de « junior » pour un profil débutant. Le scraping écarte ensuite toute
offre dont le contrat est connu et absent de `contracts` : n'y mets que ce que
l'utilisateur accepte vraiment.

**`excludeKeywords`** — pour un stage ou une alternance, écarte d'emblée
`senior`, `confirmé`, `manager`, `head of`, `directeur` ; pour un CDI junior,
au moins `senior` et `directeur`. Ajoute le bruit propre au métier
(« acheteur » ramène « acheteur immobilier » pour qui vise les achats
industriels).

Valeurs initiales d'une nouvelle recherche : `active: true`, `nextRef: 1`,
`maxDays: 14` (le premier passage ratisse deux semaines ; tu peux redescendre
à 7 ensuite), `sources` avec chaque source à `{enabled: true, lastScrapeAt:
null, lastCount: null}` — `linkedin`, `indeed`, `meteojob`, `apec`, `hellowork`.
Le `code` de trois lettres doit être unique parmi les recherches du profil.

Conserve `nextRef` et `sources` s'ils existent déjà ; ne les écrase pas.

## Écriture

Un `batch` par bloc, avec `if_version` sur tout document déjà lu. Pour les
tableaux `items[]`, réécris le document complet (`set`) plutôt que de tenter une
fusion partielle.

## En terminant

Récapitule ce qui est enregistré et ce qui reste creux (une expérience sans
résultat chiffré, une formation sans contenu). Si des offres sont déjà en base
et non classées, propose `/veille:scrape` pour les classer avec ce profil frais.

Affiche ensuite le dashboard : outil `Artifact`, `action: "open"`, avec l'URL —
l'onglet Profil montre ce qui vient d'être enregistré, et c'est là que
l'utilisateur vérifie que rien n'a été déformé.
