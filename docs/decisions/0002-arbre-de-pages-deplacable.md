# ADR-0002 — Format du document d'espace et arbre de pages déplaçable

Statut : accepté
Date : 2026-10-08

## Contexte et problème

Le document d'espace (ADR-0001) porte l'arborescence des pages. Yjs n'offre aucune primitive de déplacement : un `Y.Array` ne sait qu'insérer et supprimer, et un déplacement fait par suppression puis insertion duplique la page quand deux répliques le font en parallèle (veille du 2026-10-08). Des déplacements simultanés peuvent aussi former un cycle (F-001-AC9), et deux insertions à la même position doivent être conservées toutes les deux, dans le même ordre partout (F-001-AC8).

Il faut donc fixer la forme des données dans le document, et la règle qui en tire une arborescence identique sur toutes les répliques. Le format est lu par le client et, plus tard, par le serveur : il se défait mal.

Hypothèses de la spec F-001 validées par le dev : corbeille par drapeau, sans effacement (H2) ; renommages simultanés, dernière écriture gagne (H3) ; titre de 200 caractères au plus, pas d'autre limite (H4). La règle de résolution d'un cycle (H5) est laissée à la conception par la spec ; elle est tranchée ici.

## Options étudiées

Représentation de l'arbre :

1. **`Y.Array` d'enfants par page.** Écarté : pas de déplacement sans duplication.
2. **Journal d'opérations de déplacement horodatées, annulées et rejouées dans l'ordre** (Kleppmann et al.). Correct, mais demande une horloge logique, un journal conservé pour toujours et un moteur de rejeu : disproportionné pour un outil interne.
3. **Bibliothèque `yjs-orderedtree`.** Écartée : seconde dépendance d'exécution, contraire à F-001-AC19, et non évaluée.
4. **Une entrée par page portant son parent et son rang ; l'arbre est calculé à la lecture** (retenue). Le document peut contenir un état incohérent (cycle, parent absent) ; la lecture, fonction pure et déterministe de l'état du document, n'en expose jamais.

Résolution d'un cycle (H5), dans l'option 4 :

- a. **Réparer par une écriture dès qu'un cycle est vu.** Écarté : une réplique qui ne fait que lire (ou le serveur) se mettrait à écrire, et chaque réplique écrirait la même réparation.
- b. **Couper à la lecture le lien de la page d'identifiant le plus petit du cycle** (retenue).
- c. **Couper le lien du déplacement le plus récent.** Écarté : Yjs n'expose pas d'ordre total des écritures utilisable par l'application ; il faudrait l'horloge de l'option 2.

Parent écrit par une réattribution de rangs (voir « Rangs ») pour une sœur exposée à la racine alors que son parent enregistré n'est pas `null` :

- i. **Écrire `parent: null`.** Écarté : un simple changement d'ordre figerait à la racine une page que personne n'a déplacée. Pour une page dont le parent est absent, le parent qui arriverait plus tard par synchronisation ne retrouverait plus sa fille.
- ii. **Réécrire le parent enregistré, tel quel** (retenue) : la réattribution ne touche qu'à l'ordre, jamais à la structure.

## Décision

### Structure Yjs (version de format 1)

Deux types racines dans le `Y.Doc` de l'espace :

- `meta` : `Y.Map`. Clé `version` : le nombre entier `1`. Écrite une seule fois, par `creerDocumentEspace` ; aucune autre opération ne l'écrit.
- `pages` : `Y.Map`. Clé : identifiant de page. Les identifiants créés par le module sont des UUID v4 (`crypto.randomUUID()`), mais la lecture ne contrôle pas la forme de la clé : toute clé de `pages` est un identifiant. Valeur : une `Y.Map` imbriquée, créée une seule fois et jamais remplacée, de trois champs :

| Champ       | Type                                      | Écrit par                                                    |
| ----------- | ----------------------------------------- | ------------------------------------------------------------ |
| `titre`     | chaîne de 200 unités UTF-16 au plus       | création, renommage                                          |
| `place`     | objet `{ parent, rang }`, remplacé entier | création, déplacement, réattribution de rangs, consolidation |
| `corbeille` | booléen                                   | création (`false`), mise à la corbeille (`true`)             |

- `place` est un objet JSON simple : ni `null`, ni tableau, ni type partagé Yjs.
- `place.parent` : une chaîne (identifiant de la page parente) ou `null` pour la racine.
- `place.rang` : chaîne non vide sur l'alphabet `0-9A-Za-z` (ordre des codes ASCII), qui ne finit pas par `0`.

