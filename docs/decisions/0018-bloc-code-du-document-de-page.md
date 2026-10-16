# ADR-0018 — Bloc code du document de page : nœud `codeBlock` et attribut `language` en version 3, langage ouvert dans le format, fermé dans l'application

Statut : proposé
Date : 2026-10-16

## Contexte et problème

F-005 (`specs/F-005.md`, validée, structurel) ajoute au document de page un bloc code qui porte un langage facultatif. Chaque appareil, puis le serveur (F-012), conservent ce que le client écrit dans le fragment du contenu (ADR-0009) : trois choix s'y figent.

1. Le numéro de version qui introduit le bloc code. Un numéro livré ne change plus jamais de sens (F-005 H1) : une application qui prend en charge la version N ouvre les versions 1 à N et refuse les suivantes (F-003-AC19).
2. La forme du nœud dans le fragment : son nom, ses attributs, son contenu. La liaison de Tiptap supprime tout nœud inconnu de son schéma (ADR-0009, « Contexte ») : un nom ou un attribut changé plus tard demanderait de convertir chaque page sur chaque appareil.
3. Ce que vaut l'attribut `language`. Un autre client peut écrire n'importe quelle valeur dans le fragment, et l'extension de Tiptap recopie cette valeur dans une classe de l'élément `code` sans la valider (veille du 2026-10-08, « Tiptap 3.31.4 — bloc code » : `x fixed inset-0` habille l'élément des classes utilitaires de l'application).

## Options étudiées

Numéro de version :

- a. **Version prise en charge par `main` au premier commit de code, plus un, soit 3** (retenue) : règle H1 de la spec, commune à F-005, F-016, F-022 et F-028 ; F-028 a pris la version 2 (`packages/document/src/format-page.ts`).
- b. Un numéro réservé d'avance par feature. Écartée par la spec (H1) : il serait faux dès qu'une livraison s'inverse.

Forme du nœud :

- A. **Le nœud de l'extension unitaire `@tiptap/extension-code-block` 3.31.4, tel quel dans le fragment** (retenue) : élément `codeBlock`, contenu de texte seul, sans marque, un seul attribut `language`, absent quand il est nul (F-005-AC28, H7 a). Aucun nouveau type racine, aucun nouvel export de `@notionlike/document` (F-005-AC32).
- B. Un nœud maison (nom et attributs propres). Écartée : la liaison et les commandes de l'extension seraient à réécrire, pour un format qui ne dirait rien de plus.
- C. Des sauts de ligne par un nœud `hardBreak` hors du bloc code. Écartée : un nœud de plus dans le schéma, donc dans la ligne 3, que ni la fiche ni la spec ne demandent.

Valeur de `language` :

- i. **Ouverte dans le format, fermée dans l'application** (retenue, F-005 H5) : le format admet toute chaîne ; l'application ne propose, n'écrit et ne rend que les dix identifiants de sa liste (`bash`, `css`, `html`, `javascript`, `json`, `markdown`, `python`, `sql`, `typescript`, `yaml`), et lit toute autre valeur comme « Texte brut » sans rien écrire (F-005-AC9, AC35). Allonger la liste n'incrémente pas la version.
- ii. Une liste fermée dans le format (valeur hors liste = document non pris en charge). Écartée : chaque langage ajouté coûterait une version et exclurait les applications plus anciennes de toute page qui l'emploie.
- iii. Valeur libre, rendue telle quelle. Écartée : c'est l'injection de classes constatée par la veille.

## Décision

- **Ligne 3 de `TABLE_DES_VERSIONS_PAGE`** (`packages/document/src/format-page.ts`), ajoutée sans retoucher les lignes 1 et 2 :

  ```ts
  // F-005 : bloc code, avec le seul attribut `language` (F-005-AC23, AC28).
  {
    version: 3,
    noeuds: {
      bulletList: [],
      codeBlock: ["language"],
      doc: [],
      heading: ["level"],
      listItem: [],
      orderedList: ["start", "type"],
      paragraph: [],
      text: [],
    },
    marques: ["bold", "italic", "link"],
    typesPartages: [],
  },
  ```

  `VERSION_PAGE_PRISE_EN_CHARGE` en découle (3). Le nœud est nouveau : `versionExigee` (`apps/web/src/page/session-page.ts`), qui ne regarde que les noms des nœuds et des marques, rend 3 dès qu'un `codeBlock` est inscrit, sans extension d'`ElementsDuFormat`. L'élévation reste celle de F-028 : `filterTransaction` du greffon `marquesDeLEditeur`, avant que la liaison n'écrive dans Yjs, dans sa propre transaction (F-005-AC25, H3).

- **Forme stockée** : `<codeBlock language="python">texte</codeBlock>` dans le fragment `contenu` ; `language` omis quand il est nul ; ni marque, ni bloc imbriqué. La forme stockée de la version (`versions`, ADR-0009) ne change pas.
- **Langage** : la liste fermée vit dans le module d'édition, en un seul fichier, avec une seule fonction qui admet ou refuse une valeur. Elle s'applique à l'écriture, par une garde unique qui couvre tous les chemins, et au rendu, qui ne dérive une classe que d'un identifiant de la liste. Le langage n'est jamais lu du presse-papiers (F-005-AC7, AC36). Le détail est dans `docs/decisions/F-005-conception.md`.

## Conséquences

- Dès qu'un bloc code est inscrit dans une page, une application qui ne prend en charge que la version 2 refuse la page entière (F-003-AC19), sans lecture seule ; une page sans bloc code reste en version 1 ou 2 (montée paresseuse, F-005 H2). Une annulation n'abaisse pas la version (F-005-AC26).
- Le format est celui de l'extension de Tiptap : changer de bibliothèque d'édition demanderait de garder le nom `codeBlock` et l'attribut `language`, ou de convertir les pages.
- Le fragment peut porter des langages que l'application ne connaît pas, écrits par un autre client : ils restent stockés, affichés en « Texte brut », jamais recopiés dans le DOM. Ajouter un langage à la liste, ou une coloration syntaxique (F-005 H4), ne fait que lire un attribut déjà présent, sans version de plus ; les identifiants devront alors coïncider avec ceux de la bibliothèque de coloration retenue, ou être convertis.
- Un bloc code déplacé (F-006) ou recopié avec un langage hors liste est réinscrit sans langage : la valeur forgée disparaît à la première écriture locale du bloc, jamais à la lecture.
- Changer le type d'un bloc pendant qu'un autre client y écrit perd la saisie concurrente (F-005 H8, AC31) : constat figé par un test, propriété de `@tiptap/y-tiptap`, pas garantie de ce format ; la lever demanderait des identifiants de bloc, donc une version de plus (même limite que l'ADR-0015 pour le déplacement).
