# ARCHITECTURE — notionLike

Dernière mise à jour : 2026-10-08

Ce fichier décrit le code présent dans le dépôt, pas une cible. Les décisions sont dans `docs/decisions/`, les intentions dans `specs/` et `ROADMAP.md`.

## Modules réels et dépendances

État décrit : commit `dd6e018` (bloc 0 de F-001) plus les blocs 1 à 4 de F-001, présents dans l'arbre de travail et pas encore commités (`packages/document/src/`, `packages/document/test/`).

Le dépôt est un workspace pnpm (`apps/*`, `packages/*`) qui contient l'outillage (TypeScript, ESLint, Prettier, Vitest, dependency-cruiser) et un paquet, `packages/document`. `apps/` est vide : ni client, ni serveur.

### `packages/document` (`@notionlike/document`)

Modèle du document d'un espace : l'arbre de ses pages, porté par un `Y.Doc`. Il ne porte pas le contenu des pages. Paquet source, sans build : le champ `exports` du manifeste désigne `./src/index.ts`. Aucun autre paquet ne l'importe ; son chargement par son nom depuis un autre paquet du workspace n'a jamais été essayé.

- Manifeste : paquet privé, ESM, `sideEffects: false`. Dépendance d'exécution : `yjs` 13.6.33, seule. Dépendances de développement : `fast-check` 4.10.2, `vitest`.
- `tsconfig.json` : étend `tsconfig.base.json`, `lib` limitée à `ES2023` (pas de DOM), `types` vide (pas de types Node), `noEmit` ; il couvre `src`, `test` et `vitest.config.ts`.
- `vitest.config.ts` : projet nommé `document`, environnement `node`, tests dans `test/**/*.test.ts`.

Six modules à plat dans `src/` :

| Module               | Rôle                                                                                                                                                                                       | Importe                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `erreurs.ts`         | `ErreurDocument` (un champ `code`) et l'union `CodeErreurDocument`                                                                                                                         | rien                                                             |
| `rang.ts`            | rang d'une page parmi ses sœurs, chaîne sur 62 chiffres : `estUnRang`, `rangEntre` (un rang entre deux bornes), `rangsCroissantsEntre` (une suite croissante)                              | rien                                                             |
| `arbre.ts`           | types `IdPage`, `PageLue`, `Arborescence`, `EntreePage`, `ArbreLu` ; `lireArbre` passe des entrées retenues à l'arborescence lue ; `trouverPage`, `estDansLeSousArbre`, `memeArborescence` | rien                                                             |
| `format.ts`          | seul fichier qui connaît les noms des types racines et des champs du `Y.Doc` : écritures, lecture de la version, validation et lecture des entrées                                         | `yjs`, `rang.ts`, `arbre.ts` (types seulement)                   |
| `document-espace.ts` | façade `DocumentEspace`, les deux fonctions qui la créent, validations des opérations, réattribution de rangs, consolidation, résultat gardé de la lecture et abonnés                      | `yjs`, `arbre.ts`, `erreurs.ts`, `format.ts`, `rang.ts`          |
| `index.ts`           | interface publique : réexporte par nom, sans code                                                                                                                                          | `document-espace.ts`, `arbre.ts` (types seulement), `erreurs.ts` |

