---
name: veille-scrape
description: Scrape les sources d'offres d'emploi actives, classe les nouvelles offres par adéquation avec le profil, et remplit le dashboard « Veille Emploi ». Utiliser quand l'utilisateur veut rafraîchir sa veille, chercher de nouvelles offres, ou lancer un scraping.
---

# Rafraîchir la veille

Argument optionnel : l'identifiant d'une recherche (`achats`, `commercial`).
Sans argument, traite toutes les recherches dont `active` est vrai — **toutes
ensemble**, pas l'une après l'autre.

**Profil actif** : `node "${VEILLE_ROOT}/scripts/veille-config.mjs"` donne
`artifactUrl` (notée URL ci-dessous) et `workspace` (noté `<W>`) ; code de sortie
3 = aucun profil, propose `/veille-demarrer` et arrête-toi. Règles communes :
`${VEILLE_ROOT}/docs/CONTEXTE.md`. Schéma :
`${VEILLE_ROOT}/docs/SCHEMA.md`.

Annonce brièvement ce que tu lances, puis enchaîne sans demander de validation
intermédiaire.

**Vitesse.** Le temps d'un passage se perd surtout en attentes et en relectures.
Trois règles :

- Lance **en parallèle** tout ce qui ne dépend pas d'un résultat précédent :
  plusieurs appels d'outils dans le même message (lectures `ArtifactData`,
  lots d'écritures indépendants), deux scripts en même temps.
- **Ne relis jamais toute la base.** Les offres connues sont dans l'index
  `seen/<id>`, un seul document ; les autres lectures sont ciblées (`where`).
- Lis les documents nombreux avec `out_dir`, jamais dans la conversation.

## 1. Tout lire d'un coup

Dans **un seul message**, avec `out_dir` `<W>/.veille-tmp` :

