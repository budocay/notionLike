# F-018 — Conception (mode rapide) : vue tableau d'une base de données

Date : 2026-10-16
Spec : `specs/F-018.md`, validée, structurel, lue sur la branche `F-018` à `55f1228` (`main` `f6871c3` plus la veille de F-018). ADR : amendement F-018 de l'ADR-0002 (type des pages, version 2 du document d'espace, proposé) et ADR-0019 (écran de table, réglages de vue, proposé). Veille : `MEMORY/VEILLE.md`, sections du 2026-10-16 « TanStack Table … rafraîchissement pour F-018 », « Champ `<input type="date">` … rafraîchissement pour F-018 », « y-indexeddb 9.0.12 et Yjs 13.6.33 — rafraîchissement pour F-018 », et celle du 2026-10-08 sur `localStorage`.

Note courte, écrite avant le code. `ARCHITECTURE.md` décrit `main` et n'est pas touché ici : il sera aligné après le code.

## Écarts avec la spec, à trancher par le dev avant le code

1. **Serveur et contrat** (H12 dit « dans `apps/web` seulement »). Le serveur n'admet que la version 1 du document d'espace (ADR-0002, amendement F-012) : sans changement, la première table d'un espace adopté fait fermer l'ouverture par `version-refusee`, et la couture de F-018-AC8 (tests d'`apps/server`) échoue dès que le paquet admet 2 (`apps/server/test/synchro-document.test.ts`, F-012-AC39). F-018 doit donc toucher `packages/contrats/src/synchro.ts` (admises `[1, 2]`, nom du type racine `versions`) et `apps/server/src/synchro-stockage.ts` (lecture de la version par la règle de l'amendement F-018). Proposition : ajouter `reviewer-backend` et `reviewer-api` à la ligne `Revue :`, et `agent-backend` aux agents.
2. **Tests de F-001 et F-007 qui figent le refus d'une version 2** (prérequis de la spec : « la conception en donne la liste exacte ») : `packages/document/test/robustesse.test.ts` (cas `"2"` du tableau `VERSIONS_NON_PRISES_EN_CHARGE`, écritures de `2` aux lignes 577 et 615), `packages/document/test/fermeture.test.ts` (`VERSION_NON_PRISE_EN_CHARGE = 2`, ligne 18) : `2` devient `3`, rien d'autre. Hors de la liste permise par la spec, à accepter aussi : `packages/document/test/corbeille.test.ts` ligne 296 (F-007, même écriture de `2`), `apps/web/test/aides-format.ts` ligne 11 (aide de F-002, constante lue par dix fichiers), `apps/server/test/synchro-document.test.ts` (cas `["2", 2]` de F-012-AC38) et `packages/contrats/test/synchro.test.ts` (F-012-AC39, `admises: [1]`).
3. **Type des pages lues** : `PageLue` gagne `readonly type?: "table"`, absent pour une page (même convention que le format : champ absent = page). Un champ obligatoire `type: "page" | "table"` ferait échouer une dizaine de comparaisons littérales de tests de F-001 et F-007 (`operations`, `abonnement`, `corbeille`, `corbeille-convergence`), que la spec interdit de modifier. Le type nommé `TypeDePage = "page" | "table"` est exporté pour les consommateurs (synchronisation).
4. **Bibliothèque de table : repli de H8 retenu** (grille écrite par le projet). Aucune condition de repli n'est déclenchée, mais la veille juge la bibliothèque « utile, non nécessaire » et la spec permet le repli sans changer de critère ; raisons dans l'ADR-0019 (sans tête, cinq paquets, API récente, aucun changement du verrou, ce qui garde F-018 disjointe de F-005 sur `pnpm-lock.yaml`). Si le dev préfère TanStack Table : `pnpm --filter @notionlike/web add --save-exact @tanstack/react-table@9.2.8` (9.3.1 est sous le seuil de 7 jours), sans autre changement des règles proposées.
5. **H7 et H8 sont périmées** : elles disent la veille absente alors que `MEMORY/VEILLE.md` couvrait TanStack Table et le champ de date dès le 2026-10-08 ; la veille du 2026-10-16 ajoute que le champ de date émet dans Chromium un `change` par chiffre de l'année avec des dates intermédiaires valides, et que `badInput` vaut toujours `false` sous jsdom.
6. **Fichier protégé en plus** : `eslint.config.mjs` (le `localStorage` est interdit dans tout `apps/web/src`), en plus de `.dependency-cruiser.cjs` que la spec nomme. Textes en annexe.

