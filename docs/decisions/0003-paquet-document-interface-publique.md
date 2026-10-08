# ADR-0003 — Paquet `@notionlike/document` : interface publique et outillage

Statut : accepté
Date : 2026-10-08

## Contexte et problème

`packages/document` est le premier paquet du dépôt et sera importé par le client (F-002, F-013) et par le serveur (F-012). Ce qu'il exporte devient un contrat entre paquets. Il faut une interface étroite, qui cache le format de l'ADR-0002, tout en laissant la persistance (y-indexeddb) et la synchronisation (Hocuspocus) faire leur travail : ces deux bibliothèques prennent un `Y.Doc` en paramètre.

D'où vient chaque choix d'outillage :

- Arrêtés par la spec F-001 (validée, commit `ccbcd25`) : le nom du paquet (H6), `yjs` comme seule dépendance d'exécution directe (F-001-AC19), Vitest sous Node, et quatre fichiers à la charge du dev (`packages/document/package.json`, `packages/document/vitest.config.ts`, `packages/document/tsconfig.json`, `pnpm-lock.yaml`).
- Version de `yjs` (`13.6.33`) : relevée par la veille du 2026-10-08 (ligne 13.x, aucune version 14 stable).
- `fast-check@4.10.2` : la spec ne le cite pas. C'est une dépendance de développement proposée par la veille (« à faire valider par le dev ») et retenue par cette conception pour F-001-AC7, AC9 et AC16.
- Quatre fichiers racine que la spec ne liste pas et que cette conception ajoute aux prérequis du dev : `vitest.config.ts` (nouveau), `.dependency-cruiser.cjs`, `package.json` et `eslint.config.mjs` (modifiés).

fast-check et ces quatre fichiers ne sont donc validés par personne tant que le dev ne les a pas commités : c'est le commit `Agent: dev` du bloc 0, qui les introduit, qui les entérine. La liste réelle du bloc 0 compte huit fichiers, les quatre de la spec et ces quatre-là ; leur texte est dans `docs/decisions/F-001-conception.md`.

## Options étudiées

Fuite des types Yjs :

1. **Aucun type Yjs exposé** : le module encode, applique et diffuse lui-même les mises à jour sous forme d'octets. Étanche, mais oblige à réécrire ce que y-indexeddb et Hocuspocus font déjà sur un `Y.Doc`.
2. **Exposer le `Y.Doc`, et lui seul** (retenue). Les types partagés (`Y.Map`), les noms de clés et les champs restent internes.
3. **Exposer les `Y.Map`** pour que l'interface s'y abonne directement. Écarté : chaque consommateur dépendrait du format.

Lecture :

- a. **Un instantané immuable et un abonnement sans argument** (retenue) : la forme attendue par `useSyncExternalStore` de React, utilisable telle quelle côté serveur.
- b. **Des événements par opération** (page créée, déplacée…). Écarté : une mise à jour reçue ne correspond pas à une opération, et la résolution des conflits (ADR-0002) peut déplacer plusieurs pages d'un coup.

Distribution : paquet compilé (`dist`) ou **paquet source** (retenue) : `exports` pointe sur `src/index.ts`. Vite et Vitest consomment le TypeScript directement ; pas d'étape de build à maintenir pour un paquet interne.

## Décision

### Interface publique (`packages/document/src/index.ts`)

Ce qui suit est l'interface à la fin de F-001. Elle n'est pas livrée d'un coup : `DocumentEspace`, `CodeErreurDocument` et `index.ts` n'exposent à chaque bloc du plan que ce qui est réalisé et testé dans ce bloc ou les précédents, sans méthode factice (`docs/decisions/F-001-conception.md`, « Interface livrée bloc par bloc »).

```ts
import type * as Y from "yjs";

export type IdPage = string;

export interface PageLue {
  readonly id: IdPage;
  readonly titre: string;
  readonly enfants: readonly PageLue[];
}

export interface Arborescence {
  readonly racines: readonly PageLue[];
  readonly corbeille: readonly PageLue[];
}

export interface Emplacement {
  readonly parent: IdPage | null;
  readonly position?: number;
}

export type CodeErreurDocument =
  | "page-introuvable"
  | "page-a-la-corbeille"
  | "deplacement-cyclique"
  | "titre-trop-long"
  | "position-invalide"
  | "version-non-prise-en-charge";

export class ErreurDocument extends Error {
  readonly code: CodeErreurDocument;
}

export interface DocumentEspace {
  readonly doc: Y.Doc;
  lire(): Arborescence;
  abonner(rappel: () => void): () => void;
  creerPage(titre: string, ou?: Emplacement): IdPage;
  renommerPage(id: IdPage, titre: string): void;
  deplacerPage(id: IdPage, ou: Emplacement): void;
  mettreALaCorbeille(id: IdPage): void;
}

export function creerDocumentEspace(): DocumentEspace;
export function ouvrirDocumentEspace(doc: Y.Doc): DocumentEspace;
```

