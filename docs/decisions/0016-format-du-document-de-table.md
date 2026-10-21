# ADR-0016 — Format du document de table : types racine, drapeaux, rangs, version à maximum

Statut : accepté (décision du dev du 2026-10-19, après correction des écarts)
Date : 2026-10-16 ; normalisation des chaînes à unité UTF-16 isolée reprise le même jour d'après le code de F-017 (`2d8c51a`), sur décision de l'orchestrateur après revue ; écarts au code corrigés le 2026-10-19

## Contexte et problème

F-017 (`specs/F-017.md`, validée, structurel) fait naître le troisième format de document de `@notionlike/document` : le document de table, un `Y.Doc` par table (ADR-0001), qui porte des colonnes typées, leurs options, des lignes et leurs cellules. Ce format se défait mal : chaque appareil (F-018, base `notionlike:table:<idEspace>:<idTable>`) et le serveur (F-012, ligne `table` de la table `document`, nom `table:<idEspace>:<idTable>`) conserveront ce que le client écrit, et le serveur relaie ce document sans le lire (ADR-0013). Le nom du document et de sa base est déjà fixé par l'amendement F-012 et F-013 de l'ADR-0001 ; F-017 n'en produit aucun (F-017 H2). Cet ADR fixe ce que F-017 laisse à la conception : la forme stockée, la reconnaissance d'un document qui n'est pas une table, et le versionnement du format.

Faits établis par la veille du 2026-10-16 (`MEMORY/VEILLE.md`, « Yjs 13.6.33 — rafraîchissement et constats pour le modèle de table », essais exécutés sur 13.6.33) dont dépend la décision :