## Rattachement d'une table à l'arbre (`packages/document`)

Détail dans l'ADR-0002, amendement F-018. En bref : champ `type: "table"` dans l'entrée, écrit à la création seulement ; aucune règle d'arborescence nouvelle ; version 2 écrite par la création d'une table dans sa transaction, sous deux formes ensemble (`meta.version = 2`, barrière des applications de version 1 ; `2` ajouté au type racine `versions`, lu au maximum).

- Interface : `DocumentEspace.creerTable(titre, ou?)`, mêmes validations et même ordre de refus que `creerPage` (un seul chemin interne, paramétré par le type) ; `PageLue.type?: "table"` ; export de type `TypeDePage`. Vingt-huit noms exportés, onze membres de façade. Aucun code d'erreur nouveau.
- `arbre.ts` : `EntreePage` et `PageLue` portent le type ; `memeArborescence` le compare. `format.ts` : lecture et écriture du type, lecture de la version (importe `lireFormeStockee` et `typeDesVersions` de `format-page.ts`, sans le modifier), élévation. `document-espace.ts` : `creerTable`. `index.ts` : l'export.

## Ouverture d'une table et persistance locale (`apps/web/src/table/`)

- `tables-ouvertes.ts`, sur le modèle de `page/pages-ouvertes.ts` (non modifié) : au plus une session ; `new Y.Doc({ gc: true })` ; base `{ type: "table", idEspace, idTable }` par `ouvrirPersistance` ; garde d'onglet ; document modifié non enregistré conservé après la sortie et rendu à la réouverture, libéré après l'écriture (AC14) ; à la sortie, persistance fermée et `Y.Doc` détruit (AC16) ; `effacer(idEspace, ids)` ferme ce qui est tenu, efface la base de table et les réglages de vue de chaque identifiant (AC49).
- `session-table.ts` : phases `chargement`, `introuvable`, `version-non-prise-en-charge`, `illisible` (`pas-un-document-de-table`), `pret` (façade `DocumentTable`, `enregistre`, `baseRelue`, `reessayer`). L'état relu est jugé avant toute fusion par `soumettreLEtatRelu` (façade ouverte sur le témoin, `lire()`, puis fermée) : un refus ferme la persistance sans rien écrire (F-030-AC10, AC15). Aucune écriture à l'ouverture (`ouvrirDocumentTable` seul, jamais `creerDocumentTable`, H5).
- L'interface ouvre la session par un crochet `interface/table-ouverte.ts`, symétrique de `page-ouverte.ts` ; quand la page sélectionnée est une table, `usePageOuverte` reçoit `undefined` (aucun document de page, AC12, AC9).

## Écran de table et vue « Tableau » (`apps/web/src/vues-de-table/`)

Sans bibliothèque. Fonctions sans DOM, chacune prouvée sur une table de cas :

- `lignes-affichees.ts` : `lignesAffichees(table)` (ordre manuel, toutes les lignes) et `colonneDeTitre(table)` (première colonne `texte`) ; chaque vue reçoit les lignes déjà calculées, jamais `table.lignes` (AC45).
- `fenetre.ts` : `fenetre({ defilement, hauteurZone, hauteurRangee, nombre })` → `[debut, fin)`, rangées qui recoupent la zone plus 10 de chaque côté ; la rangée de la cellule en mode édition est ajoutée si elle en sort (AC46, AC47). Hauteur fixe, rangées placées par `transform`.
- `saisie.ts` : nombre (`-?[0-9]+([.,][0-9]+)?` après retrait des espaces de bord, puis `Number`, refus si non fini ; `,5` et `5,` refusés), texte (2 000 unités), date (valeur du champ telle quelle ; la conformité est jugée par la façade, `valeur-non-conforme` → « Saisissez une date valide. »).
- `affichage.ts` : `String(n)` avec la virgule, `JJ/MM/AAAA` par découpage de chaîne, libellé d'option ; ni `Intl`, ni `toLocale*` (AC26).
- `navigation-grille.ts` : table des touches → déplacement de la cellule courante (identifiants de ligne et de colonne, AC35), sans boucle ; Alt+Maj+flèches par `estLaFrappe` de `interface/raccourcis.ts`.
- `reglages.ts` : sections `vue` et `tableau` (ADR-0019), validation, défauts, largeur de 60 à 800, pas de 16.