Contrat de chaque élément :

- `creerDocumentEspace()` crée un `Y.Doc` neuf et y écrit la version de format 1 : c'est la naissance d'un espace. `ouvrirDocumentEspace(doc)` s'attache à un `Y.Doc` que d'autres remplissent (persistance, synchronisation) et n'écrit rien : un document rechargé à chaque session ne doit pas recevoir une écriture de version par session.
- `doc` est la seule fuite de Yjs : la persistance et la synchronisation s'y branchent et en encodent les mises à jour au format V1 (ADR-0001). Lire ou écrire ses types partagés hors du module est interdit aux consommateurs.
- `lire()` renvoie l'arborescence lue et la corbeille (ADR-0002). `corbeille` est une forêt : ses racines sont les pages à la corbeille qui sont à la racine ou dont le parent n'y est pas, avec toute leur descendance. La référence renvoyée reste la même tant que le résultat n'a pas changé.
- `abonner(rappel)` appelle `rappel` une fois par transaction Yjs qui change le résultat de `lire()` (opération locale ou mise à jour reçue), jamais pour une transaction qui ne le change pas, et renvoie la fonction de désabonnement (F-001-AC6). `abonner` ne lève jamais, même sur un document de version inconnue. L'entrée dans l'état « version non prise en charge », comme la sortie de cet état, compte pour un changement.
- `creerPage(titre)` sans emplacement crée à la racine, en dernière position.
- `Emplacement.position` est l'indice, à partir de 0, parmi les sœurs de destination lues (hors corbeille), page déplacée exclue ; absent, la page va en dernière position. Un indice qui n'est pas un entier entre 0 et le nombre de ces sœurs, bornes comprises, est refusé par `position-invalide` : un indice faux est une erreur de l'appelant, la corriger en silence la cacherait.
- Erreurs : une seule classe, distinguée par `code`. `page-introuvable` et `page-a-la-corbeille` (F-001-AC14), `deplacement-cyclique` (F-001-AC13), `titre-trop-long` (F-001-AC15), `version-non-prise-en-charge` (F-001-AC18, levée par `lire()` et par toute écriture). Une opération refusée n'émet aucune mise à jour.
- « Introuvable » : l'identifiant ne désigne aucune entrée valide du document (absente, ou ignorée au titre de F-001-AC16). « À la corbeille » : la page figure dans `lire().corbeille`, par son propre drapeau ou par celui d'une ancêtre.
- `mettreALaCorbeille` sur une page déjà à la corbeille est refusée par `page-a-la-corbeille` (F-001-AC14).
- Ordre des validations, quand plusieurs refus sont possibles : le premier contrôle qui échoue donne le code.
  1. version du document (`version-non-prise-en-charge`) ;
  2. titre, pour la création et le renommage (`titre-trop-long`) ;
  3. page visée, pour le renommage, le déplacement et la mise à la corbeille (`page-introuvable`, puis `page-a-la-corbeille`) ;
  4. parent de destination, pour la création et le déplacement (`page-introuvable`, puis `page-a-la-corbeille`) ;
  5. cycle, pour le déplacement (`deplacement-cyclique`) ;
  6. position, pour la création et le déplacement (`position-invalide`).

Rien d'autre n'est exporté : ni constantes de format, ni fonction de rang, ni fonction de lecture.

### Organisation interne

- `src/rang.ts`, `src/arbre.ts` et `src/erreurs.ts` forment le cœur pur : calcul des rangs ; passage des entrées valides à l'arborescence (parent effectif, cycles, corbeille, ordre) ; classe d'erreur. Ils n'importent qu'eux-mêmes : ni `yjs` ni aucun autre paquet, ni `format.ts`, ni `document-espace.ts`. Le contrat `document-coeur-pur` le vérifie.
- `src/format.ts` est le seul fichier qui connaît les noms de clés et valide une entrée brute ; `src/document-espace.ts` porte les opérations et l'abonnement ; `src/index.ts` ne fait que réexporter. Sens des dépendances : `index → document-espace → format, arbre, rang, erreurs`.
- Les imports relatifs portent l'extension `.ts`, et la syntaxe reste effaçable (`erasableSyntaxOnly`) : le paquet source est ainsi chargeable par Vitest sans compilation, ce que les tests de F-001 exercent. Le chargement par Node 26 sans compilation est l'intention de ces deux choix. Il n'est vérifié qu'en partie : sur un gabarit jetable, Node 26.11.0 a chargé un `src/index.ts` de quelques lignes avec le vrai `yjs` par son chemin de fichier (essai I du plan). Le chargement par le nom du paquet (`@notionlike/document`, champ `exports`) depuis un autre paquet du workspace est **non vérifié** : F-001 n'a aucun consommateur. À prouver par la première feature serveur, qui pourra remettre en cause le paquet source si la preuve échoue. Le chargement par Vite est de même à prouver par F-002.

