# F-017 — Conception (mode rapide) : document de table

Date : 2026-10-16
Spec : `specs/F-017.md`, validée, lue sur la branche `F-017` à `eb2668f` (tête de F-028, version 2 du document de page, non encore fusionnée dans `main`). ADR : ADR-0016 (format du document de table, proposé). Veille : `MEMORY/VEILLE.md`, « Yjs 13.6.33 — rafraîchissement et constats pour le modèle de table » (2026-10-16), citée ici par ses constats numérotés.

Note courte, écrite avant le code, en mode rapide (ROADMAP) : pas de plan par blocs ni de gate de conception. `ARCHITECTURE.md` décrit `main` et n'est pas touché ici : il sera aligné après la fusion de F-017.

## Nom et préfixe du document

Rien de nouveau. Le nom est déjà fixé par l'amendement F-012 et F-013 de l'ADR-0001 et produit par `nomDeDocument` (`packages/contrats/src/synchro.ts`) : `table:<idEspace>:<idTable>`, cohérent avec `espace:<idEspace>` et `page:<idEspace>:<idPage>` ; base locale `notionlike:table:<idEspace>:<idTable>` (F-002 H3). Le type `table` est déjà admis par le nom et par la base serveur. Le modèle de F-017 ne connaît ni l'espace ni la table et ne produit aucun nom (F-017 H2) ; `idTable` sera l'identifiant de la page qui porte la table (cible de F-018).

## Forme stockée et version (ADR-0016)

Trois types racine, et rien d'autre dans `doc.share` :

| Racine     | Type                               | Entrée                                                                                                                                                                  |
| ---------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `colonnes` | `Y.Map` : identifiant → `Y.Map`    | `nom`, `type`, `rang`, `supprimee` ; `options` (colonne `selection` seulement), `Y.Map` : identifiant → `Y.Map` (`libelle`, `rang`, `supprimee`), créée avec la colonne |
| `lignes`   | `Y.Map` : identifiant → `Y.Map`    | `rang`, `supprimee`, `cellules`, `Y.Map` : identifiant de colonne → valeur simple, créée avec la ligne ; cellule vide = clé absente                                     |
| `versions` | `Y.Array` d'entiers, lu au maximum | vide pour la version 1 ; même forme et même fonction de lecture que le document de page (`lireFormeStockee`, ADR-0009)                                                  |