Composants : `EcranDeTable.tsx` (états, invitation « Ajouter une colonne », sélecteur de vues dès deux vues, zone d'annonce `role="status"`), `vues.ts` (liste ordonnée des vues, « Tableau » seule), `VueTableau.tsx` (grille), en-tête de colonne (menu de commandes, séparateur de largeur), cellule (affichage et éditeur par type), panneau « Options ». Éditeurs : champ texte ; champ texte pour un nombre ; case cochée par Espace ou clic, sans mode édition ; `<input type="date" min="0001-01-01" max="9999-12-31">` ; `<select>` natif (« Aucune », puis les options ; « Gérer les options » si la colonne n'en a pas). Toute écriture se fait à la validation (Entrée, Tab, sortie du champ), jamais sur `onChange` (veille : un `change` par chiffre dans Chromium), et rien n'est écrit si la valeur est celle de la cellule (AC32). Confirmations par `BoiteDeDialogue` alerte d'`interface/composants/Espaces.tsx`, focus sur « Annuler ». Erreurs typées par `messageErreur` d'`interface/messages.ts`, qui couvre déjà les dix-neuf codes. Classes dans `interface/composants/table.classes.ts` (fichier analysé par Tailwind, jetons de F-004) ; seuls styles en ligne : `width`, `height`, `transform`, `top`.

