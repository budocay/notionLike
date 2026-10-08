# F-001 — Conception : approche, plan par blocs, fichiers réservés au dev

Date : 2026-10-08
Spec : `specs/F-001.md` (validée, commit `ccbcd25`)
ADR : ADR-0001 (découpage des documents), ADR-0002 (format et arbre déplaçable), ADR-0003 (interface et outillage)

Ce document est le plan de réalisation de F-001. Il ne décrit pas du code existant : `ARCHITECTURE.md` est aligné sur le code bloc après bloc (voir « Plan par blocs »).

Révision du 2026-10-08 après le rejet du gate `agent-architecte` (empreinte `ba180a02ed89`) : barrière AC19 par ESLint, contrat `document-coeur-pur`, traçabilité de fast-check et des fichiers racine, instance unique de `yjs`, `ARCHITECTURE.md` à chaque bloc, série de rangs déplacée au bloc 4, sort des cinq contrats existants, extraits des fichiers racine et sorties d'essais cités ici.

## Approche

`packages/document` est un module pur : il transforme un `Y.Doc` en arborescence lue et des intentions (créer, renommer, déplacer, mettre à la corbeille) en écritures Yjs. Il ne fait aucune entrée-sortie.

- **Données** : une entrée par page dans une `Y.Map`, portant titre, place (parent et rang, écrits ensemble) et drapeau corbeille (ADR-0002).
- **Lecture** : fonction pure et totale de l'état du document. Elle ignore les entrées mal formées, ramène à la racine les pages sans parent valide, coupe chaque cycle à la page de plus petit identifiant, propage la corbeille aux descendantes et trie les sœurs par (rang, identifiant). La convergence entre répliques vient de là : même état Yjs, même lecture.
- **Écriture** : chaque opération valide sur l'arborescence lue, puis écrit dans une seule transaction ; un refus n'écrit rien.
- **Interface** : `creerDocumentEspace`, `ouvrirDocumentEspace`, une façade `DocumentEspace` de six méthodes, une classe `ErreurDocument` (ADR-0003). Le `Y.Doc` est le seul type Yjs exposé.

## Fichiers du paquet

| Fichier                         | Rôle                                                                   | Importe `yjs` |
| ------------------------------- | ---------------------------------------------------------------------- | ------------- |
| `src/index.ts`                  | réexporte l'interface publique, rien d'autre                           | types         |
| `src/erreurs.ts`                | `ErreurDocument`, `CodeErreurDocument`                                 | non           |
| `src/rang.ts`                   | rang entre deux rangs (bloc 1), série de rangs croissants (bloc 4)     | non           |
| `src/arbre.ts`                  | entrées valides vers arborescence : parents, cycles, corbeille, ordre  | non           |
| `src/format.ts`                 | noms des clés, version, validation d'une entrée brute                  | oui           |
| `src/document-espace.ts`        | `creerDocumentEspace`, `ouvrirDocumentEspace`, opérations, abonnement  | oui           |
| `test/repliques.ts`             | aide de test : répliques, échange de mises à jour dans un ordre choisi | oui           |
| `test/rang.test.ts`             | propriétés des rangs                                                   | non           |
| `test/operations.test.ts`       | opérations locales et refus                                            | oui           |
| `test/abonnement.test.ts`       | notifications                                                          | oui           |
| `test/convergence.test.ts`      | convergence, par l'exemple et par propriétés                           | oui           |
| `test/robustesse.test.ts`       | entrées mal formées, parents absents, version inconnue                 | oui           |
| `test/structure.test.ts`        | environnement de test sans DOM, dépendances du manifeste               | non           |
| `package.json`, `tsconfig.json` | commités par le dev (textes plus bas)                                  |               |
| `vitest.config.ts`              | commité par le dev (texte plus bas)                                    |               |

## Plan par blocs

Le bloc 0 est fait par le dev ; les blocs 1 à 5 sont chacun un commit d'`agent-frontend` (`Feature: F-001`), dans cet ordre. Chaque bloc livre son code et ses tests, et laisse `pnpm test`, `pnpm lint`, `pnpm contrats` et `pnpm typecheck` verts. Aucun bloc ne livre de code que le code des blocs déjà livrés n'utilise pas : un test unitaire seul ne suffit pas à justifier une fonction.