Chaque champ suit la règle Yjs d'une clé de `Y.Map` : la dernière écriture gagne. Le parent et le rang sont dans une seule valeur pour qu'un déplacement soit une écriture atomique : deux déplacements simultanés de la même page donnent l'un des deux emplacements, jamais le parent de l'un avec le rang de l'autre. Le titre est une chaîne simple, pas un `Y.Text` (H3). Aucune entrée n'est jamais supprimée de `pages` (H2).

La longueur du titre se mesure en unités UTF-16 (`titre.length`) : c'est la seule mesure identique sur tous les moteurs sans table Unicode.

### Rangs

Le rang est un index fractionnaire : les sœurs sont triées par rang croissant. Un rang se lit comme la partie fractionnaire d'un nombre entre 0 et 1 exclus ; la borne basse est la chaîne vide, la borne haute est au-delà de tout rang. Comme un rang ne finit jamais par `0`, il existe toujours une chaîne valide strictement entre la borne basse et lui.

**Rang d'une insertion.** Insérer entre deux sœurs calcule une chaîne strictement comprise entre leurs rangs (milieu dans l'alphabet, allongée d'un caractère quand il n'y a plus de place) ; en première ou dernière position, entre la borne et la sœur voisine. La fonction est écrite dans le module (aucune dépendance), sans aléa ni horloge. Le format ne fixe pas la valeur exacte calculée, seulement ses contraintes (alphabet, pas de `0` final, strictement entre les deux voisins) : la lecture ne dépend que des rangs écrits, donc toute valeur qui respecte ces contraintes converge.

**Départage des rangs égaux (F-001-AC8)** : les sœurs sont triées par le couple (rang, identifiant de page). Deux pages créées à la même position reçoivent le même rang, sont conservées toutes les deux et s'ordonnent par identifiant. Deux répliques ne sont pas nécessaires pour que deux sœurs portent le même rang : le rang d'une création se calcule entre les sœurs lues, hors corbeille, si bien qu'une page créée sous un parent dont la seule fille est à la corbeille reçoit le rang de cette fille. Les deux sont sœurs dans la corbeille dès que le parent y passe. Le départage vaut donc dès la première opération de corbeille, sur une seule réplique.

**Insertion entre deux sœurs de même rang (réattribution).** Les sœurs considérées sont les sœurs lues de la destination : hors corbeille, page déplacée exclue, dans l'ordre lu. Soit `g` celle qui précède la position demandée et `d` celle qui la suit. Si `g` et `d` existent et portent le même rang `r`, aucune chaîne n'existe entre eux. L'opération écrit alors, dans la même transaction :

- Soit `s1 … sk` les sœurs lues qui portent le rang `r` à partir de `d` comprise (`s1 = d`), dans l'ordre lu, et `h` le rang de la sœur lue qui suit `sk`, ou la borne haute s'il n'y en a pas.
- `k + 1` rangs strictement croissants `x0 < x1 < … < xk`, tous strictement entre `r` et `h` : `x0` est le rang entre `r` et `h`, puis chaque `xi` est le rang entre le précédent et `h`.
- La page insérée reçoit `x0` ; chaque `si` reçoit `xi`. `g` et les sœurs de rang `r` qui la précèdent gardent `r`. Les sœurs à la corbeille ne sont pas touchées.

L'ordre lu devient : les sœurs jusqu'à `g`, la page insérée, `s1 … sk`, puis la suite inchangée.

**Parent écrit par la réattribution.** La réattribution ne change jamais le parent enregistré. Pour chaque `si`, elle réécrit `place` avec le `parent` enregistré dans le document, recopié tel quel, et le nouveau rang. C'est vrai aussi d'une sœur exposée à la racine par l'étape 3 de la lecture (parent absent ou ignoré) ou par l'étape 4 (coupure de cycle) : son parent enregistré n'est pas `null`, et il le reste. Cette règle tient avec le reste de la décision :

- L'ordre demandé est obtenu : l'exposition d'une page à la racine ne dépend que des parents et des identifiants, jamais des rangs. Une sœur exposée reste donc exposée après l'écriture, et s'y range par son nouveau rang.
- Le cas ne se présente qu'à la racine : sous une page, toutes les sœurs lues ont cette page pour parent enregistré.
- Si le parent enregistré redevient effectif plus tard (parent absent qui arrive par synchronisation, cycle défait par un autre déplacement), la page le rejoint avec son nouveau rang, qui s'y compare aux rangs de ses nouvelles sœurs comme n'importe quel rang.
- Seule exception, qui n'en est pas une : la consolidation (voir « Écriture ») écrit `parent: null` pour une page précise. Si cette page est aussi l'une des `si` de la même transaction, elle reçoit une seule écriture, `{ parent: null, rang: xi }`.