Accessibilité : `role="grid"` avec `aria-rowcount` (lignes affichées plus l'en-tête) et `aria-colcount`, `role="row"` avec `aria-rowindex` sur chaque rangée présente, `columnheader`, `gridcell` ; un seul arrêt de tabulation (tabindex itinérant) ; commandes d'en-tête et de ligne dans un menu ouvert au clavier depuis la cellule, nom accessible qui cite la colonne ou la place de la ligne ; séparateur `role="separator"` focalisable (`aria-valuenow`, flèches) ; annonces des déplacements dans la zone `status`. Lecture seule (F-013-AC25) : la raison reçue de la synchronisation désactive toute action qui écrit, la navigation et les réglages restent.

## Synchronisation (AC51 à AC53)

ADR-0019 : la synchronisation reçoit le type de chaque identifiant (`Map` id → `TypeDePage` à la place de l'ensemble d'identifiants), nomme le document par `correspondance(type, …)` dans la passe de fond et pour le document affiché ; la table affichée est échangée sur le `Y.Doc` de `table/`, sans miroir ; `#bloquerLeDocument` reconnaît aussi `table:` ; les effacements (`stockage.ts`) traitent chaque identifiant comme AC49.

## Ce que les tests prouvent

Sous Vitest : le format, la version et la convergence dans `packages/document` (Node) ; la lecture de version côté serveur dans `apps/server` ; dans `apps/web` (jsdom) l'écran, la barre latérale, la grille, le clavier, les éditeurs, les confirmations, les réglages (`localStorage` de jsdom, bouchonné pour lever), la persistance (fake-indexeddb), la fenêtre sur 5 000 × 30 (hauteurs bouchonnées dans le fichier de test), les coutures (AC8, AC9, AC37, AC45, AC50, F-010-AC19, F-030-AC19, F-004-AC52) ; la synchronisation sous Node contre la fabrique d'essai.

En navigateur seulement (AC56, joué à la main, D-003) : le glissement du séparateur au pointeur, le défilement et la mise en page réels, la troncature visible, la frappe réelle dans le champ de date (événements par chiffre, `badInput`), le rendu des jetons. Non prouvé : tout temps chiffré ; la mesure de 5 000 lignes est au dev (H9).

## Plan par blocs (un commit par bloc)

0. Dev : `.dependency-cruiser.cjs` et `eslint.config.mjs` (annexe). Aucune installation.
1. `packages/document` : type, version 2, `creerTable`, export ; tests AC1 à AC8 et listes ; tests de F-001 de l'écart 2.
2. `packages/contrats` et `apps/server` : versions admises, lecture du type racine `versions` ; tests. Poussé avec le bloc 1 (la couture d'AC8 lance les tests du serveur).
3. `apps/web` : `persistance/reglages-de-vue.ts`, `table/` ; AC13, AC14, AC16, AC40 à AC42 (enveloppe), AC50.
4. `apps/web/src/interface` et `espace/session-espace.ts` : création depuis la barre, marque, sélection, écran de table (états, invitation), corbeille et suppression ; AC9 à AC12, AC15, AC17, AC48, AC49.
5. `vues-de-table/` : fonctions sans DOM puis grille, colonnes, options, lignes, cellules, clavier, mises à jour reçues ; AC18 à AC39, AC45 à AC47, AC54, AC55.
6. Réglages de vue : largeurs, vue active, sélecteur ; AC40 à AC44.
7. `synchronisation/` et branchement ; AC51 à AC53.
8. Scénario de bout en bout AC56 (`apps/web/e2e/`).

Lots de H15 : format (1, 2), ouverture et corbeille (3, 4), grille et réglages (5, 6), synchronisation (7).

## Fichiers touchés

`packages/document` : `src/arbre.ts`, `src/format.ts`, `src/document-espace.ts`, `src/index.ts` ; tests nouveaux `test/espace-tables*.test.ts` et leur aide ; modifiés `test/robustesse.test.ts`, `test/fermeture.test.ts`, `test/corbeille.test.ts`, `test/borne-contrat.test.ts`, `test/table-contrat.test.ts`. **Non touchés** : `src/format-page.ts` (seulement importé), `test/page-version.test.ts`, `package.json`.

`packages/contrats` : `src/synchro.ts`, `test/synchro.test.ts`. `apps/server` : `src/synchro-stockage.ts`, `test/synchro-document.test.ts`, `test/synchro-stockage.test.ts`.

`apps/web/src` : nouveaux `table/session-table.ts`, `table/tables-ouvertes.ts`, `vues-de-table/**`, `persistance/reglages-de-vue.ts`, `interface/table-ouverte.ts`, `interface/messages-tables.ts` (textes de la barre et de la corbeille), `interface/composants/table.classes.ts` ; modifiés `persistance/index.ts`, `espace/session-espace.ts`, `interface/Application.tsx`, `interface/ZonePrincipale.tsx`, `interface/BarreLaterale.tsx`, `interface/RangeePage.tsx`, `interface/EcranDeLaCorbeille.tsx`, `interface/synchronisation-ouverte.ts`, `interface/branchement-synchronisation.ts`, `interface/composants/Rangee.tsx`, `interface/composants/CadreDeBarre.tsx`, `interface/composants/Corbeille.tsx`, `interface/composants/MenuActions.tsx`, `interface/composants/Pictogramme.tsx` (pictogramme `table`), `synchronisation/index.ts`, `synchronisation/pages-de-l-espace.ts`, `synchronisation/passe-de-fond.ts`, `synchronisation/page-affichee.ts`, `synchronisation/synchronisation.ts`, `synchronisation/stockage.ts`. **Non touchés** : `edition/**`, `page/**`, `interface/messages.ts`, `interface/raccourcis.ts`, `interface/composants/Edition.tsx`, `styles/**`, `navigation/**`, `apps/web/package.json`, `pnpm-lock.yaml`, `vitest.config.*`.

`apps/web/test` : nouveaux `test/vues-de-table/**`, `test/table-*.test.ts(x)`, `test/synchronisation/tables.test.ts` ; modifiés `test/aides-format.ts`, `test/structure.test.ts` (liste des exports), `test/corbeille-coutures.test.ts` (constructeurs de `Y.Doc`), `test/reprise-coutures.test.tsx` (F-030-AC19), `test/coutures-f004.test.tsx` (F-004-AC52), `test/compte-client.test.ts` (F-010-AC19), et les aides de la coquille si l'écran de l'espace change de propriétés. `apps/web/e2e/tables.spec.ts`.

Protégés (dev) : `.dependency-cruiser.cjs`, `eslint.config.mjs`.

Recouvrements à surveiller. Avec F-006 (fusionnée avant le code de F-018) : `Application.tsx`, `BarreLaterale.tsx`, `RangeePage.tsx`, `ZonePrincipale.tsx`, `composants/Rangee.tsx`, `composants/MenuActions.tsx`, `composants/CadreDeBarre.tsx`, `test/structure.test.ts`, `test/coutures.test.ts` : fusionner `main` dans `F-018` avant le bloc 4. Avec F-005 (en parallèle) : aucun fichier de `packages/document/src` ni d'`edition/` en commun ; restent `.dependency-cruiser.cjs` (blocs distincts, deux commits du dev), `apps/web/test/structure.test.ts` si F-005 y touche, et `interface/composants/Pictogramme.tsx` si F-005 ajoute un pictogramme ; F-018 importe de `format-page.ts` `lireFormeStockee` et `typeDesVersions`, que F-005 ne doit pas renommer.

## Annexe : fichiers protégés

Texte exact, éprouvé sur une copie du dépôt à `55f1228` : `pnpm contrats` sans violation (quarante-six règles au lieu de quarante-deux), quatorze violations attendues levées par des fichiers fautifs posés puis retirés (yjs, `date-fns`, `@dnd-kit/core`, `@tanstack/react-virtual` et un fichier interne de la persistance depuis les vues ; React et les vues depuis `table/` ; un fichier interne des vues et `@tanstack/*` depuis l'interface et un test hors du module), aucune pour les imports admis ; `eslint` : `localStorage` admis dans `persistance/reglages-de-vue.ts` seul, `indexedDB` y reste refusé, `localStorage` et `notionlike:` refusés ailleurs ; Prettier conforme ; `git apply --check` vert sur les deux diffs. À appliquer par `git apply` depuis la racine du dépôt.

```diff
--- a/.dependency-cruiser.cjs
+++ b/.dependency-cruiser.cjs
@@ -306,11 +306,11 @@
       name: "web-src-liste-blanche",
       severity: "error",
       comment:
-        "ADR-0007, F-003-AC27, F-010, F-013 : hors persistance, espace, navigation, identifiants, édition, page, compte et synchronisation, le code d'apps/web n'importe que src/ (persistance et identifiants exceptés), les exports de @notionlike/document, react et react-dom : ni yjs, ni y-indexeddb, ni dépendance de test, ni module de Node.",
+        "ADR-0007, F-003-AC27, F-010, F-013, F-018 : hors persistance, espace, navigation, identifiants, édition, page, compte, synchronisation, table et vues de table, le code d'apps/web n'importe que src/ (persistance et identifiants exceptés), les exports de @notionlike/document, react et react-dom : ni yjs, ni y-indexeddb, ni dépendance de test, ni module de Node.",
       from: {
         path: "^apps/web/src/",
         pathNot:
-          "^apps/web/src/(persistance|espace|navigation|identifiants|edition|page|compte|synchronisation)/",
+          "^apps/web/src/(persistance|espace|navigation|identifiants|edition|page|compte|synchronisation|table|vues-de-table)/",
       },
       to: {
         pathNot: [
@@ -420,14 +420,70 @@
       to: {
         pathNot: [
           "^apps/web/src/page/",
+          "^apps/web/src/persistance/index\\.ts$",
+          "^apps/web/src/espace/garde-onglet\\.ts$",
+          "^packages/document/src/index\\.ts$",
+          "(^|/)node_modules/yjs/",
+        ],
+      },
+    },
+    {
+      name: "web-table-liste-blanche",
+      severity: "error",
+      comment:
+        "F-018, ADR-0019 : la session de table n'importe qu'elle-même, l'interface de la persistance, la garde d'onglet, les exports de @notionlike/document et yjs (ni React, ni les vues de table).",
+      from: { path: "^apps/web/src/table/" },
+      to: {
+        pathNot: [
+          "^apps/web/src/table/",
           "^apps/web/src/persistance/index\\.ts$",
           "^apps/web/src/espace/garde-onglet\\.ts$",
           "^packages/document/src/index\\.ts$",
           "(^|/)node_modules/yjs/",
+        ],
+      },
+    },
+    {
+      name: "web-vues-de-table-liste-blanche",
+      severity: "error",
+      comment:
+        "F-018-AC54, ADR-0019 : le module des vues de table n'importe que lui-même, l'interface de la persistance (réglages de vue), le type d'état de la session de table, les composants de présentation, les textes et les raccourcis de l'interface, les exports de @notionlike/document, react, react-dom et la seule bibliothèque de table admise : ni yjs (aucun type partagé lu ou écrit), ni bibliothèque de défilement virtuel, de dates ou de glisser-déposer.",
+      from: { path: "^apps/web/src/vues-de-table/" },
+      to: {
+        pathNot: [
+          "^apps/web/src/vues-de-table/",
+          "^apps/web/src/persistance/index\\.ts$",
+          "^apps/web/src/table/session-table\\.ts$",
+          "^apps/web/src/interface/composants/",
+          "^apps/web/src/interface/(messages|raccourcis)\\.ts$",
+          "^packages/document/src/index\\.ts$",
+          "(^|/)node_modules/(react|react-dom|@tanstack/react-table)/",
+          "^@tanstack/react-table$",
         ],
       },
     },
     {
+      name: "web-vues-de-table-par-son-interface",
+      severity: "error",
+      comment:
+        "F-018-AC54 : hors du module des vues de table et de ses tests (test/vues-de-table/), seul son index.ts est importable ; c'est l'interface qui n'expose aucun type de bibliothèque.",
+      from: { path: "^apps/web/", pathNot: "^apps/web/(src|test)/vues-de-table/" },
+      to: {
+        path: "^apps/web/src/vues-de-table/",
+        pathNot: "^apps/web/src/vues-de-table/index\\.ts$",
+      },
+    },
+    // F-018-AC54, par paquet. Deux expressions par cible, comme pour better-auth : le fichier installé
+    // et le nom tel qu'il est écrit, gardé quand le paquet n'est pas installé chez l'importateur.
+    {
+      name: "bibliotheque-de-table-reservee-aux-vues-de-table",
+      severity: "error",
+      comment:
+        "F-018-AC54, H8 : aucun paquet @tanstack/* n'est importé hors du module des vues de table d'apps/web (tests compris, ceux du module exceptés) ; le module lui-même n'admet que @tanstack/react-table (web-vues-de-table-liste-blanche).",
+      from: { pathNot: "^apps/web/(src|test)/vues-de-table/" },
+      to: { path: ["(^|/)node_modules/@tanstack/", "^@tanstack/"] },
+    },
+    {
       name: "web-composants-de-presentation",
       severity: "error",
       comment:
```

```diff
--- a/eslint.config.mjs
+++ b/eslint.config.mjs
@@ -65,9 +65,13 @@
   "apps/web/src/navigation/route.ts",
   "apps/web/src/persistance/nom-de-base.ts",
 ];
+// F-018-AC40, ADR-0019 : seul fichier d'apps/web qui nomme localStorage et assemble la clé des
+// réglages de vue d'une table.
+const FICHIER_REGLAGES_DE_VUE = "apps/web/src/persistance/reglages-de-vue.ts";
 const FICHIERS_NOM_DE_BASE_WEB = [
   "apps/web/src/persistance/nom-de-base.ts",
   "apps/web/src/persistance/espace-local.ts",
+  FICHIER_REGLAGES_DE_VUE,
 ];
 const PROPRIETES_INTERDITES_WEB = [
   ["random", "Math", "F-002-AC26 : aucun identifiant ni aléa hors de crypto.randomUUID."],
@@ -115,7 +119,8 @@
   "TemplateElement[value.raw=/notionlike:/]",
 ].map((selector) => ({
   selector,
-  message: "F-002-AC25 : seuls nom-de-base.ts et espace-local.ts écrivent un nom de base.",
+  message:
+    "F-002-AC25, F-018-AC40 : seuls nom-de-base.ts, espace-local.ts et reglages-de-vue.ts écrivent un nom de base ou de clé.",
 }));

 export default tseslint.config(
@@ -193,6 +198,23 @@
       "no-restricted-globals": [
         "error",
         { globals: GLOBALES_INTERDITES_WEB, checkGlobalObject: true },
+      ],
+    },
+  },
+  {
+    // F-018-AC40 : seul ce fichier d'apps/web nomme localStorage ; IndexedDB et les autres globales
+    // y restent interdites.
+    files: [FICHIER_REGLAGES_DE_VUE],
+    rules: {
+      "no-restricted-globals": [
+        "error",
+        {
+          globals: [
+            ...GLOBALES_INTERDITES_WEB.filter(({ name }) => name !== "localStorage"),
+            GLOBALE_INDEXEDDB,
+          ],
+          checkGlobalObject: true,
+        },
       ],
     },
   },
```
