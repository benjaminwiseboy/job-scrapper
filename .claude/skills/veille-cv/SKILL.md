---
name: veille-cv
description: Génère un CV adapté à une offre précise du dashboard « Veille Emploi », à partir de sa référence courte (ex. ACH-042) ou de son URL. Utiliser quand l'utilisateur veut un CV sur mesure, adapter son CV à une annonce, ou postuler à une offre.
---

# Générer un CV adapté à une offre

Argument : une référence (`ACH-042`), ou une URL d'annonce, ou à défaut un
intitulé à retrouver. Artefact
`https://claude.ai/artifact/Wk81s5tNtTEtmydfobfjcx`, schéma dans
`docs/SCHEMA.md`.

## 1. Retrouver l'offre

`ArtifactData` `query` sur `offers`, `where` `ref == <REF>` (la casse compte,
normalise en majuscules). Si l'argument est une URL, cherche sur `url`. Si rien
ne correspond, propose les références proches plutôt que de deviner.

Si l'argument est une URL hors dashboard, travaille directement à partir de la
page : le CV reste générable, seule la trace en base portera une référence
vide.

## 2. Lire l'annonce en entier

La fiche en base ne contient que l'en-tête. Récupère le texte complet avec
`WebFetch` sur `url`. C'est indispensable : les compétences attendues, les
missions et le vocabulaire de l'annonce sont la matière de l'adaptation.

Si la page est inaccessible (annonce expirée, mur anti-bot), dis-le et propose
de continuer sur les seules informations en base — en signalant que
l'adaptation sera plus grossière.

## 3. Lire le profil et le positionnement

Tout `profile/*`, plus le `positioning` de la recherche
(`searches/<searchId>`). Si le profil est vide, arrête-toi : renvoie vers
`/veille-profil`, un CV inventé n'a aucune valeur.

## 4. Rédiger

Écris le CV en français, dans `cv/<REF>-<entreprise-slug>.md` puis une version
mise en page dans `cv/<REF>-<entreprise-slug>.html`. Crée `cv/` au besoin.

**Principes de fond**

- **Une page.** Pour un profil junior, deux pages desservent.
- **Miroir du vocabulaire de l'annonce.** Si elle dit « sourcing fournisseurs »,
  n'écris pas « recherche de partenaires ». Reprends ses termes exacts partout
  où ils décrivent vraiment ce que la personne a fait.
- **Accroche de deux ou trois lignes en tête**, qui nomme le poste visé et
  l'entreprise, et articule le profil vers ce poste précis. Jamais une formule
  passe-partout.
- **Ordre des expériences et des puces piloté par l'annonce** : ce que l'offre
  demande en premier remonte en premier. C'est là que se joue l'adaptation.
- **Chaque puce commence par un verbe d'action** et se termine, quand la matière
  existe, par un résultat chiffré tiré du bloc STAR.
- **Les chiffres estimés sont formulés comme tels** (« environ », « une
  quarantaine de ») — jamais présentés comme mesurés.
- **N'invente rien.** Aucune compétence, aucun chiffre, aucune expérience qui ne
  soit pas dans le profil. Si l'annonce demande quelque chose d'absent, ne le
  comble pas : signale-le à l'utilisateur en fin de course.

**Principes de forme** (lisibilité machine et humaine)

- Titres de sections standards et explicites : `Expériences professionnelles`,
  `Formation`, `Compétences`, `Langues`.
- Un seul flux de texte : pas de tableau, pas de colonnes, pas de zone de texte,
  rien en en-tête ni en pied de page.
- Pas d'icône à la place d'un mot : un intitulé écrit, pas un pictogramme.
- Ordre chronologique inverse, dates en clair (`sept. 2024 – févr. 2025`).
- Coordonnées en texte brut en haut.

La version HTML est faite pour être imprimée en PDF : une feuille A4, marges
raisonnables, police système, styles imprimables (`@page { margin: 16mm }`),
sans dépendance externe. Indique à l'utilisateur qu'il l'ouvre dans son
navigateur et imprime en PDF.

## 5. Enregistrer la trace

`ArtifactData` `set` sur `cvs/<REF>_<horodatage court>` :
`{offerRef, offerDocId, offerTitle, company, searchId, filePath, createdAt}`.
Cela alimente le compteur « CV générés » du dashboard.

Passe aussi l'offre en `status: "seen"` si elle était en `new` (avec
`if_version`) — l'utilisateur l'a manifestement regardée.

## 6. Rendre compte

Donne le chemin des deux fichiers, puis, en quelques lignes :

- **Les points forts** de la candidature, tels que l'annonce les valorise.
- **Les manques** : ce que l'offre demande et que le profil ne couvre pas. Sois
  franc, c'est ce qui permet de préparer l'entretien ou de renoncer.
- **Ce qu'il reste à faire** si une information manquait (un chiffre à
  confirmer, une date à vérifier).

Ne prétends pas évaluer un passage automatique d'ATS : aucun éditeur ne publie
ses règles, un pourcentage serait inventé. Signale en revanche tout écart réel
de forme ou de mots-clés que tu constates.
