# F-001 — Conception : approche, plan par blocs, fichiers réservés au dev

Date : 2026-10-08
Spec : `specs/F-001.md` (validée, commit `ccbcd25`)
ADR : ADR-0001 (découpage des documents), ADR-0002 (format et arbre déplaçable), ADR-0003 (interface et outillage)

Ce document est le plan de réalisation de F-001. Il ne décrit pas du code existant : `ARCHITECTURE.md` sera aligné sur le code une fois celui-ci livré.

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
| `src/rang.ts`                   | rang entre deux rangs, série de rangs croissants                       | non           |
| `src/arbre.ts`                  | entrées valides vers arborescence : parents, cycles, corbeille, ordre  | non           |
| `src/format.ts`                 | noms des clés, version, validation d'une entrée brute                  | oui           |
| `src/document-espace.ts`        | `creerDocumentEspace`, `ouvrirDocumentEspace`, opérations, abonnement  | oui           |
| `test/repliques.ts`             | aide de test : répliques, échange de mises à jour dans un ordre choisi | oui           |
| `test/rang.test.ts`             | propriétés des rangs                                                   | non           |
| `test/operations.test.ts`       | opérations locales et refus                                            | oui           |
| `test/abonnement.test.ts`       | notifications                                                          | oui           |
| `test/convergence.test.ts`      | convergence, par l'exemple et par propriétés                           | oui           |
| `test/robustesse.test.ts`       | entrées mal formées, parents absents, version inconnue                 | oui           |
| `test/structure.test.ts`        | exécution sans DOM, dépendances du manifeste                           | non           |
| `package.json`, `tsconfig.json` | commités par le dev (textes plus bas)                                  |               |
| `vitest.config.ts`              | commité par le dev (texte plus bas)                                    |               |

## Plan par blocs

Bloc 0 est fait par le dev ; les blocs 1 à 5 sont chacun un commit d'`agent-frontend` (`Feature: F-001`), dans cet ordre. Chaque bloc livre son code et ses tests, et laisse `pnpm test`, `pnpm lint`, `pnpm contrats` et `pnpm --filter @notionlike/document typecheck` verts. Aucun bloc ne livre de code que ses tests n'atteignent pas.

| Bloc | Contenu                                                                                                                                                                                                      | Fichiers créés ou modifiés                                                                                             | Critères                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 0    | Squelette du paquet, configuration racine de Vitest, contrat de dépendances, `pnpm install` (dev)                                                                                                            | section « Fichiers à commiter par le dev »                                                                             | prépare AC19                                 |
| 1    | Rangs : rang entre deux bornes, série de rangs croissants                                                                                                                                                    | `src/rang.ts`, `test/rang.test.ts`                                                                                     | prépare AC2, AC4, AC8                        |
| 2    | Création et lecture : document vide en version 1, ouverture d'un `Y.Doc`, création de page, arborescence lue triée ; refus à la création (titre trop long, parent absent, position invalide)                 | `src/erreurs.ts`, `src/format.ts`, `src/arbre.ts`, `src/document-espace.ts`, `src/index.ts`, `test/operations.test.ts` | AC1, AC2 ; AC14 et AC15 pour la création     |
| 3    | Renommer, déplacer, mettre à la corbeille, s'abonner ; refus (cycle local, page absente ou à la corbeille, titre trop long) ; opération sans effet                                                           | `src/arbre.ts`, `src/document-espace.ts`, `test/operations.test.ts`, `test/abonnement.test.ts`                         | AC3, AC4, AC5, AC6, AC13 ; fin de AC14, AC15 |
| 4    | Convergence : coupure des cycles à la lecture, consolidation avant déplacement, départage des rangs égaux et insertion entre rangs égaux, corbeille propagée aux pages arrivées sous une page à la corbeille | `src/arbre.ts`, `src/document-espace.ts`, `test/repliques.ts`, `test/convergence.test.ts`                              | AC7, AC8, AC9, AC10, AC11, AC12              |
| 5    | Robustesse et structure : entrées mal formées ignorées, parent absent ou ignoré ramené à la racine, version supérieure refusée en lecture et en écriture ; preuve d'exécution sans DOM et du manifeste       | `src/format.ts`, `src/arbre.ts`, `src/document-espace.ts`, `test/robustesse.test.ts`, `test/structure.test.ts`         | AC16, AC17, AC18, AC19                       |