| Bloc | Contenu                                                                                                                                                                                                                                                                                                                                             | Fichiers créés ou modifiés                                                                                                    | Critères                                                                                          | `ARCHITECTURE.md`                                                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Squelette du paquet, configuration racine de Vitest, contrats de dépendances, règle ESLint des globales interdites, script `typecheck`, `pnpm install` (dev)                                                                                                                                                                                        | section « Fichiers à commiter par le dev »                                                                                    | prépare AC19 : les deux barrières (ESLint, contrats) sont actives avant la première ligne de code | oui : paquet `packages/document` (squelette sans code), sept contrats, règle ESLint, `pnpm typecheck`                                                 |
| 1    | Rangs : rang entre deux bornes, rien d'autre. Utilisé dès le bloc 2 (création en position donnée)                                                                                                                                                                                                                                                   | `src/rang.ts`, `test/rang.test.ts`                                                                                            | prépare AC2, AC4, AC8                                                                             | oui : module `rang.ts`                                                                                                                                |
| 2    | Création et lecture : document vide en version 1, ouverture d'un `Y.Doc`, création de page, arborescence lue triée ; refus à la création (titre trop long, parent absent, position invalide)                                                                                                                                                        | `src/erreurs.ts`, `src/format.ts`, `src/arbre.ts`, `src/document-espace.ts`, `src/index.ts`, `test/operations.test.ts`        | AC1, AC2 ; AC14 et AC15 pour la création                                                          | oui : modules `erreurs.ts`, `format.ts`, `arbre.ts`, `document-espace.ts`, `index.ts` et leurs dépendances ; ligne « mise à jour forgée » des menaces |
| 3    | Renommer, déplacer, mettre à la corbeille, s'abonner ; refus (cycle local, page absente ou à la corbeille, titre trop long) ; opération sans effet                                                                                                                                                                                                  | `src/arbre.ts`, `src/document-espace.ts`, `test/operations.test.ts`, `test/abonnement.test.ts`                                | AC3, AC4, AC5, AC6, AC13 ; fin de AC14, AC15                                                      | non : aucun module créé                                                                                                                               |
| 4    | Convergence : coupure des cycles à la lecture, consolidation avant déplacement, départage des rangs égaux, insertion entre rangs égaux avec la **série de rangs croissants** qui réattribue les rangs (ajoutée ici à `rang.ts`, avec ses tests, parce que c'est son seul usage), corbeille propagée aux pages arrivées sous une page à la corbeille | `src/rang.ts`, `src/arbre.ts`, `src/document-espace.ts`, `test/rang.test.ts`, `test/repliques.ts`, `test/convergence.test.ts` | AC7, AC8, AC9, AC10, AC11, AC12                                                                   | non : aucun module créé                                                                                                                               |
| 5    | Robustesse et structure : entrées mal formées ignorées, parent absent ou ignoré ramené à la racine, version supérieure refusée en lecture et en écriture ; preuve de l'environnement sans DOM et du manifeste                                                                                                                                       | `src/format.ts`, `src/arbre.ts`, `src/document-espace.ts`, `test/robustesse.test.ts`, `test/structure.test.ts`                | AC16, AC17, AC18, AC19                                                                            | oui : relecture finale de fidélité au diff livré (menaces comprises)                                                                                  |

`ARCHITECTURE.md` est écrit par `agent-architecte-conception`, seul agent qui l'a dans son périmètre. Après chaque bloc marqué « oui », l'orchestrateur l'invoque avant de lancer le bloc suivant : un commit `Agent: agent-architecte-conception`, `Feature: F-001`, qui ne touche que `ARCHITECTURE.md` et décrit ce que le commit du bloc vient de livrer, pas davantage. La doc n'est donc jamais en retard de plus d'un commit sur le code. Jusqu'au commit du bloc 0, `ARCHITECTURE.md` reste tel quel : il décrit le dépôt actuel (aucun module, cinq contrats).

## Stratégie de test

Les tests passent par l'interface publique (`src/index.ts`). Deux exceptions : `test/rang.test.ts` importe `src/rang.ts` (algorithme pur, plus simple à éprouver seul ; rang entre deux bornes au bloc 1, série de rangs croissants au bloc 4), et les tests de robustesse écrivent directement dans les types partagés du `Y.Doc` pour fabriquer des états qu'aucune opération ne produit. Ces derniers fixent le format de l'ADR-0002 : c'est voulu, le format est un contrat.

Chaque test cite son critère dans son nom (`F-001-AC7 …`), ce que `ac-couverture.sh` vérifie.

Les propriétés fast-check tournent avec une graine fixe et 300 exécutions (constantes dans `test/repliques.ts`). Générateurs : une suite d'opérations (créer, renommer, déplacer, mettre à la corbeille, sur des pages tirées parmi celles qui existent) par réplique, deux ou trois répliques, puis un ordre de livraison des mises à jour tiré au hasard, doublons compris. Une opération refusée par une erreur typée est simplement passée.

| Critère | Par l'exemple                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Par propriété                                                                                                                                                                                             |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1     | document créé : `racines` et `corbeille` vides ; `meta.version` vaut 1 dans le `Y.Doc`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |                                                                                                                                                                                                           |
| AC2     | création à la racine, sous une page, en position 0, au milieu, sans position ; identifiants distincts ; position hors bornes refusée                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | modèle : une suite de créations et de déplacements sur une réplique donne le même ordre qu'un modèle naïf en tableaux                                                                                     |
| AC3     | renommage : titre changé, parent, position et descendance identiques                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |                                                                                                                                                                                                           |
| AC4     | déplacement vers un autre parent, vers une autre position du même parent, avec descendance ; ordre des autres pages inchangé                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | même propriété de modèle que AC2                                                                                                                                                                          |
| AC5     | page et descendance absentes de `racines`, présentes dans `corbeille` ; entrées toujours dans le `Y.Doc`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |                                                                                                                                                                                                           |
| AC6     | une notification par opération locale, une par mise à jour reçue, aucune après désabonnement, aucune pour une opération sans effet ou refusée, plusieurs abonnés                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |                                                                                                                                                                                                           |
| AC7     | deux répliques, opérations disjointes, échange dans les deux ordres                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | pour toute suite d'opérations et tout ordre de livraison : `lire()` identique sur toutes les répliques ; chaque page créée apparaît exactement une fois (pas de perte, pas de doublon, donc pas de cycle) |
| AC8     | deux créations à la même position sous le même parent : deux pages, même ordre des deux côtés ; puis insertion entre les deux                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | rang : pour tous `a < b`, `a < entre(a, b) < b`, et le résultat est un rang valide                                                                                                                        |
| AC9     | A sous B contre B sous A : même lecture, A et B présentes avec leur descendance ; cycle de trois pages ; déplacement d'une page du cycle ensuite (consolidation)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | invariant « exactement une fois » de AC7                                                                                                                                                                  |
| AC10    | deux renommages : même titre des deux côtés, égal à l'un des deux                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |                                                                                                                                                                                                           |
| AC11    | corbeille contre création sous la page ; corbeille contre déplacement sous la page : la fille est dans `corbeille`, son entrée reste dans le `Y.Doc`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |                                                                                                                                                                                                           |
| AC12    | `Y.encodeStateAsUpdate` puis `Y.applyUpdate` sur un `Y.Doc` vierge ouvert par `ouvrirDocumentEspace` : même `lire()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | même égalité après toute suite d'opérations                                                                                                                                                               |
| AC13    | déplacement sous soi-même, sous une fille, sous une petite-fille : `deplacement-cyclique`, zéro événement `update`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |                                                                                                                                                                                                           |
| AC14    | identifiant absent, page à la corbeille, parent à la corbeille, descendante d'une page à la corbeille, pour chaque opération : erreur typée, zéro `update`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |                                                                                                                                                                                                           |
| AC15    | titre de 201 caractères refusé à la création et au renommage, zéro `update` ; 200 accepté ; vide accepté                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |                                                                                                                                                                                                           |
| AC16    | champ manquant, mauvais type, titre de 201 caractères, valeur qui n'est pas une `Y.Map` : entrée ignorée, autres pages exposées                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | pour toute valeur JSON arbitraire écrite dans `pages` ou dans une entrée : `lire()` ne lève pas et expose les pages valides                                                                               |
| AC17    | parent absent ; parent mal formé : page à la racine, même lecture sur une seconde réplique                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |                                                                                                                                                                                                           |
| AC18    | `meta.version` à 2 : `lire()` et chaque écriture lèvent `version-non-prise-en-charge`, zéro `update`, état du `Y.Doc` inchangé                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |                                                                                                                                                                                                           |
| AC19    | `pnpm lint` : règle `no-restricted-globals` sur `packages/document/src` (aucun usage de `window`, `document`, `navigator`, `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `indexedDB`, `localStorage`, `sessionStorage`, `process`, y compris par `globalThis.`) ; `pnpm contrats` : `document-yjs-seulement` et `document-coeur-pur` ; `pnpm typecheck` en seconde barrière (`lib` sans `DOM`, `types` vide) ; test de structure : `dependencies` du manifeste réduit à `yjs`, et `"window" in globalThis` et `"document" in globalThis` faux sous Vitest (ce dernier point prouve l'environnement de test, pas l'absence d'usage : celle-ci est tenue par le lint) |                                                                                                                                                                                                           |

« Zéro `update` » se mesure en comptant les événements `update` du `Y.Doc` pendant l'appel.

## Règles de dépendances

Sort des cinq contrats en vigueur (texte actuel de `.dependency-cruiser.cjs` cité plus bas) : tous conservés, aucun modifié.

| Contrat existant               | Sort              | Portée dans F-001                                                                                                                                                                                                                              |
| ------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pas-de-cycle`                 | conservé tel quel | s'applique aux fichiers de `packages/document` dès le bloc 2                                                                                                                                                                                   |
| `domaine-pur`                  | conservé tel quel | sans objet : le paquet n'a pas de dossier `domain` (six fichiers à plat), la règle ne vise donc aucun de ses fichiers. La pureté du cœur du paquet est portée par `document-coeur-pur`, pas par elle. Elle reste pour les applications à venir |
| `paquets-sans-apps`            | conservé tel quel | s'applique à `packages/document` ; aucune application n'existe                                                                                                                                                                                 |
| `apps-isolees`                 | conservé tel quel | sans objet : aucune application dans F-001                                                                                                                                                                                                     |
| `document-sans-reseau-ni-base` | conservé tel quel | sans objet tant que `packages/db` et `packages/contrats` n'existent pas                                                                                                                                                                        |

Deux contrats ajoutés au bloc 0, ce qui porte la liste à sept :

- `document-yjs-seulement` — de `packages/document/src/` vers tout paquet npm autre que `yjs`, tout module intégré de Node et tout import non résolu : erreur (F-001-AC19, « `yjs` pour seule dépendance d'exécution directe »).
- `document-coeur-pur` — `src/rang.ts`, `src/arbre.ts` et `src/erreurs.ts` n'importent qu'eux-mêmes : ni paquet npm (donc pas `yjs`), ni module de Node, ni `format.ts`, ni `document-espace.ts`, ni `index.ts`. Le sens interne `index → document-espace → format, arbre, rang, erreurs` est ainsi contractualisé (ADR-0003, « Organisation interne »).

Option modifiée : `exclude` ne masque plus `node_modules`. Aujourd'hui les paquets npm sont retirés du graphe avant l'évaluation des règles, si bien qu'aucune règle ne voit un import de paquet (essai C plus bas : l'import de `fast-check` et celui de `yjs` depuis `rang.ts` passent inaperçus). `doNotFollow` reste en place : les paquets sont vus comme des feuilles, sans être parcourus.

Hors dependency-cruiser, une règle ESLint tient la partie d'AC19 que les imports ne montrent pas (globales du DOM, du réseau et du stockage) : voir le fichier 7 du bloc 0.

## État actuel des fichiers racine

Le gate ne voit que le diff : les fichiers que le plan modifie ou dont il dépend sont recopiés ici tels qu'ils sont au commit `a05f4d1` (copie intégrale, faite par lecture du fichier le 2026-10-08).

`.dependency-cruiser.cjs` :

```js
// Contrats de dépendances exécutables (ARCHITECTURE GATE, points 1 et 3). Fichier protégé :
// agent-architecte-conception propose les évolutions, le dev les commite.
module.exports = {
  forbidden: [
    {
      name: "pas-de-cycle",
      severity: "error",
      comment: "Aucune dépendance cyclique.",
      from: {},
      to: { circular: true },
    },
    {
      name: "domaine-pur",
      severity: "error",
      comment: "Le domaine ne dépend ni de l'infrastructure ni de l'interface.",
      from: { path: "/domain/" },
      to: { path: "/(infrastructure|adapters|ui|routes)/" },
    },
    {
      name: "paquets-sans-apps",
      severity: "error",
      comment: "Un paquet partagé ne dépend jamais d'une application.",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "apps-isolees",
      severity: "error",
      comment: "Le client et le serveur ne s'importent pas : ils passent par packages/.",
      from: { path: "^apps/([^/]+)/" },
      to: { path: "^apps/([^/]+)/", pathNot: "^apps/$1/" },
    },
    {
      name: "document-sans-reseau-ni-base",
      severity: "error",
      comment: "Le modèle de document (CRDT) reste pur : ni base serveur ni contrats HTTP.",
      from: { path: "^packages/document/" },
      to: { path: "^packages/(db|contrats)/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(dist|coverage|node_modules)/" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
  },
};
```

`tsconfig.base.json` :

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`package.json` (racine) :

```json
{
  "name": "notionlike",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.10.1",
  "engines": {
    "node": ">=26"
  },
  "scripts": {
    "test": "vitest run --passWithNoTests",
    "lint": "eslint --no-warn-ignored .",
    "format": "prettier --write --ignore-unknown .",
    "format:check": "prettier --check --ignore-unknown .",
    "contrats": "depcruise --config .dependency-cruiser.cjs apps packages"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "dependency-cruiser": "^18.5.0",
    "eslint": "^10.11.0",
    "prettier": "^3.9.9",
    "typescript": "~6.0.3",
    "typescript-eslint": "^8.71.0",
    "vitest": "^5.0.3"
  }
}
```

`eslint.config.mjs` :

```js
// Règles objectives du CRAFT GATE : ce fichier est protégé (Agent: dev uniquement).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

const COMPLEXITE_CYCLOMATIQUE_MAX = 10;
const NOMBRES_NON_MAGIQUES = [-1, 0, 1, 2];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      ".agents/**",
      ".claude/**",
      ".githooks/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      complexity: ["error", COMPLEXITE_CYCLOMATIQUE_MAX],
      eqeqeq: ["error", "always"],
      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-console": ["error", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-magic-numbers": [
        "error",
        {
          ignore: NOMBRES_NON_MAGIQUES,
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
          ignoreDefaultValues: true,
        },
      ],
    },
  },
  {
    files: ["**/*.test.*", "**/*.spec.*", "**/test/**", "**/e2e/**", "**/*.config.*"],
    rules: { "@typescript-eslint/no-magic-numbers": "off" },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { module: "writable", require: "readonly", __dirname: "readonly" },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
```

Commandes du socle qui lisent ces fichiers (`.agents/outils.env`, fichier protégé, cité sans modification) :

```text
TEST_CMD="pnpm exec vitest run --passWithNoTests"
LINT_CMD="pnpm exec eslint --no-warn-ignored"
CONTRATS_CMD="pnpm exec depcruise --config .dependency-cruiser.cjs apps packages"
```

Aucune commande du socle ne lance `tsc`.

## Fichiers à commiter par le dev (bloc 0)

Fichiers protégés ou partagés, hors du périmètre des agents : huit fichiers, textes complets, conformes à Prettier (`printWidth` 100). Un seul commit `Agent: dev`, `Feature: F-001`, après `pnpm install`.

La spec validée liste quatre prérequis : les fichiers 1, 2, 3 et 8. La conception en ajoute quatre, tous à la racine (4 `vitest.config.ts`, 5 `.dependency-cruiser.cjs`, 6 `package.json`, 7 `eslint.config.mjs`), et une dépendance de développement, `fast-check@4.10.2`, proposée par `MEMORY/VEILLE.md` (« à faire valider par le dev ») et non citée par la spec. La spec n'est pas modifiée : c'est le commit `Agent: dev` du bloc 0 qui entérine ces ajouts en les introduisant (ADR-0003, « Contexte et problème »). Si le dev en refuse un, le bloc 0 n'est pas commité et la conception est reprise.

### 1. `packages/document/package.json` (nouveau)

```json
{
  "name": "@notionlike/document",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "lint": "eslint --no-warn-ignored .",
    "format": "prettier --write --ignore-unknown .",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "yjs": "13.6.33"
  },
  "devDependencies": {
    "fast-check": "4.10.2",
    "vitest": "^5.0.3"
  }
}
```

`vitest` reprend la contrainte de la racine (aucune nouvelle version dans le verrou). `eslint`, `prettier` et `tsc` viennent des binaires de la racine du workspace.

### 2. `packages/document/vitest.config.ts` (nouveau)

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "document",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
```

### 3. `packages/document/tsconfig.json` (nouveau)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023"],
    "types": [],
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true,
    "resolveJsonModule": true
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`lib` sans `DOM` et `types` vide : un usage du DOM ou d'un module Node ne compile pas. `resolveJsonModule` sert au test de structure, qui importe le manifeste.

### 4. `vitest.config.ts` à la racine (nouveau)

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*"],
  },
});
```

Sans lui, la commande de test du socle (`pnpm exec vitest run`, lancée à la racine) ignore la configuration du paquet. `apps/*` s'y ajoutera avec la première application.

### 5. `.dependency-cruiser.cjs` (modifié, fichier protégé)

Ajouter ces deux règles à la fin de `forbidden`, après `document-sans-reseau-ni-base` :

```js
    {
      name: "document-yjs-seulement",
      severity: "error",
      comment: "F-001-AC19 : le code de packages/document n'importe que yjs.",
      from: { path: "^packages/document/src/" },
      to: {
        dependencyTypes: [
          "npm",
          "npm-dev",
          "npm-optional",
          "npm-peer",
          "npm-bundled",
          "npm-no-pkg",
          "npm-unknown",
          "core",
          "unknown",
          "undetermined",
        ],
        pathNot: "(^|/)node_modules/yjs/",
      },
    },
    {
      name: "document-coeur-pur",
      severity: "error",
      comment:
        "ADR-0003 : rang, arbre et erreurs sont purs ; ils n'importent qu'eux-mêmes (ni yjs, ni format, ni document-espace).",
      from: { path: "^packages/document/src/(rang|arbre|erreurs)\\.ts$" },
      to: { pathNot: "^packages/document/src/(rang|arbre|erreurs)\\.ts$" },
    },
```

`document-coeur-pur` n'énumère pas ce qui est interdit : elle n'autorise que les trois fichiers du cœur entre eux, ce qui couvre d'un coup les paquets npm, les modules de Node, les imports non résolus et les autres fichiers du paquet.

Et dans `options`, remplacer

```js
    exclude: { path: "(^|/)(dist|coverage|node_modules)/" },
```

par

```js
    exclude: { path: "(^|/)(dist|coverage)/" },
```

### 6. `package.json` à la racine (modifié, fichier partagé)

Ajouter dans `scripts`, après `contrats` (avec la virgule à la fin de la ligne `contrats`) :

```json
    "typecheck": "pnpm -r run typecheck"
```

`pnpm typecheck` est la seconde barrière d'AC19, pas la seule : aucun contrôle du socle ne la lance, elle n'est tenue que parce que ce plan l'exige d'`agent-frontend` à chaque bloc. La brancher dans `.agents/outils.env` reste du ressort du dev et n'est pas un prérequis de F-001, puisque la barrière déterministe est la règle ESLint du fichier 7.

### 7. `eslint.config.mjs` (modifié, fichier protégé)

`pnpm lint` et le contrôle de lint du socle (`LINT_CMD`, lancé par le hook `pre-commit`) lisent ce fichier : la règle est donc appliquée à chaque commit sans rien brancher de plus.

Ajouter cette constante après `NOMBRES_NON_MAGIQUES` :

```js
const GLOBALES_INTERDITES_DOCUMENT = [
  "window",
  "document",
  "navigator",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "indexedDB",
  "localStorage",
  "sessionStorage",
  "process",
].map((name) => ({
  name,
  message: "F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage.",
}));
```

Et ce bloc dans la liste passée à `tseslint.config`, après le bloc des fichiers de test et avant celui des `**/*.cjs` :

```js
  {
    files: ["packages/document/src/**"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          globals: GLOBALES_INTERDITES_DOCUMENT,
          checkGlobalObject: true,
        },
      ],
    },
  },