Toutes les comparaisons de chaînes (rangs, identifiants) se font par unités de code (`<` de JavaScript), jamais par `localeCompare`, dont le résultat dépend de l'appareil.

### Lecture : du document à l'arborescence

La lecture est une fonction totale de l'état du document, appliquée dans cet ordre :

1. **Version.** Trois cas, et trois seulement, évalués à chaque lecture et à chaque écriture :
   - la clé `version` n'existe pas dans `meta` (`has` faux) : le document se lit comme un document de version 1. C'est le cas d'un `Y.Doc` vierge, avant que la persistance ou la synchronisation ne l'ait rempli ;
   - la valeur est le nombre entier `1` (égalité stricte) : version 1 ;
   - toute autre valeur présente (`2`, `2.5`, `0`, `-1`, `"1"`, `"2"`, `null`, `undefined` écrit, objet, type partagé) : version inconnue. La lecture et toute écriture sont refusées par l'erreur typée `version-non-prise-en-charge`, sans rien modifier (F-001-AC18).

   **« Version absente = 1 » est une règle permanente du format**, pas une tolérance de transition. `ouvrirDocumentEspace` n'écrit rien : un document né par elle sur un `Y.Doc` vierge, puis rempli par des opérations, ne porte jamais la clé `version`. Des documents de version 1 sans clé existeront donc aussi longtemps que le format. Toute version future, à commencer par une version 2, devra respecter cette règle :
   - un document sans clé `version` reste un document de version 1, à lire comme tel ou à migrer comme tel ; il n'est jamais lu comme un document de la version la plus récente ;
   - un document d'une version autre que 1 porte toujours la clé `version`, écrite avec sa valeur : aucune version future ne peut se signaler par l'absence de la clé.

2. **Entrées valides.** Une entrée de `pages` est retenue si sa valeur est une `Y.Map` dont le champ `titre` est une chaîne de 200 unités au plus, le champ `corbeille` un booléen, et le champ `place` un objet JSON simple dont `parent` est une chaîne ou `null` et `rang` une chaîne conforme à la règle des rangs. Toute autre entrée est ignorée, sans exception levée (F-001-AC16). Un champ inconnu en plus, dans l'entrée ou dans `place`, est toléré et ignoré.
3. **Parent effectif.** `place.parent` s'il désigne une entrée valide ; sinon la racine (F-001-AC17). Une chaîne qui ne désigne aucune entrée valide, chaîne vide comprise, vaut donc la racine.
4. **Cycles (H5).** Chaque page a un seul parent effectif : les cycles sont donc disjoints. En suivant les parents effectifs, chaque cycle est coupé en un point : la page du cycle dont l'identifiant est le plus petit est exposée à la racine, à la place que lui donne son rang ; les autres gardent leur parent. Une page parente d'elle-même est un cycle d'une page.
5. **Corbeille.** Une page est à la corbeille si son drapeau est vrai ou si l'une de ses ancêtres (après l'étape 4) l'est (F-001-AC5, F-001-AC11). Les autres forment l'arborescence lue. La corbeille est une forêt : ses racines sont les pages à la corbeille qui sont à la racine ou dont le parent n'est pas à la corbeille ; chacune porte toute sa descendance.
6. **Ordre.** Les sœurs sont triées par (rang, identifiant), dans l'arborescence comme dans la corbeille. Les racines de la corbeille, qui peuvent venir de parents différents, sont triées entre elles par (rang, identifiant) elles aussi.

Chaque entrée valide apparaît donc exactement une fois, dans l'arborescence ou dans la corbeille : aucune page n'est perdue, aucune n'est dupliquée, et il n'y a pas de cycle.