- un type imbriqué (`Y.Map` de cellules, d'options) créé paresseusement par deux répliques n'en garde qu'un, l'autre perd son contenu (constat 1) ;
- deux écritures concurrentes d'une même clé se départagent par `clientID`, pas par l'heure ; vider une clé (`delete` ou `set(null)`) perd contre une écriture concurrente (constat 2) ;
- un drapeau `supprimee` contre une écriture concurrente dans la même entrée : l'entrée est lue supprimée sur les deux répliques ; supprimer la clé qui porte l'entrée perd l'écriture concurrente (constat 3) ;
- `observeDeep` et `afterTransaction` signalent aussi des transactions qui ne changent rien de visible (constat 4) ; une mise à jour livrée dans le désordre applique ses suppressions avant ses insertions : un champ peut manquer un temps (constat 5) ;
- une unité UTF-16 isolée n'est pas conservée par l'encodage V1 : la réplique d'origine lit `a\ud800b`, les autres `a�b` (constat 6) ;
- `doc.getMap` sur un document vierge n'émet rien ; un document d'espace reçu fait apparaître `meta` et `pages` dans `doc.share` avant tout accès ; un document d'espace porte `meta.version` (constat 7) ;
- sous ramasse-miettes actif, une cellule réécrite 1 000 fois passe de 30 à 65 octets (18 939 sans) ; 1 000 lignes marquées supprimées ne libèrent rien (+3 %) (constat 8).

## Options étudiées

Contenant des lignes et de leur ordre :

1. `Y.Array` des lignes, ordre natif de Yjs. Écarté : un déplacement y est un retrait suivi d'une insertion ; deux déplacements concurrents de la même ligne la dupliquent, un déplacement concurrent à une écriture perd l'écriture.
2. **Type racine `Y.Map` par identifiant, ordre par un rang, puis l'identifiant** (retenue), comme les pages sœurs (ADR-0002, F-029). Un déplacement n'écrit que des champs `rang` : celui de l'élément, et ceux des voisins à réattribuer quand aucun rang n'est libre (F-029), sans retrait ni insertion.

Cellules :

- a. Clés à plat dans la `Y.Map` de la ligne (`c:<idColonne>`). Taille équivalente (veille, constat 8), mais les champs de la ligne et ses cellules partageraient un espace de clés.
- b. **Une `Y.Map` de cellules par ligne, créée dans la transaction qui crée la ligne, jamais recréée** (retenue). Deux cellules d'une même ligne écrites sur deux répliques sont deux clés d'une même `Y.Map` (F-017-AC11).
- c. `Y.Map` de cellules créée à la première écriture. Écarté : création concurrente, une des deux perdue (constat 1).

Suppression d'une colonne, d'une option, d'une ligne :

- i. Retirer la clé. Écarté : perd l'écriture concurrente (constat 3), et F-017 H5 retient une restauration possible.
- ii. **Drapeau `supprimee`** (retenue, F-017 H5), comme la corbeille des pages.

Forme stockée de la version :

- α. Clé `version` d'un type racine `meta`, dernière écriture gagnante, comme le document d'espace. Écarté : deux élévations concurrentes peuvent laisser la plus basse (ADR-0009, option a), et un document de table qui porterait `meta.version` se confondrait avec un document d'espace (constat 7).
- β. **Type racine `versions`, un `Y.Array` d'entiers, jamais retiré, lu au maximum, vide pour la version 1** : la forme du document de page (ADR-0009, option b), avec sa fonction de lecture (retenue).

Reconnaissance d'un document qui n'est pas une table (F-017-AC23) :

- A. Marque écrite à la création (`nature: "table"`). Écarté : `ouvrirDocumentTable` n'écrit rien (F-017 H10), et un document vierge doit s'ouvrir comme une table.
- B. Liste noire des racines du document d'espace (`pages`, et `meta`). Possible, mais `format-table.ts` devrait connaître les noms d'un autre format, et un document de page s'ouvrirait comme une table.
- C. **Liste blanche** (retenue) : un document de table n'a, dans `doc.share`, aucun type racine hors des siens (`colonnes`, `lignes`, `versions`). La présence suffit, sans lire le contenu : un document d'espace reçu ou ouvert y fait figurer `meta` ou `pages`, même vidé (constat 7).

## Décision

Format, version 1. `packages/document/src/format-table.ts` est le seul fichier qui en connaît les noms, hors `versions`, dont l'accès et la lecture viennent de `format-page.ts` (`typeDesVersions`, `lireFormeStockee`).

- Type racine `colonnes`, une `Y.Map` : clé, l'identifiant de la colonne (UUID) ; valeur, une `Y.Map` à champs `nom` (chaîne), `type` (`texte`, `nombre`, `case`, `date` ou `selection`), `rang` (rang de F-029), `supprimee` (booléen) ; pour une colonne `selection` seulement, `options`, une `Y.Map` créée dans la transaction qui crée la colonne : clé, l'identifiant de l'option ; valeur, une `Y.Map` à champs `libelle`, `rang`, `supprimee`.
- Type racine `lignes`, une `Y.Map` : clé, l'identifiant de la ligne ; valeur, une `Y.Map` à champs `rang`, `supprimee`, `cellules`, une `Y.Map` créée dans la transaction qui crée la ligne : clé, l'identifiant de la colonne ; valeur, une valeur simple. Une cellule vide s'écrit comme une clé absente : vider une cellule qui se lit non vide retire sa clé ; une cellule qui se lit déjà vide (clé absente, ou valeur non conforme) n'est pas réécrite.
- Valeur d'une cellule selon le type de sa colonne : `texte`, une chaîne de 2 000 unités au plus, écrite et lue sous sa forme normalisée (plus bas) ; `nombre`, un nombre fini, `-0` écrit et lu `0` ; `case`, un booléen ; `date`, une chaîne `AAAA-MM-JJ` du calendrier grégorien étendu, du `0001-01-01` au `9999-12-31` (F-017 H13) ; `selection`, l'identifiant d'une option lue de la colonne.
- Type racine `versions`, un `Y.Array` : rien n'est inscrit pour la version 1. Lecture par la fonction du document de page (`lireFormeStockee`, `format-page.ts`) : le plus grand entier supérieur ou égal à 1, 1 si le tableau est vide ; une entrée qui n'est pas un tel entier, ou une entrée nommée, rend le document non pris en charge. Version prise en charge : 1, constante interne, non exportée ; pas de table des versions.
- Reconnaissance : avant toute lecture, la version (refus `version-non-prise-en-charge`), puis la liste blanche des types racine de `doc.share` (refus `pas-un-document-de-table`, nouveau code). Un type racine du format déjà défini sous une autre nature est lu dans un `try` et vaut aussi `pas-un-document-de-table`. Un document refusé ne reçoit aucun type racine de la part du module. Un document vierge est une table sans colonne ni ligne.
- Lecture tolérante (F-017-AC20, AC21) : une colonne, une option ou une ligne mal formée (valeur qui n'est pas une `Y.Map`, champ manquant ou de mauvais type, type inconnu, nom de plus de 200 unités ou libellé de plus de 100, rang non admis par F-029) est ignorée ; une cellule non conforme au type de sa colonne, qui désigne une option absente, supprimée ou ignorée, se lit vide. Un champ en plus est toléré. L'ordre lu est le rang, puis l'identifiant, comparés par unités de code.
- Normalisation des chaînes : un nom, un libellé ou un texte de cellule est écrit et lu sous sa forme normalisée, où chaque unité UTF-16 isolée devient U+FFFD, longueur inchangée : ce que lit toute réplique qui reçoit la chaîne par l'encodage V1 (constat 6). Aucune chaîne n'est refusée pour cela ; les limites se mesurent sur la chaîne reçue. Fonction `formeNormalisee`, `packages/document/src/table.ts`, appelée par `texteAdmis`, qui sert `nomAdmis`, `libelleAdmis` et le contrôle du type `texte`.
- Écritures : la lecture n'écrit jamais. Le module n'écrit que les champs qu'il nomme, et ne retire jamais rien d'autre qu'une clé de cellule. `creerDocumentTable` construit son `Y.Doc` par `new Y.Doc({ gc: true })` ; `ouvrirDocumentTable(doc)` ne règle rien.
- Règle d'élévation, pour toute feature future : une version N+1 est nécessaire dès qu'un document qu'elle écrit serait lu autrement par le code de la version N (nouveau type racine, nouveau champ porteur de sens, nouveau type de colonne, règle de lecture changée). Elle ajoute N+1 à `versions` dans la transaction même qui écrit le premier élément nouveau, n'en retire jamais rien, et la liste blanche suit. Ajouter un type racine sans élever la version fait refuser le document par les répliques de la version N, avec le code `pas-un-document-de-table`.

## Conséquences

- Un document de table ne rétrécit jamais par une suppression de colonne, d'option ou de ligne : elles gardent tout leur poids (constat 8). L'effacement réel est à F-025, comme pour une page supprimée ; le ramasse-miettes actif borne au moins l'historique des cellules réécrites.
- « Dernière écriture gagne » (F-017 H6) se départage, entre écritures concurrentes, par le `clientID` de la réplique, pas par l'heure ; vider une cellule perd contre une écriture concurrente. Les tests n'exigent que « l'une des deux, la même partout » (F-017-AC12).
- Une table qui reçoit ses mises à jour dans le désordre peut exposer un temps une ligne ou une colonne ignorée faute d'un champ (constat 5) : la convergence (F-017-AC10) vaut une fois toutes les mises à jour reçues, et les abonnés voient ces états transitoires.
- La normalisation rend F-017-AC12, AC16 et AC21 vrais pour les chaînes à unité isolée : la réplique qui écrit lit ce que lisent les autres, et une valeur forgée par un pair qui contourne le module se lit normalisée sur toutes les répliques. Seules les clés forgées divergent encore : un identifiant de colonne, d'option ou de ligne à unité isolée, écrit par un tel pair, est lu brut sur sa réplique et avec U+FFFD sur les autres ; le module n'écrit que des UUID. Les titres de page du document d'espace (F-001) ont le même défaut, hors de cet ADR.
- Le module ne détruit jamais ce qu'il ne comprend pas : une réplique d'une version plus ancienne refuse un document plus récent (F-017-AC22) mais n'y retire rien. Une seconde barrière de version, comme la réplique de la page affichée (ADR-0009, amendement F-012 et F-013), n'est donc pas nécessaire, et ni la version ni sa lecture ne sont exportées.
- Le document de table et le document de page partagent le nom et la forme du type racine `versions` : `format-table.ts` importe la lecture de `format-page.ts`. Changer la forme stockée de la version de l'un change celle de l'autre.
- La liste blanche rend tout ajout de type racine incompatible avec les versions antérieures : c'est voulu, la règle d'élévation l'accompagne.
- Le serveur ne lit pas le document de table et ne contrôle pas sa version (ADR-0013) : il relaie et stocke ce qu'un `editeur` écrit. Un pair qui contourne le module peut rendre une table illisible (version forgée, type racine étranger) pour tous ses membres, sans perte de contenu.
- Revenir sur cette forme (passer les lignes en `Y.Array`, retirer les drapeaux, déplacer la version) demanderait une migration de chaque document de table sur chaque appareil et sur le serveur.