### Outillage

- ESLint, `no-restricted-globals` limitée à `packages/document/src` : `window`, `document`, `navigator`, `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `indexedDB`, `localStorage`, `sessionStorage` et `process` y sont interdits, accès par `globalThis` compris. C'est la barrière déterministe de « sans DOM, sans réseau, sans stockage » (F-001-AC19) : ces globales s'utilisent sans import, donc hors de vue des contrats de dépendances, et `pnpm lint` est lancé par le socle à chaque commit.
- TypeScript, seconde barrière : bibliothèque `ES2023` seule, sans `DOM` ni types Node. Un usage du DOM, du réseau ou du système de fichiers dans le module ne compile pas. Aucun contrôle du socle ne lance `tsc` : `pnpm typecheck` est exigé à chaque bloc par le plan, et ne compte pas comme seule barrière. `crypto.randomUUID`, présent dans Node et dans les navigateurs, est déclaré localement là où il est appelé.
- Vitest 5.0.3 (version du dépôt), environnement `node`. Les tests sont dans `packages/document/test/`, séparés de `src/`.
- `fast-check@4.10.2` en dépendance de développement, pour les critères de convergence et de robustesse. Les tests de propriétés tournent avec une graine fixe : en l'absence de CI, les hooks git sont la seule barrière et doivent donner le même résultat à chaque exécution.
- Contrats de dépendances (dependency-cruiser) : `document-yjs-seulement`, `packages/document/src` n'importe que `yjs`, ni autre paquet, ni module intégré de Node ; `document-coeur-pur`, `src/(rang|arbre|erreurs).ts` n'importent qu'eux-mêmes. Pour que ces deux règles voient les paquets npm, l'option `exclude` ne masque plus `node_modules`, et ne masque `dist` et `coverage` que dans un paquet ou une application du dépôt : le point d'entrée de `yjs` est dans un dossier `dist`, et la règle d'origine l'effaçait du graphe (essai C du plan).

## Conséquences

- Les consommateurs dépendent de deux fonctions, d'une façade de six méthodes et d'une classe d'erreur ; le format de l'ADR-0002 peut évoluer derrière eux.
- Exposer `doc` permet à un consommateur d'écrire dans les types partagés en contournant les validations. C'est une convention, pas une barrière : la lecture tolérante (F-001-AC16, AC17) en limite l'effet, et les revues refusent tout accès aux types partagés hors de `packages/document`.
- **Une seule instance de `yjs` dans le workspace.** Exposer `doc` fait importer `yjs` par chaque consommateur. Si deux copies de `yjs` étaient chargées, une `Y.Map` créée par l'une ne serait pas reconnue par l'autre : la validation « la valeur est une `Y.Map` » (ADR-0002, lecture, étape 2) écarterait toutes les entrées, et F-001-AC16 demande de les ignorer sans erreur. L'arborescence serait vide, en silence.
  - Parade retenue : l'unicité de l'instance, pas une validation tolérante. `format.ts` peut reconnaître une `Y.Map` par `instanceof`, parce que ce test n'est fragile qu'entre deux instances et que deux instances sont interdites. Une reconnaissance par la forme (présence de `get`, `has`…) ne couvrirait que la lecture : rien n'établit que l'écriture d'une `Y.Map` d'une instance dans le document d'une autre fonctionne (non vérifié : aucun essai à deux instances), et elle accepterait des valeurs qui ne sont pas des types partagés. Avec une seule instance, une entrée reçue par `Y.applyUpdate` est bien reconnue par `instanceof` (essai I du plan).
  - Dans F-001 l'unicité tient par construction : un seul manifeste déclare `yjs`, en version exacte, et aucun autre paquet ne l'importe.
  - À la charge de F-002, première feature qui ajoute un second manifeste et une bibliothèque dépendant de `yjs` : imposer une version unique à la racine (catalogue pnpm dans `pnpm-workspace.yaml`, ou `overrides`), et livrer le test de couture qui construit un `Y.Doc` avec l'import `yjs` du consommateur, y crée des pages par la façade, le rouvre par `ouvrirDocumentEspace` et exige de les relire. Deux instances font alors échouer un test au lieu de vider l'arborescence.
- Le cœur pur et la règle des globales sont tenus par des contrôles, pas par la relecture : un import de `yjs` dans `arbre.ts` ou un `fetch` dans `src/` fait échouer `pnpm contrats` ou `pnpm lint`.
- Un paquet source lie les consommateurs aux options TypeScript du paquet (extensions `.ts`). Passer à un paquet compilé resterait un changement local : `exports` et un script de build.
- Une graine fixe explore moins de cas qu'une graine aléatoire. Un contre-exemple trouvé à la main ou en changeant la graine s'ajoute comme test par l'exemple.
- `ouvrirDocumentEspace` appelé plusieurs fois sur le même `Y.Doc` crée autant de façades et d'écouteurs : une façade par document, tenue par l'appelant.
