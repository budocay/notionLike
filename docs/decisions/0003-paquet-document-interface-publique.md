# ADR-0003 — Paquet `@notionlike/document` : interface publique et outillage

Statut : accepté, section « Amendement F-002 » comprise : écrite « proposée », elle est acceptée depuis que le dev a revalidé `specs/F-002.md` amendée (commit `86542e8`, `Agent: dev`) ; section « Amendements F-029 et F-007 » : écrite après coup, d'après le code de F-029 et de F-007 et leurs specs validées, acceptée par le dev le 2026-10-14
Date : 2026-10-08 ; amendement F-002 du 2026-10-08 (levée de la dette D-006), révisé le même jour après le premier rejet du gate de conception ; conséquence « Une seule instance de `yjs` » amendée le 2026-10-09, après le bloc 3 de F-002 ; amendements F-029 et F-007 du 2026-10-14

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

Ce qui suit est l'interface à la fin de F-001 ; F-002 propose de lui ajouter une méthode de fermeture et un code d'erreur (« Amendement F-002 », plus bas), sans rien retirer ni changer aucune signature. Elle n'est pas livrée d'un coup : `DocumentEspace`, `CodeErreurDocument` et `index.ts` n'exposent à chaque bloc du plan que ce qui est réalisé et testé dans ce bloc ou les précédents, sans méthode factice (`docs/decisions/F-001-conception.md`, « Interface livrée bloc par bloc »).

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

### Amendement F-002 : fermeture de la façade, rappel d'abonné qui lève

**Statut de cette section : accepté.** Elle est écrite contre `specs/F-002.md` amendée au commit `3a1253a` (F-002-AC29 à AC31, H15) ; les décisions qu'elle porte ont été prises par l'orchestrateur à la demande du dev. Écrite « proposée », elle est acceptée sans changement de texte depuis que le dev a revalidé cette spec au commit `86542e8`, qui ne modifie aucun des trois critères. Aucun code ne la réalise avant le bloc 1 de F-002 : d'ici là le code est celui de F-001 et `ARCHITECTURE.md` le décrit tel quel.

Elle lève la dette D-006, ouverte par les gates de F-001 : un rappel d'abonné qui levait interrompait la diffusion et remontait par `Y.applyUpdate`, et la façade ne retirait jamais son écouteur du `Y.Doc`. F-002 est le premier appelant réel de la façade.

Options étudiées pour ne pas perdre l'exception d'un rappel :

1. **La console d'erreur, seul canal** (retenue) : `console.error`, sans paramètre ni export de plus. `console` existe sous Node comme dans un navigateur : ce n'est pas une globale du navigateur au sens de F-001-AC19, et elle n'est pas dans la liste interdite au paquet.
2. Un récepteur passé à la création de la façade. Écartée après le premier passage du gate : il ajoutait un paramètre facultatif à deux fonctions publiques pour un seul usage, qui faisait exactement ce que fait l'option 1, et créait deux chemins de remise dans la session d'`apps/web`.
3. Un événement global (`reportError`, `window.onerror`). Écartée : globale du navigateur, interdite au paquet et absente côté serveur.
4. Relancer l'exception une fois la diffusion terminée. Écartée : elle remonterait encore par l'opération ou par `Y.applyUpdate`, ce que F-002-AC29 interdit.

Ce qui change dans l'interface, et rien d'autre :

```ts
export type CodeErreurDocument =
  // … les six codes de F-001, inchangés
  "facade-fermee";

export interface DocumentEspace {
  // … les sept membres de F-001, inchangés
  fermer(): void;
}
```