Après le bloc 5 : `agent-architecte-conception` aligne `ARCHITECTURE.md` sur le code livré, puis revue.

## Stratégie de test

Les tests passent par l'interface publique (`src/index.ts`). Deux exceptions : `test/rang.test.ts` importe `src/rang.ts` (algorithme pur, plus simple à éprouver seul), et les tests de robustesse écrivent directement dans les types partagés du `Y.Doc` pour fabriquer des états qu'aucune opération ne produit. Ces derniers fixent le format de l'ADR-0002 : c'est voulu, le format est un contrat.

Chaque test cite son critère dans son nom (`F-001-AC7 …`), ce que `ac-couverture.sh` vérifie.

Les propriétés fast-check tournent avec une graine fixe et 300 exécutions (constantes dans `test/repliques.ts`). Générateurs : une suite d'opérations (créer, renommer, déplacer, mettre à la corbeille, sur des pages tirées parmi celles qui existent) par réplique, deux ou trois répliques, puis un ordre de livraison des mises à jour tiré au hasard, doublons compris. Une opération refusée par une erreur typée est simplement passée.

| Critère | Par l'exemple                                                                                                                                                    | Par propriété                                                                                                                                                                                             |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1     | document créé : `racines` et `corbeille` vides ; `meta.version` vaut 1 dans le `Y.Doc`                                                                           |                                                                                                                                                                                                           |
| AC2     | création à la racine, sous une page, en position 0, au milieu, sans position ; identifiants distincts ; position hors bornes refusée                             | modèle : une suite de créations et de déplacements sur une réplique donne le même ordre qu'un modèle naïf en tableaux                                                                                     |
| AC3     | renommage : titre changé, parent, position et descendance identiques                                                                                             |                                                                                                                                                                                                           |
| AC4     | déplacement vers un autre parent, vers une autre position du même parent, avec descendance ; ordre des autres pages inchangé                                     | même propriété de modèle que AC2                                                                                                                                                                          |
| AC5     | page et descendance absentes de `racines`, présentes dans `corbeille` ; entrées toujours dans le `Y.Doc`                                                         |                                                                                                                                                                                                           |
| AC6     | une notification par opération locale, une par mise à jour reçue, aucune après désabonnement, aucune pour une opération sans effet ou refusée, plusieurs abonnés |                                                                                                                                                                                                           |
| AC7     | deux répliques, opérations disjointes, échange dans les deux ordres                                                                                              | pour toute suite d'opérations et tout ordre de livraison : `lire()` identique sur toutes les répliques ; chaque page créée apparaît exactement une fois (pas de perte, pas de doublon, donc pas de cycle) |
| AC8     | deux créations à la même position sous le même parent : deux pages, même ordre des deux côtés ; puis insertion entre les deux                                    | rang : pour tous `a < b`, `a < entre(a, b) < b`, et le résultat est un rang valide                                                                                                                        |
| AC9     | A sous B contre B sous A : même lecture, A et B présentes avec leur descendance ; cycle de trois pages ; déplacement d'une page du cycle ensuite (consolidation) | invariant « exactement une fois » de AC7                                                                                                                                                                  |
| AC10    | deux renommages : même titre des deux côtés, égal à l'un des deux                                                                                                |                                                                                                                                                                                                           |
| AC11    | corbeille contre création sous la page ; corbeille contre déplacement sous la page : la fille est dans `corbeille`, son entrée reste dans le `Y.Doc`             |                                                                                                                                                                                                           |
| AC12    | `Y.encodeStateAsUpdate` puis `Y.applyUpdate` sur un `Y.Doc` vierge ouvert par `ouvrirDocumentEspace` : même `lire()`                                             | même égalité après toute suite d'opérations                                                                                                                                                               |
| AC13    | déplacement sous soi-même, sous une fille, sous une petite-fille : `deplacement-cyclique`, zéro événement `update`                                               |                                                                                                                                                                                                           |
| AC14    | identifiant absent, page à la corbeille, parent à la corbeille, descendante d'une page à la corbeille, pour chaque opération : erreur typée, zéro `update`       |                                                                                                                                                                                                           |
| AC15    | titre de 201 caractères refusé à la création et au renommage, zéro `update` ; 200 accepté ; vide accepté                                                         |                                                                                                                                                                                                           |
| AC16    | champ manquant, mauvais type, titre de 201 caractères, valeur qui n'est pas une `Y.Map` : entrée ignorée, autres pages exposées                                  | pour toute valeur JSON arbitraire écrite dans `pages` ou dans une entrée : `lire()` ne lève pas et expose les pages valides                                                                               |
| AC17    | parent absent ; parent mal formé : page à la racine, même lecture sur une seconde réplique                                                                       |                                                                                                                                                                                                           |
| AC18    | `meta.version` à 2 : `lire()` et chaque écriture lèvent `version-non-prise-en-charge`, zéro `update`, état du `Y.Doc` inchangé                                   |                                                                                                                                                                                                           |
| AC19    | `window` et `document` indéfinis pendant les tests ; `dependencies` du manifeste réduit à `yjs` ; `pnpm contrats` (contrôle du socle)                            |                                                                                                                                                                                                           |

