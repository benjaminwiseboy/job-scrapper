---
name: veille-purge
description: Nettoie les anciennes offres non retenues de la base du dashboard « Veille Emploi » pour rester sous le plafond de documents. Utiliser quand l'utilisateur veut purger, nettoyer ou archiver sa base d'offres.
---

# Purger les anciennes offres

La base d'un artefact plafonne à **5000 documents**. À une centaine d'offres par
passage, on sature en quelques mois : la purge n'est pas un luxe, c'est ce qui
empêche le système de mourir silencieusement.

`/veille-scrape` l'applique automatiquement à chaque passage. Cette commande
existe pour la lancer à la main ou pour un nettoyage plus agressif.

Artefact `https://claude.ai/artifact/Wk81s5tNtTEtmydfobfjcx`.

## Politique

Ancienneté mesurée sur `scrapedAt` (ou `postedAt` s'il est plus récent).

**Toujours conservé, quel que soit l'âge :**

- `status` = `applied` ou `answered` — c'est l'historique de candidature, il
  alimente les KPIs.
- Toute offre citée dans la collection `cvs` : un CV a été produit pour elle.

**Supprimé :**

| Cas | Seuil |
|---|---|
| `tier` = `hors` | 14 jours |
| `tier` = `null` (jamais classée) | 21 jours |
| `status` = `rejected` | 21 jours |
| `tier` = `possible`, `status` ∈ {`new`, `seen`} | 45 jours |
| `tier` = `cible`, `status` ∈ {`new`, `seen`} | 60 jours |

Une cible qu'on n'a pas touchée en deux mois n'est plus une cible : l'annonce
est de toute façon expirée.

## Procédure

1. Lis toute la collection : `ArtifactData` `query` sur `offers` avec
   `out_dir .veille-tmp/purge` pour ne pas charger le contenu dans la
   conversation, puis inspecte les fichiers.
2. Lis `cvs` pour constituer la liste des `offerDocId` protégés.
3. Établis la liste à supprimer selon la politique ci-dessus.
4. Supprime par lots de 50 (`op: "delete"`), en épinglant `if_version` — la
   version figure dans chaque fichier lu.
5. Nettoie `.veille-tmp/`.

## Rendre compte

Le nombre supprimé par motif, le nombre conservé, et le total de documents
restants rapporté au plafond. Si on dépasse 4000 documents, dis-le clairement et
propose de durcir les seuils : c'est le moment d'agir, pas à 4900.

Quand cette commande tourne dans le cadre d'un `/veille-scrape`, résume-la en une
seule ligne dans le rapport final — pas besoin d'un détail complet à chaque
passage.
