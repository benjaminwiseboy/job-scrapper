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

**Profil actif** : `node "${VEILLE_ROOT}/scripts/veille-config.mjs"` donne
`artifactUrl` (notée URL ci-dessous) et `workspace` (noté `<W>`) ; code de sortie
3 = aucun profil, propose `/veille-demarrer` et arrête-toi. Règles communes :
`${VEILLE_ROOT}/docs/CONTEXTE.md`. Schéma :
`${VEILLE_ROOT}/docs/SCHEMA.md`.

## Politique

Ancienneté mesurée sur `scrapedAt` (ou `postedAt` s'il est plus récent).

**Toujours conservé, quel que soit l'âge :**

- `status` = `applied` ou `answered` — c'est l'historique de candidature, il
  alimente les KPIs.
- Toute offre citée dans la collection `cvs` : un CV a été produit pour elle.

**Supprimé :**

| Cas | Seuil |
|---|---|
| `closed` = `true`, ou trouvée fermée par `check-open.mjs` | immédiatement |
| `tier` = `hors` | immédiatement |
| `tier` = `null` (jamais classée) | 21 jours |
| `status` = `rejected` | 21 jours |
| `tier` = `possible`, `status` ∈ {`new`, `seen`} | 45 jours |
| `tier` = `cible`, `status` ∈ {`new`, `seen`} | 60 jours |

Une cible qu'on n'a pas touchée en deux mois n'est plus une cible : l'annonce
est de toute façon expirée.

Les offres `hors` ne sont plus écrites en base depuis que `/veille-scrape`
classe avant d'écrire ; celles qui restent datent d'avant et partent sans
délai.

Une offre supprimée ne revient pas au scraping : son identifiant reste dans
l'index `seen/<searchId>`, que le scraping consulte avant d'écrire quoi que ce
soit — y compris pour Indeed, dont les offres n'ont pas de date exploitable.
Une offre écartée à la main (`rejected`) est donc protégée de tout retour sans
rien faire de plus ; le document `dismissed/<searchId>` reste lu pour les
décisions antérieures à `seen`, mais n'a plus besoin d'être alimenté.

## Procédure

Ne relis pas toute la collection : les lectures sont ciblées, et toutes
lancées dans le même message, avec `out_dir`.

1. `ArtifactData` :
   - `query` sur `offers`, `where` `scrapedAt < <maintenant − 21 jours, ISO>`,
     `limit` 1000 → `<W>/.veille-tmp/purge/old` ;
   - `query` sur `offers`, `where` `tier == hors`, `limit` 1000 →
     `<W>/.veille-tmp/purge/hors` ;
   - `query` sur `offers`, `where` `closed == true`, `limit` 1000 →
     `<W>/.veille-tmp/purge/closed` ;
   - `list` sur `cvs` → `<W>/.veille-tmp`.
2. Établis le plan :

   ```
   node "${VEILLE_ROOT}/scripts/purge-plan.mjs"      --offers "<W>/.veille-tmp/purge/old" --offers "<W>/.veille-tmp/purge/hors"      --offers "<W>/.veille-tmp/purge/closed" --cvs "<W>/.veille-tmp/cvs"      --cache "<W>/.veille-cache/checks.json"
   ```

   Dans `/veille-scrape`, ajoute `--closed` avec le rapport de `check-open.mjs`.
3. Supprime par lots de 50 (`op: "delete"`), tous dans le même message, en
   épinglant `if_version` — la version que le listing de lecture affiche à côté
   de chaque doc_id. Les éventuels `markClosed` deviennent des `op: "update"`
   `{closed: true, closedAt, closedReason}`.
4. Nettoie `<W>/.veille-tmp/` (pas `<W>/.veille-cache/`).

## Rendre compte

Le nombre supprimé par motif, le nombre conservé, et le total de documents
restants rapporté au plafond. Si on dépasse 4000 documents, dis-le clairement et
propose de durcir les seuils : c'est le moment d'agir, pas à 4900.

Quand cette commande tourne dans le cadre d'un `/veille-scrape`, résume-la en une
seule ligne dans le rapport final — pas besoin d'un détail complet à chaque
passage.