La version inconnue n'est pas « supérieure » au sens strict pour toutes ces valeurs (`0`, `"1"`). F-001-AC18 impose le refus d'une version supérieure et la spec précise, dans son hors-périmètre, que ce critère « ne fait que refuser une version inconnue » : refuser toute valeur présente autre que `1` couvre le critère et ne contredit ni F-001-AC16 (qui porte sur les entrées de page, pas sur `meta`) ni F-001-AC12 (un document vierge n'a pas de clé `version`). Lire `2.5` ou `"2"` comme une version 1 aurait au contraire laissé écrire dans un document d'un format que le module ne connaît pas.

Pourquoi « le plus petit identifiant » : la règle ne dépend que de l'état convergé, donc toutes les répliques coupent au même endroit sans rien échanger, et les deux pages restent atteignables avec leur descendance. Elle ne cherche pas à deviner l'intention : après deux déplacements contradictoires, aucune des deux n'est plus légitime que l'autre.

### Écriture

- Une opération valide tout avant d'écrire, sur l'arborescence lue, dans l'ordre fixé par l'ADR-0003 ; un refus n'ouvre aucune transaction, donc n'émet aucune mise à jour (F-001-AC13 à AC15). Une opération écrit dans une seule transaction Yjs.
- Chaque page touchée par une transaction reçoit au plus une écriture de `place`.
- La création écrit une entrée neuve (`titre`, `place`, `corbeille: false`). Le renommage écrit `titre`. La mise à la corbeille écrit `corbeille: true` sur la page visée et elle seule : sa descendance y est par la lecture (étape 5).
- Une opération qui ne changerait rien n'écrit rien : un renommage avec le titre déjà enregistré ; un déplacement dont le parent demandé est le parent lu de la page (la racine pour une page exposée à la racine) et dont la position demandée, ou la dernière si aucune n'est demandée, est celle qu'elle occupe déjà parmi ses sœurs lues, elle-même exclue.
- **Consolidation avant déplacement.** Si la page déplacée descend, dans l'arborescence lue, d'une page exposée à la racine par l'étape 4 (il y en a au plus une : la racine de sa lignée), le déplacement écrit aussi pour cette ancêtre, dans la même transaction, `place = { parent: null, rang }` avec son rang enregistré, inchangé (sauf réattribution dans la même transaction, voir « Rangs »). Sans cela, sortir une page d'un cycle rendrait valide le parent enregistré de la page coupée, qui quitterait la racine pour un endroit que personne n'a choisi. La réparation n'est donc écrite que par une action de l'utilisateur, jamais par une simple lecture.
  - La règle vaut pour toute descendante lue de la page coupée, qu'elle fasse partie du cycle ou non : c'est la règle la plus simple à décider depuis l'arborescence lue, et quand le cycle subsiste elle ne change pas la lecture (la page coupée était déjà à la racine, au même rang).
  - Elle ne vaut pas pour une ancêtre exposée par l'étape 3 : un parent absent ne devient pas présent parce qu'une descendante bouge.
  - Déplacer la page coupée elle-même remplace sa `place` : le cycle disparaît sans consolidation.

## Conséquences

- La convergence (F-001-AC7) découle de celle de Yjs : la lecture étant une fonction pure de l'état, deux répliques de même état lisent la même chose. C'est vérifiable par des tests de propriétés.
- Après un cycle, la page coupée se retrouve à la racine, pas à son emplacement d'avant le déplacement (non conservé dans le document). C'est un choix accepté : le cas est rare et aucune page n'est perdue.
- La réattribution de rangs et la consolidation écrivent la place de pages que l'utilisateur n'a pas déplacées ; elles peuvent l'emporter sur un déplacement simultané de ces pages. Accepté : les deux cas supposent déjà un conflit.
- Une sœur réattribuée alors qu'elle est exposée à la racine garde un parent enregistré qui n'est pas son parent lu. C'est déjà son état avant l'opération ; la réattribution ne l'aggrave ni ne le répare.
- Un rang s'allonge quand on insère toujours au même endroit (environ un caractère toutes les six insertions consécutives : estimation, non mesurée). Aucune limite n'est posée (H4) ; aucune réécriture globale des rangs n'est prévue.
- Le document ne rétrécit jamais : les pages à la corbeille y restent (H2) jusqu'à ce que F-007 et F-025 décident de l'effacement réel.
- Le module ne se défend que contre les données mal formées. Une mise à jour bien formée mais hostile (par exemple `version` forcée à 99, qui bloque toutes les répliques, ou un type racine `meta` ou `pages` rempli autrement que comme une `Y.Map`) relève de l'autorisation des écritures côté serveur (F-012). Le comportement de Yjs devant un type racine d'une autre nature n'a pas été essayé.
- Toute évolution du format (nouveau champ obligatoire, autre règle de lecture) incrémente `version` et exige un test de couture qui énumère les consommateurs du format. Elle garde la règle « version absente = 1 » (« Lecture », étape 1) : la nouvelle version écrit toujours sa clé, et un document sans clé reste de version 1.
