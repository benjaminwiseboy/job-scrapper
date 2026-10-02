---
name: scrape
description: Scrape les sources d'offres d'emploi actives, classe les nouvelles offres par adéquation avec le profil, et remplit le dashboard « Veille Emploi ». Utiliser quand l'utilisateur veut rafraîchir sa veille, chercher de nouvelles offres, ou lancer un scraping.
---

# Rafraîchir la veille

Argument optionnel : l'identifiant d'une recherche (`achats`, `commercial`).
Sans argument, traite toutes les recherches dont `active` est vrai.

**Profil actif** : `node "${CLAUDE_PLUGIN_ROOT}/scripts/veille-config.mjs"` donne
`artifactUrl` (notée URL ci-dessous) et `workspace` (noté `<W>`) ; code de sortie
3 = aucun profil, propose `/veille:demarrer` et arrête-toi. Règles communes :
`${CLAUDE_PLUGIN_ROOT}/docs/CONTEXTE.md`. Schéma :
`${CLAUDE_PLUGIN_ROOT}/docs/SCHEMA.md`.

Annonce brièvement ce que tu lances, puis enchaîne sans demander de validation
intermédiaire. Travaille les recherches une par une.

## 1. Lire la configuration

`ArtifactData` `list` sur `searches`. Retiens pour chaque recherche à traiter :
`code`, `queries`, `locations`, `contracts`, `excludeKeywords`, `maxDays`,
`nextRef`, `sources`, et la `version` du document (nécessaire plus bas).

Si aucune recherche n'existe, arrête-toi et propose `/veille:demarrer`, qui
crée les premières à partir des objectifs de l'utilisateur.

## 2. Lancer le scraping

Écris la configuration dans `<W>/.veille-tmp/config-<id>.json` avec les champs
`searchId`, `maxDays`, `maxPages` (4), `queries`, `locations`,
`excludeKeywords`, `contracts`, `sources` — en recopiant `lastScrapeAt` de
chaque source, c'est lui qui borne la fenêtre. Ne laisse jamais `contracts`
vide quand la recherche en a : c'est lui qui écarte les contrats hors cible.

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/scrape.mjs" --config "<W>/.veille-tmp/config-<id>.json" --out "<W>/.veille-tmp/run-<id>.json"
```

La fenêtre part du dernier passage de chaque source, plafonnée à `maxDays`.
Elle est volontairement souple : une source qui ne publie pas de date
exploitable (Indeed) n'est jamais écartée par la fenêtre, c'est le
dédoublonnage qui garantit la nouveauté.

Le script écarte lui-même toute offre dont le contrat est connu et absent de
`contracts` (un CDI ou un stage pour une recherche d'alternance) : elle
n'arrive pas en base. Le rapport compte ces offres par source
(`wrongContract`) ; donne le total dans le bilan. Une offre au contrat inconnu
passe, avec `contractTypes` vide.

Il écarte aussi les **offres d'école** (`schoolAds`) : une « alternance »
publiée par une école ou un organisme de formation (ISCOD, AURLOM, MBway,
Icademie, une marque « Groupe Alternance »…) ou dont le titre vend un diplôme
(BTS, Bachelor, Mastère) n'est pas un emploi mais du recrutement d'étudiants.
La liste vit dans `scripts/lib/normalize.mjs` ; complète-la quand tu en croises
une nouvelle.

Si une source échoue (`ok: false` dans le rapport), continue avec les autres et
signale-le à la fin — un échec isolé veut souvent dire qu'un sélecteur a changé,
et `/veille:source` sert à le diagnostiquer.

## 3. Ne garder que les nouveautés

Récupère les identifiants déjà en base sans en charger le contenu :

`ArtifactData` `query` sur `offers`, `where` `searchId == <id>`,
`out_dir` `<W>/.veille-tmp/known-<id>` — les documents sont écrits en fichiers dont
le nom est le `doc_id`, ce qui suffit.

Lis aussi `dismissed/<id>` (`ArtifactData` `get`) et enregistre-le dans
`<W>/.veille-tmp/dismissed-<id>.json`. Ce document liste les offres que
l'utilisateur a écartées à la main et qui ont depuis été purgées : sans lui,
elles reviendraient comme des nouveautés. S'il n'existe pas, passe l'option.

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/prepare-db.mjs" --report "<W>/.veille-tmp/run-<id>.json" --search <id> \
  --code <CODE> --next-ref <nextRef> --known "<W>/.veille-tmp/known-<id>" \
  --dismissed "<W>/.veille-tmp/dismissed-<id>.json" --out "<W>/db-writes"
```

