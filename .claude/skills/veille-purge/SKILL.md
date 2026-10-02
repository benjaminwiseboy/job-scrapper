---
name: purge
description: Nettoie les anciennes offres non retenues de la base du dashboard « Veille Emploi » pour rester sous le plafond de documents. Utiliser quand l'utilisateur veut purger, nettoyer ou archiver sa base d'offres.
---

# Purger les anciennes offres

La base d'un artefact plafonne à **5000 documents**. À une centaine d'offres par
passage, on sature en quelques mois : la purge n'est pas un luxe, c'est ce qui
empêche le système de mourir silencieusement.

`/veille:scrape` l'applique automatiquement à chaque passage. Cette commande
existe pour la lancer à la main ou pour un nettoyage plus agressif.

**Profil actif** : `node "${CLAUDE_PLUGIN_ROOT}/scripts/veille-config.mjs"` donne
`artifactUrl` (notée URL ci-dessous) et `workspace` (noté `<W>`) ; code de sortie
3 = aucun profil, propose `/veille:demarrer` et arrête-toi. Règles communes :
`${CLAUDE_PLUGIN_ROOT}/docs/CONTEXTE.md`. Schéma :
`${CLAUDE_PLUGIN_ROOT}/docs/SCHEMA.md`.

## Politique

Ancienneté mesurée sur `scrapedAt` (ou `postedAt` s'il est plus récent).

**Toujours conservé, quel que soit l'âge :**

- `status` = `applied` ou `answered` — c'est l'historique de candidature, il
  alimente les KPIs.
- Toute offre citée dans la collection `cvs` : un CV a été produit pour elle.

**Supprimé :**

| Cas | Seuil |
|---|---|
| `closed` = `true` (offre pourvue ou retirée) | dès la purge suivante |
| `tier` = `hors` | 2 jours |
| `tier` = `null` (jamais classée) | 21 jours |
| `status` = `rejected` | 21 jours |
| `tier` = `possible`, `status` ∈ {`new`, `seen`} | 45 jours |
| `tier` = `cible`, `status` ∈ {`new`, `seen`} | 60 jours |

Une cible qu'on n'a pas touchée en deux mois n'est plus une cible : l'annonce
est de toute façon expirée.

Une offre fermée ne revient pas au scraping : les sources ne listent plus une
annonce qui n'accepte plus de candidatures. La supprimer ne risque donc pas de
la faire réapparaître comme une nouveauté.

Le délai court des offres `hors` est délibéré : elles ne servent qu'à vérifier
le classement du dernier passage, et au-delà elles noient le tableau. Une offre
purgée sans date exploitable (Indeed) peut revenir au scraping suivant ; elle
est alors reclassée, puis repurgée.

## Procédure

1. Lis toute la collection : `ArtifactData` `query` sur `offers` avec
   `out_dir <W>/.veille-tmp/purge` pour ne pas charger le contenu dans la
   conversation, puis inspecte les fichiers.
2. Lis `cvs` pour constituer la liste des `offerDocId` protégés.
3. Établis la liste à supprimer selon la politique ci-dessus.
4. **Avant de supprimer, conserve la trace des offres écartées à la main.**
   Pour toute offre en `status: "rejected"` sur le point d'être purgée, ajoute
   son `doc_id` au document `dismissed/<searchId>` (champ `ids`, un tableau).
   Lis-le d'abord, fusionne, réécris avec `if_version`.

   Sans cela, l'offre sort de la base, donc de la liste des identifiants connus,
   et le scraping suivant la réécrit comme une nouveauté : ta décision de
   l'écarter serait perdue. C'est surtout vrai pour Indeed, dont les offres n'ont
   pas de date exploitable et ne sont donc jamais filtrées par la fenêtre.

   Ne fais ce report que pour `rejected`. Une offre classée `hors` par la machine
   n'est pas une décision humaine : si elle revient, elle sera reclassée.
5. Supprime par lots de 50 (`op: "delete"`), en épinglant `if_version` — la
   version figure dans chaque fichier lu.
6. Nettoie `<W>/.veille-tmp/`.

## Rendre compte

Le nombre supprimé par motif, le nombre conservé, et le total de documents
restants rapporté au plafond. Si on dépasse 4000 documents, dis-le clairement et
propose de durcir les seuils : c'est le moment d'agir, pas à 4900.

Quand cette commande tourne dans le cadre d'un `/veille:scrape`, résume-la en une
seule ligne dans le rapport final — pas besoin d'un détail complet à chaque
passage.