- `creerDocumentEspace()` et `ouvrirDocumentEspace(doc)` gardent leurs signatures de F-001. La liste des exports de `src/index.ts` ne change pas : neuf noms, dont deux types reçoivent chacun un membre. Aucun appel de F-001 ne change de sens, hormis les deux points qui suivent.
- **Rappel d'abonné qui lève (F-002-AC29).** Pendant la diffusion d'un changement, chaque rappel est appelé sous garde. S'il lève, les abonnés suivants sont appelés quand même, dans l'ordre d'inscription, et les règles de diffusion de F-001 restent vraies : un abonné désabonné pendant la diffusion n'est pas appelé, un abonné inscrit pendant la diffusion ne l'est qu'au changement suivant. L'exception ne remonte ni par l'opération qui a provoqué le changement, ni par `Y.applyUpdate`. Elle est signalée par `console.error` (une phrase fixe, puis l'exception), une fois par rappel fautif, dans l'ordre des rappels. C'est le seul canal ; il vaut pour toute façade, celles des tests de F-001 comprises. `console` est déclarée localement dans `document-espace.ts`, comme `crypto` l'est déjà, parce que le paquet compile sans `DOM` ni types Node ; un test qui l'espionne la déclare de la même façon (essai D du plan).
- **`fermer()` (F-002-AC30).** Elle retire du `Y.Doc` l'écouteur `afterTransaction` que la façade y avait posé et oublie ses abonnés. Elle ne lève jamais ; une seconde fermeture est sans effet ; une façade fermée ne se rouvre pas, l'appelant en ouvre une autre sur le même `Y.Doc`. `creerDocumentEspace` rend une façade ouverte comme `ouvrirDocumentEspace` : elle se ferme de la même façon.
- **`fermer()` appelée depuis un rappel d'abonné, pendant une diffusion.** C'est le cas de la session d'`apps/web`, qui ferme sa façade quand une mise à jour reçue apporte une version non prise en charge (ADR-0007). Les rappels restants de cette diffusion ne sont pas appelés, l'écouteur est retiré, et rien ne lève : ni `fermer()`, ni l'opération ou le `Y.applyUpdate` qui a provoqué la diffusion. Le résultat gardé est celui de la transaction en cours, lu avant la diffusion. Une autre façade ouverte sur le même `Y.Doc` reçoit quand même cette transaction : `yjs` appelle les écouteurs présents au début de l'émission.
- **Après la fermeture.** Une transaction appliquée au `Y.Doc` ne provoque ni relecture ni notification par cette façade. `lire()` rend ce qu'elle rendait à la fermeture, sans relire : la dernière arborescence gardée, même référence, ou le refus `version-non-prise-en-charge` si le document était dans cet état. `abonner` n'inscrit plus rien et rend une fonction sans effet ; les fonctions de désabonnement déjà rendues restent sans effet. Toute écriture (`creerPage`, `renommerPage`, `deplacerPage`, `mettreALaCorbeille`) est refusée par `ErreurDocument` de code `facade-fermee`, sans modifier le `Y.Doc` ni émettre de mise à jour.
- **Ordre des validations.** `facade-fermee` est contrôlé avant tout le reste : il précède le rang 1 (version du document) de la liste donnée plus haut. Une façade fermée sur un document de version non prise en charge refuse donc une écriture par `facade-fermee`, et sa lecture par `version-non-prise-en-charge`.
- **Appelants touchés par le nouveau code.** Un module qui traduit chaque code en message doit traiter `facade-fermee` : dans le workspace, c'est `apps/web/src/interface/messages.ts` (bloc 3 de F-002). Le test de couture de F-002-AC31 énumère les modules qui lisent un code d'erreur du document et échoue si celui qui les traduit ne le traite pas.

Preuves demandées au bloc 1 de F-002 (`docs/decisions/F-002-conception.md`, « Bloc 1 »), toutes dans `packages/document/test/fermeture.test.ts` : ordre et nombre des appels quand un ou deux rappels lèvent, pour une opération locale et pour `Y.applyUpdate`, et `console.error` espionnée appelée une fois par rappel fautif ; règles de diffusion de F-001 sous garde ; fermeture, seconde fermeture, `abonner` et `lire()` après fermeture ; écritures refusées par `facade-fermee` sans mise à jour ; `fermer()` depuis un rappel, pour chacune des deux origines, avec une seconde façade sur le même `Y.Doc` ; N ouvertures et fermetures sur un même `Y.Doc` qui laissent le nombre d'écouteurs `afterTransaction` de départ. Les 224 tests de F-001 restent verts sans retouche : aucun ne fixait la remontée de l'exception ni la liste des codes. Mécanisme essayé sur un gabarit le 2026-10-08 (essai D du plan : 233 tests verts, dont les 224 de F-001).

### Amendements F-029 et F-007 (2026-10-14) : rang borné, corbeille

Ces deux features ont élargi l'interface sans amendement préalable (mode économe, dettes D-018 et, pour F-007, `MEMORY/features/F-007.md`). Le format qu'elles touchent est décrit par l'ADR-0002 (amendements F-029 et F-007). La liste des exports de `src/index.ts` ne change pas : quinze noms, les neuf de F-001 et de F-002 et les six du document de page (ADR-0009). Ce qui change, et rien d'autre :

```ts
export type CodeErreurDocument =
  // … les sept codes de F-001 et F-002, et `version-invalide` (F-003, document de page)
  | "rang-indisponible" // F-029
  | "page-hors-corbeille"; // F-007

export interface DocumentEspace {
  // … les huit membres de F-001 et F-002, inchangés
  restaurerPage(id: IdPage): void;
  supprimerDefinitivement(id: IdPage): readonly IdPage[];
}
```

- **`rang-indisponible`** (F-029 H5) : aucun jeu de rangs admis ne permet la création ou le déplacement demandés, réattribution élargie comprise. Ce contrôle vient après tous les autres : il suit le rang 6 (position) de la liste ci-dessus. Il n'ouvre aucune transaction. Avec la borne de 1024, il n'est pas atteignable par l'interface publique ; `src/document-espace.ts` exporte pour les tests un point d'entrée interne, `ouvrirDocumentEspaceBorne(doc, borne)`, que `src/index.ts` ne réexporte pas (F-029-AC10). Ses importeurs sont trois tests de `packages/document/test/` ; `apps/web/test/coutures-rang.test.ts` ne fait que nommer la fonction pour l'énumérer.
- **`restaurerPage(id)`** (F-007) : baisse le drapeau de corbeille d'une racine de la corbeille, et n'écrit rien d'autre. Ordre des refus : `facade-fermee`, `version-non-prise-en-charge`, `page-introuvable`, `page-hors-corbeille`, puis `page-a-la-corbeille` si la page est sous une page à la corbeille (seule celle-ci se restaure).
- **`supprimerDefinitivement(id)`** (F-007) : retire en une transaction l'entrée de la page, lue dans la corbeille, et celles de sa descendance lue, et rend leurs identifiants, la page visée d'abord : l'appelant s'en sert pour fermer les documents de ces pages et effacer leurs bases (ADR-0001, amendement F-007). Ordre des refus : `facade-fermee`, `version-non-prise-en-charge`, `page-introuvable`, `page-hors-corbeille`.
- `mettreALaCorbeille` est inchangée : une page déjà à la corbeille est refusée par `page-a-la-corbeille`, pas par `page-hors-corbeille`.
- `creerDocumentEspace()` construit son `Y.Doc` avec le ramasse-miettes explicitement actif (`{ gc: true }`, ADR-0001, amendement F-007). `ouvrirDocumentEspace(doc)` reste sans réglage : l'appelant construit le `Y.Doc`.
- Rien d'autre n'est exporté : ni la borne des rangs (`LONGUEUR_MAX_RANG`), ni `AUCUN_RANG_ADMIS`, ni `admettrePlace`.
- Appelants touchés : le module qui traduit chaque code en message (`apps/web/src/interface/messages.ts`) traite les dix codes ; les deux opérations de corbeille sont portées par l'état `pret` de la session d'espace (`espace/session-espace.ts`) et appelées dans `apps/web/src/` par `interface/Application.tsx` seul, pour l'écran de la corbeille.

### Organisation interne

- `src/rang.ts`, `src/arbre.ts` et `src/erreurs.ts` forment le cœur pur : calcul des rangs ; passage des entrées valides à l'arborescence (parent effectif, cycles, corbeille, ordre) ; classe d'erreur. Ils n'importent qu'eux-mêmes : ni `yjs` ni aucun autre paquet, ni `format.ts`, ni `document-espace.ts`. Le contrat `document-coeur-pur` le vérifie.
- `src/format.ts` est le seul fichier qui connaît les noms de clés et valide une entrée brute ; `src/document-espace.ts` porte les opérations et l'abonnement ; `src/index.ts` ne fait que réexporter. Sens des dépendances : `index → document-espace → format, arbre, rang, erreurs`. Depuis F-029, `format.ts` importe aussi `erreurs.ts` (`admettrePlace` lève `rang-indisponible`) ; `rang.ts` reste dans le cœur pur.
- Les imports relatifs portent l'extension `.ts`, et la syntaxe reste effaçable (`erasableSyntaxOnly`) : le paquet source est ainsi chargeable par Vitest sans compilation, ce que les tests de F-001 exercent. Le chargement par Node 26 sans compilation est l'intention de ces deux choix. Il n'est vérifié qu'en partie : sur un gabarit jetable, Node 26.11.0 a chargé un `src/index.ts` de quelques lignes avec le vrai `yjs` par son chemin de fichier (essai I du plan). Le chargement par le nom du paquet (`@notionlike/document`, champ `exports`) depuis un autre paquet du workspace est **non vérifié** : F-001 n'a aucun consommateur. À prouver par la première feature serveur, qui pourra remettre en cause le paquet source si la preuve échoue. Le chargement par Vite est de même à prouver par F-002.

### Outillage

- ESLint, `no-restricted-globals` limitée à `packages/document/src` : `window`, `document`, `navigator`, `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `indexedDB`, `localStorage`, `sessionStorage` et `process` y sont interdits, accès par `globalThis` compris. C'est la barrière déterministe de « sans DOM, sans réseau, sans stockage » (F-001-AC19) : ces globales s'utilisent sans import, donc hors de vue des contrats de dépendances, et `pnpm lint` est lancé par le socle à chaque commit.
- TypeScript, seconde barrière : bibliothèque `ES2023` seule, sans `DOM` ni types Node. Un usage du DOM, du réseau ou du système de fichiers dans le module ne compile pas. Aucun contrôle du socle ne lance `tsc` : `pnpm typecheck` est exigé à chaque bloc par le plan, et ne compte pas comme seule barrière. `crypto.randomUUID`, présent dans Node et dans les navigateurs, est déclaré localement là où il est appelé.
- Vitest 5.0.3 (version du dépôt), environnement `node`. Les tests sont dans `packages/document/test/`, séparés de `src/`.
- `fast-check@4.10.2` en dépendance de développement, pour les critères de convergence et de robustesse. Les tests de propriétés tournent avec une graine fixe : en l'absence de CI, les hooks git sont la seule barrière et doivent donner le même résultat à chaque exécution.
- Contrats de dépendances (dependency-cruiser), deux règles écrites en liste blanche. `document-yjs-seulement` : depuis `packages/document/src`, seul un fichier de `packages/document/src` ou du paquet `yjs` peut être importé ; tout le reste échoue, sans énumération : autre paquet npm, module intégré de Node, import non résolu, fichier local hors de `src/` (`test/`, autre paquet du workspace). `document-coeur-pur` : `src/(rang|arbre|erreurs).ts` n'importent qu'eux-mêmes ; un fichier pur extrait plus tard de `document-espace.ts` s'y ajoute. Pour que ces deux règles voient les paquets npm, l'option `exclude` ne masque plus `node_modules`, et ne masque `dist` et `coverage` que dans un paquet ou une application du dépôt : le point d'entrée de `yjs` est dans un dossier `dist`, et la règle d'origine l'effaçait du graphe (essai C du plan).

## Conséquences

- Les consommateurs dépendent de deux fonctions, d'une façade de six méthodes (sept avec `fermer`, amendement F-002) et d'une classe d'erreur ; le format de l'ADR-0002 peut évoluer derrière eux.
- Exposer `doc` permet à un consommateur d'écrire dans les types partagés en contournant les validations. C'est une convention, pas une barrière : la lecture tolérante (F-001-AC16, AC17) en limite l'effet, et les revues refusent tout accès aux types partagés hors de `packages/document`.
- **Une seule instance de `yjs` dans le workspace.** Exposer `doc` fait importer `yjs` par chaque consommateur. Si deux copies de `yjs` étaient chargées, une `Y.Map` créée par l'une ne serait pas reconnue par l'autre : la validation « la valeur est une `Y.Map` » (ADR-0002, lecture, étape 2) écarterait toutes les entrées, et F-001-AC16 demande de les ignorer sans erreur. L'arborescence serait vide, en silence.
  - Parade retenue : l'unicité de l'instance, pas une validation tolérante. `format.ts` peut reconnaître une `Y.Map` par `instanceof`, parce que ce test n'est fragile qu'entre deux instances et que deux instances sont interdites. Une reconnaissance par la forme (présence de `get`, `has`…) ne couvrirait que la lecture : rien n'établit que l'écriture d'une `Y.Map` d'une instance dans le document d'une autre fonctionne (non vérifié : aucun essai à deux instances), et elle accepterait des valeurs qui ne sont pas des types partagés. Avec une seule instance, une entrée reçue par `Y.applyUpdate` est bien reconnue par `instanceof` (essai I du plan).
  - Dans F-001 l'unicité tient par construction : un seul manifeste déclare `yjs`, en version exacte, et aucun autre paquet ne l'importe.
  - À la charge de F-002, première feature qui ajoute un second manifeste et une bibliothèque dépendant de `yjs` : livrer le test de couture qui construit un `Y.Doc` avec l'import `yjs` du consommateur, y crée des pages par la façade, le rouvre par `ouvrirDocumentEspace` et exige de les relire. Deux instances font alors échouer un test au lieu de vider l'arborescence.
  - Amendement du 2026-10-09 (décision de l'orchestrateur, après le bloc 3 de F-002). Ce paragraphe demandait aussi à F-002 d'imposer une version unique à la racine (catalogue pnpm dans `pnpm-workspace.yaml`, ou `overrides`). Cette demande est retirée : rien n'est posé à la racine, et la détection par un test suffit tant que deux manifestes seulement déclarent `yjs`, tous deux en version exacte. Le test est `apps/web/test/structure.test.ts`, F-002-AC21. Il exige quatre choses : la liste des manifestes du workspace qui déclarent `yjs` est exactement `packages/document/package.json` et `apps/web/package.json` (racine, `apps/*` et `packages/*` énumérés) ; ils demandent la même version ; le verrou n'en résout qu'une, égale à la chaîne déclarée, ce qui refuse aussi une plage de versions ; le document rendu par `creerDocumentEspace` est une instance du `Y.Doc` importé par `apps/web`. `apps/web/test/coutures.test.ts` le constate de même pour le document de la session. La forme décrite au point précédent (pages créées par la façade sur un `Y.Doc` du consommateur, puis relues par `ouvrirDocumentEspace`) est exercée par les tests de persistance d'`apps/web`, par l'aide `ouvrirFacade(new Y.Doc())`.
  - Ce que cet amendement laisse découvert : le test constate, il n'empêche pas. Une dépendance transitive qui demanderait une autre version de `yjs` ne serait vue qu'au prochain `pnpm test`, par la ligne du verrou, et non refusée à l'installation. Limite admise pour deux manifestes.
  - Condition de réouverture : un troisième manifeste qui déclare `yjs` (le serveur, F-008) fait échouer la liste fermée du test. Ce n'est pas une ligne à ajouter à la liste : la feature qui l'apporte rouvre la question et choisit entre le catalogue pnpm, `overrides` et le maintien de la seule détection, dans son ADR.
- Le cœur pur et la règle des globales sont tenus par des contrôles, pas par la relecture : un import de `yjs` dans `arbre.ts`, un import d'un fichier de `test/` depuis `src/` ou un `fetch` dans `src/` fait échouer `pnpm contrats` ou `pnpm lint`.
- Un paquet source lie les consommateurs aux options TypeScript du paquet (extensions `.ts`). Passer à un paquet compilé resterait un changement local : `exports` et un script de build.
- Une graine fixe explore moins de cas qu'une graine aléatoire. Un contre-exemple trouvé à la main ou en changeant la graine s'ajoute comme test par l'exemple.
- `ouvrirDocumentEspace` appelé plusieurs fois sur le même `Y.Doc` crée autant de façades et d'écouteurs : une façade par document, tenue par l'appelant. Avec l'amendement F-002, l'appelant la ferme quand il cesse de s'en servir, et l'écouteur est retiré.
- Amendement F-002 : un abonné fautif ne prive plus les autres et ne casse plus l'application d'une mise à jour reçue ; en contrepartie, son exception ne s'arrête plus sur la pile de l'appelant et n'est visible que sur la console d'erreur. Un appelant qui veut la traiter autrement la rattrape dans son propre rappel. Un appelant qui ne ferme pas sa façade garde le coût d'une relecture par transaction du `Y.Doc`, comme avant. Un consommateur qui énumère les codes d'erreur a un code de plus à traiter.
- Amendements F-029 et F-007 : la façade compte dix membres et le type des erreurs dix codes ; un consommateur qui énumère les codes en a deux de plus à traiter. Le refus `rang-indisponible` et la réattribution élargie ne sont prouvés que par le point d'entrée interne à borne abaissée : un consommateur ne peut pas les provoquer à la borne réelle.
