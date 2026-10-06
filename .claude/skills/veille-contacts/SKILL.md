---
name: veille-contacts
description: Cherche avec Hunter.io les adresses email des RH (ou du recrutement) de l'entreprise d'une offre du dashboard « Veille Emploi », pour une candidature spontanée par mail, et les range sur l'offre. Utiliser quand l'utilisateur veut l'email d'un recruteur, des contacts RH, ou écrire directement à une entreprise.
---

# Trouver les contacts RH d'une offre

Argument : la référence d'une offre (`ACH-042`), ou un nom d'entreprise pour
une candidature hors dashboard. Option : `--nom "Prénom Nom"` quand l'annonce
nomme son recruteur.

**Profil actif** : `node "${VEILLE_ROOT}/scripts/veille-config.mjs"` donne
`artifactUrl` (notée URL ci-dessous) et `workspace` (noté `<W>`) ; code de sortie
3 = aucun profil, propose `/veille-demarrer` et arrête-toi. Règles communes :
`${VEILLE_ROOT}/docs/CONTEXTE.md`. Schéma :
`${VEILLE_ROOT}/docs/SCHEMA.md`.

## Règles

- **Les crédits sont rares : 50 par mois** sur le forfait gratuit, soit au
  plus 50 recherches. Une recherche consomme 1 crédit dès que Hunter renvoie
  des adresses, même si aucune n'est utile (le script écarte `vip@`, `promo@`…
  et `creditUsed` vaut alors vrai avec `emails` vide) ; seule une recherche où
  Hunter ne connaît rien est gratuite. Le script s'arrête au premier appel
  facturé : jamais plus d'un crédit par recherche. Donc :
  - une offre qui a déjà un champ `contacts` de moins de 30 jours n'est pas
    recherchée à nouveau, sauf demande explicite : affiche ce qui est stocké ;
  - si l'entreprise est visiblement un cabinet de recrutement ou une agence
    d'intérim, dis-le **avant** de chercher (on trouvera surtout les recruteurs
    de l'agence) et demande si ça vaut un crédit — sauf si la demande vient du
    bouton du dashboard, qui a déjà prévenu ;
  - chaque compte rendu dit si un crédit a été consommé (`creditUsed`) et
    combien il en reste.
- **Chaque utilisateur utilise sa propre clé**, aucune n'est fournie avec
  l'outil. Elle vit dans `~/.veille-emploi/secrets.json` (ou la variable
  `HUNTER_API_KEY`), jamais dans la base. Si le script sort avec le code 3,
  arrête-toi et guide l'utilisateur :
  1. créer un compte gratuit sur https://hunter.io et confirmer son email ;
  2. copier sa clé sur https://hunter.io/api-keys (aide :
     https://help.hunter.io/en/articles/1970978-what-is-and-where-i-can-find-my-api-secret-key) ;
  3. l'enregistrer, au choix : la coller ici, dans la conversation (le plus
     simple), ou relancer l'installeur (`Installer.cmd` sous Windows,
     `Installer.command` sur Mac), qui la demande sans l'afficher et ne la
     fait pas passer par la conversation ;
  4. relancer la commande.
  Préviens que 50 crédits par mois, c'est peu.
- **Clé collée dans la conversation** : enregistre-la aussitôt, sans la
  répéter dans ta réponse. Une clé Hunter fait 40 caractères hexadécimaux ; si
  le texte collé n'y ressemble pas, demande avant d'enregistrer quoi que ce
  soit.
  ```
  node "${VEILLE_ROOT}/scripts/veille-config.mjs" secret hunter <clé>
  node "${VEILLE_ROOT}/scripts/contacts.mjs" --account
  ```
  La seconde commande vérifie la clé sans dépenser de crédit. Code 4 : Hunter
  la refuse, retire-la (`secret hunter --remove`) et demande de la recopier.
  Sinon, confirme en une ligne (enregistrée, crédits restants), et préviens
  une seule fois, sans dramatiser : la clé reste dans l'historique de cette
  conversation, conservé sur l'ordinateur ; `/clear` la sort du contexte de la
  session, pas de cet historique. Qui veut l'effacer pour de bon la régénère
  sur hunter.io/api-keys puis la recolle. Ces deux commandes sont les seules
  où la clé apparaît : ne la recopie ni en base, ni dans un fichier du
  dossier de travail, ni ailleurs.