```

- La règle vise les globales, déclarées ou non : sans elle, `fetch` ou `localStorage` s'utilisent sans aucun import, ce que les contrats de dépendances ne voient pas.
- `checkGlobalObject` étend l'interdiction à `globalThis.fetch` et aux formes voisines.
- `crypto` n'est pas dans la liste : `crypto.randomUUID` est le seul accès à l'environnement dont le module a besoin (ADR-0003). Un paramètre ou une variable locale nommés `document` ne sont pas signalés (essayé).
- `process` et `EventSource` s'ajoutent à la liste minimale : accès à l'environnement Node et au réseau.
- Limite assumée : une globale absente de la liste (une API de navigateur future, par exemple) échappe à ESLint ; `pnpm typecheck` la refuse (`lib: ["ES2023"]`, `types: []`).
- `test/` n'est pas visé : les tests peuvent sonder l'environnement.

### 8. `pnpm-lock.yaml` (modifié, fichier partagé)

Produit par `pnpm install` à la racine après les fichiers 1 à 7. Attendu : `yjs@13.6.33`, `lib0` (transitive), `fast-check@4.10.2`, `pure-rand` (transitive). Une seule entrée `yjs@` doit y figurer.

### Sans changement

`pnpm-workspace.yaml` (le motif `packages/*` couvre déjà le paquet), `tsconfig.base.json`, `.prettierrc.json`.

## Une seule instance de `yjs` (à la charge de F-002)

Exposer `doc: Y.Doc` fait importer `yjs` par chaque consommateur. Si deux copies de `yjs` étaient chargées, une `Y.Map` créée par l'une ne serait pas une `Y.Map` pour l'autre, et la validation de l'ADR-0002 (« la valeur est une `Y.Map` ») écarterait toutes les pages sans erreur, puisque F-001-AC16 demande d'ignorer en silence (ADR-0003, « Conséquences »).

- Dans F-001, le risque n'existe pas : un seul manifeste du workspace déclare `yjs`, en version exacte (`13.6.33`), et aucun autre paquet ne l'importe. Rien n'est donc ajouté au bloc 0 : une version imposée à la racine ne contraindrait qu'un seul manifeste, et son effet ne peut pas être essayé sans installation.
- Le moyen est à la charge de F-002, première feature qui ajoute un second manifeste et une bibliothèque (`y-indexeddb`) dépendant de `yjs` : version unique imposée à la racine par un catalogue pnpm (`catalog:` dans `pnpm-workspace.yaml`, fichier protégé, référencé par `"yjs": "catalog:"` dans chaque manifeste) ou, à défaut, par `overrides`. Non essayé ici ; la syntaxe exacte pour pnpm 12 est à vérifier par la veille de F-002.
- Le test de couture est à la charge de F-002 lui aussi : un `Y.Doc` construit par le consommateur avec son propre import de `yjs`, rempli par une façade de `@notionlike/document`, puis rouvert par `ouvrirDocumentEspace`, doit rendre les pages créées (liste non vide, mêmes titres). Avec deux instances, ce test échoue au lieu de rendre une arborescence vide en silence. S'y ajoute la vérification que le verrou ne contient qu'une entrée `yjs@`.
- Ces deux points ne peuvent pas être écrits par cette conception dans la spec de F-002 (hors périmètre) : ils sont remontés à l'orchestrateur pour `agent-planif`.

## Vérification après le commit du bloc 0

```bash
pnpm install --frozen-lockfile
pnpm test        # aucun test encore : passe grâce à --passWithNoTests
pnpm contrats
pnpm lint
pnpm typecheck
```

Preuve que les barrières mordent, à faire une fois par le dev avec un fichier jeté ensuite : `packages/document/src/essai.ts` contenant `export const x = fetch;` doit faire échouer `pnpm lint` ; le même fichier contenant `import fs from "node:fs";` doit faire échouer `pnpm contrats`.

## Essais

Ce qui suit est une déclaration de l'auteur de la conception, pas une preuve que le gate peut rejouer : les commandes de vérification ci-dessus la rendent reproductible par le dev au bloc 0.

Essais refaits le 2026-10-08 pour cette révision, sur un gabarit jetable hors du dépôt (`/tmp`), rien n'étant installé ni écrit dans le dépôt :

- copies des fichiers racine du commit `a05f4d1` (`eslint.config.mjs`, `.dependency-cruiser.cjs`, `tsconfig.base.json`, `package.json`, `.prettierrc.json`), modifiées exactement comme les fichiers 5 et 7 ; fichiers 1 à 4 tels qu'écrits plus haut ;
- outils du dépôt, par liens vers son `node_modules` : ESLint 10.11.0, dependency-cruiser 18.5.0, TypeScript 6.0.3, Vitest 5.0.3, Prettier 3.9.9, Node 26.11.0 ;
- `yjs` et `fast-check` ne sont pas installés : ils sont remplacés par des **paquets factices** (un `package.json`, un `index.js` de deux lignes, un `index.d.ts`). Les essais prouvent donc le comportement des règles, pas celui des vrais paquets ;
- six fichiers `src/` de quelques lignes aux noms du plan, avec les imports prévus (`index → document-espace → format, arbre` ; `arbre → rang, erreurs` ; `format` et `document-espace` importent `yjs`).

**A. Contrats, état conforme au plan** (`depcruise --config .dependency-cruiser.cjs apps packages`) :

```text
✔ no dependency violations found (13 modules, 11 dependencies cruised)

code=0
```

**B. Contrats, violations volontaires** : `rang.ts` importe `yjs` et un type d'`erreurs.ts` ; `arbre.ts` importe `format.ts` et `document-espace.ts` ; `erreurs.ts` importe `node:fs`, `fast-check` et `paquet-absent`. L'import de type entre fichiers du cœur n'est pas signalé, tous les autres le sont ; `pas-de-cycle` voit le cycle créé au passage :

```text
  error pas-de-cycle: packages/document/src/arbre.ts →
      packages/document/src/document-espace.ts →
      packages/document/src/arbre.ts
  error document-yjs-seulement: packages/document/src/erreurs.ts → paquet-absent
  error document-yjs-seulement: packages/document/src/erreurs.ts → node_modules/fast-check/index.js
  error document-yjs-seulement: packages/document/src/erreurs.ts → fs
  error document-coeur-pur: packages/document/src/rang.ts → node_modules/yjs/index.js
  error document-coeur-pur: packages/document/src/erreurs.ts → paquet-absent
  error document-coeur-pur: packages/document/src/erreurs.ts → node_modules/fast-check/index.js
  error document-coeur-pur: packages/document/src/erreurs.ts → fs
  error document-coeur-pur: packages/document/src/arbre.ts → packages/document/src/format.ts
  error document-coeur-pur: packages/document/src/arbre.ts → packages/document/src/document-espace.ts

x 10 dependency violations (10 errors, 0 warnings). 14 modules, 13 dependencies cruised.

code=10
```

**C. Mêmes violations avec l'`exclude` actuel** (`node_modules` masqué) : les imports de `fast-check` et de `yjs` disparaissent du rapport, ce qui justifie le changement d'option :

```text
  error pas-de-cycle: packages/document/src/arbre.ts →
      packages/document/src/document-espace.ts →
      packages/document/src/arbre.ts
  error document-yjs-seulement: packages/document/src/erreurs.ts → paquet-absent
  error document-yjs-seulement: packages/document/src/erreurs.ts → fs
  error document-coeur-pur: packages/document/src/erreurs.ts → paquet-absent
  error document-coeur-pur: packages/document/src/erreurs.ts → fs
  error document-coeur-pur: packages/document/src/arbre.ts → packages/document/src/format.ts
  error document-coeur-pur: packages/document/src/arbre.ts → packages/document/src/document-espace.ts

x 7 dependency violations (7 errors, 0 warnings). 11 modules, 8 dependencies cruised.

code=7
```

**D. ESLint, usages interdits** : un fichier `packages/document/src/sale.ts` qui lit, ligne après ligne, `window`, `document.title`, `fetch(…)`, `indexedDB`, `localStorage`, `sessionStorage`, `new XMLHttpRequest()`, `new WebSocket(…)`, `navigator.onLine`, `globalThis.fetch`, `globalThis.localStorage`, `process.env` (`eslint --no-warn-ignored .` à la racine ; même résultat, 12 erreurs, lancé depuis `packages/document`) :

```text

/private/tmp/gabarit-f001.aqGB30/packages/document/src/sale.ts
   2:13  error  Unexpected use of 'window'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage          no-restricted-globals
   3:13  error  Unexpected use of 'document'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage        no-restricted-globals
   4:13  error  Unexpected use of 'fetch'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage           no-restricted-globals
   5:13  error  Unexpected use of 'indexedDB'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage       no-restricted-globals
   6:13  error  Unexpected use of 'localStorage'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage    no-restricted-globals
   7:13  error  Unexpected use of 'sessionStorage'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage  no-restricted-globals
   8:17  error  Unexpected use of 'XMLHttpRequest'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage  no-restricted-globals
   9:17  error  Unexpected use of 'WebSocket'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage       no-restricted-globals
  10:13  error  Unexpected use of 'navigator'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage       no-restricted-globals
  11:24  error  Unexpected use of 'fetch'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage           no-restricted-globals
  12:24  error  Unexpected use of 'localStorage'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage    no-restricted-globals
  13:13  error  Unexpected use of 'process'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage         no-restricted-globals

✖ 12 problems (12 errors, 0 warnings)

code=1
```

**E. ESLint, état conforme** : sans `sale.ts`, avec un fichier `src/` qui appelle `crypto.randomUUID()` et prend un paramètre nommé `document`, et un test qui lit `"window" in globalThis` : aucune sortie, `code=0`, à la racine comme depuis le paquet.

**F. `tsc --noEmit -p tsconfig.json` depuis le paquet**, avec le même `sale.ts` et un test contenant `typeof window` :

```text
src/sale.ts(2,13): error TS2304: Cannot find name 'window'.
src/sale.ts(3,13): error TS2584: Cannot find name 'document'. Do you need to change your target library? Try changing the 'lib' compiler option to include 'dom'.
src/sale.ts(4,13): error TS2304: Cannot find name 'fetch'.
src/sale.ts(5,13): error TS2304: Cannot find name 'indexedDB'.
src/sale.ts(6,13): error TS2304: Cannot find name 'localStorage'.
src/sale.ts(7,13): error TS2304: Cannot find name 'sessionStorage'.
src/sale.ts(8,17): error TS2304: Cannot find name 'XMLHttpRequest'.
src/sale.ts(9,17): error TS2304: Cannot find name 'WebSocket'.
src/sale.ts(10,13): error TS2304: Cannot find name 'navigator'.
src/sale.ts(11,24): error TS7017: Element implicitly has an 'any' type because type 'typeof globalThis' has no index signature.
src/sale.ts(12,24): error TS7017: Element implicitly has an 'any' type because type 'typeof globalThis' has no index signature.
src/sale.ts(13,13): error TS2591: Cannot find name 'process'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
test/globales.test.ts(4,17): error TS2304: Cannot find name 'window'.
code=2
```

La dernière ligne a une conséquence pour le bloc 5 : `test/` est dans `include`, donc le test de structure ne peut pas écrire `typeof window`. Il écrit `"window" in globalThis` et `"document" in globalThis`, qui compilent et passent (essai G). Sans `sale.ts` ni ce test : aucune sortie, `code=0`.

**G. Vitest** : un test qui vérifie `"window" in globalThis` faux, `"document" in globalThis` faux, importe le manifeste (`with { type: "json" }`) et `src/rang.ts`. Depuis la racine (`vitest run --passWithNoTests`, configuration 4) :

```text

 RUN  v5.0.3 /private/tmp/gabarit-f001.aqGB30


 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  11:49:47
   Duration  165ms (transform 62%, import 23%, worker 8%, tests 7%)

code=0
```

Depuis `packages/document` (`vitest run`, configuration 2) : même résultat, `Test Files  1 passed (1)`, `code=0`.

**H. Scripts `lint` et `format` du paquet** : `eslint --no-warn-ignored .` et `prettier --check --ignore-unknown .` lancés depuis `packages/document` trouvent la configuration de la racine et finissent en `code=0`. `prettier --write` n'a pas été lancé.

Non essayé :

- tout ce qui demande les vrais paquets : résolution et types de `yjs@13.6.33` et de `fast-check@4.10.2`, `pnpm install`, contenu du verrou ;
- les scripts lancés par `pnpm` (`pnpm test`, `pnpm lint`, `pnpm -r run typecheck`) : les binaires ont été appelés directement, le gabarit n'étant pas un workspace installé ;
- les hooks du socle sur ces fichiers ;
- le chargement du paquet source par Node 26 avec le vrai `yjs` et depuis un autre paquet : non vérifié, à prouver par la première feature serveur (ADR-0003) ;
- le catalogue pnpm ou `overrides` pour l'instance unique de `yjs`.

Les essais annoncés par la version précédente de ce document (commit `a05f4d1`) n'ont pas été repris tels quels : ceux qui figurent ci-dessus ont été refaits, les autres sont dans la liste « non essayé ».