- Ordre des colonnes, des options et des lignes : rang de F-029 (chaîne de 62 chiffres, au plus 1 024 unités, `estUnRang`), puis identifiant, par unités de code. Une entrée au rang non admis est ignorée à la lecture ; aucun rang non admis n'est écrit : `format-table.ts` n'écrit un `rang` que de type marqué `RangAdmis`, produit par sa seule fonction `admettreRang` (même parade que `PlaceAdmise`, F-029-AC6).
- Suppression : drapeau `supprimee` sur la colonne, l'option ou la ligne (F-017 H5 ; veille, constat 3). Seul retrait de clé du module : vider une cellule.
- Version : aucune table des versions, constante interne `VERSION_TABLE_PRISE_EN_CHARGE = 1`, rien d'exporté. Élévation : ajout seul à `versions`, dans la transaction qui écrit le premier élément qu'une version antérieure lirait autrement (ADR-0016, « Règle d'élévation »).
- `creerDocumentTable()` : `new Y.Doc({ gc: true })` (veille, constat 8), rien d'écrit. `ouvrirDocumentTable(doc)` : n'écrit rien, ne lève pas.

## Interface publique

Par `src/index.ts`, sans sous-chemin (F-017 H10). Douze noms nouveaux, vingt-sept en tout :

```ts
export type IdColonne = string;
export type IdLigne = string;
export type IdOption = string;
export type TypeDeColonne = "texte" | "nombre" | "case" | "date" | "selection";
export type ValeurDeCellule = string | number | boolean; // une cellule vide se lit `null` (H12)

export interface OptionLue {
  readonly id: IdOption;
  readonly libelle: string;
}
export interface ColonneLue {
  readonly id: IdColonne;
  readonly nom: string;
  readonly type: TypeDeColonne;
  readonly options: readonly OptionLue[]; // vide hors `selection`
}
export interface LigneLue {
  readonly id: IdLigne;
  readonly cellules: readonly (ValeurDeCellule | null)[]; // alignées sur `TableLue.colonnes`
}
export interface TableLue {
  readonly colonnes: readonly ColonneLue[];
  readonly lignes: readonly LigneLue[];
}

export interface DocumentTable {
  readonly doc: Y.Doc;
  lire(): TableLue;
  abonner(rappel: () => void): () => void;
  creerColonne(nom: string, type: TypeDeColonne, position?: number): IdColonne;
  renommerColonne(colonne: IdColonne, nom: string): void;
  deplacerColonne(colonne: IdColonne, position: number): void;
  supprimerColonne(colonne: IdColonne): void;
  ajouterOption(colonne: IdColonne, libelle: string, position?: number): IdOption;
  renommerOption(colonne: IdColonne, option: IdOption, libelle: string): void;
  deplacerOption(colonne: IdColonne, option: IdOption, position: number): void;
  retirerOption(colonne: IdColonne, option: IdOption): void;
  creerLigne(valeurs?: ReadonlyMap<IdColonne, ValeurDeCellule | null>, position?: number): IdLigne;
  deplacerLigne(ligne: IdLigne, position: number): void;
  supprimerLigne(ligne: IdLigne): void;
  ecrireCellule(ligne: IdLigne, colonne: IdColonne, valeur: ValeurDeCellule | null): void;
  fermer(): void;
}
export function creerDocumentTable(): DocumentTable;
export function ouvrirDocumentTable(doc: Y.Doc): DocumentTable;
```

- Façade sur le modèle complet de `DocumentEspace` (question de `ROADMAP.md` sur F-017 H10) : résultat de `lire()` gardé, même référence tant que la table lue ne change pas ; écouteur `afterTransaction`, relecture et comparaison de la table lue avant chaque notification (F-017-AC9 ; veille, constat 4 : ni `afterTransaction` ni `observeDeep` ne disent que la table lue a changé) ; diffusion sous garde avec `console.error` ; `fermer()`, puis `facade-fermee` ; notifications à l'entrée et à la sortie d'un état refusé (version, autre format). Les opérations relisent le document avant de valider ; un refus ou une opération sans effet (même nom, même valeur, même position) n'ouvre aucune transaction. Identifiants par `crypto.randomUUID()`.
- `lire()` lève `version-non-prise-en-charge` ou `pas-un-document-de-table` quand le document est refusé (F-017-AC22, AC23).
- `ValeurDeCellule | null` en écriture : `null` vide la cellule. `ReadonlyMap` plutôt qu'un objet pour les valeurs initiales : aucune clé héritée du prototype.
- Extension du test de couture de F-002-AC31 aux façades de table (question de `ROADMAP.md`) : non exigée par F-017, qui n'a aucun appelant dans `apps/web` ; à la charge de F-018, premier appelant.

## Codes d'erreur

Repris (F-017 H11) : `facade-fermee`, `version-non-prise-en-charge`, `position-invalide`, `rang-indisponible`. Neuf codes nouveaux, dix-neuf en tout :

| Code                       | Refus                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pas-un-document-de-table` | type racine étranger dans `doc.share`, ou racine du format déjà définie sous une autre nature (AC23)          |
| `type-de-colonne-inconnu`  | type demandé hors des cinq (AC19)                                                                             |
| `nom-non-admis`            | nom de colonne de plus de 200 unités UTF-16, ou chaîne mal formée (AC19)                                      |
| `libelle-non-admis`        | libellé d'option de plus de 100 unités, ou chaîne mal formée (AC19)                                           |
| `ligne-introuvable`        | ligne absente, ignorée ou supprimée (AC17)                                                                    |
| `colonne-introuvable`      | colonne absente, ignorée ou supprimée, y compris parmi les valeurs initiales d'une ligne (AC17)               |
| `colonne-sans-options`     | opération d'option sur une colonne qui n'est pas `selection`                                                  |
| `option-introuvable`       | option absente, ignorée ou retirée (AC17)                                                                     |
| `valeur-non-conforme`      | valeur non conforme au type de la colonne, dont un texte mal formé et une option non lue de la colonne (AC18) |

Ordre des contrôles, le premier qui échoue donne le code : `facade-fermee` ; `version-non-prise-en-charge` ; `pas-un-document-de-table` ; arguments (`type-de-colonne-inconnu`, `nom-non-admis`, `libelle-non-admis`) ; cibles (`ligne-introuvable`, `colonne-introuvable`, `colonne-sans-options`, `option-introuvable`) ; `valeur-non-conforme` ; `position-invalide` (entier de 0 au nombre d'éléments de destination, élément déplacé exclu) ; `rang-indisponible` (inatteignable à la borne de 1 024).

## Fichiers de `packages/document/src`

| Fichier                        | Rôle                                                                                                                                                                                                                                                                                                                                        | Importe                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `table.ts` (nouveau, pur)      | types publics de la table ; limites (200, 100, 2 000) ; `estBienFormee` (boucle sur les unités, `String.prototype.isWellFormed` étant hors de la `lib` ES2023) ; `estUneDate` (sans objet `Date`, H13) ; conformité d'une valeur ; passage des entrées retenues à la table lue (filtres, ordre, cellules) ; comparaison de deux tables lues | rien (au plus `erreurs.ts` et `rang.ts`, que le contrat admet)                       |
| `format-table.ts` (nouveau)    | seul fichier qui connaît les noms des racines et des champs : reconnaissance (version, liste blanche), lecture et validation des entrées brutes, écritures, `admettreRang`                                                                                                                                                                  | `yjs`, `rang.ts`, `table.ts`, `erreurs.ts`, `format-page.ts` (lecture de `versions`) |
| `document-table.ts` (nouveau)  | façade `DocumentTable`, `creerDocumentTable`, `ouvrirDocumentTable`, validations et ordre des refus, insertion aux positions, abonnement, fermeture                                                                                                                                                                                         | `yjs`, `table.ts`, `format-table.ts`, `rang.ts`, `erreurs.ts`                        |
| `rang.ts` (modifié)            | reçoit `insertionParmi(rangs, position, longueurMax)`, extraite de `document-espace.ts` : rang inséré et rangs réattribués (égalité, puis réattribution élargie), ou `AUCUN_RANG_ADMIS`                                                                                                                                                     | rien                                                                                 |
| `document-espace.ts` (modifié) | appelle `insertionParmi` à la place de ses trois fonctions privées, comportement inchangé (tests de F-001 et de F-029 inchangés)                                                                                                                                                                                                            | inchangé                                                                             |
| `erreurs.ts` (modifié)         | neuf codes ajoutés à la fin de l'union                                                                                                                                                                                                                                                                                                      | rien                                                                                 |
| `index.ts` (modifié)           | douze réexports                                                                                                                                                                                                                                                                                                                             | + `document-table.ts`, `table.ts` (types)                                            |

Sens : `index → document-table → format-table → table, rang, erreurs, format-page`. `document-table` n'importe ni `document-espace` ni `document-page` ; `table.ts` rejoint le cœur pur (fichier protégé plus bas). F-017 H9 dit « calcul des rangs réutilisé » : l'extraction évite de dupliquer la réattribution élargie de F-029, seule logique subtile commune aux deux façades.

## Prouvé par propriétés (fast-check, graine fixe d'`aides.ts`)

- F-017-AC10 : suites quelconques d'opérations sur deux ou trois répliques, mises à jour échangées dans un ordre tiré ; toutes lisent la même table, égale à celle d'une réplique qui reçoit tout.
- F-017-AC16 : suite quelconque, état encodé (V1) appliqué à un `Y.Doc` vierge, même table.
- F-017-AC13 : créations concurrentes à une même position tirée, toutes conservées, même ordre partout.
- F-017-AC6 : un déplacement tiré ne change ni l'ordre relatif des autres ni aucune cellule.
- F-017-AC9 : pour une suite tirée d'opérations et d'applications de mises à jour, nombre de notifications égal au nombre de transactions qui changent `lire()` (comparaison profonde avant et après).
- F-017-AC20, AC21 : entrées brutes forgées par écriture directe dans le `Y.Doc` (valeurs de tout type, `Y.Text`, tableaux, `NaN`, `Infinity`, `-0`, chaînes mal formées, rangs non admis) : `lire()` ne lève jamais, deux répliques lisent la même table, et toute valeur exposée est conforme à son type.
- `estUneDate` : tout jour de `0001-01-01` à `9999-12-31` accepté, comparé à un oracle de test (`Date` en UTC, `setUTCFullYear`), et toute chaîne tirée hors de ce format refusée ; en plus de la table de cas d'F-017-AC18, tenue en un seul endroit.

Par exemples seulement : AC1 à AC5, AC7, AC8, AC11, AC12 (« l'une des deux, la même partout » : le départage est par `clientID`, constat 2), AC14, AC15, AC17 à AC19, AC22 à AC25.

## F-017-AC25 : paquets énumérés et listes fermées à étendre

Paquets du workspace qui déclarent `@notionlike/document` (relevé du 2026-10-16) : `apps/web` (`dependencies`) et `apps/server` (`devDependencies`). Le test de couture, dans `packages/document/test/`, lit les manifestes de `apps/*` et `packages/*` (les trois champs de dépendances), exige exactement ces deux paquets, lance pour chacun son script `typecheck` (`pnpm --filter <nom> run typecheck`, environ 4 secondes chacun ; délai du test porté à 60 secondes), et exige que chacun soit un projet de la configuration Vitest racine (`apps/*/vitest.config.ts`) : leurs tests tournent dans le même `pnpm test` que la couture, qui échoue donc avec eux. Lancer leurs suites depuis la couture doublerait la suite et ses délais (PGlite) : écart d'interprétation signalé au dev.

Le même test compare la liste des exports (vingt-sept noms) et la liste des codes (dix-neuf) à des listes attendues. Listes fermées existantes que F-017 doit étendre, sans retirer ni affaiblir aucune vérification :

- `packages/document/test/borne-contrat.test.ts` : `EXPORTS_DU_PAQUET` et la liste des codes ;
- `packages/document/test/page-version.test.ts` : `CODES_ATTENDUS` (`satisfies Record<CodeErreurDocument, true>`) ;
- `apps/web/test/structure.test.ts` : les deux listes des valeurs exportées (+ `creerDocumentTable`, `ouvrirDocumentTable`) ;
- `apps/web/test/coutures.test.ts` : `CODES_DU_DOCUMENT` et le compte de dix codes du test des messages ;
- `apps/web/test/corbeille-coutures.test.ts` : `CODES` ;
- `apps/web/src/interface/messages.ts` : `MESSAGE_PAR_CODE` (`Record<CodeErreurDocument, string>`), un message français par code nouveau. C'est le seul fichier de code hors de `packages/document` que F-017 touche.

`apps/server` n'a aucune liste exhaustive des codes : sa vérification de types suffit.

## Fichiers protégés

Un seul, `.dependency-cruiser.cjs` : `table.ts` rejoint le contrat `document-coeur-pur` (ADR-0003, « Organisation interne » : un fichier pur s'y ajoute). Aucun `package.json`, aucun `vitest.config.*`, aucun `tsconfig*.json`, aucune dépendance nouvelle.

```diff
diff --git a/.dependency-cruiser.cjs b/.dependency-cruiser.cjs
--- a/.dependency-cruiser.cjs
+++ b/.dependency-cruiser.cjs
@@ -209,9 +209,9 @@ module.exports = {
       name: "document-coeur-pur",
       severity: "error",
       comment:
-        "ADR-0003 : rang, arbre et erreurs sont purs ; ils n'importent qu'eux-mêmes (ni yjs, ni format, ni document-espace).",
-      from: { path: "^packages/document/src/(rang|arbre|erreurs)\\.ts$" },
-      to: { pathNot: "^packages/document/src/(rang|arbre|erreurs)\\.ts$" },
+        "ADR-0003, ADR-0016 : rang, arbre, table et erreurs sont purs ; ils n'importent qu'eux-mêmes (ni yjs, ni format, ni format-table, ni façade).",
+      from: { path: "^packages/document/src/(rang|arbre|table|erreurs)\\.ts$" },
+      to: { pathNot: "^packages/document/src/(rang|arbre|table|erreurs)\\.ts$" },
     },
     {
       name: "web-y-indexeddb-confinee",
```

Essai (copie de la racine et de `packages/document` dans le scratchpad, `node_modules` liés, `depcruise` 18 du dépôt, sur `packages`) : sans `table.ts`, `✔ no dependency violations found (36 modules, 105 dependencies cruised)` ; `table.ts` pur et `format-table.ts` qui importe `yjs`, `rang.ts`, `table.ts`, `erreurs.ts`, `format-page.ts` : aucune violation (38 modules) ; `table.ts` qui importe `yjs` : `error document-coeur-pur`, code 1, alors que la règle actuelle laisse passer (code 0) ; `table.ts` qui importe `format-table.ts` : `document-coeur-pur` et `pas-de-cycle` ; `table.ts` qui importe `erreurs.ts` : admis ; `table.ts` qui importe un voisin `tableau.ts` : refusé. Dans le dépôt réel, avec la règle proposée, `apps packages` : `✔ no dependency violations found (508 modules, 2127 dependencies cruised)`. `git apply --check` passe, et `prettier` (configuration du dépôt) ne change rien au fichier modifié. Quarante et une règles, inchangé.

## Écarts de spec à trancher par le dev

1. Chaînes mal formées (unités UTF-16 isolées ; veille, constat 6). F-017-AC18, AC19, AC20 et AC21 n'en disent rien, et F-017-AC12 et AC16 sont faux pour elles. Retenu : refus à l'écriture (`nom-non-admis`, `libelle-non-admis`, `valeur-non-conforme`) et lecture comme non conformes (colonne ou option ignorée, cellule vide). Limite : une chaîne mal formée écrite par un pair qui contourne le module diverge encore sur la réplique de ce pair, contrairement à « de la même façon sur toutes les répliques » d'F-017-AC21. Le même défaut touche les titres de page du document d'espace (F-001), hors de F-017.
2. F-017-AC25, « ses tests » : interprété comme « ses tests tournent dans le même `pnpm test` » (plus haut), pas comme une seconde exécution lancée par la couture.
3. F-017-AC9 : une livraison dans le désordre peut faire notifier un état transitoire (ligne ou colonne ignorée un temps ; veille, constat 5) : conforme à la lettre du critère, à savoir pour F-018.
4. F-017 H6 : « dernière écriture » se départage par `clientID`, pas par l'heure ; vider une cellule perd contre une écriture concurrente (veille, constat 2).
5. Codes et opération non nommés par la spec : `colonne-sans-options` (opération d'option sur une colonne qui n'est pas `selection`) ; `-0` écrit `0`.
6. `apps/web/src/interface/messages.ts` est modifié (messages des neuf codes), alors que le « Pourquoi ce tier » et `ROADMAP.md` disent que F-017 ne modifie que `packages/document` : conséquence directe du `Record<CodeErreurDocument, string>` et de F-017-AC25. À ajouter aux dossiers disjoints du parallélisme avec F-006 et F-015.
