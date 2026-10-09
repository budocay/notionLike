# ARCHITECTURE — notionLike

Dernière mise à jour : 2026-10-09

Ce fichier décrit le code présent dans le dépôt, pas une cible. Les décisions sont dans `docs/decisions/`, les intentions dans `specs/` et `ROADMAP.md`.

## Modules réels et dépendances

État décrit : commit `01cd81e` (F-001 entière, puis les cinq blocs de F-002 : `b88f66e`, commité par le dev, `59a070d`, `7a51272`, `3728cc7` et `01cd81e`).

Le dépôt est un workspace pnpm (`apps/*`, `packages/*`) qui contient l'outillage (TypeScript, ESLint, Prettier, Vitest, dependency-cruiser), un paquet, `packages/document`, et une application, `apps/web` : cinq modules, une page hôte et une entrée, avec leurs tests et six scénarios de bout en bout. Elle se sert par Vite (`pnpm --filter @notionlike/web dev`). Pas de serveur.

### `packages/document` (`@notionlike/document`)

Modèle du document d'un espace : l'arbre de ses pages, porté par un `Y.Doc`. Il ne porte pas le contenu des pages. Paquet source, sans build : le champ `exports` du manifeste désigne `./src/index.ts`. Le manifeste d'`apps/web` le déclare en dépendance (`workspace:*`). Il est importé par son nom, `@notionlike/document`, par sept fichiers d'`apps/web/src/` (la session d'espace et six fichiers d'`interface/`, liste tenue par un test de couture) et par cinq fichiers de `apps/web/test/` ; aucun ne l'atteint par un chemin de fichier. Un test d'`apps/web` fixe ce que ce nom rend (les trois valeurs exportées) et qu'un sous-chemin que le champ `exports` ne déclare pas (`src/arbre.ts`, `src/index.ts`, `package.json`) n'est pas résolu.

- Manifeste : paquet privé, ESM, `sideEffects: false`. Dépendance d'exécution : `yjs` 13.6.33, seule. Dépendances de développement : `fast-check` 4.10.2, `vitest`.
- `tsconfig.json` : étend `tsconfig.base.json`, `lib` limitée à `ES2023` (pas de DOM), `types` vide (pas de types Node), `noEmit` ; il couvre `src`, `test` et `vitest.config.ts`.
- `vitest.config.ts` : projet nommé `document`, environnement `node`, tests dans `test/**/*.test.ts`.

Six modules à plat dans `src/` :

| Module               | Rôle                                                                                                                                                                                                                                      | Importe                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `erreurs.ts`         | `ErreurDocument` (un champ `code`) et l'union `CodeErreurDocument`, sept codes                                                                                                                                                            | rien                                                             |
| `rang.ts`            | rang d'une page parmi ses sœurs, chaîne sur 62 chiffres : `estUnRang`, `rangEntre` (un rang entre deux bornes), `rangsCroissantsEntre` (une suite croissante)                                                                             | rien                                                             |
| `arbre.ts`           | types `IdPage`, `PageLue`, `Arborescence`, `EntreePage`, `ArbreLu` ; `lireArbre` passe des entrées retenues à l'arborescence lue ; `trouverPage`, `estDansLeSousArbre`, `memeArborescence`                                                | rien                                                             |
| `format.ts`          | seul fichier qui connaît les noms des types racines et des champs du `Y.Doc` : écritures, lecture de la version, validation et lecture des entrées                                                                                        | `yjs`, `rang.ts`, `arbre.ts` (types seulement)                   |
| `document-espace.ts` | façade `DocumentEspace`, les deux fonctions qui la créent, validations des opérations, réattribution de rangs, consolidation, résultat gardé de la lecture, abonnés, diffusion sous garde avec signalement sur `console.error`, fermeture | `yjs`, `arbre.ts`, `erreurs.ts`, `format.ts`, `rang.ts`          |
| `index.ts`           | interface publique : réexporte par nom, sans code                                                                                                                                                                                         | `document-espace.ts`, `arbre.ts` (types seulement), `erreurs.ts` |

