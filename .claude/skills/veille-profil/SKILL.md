---
name: veille-profil
description: Mène un entretien guidé au format STAR pour construire ou compléter le profil (formation, expériences, compétences, aspirations) stocké dans le dashboard « Veille Emploi ». Utiliser quand l'utilisateur veut définir, compléter ou corriger son profil, ou configurer une recherche.
---

# Construire le profil

Le profil sert deux usages, et c'est ce qui dicte le niveau de détail attendu :
il alimente le **classement des offres** et la **réécriture du CV**. Un profil
vague donne un classement inutile et un CV plat.

Artefact : `https://claude.ai/artifact/Wk81s5tNtTEtmydfobfjcx`. Schéma dans
`docs/SCHEMA.md`.

## Avant de poser la moindre question

Lis ce qui existe déjà : `ArtifactData` `list` sur `profile` et sur `searches`.
Ne repose jamais une question dont la réponse est déjà en base — récapitule au
contraire ce que tu sais et demande seulement à compléter.

**Demande d'abord si l'utilisateur a un CV existant**, et propose de le lire
(`Read` sur un chemin, ou il le colle). Extraire un CV puis combler les trous
prend un quart d'heure ; tout reconstruire par questions en prend deux. Si un CV
est fourni, extrais tout ce qu'il contient, puis ne questionne que le manquant —
en particulier les résultats chiffrés, qui y sont presque toujours absents.

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
et ce qui fait la différence. Si l'utilisateur n'a pas de chiffre, aide-le à en
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
`excludeKeywords` pour écarter le bruit récurrent, et surtout le
`positioning` : deux ou trois phrases décrivant l'angle sous lequel réécrire le
CV pour cet objectif, et quelles expériences mettre en avant. C'est ce champ
que `/veille-cv` exploite.

Conserve `nextRef` et `sources` s'ils existent déjà ; ne les écrase pas.

## Écriture

Un `batch` par bloc, avec `if_version` sur tout document déjà lu. Pour les
tableaux `items[]`, réécris le document complet (`set`) plutôt que de tenter une
fusion partielle.

## En terminant

Récapitule ce qui est enregistré et ce qui reste creux (une expérience sans
résultat chiffré, une formation sans contenu). Si des offres sont déjà en base
et non classées, propose `/veille-scrape` pour les classer avec ce profil frais.