- **Une adresse Hunter est une déduction**, pas une certitude : la confiance et
  la vérification s'affichent toujours à côté.
- **Rien n'est envoyé.** La skill trouve des adresses ; le mail se rédige avec
  l'onglet Candidater ou `/veille-cv`, et c'est l'utilisateur qui l'envoie.

## 1. Lire l'offre

`ArtifactData` `query` sur `offers`, `where` `ref == <référence>`, `limit` 1.
Retiens le `doc_id`, la `version`, `company`, `title`, et un éventuel
`contacts`. Référence introuvable : dis-le et arrête-toi. Argument qui n'est pas
une référence : c'est un nom d'entreprise, rien ne sera écrit en base.

## 2. Chercher

```
node "${VEILLE_ROOT}/scripts/contacts.mjs" --company "<company>" --limit 10 --out "<W>/.veille-tmp/contacts.json"
```

Le script essaie, dans l'ordre et en s'arrêtant à la première réponse non
vide : les RH, puis les boîtes génériques de recrutement (`recrutement@`,
`rh@`, `jobs@`, `contact@` en dernier recours), puis la direction (qui recrute
elle-même dans une petite entreprise). `strategy` dit laquelle a répondu.

- **Aucune adresse et un domaine douteux** (Hunter a pu confondre l'entreprise
  avec un homonyme, ou viser le site vitrine plutôt que celui des mails) :
  relance avec `--domain <domaine>` si tu connais avec certitude le domaine
  officiel de l'entreprise, une seule fois : chaque essai peut coûter un
  crédit. Ne devine pas un domaine.
- **`agency: true`** : l'offre est publiée par un cabinet ou une agence
  d'intérim. Ses recruteurs sont les bons contacts pour **cette** offre, mais
  pas pour une candidature spontanée chez le client final, que l'annonce cache
  presque toujours. Dis-le à l'utilisateur.
- **`--nom`** fourni : lance plutôt
  `contacts.mjs --name "<Prénom Nom>" --domain <domaine trouvé>` (ou
  `--company`), qui cherche l'adresse de cette personne précise.
- Code de sortie 4 : Hunter refuse (clé, quota, débit). Rapporte le message tel
  quel, n'insiste pas.

## 3. Ranger sur l'offre

Si l'argument était une référence, `ArtifactData` `update` sur
`offers/<doc_id>` avec `if_version`, champ `contacts` (structure dans
`SCHEMA.md`) : reprends `searchedAt`, `domain`, `pattern`, `agency`,
`strategy` et `emails` du rapport, en ne gardant pour chaque adresse que
`email`, `name`, `position`, `type`, `confidence`, `verification` et
`linkedin`. Écris aussi un résultat vide (`emails: []`) : il évite de repayer
la même recherche. Le dashboard affiche ces contacts sous l'offre.

## 4. Rendre compte

Un tableau : adresse, nom, poste, type (personnelle / générique), confiance.
En tête, celle à privilégier : une personne des RH ou du recrutement, confiance
80 ou plus et vérification `valid`, à défaut la boîte `recrutement@`. Ajoute le
`pattern` quand il existe (`{first}.{last}`) : il permet d'écrire à un
recruteur dont on n'a que le nom.

Termine par le coût : « 1 crédit consommé » si `creditUsed` est vrai (même
sans adresse utile — dis-le franchement), « aucun crédit consommé » sinon, puis
les crédits restants (`node "${VEILLE_ROOT}/scripts/contacts.mjs" --account`,
gratuit) sur 50 par mois, et
la suite logique : rédiger le mail de candidature spontanée dans l'onglet
Candidater ou avec `/veille-cv <ref>`. Rappelle qu'un mail de candidature se
fait un par un, adressé à une personne, sans relance en série.

Si la demande est arrivée par un commentaire du dashboard (bouton « Contacts
RH »), réponds dans ce fil avec la même synthèse en trois lignes, puis
résous-le.