Sens des dépendances : `index → document-espace → format → rang, arbre`, et `document-espace → arbre, rang, erreurs`. `rang.ts`, `arbre.ts` et `erreurs.ts` forment le cœur pur : ils n'importent rien, pas même l'un l'autre, et ne connaissent pas `yjs`. `yjs` n'est importé que par `format.ts` et `document-espace.ts`. `format.ts` connaît le cœur pur (les types d'`arbre.ts`, la fonction `estUnRang`), jamais l'inverse.

#### Interface publique

`src/index.ts` exporte neuf noms et rien d'autre (ni constante de format, ni fonction de rang, ni fonction de lecture) :

- types : `IdPage`, `PageLue`, `Arborescence`, `Emplacement`, `CodeErreurDocument`, `DocumentEspace` ;
- valeurs : `ErreurDocument`, `creerDocumentEspace`, `ouvrirDocumentEspace`.

`creerDocumentEspace()` crée un `Y.Doc` et y écrit la version de format 1. `ouvrirDocumentEspace(doc)` s'attache à un `Y.Doc` existant et n'écrit rien.

Façade `DocumentEspace`, huit membres :

- `doc` : le `Y.Doc`, seule fuite de Yjs hors du paquet. C'est là que la persistance et la synchronisation se branchent.
- `lire()` : l'arborescence (`racines`) et la corbeille (`corbeille`). Elle rend un résultat gardé par la façade, sans relire le document : la même référence tant qu'aucune transaction n'a changé l'arborescence.
- `abonner(rappel)` : inscrit un rappel sans argument et rend la fonction de désabonnement. Le rappel est appelé une fois par transaction du `Y.Doc` qui change le résultat de `lire()`, locale ou reçue, jamais pour une transaction qui ne le change pas. Sur une façade fermée, `abonner` n'inscrit rien et rend une fonction sans effet.
- `creerPage(titre, ou?)` : crée une page sous un parent, à une position parmi ses sœurs lues ; sans emplacement, à la racine en dernière position. L'identifiant vient de `crypto.randomUUID()`, déclaré localement faute de types DOM ou Node.
- `renommerPage(id, titre)` : écrit le titre. Un titre identique n'écrit rien.
- `deplacerPage(id, ou)` : écrit la place (parent et rang, en une seule valeur). La position se compte parmi les sœurs de destination, page déplacée exclue. Une page déjà à cet emplacement n'écrit rien.
- `mettreALaCorbeille(id)` : pose le drapeau de corbeille ; aucune entrée n'est jamais supprimée.
- `fermer()` : retire du `Y.Doc` l'écouteur de la façade et oublie ses abonnés. Elle ne lève pas, une seconde fermeture est sans effet, et une façade fermée ne se rouvre pas. Détail dans « Fermeture ».

Refus, par `ErreurDocument`, avant toute écriture : une opération refusée ou sans effet n'ouvre aucune transaction. Sept codes, et le premier contrôle qui échoue donne le code, dans cet ordre :

1. `facade-fermee` : façade fermée (les quatre écritures ; `lire()` et `abonner` ne le lèvent jamais) ;
2. `version-non-prise-en-charge` : version du document ;
3. `titre-trop-long` : plus de 200 unités UTF-16 (création, renommage) ;
4. `page-introuvable` puis `page-a-la-corbeille` : page visée ;
5. `page-introuvable` puis `page-a-la-corbeille` : parent de destination ;
6. `deplacement-cyclique` : destination égale à la page ou dans sa descendance lue ;
7. `position-invalide` : pas un entier entre 0 et le nombre de sœurs.

Une façade fermée sur un document de version non prise en charge refuse donc une écriture par `facade-fermee`, et sa lecture par `version-non-prise-en-charge`.

« Introuvable » : aucune entrée retenue ne porte cet identifiant (absente ou ignorée). « À la corbeille » : par son drapeau ou par celui d'une ancêtre.

#### Format et version

Dans le `Y.Doc` : type racine `meta`, clé `version` ; type racine `pages`, une `Y.Map` par page (clé : l'identifiant) avec les champs `titre`, `place` (objet `{ parent, rang }`) et `corbeille`.

Version (`estDeVersionPriseEnCharge`, `format.ts`) : une clé `version` absente vaut la version 1 ; le nombre `1` est la version 1 ; toute autre valeur présente est une version non prise en charge. Dans ce cas :

- `lire()` et les quatre écritures d'une façade ouverte lèvent `version-non-prise-en-charge`, sans rien écrire ;
- `ouvrirDocumentEspace`, `abonner` et `fermer` ne lèvent pas, et `Y.applyUpdate` non plus quand la version arrive par une mise à jour ;
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

#### Résultat gardé, abonnement et fermeture

- À l'ouverture, la façade lit le document une fois et pose un écouteur sur l'événement `afterTransaction` du `Y.Doc`.
- À chaque fin de transaction, locale ou reçue, l'écouteur relit la version et toutes les entrées, reconstruit l'arborescence et la compare à celle qu'il garde (identifiants, titres, ordre). Si elle diffère, il la remplace puis appelle les abonnés, dans l'ordre d'inscription, chacun sous garde. Seuls sont appelés les abonnés inscrits au début de la diffusion et encore inscrits au moment de leur tour : un abonné désabonné par un rappel précédent n'est pas appelé, et un abonné inscrit pendant la diffusion ne l'est qu'au changement suivant.
- Garde : un rappel qui lève n'interrompt pas la diffusion, et son exception ne remonte ni par l'opération locale ni par `Y.applyUpdate`. Elle est passée à `console.error` (une phrase fixe, puis l'exception), une fois par rappel fautif et par changement, dans l'ordre des rappels. C'est le seul canal : aucun récepteur ne se passe à la création. `console` est déclarée localement dans `document-espace.ts`, comme `crypto`.
- Les opérations ne se servent pas du résultat gardé : chacune relit le document avant de valider et d'écrire.
- Fermeture : `fermer()` marque la façade fermée, vide ses abonnés et retire son écouteur du `Y.Doc`. Ensuite, une transaction du `Y.Doc` ne provoque ni relecture ni notification par cette façade ; `lire()` rend ce qu'elle rendait à la fermeture, sans relire (la même référence, ou le refus `version-non-prise-en-charge`), même si le document change depuis ; les fonctions de désabonnement déjà rendues sont sans effet ; les quatre écritures sont refusées par `facade-fermee`, sans transaction.
- Fermeture depuis un rappel, pendant une diffusion : les rappels restants de cette façade ne sont pas appelés, et rien ne lève. Le résultat gardé est celui de la transaction en cours, lu avant la diffusion.
- Plusieurs façades sur un même `Y.Doc` : Yjs appelle les écouteurs présents au début de l'émission. Une façade fermée par le rappel d'une autre façade ouverte avant elle voit donc son écouteur appelé encore une fois pour cette transaction ; il ne relit ni ne notifie. Fermée par le rappel d'une façade ouverte après elle, elle a déjà relu et notifié cette transaction, et plus aucune ensuite.

#### Limites connues

- L'exception d'un rappel d'abonné n'est visible que sur la console d'erreur : elle ne s'arrête plus sur la pile de l'appelant, et rien d'autre ne la remet. Si `console.error` lève elle-même, cette exception-là n'est pas rattrapée (non essayé).
- La garde de `abonner` après fermeture n'est prouvée par aucun test : la retirer laisse les 256 tests verts (constaté par le producteur du bloc 1). Rien n'en est observable par l'interface, puisqu'une façade fermée ne diffuse plus ; sans elle, le rappel resterait seulement retenu par la façade.
- Si `pages` a déjà été défini sur le `Y.Doc` comme un type partagé d'une autre nature, `ouvrirDocumentEspace` lève l'erreur de Yjs, non typée (constaté par un essai, sans test). Le même cas pour `meta` n'a pas été essayé.
- Le résultat de `lire()` n'est mis à jour qu'à la fin d'une transaction. Dans une transaction ouverte par l'appelant autour de plusieurs opérations, `lire()` rend l'état d'avant, alors que les opérations voient les écritures déjà faites.
- Chaque transaction du `Y.Doc` coûte une relecture de toutes les entrées et une reconstruction de l'arborescence, même sans abonné et même si elle ne touche pas les pages. Chaque opération en ajoute une avant d'écrire. Aucune mesure sur un espace large n'a été faite.
- La longueur d'un rang et le nombre d'entrées ne sont pas bornés à la lecture. `rangEntre` est récursive sur le préfixe commun de deux rangs : insérer entre deux rangs reçus très longs peut épuiser la pile.
- Une façade que son appelant ne ferme pas garde son écouteur sur le `Y.Doc` : rien ne la ferme à sa place. Ouvrir plusieurs façades sur le même `Y.Doc` sans les fermer empile autant d'écouteurs et de relectures.
- La reconnaissance d'une entrée par `instanceof Y.Map` suppose une seule instance de `yjs` chargée. Avec deux instances, toutes les entrées seraient ignorées, en silence. Deux manifestes déclarent `yjs` (`packages/document`, `apps/web`), à la même version exacte 13.6.33, et le verrou n'en résout qu'une. Rien à la racine (catalogue, `overrides`) n'impose cette unicité ; un test d'`apps/web` la constate (`test/structure.test.ts` : liste fermée des deux manifestes qui déclarent `yjs`, même version, une seule résolue par le verrou et égale à la version déclarée, et le document de `creerDocumentEspace` est une instance du `Y.Doc` importé par `apps/web`), et un autre que le document de la session l'est aussi (`test/coutures.test.ts`). Un troisième manifeste qui déclarerait `yjs` fait échouer ce test : c'est le signal retenu par l'ADR-0003 pour rouvrir la question.
- `doc` permet à un appelant d'écrire dans `pages` ou `meta` sans passer par les validations : rien ne l'empêche, la lecture tolérante en limite l'effet.

#### Tests

Sept fichiers de test dans `test/` (256 tests), et un fichier d'aide. `operations`, `abonnement`, `convergence`, `robustesse` et `fermeture` passent par `src/index.ts` ; `rang.test.ts` importe `src/rang.ts` directement ; `structure.test.ts` n'importe aucun fichier de `src/` : il lit le manifeste du paquet (`yjs` seule dépendance d'exécution) et vérifie que `window` et `document` sont absents de l'environnement de test. `aides.ts` porte la graine fixe des tests de propriétés (`fast-check`) et les répliques de test qui s'échangent leurs mises à jour dans un ordre choisi. La convergence n'est exercée qu'entre des `Y.Doc` en mémoire. `fermeture.test.ts` n'utilise pas `aides.ts` ; il espionne `console.error` et compte les écouteurs `afterTransaction` par le champ interne `_observers` du `Y.Doc`, qui n'est pas une interface publique de Yjs.

### `apps/web` (`@notionlike/web`)

Cinq modules sous `src/` (quinze fichiers), l'entrée `src/main.tsx`, la feuille de style `src/styles.css` et la page hôte `index.html`, avec leurs tests (`test/`, Vitest sous jsdom) et leurs scénarios de bout en bout (`e2e/`, Playwright dans Chromium).

- Manifeste : paquet privé, ESM. Dépendances d'exécution, en versions exactes : `@notionlike/document` (`workspace:*`), `react` et `react-dom` 19.3.0, `yjs` 13.6.33, `y-indexeddb` 9.0.12. Dépendances de développement : Vite, `@vitejs/plugin-react`, Vitest, `jsdom`, `fake-indexeddb`, Testing Library, `@playwright/test`, types React. Scripts : `dev`, `build`, `test`, `test:e2e`, `lint`, `format`, `typecheck`.
- `tsconfig.json` : étend `tsconfig.base.json`, `lib` `ES2023` avec `DOM`, types `vite/client`, JSX `react-jsx`, `noEmit`, `erasableSyntaxOnly` ; il vise `src`, `test`, `e2e` et les trois fichiers de configuration.
- `vite.config.ts` : greffon React, serveur sur `127.0.0.1:5173`, port strict.
- `vitest.config.ts` : projet nommé `web`, environnement `jsdom`, tests dans `test/**/*.test.{ts,tsx}`, fichier de préparation `./test/preparation.ts`, espions et globales simulées rendus après chaque test (`restoreMocks`, `unstubGlobals`).
- `playwright.config.ts` : tests dans `./e2e`, Chromium seul, serveur Vite lancé sur le port 5174.
- `index.html` : langue `fr`, un élément `#racine`, un seul script (`/src/main.tsx`) ; aucune adresse externe, aucune politique de sécurité de contenu.

| Fichier de `src/`                | Rôle                                                                                                                                                                                                                                | Importe                                                                                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `identifiants/uuid-canonique.ts` | `estUuidCanonique(valeur: string): boolean`, seule fonction du module : 36 caractères, forme `8-4-4-4-12` en hexadécimal minuscule ; la longueur est comparée avant l'expression régulière                                          | rien                                                                                                                                                                                                   |
| `persistance/nom-de-base.ts`     | type `DesignationDocument`, classe `ErreurPersistance`, et `nomDeBase`, seule fonction qui assemble le nom d'une base de document ; le fichier ne fait que calculer                                                                 | `identifiants/uuid-canonique.ts`                                                                                                                                                                       |
| `persistance/indexeddb.ts`       | types `EtatPersistance` et `Persistance`, `ouvrirPersistance` ; pour le module seulement, `ouvrirSousEcheance` et le type `Ouverture` ; suivi de l'état, échéance, sonde, `y-indexeddb`, garde des échecs, validation des écritures | `y-indexeddb`, `yjs` (types seulement), `nom-de-base.ts`                                                                                                                                               |
| `persistance/espace-local.ts`    | `ouvrirEspaceLocal` : lit ou inscrit l'identifiant de l'espace local dans la base de l'appareil, puis fait relire la base de cet espace                                                                                             | `yjs` (types seulement), `indexeddb.ts`, `nom-de-base.ts`                                                                                                                                              |
| `persistance/index.ts`           | interface du module : réexporte par nom, sans code                                                                                                                                                                                  | `espace-local.ts`, `indexeddb.ts`, `nom-de-base.ts`                                                                                                                                                    |
| `espace/session-espace.ts`       | `demarrerSessionEspace`, types `SessionEspace` et `EtatSession` : garde de contexte sécurisé, `Y.Doc`, persistance de l'espace local, façade du document, état lu par React, diffusion sous garde, fermeture                        | `@notionlike/document`, `yjs`, `persistance/index.ts`                                                                                                                                                  |
| `navigation/route.ts`            | type `Route`, `lireRoute` (fragment vers route) et `fragmentDe` (route vers fragment) ; le fichier ne fait que calculer                                                                                                             | `identifiants/uuid-canonique.ts`                                                                                                                                                                       |
| `navigation/fragment.ts`         | seul fichier qui touche l'adresse : `lireFragment` (`location.hash`), `abonnerAuFragment` (`hashchange`), `allerA` (écrit `location.hash`)                                                                                          | `route.ts`                                                                                                                                                                                             |
| `interface/messages.ts`          | textes français de l'interface, noms accessibles, `messageErreur` (une phrase par code d'erreur du document), `titreAffiche`, `titreOnglet`, constante `LONGUEUR_MAX_TITRE`                                                         | `@notionlike/document` (types seulement)                                                                                                                                                               |
| `interface/pages.ts`             | parcours itératifs de l'arborescence lue : `trouverPage`, `ancetresDe`, `estDansLaDescendance`, `rangeesVisibles`                                                                                                                   | `@notionlike/document` (types seulement)                                                                                                                                                               |
| `interface/Application.tsx`      | composant `Application`, seul point d'entrée de l'interface : choix de l'écran selon la phase, coquille, sélection déduite, état d'écran de la barre latérale, les six fonctions d'action, traduction des refus                     | `@notionlike/document`, `react`, `espace/session-espace.ts` (types seulement), `navigation/`, `BarreLaterale.tsx`, `messages.ts`, `pages.ts`, `RangeePage.tsx` (types seulement), `ZonePrincipale.tsx` |
| `interface/BarreLaterale.tsx`    | `nav` nommée « Pages », bouton « Nouvelle page », message du dernier refus, liste plate des rangées visibles                                                                                                                        | `@notionlike/document` et `react` (types seulement), `messages.ts`, `pages.ts`, `RangeePage.tsx`                                                                                                       |
| `interface/RangeePage.tsx`       | une rangée : commande de repli, lien de la page ou saisie du titre, trois boutons d'action ; types `EcranBarre` et `ActionsBarre` ; aucune opération du document                                                                    | `@notionlike/document` (types seulement), `react`, `navigation/route.ts`, `messages.ts`, `SaisieTitre.tsx`                                                                                             |
| `interface/SaisieTitre.tsx`      | champ « Titre de la page » : Entrée et sortie du champ valident, Échap annule, une saisie close ne valide plus                                                                                                                      | `react`, `messages.ts`                                                                                                                                                                                 |
| `interface/ZonePrincipale.tsx`   | type `Selection` ; titre de la page, « Page introuvable », ou accueil avec l'une de deux invitations                                                                                                                                | `@notionlike/document` et `react` (types seulement), `messages.ts`                                                                                                                                     |
| `main.tsx`                       | entrée : cherche `#racine` (lève une erreur explicite s'il manque), démarre la session, monte `<Application session={…} />` sous `StrictMode` ; n'exporte rien                                                                      | `styles.css`, `react`, `react-dom/client`, `espace/session-espace.ts`, `interface/Application.tsx`                                                                                                     |

Sens des dépendances : `main → interface, espace` ; `interface → espace (types), navigation` ; `espace → persistance/index` ; `navigation/fragment → navigation/route → identifiants` ; `persistance/index → espace-local → indexeddb → nom-de-base → identifiants`, avec `index → indexeddb, nom-de-base` et `espace-local → nom-de-base`. Aucun sens inverse.

- `y-indexeddb` n'est importée que par `persistance/indexeddb.ts`. Hors de `persistance/`, `yjs` n'est importée que par la session.
- Hors de `persistance/`, seule la session importe ce module, par son `index.ts`.
- `identifiants/` n'importe rien et n'a que deux importateurs : `persistance/nom-de-base.ts` et `navigation/route.ts`. `interface/` ne l'importe pas : elle reçoit des routes déjà contrôlées.
- React n'est importé que par `interface/` et `main.tsx` ; ni `espace/`, ni `navigation/`, ni `persistance/` ne le connaissent.
- La session est le seul fichier de `src/` qui appelle une fonction d'ouverture du paquet du document et le seul qui nomme le type `DocumentEspace` ; `main.tsx` est le seul qui importe `demarrerSessionEspace`. Les deux sont tenus par des tests de couture.
- `creerDocumentEspace` et `deplacerPage` n'ont aucun appelant dans `apps/web/src/`.

#### `identifiants/`

`estUuidCanonique` est la seule définition de la forme d'un identifiant dans `apps/web` : celle que produit `crypto.randomUUID`. La version de l'UUID n'est pas contrôlée. Une chaîne d'une autre longueur que 36 n'atteint aucune expression régulière (un test compte les analyses lancées : aucune). Ses deux appelants dans `src/` sont `persistance/nom-de-base.ts` et `navigation/route.ts`.

#### Interface de `persistance/`

`persistance/index.ts` exporte six noms et rien d'autre, aucun type de `y-indexeddb` :

- valeurs : `ouvrirPersistance`, `ouvrirEspaceLocal`, `ErreurPersistance` ;
- types : `DesignationDocument`, `EtatPersistance`, `Persistance`.

Ne sortent pas du module : `nomDeBase`, `ouvrirSousEcheance`, le type `Ouverture`. Ne sortent pas de leur fichier : le délai (`DELAI_RELECTURE_MS`, `indexeddb.ts`) et l'union des codes d'erreur (`CodeErreurPersistance`, `nom-de-base.ts`).

- `DesignationDocument` : `{ type: "espace", idEspace }`, `{ type: "page", idEspace, idPage }` ou `{ type: "table", idEspace, idTable }`. L'identifiant d'espace est obligatoire pour une page ou une table.
- `ouvrirPersistance(doc, designation)` : calcule le nom de la base, puis rend une `Persistance` qui relit cette base dans le `Y.Doc` et y enregistre ses mises à jour. Elle lève `ErreurPersistance`, avant toute autre chose, si un identifiant est refusé.
- `ouvrirEspaceLocal(doc, idCandidat)` : contrôle le candidat (même refus, levé de même), puis rend une `Persistance` pour l'espace local de l'appareil. L'identifiant retenu, le candidat ou celui déjà inscrit sur l'appareil, n'est exposé par aucun membre : les tests le lisent dans le nom de la base énumérée par `indexedDB.databases()`. Le candidat est fourni par l'appelant ; le module ne tire aucun identifiant.
- `Persistance`, trois membres : `etat()`, `abonner(rappel)` qui rend la fonction de désabonnement, `fermer()`.
- `EtatPersistance` : `relecture` au retour de l'appel ; `active` quand la relecture a abouti ; `coupee` sur tout échec ou à l'échéance ; `fermee` après `fermer()`. `coupee` et `fermee` sont définitifs : une persistance coupée que l'on ferme reste `coupee`. Les abonnés sont appelés une fois à chaque changement d'état, sans argument.
- `ErreurPersistance` : un champ `code`, dont la seule valeur est `identifiant-invalide`. Son message est une phrase fixe, qui ne cite pas l'identifiant refusé.

Nom des bases (`nom-de-base.ts`) : `notionlike:espace:<idEspace>`, `notionlike:page:<idEspace>:<idPage>`, `notionlike:table:<idEspace>:<idTable>`. Chaque identifiant reçu passe par `estUuidCanonique` avant d'entrer dans le nom ; un seul refusé lève `identifiant-invalide`, sans base ouverte ni créée. La base de l'appareil, `notionlike:appareil`, n'est pas une base de document : son nom est une constante d'`espace-local.ts`. Le déroulé d'une ouverture est dans « Enregistrement et relecture sur l'appareil ».

#### Limites connues de la persistance

- La session n'appelle que `ouvrirEspaceLocal`. `ouvrirPersistance`, et avec elle les désignations `page` et `table`, n'ont aucun appelant dans `src/` : elles ne sont atteintes que par les tests.
- Les abonnés d'une `Persistance` sont appelés sans garde : un rappel qui lève prive les abonnés suivants de ce changement, et son exception s'échappe dans le gestionnaire d'IndexedDB ou le minuteur qui a changé l'état, ou par `fermer()`. Aucun test ne l'exerce. Le seul abonné de production est la session : son rappel ne lève pas pour l'un de ses propres abonnés (ils sont appelés sous garde), mais il lèverait si `ouvrirDocumentEspace` ou `lire()` levait autre chose que le refus de version (type racine `pages` d'une autre nature relu sur l'appareil, voir les limites de `packages/document`) ; non essayé.
- Une ouverture qui réussit pour la sonde puis échoue pour la bibliothèque : le module passe à `coupee`, mais la bibliothèque peut alors émettre un rejet de promesse que personne ne traite. Aucun test ne couvre ce cas (limite admise par F-002-AC16).
- Après l'échéance, la bibliothèque déjà construite peut finir la lecture qu'elle avait lancée ; rien de ce qu'elle lit n'est appliqué au document ni écrit (tests de F-002-AC24).
- Une valeur illisible conservée à la place de l'identifiant de l'espace local, ou une base de l'appareil sans son magasin, n'est jamais réparée ni remplacée : chaque ouverture finit `coupee`, document en mémoire, tant que les données du site ne sont pas effacées. Rien dans le code ne les efface.
- Le module touche deux champs préfixés de `y-indexeddb` (`_db`, `_storeUpdate`) et remplace, le temps d'un appel synchrone, la méthode `transaction` de la connexion de la bibliothèque. La version de la bibliothèque est exacte au manifeste ; les tests de validation et d'échecs cassent si l'un de ces champs change de nom ou de rôle.
- Un navigateur sans `IDBTransaction.commit()` garde la validation automatique de la bibliothèque : le rechargement lancé juste après une écriture n'y est pas garanti. Dans Chromium, il est essayé par le scénario de bout en bout de F-002-AC2, hors des hooks.
- Les bases ne sont ni chiffrées ni effacées par le code, et rien ne borne leur taille.

#### `espace/` : session d'espace

`demarrerSessionEspace()`, sans paramètre, est le seul point de démarrage ; `main.tsx` est son seul appelant dans `src/`. Elle rend une `SessionEspace`, quatre membres :

- `lireEtat()` : l'état courant, un objet remplacé seulement quand quelque chose change ; la même référence sinon.
- `abonner(rappel)` : inscrit un rappel sans argument et rend la fonction de désabonnement.
- `doc` : le `Y.Doc` de l'espace, ou `undefined` hors contexte sécurisé.
- `fermer()`.

`EtatSession`, quatre phases : `contexte-non-securise`, `chargement`, `version-non-prise-en-charge`, trois constantes sans autre champ, et `pret`, qui porte `arborescence` (la référence rendue par `lire()` de la façade), `enregistre` (vrai si la persistance est `active`) et `operations` (`creerPage`, `renommerPage`, `mettreALaCorbeille` de la façade, le même objet tant que la façade vit). L'état `pret` ne porte ni identifiant d'espace, ni `Y.Doc`, ni `deplacerPage`, ni `abonner` ou `fermer` de la façade ; le type des opérations n'est pas exporté.

Démarrage, dans l'ordre :

1. Si `crypto` est absente ou si `crypto.randomUUID` n'est pas une fonction, la session rendue est figée dans `contexte-non-securise` : aucun `Y.Doc`, aucun identifiant, aucune base ; `abonner` n'inscrit rien, `fermer` est sans effet. `isSecureContext` n'est pas consultée (un test le fixe : fonction présente et `isSecureContext` faux, l'application démarre).
2. Sinon elle construit `new Y.Doc()`, tire un identifiant candidat par `crypto.randomUUID()`, appelle `ouvrirEspaceLocal(doc, candidat)` et s'abonne à la persistance rendue. L'état est `chargement`.
3. Tant que la persistance est en `relecture`, aucune façade n'existe : aucune opération n'est atteignable.
4. Au premier état de la persistance autre que `relecture` (`active` ou `coupee`), elle appelle `ouvrirDocumentEspace(doc)`, s'abonne une fois à la façade et lit. Sans `indexedDB`, la persistance est `coupee` dès son retour : la session est alors `pret`, non enregistrée, dès le retour de `demarrerSessionEspace()`.

Recalcul, à chaque changement d'état de la persistance et à chaque notification de la façade : la session relit `lire()` et l'état de la persistance, et ne publie un nouvel état `pret` que si la référence de l'arborescence ou `enregistre` a changé.

Diffusion : une seule fonction (`publier`) remplace l'état et prévient les abonnés, que le changement vienne du document ou de la persistance. Elle suit les règles de la façade : seuls sont appelés les abonnés inscrits au début de la diffusion et encore inscrits à leur tour ; chacun est appelé sous garde ; une exception est passée à `console.error` (une phrase fixe en français, puis l'exception), une fois par abonné fautif et par changement, et ne remonte ni par une opération, ni par `Y.applyUpdate`, ni par un rappel d'IndexedDB.

Version non prise en charge : si `lire()` lève `version-non-prise-en-charge`, à l'ouverture comme après une mise à jour reçue, la session, dans cet ordre, se désabonne de la persistance, ferme la façade, ferme la persistance, puis publie la phase `version-non-prise-en-charge`. Après une mise à jour reçue, elle est alors dans le rappel que la façade est en train d'appeler et la ferme pendant sa diffusion. La phase est définitive : la session n'écoute plus rien. Le `Y.Doc` reste en mémoire ; une mise à jour qu'il recevrait ensuite n'est ni lue ni enregistrée.

Fermeture : `fermer()` oublie les abonnés, se désabonne de la persistance, ferme la façade si elle existe et ferme la persistance. Elle ne publie rien : `lireEtat()` rend le dernier état. Une opération gardée d'un état `pret` antérieur est alors refusée par `facade-fermee`, sans écriture (test). Une seconde fermeture est sans effet. Fermée pendant le chargement, la session n'ouvre aucune façade quand la relecture finit. Aucun code de production n'appelle `fermer()` : l'entrée ne le fait pas, la session y vit autant que l'onglet ; seuls les tests ferment les sessions qu'ils démarrent. En production, la seule fermeture exercée est celle de l'entrée dans `version-non-prise-en-charge`.

`doc` n'a aucun lecteur dans `src/` : aucun composant ne le reçoit, et la session ne l'expose pas par son état. Il est livré parce que quatre critères ne se prouvent que sur le document de la session, qu'elle construit sans paramètre : F-002-AC9 (une mise à jour appliquée par `Y.applyUpdate`, puis la page affichée : `coquille.test.tsx`, par les aides `docDe` et `recevoir` d'`aides-coquille.tsx`), F-002-AC29 et F-002-AC30 (mise à jour reçue pendant qu'un abonné lève, version non prise en charge reçue : `session-fermeture.test.tsx`), F-002-AC31 (compte des écouteurs de ce document avant et après la fermeture : `aides-facade.ts`, `coutures.test.ts`, `coquille.test.tsx`). F-013 sera son premier lecteur de production.

#### `navigation/` : routes et fragment

Trois formes de route (`route.ts`) :

- `page`, avec `idPage` : le fragment commence par `#/page/` et le reste est un UUID canonique ;
- `page-introuvable` : le fragment commence par `#/page/` et le reste est refusé par `estUuidCanonique`. La route rendue est une constante du module, sans champ : la chaîne refusée n'y survit pas ;
- `accueil` : tout autre fragment, vide compris.

`lireRoute` prend le reste du fragment tel quel, sans le décoder : une séquence encodée qui se décoderait en UUID est refusée (test). `fragmentDe` écrit `#/page/<idPage>` sans encodage, et `#/` pour toute autre route. `fragment.ts` lit `window.location.hash`, écoute `hashchange` et écrit `window.location.hash` ; rien d'autre dans `src/` ne lit ni n'écrit l'adresse, et `pushState` comme `replaceState` sont interdits par ESLint.

#### `interface/` : composants et état d'écran

- `Application` lit la session par `useSyncExternalStore(session.abonner, session.lireEtat)` et choisit l'écran selon la phase : écran bloquant (`role="alert"`, un titre et une explication, aucune commande) pour `contexte-non-securise` et `version-non-prise-en-charge` ; « Chargement… » (`role="status"`, aucune commande) ; la coquille pour `pret`.
- La coquille lit le fragment par un second `useSyncExternalStore(abonnerAuFragment, lireFragment)` et le passe à `lireRoute` à chaque rendu. La sélection n'est pas un état : elle se déduit de la route et de `arborescence.racines` (accueil, page trouvée, ou introuvable). Une page à la corbeille n'est pas dans `racines` : son adresse donne « Page introuvable ». Une page sélectionnée qui disparaît de la lecture donne « Page introuvable » sans changer l'adresse, et revient si elle revient.
- État d'écran, par `useState`, dans `Application.tsx` : l'ensemble des pages repliées (vide au montage : tout est déplié), la saisie de titre ouverte, le message du dernier refus. Il vit en mémoire, par onglet, et n'entre jamais dans le document.
- Six fonctions d'action (`ActionsBarre`), définies dans `Application.tsx` et passées aux rangées : créer une page, ouvrir la saisie, valider le titre, annuler la saisie, mettre à la corbeille, basculer le repli. Chaque appel d'opération du document passe par `tenter`, qui ne rattrape qu'`ErreurDocument` et rend son code ; `messageErreur` le traduit. Toute autre exception n'est pas rattrapée.
  - Créer : `creerPage("", { parent })`, puis dépli du parent, ouverture de la saisie et `allerA` la page créée.
  - Valider : `titre-trop-long` laisse le champ ouvert, texte conservé, message sous le champ ; tout autre refus ferme le champ et affiche son message dans la barre.
  - Mettre à la corbeille : si la page jetée est la page sélectionnée ou l'une de ses ancêtres, `allerA` l'accueil après le succès ; le focus va au bouton « Nouvelle page ».
- Dépli des ancêtres : un effet de la coquille, déclenché quand l'identifiant désigné par la route change, retire de l'ensemble des pages repliées les ancêtres de cette page. Il ne se déclenche pas quand l'arbre change : replier un ancêtre de la page sélectionnée reste possible (test).
- Barre latérale : une liste plate, un `li` par page visible, la profondeur dans `aria-level` et dans une variable CSS de retrait. `rangeesVisibles` et les autres parcours de `pages.ts` sont itératifs : un arbre de 2 000 niveaux s'affiche, se sélectionne et se replie sous jsdom (test).
- Rangée : commande de repli à `aria-expanded` si la page a des sous-pages ; lien vers `fragmentDe` de la page, `aria-current="page"` sur la page sélectionnée ; trois boutons, « Renommer », « Sous-page », « Corbeille », dont le nom accessible cite le titre. La sélection par le lien passe par le navigateur (`href`), pas par une fonction d'action.
- `messages.ts` : `messageErreur` porte une phrase par code d'erreur du document, les sept, dans une table exhaustive par le type ; celle de `facade-fermee` dit que l'espace a été fermé dans cet onglet et invite à recharger. Un titre vide s'affiche « Sans titre » (`titreAffiche`). `LONGUEUR_MAX_TITRE` (200) recopie la limite de `@notionlike/document`, qui ne l'exporte pas ; un test de couture tient les deux ensemble (200 accepté, 201 refusé par la façade).
- Titre de l'onglet : un effet écrit `document.title`, « <titre> · notionLike » pour une page sélectionnée, « notionLike » sinon.

#### Limites connues de la session et de l'interface

- La session n'a pas de drapeau de fermeture. `abonner` appelée après `fermer()` inscrit encore le rappel, qui reste retenu par la session et n'est jamais appelé : plus rien ne publie. Aucune garde n'a été ajoutée, faute de comportement observable par l'interface ; aucun test ne porte sur ce cas.
- `console.error` qui lèverait elle-même pendant le signalement d'un abonné fautif n'est pas rattrapée (non essayé), comme dans la façade.
- Le dépli des ancêtres est fait par un effet, donc dans un rendu postérieur à celui de la sélection. Entre les deux, un rendu existe où la zone principale affiche la page sélectionnée alors que sa rangée est encore cachée sous un ancêtre replié. Ce qu'un navigateur en peint n'a pas été mesuré : aucun scénario de bout en bout ne navigue vers une page cachée sous un ancêtre replié. Les tests attendent ensemble le titre, le lien courant et le titre de l'onglet après toute navigation.
- Le dépli n'est pas refait quand l'arbre change : une page désignée par l'adresse qui arrive plus tard sous une page repliée, ou qui y est déplacée par une mise à jour reçue, est sélectionnée sans que sa rangée soit visible. Aucun test ne porte sur ce cas.
- Aucune frontière d'erreur React : une exception levée pendant un rendu démonte l'application, sans écran d'explication.
- Le message de `facade-fermee` n'est atteint que par un test, qui ferme la session sous une coquille affichée : aucun code de production ne ferme une session `pret`, et l'écran de version ne propose aucune action.
- `SANS_TITRE` est exportée par `messages.ts` sans lecteur hors de ce fichier. `titreAffiche` ne remplace que la chaîne vide : un titre fait d'espaces ou de caractères sans dessin donne un lien sans texte visible.
- L'état replié ou déplié et la saisie en cours sont perdus au rechargement.

#### Tests d'`apps/web`

Treize fichiers de test dans `test/` (439 tests), cinq fichiers d'aide et le fichier de préparation.

- `uuid-canonique.test.ts` importe `src/identifiants/uuid-canonique.ts` directement, `route.test.ts` importe `src/navigation/route.ts` directement. Les autres tests atteignent la persistance par `src/persistance/index.ts` seulement, `nomDeBase` comprise (par les deux fonctions d'ouverture et l'énumération des bases).
- `persistance-ouverture.test.ts` : nom des bases, isolation entre deux espaces, table des refus pour chacun des trois identifiants, états, relecture à l'identique d'un document d'espace, espace local (seconde ouverture, deux ouvertures lancées ensemble).
- `persistance-echecs.test.ts` : `indexedDB` absent, ouverture refusée, identifiant relu illisible, base de l'appareil sans magasin, lecture et écriture en échec, transaction annulée, connexion fermée, document de version non prise en charge (la persistance, fermée par le test, n'a ajouté que l'enregistrement vide), échéance sous horloge simulée.
- `persistance-validation.test.ts` : une écriture par mise à jour, validée par `commit()` ; navigateur sans `commit()` ; `commit()` qui lève ; format stocké ; compactage.
- `route.test.ts` : fragments d'accueil, fragments de page, table des formes refusées (celle d'`aides-identifiants.ts`), fragment non décodé, route refusée constante, écriture puis relecture d'un identifiant.
- `coquille.test.tsx` : premier lancement, chargement sans action, création à la racine, seconde session sur le même espace, mise à jour reçue affichée sans rechargement, titre fait de balisage, absence d'adresse externe dans la page hôte et les styles, entrée montée dans `#racine` puis sa session fermée (un écouteur, puis zéro).
- `coquille-echecs.test.tsx` : sans `indexedDB`, ouvertures en échec, connexion fermée après l'ouverture, échéance de 10 secondes, réponse arrivée après l'échéance, version non prise en charge à l'ouverture et en cours de session, page hôte sans `#racine`, `crypto.randomUUID` ou `crypto` absentes, `isSecureContext` faux.
- `barre-laterale.test.tsx` et `barre-laterale-erreurs.test.tsx` : création d'une sous-page, saisie du titre (Entrée, sortie du champ, Échap), corbeille et focus, repli, clavier seul, commandes natives et nommées, arbre de 2 000 niveaux ; titre de 201 caractères, page disparue pendant la saisie ou avant la mise à la corbeille.
- `navigation.test.tsx` : sélection, adresse, titre de l'onglet, retour à l'accueil après une mise à la corbeille, rechargement avec une adresse de page, fragment modifié et boutons précédent et suivant, repli d'un ancêtre de la page sélectionnée, page introuvable, formes refusées à l'écran, identifiant forgé dans un document reçu.
- `session-fermeture.test.tsx` : abonné de la session qui lève (changement du document, changement de la persistance), règles de diffusion sous garde, cinq montages sous `StrictMode`, fermeture de la session et de la persistance, action sur une session fermée, version non prise en charge reçue pendant la diffusion, session fermée pendant le chargement, fermeture hors contexte sécurisé.
- `structure.test.ts` : une seule version de `yjs` déclarée et résolue, instance unique ; exports de `persistance/index.ts` ; dépendances d'exécution du manifeste ; exports de `@notionlike/document` vus par son nom ; liste fermée de six fichiers de configuration, aucun ne portant d'alias ni de chemin vers le paquet ; sous-chemins non résolus.
- `coutures.test.ts` : énumère, par leurs déclarations d'import, tous les fichiers du workspace qui font entrer `creerDocumentEspace` ou `ouvrirDocumentEspace`, et exige que chacun soit inscrit dans l'une de cinq sortes (définition, production, aides suivies, import entier sans ouverture, liste fermée de cinq fichiers de test de F-001). La sorte « production » ne compte que `src/espace/session-espace.ts`. Un import dynamique dont l'argument est calculé compte comme ouvrant. Il tient aussi, par lecture du texte des fichiers :
  - `main.tsx` seul importe `demarrerSessionEspace` dans `src/`, `aides-facade.ts` seul dans `test/` et `e2e/` ; `aides-facade.ts` seul importe `src/main.tsx` ;
  - la session seule nomme `DocumentEspace` dans `src/` ; hors de `persistance/`, elle seule importe `yjs` ; aucun fichier de `src/` n'appelle un accesseur de type partagé, `transact` ni `deplacerPage` ;
  - les fichiers de `src/` qui lisent un code d'erreur sont trois pour le document (`session-espace.ts`, `Application.tsx`, `messages.ts`) et un pour la persistance ; `messages.ts` traite les sept codes, `facade-fermee` compris ;
  - les sept fichiers de `src/` qui importent `@notionlike/document`, chacun rattaché à un fichier de test qui l'atteint par ses imports (F-002-AC20) ; la session y est rattachée à `session-fermeture.test.tsx` ;
  - le classement de chaque occurrence des deux noms d'ouverture dans `packages/document/test/fermeture.test.ts` (import, appel dans son aide, longueur mesurée, titre de test).

  Il prouve enfin par exécution que la fermeture se lit au nombre d'écouteurs, que fermer une persistance ne ferme pas la façade ouverte sur le même `Y.Doc`, et que le document de la session est un `Y.Doc` de l'instance d'`apps/web`.

- `aides-coutures.ts` lit comme du texte (`import.meta.glob` en `?raw`) tous les fichiers `.ts` et `.tsx` de `{apps,packages}/*/{src,test,e2e}`, fichiers internes de `packages/document` compris. Les contrats de dépendances ne voient pas cette lecture ; aucun module n'y est évalué. `coutures.test.ts` est son seul appelant, ce qu'aucun contrôle ne tient.
- `aides-facade.ts` est le seul fichier de test d'`apps/web` qui ouvre une façade de `@notionlike/document` (`ouvrirFacade`, `creerFacade`) ou démarre une session (`demarrerSession`, `importerEntree`). Il relève le nombre d'écouteurs `afterTransaction` du `Y.Doc` avant chaque ouverture, par le champ interne `_observers` ; pour une session, le départ est le compte d'un `Y.Doc` neuf. `importerEntree` importe `src/main.tsx` par un chemin littéral et relève la session par un espion posé sur `demarrerSessionEspace`, retiré dans un `finally` ; l'entrée n'étant évaluée qu'une fois par fichier de test, un second appel lève.
- `preparation.ts` donne à chaque test un `IDBFactory` neuf de `fake-indexeddb` et un fragment d'adresse vide ; en fin de chaque test, il rend l'horloge réelle, ferme les façades et les sessions suivies et exige qu'aucun `Y.Doc` suivi ne garde un écouteur de plus qu'à son départ.
- `aides-coquille.tsx` : rendu d'une session sous `StrictMode` par `Application`, comme l'entrée ; `fermerLOnglet` (démontage puis fermeture de la session) et `recharger` (fermeture, puis une nouvelle session rendue, adresse et appareil simulé conservés) ; mises à jour venues d'une autre réplique, appliquées au `doc` de la session ; `atteindreActionDeRangee` et `activerActionDeRangee`, seul chemin des tests vers une action de rangée, par rôle et nom accessible.
- `aides-identifiants.ts` porte la table des formes refusées, commune au test de la fonction de forme, à ceux du nom des bases, à celui des routes et à celui de la navigation ; `aides-persistance.ts`, les lectures de bases et les pannes simulées d'IndexedDB.
- `packages/document/test/fermeture.test.ts` est inscrit parmi les aides suivies : la couture y exige deux appels d'ouverture et aucun export des deux fonctions, et classe chaque occurrence des deux noms. Elle ne peut pas exécuter ce fichier : la preuve par le compte d'écouteurs y tourne dans le projet `document`.
- Un test dépend de la place des commandes dans l'ordre de tabulation : « F-002-AC10 sélectionner une page au clavier seul » (`navigation.test.tsx`) compte deux tabulations du haut de la page au premier lien. Le test du clavier seul de `barre-laterale.test.tsx` tabule jusqu'à la commande cherchée, sans compter, mais nomme des boutons de rangée et un sens de parcours. Les trois autres appels de tabulation ne servent qu'à sortir d'un champ.
- Sous Vitest, IndexedDB est celle de `fake-indexeddb` et le DOM celui de jsdom : `hashchange`, les boutons précédent et suivant et le focus sont ceux de jsdom.

#### Bout en bout d'`apps/web`

Deux fichiers dans `e2e/` : `arborescence.spec.ts`, six scénarios, et `aides.ts`. Chaque scénario part d'un contexte de navigateur neuf, donc d'un IndexedDB vide, contre le serveur de développement de Vite que Playwright lance sur le port 5174. Ni l'un ni l'autre n'importe un fichier de `src/` ni `@notionlike/document` : ils n'agissent que par la page.

| Scénario               | Ce qu'il constate dans Chromium                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-002-AC23             | créer, renommer, ajouter une sous-page, recharger : même arborescence (niveau, titre, adresse) ; mettre à la corbeille, recharger : ni la page ni sa sous-page                                                                                                                                                                                                                                                  |
| F-002-AC4              | deux onglets d'un même contexte ouverts ensemble au premier lancement, une page créée dans chacun ; après rechargement, les deux affichent les deux pages, dans le même ordre                                                                                                                                                                                                                                   |
| F-002-AC19             | aucune requête ni WebSocket vers une autre origine que celle du serveur ; réseau coupé, toutes les actions de la barre latérale aboutissent (créer, renommer, sous-page, replier, déplier, sélectionner, corbeille)                                                                                                                                                                                             |
| F-002-AC21, F-002-AC19 | console sans erreur, sans avertissement, sans exception non interceptée et sans le message de double import de Yjs, sur un parcours qui comprend un rechargement, un retour à l'accueil par la corbeille et une page introuvable                                                                                                                                                                                |
| F-002-AC2              | rechargement lancé aussitôt après la validation d'un titre, sans attendre la fin de l'écriture : la page est relue, la page jetée ne l'est pas ; l'origine porte deux bases, `notionlike:appareil` et `notionlike:espace:<UUID>`                                                                                                                                                                                |
| F-002-AC27, F-002-AC13 | l'adresse d'une page porte un UUID canonique ; six fragments forgés (majuscules, suffixe, segment de plus, mot, balisage, chaîne de 9 000 caractères) et un UUID absent donnent « Page introuvable », par navigation et après rechargement, sans sélection, sans rien du fragment dans le corps de la page ni dans le titre de l'onglet ; la barre latérale reste utilisable et aucune base de plus n'est créée |

- `aides.ts` : commandes retrouvées par rôle et nom accessible ; `atteindreActionDeRangee` et `activerActionDeRangee`, seul chemin des scénarios vers une action de rangée, et `basculerRepli` pour les commandes de repli ; `ecrituresAbouties`, qui attend la fin des écritures par une transaction de lecture sur le magasin `updates` de la base d'espace, sans délai fixe ; `ecouterLeReseau` (requêtes du contexte, WebSockets de la page) ; `ecouterLaConsole` (erreurs, avertissements, exceptions).
- Aucun hook ni `controles.sh` ne lance ces scénarios (dette D-003) : `pnpm --filter @notionlike/web test:e2e`, à la main. Relancés une fois sur cet état pour ce fichier : `6 passed`.
- Ce que le bout en bout ne couvre pas : un autre navigateur que Chromium ; un navigateur sans `IDBTransaction.commit()` ; l'application construite (`vite build`), le serveur étant celui de développement ; un contexte non sécurisé réel, une version non prise en charge, les pannes d'IndexedDB et l'échéance, tenus sous jsdom seulement ; deux onglets qui se voient sans rechargement, que rien dans le code ne fait.

### Configuration racine

- `vitest.config.ts` : les projets sont les fichiers `packages/*/vitest.config.ts` et `apps/*/vitest.config.ts`. Le motif en désigne deux : `document` (7 fichiers, 256 tests) et `web` (13 fichiers, 439 tests). `pnpm test` depuis la racine, relancé sur cet état : 20 fichiers, 695 tests, verts. Un paquet sans fichier de ce nom à sa racine n'est pas testé depuis la racine.
- `package.json` : `pnpm test` (`vitest run --passWithNoTests`), `pnpm lint`, `pnpm format`, `pnpm format:check`, `pnpm contrats`, `pnpm typecheck` (`pnpm -r run typecheck`, soit `tsc --noEmit` dans chaque paquet qui déclare ce script ; deux aujourd'hui, `document` et `web`).

### Contrats de dépendances

Seize règles dans `.dependency-cruiser.cjs`, toutes de sévérité `error`, vérifiées par `pnpm contrats` sur `apps` et `packages`. Les sept premières datent de F-001 :

- `pas-de-cycle` : aucune dépendance cyclique.
- `domaine-pur` : un dossier `domain` ne dépend pas d'un dossier `infrastructure`, `adapters`, `ui` ou `routes`. Aucun dossier `domain` n'existe.
- `paquets-sans-apps` : un fichier de `packages/` ne dépend jamais d'un fichier de `apps/`.
- `apps-isolees` : une application n'importe pas une autre application. Une seule existe.
- `document-sans-reseau-ni-base` : `packages/document` ne dépend ni de `packages/db` ni de `packages/contrats`. Ces deux paquets n'existent pas.
- `document-yjs-seulement` : liste blanche. Depuis `packages/document/src/`, seuls un fichier de `packages/document/src/` et le paquet `yjs` sont importables ; tout autre import est une erreur (autre paquet npm, module intégré de Node, fichier local hors de `src/`, `test/` compris).
- `document-coeur-pur` : liste blanche. Les fichiers `rang.ts`, `arbre.ts` et `erreurs.ts` de `packages/document/src/` n'importent qu'eux-mêmes.

Aucune règle ne fixe le sens entre `format.ts`, `document-espace.ts` et `index.ts` : seul `pas-de-cycle` les contraint entre eux.

Les neuf suivantes, `web-*`, visent `apps/web`. Toutes ont maintenant des fichiers à contrôler : `web-espace-liste-blanche` part de `session-espace.ts`, `web-navigation-liste-blanche` de `route.ts` et de `fragment.ts`, `web-formes-pures` de `route.ts` comme de `nom-de-base.ts`, et `web-src-liste-blanche` des sept fichiers d'`interface/` et de `main.tsx`. `pnpm contrats` sur cet état : aucune violation, 74 modules, 193 dépendances (72 et 190 avant les deux fichiers d'`e2e/`).

- `web-y-indexeddb-confinee` : dans `apps/web`, tests compris, seul `src/persistance/indexeddb.ts` importe `y-indexeddb`.
- `web-document-par-ses-exports` : `apps/web`, tests compris, n'atteint `packages/document` que par `src/index.ts`.
- `web-persistance-par-son-interface` : hors de `src/persistance/`, seul son `index.ts` est importable.
- `web-identifiants-pur` : liste blanche. `src/identifiants/` n'importe que lui-même.
- `web-persistance-liste-blanche` : `src/persistance/` n'importe que lui-même, `src/identifiants/`, `yjs` et `y-indexeddb`.
- `web-espace-liste-blanche` : `src/espace/` n'importe que lui-même, `src/persistance/index.ts`, `packages/document/src/index.ts` et `yjs`.
- `web-navigation-liste-blanche` : `src/navigation/` n'importe que lui-même et `src/identifiants/`.
- `web-formes-pures` : `src/navigation/route.ts` et `src/persistance/nom-de-base.ts` n'importent que `src/identifiants/`.
- `web-src-liste-blanche` : le reste de `src/` n'importe que `src/` (hors `persistance/` et `identifiants/`), `packages/document/src/index.ts`, `react` et `react-dom`. Elle ne fixe pas de sens entre `interface/`, `espace/`, `navigation/` et `main.tsx` : un import de l'entrée par un composant ne serait refusé que par `pas-de-cycle`.

Options qui conditionnent ces règles : `doNotFollow` sur `node_modules` (un paquet npm importé apparaît dans le graphe comme une feuille, rien n'y est parcouru) ; `exclude` limité aux dossiers `dist` et `coverage` d'un paquet ou d'une application du dépôt (`^(apps|packages)/[^/]+/(dist|coverage)/`), ce qui laisse `node_modules` visible des règles.

### Barrière ESLint du paquet `document`

`eslint.config.mjs` applique `no-restricted-globals` (erreur, `checkGlobalObject: true`) aux fichiers de `packages/document/src/**`. Onze globales y sont interdites : `window`, `document`, `navigator`, `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `indexedDB`, `localStorage`, `sessionStorage`, `process`. Elle couvre ce que les contrats d'import ne voient pas (DOM, réseau, stockage atteints par une globale). Elle ne vise pas `packages/document/test/`. `console` n'est pas dans cette liste, et la règle générale `no-console` admet `console.error` : le signalement d'un rappel fautif ne demande aucune exemption.

### Barrières ESLint d'`apps/web`

Cinq blocs d'`eslint.config.mjs` visent des fichiers d'`apps/web/src/`, et chacun a maintenant des fichiers. Ils ne visent pas `apps/web/test/`. Dans la configuration à plat, un bloc postérieur qui redéfinit une règle la remplace pour ses fichiers : c'est ainsi que les quatre derniers ouvrent ou durcissent le premier.

- `apps/web/src/**` : `no-restricted-globals` interdit `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `localStorage`, `sessionStorage` et `indexedDB` ; `no-restricted-properties` interdit `Math.random`, `getRandomValues`, `randomUUID`, `pushState`, `replaceState`, `sendBeacon`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `transact` et cinq accesseurs de types partagés Yjs (`getMap`, `getArray`, `getText`, `getXmlFragment`, `getXmlElement`) ; `no-restricted-syntax` interdit l'attribut `dangerouslySetInnerHTML` et toute chaîne ou gabarit contenant `notionlike:`.
- `apps/web/src/persistance/**` : même liste de globales sans `indexedDB`, qui y est donc permise.
- `persistance/nom-de-base.ts` et `persistance/espace-local.ts` : `no-restricted-syntax` réduit à `dangerouslySetInnerHTML`, ce qui y permet la chaîne `notionlike:`.
- `apps/web/src/espace/**` : même liste de propriétés sans `randomUUID`, qui y est donc permise. `session-espace.ts` est le seul fichier d'`apps/web/src/` qui l'appelle.
- `identifiants/**`, `navigation/route.ts` et `persistance/nom-de-base.ts` : la liste de globales du premier bloc, plus `window`, `self`, `globalThis`, `document`, `location`, `history`, `navigator` et `crypto`.

### Ce que les contrôles lancent

| Commande                                     | Hook `pre-commit`     | Hook `pre-push`    | `.agents/checks/controles.sh` |
| -------------------------------------------- | --------------------- | ------------------ | ----------------------------- |
| Prettier (`--check`), ESLint                 | oui, fichiers indexés | non                | oui, fichiers modifiés        |
| Vitest (`vitest run --passWithNoTests`)      | non                   | oui, commit poussé | oui                           |
| Contrats de dépendances (dependency-cruiser) | non                   | non                | oui                           |
| `pnpm typecheck` (`tsc`)                     | non                   | non                | non                           |
| Bout en bout (`playwright test`)             | non                   | non                | non                           |

- Les contrats de dépendances ne sont lancés par aucun hook git : ils ne le sont que par `controles.sh` (donc par le dossier de revue) ou à la main.
- `pnpm typecheck` n'est lancé par aucun hook ni par aucun script du socle : une erreur de type ne bloque ni un commit ni un push. Vitest ne vérifie pas les types. La barrière « ni DOM ni types Node » du `tsconfig.json` ne mord donc que si quelqu'un lance la commande.
- Les six scénarios de bout en bout et la construction (`vite build`) ne sont lancés par aucun hook ni par aucun script du socle (dette D-003) : sont donc hors de toute barrière automatique le rechargement réel, les deux onglets, l'absence de requête vers une autre origine et la console du navigateur.
- Les tests passent avec zéro fichier de test (`--passWithNoTests`) : un hook vert ne prouve pas qu'un test a tourné.
- `controles.sh` lance aussi le périmètre des agents, la recherche de secrets, la couverture des critères d'acceptation, l'âge des dépendances nouvelles, Semgrep, `pnpm audit` et Trivy. La recherche de secrets tourne aussi dans les hooks `pre-commit` et `pre-push`, le périmètre dans `pre-push`. Le hook `commit-msg` contrôle les trailers et le périmètre.

## Flux de synchronisation

Aucun transport dans le dépôt : ni serveur, ni fournisseur de synchronisation. Le seul flux hors de la mémoire est l'enregistrement d'un `Y.Doc` sur l'appareil, par `apps/web/src/persistance/` ; la session d'espace le relie à la façade, sur le même `Y.Doc`. Deux onglets d'un même navigateur ne s'échangent rien en direct : chacun relit la base à son ouverture. Le point de branchement d'une synchronisation à venir est le membre `doc` de `SessionEspace` (le `Y.Doc` de la façade) : un `Y.Doc` qu'un appelant remplit par `Y.applyUpdate` et dont il encode les mises à jour. Aucun code de production ne le fait ; `packages/document` n'encode, n'applique ni ne diffuse aucune mise à jour lui-même.

### Enregistrement et relecture sur l'appareil

Une base IndexedDB par document, nommée par `nom-de-base.ts`, et une base de l'appareil, `notionlike:appareil` (version 1, magasin `reglages`, clé `espace-local`), qui garde l'identifiant de l'espace local. Le format d'une base de document est celui de `y-indexeddb` 9.0.12 : magasins `updates` et `custom`, mises à jour Yjs au format V1.

Ouverture (`ouvrirSousEcheance`, `indexeddb.ts`), commune aux deux fonctions d'ouverture, une fois contrôlés les identifiants reçus :

1. `indexedDB` absent (`typeof`) : `coupee` dès le retour de l'appel ; rien n'est construit, aucune échéance n'est armée.
2. Sinon une échéance de 10 secondes est armée. Elle couvre tout ce qui précède `active` et passe l'état à `coupee`. Tout changement d'état la désarme.
3. Espace local seulement (`espace-local.ts`) : la base de l'appareil est ouverte, son magasin créé à la première ouverture ; une seule transaction en écriture lit la clé et, si elle est absente, y inscrit le candidat. La valeur retenue est le candidat si la clé était absente, sinon la valeur lue. Si cette valeur n'est pas une chaîne, ou si `nomDeBase` la refuse, l'état passe à `coupee` et aucune base d'espace n'est ouverte ni créée. Seule l'absence de la clé vaut premier lancement : une valeur nulle est illisible, et elle est laissée telle quelle. Ouverture refusée, magasin absent ou transaction annulée : `coupee`. Une réponse de cette base arrivée après l'échéance n'inscrit rien et ne crée rien.
4. Sonde (`sonder`) : le module ouvre lui-même la base du document, sous ses propres gestionnaires. Si elle n'existe pas, il annule la transaction de création, ce qui la laisse absente, et tient l'ouverture pour possible. Exception ou erreur de la demande : `coupee`.
5. Si l'état est encore `relecture`, `new IndexeddbPersistence(nom, doc)` : la bibliothèque ouvre ou crée la base, applique au `Y.Doc` ce qui y est stocké, puis émet `synced`, que le module traduit en `active`. À chaque ouverture, elle ajoute à la base un enregistrement vide de deux octets (constaté par le test de F-002-AC17).

Enregistrement, une fois obtenue la connexion de la bibliothèque (son champ `_db`) :

- La bibliothèque écrit chaque mise à jour du `Y.Doc` dans le magasin `updates`. Le module remplace sa fonction d'écriture (champ `_storeUpdate`) par une enveloppe : la transaction que la bibliothèque ouvre pendant cet appel synchrone, et elle seule, est validée par `commit()` aussitôt la demande posée. Les transactions de la relecture et du compactage gardent la validation automatique. Sans `commit()` dans le navigateur, rien ne change ; un `commit()` qui lève est absorbé.
- Une mise à jour appliquée par la relecture n'est pas réécrite. Au seuil de la bibliothèque, le journal est compacté en un enregistrement.
- Garde (`garder`) : sur la connexion, un écouteur `error` en phase de capture arrête la propagation et passe à `coupee` ; des écouteurs `abort` et `close` y passent aussi, comme le rejet de la promesse de connexion.

Arrêt : passer à `coupee` ou à `fermee` appelle `destroy()` de la bibliothèque, si elle a été construite : elle se désabonne du `Y.Doc` et n'applique ni n'écrit plus rien. Le rejet éventuel de `destroy()` est absorbé. Le module ne détruit jamais le `Y.Doc`, qui reste utilisable en mémoire. Une persistance fermée ou coupée pendant la sonde ne construit pas la bibliothèque.

Deux ouvertures de l'espace local lancées ensemble retiennent le même identifiant, parce qu'IndexedDB sérialise les transactions en écriture d'un même magasin ; chacune relit ensuite les pages de l'autre. Le test Vitest tourne sur `fake-indexeddb`, dans un seul processus ; le scénario de bout en bout de F-002-AC4 l'essaie entre deux onglets de Chromium.

### D'un changement du document à l'écran

Chemin d'une mise à jour reçue, dans `apps/web`. Aucun code de production n'en applique : les tests appellent `Y.applyUpdate(session.doc, …)`. Une opération locale et la relecture de la base suivent le même chemin à partir de l'étape 2.

1. `Y.applyUpdate` applique la mise à jour au `Y.Doc` de la session, dans une transaction.
2. À la fin de la transaction, la façade relit le document. Si l'arborescence a changé, elle remplace son résultat gardé et appelle son seul abonné, la session.
3. La session relit `lire()`. Si la référence de l'arborescence a changé, elle remplace son état `pret` et appelle ses abonnés, sous garde. Si `lire()` refuse la version, elle ferme façade et persistance et publie `version-non-prise-en-charge`.
4. Le seul abonné de production est le rendu : `useSyncExternalStore` relit `lireEtat()`, voit une autre référence et relance le rendu d'`Application`.
5. La coquille redéduit la sélection de la route et de la nouvelle arborescence, puis rend la barre latérale et la zone principale. L'adresse ne change pas.

En parallèle, la persistance, branchée sur le même `Y.Doc`, écrit la mise à jour dans la base de l'espace si elle est `active` ; l'écran n'attend pas cette écriture, et aucun écran ne la confirme. Un changement d'état de la persistance (fin de la relecture, coupure) entre à l'étape 3 par l'abonnement de la session à la persistance : une coupure après le chargement publie un état `pret` où `enregistre` est faux, et l'avertissement s'affiche.

Une transaction qui ne change pas l'arborescence lue (entrée ignorée, titre identique) s'arrête à l'étape 2 : ni la session ni React ne sont prévenus.

Le fragment de l'adresse suit un second chemin, sans le document : `hashchange`, `lireFragment`, `useSyncExternalStore`, `lireRoute`, sélection redéduite. Les deux chemins ne se rejoignent qu'au rendu.

### Mise à jour reçue par `packages/document`

Ce que le paquet fait d'une mise à jour reçue : à la fin de la transaction qui l'applique, la façade relit le document, et notifie ses abonnés si l'arborescence a changé. Deux répliques qui ont reçu les mêmes mises à jour lisent la même arborescence, quel que soit l'ordre de réception : la lecture ne dépend que de l'état du document, et aucune réplique n'écrit pour réparer ce qu'elle lit.

États transitoires, quand les mises à jour arrivent dans le désordre :

- Parent pas encore arrivé : une page reçue avant son parent est lue à la racine, puis sous son parent quand il arrive.
- Entrée incomplète : quand une réplique reçoit d'un émetteur une mise à jour qui remplace un champ avant celle qui la précède, Yjs applique la suppression de l'ancienne valeur et retient la nouvelle. L'entrée a perdu un champ pendant cette fenêtre. La page est alors absente de la lecture, ses filles sont lues à la racine, et une opération locale sur elle est refusée par `page-introuvable`. Tout revient à l'arrivée de la mise à jour manquante.

Question ouverte, non essayée : la durée de cette fenêtre dépend du transport, qui n'existe pas. Si la mise à jour manquante est perdue, l'entrée reste incomplète, et la page invisible, jusqu'à une synchronisation complète de l'état. La persistance locale n'y change rien : elle enregistre et relit les mises à jour que le `Y.Doc` émet, dans l'ordre. À l'écran, pendant cette fenêtre, la page disparaît de la barre latérale, ses filles montent à la racine, et son adresse donne « Page introuvable » sans être modifiée. À établir par la feature qui apporte le serveur (F-012).

## Menaces du produit

Le dépôt ne contient aucun point d'entrée réseau : ni serveur, ni compte, ni invitation, ni synchronisation. Ce qui entre dans l'application aujourd'hui : le fragment de l'adresse, ce que les bases IndexedDB de l'appareil ont conservé, ce que l'utilisateur saisit, et, par le membre `doc` de la session que seuls les tests utilisent, une mise à jour Yjs. Cette section fixe ce qui est à protéger et les abus à couvrir ; elle est complétée à mesure que le code arrive, chaque parade citant le fichier qui la porte.

Actifs : le contenu des espaces (pages, tables), en mémoire et dans les bases IndexedDB de l'appareil ; les comptes nominatifs (courriel, nom ; RGPD) ; les droits d'accès aux espaces.

Acteurs : membre d'un espace ; ancien membre ; titulaire d'un compte sans droit sur l'espace visé ; inconnu sans compte, dont celui qui fait suivre un lien forgé vers l'application. Sur l'appareil : tout script de la même origine et toute personne qui a la main sur le navigateur lisent et écrivent les bases ; le code ne s'en protège pas, il se protège de ce qu'il y relit.

| Abus plausible                                                            | Parade dans le code à ce jour                                                                                           |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Accès à un document d'un autre espace                                     | pas de serveur ; sur l'appareil, une base par espace et par document, détail ci-dessous                                 |
| Membre retiré qui garde une copie locale                                  | aucune : les bases de l'appareil ne sont ni chiffrées ni effacées, et aucun code ne retire une base                     |
| Mise à jour de synchronisation forgée ou géante                           | partielle, détail ci-dessous                                                                                            |
| Invitation rejouée                                                        | aucune (pas d'invitation)                                                                                               |
| Contenu de page piégé (titre, bloc, lien interprété à tort)               | paré pour le titre, seul contenu affiché, détail ci-dessous (`interface/`, ESLint)                                      |
| Fragment d'adresse forgé ou géant                                         | paré, détail ci-dessous (`navigation/route.ts`, `uuid-canonique.ts`)                                                    |
| Identifiant de page forgé dans un document reçu                           | partielle : affiché, jamais sélectionné par l'adresse, détail ci-dessous                                                |
| Ouverture hors contexte sécurisé                                          | paré : écran d'explication, rien n'est créé (`espace/session-espace.ts`)                                                |
| Exception d'un abonné pendant une mise à jour reçue                       | paré : diffusion sous garde, à la façade et à la session, détail ci-dessous                                             |
| Identifiant forgé dans un nom de base                                     | paré, détail ci-dessous (`nom-de-base.ts`, `uuid-canonique.ts`)                                                         |
| Identifiant d'espace illisible relu sur l'appareil, valeur nulle comprise | paré : aucune base d'espace ouverte ni créée, persistance `coupee` (`espace-local.ts`) ; la valeur n'est jamais réparée |
| Base de l'appareil sans son magasin                                       | paré : persistance `coupee`, sans exception ni attente de l'échéance (`espace-local.ts`) ; la base n'est jamais réparée |

Fragment de l'adresse, dans `apps/web/src/navigation/` :

- Paré, fragment forgé : ce qui suit `#/page/` n'est pas décodé et ne sert à rien avant d'avoir passé `estUuidCanonique`. Refusé, il donne une route constante qui ne porte pas la chaîne : elle n'est ni cherchée dans l'arborescence, ni passée à une opération ou à la persistance, ni affichée, ni écrite dans le titre de l'onglet (`route.ts` ; tests de la table des formes refusées, par la fonction et à l'écran ; scénario de bout en bout).
- Paré, fragment géant : la longueur est comparée à 36 avant toute expression régulière. Une chaîne de 9 000 caractères donne « Page introuvable » dans Chromium (bout en bout).
- Paré, identifiant de forme valide mais absent, ou d'une page à la corbeille : « Page introuvable », aucune sélection, aucune base créée, la barre latérale reste utilisable.
- Tenu par l'outillage : `route.ts` n'importe que la fonction de forme (contrat `web-formes-pures`) et ne touche à aucune globale d'entrée ou de sortie (ESLint) ; `fragment.ts` est le seul fichier qui lit ou écrit l'adresse, ce qu'aucun contrôle ne tient hors de l'interdiction de `pushState` et de `replaceState`.
- Non paré :
  - un lien forgé vers l'identifiant d'une page existante la sélectionne : c'est l'usage voulu, et l'adresse ne porte rien d'autre ;
  - l'identifiant de l'espace n'est pas dans l'adresse : quand plusieurs espaces existeront (F-014), rien ici ne dit à quel espace une adresse appartient.

Identifiant de page forgé dans un document reçu, dans `apps/web/src/interface/` :

- `packages/document` ne contrôle pas la forme des identifiants de page : une entrée dont la clé n'est pas un UUID canonique est lue comme une page. La barre latérale l'affiche, et son lien porte `#/page/<clé>` sans encodage.
- Paré : ce lien commence toujours par `#/page/`, préfixe fixe écrit par `fragmentDe` ; il ne peut donc désigner ni une autre origine ni un autre schéma d'adresse. Activé, il écrit le fragment, que `lireRoute` refuse : « Page introuvable », la page forgée n'est jamais sélectionnée et ni son titre ni son identifiant n'apparaissent dans la zone principale (test de F-002-AC27, identifiant en majuscules venu d'une mise à jour forgée).
- Non paré :
  - la page forgée reste affichée et ses trois actions de rangée passent sa clé aux opérations du document, qui l'acceptent comme toute clé présente ;
  - la longueur d'une clé n'est bornée nulle part : elle entre telle quelle dans un attribut `href` et dans une clé de liste React ;
  - une page dont l'identifiant n'est pas canonique ne pourra pas avoir de base de contenu (`nomDeBase` le refusera) ; ce que l'écran en dira est à la charge de F-003.

Titre piégé, dans `apps/web/src/interface/` :

- Paré : un titre n'atteint l'écran que par un enfant texte de JSX, par un attribut `aria-label`, par la valeur d'un champ de saisie ou par `document.title` ; aucun de ces chemins n'interprète de balisage (tests de F-002-AC18, dans la barre latérale, la zone principale et l'onglet). `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML` et `insertAdjacentHTML` sont interdits par ESLint dans `apps/web/src/`. La lecture ne retient qu'un titre de 200 unités au plus.
- Paré : aucun message d'erreur du code n'est affiché tel quel ; un refus du document est traduit par code, sans le code ni l'identifiant (`messages.ts`, tests de F-002-AC15).
- Non paré :
  - les caractères de contrôle, de sens d'écriture et sans dessin d'un titre sont affichés tels quels, dans la barre latérale, le titre de l'onglet et les noms accessibles ;
  - un titre reçu égal à « Sans titre » ne se distingue pas d'un titre vide ;
  - la page hôte ne déclare aucune politique de sécurité de contenu, et aucun serveur du dépôt n'envoie d'en-tête : l'interdiction du HTML brut ne tient que par ESLint.

Ouverture hors contexte sécurisé, dans `apps/web/src/espace/` :

- Paré : sans `crypto.randomUUID`, la session ne construit ni `Y.Doc`, ni identifiant, ni base, et l'écran dit de servir l'application en https ou à une adresse locale ; aucune action n'est proposée (tests de F-002-AC26). Aucun identifiant n'est tiré d'une autre source : `Math.random` et `getRandomValues` sont interdits par ESLint dans `apps/web/src/`.
- Non paré : le code teste la présence de la fonction, pas le contexte. Un navigateur qui l'exposerait hors contexte sécurisé, ou un script qui la définirait avant l'entrée, ferait démarrer l'application.

Exception d'un abonné :

- Paré : un abonné de la session qui lève ne prive pas les suivants, et son exception ne remonte ni par une opération, ni par `Y.applyUpdate`, ni par un rappel d'IndexedDB ; l'application reste utilisable (`session-espace.ts`, tests de F-002-AC29 pour les deux origines). La façade applique la même garde à ses propres abonnés (`document-espace.ts`).
- Non paré : l'exception n'est visible que sur la console d'erreur ; les abonnés d'une `Persistance` ne sont pas sous garde ; une exception levée pendant un rendu de React démonte l'application, faute de frontière d'erreur.

Nom des bases de l'appareil, dans `apps/web/src/persistance/` :

- Paré, identifiant forgé : un identifiant d'espace, de page ou de table n'entre dans un nom de base que s'il est un UUID canonique (`estUuidCanonique`, appliquée à chacun par `nomDeBase`). Une chaîne qui porte `:`, `/`, `%`, du balisage, une espace, des majuscules, ou qui est géante, est refusée par `identifiant-invalide` avant toute ouverture : aucune base n'est ouverte ni créée. La longueur est comparée avant l'expression régulière. Le message du refus ne cite pas la chaîne.
- Paré, accès à la base d'un autre espace par un identifiant de page : le préfixe `notionlike:page:<idEspace>:` est de longueur fixe et sans autre `:`, et l'identifiant de page ne peut pas en porter. Le même identifiant de page ouvert pour deux espaces donne deux bases, et celle du premier n'est pas touchée (test).
- Paré, valeur relue : ce que la base de l'appareil a conservé repasse par `nomDeBase` avant de nommer une base. Tout ce qui n'est pas une chaîne (objet, nombre, valeur nulle) et toute chaîne refusée coupent la persistance.
- Tenu par l'outillage : `nomDeBase` est la seule fonction qui assemble un nom de base de document (ESLint interdit tout littéral `notionlike:` dans `apps/web/src` hors de `nom-de-base.ts` et d'`espace-local.ts`), et `nom-de-base.ts` ne touche à rien d'autre (contrat `web-formes-pures`, globales interdites).
- Non paré :
  - le seul appelant de production est la session, qui ne passe qu'un identifiant qu'elle vient de tirer ; ce que l'adresse ou une arborescence reçue passeront comme identifiant de page (F-003) n'est pas dans le dépôt ;
  - la forme des identifiants de page inscrits dans un document d'espace n'est pas contrôlée par `packages/document` : un identifiant reçu qui n'est pas un UUID canonique ne pourra pas avoir de base ;
  - le contenu d'une base de document relu par `y-indexeddb` est appliqué au `Y.Doc` sans contrôle de taille ni d'origine ; ce qu'il devient ensuite est décrit ci-dessous ;
  - une valeur illisible ou un magasin manquant laissent l'appareil sans enregistrement à chaque lancement : l'avertissement de la coquille le dit, sans en donner la cause ni proposer de réparation.

Mise à jour forgée ou géante, dans `packages/document/src/` :

- Paré, à la diffusion : un rappel d'abonné qui lève pendant `Y.applyUpdate` ne fait pas lever l'application de la mise à jour et ne prive pas les autres abonnés (`document-espace.ts`).
- Paré, à la lecture : une entrée mal formée est ignorée sans exception (`format.ts`) ; une version autre que 1 fait refuser lecture et écritures sans faire lever `Y.applyUpdate` (`format.ts`, `document-espace.ts`) ; un parent absent, un cycle de parents et un arbre très profond sont lus sans perte, sans boucle et sans débordement de pile (`arbre.ts`).
- Non paré :
  - la taille d'une mise à jour et le nombre d'entrées : rien ne les borne, et chaque transaction relit tout ;
  - la longueur d'un rang reçu ;
  - un type racine `pages` d'une autre nature, qui fait lever Yjs à l'ouverture (`meta` : non essayé) ;
  - une version forgée, qui rend l'espace illisible pour toutes les répliques qui la reçoivent : le refus est voulu, rien ne dit qui a le droit de l'écrire.
- À l'écran (`apps/web`) : une version forgée reçue ferme la façade et la persistance et affiche l'écran « Mise à jour nécessaire », sans action, jusqu'au rechargement ; plus rien n'est écrit sur l'appareil ensuite (tests de F-002-AC17 et AC30). Un arbre reçu de 2 000 niveaux s'affiche sans débordement de pile sous jsdom ; le nombre de rangées rendues n'est pas borné, et aucune mesure sur un espace large n'a été faite.
- Hors du paquet par construction : qui a le droit d'envoyer une mise à jour. Le paquet lit ce que le `Y.Doc` contient ; l'autorisation revient au serveur (F-012).
