# Rédiger pour les grandes entreprises tech

Complément à [`CV-RULES.md`](CV-RULES.md), qui reste la base. Ce document porte
ce que Google et Amazon documentent publiquement sur la façon d'écrire un CV et
de raconter ses expériences, plus ce qui est propre aux postes techniques.

Ces méthodes ne servent pas qu'à postuler chez eux : elles sont devenues la
référence de fait dans la tech, et la formule X-Y-Z fonctionne aussi bien pour
un poste d'acheteur que pour un poste d'ingénieur.

## X-Y-Z : la formule de Google

Popularisée par **Laszlo Bock**, ex-SVP People Operations de Google, dans
*Work Rules!*, et reprise par les recruteurs de l'entreprise :

> **« Accomplished [X] as measured by [Y], by doing [Z] »**
> Réalisé **[X]**, mesuré par **[Y]**, en faisant **[Z]**.

Son intérêt n'est pas stylistique : elle force à produire les trois éléments
qu'on omet spontanément.

| | Contenu | Ce qu'on écrit par défaut |
|---|---|---|
| **X** | Le résultat obtenu | la mission, pas le résultat |
| **Y** | Le chiffre qui le prouve | rien |
| **Z** | La méthode employée | rien — or c'est elle qui rend crédible et révèle le niveau |

> « Amélioré les performances du backend » ne contient ni X, ni Y, ni Z.
> « Réduit la latence de checkout de 40 % sur un service traitant 15 M de
> transactions quotidiennes, en réécrivant le cache produit » contient les trois.

Les autres consignes de Google tiennent en trois lignes : **une page en dessous
de cinq ans d'expérience** ; réordonner compétences et expériences selon l'ordre
de l'annonce ; ne montrer que l'impact.

## Convertir un bloc STAR en puce X-Y-Z

Le profil est stocké au format STAR (voir `SCHEMA.md`). La conversion vers une
puce de CV est mécanique, et c'est elle qu'il faut appliquer :

| STAR (profil, à l'oral) | X-Y-Z (CV, à l'écrit) |
|---|---|
| **S**ituation — contexte, enjeu | fournit l'échelle, à glisser dans Y ou Z |
| **T**âche — périmètre, responsabilité | rarement écrite telle quelle ; sert à choisir le verbe |
| **A**ction — ce qui a été fait, avec quels outils | devient **Z** |
| **R**ésultat — l'effet obtenu, chiffré | devient **X** (l'effet) + **Y** (le chiffre) |

La puce s'écrit ensuite dans l'ordre **X → Y → Z**, en commençant par un verbe
d'action — c'est ce que l'œil capte en descendant la marge gauche.

> STAR : *Situation* — une centaine de fournisseurs à sourcer pour l'opération
> Disney. *Action* — appel d'offres mené de A à Z, grille de comparaison,
> négociation. *Résultat* — 5 fournisseurs en short-list, ~10 % de gain.
>
> X-Y-Z : « **Réduit le coût d'achat d'environ 10 %** sur l'opération Disney,
> **en menant l'appel d'offres de A à Z** — une centaine de fournisseurs sourcés,
> short-list de 5. »

Deux garde-fous : un **ordre de grandeur reste annoncé comme tel** (« environ »),
et si le bloc STAR n'a pas de résultat chiffré, on écrit X et Z sans inventer Y.
Une puce sans Y vaut mieux qu'une puce avec un Y fabriqué.

## STAR à l'oral : la méthode d'Amazon

Amazon documente publiquement sa méthode d'entretien : **STAR**, des réponses de
**2 à 3 minutes**, adossées aux **16 Leadership Principles**. Trois consignes y
sont explicites et régulièrement ratées.

**Dire « je », pas « nous ».** Amazon l'écrit noir sur blanc. « Nous avons
amélioré la satisfaction client » ne vaut rien ; « j'ai mis en place un système
de feedback qui a fait progresser la satisfaction de 40 % en six mois » vaut
quelque chose. Le « nous » est le réflexe le plus coûteux en entretien : il
efface la contribution personnelle, qui est précisément l'objet de la question.

**Des métriques, pas des adjectifs.**

**L'annonce dit quels principes seront évalués.** Chaque intervieweur se voit
attribuer deux ou trois Leadership Principles et construit ses questions autour.
Repérer dans l'annonce les principes visés revient à connaître les thèmes à
l'avance.

Côté CV, Amazon donne la même consigne que Google avec son exemple : pas « géré
un projet de migration cloud », mais « dirigé une équipe de 15 personnes sur une
migration cloud livrée deux mois en avance, soit 1,2 M$ d'économies annuelles ».

## Propre aux postes techniques

**L'échelle rend l'impact crédible.** « 40 % de latence en moins » seul est
invérifiable ; « sur un service à 15 M de transactions/jour » lui donne du poids.
Chercher systématiquement le volume : trafic, utilisateurs, taille d'équipe,
budget, nombre de références.

**Le poste le plus récent et sa stack** servent de filtre de pertinence.
Montrer les technologies sur lesquelles une décision a été prise, pas la liste
de tout ce qui a été effleuré — un mur de quarante technologies signale
l'inverse de la maîtrise.

**Avoir livré de bout en bout.** Le signal recherché est l'autonomie : avoir
conçu, livré et maintenu, plutôt qu'avoir « contribué à des tickets ».

**Le premier lecteur n'est souvent pas ingénieur.** Le vocabulaire doit rester
lisible par un recruteur non technique sans se vider de sa substance.

### Profils juniors et jeunes diplômés

Ajouter une rubrique **Projets** : trois ou quatre, avec lien vers le dépôt et
description de la contribution personnelle — pas du projet collectif.

Règle d'ordre : si les stages sont plus solides que les projets, `Expériences`
passe devant ; sinon `Projets` remonte, pour que la moitié haute de la page
porte le signal. Hackathons, contributions open source et écrits techniques
comptent comme preuves d'initiative.

## Raconter ses expériences

Google évalue sur quatre attributs : **capacité cognitive générale**,
**connaissance du métier**, **leadership** au sens *émergent* — prendre le lead
quand ses compétences sont utiles et s'effacer ensuite, indépendamment du titre
— et **« Googleyness »** : humilité intellectuelle, aise dans l'ambiguïté,
orientation utilisateur.

> Réserve d'honnêteté : ce cadre n'est plus publié tel quel sur une page Google
> vivante (la page re:Work qui le définissait renvoie une 404). Il circule via le
> livre de Bock et les recruteurs — source solide, mais de seconde main. À
> présenter comme tel si on le cite à l'utilisateur.

La méthode de préparation qui fait consensus : constituer une **banque de six à
huit histoires** variées, chacune rédigée en STAR, puis élaguer le contexte au
profit des arbitrages, des données et de ce qu'on en a tiré ; enfin rattacher
chaque histoire à deux ou trois principes ou attributs. Une même histoire sert
plusieurs questions.

## Sources

- Laszlo Bock, *Work Rules!*, et sa note publique sur la formule X-Y-Z.
- Pages de recrutement Google ; conseils d'une ex-recruteuse Google rapportés
  par CNBC (avril 2024) ; synthèse Inc. des conseils de recruteurs Google.
- Amazon, guide officiel d'entretien (aboutamazon.com) et *Interview Loop*
  (amazon.jobs) — STAR, « je » plutôt que « nous », Leadership Principles.
- Attributs GCA / RRK / Leadership / Googleyness : documentés par IGotAnOffer et
  les recruteurs, d'après Bock ; plus de page Google officielle en ligne.