- `ArtifactData` `list` sur `searches` ;
- `ArtifactData` `list` sur `profile` (sans `out_dir` : il sert au classement) ;
- `ArtifactData` `list` sur `cvs` ;
- pour chaque recherche à traiter, `get` sur `seen/<id>` et sur `dismissed/<id>`
  (absents la première fois : ce n'est pas une erreur).

Retiens pour chaque recherche : `code`, `queries`, `locations`, `contracts`,
`excludeKeywords`, `maxDays`, `nextRef`, `sources`, `positioning`, et la
`version` du document. Retiens aussi la version de `seen/<id>` s'il existe.

Les fichiers atterrissent dans `<W>/.veille-tmp/<collection>/<doc_id>.json`.

Si aucune recherche n'existe, arrête-toi et propose `/veille-demarrer`.

**Amorçage, une seule fois par recherche.** Si `seen/<id>` n'existe pas encore,
construis-le depuis la base : `ArtifactData` `query` sur `offers`, `where`
`searchId == <id>`, `limit` 1000, `out_dir` `<W>/.veille-tmp/known/<id>`, en
suivant `next_cursor` jusqu'au bout. Ce dossier remplace `seen` partout
ci-dessous (option `--known`), et `prepare-db.mjs` en tirera le premier
`seen/<id>`. Les passages suivants n'auront plus à relire les offres.

## 2. Scraper et vérifier les fermetures, en même temps

Écris une configuration par recherche dans `<W>/.veille-tmp/config-<id>.json` :
`searchId`, `maxDays`, `maxPages` (4), `queries`, `locations`,
`excludeKeywords`, `contracts`, `sources` — en recopiant `lastScrapeAt` de
chaque source, c'est lui qui borne la fenêtre. Ne laisse jamais `contracts`
vide quand la recherche en a.

Puis lance les deux scripts **simultanément** (deux appels Bash en arrière-plan
dans le même message, ou `&` puis `wait`) :

```
node "${VEILLE_ROOT}/scripts/scrape.mjs" \
  --config "<W>/.veille-tmp/config-achats.json" --config "<W>/.veille-tmp/config-commercial.json" \
  --known "<W>/.veille-tmp/seen/achats.json" --known "<W>/.veille-tmp/dismissed/achats.json" \
  --known "<W>/.veille-tmp/seen/commercial.json" --known "<W>/.veille-tmp/dismissed/commercial.json" \
  --out-dir "<W>/.veille-tmp/run"

node "${VEILLE_ROOT}/scripts/check-open.mjs" \
  --ids "<W>/.veille-tmp/seen/achats.json" --ids "<W>/.veille-tmp/seen/commercial.json" \
  --cache "<W>/.veille-cache/checks.json" --out "<W>/.veille-tmp/closed.json"
```

(Un `--known` / `--ids` par fichier qui existe ; à l'amorçage, le dossier
`known/<id>` à la place de `seen/<id>.json`.)

`scrape.mjs` interroge toutes les sources en parallèle, pour toutes les
recherches, et écrit `run/run-<id>.json` par recherche. Il écarte de lui-même :

- les offres **déjà connues** (`known`), avant toute requête supplémentaire ;
- les offres dont le contrat est connu et absent de `contracts`
  (`wrongContract`) ;
- les **offres d'école** (`schoolAds`) : une « alternance » publiée par une école
  ou un organisme de formation, ou dont le titre vend un diplôme. La liste vit
  dans `scripts/lib/normalize.mjs` ; complète-la quand tu en croises une.

La fenêtre part du dernier passage de chaque source, plafonnée à `maxDays`.
Une source sans date exploitable (Indeed) n'est jamais écartée par la fenêtre :
c'est l'index `seen` qui garantit la nouveauté.

`check-open.mjs` revérifie les offres LinkedIn et Hellowork déjà en base. Son
cache local (`<W>/.veille-cache/`, jamais nettoyé) évite de redemander : une
offre vue ouverte n'est revérifiée qu'après 3 jours, une offre fermée ou purgée
jamais. Il abandonne une source qui se met à refuser les requêtes
(`abandoned`) et ne ferme jamais une offre sur une supposition.

**Pendant que les scripts tournent**, lance les lectures de la purge (étape 5),
qui n'en dépendent pas.

Si une source échoue (`ok: false`), continue avec les autres et signale-le à la
fin. Un CAPTCHA (APEC aujourd'hui) ne se contourne pas : propose de désactiver
la source (`sources.<source>.enabled: false`) tant que ça dure. Un autre échec
isolé veut souvent dire qu'un sélecteur a changé : `/veille-source` sert à le
diagnostiquer.

## 3. Classer les nouvelles offres

Pour chaque recherche :

```
node "${VEILLE_ROOT}/scripts/prepare-db.mjs" --report "<W>/.veille-tmp/run/run-<id>.json" --list
```

imprime une ligne par offre nouvelle (docId, titre, entreprise, lieu, contrats
détectés, libellé, salaire). Classe à partir de cette liste, sans ouvrir de
fichier par offre.

**Si le profil est vide**, ne classe pas : passe directement à l'étape 4 sans
`--tiers`, les offres arriveront « Non classées », et signale qu'un
`/veille-profil` débloquera le classement. Ne devine pas un profil.

Sinon, attribue à chaque offre, d'après `profile/*` et le `positioning` :

- **`cible`** — la fonction correspond à la cible, le niveau de séniorité est
  compatible avec le profil, le lieu convient, et les contrats détectés
  contiennent un des `contracts` de la recherche. Un contrat inconnu (`?`)
  n'est **jamais** `cible`.
- **`possible`** — bonne fonction mais lieu imparfait, ou fonction adjacente
  qui reste atteignable, ou contrat inconnu sans indice contraire.
- **`hors`** — autre métier, niveau clairement hors de portée, contrat inconnu
  que le titre contredit pour une recherche de stage ou d'alternance
  (« confirmé », « senior », « responsable », « manager », « X ans
  d'expérience »), ou offre d'école passée au travers du filtre (ajoute alors
  l'annonceur à `normalize.mjs`).

**Une offre `hors` n'est pas écrite en base.** Elle rejoint seulement l'index
`seen`, pour ne jamais revenir ni être relue. Ne classe donc `hors` que ce qui
l'est clairement ; dans le doute, `possible`.

Pour `cible` et `possible`, un `rationale` d'une phrase (140 caractères
maximum) qui nomme **ce qui correspond et ce qui manque**, avec les termes de
l'offre et du profil. Ne déduis jamais un contrat que ni le titre ni le libellé
ne donnent : quand il est inconnu, le `rationale` dit « contrat non précisé ».
Pas de `rationale` pour `hors`.

Écris le classement dans `<W>/.veille-tmp/tiers-<id>.json` :

```json
{"linkedin_123": {"tier": "cible", "rationale": "…"}, "indeed_ab12": "hors"}
```

En cas de gros volume, classe en priorité les offres dont le titre est
plausible : une offre absente du fichier est écrite non classée, jamais perdue.

## 4. Écrire en base

```
node "${VEILLE_ROOT}/scripts/prepare-db.mjs" --report "<W>/.veille-tmp/run/run-<id>.json" \
  --search <id> --code <CODE> --next-ref <nextRef> --tiers "<W>/.veille-tmp/tiers-<id>.json" \
  --seen "<W>/.veille-tmp/seen/<id>.json" --seen-version <version de seen/<id>> \
  --dismissed "<W>/.veille-tmp/dismissed/<id>.json" --out "<W>/db-writes/<id>"
```

(À l'amorçage : `--known "<W>/.veille-tmp/known/<id>"` et ni `--seen` ni
`--seen-version`.)

Le script attribue les références aux seules offres écrites (`ACH-042`), y
inscrit `tier` et `rationale` — aucune mise à jour à faire ensuite — et ajoute
au dernier lot l'écriture de `seen/<id>`. Exécute les lots avec `ArtifactData`
`batch`, **tous dans le même message** : ils touchent des documents distincts.
Les entrées pointent vers des fichiers, ne recopie pas les offres dans l'appel.

## 5. Fermées et purge

Lectures, à lancer pendant l'étape 2, toutes dans le même message, avec
`out_dir` :

- `query` sur `offers`, `where` `scrapedAt < <maintenant − 21 jours, ISO>`,
  `limit` 1000 → `<W>/.veille-tmp/purge/old` ;
- `query` sur `offers`, `where` `tier == hors`, `limit` 1000 →
  `<W>/.veille-tmp/purge/hors` (les offres `hors` écrites avant ce
  fonctionnement ; vide ensuite).

Une fois `closed.json` produit, s'il liste des offres : `query` sur `offers`,
`where` `externalId in [...]` (30 identifiants par requête) →
`<W>/.veille-tmp/purge/closed`.

Puis :

```
node "${VEILLE_ROOT}/scripts/purge-plan.mjs" \
  --offers "<W>/.veille-tmp/purge/old" --offers "<W>/.veille-tmp/purge/hors" --offers "<W>/.veille-tmp/purge/closed" \
  --closed "<W>/.veille-tmp/closed.json" --cvs "<W>/.veille-tmp/cvs" --cache "<W>/.veille-cache/checks.json"
```

Il applique la politique de la skill `purge` et imprime `deletes` (à
supprimer) et `markClosed` (offres fermées mais protégées : candidature
envoyée ou CV produit). Exécute, par lots de 50 envoyés dans le même message :

- `op: "delete"` pour chaque `deletes` ;
- `op: "update"`, `data: {closed: true, closedAt, closedReason}` pour chaque
  `markClosed` — ne touche pas à `status`.

Chaque écriture porte `if_version` : la version que le listing de la lecture
affiche à côté du doc_id. Ne demande pas de confirmation, c'est ce qui garde la
base sous le plafond de 5000 documents. Une offre supprimée reste dans `seen` :
elle ne reviendra pas.

## 6. Mettre à jour les recherches

`ArtifactData` `update` sur chaque `searches/<id>` (dans le même message), avec
`if_version` (la version lue à l'étape 1) :

- `sources.<source>.lastScrapeAt` = `runAt` du rapport, pour chaque source qui a
  réussi — ne touche pas à celles qui ont échoué, sinon leur fenêtre avance
  alors qu'elles n'ont rien ramené.
- `sources.<source>.lastCount` = `kept` du rapport.
- `nextRef` = `next_ref_apres` imprimé par `prepare-db.mjs`.

## 7. Rendre compte

Un tableau compact : source, offres retenues, déjà connues, état, durée
(`durationMs`). Puis, par recherche : nouveautés écrites, répartition
`cible` / `possible` / non classées, nombre de `hors` écartées sans écriture,
références attribuées (`ACH-105 → ACH-131`), offres fermées, purge en une ligne,
et la durée totale du passage. Enfin les cibles les plus intéressantes en deux
ou trois lignes — **les plus récentes d'abord** (`postedAt`, à défaut
`scrapedAt`), jamais une offre fermée. Rappelle que `/veille-cv <ref>` ou
l'onglet Candidater génère un CV adapté.

Termine en affichant le dashboard : outil `Artifact`, `action: "open"`, avec
l'URL. L'utilisateur vient de déclencher un scraping, il veut en voir le
résultat sans avoir à retrouver le lien.

Nettoie `<W>/.veille-tmp/` en fin de course (pas `<W>/.veille-cache/`).
