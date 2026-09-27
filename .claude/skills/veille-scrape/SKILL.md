---
name: veille-scrape
description: Scrape les sources d'offres d'emploi actives, classe les nouvelles offres par adéquation avec le profil, et remplit le dashboard « Veille Emploi ». Utiliser quand l'utilisateur veut rafraîchir sa veille, chercher de nouvelles offres, ou lancer un scraping.
---

# Rafraîchir la veille

Argument optionnel : l'identifiant d'une recherche (`achats`, `commercial`).
Sans argument, traite toutes les recherches dont `active` est vrai.

Constantes : artefact `https://claude.ai/artifact/Wk81s5tNtTEtmydfobfjcx`,
racine du projet = ce dépôt. Le schéma de la base est dans `docs/SCHEMA.md` —
le lire si un champ est incertain.

Annonce brièvement ce que tu lances, puis enchaîne sans demander de validation
intermédiaire. Travaille les recherches une par une.

## 1. Lire la configuration

`ArtifactData` `list` sur `searches`. Retiens pour chaque recherche à traiter :
`code`, `queries`, `locations`, `excludeKeywords`, `maxDays`, `nextRef`,
`sources`, et la `version` du document (nécessaire plus bas).

Si aucune recherche n'existe, arrête-toi et propose `/veille-profil`, qui crée
la première.

## 2. Lancer le scraping

Écris la configuration dans `.veille-tmp/config-<id>.json` avec les champs
`searchId`, `maxDays`, `maxPages` (4), `queries`, `locations`,
`excludeKeywords`, `sources` — en recopiant `lastScrapeAt` de chaque source,
c'est lui qui borne la fenêtre.

```
node scripts/scrape.mjs --config .veille-tmp/config-<id>.json --out .veille-tmp/run-<id>.json
```

La fenêtre part du dernier passage de chaque source, plafonnée à `maxDays`.
Elle est volontairement souple : une source qui ne publie pas de date
exploitable (Indeed) n'est jamais écartée par la fenêtre, c'est le
dédoublonnage qui garantit la nouveauté.

Si une source échoue (`ok: false` dans le rapport), continue avec les autres et
signale-le à la fin — un échec isolé veut souvent dire qu'un sélecteur a changé,
et `/veille-source` sert à le diagnostiquer.

## 3. Ne garder que les nouveautés

Récupère les identifiants déjà en base sans en charger le contenu :

`ArtifactData` `query` sur `offers`, `where` `searchId == <id>`,
`out_dir` `.veille-tmp/known-<id>` — les documents sont écrits en fichiers dont
le nom est le `doc_id`, ce qui suffit.

```
node scripts/prepare-db.mjs --report .veille-tmp/run-<id>.json --search <id> \
  --code <CODE> --next-ref <nextRef> --known .veille-tmp/known-<id> --out db-writes
```

Le script attribue les références (`ACH-042`), écrit un fichier JSON par offre
nouvelle, et imprime les lots à passer tels quels dans `writes`. Exécute chaque
lot avec `ArtifactData` `batch`. Les entrées pointent vers des fichiers, ne
recopie pas les offres dans l'appel.

S'il n'y a aucune nouveauté, dis-le et passe à l'étape 6.

## 4. Classer les nouvelles offres

Lis `profile/experiences`, `profile/formation`, `profile/skills`,
`profile/aspirations`, plus le `positioning` de la recherche.

**Si le profil est vide**, laisse `tier` à `null` : les offres apparaîtront sous
« Non classées » et tu signaleras qu'un `/veille-profil` débloquera le
classement. Ne devine pas un profil.

Sinon, lis les fichiers de `db-writes/` (titre, entreprise, lieu, contrat,
salaire) et attribue à chaque offre :

- **`cible`** — la fonction correspond à la cible, le niveau de séniorité est
  compatible avec le profil, le lieu et le type de contrat conviennent.
- **`possible`** — correspondance partielle : bonne fonction mais contrat ou
  lieu imparfait, ou fonction adjacente qui reste atteignable.
- **`hors`** — autre métier, ou niveau clairement hors de portée.

Avec un `rationale` d'une phrase (140 caractères maximum) qui nomme **ce qui
correspond et ce qui manque**, jamais un commentaire vague. Utilise les termes
de l'offre et du profil, pas des généralités.

Écris par lots de 50 : `op: "update"`, `data: {tier, rationale}`, avec
`if_version` à la version rendue par le lot de l'étape 3 (1 pour une offre qui
vient d'être créée).

En cas de gros volume, classe en priorité les offres dont le titre est
plausible ; il vaut mieux 30 offres bien classées que 100 classées à la va-vite.

## 5. Purger

Applique la politique décrite dans la skill `veille-purge` (offres anciennes
non retenues). Fais-le sans le demander, c'est ce qui garde la base sous le
plafond de 5000 documents.

## 6. Mettre à jour la recherche

`ArtifactData` `update` sur `searches/<id>` avec `if_version` (la version lue à
l'étape 1) :

- `sources.<source>.lastScrapeAt` = `runAt` du rapport, pour chaque source qui a
  réussi — ne touche pas à celles qui ont échoué, sinon leur fenêtre avance
  alors qu'elles n'ont rien ramené.
- `sources.<source>.lastCount` = nombre retenu.
- `nextRef` = `next_ref_apres` imprimé par `prepare-db.mjs`.

## 7. Rendre compte

Un tableau compact : source, offres retenues, état. Puis le nombre de
nouveautés, la répartition par niveau, les références attribuées (`ACH-105 →
ACH-131`), ce qui a été purgé, et les cibles les plus intéressantes en deux ou
trois lignes. Termine par le lien du dashboard et le rappel que
`/veille-cv <ref>` génère un CV adapté.

Nettoie `.veille-tmp/` en fin de course.
