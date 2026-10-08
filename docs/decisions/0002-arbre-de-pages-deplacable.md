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

## Décision

### Structure Yjs (version de format 1)

Deux types racines dans le `Y.Doc` de l'espace :

- `meta` : `Y.Map`. Clé `version` : entier, `1`. Écrite une seule fois, à la création du document.
- `pages` : `Y.Map`. Clé : identifiant de page (UUID v4 produit par `crypto.randomUUID()`). Valeur : une `Y.Map` imbriquée, créée une seule fois et jamais remplacée, de trois champs :

| Champ       | Type                                      | Écrit par                               |
| ----------- | ----------------------------------------- | --------------------------------------- |
| `titre`     | chaîne de 200 unités UTF-16 au plus       | création, renommage                     |
| `place`     | objet `{ parent, rang }`, remplacé entier | création, déplacement                   |
| `corbeille` | booléen                                   | création (`false`), mise à la corbeille |

- `place.parent` : identifiant de la page parente, ou `null` pour la racine.
- `place.rang` : chaîne non vide sur l'alphabet `0-9A-Za-z` (ordre des codes ASCII), qui ne finit pas par `0`.

Chaque champ suit la règle Yjs d'une clé de `Y.Map` : la dernière écriture gagne. Le parent et le rang sont dans une seule valeur pour qu'un déplacement soit une écriture atomique : deux déplacements simultanés de la même page donnent l'un des deux emplacements, jamais le parent de l'un avec le rang de l'autre. Le titre est une chaîne simple, pas un `Y.Text` (H3). Aucune entrée n'est jamais supprimée de `pages` (H2).

La longueur du titre se mesure en unités UTF-16 (`titre.length`) : c'est la seule mesure identique sur tous les moteurs sans table Unicode.

### Rangs

Le rang est un index fractionnaire : les sœurs sont triées par rang croissant. Insérer entre deux sœurs calcule une chaîne strictement comprise entre leurs rangs (milieu dans l'alphabet, allongée d'un caractère quand il n'y a plus de place) ; en première ou dernière position, entre la borne et la sœur voisine. La fonction est écrite dans le module (aucune dépendance), sans aléa : la même insertion donne le même rang sur toutes les répliques.

**Départage des rangs égaux (F-001-AC8)** : les sœurs sont triées par le couple (rang, identifiant de page). Deux pages créées à la même position reçoivent le même rang, sont conservées toutes les deux et s'ordonnent par identifiant.

**Insertion entre deux sœurs de même rang** : aucune chaîne n'existe entre deux rangs égaux. L'opération réattribue alors, dans la même transaction, un rang à la sœur suivante et aux sœurs qui la suivent avec ce même rang, en conservant leur ordre lu.

Toutes les comparaisons de chaînes (rangs, identifiants) se font par unités de code (`<` de JavaScript), jamais par `localeCompare`, dont le résultat dépend de l'appareil.

### Lecture : du document à l'arborescence

La lecture est une fonction totale de l'état du document, appliquée dans cet ordre :

1. **Version.** `meta.version` absente ou qui n'est pas un entier supérieur ou égal à 1 se lit comme 1. Supérieure à 1 : la lecture et toute écriture sont refusées par une erreur typée, sans rien modifier (F-001-AC18).
2. **Entrées valides.** Une entrée de `pages` est retenue si sa valeur est une `Y.Map` dont les trois champs ont le type et les bornes du tableau ci-dessus. Toute autre entrée est ignorée, sans exception (F-001-AC16). Un champ inconnu en plus est toléré.
3. **Parent effectif.** `place.parent` s'il désigne une entrée valide ; sinon la racine (F-001-AC17).
4. **Cycles (H5).** En suivant les parents effectifs, chaque cycle est coupé en un point : la page du cycle dont l'identifiant est le plus petit est exposée à la racine, à la place que lui donne son rang ; les autres gardent leur parent. Une page parente d'elle-même est un cycle d'une page.
5. **Corbeille.** Une page est à la corbeille si son drapeau est vrai ou si l'une de ses ancêtres (après l'étape 4) l'est (F-001-AC5, F-001-AC11). Les autres forment l'arborescence lue.
6. **Ordre.** Les sœurs sont triées par (rang, identifiant), dans l'arborescence comme dans la corbeille.

Chaque entrée valide apparaît donc exactement une fois, dans l'arborescence ou dans la corbeille : aucune page n'est perdue, aucune n'est dupliquée, et il n'y a pas de cycle.

Pourquoi « le plus petit identifiant » : la règle ne dépend que de l'état convergé, donc toutes les répliques coupent au même endroit sans rien échanger, et les deux pages restent atteignables avec leur descendance. Elle ne cherche pas à deviner l'intention : après deux déplacements contradictoires, aucune des deux n'est plus légitime que l'autre.

### Écriture

- Une opération valide tout avant d'écrire, sur l'arborescence lue ; un refus n'ouvre aucune transaction, donc n'émet aucune mise à jour (F-001-AC13 à AC15). Une opération écrit dans une seule transaction Yjs.
- Une opération qui ne changerait rien (même titre, même emplacement) n'écrit rien.
- **Consolidation avant déplacement.** Si la page déplacée a parmi ses ancêtres lues une page exposée à la racine par l'étape 4, le déplacement écrit aussi, dans la même transaction, `parent: null` pour cette ancêtre. Sans cela, sortir une page d'un cycle rendrait valide le parent enregistré de la page coupée, qui quitterait la racine pour un endroit que personne n'a choisi. La réparation n'est donc écrite que par une action de l'utilisateur, jamais par une simple lecture.

## Conséquences

- La convergence (F-001-AC7) découle de celle de Yjs : la lecture étant une fonction pure de l'état, deux répliques de même état lisent la même chose. C'est vérifiable par des tests de propriétés.
- Après un cycle, la page coupée se retrouve à la racine, pas à son emplacement d'avant le déplacement (non conservé dans le document). C'est un choix accepté : le cas est rare et aucune page n'est perdue.
- La réattribution de rangs et la consolidation écrivent la place de pages que l'utilisateur n'a pas déplacées ; elles peuvent l'emporter sur un déplacement simultané de ces pages. Accepté : les deux cas supposent déjà un conflit.
- Un rang s'allonge quand on insère toujours au même endroit (environ un caractère toutes les six insertions consécutives). Aucune limite n'est posée (H4) ; aucune réécriture globale des rangs n'est prévue.
- Le document ne rétrécit jamais : les pages à la corbeille y restent (H2) jusqu'à ce que F-007 et F-025 décident de l'effacement réel.
- Le module ne se défend que contre les données mal formées. Une mise à jour bien formée mais hostile (par exemple `version` forcée à 99, qui bloque toutes les répliques) relève de l'autorisation des écritures côté serveur (F-012).
- Toute évolution du format (nouveau champ obligatoire, autre règle de lecture) incrémente `version` et exige un test de couture qui énumère les consommateurs du format.