« Zéro `update` » se mesure en comptant les événements `update` du `Y.Doc` pendant l'appel.

## Règles de dépendances

- En vigueur et conservées : `pas-de-cycle`, `paquets-sans-apps`, `document-sans-reseau-ni-base`.
- Ajoutée : `document-yjs-seulement` — de `packages/document/src/` vers tout paquet npm autre que `yjs`, tout module intégré de Node et tout import non résolu : erreur.
- Option modifiée : `exclude` ne masque plus `node_modules`. Aujourd'hui les paquets npm sont retirés du graphe avant l'évaluation des règles, si bien qu'aucune règle ne peut voir un import de paquet. `doNotFollow` reste en place : les paquets sont vus comme des feuilles, sans être parcourus.

Les deux changements ont été essayés sur un gabarit jetable hors du dépôt : imports de `node:fs`, de `fast-check` et d'un paquet absent depuis `src/` signalés, import de `yjs` accepté, imports des tests non concernés.

## Fichiers à commiter par le dev (bloc 0)

Fichiers protégés ou partagés, hors du périmètre des agents. Textes complets, conformes à Prettier (`printWidth` 100). Un seul commit `Agent: dev`, `Feature: F-001`, après `pnpm install`.

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

### 5. `.dependency-cruiser.cjs` (modifié)

Ajouter cette règle à la fin de `forbidden`, après `document-sans-reseau-ni-base` :

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
```

Et dans `options`, remplacer

```js
    exclude: { path: "(^|/)(dist|coverage|node_modules)/" },
```

par

```js
    exclude: { path: "(^|/)(dist|coverage)/" },
```

### 6. `package.json` à la racine (modifié)

Ajouter dans `scripts`, après `contrats` :

```json
    "typecheck": "pnpm -r run typecheck"
```

Aucun contrôle du socle ne lance la vérification des types aujourd'hui : l'interdiction du DOM par `tsconfig.json` n'est donc tenue que si `agent-frontend` lance `pnpm typecheck` à chaque bloc (exigé par ce plan). La brancher dans `.agents/outils.env` est du ressort du dev.

### 7. `pnpm-lock.yaml` (modifié)

Produit par `pnpm install` à la racine après les fichiers 1 à 6. Attendu : `yjs@13.6.33`, `lib0` (transitive), `fast-check@4.10.2`, `pure-rand` (transitive).

### Sans changement

`pnpm-workspace.yaml` (le motif `packages/*` couvre déjà le paquet), `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc.json`.

### Vérification après le commit du bloc 0

```bash
pnpm install --frozen-lockfile
pnpm test        # aucun test encore : passe grâce à --passWithNoTests
pnpm contrats
pnpm lint
```

Les configurations 2, 3 et 4 ont été essayées sur un gabarit jetable hors du dépôt avec les outils installés (Vitest 5.0.3, TypeScript 6.0.3) : tests trouvés depuis la racine et depuis le paquet, `tsc` sans erreur, import de `node:fs` refusé à la compilation. Non essayé, faute d'installation : la résolution réelle de `yjs` et de `fast-check`, et les scripts `lint` et `format` lancés depuis le paquet.
