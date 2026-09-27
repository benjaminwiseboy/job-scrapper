---
name: veille-events
description: Trouve les salons, job datings et forums de recrutement pertinents pour le profil et les remplit dans l'onglet Événements du dashboard « Veille Emploi ». Utiliser quand l'utilisateur cherche des événements emploi, des salons ou du job dating.
---

# Repérer les événements emploi

Il n'existe pas d'agrégateur propre des job datings et salons français : cette
commande s'appuie d'abord sur la recherche web, et sur les sources scrapables
qu'on a explicitement ajoutées. C'est assumé — un scraper dédié à ce terrain
serait en panne un mois sur deux.

Artefact `https://claude.ai/artifact/Wk81s5tNtTEtmydfobfjcx`, schéma dans
`docs/SCHEMA.md`.

## 1. Cadrer

Lis `searches` (métiers visés, lieux) et `profile/aspirations` (secteurs,
mobilité réelle). Sans recherche configurée, renvoie vers `/veille-profil`.

Un événement à l'autre bout du pays n'a d'intérêt que s'il est en ligne :
respecte la mobilité déclarée.

## 2. Chercher

`WebSearch`, plusieurs angles, en variant les formulations françaises :

- `salon recrutement <métier> <ville> <mois année>`
- `job dating <métier> <région>`
- `forum emploi <ville> <année>`
- `salon en ligne recrutement <secteur>`
- les organisateurs récurrents : événements emploi France Travail, Studyrama,
  forums des grandes écoles ouverts à l'extérieur, CCI et chambres de métiers,
  salons sectoriels métier.

Pour l'alternance et les stages, cherche aussi les forums de rentrée et les
salons d'alternance, qui suivent un calendrier scolaire.

Vérifie chaque piste avec `WebFetch` avant de l'enregistrer : date exacte,
lieu, gratuité, public visé, inscription requise. **N'enregistre jamais un
événement dont tu n'as pas confirmé la date sur la page de l'organisateur** —
les listes d'annuaires traînent des éditions passées.

Écarte tout ce qui est déjà passé.

## 3. Sources ajoutées

Si `docs/EVENT-SOURCES.md` existe, il liste les sources scrapables validées par
`/veille-source` (Seekube ou autre). Lance leur script et fusionne les résultats.

Si l'utilisateur mentionne une source à ajouter, ne l'improvise pas ici :
renvoie vers `/veille-source <url>`, qui teste et prépare l'extracteur.

## 4. Écrire

Relis d'abord `events` pour ne pas créer de doublon (même titre, même date). Un
`doc_id` stable et lisible : `<organisateur-slug>-<AAAA-MM-JJ>`.

Champs : `{title, type, date, endDate, location, url, source, searchId, note,
status}`. `type` prend une valeur parlante (`salon`, `job dating`, `forum`,
`salon en ligne`). `note` dit en une phrase **pourquoi cet événement vaut le
déplacement pour ce profil** — quels recruteurs y sont, quel secteur.

Écris par lots de 50, `if_version` sur tout document déjà lu.

## 5. Rendre compte

Liste chronologique : date, événement, lieu, et l'intérêt en une ligne.
Distingue ce qui demande une inscription à ne pas manquer. Signale les angles de
recherche qui n'ont rien donné — c'est une information utile, pas un échec à
masquer.

Termine en affichant le dashboard : outil `Artifact`, `action: "open"`, avec
l'URL.