Sens des dépendances : `index → document-espace → format → rang, arbre`, et `document-espace → arbre, rang, erreurs`. `rang.ts`, `arbre.ts` et `erreurs.ts` forment le cœur pur : ils n'importent rien, pas même l'un l'autre, et ne connaissent pas `yjs`. `yjs` n'est importé que par `format.ts` et `document-espace.ts`. `format.ts` connaît le cœur pur (les types d'`arbre.ts`, la fonction `estUnRang`), jamais l'inverse.

#### Interface publique

`src/index.ts` exporte neuf noms et rien d'autre (ni constante de format, ni fonction de rang, ni fonction de lecture) :

- types : `IdPage`, `PageLue`, `Arborescence`, `Emplacement`, `CodeErreurDocument`, `DocumentEspace` ;
- valeurs : `ErreurDocument`, `creerDocumentEspace`, `ouvrirDocumentEspace`.

`creerDocumentEspace()` crée un `Y.Doc` et y écrit la version de format 1. `ouvrirDocumentEspace(doc)` s'attache à un `Y.Doc` existant et n'écrit rien.

Façade `DocumentEspace`, sept membres :

- `doc` : le `Y.Doc`, seule fuite de Yjs hors du paquet. C'est là que la persistance et la synchronisation se branchent.
- `lire()` : l'arborescence (`racines`) et la corbeille (`corbeille`). Elle rend un résultat gardé par la façade, sans relire le document : la même référence tant qu'aucune transaction n'a changé l'arborescence.
- `abonner(rappel)` : inscrit un rappel sans argument et rend la fonction de désabonnement. Le rappel est appelé une fois par transaction du `Y.Doc` qui change le résultat de `lire()`, locale ou reçue, jamais pour une transaction qui ne le change pas.
- `creerPage(titre, ou?)` : crée une page sous un parent, à une position parmi ses sœurs lues ; sans emplacement, à la racine en dernière position. L'identifiant vient de `crypto.randomUUID()`, déclaré localement faute de types DOM ou Node.
- `renommerPage(id, titre)` : écrit le titre. Un titre identique n'écrit rien.
- `deplacerPage(id, ou)` : écrit la place (parent et rang, en une seule valeur). La position se compte parmi les sœurs de destination, page déplacée exclue. Une page déjà à cet emplacement n'écrit rien.
- `mettreALaCorbeille(id)` : pose le drapeau de corbeille ; aucune entrée n'est jamais supprimée.

Refus, par `ErreurDocument`, avant toute écriture : une opération refusée ou sans effet n'ouvre aucune transaction. Six codes, et le premier contrôle qui échoue donne le code, dans cet ordre :

1. `version-non-prise-en-charge` : version du document ;
2. `titre-trop-long` : plus de 200 unités UTF-16 (création, renommage) ;
3. `page-introuvable` puis `page-a-la-corbeille` : page visée ;
4. `page-introuvable` puis `page-a-la-corbeille` : parent de destination ;
5. `deplacement-cyclique` : destination égale à la page ou dans sa descendance lue ;
6. `position-invalide` : pas un entier entre 0 et le nombre de sœurs.

« Introuvable » : aucune entrée retenue ne porte cet identifiant (absente ou ignorée). « À la corbeille » : par son drapeau ou par celui d'une ancêtre.

#### Format et version

Dans le `Y.Doc` : type racine `meta`, clé `version` ; type racine `pages`, une `Y.Map` par page (clé : l'identifiant) avec les champs `titre`, `place` (objet `{ parent, rang }`) et `corbeille`.

Version (`estDeVersionPriseEnCharge`, `format.ts`) : une clé `version` absente vaut la version 1 ; le nombre `1` est la version 1 ; toute autre valeur présente est une version non prise en charge. Dans ce cas :

- `lire()` et les quatre écritures lèvent `version-non-prise-en-charge`, sans rien écrire ;
- `ouvrirDocumentEspace` et `abonner` ne lèvent pas, et `Y.applyUpdate` non plus quand la version arrive par une mise à jour ;
- les abonnés sont notifiés une fois à l'entrée dans cet état et une fois à la sortie, jamais tant qu'il dure.

#### Règles de lecture

La lecture est une fonction de l'état du document ; elle n'y écrit jamais. Dans cet ordre :

1. Entrées retenues (`format.ts`) : la valeur est une `Y.Map` (`instanceof`), `titre` est une chaîne de 200 unités au plus, `corbeille` un booléen, `place` un objet dont `parent` est une chaîne ou `null` et `rang` un rang valide (non vide, sur l'alphabet `0-9A-Za-z`, sans `0` final). Toute autre entrée est ignorée, sans exception. Un champ en plus est toléré.
2. Parent absent (`arbre.ts`) : un parent enregistré qui ne désigne aucune entrée retenue vaut la racine. La page y est exposée à son rang ; son parent enregistré n'est pas réécrit, et elle le rejoint s'il arrive ou redevient valide.
3. Cycles (`arbre.ts`) : chaque cycle de parents est coupé à sa page de plus petit identifiant, exposée à la racine ; les autres gardent leur parent. `lireArbre` rend l'ensemble de ces pages coupées (`pagesCoupees`), interne au paquet.
4. Corbeille (`arbre.ts`) : une page à la corbeille emporte sa descendance ; `corbeille` est une forêt dont les racines sont les pages jetées dont le parent ne l'est pas.
5. Ordre (`arbre.ts`) : les sœurs, et les racines de la corbeille entre elles, sont triées par rang puis par identifiant, comparés par unités de code.

Chaque entrée retenue apparaît une fois et une seule, dans `racines` ou dans `corbeille`. Les parcours d'`arbre.ts` sont itératifs : la profondeur de l'arbre n'est pas bornée.

#### Écritures qui touchent d'autres pages

Dans la transaction de l'opération, une seule écriture de `place` par page (`document-espace.ts`) :

- Réattribution : insérer (création ou déplacement) entre deux sœurs lues de même rang réécrit le rang des sœurs de ce rang qui suivent la position. Le parent enregistré de chacune est recopié tel quel.
- Consolidation : déplacer une page qui descend, dans l'arborescence lue, d'une page coupée écrit aussi pour cette page coupée `{ parent: null, rang }`. Une ancêtre exposée par la règle 2 n'est pas consolidée.

Le refus `deplacement-cyclique` ne voit que l'arbre lu sur la réplique : un cycle né de deux déplacements sur deux répliques n'est pas refusé, il est coupé à la lecture (règle 3).

#### Résultat gardé et abonnement

- À l'ouverture, la façade lit le document une fois et pose un écouteur sur l'événement `afterTransaction` du `Y.Doc`.
- À chaque fin de transaction, locale ou reçue, l'écouteur relit la version et toutes les entrées, reconstruit l'arborescence et la compare à celle qu'il garde (identifiants, titres, ordre). Si elle diffère, il la remplace puis appelle les abonnés, dans l'ordre d'inscription.
- Les opérations ne se servent pas du résultat gardé : chacune relit le document avant de valider et d'écrire.

#### Limites connues

- Un rappel d'abonné qui lève n'est pas rattrapé : l'exception remonte par la transaction en cours (`Y.applyUpdate` compris), et les abonnés inscrits après lui ne sont jamais notifiés de ce changement.
- Si `pages` a déjà été défini sur le `Y.Doc` comme un type partagé d'une autre nature, `ouvrirDocumentEspace` lève l'erreur de Yjs, non typée (constaté par un essai, sans test). Le même cas pour `meta` n'a pas été essayé.
- Le résultat de `lire()` n'est mis à jour qu'à la fin d'une transaction. Dans une transaction ouverte par l'appelant autour de plusieurs opérations, `lire()` rend l'état d'avant, alors que les opérations voient les écritures déjà faites.
- Chaque transaction du `Y.Doc` coûte une relecture de toutes les entrées et une reconstruction de l'arborescence, même sans abonné et même si elle ne touche pas les pages. Chaque opération en ajoute une avant d'écrire. Aucune mesure sur un espace large n'a été faite.
- La longueur d'un rang et le nombre d'entrées ne sont pas bornés à la lecture. `rangEntre` est récursive sur le préfixe commun de deux rangs : insérer entre deux rangs reçus très longs peut épuiser la pile.
- La façade ne retire jamais son écouteur du `Y.Doc` : l'interface n'a pas de fermeture. Ouvrir plusieurs façades sur le même `Y.Doc` empile autant d'écouteurs et de relectures.
- La reconnaissance d'une entrée par `instanceof Y.Map` suppose une seule instance de `yjs` chargée. Avec deux instances, toutes les entrées seraient ignorées, en silence. Un seul manifeste déclare `yjs` aujourd'hui.
- `doc` permet à un appelant d'écrire dans `pages` ou `meta` sans passer par les validations : rien ne l'empêche, la lecture tolérante en limite l'effet.

#### Tests

Six fichiers dans `test/` : `operations`, `abonnement`, `convergence`, `robustesse` et `structure` passent par `src/index.ts` ; `rang.test.ts` importe `src/rang.ts` directement. `aides.ts` porte la graine fixe des tests de propriétés (`fast-check`) et les répliques de test qui s'échangent leurs mises à jour dans un ordre choisi. La convergence n'est exercée qu'entre des `Y.Doc` en mémoire.

### Configuration racine

- `vitest.config.ts` : les projets sont les fichiers `packages/*/vitest.config.ts` et `apps/*/vitest.config.ts`. Seul `document` est ramassé. Un paquet sans fichier de ce nom à sa racine n'est pas testé depuis la racine.
- `package.json` : `pnpm test` (`vitest run --passWithNoTests`), `pnpm lint`, `pnpm format`, `pnpm format:check`, `pnpm contrats`, `pnpm typecheck` (`pnpm -r run typecheck`, soit `tsc --noEmit` dans chaque paquet qui déclare ce script ; un seul aujourd'hui).

### Contrats de dépendances

Sept règles dans `.dependency-cruiser.cjs`, toutes de sévérité `error`, vérifiées par `pnpm contrats` sur `apps` et `packages` :

- `pas-de-cycle` : aucune dépendance cyclique.
- `domaine-pur` : un dossier `domain` ne dépend pas d'un dossier `infrastructure`, `adapters`, `ui` ou `routes`. Aucun dossier `domain` n'existe.
- `paquets-sans-apps` : un fichier de `packages/` ne dépend jamais d'un fichier de `apps/`.
- `apps-isolees` : une application n'importe pas une autre application. Aucune application n'existe.
- `document-sans-reseau-ni-base` : `packages/document` ne dépend ni de `packages/db` ni de `packages/contrats`. Ces deux paquets n'existent pas.
- `document-yjs-seulement` : liste blanche. Depuis `packages/document/src/`, seuls un fichier de `packages/document/src/` et le paquet `yjs` sont importables ; tout autre import est une erreur (autre paquet npm, module intégré de Node, fichier local hors de `src/`, `test/` compris).
- `document-coeur-pur` : liste blanche. Les fichiers `rang.ts`, `arbre.ts` et `erreurs.ts` de `packages/document/src/` n'importent qu'eux-mêmes.

Aucune règle ne fixe le sens entre `format.ts`, `document-espace.ts` et `index.ts` : seul `pas-de-cycle` les contraint entre eux.

Options qui conditionnent ces règles : `doNotFollow` sur `node_modules` (un paquet npm importé apparaît dans le graphe comme une feuille, rien n'y est parcouru) ; `exclude` limité aux dossiers `dist` et `coverage` d'un paquet ou d'une application du dépôt (`^(apps|packages)/[^/]+/(dist|coverage)/`), ce qui laisse `node_modules` visible des règles.

### Barrière ESLint du paquet `document`

`eslint.config.mjs` applique `no-restricted-globals` (erreur, `checkGlobalObject: true`) aux fichiers de `packages/document/src/**`. Onze globales y sont interdites : `window`, `document`, `navigator`, `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `indexedDB`, `localStorage`, `sessionStorage`, `process`. Elle couvre ce que les contrats d'import ne voient pas (DOM, réseau, stockage atteints par une globale). Elle ne vise pas `packages/document/test/`.

### Ce que les contrôles lancent

| Commande                                     | Hook `pre-commit`     | Hook `pre-push`    | `.agents/checks/controles.sh` |
| -------------------------------------------- | --------------------- | ------------------ | ----------------------------- |
| Prettier (`--check`), ESLint                 | oui, fichiers indexés | non                | oui, fichiers modifiés        |
| Vitest (`vitest run --passWithNoTests`)      | non                   | oui, commit poussé | oui                           |
| Contrats de dépendances (dependency-cruiser) | non                   | non                | oui                           |
| `pnpm typecheck` (`tsc`)                     | non                   | non                | non                           |

- Les contrats de dépendances ne sont lancés par aucun hook git : ils ne le sont que par `controles.sh` (donc par le dossier de revue) ou à la main.
- `pnpm typecheck` n'est lancé par aucun hook ni par aucun script du socle : une erreur de type ne bloque ni un commit ni un push. Vitest ne vérifie pas les types. La barrière « ni DOM ni types Node » du `tsconfig.json` ne mord donc que si quelqu'un lance la commande.
- Les tests passent avec zéro fichier de test (`--passWithNoTests`) : un hook vert ne prouve pas qu'un test a tourné.
- `controles.sh` lance aussi le périmètre des agents, la recherche de secrets, la couverture des critères d'acceptation, l'âge des dépendances nouvelles, Semgrep, `pnpm audit` et Trivy. Le hook `commit-msg` contrôle les trailers et le périmètre.

## Flux de synchronisation

Aucun transport dans le dépôt : ni persistance, ni serveur, ni fournisseur de synchronisation. Le seul point de branchement est le membre `doc` de `DocumentEspace` : un `Y.Doc` qu'un appelant remplit par `Y.applyUpdate` et dont il encode les mises à jour. Le paquet n'encode, n'applique ni ne diffuse aucune mise à jour lui-même.

Ce que le paquet fait d'une mise à jour reçue : à la fin de la transaction qui l'applique, la façade relit le document, et notifie ses abonnés si l'arborescence a changé. Deux répliques qui ont reçu les mêmes mises à jour lisent la même arborescence, quel que soit l'ordre de réception : la lecture ne dépend que de l'état du document, et aucune réplique n'écrit pour réparer ce qu'elle lit.

États transitoires, quand les mises à jour arrivent dans le désordre :

- Parent pas encore arrivé : une page reçue avant son parent est lue à la racine, puis sous son parent quand il arrive.
- Entrée incomplète : quand une réplique reçoit d'un émetteur une mise à jour qui remplace un champ avant celle qui la précède, Yjs applique la suppression de l'ancienne valeur et retient la nouvelle. L'entrée a perdu un champ pendant cette fenêtre. La page est alors absente de la lecture, ses filles sont lues à la racine, et une opération locale sur elle est refusée par `page-introuvable`. Tout revient à l'arrivée de la mise à jour manquante.

Question ouverte, non essayée : la durée de cette fenêtre dépend du transport, qui n'existe pas. Si la mise à jour manquante est perdue, l'entrée reste incomplète, et la page invisible, jusqu'à une synchronisation complète de l'état. À établir par les features qui apportent la persistance et le serveur (F-002, F-012).

## Menaces du produit

Le dépôt ne contient encore ni donnée persistée, ni point d'entrée réseau, ni affichage. Le seul code est `packages/document` : il ne pare qu'une part d'un seul abus. Cette section fixe ce qui est à protéger et les abus à couvrir ; elle sera complétée à mesure que le code arrive, chaque parade citant alors le fichier qui la porte.

Actifs : le contenu des espaces (pages, tables), les comptes nominatifs (courriel, nom ; RGPD), les droits d'accès aux espaces.

Acteurs : membre d'un espace ; ancien membre ; titulaire d'un compte sans droit sur l'espace visé ; inconnu sans compte.

| Abus plausible                                              | Parade dans le code à ce jour                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Accès à un document d'un autre espace                       | aucune (pas de serveur)                                                                          |
| Membre retiré qui garde une copie locale                    | aucune (pas de client)                                                                           |
| Mise à jour de synchronisation forgée ou géante             | partielle, détail ci-dessous                                                                     |
| Invitation rejouée                                          | aucune (pas d'invitation)                                                                        |
| Contenu de page piégé (titre, bloc, lien interprété à tort) | aucune (pas d'affichage) : `lire()` rend le titre tel qu'écrit, une chaîne de 200 unités au plus |

Mise à jour forgée ou géante, dans `packages/document/src/` :

- Paré, à la lecture : une entrée mal formée est ignorée sans exception (`format.ts`) ; une version autre que 1 fait refuser lecture et écritures sans faire lever `Y.applyUpdate` (`format.ts`, `document-espace.ts`) ; un parent absent, un cycle de parents et un arbre très profond sont lus sans perte, sans boucle et sans débordement de pile (`arbre.ts`).
- Non paré :
  - la taille d'une mise à jour et le nombre d'entrées : rien ne les borne, et chaque transaction relit tout ;
  - la longueur d'un rang reçu ;
  - un type racine `pages` d'une autre nature, qui fait lever Yjs à l'ouverture (`meta` : non essayé) ;
  - une version forgée, qui rend l'espace illisible pour toutes les répliques qui la reçoivent : le refus est voulu, rien ne dit qui a le droit de l'écrire ;
  - un rappel d'abonné qui lève pendant `Y.applyUpdate`.
- Hors du paquet par construction : qui a le droit d'envoyer une mise à jour. Le paquet lit ce que le `Y.Doc` contient ; l'autorisation revient au serveur (F-012).