Le script attribue les références (`ACH-042`), écrit un fichier JSON par offre
nouvelle, et imprime les lots à passer tels quels dans `writes`. Exécute chaque
lot avec `ArtifactData` `batch`. Les entrées pointent vers des fichiers, ne
recopie pas les offres dans l'appel.

S'il n'y a aucune nouveauté, dis-le et passe à l'étape 3 bis.

## 3 bis. Écarter les offres fermées

Une offre déjà en base peut avoir été pourvue ou retirée depuis. Revérifie
celles de la recherche, à partir des fichiers lus à l'étape 3 :

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/check-open.mjs" --offers "<W>/.veille-tmp/known-<id>" --out "<W>/.veille-tmp/closed-<id>.json"
```

Seules LinkedIn (« Les candidatures ne sont plus acceptées », ou fiche
supprimée) et Hellowork (410) donnent un signal fiable ; les autres sources ne
sont pas vérifiées. Une réponse inexploitable laisse l'offre ouverte : le script
ne ferme jamais une offre sur une supposition, et il abandonne une source qui
se met à refuser les requêtes (`abandoned` dans le rapport).

Pour chaque entrée de `closed`, écris par lots de 50 `op: "update"`,
`data: {closed: true, closedAt: <checkedAt du rapport>, closedReason: <reason>}`
avec `if_version` (la version donnée par la lecture de l'étape 3). Ne touche pas
à `status` : une candidature envoyée reste `applied`, simplement marquée fermée.

Le dashboard masque ces offres ; ne les cite plus comme pistes dans le rapport.

## 4. Classer les nouvelles offres

Lis `profile/experiences`, `profile/formation`, `profile/skills`,
`profile/aspirations`, plus le `positioning` de la recherche.

**Si le profil est vide**, laisse `tier` à `null` : les offres apparaîtront sous
« Non classées » et tu signaleras qu'un `/veille:profil` débloquera le
classement. Ne devine pas un profil.

Sinon, lis les fichiers de `<W>/db-writes/` (titre, entreprise, lieu, contrat,
`contractTypes`, salaire) et attribue à chaque offre :

- **`cible`** — la fonction correspond à la cible, le niveau de séniorité est
  compatible avec le profil, le lieu convient, et `contractTypes` contient un
  des `contracts` de la recherche. Un contrat inconnu n'est **jamais** `cible`.
- **`possible`** — bonne fonction mais lieu imparfait, ou fonction adjacente
  qui reste atteignable, ou contrat inconnu sans indice contraire.
- **`hors`** — autre métier, niveau clairement hors de portée, ou contrat
  inconnu que le titre contredit pour une recherche de stage ou d'alternance
  (« confirmé », « senior », « responsable », « manager », « X ans
  d'expérience »).

Si une offre passée au travers est manifestement une école (annonceur connu
comme école ou CFA, titre qui promet une formation, « rejoins notre école »),
classe-la `hors` avec le `rationale` « Offre d'école : recrutement d'étudiants,
pas un emploi », et ajoute l'annonceur à la liste de `normalize.mjs` pour les
passages suivants.

Ne déduis jamais un contrat que ni le titre, ni le libellé, ni la fiche ne
donnent : quand `contractTypes` est vide, le `rationale` dit « contrat non
précisé ».

Avec un `rationale` d'une phrase (140 caractères maximum) qui nomme **ce qui
correspond et ce qui manque**, jamais un commentaire vague. Utilise les termes
de l'offre et du profil, pas des généralités.

Écris par lots de 50 : `op: "update"`, `data: {tier, rationale}`, avec
`if_version` à la version rendue par le lot de l'étape 3 (1 pour une offre qui
vient d'être créée).

En cas de gros volume, classe en priorité les offres dont le titre est
plausible ; il vaut mieux 30 offres bien classées que 100 classées à la va-vite.

## 5. Purger

Applique la politique décrite dans la skill `purge` (offres anciennes
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
ACH-131`), le nombre d'offres fermées écartées, ce qui a été purgé, et les
cibles les plus intéressantes en deux ou trois lignes — **les plus récentes
d'abord** (`postedAt`, à défaut `scrapedAt`), jamais une offre fermée. Rappelle
que `/veille:cv <ref>` ou l'onglet Candidater génère un CV adapté.

Termine en affichant le dashboard : outil `Artifact`, `action: "open"`, avec
l'URL. L'utilisateur vient de déclencher un scraping, il veut en voir le
résultat sans avoir à retrouver le lien.

Nettoie `<W>/.veille-tmp/` en fin de course.
