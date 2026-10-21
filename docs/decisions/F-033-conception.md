# F-033 — Conception (mode rapide) : coloration syntaxique et indentation du bloc code

Date : 2026-10-21
Spec : `specs/F-033.md`, validée (structurel), lue sur la branche `F-033` à `9e69259` (`main` à `1f6d388`, vite 8.3.4, plus la veille et la spec de F-033). Veille : `MEMORY/VEILLE.md`, les quatre sections du 2026-10-21 (« lowlight et highlight.js », « Coloration du bloc code — durée sur 10 000 caractères », « @tiptap/extension-code-block-lowlight 3.31.4 », « Tiptap 3.31.4 — Tab, Maj+Tab, Entrée »). Base : ADR-0018 et `docs/decisions/F-005-conception.md`.

Note courte, écrite avant le code. `ARCHITECTURE.md` décrit `main` et n'est pas touché ici : il sera aligné sur le diff livré (bloc 8).

**Aucune ADR.** Rien de ce que F-033 décide n'est difficile à défaire : aucun format ne change (H2, ADR-0018 inchangée), la coloration ne vit que dans la vue, et la bibliothèque n'est importée que par un fichier (`edition/coloration.ts`, règle `coloration-confinee`) : en changer, ou la retirer, ne touche que ce fichier et deux lignes du manifeste. La convention Échap puis Tab ne s'enregistre nulle part. La conséquence prévue par l'ADR-0018 (« les identifiants devront coïncider avec ceux de la bibliothèque de coloration retenue ») est tenue sans conversion : les dix identifiants de `LANGAGES` sont des noms ou des alias de grammaires de highlight.js (`html` est un alias de `xml`).

## Approche

### Coloration (`edition/coloration.ts`, `edition/colorable.ts`)

- **Greffon de l'application** (H1 b), extension `colorationDuBlocCode()` ajoutée à `extensionsDeLEditeur` (`schema.ts`) juste après `BlocCode`. `BlocCode` (F-005) n'est pas refait. Aucun `@tiptap/extension-code-block-lowlight`.
- **Seul importateur** de `lowlight` (`createLowlight` seul, jamais `all` ni `common`) et des dix grammaires, chacune par `highlight.js/lib/languages/<nom>` : `bash`, `css`, `javascript`, `json`, `markdown`, `python`, `sql`, `typescript`, `xml`, `yaml`. Une instance par module, créée à l'import, grammaires enregistrées statiquement (H7). `highlightAuto` n'est jamais appelé (F-033-AC2).
- **Aucun import de `hast`** : les types de l'arbre se tirent de lowlight, `type Racine = ReturnType<ReturnType<typeof createLowlight>["highlight"]>`, et ses enfants par `Racine["children"][number]`, rétrécis par leur champ `type`. Pas de troisième dépendance directe (`@types/hast` n'est qu'une dépendance de lowlight ; pnpm ne la rend pas importable depuis `apps/web`). Le type des grammaires vient de la déclaration `declare module 'highlight.js/lib/languages/*'` de `highlight.js/types/index.d.ts`, que les déclarations de lowlight chargent (`import type { LanguageFn } from 'highlight.js'`) : aucune importation de l'entrée racine de highlight.js n'est nécessaire, et la règle `grammaires-une-a-une` la refuse, types compris.
- **État du greffon** : un `DecorationSet`. `init` le calcule ; `apply` le recalcule si `tr.docChanged`, sinon le garde ; `props.decorations` le rend. Pas de minuterie, pas de tâche différée (F-033-AC4). Les décorations ne sont pas dans le document : aucune transaction, aucune mise à jour Yjs, aucune version (AC5, AC8 en lecture seule, AC12).
- **Parcours** : `doc.descendants`, sans entrer dans les blocs de texte ; pour chaque `codeBlock` (listes comprises), dans cet ordre :
  1. `langageAdmis(attrs.language)` de `langages.ts` ; `null` → aucune décoration (AC2 : `xml`, `js`, `hljs`, un nombre ne passent jamais à la bibliothèque) ;
  2. clé `langage + "\0" + texte` ; trouvée dans la mémoire → son résultat ;
  3. sinon `raisonSansColoration(texte)` de `colorable.ts` (une passe : plus de 10 000 unités UTF-16 → `"bloc"`, sinon une ligne de plus de 500 → `"ligne"`, sinon `undefined`, H6) ; trop long → aucune décoration (AC9) ;
  4. sinon `lowlight.highlight(langage, texte)` dans un `try`, puis la conversion ci-dessous.
     La **mémoire** est une `Map` par éditeur (créée dans `addProseMirrorPlugins`), bornée à 200 entrées, la plus ancienne retirée d'abord, une entrée relue remise en tête ; elle garde le résultat entier : portions, « trop long » ou « échec ». La clé par texte est obligatoire : la liaison recrée les nœuds à chaque mise à jour reçue (veille) ; elle donne AC10 (un appel, un appel, aucun) quelle que soit l'origine. À chaque transaction qui change le document, les décorations de tous les blocs colorables sont recréées à partir de la mémoire (coût linéaire en nombre de portions, aucun appel à la bibliothèque).
- **Conversion** de la racine en portions `{ de, a, role }` : parcours récursif qui tient un décalage en unités UTF-16 ; un `element` prend le rôle de l'ancêtre le plus proche que la table connaît (H5) ; une portée absente ne change pas le rôle hérité ; un texte sans rôle ne donne aucune portion. La **portée** d'un élément se lit dans `properties.className`, un tableau : `hljs-<x>` donne `x`, chaque jeton suivant de la forme `<y>_` ajoute `.y` (`['hljs-title', 'function_']` → `title.function`), les jetons `<z>__` sont ignorés ; la table est cherchée par la portée entière, puis ses préfixes (`title.class.inherited` → `title.class`). Les textes mis bout à bout sont comparés au texte du bloc (chaîne égale, pas seulement la longueur) : différents → « échec » (AC11).
- **Décorations** : `Decoration.inline(debut + 1 + de, debut + 1 + a, { class: CLASSES_DE_ROLE[role] })`. Seule classe posée : celle du rôle, prise dans la liste fermée ; le nom de portée n'est jamais recopié (AC6). Le rendu reste `pre` > `code` de F-005 (`renderHTML` inchangé). La copie et la coupe sérialisent le document, pas les décorations : `text/plain` est le texte, `text/html` porte `pre` > `code` sans classe de rôle (AC7), sans code de plus.
- **Échec** (AC11) : exception levée ou portions qui ne recollent pas → aucune décoration pour ce bloc, rien de propagé, « échec » en mémoire, et `console.error` d'un **message fixe**, appelé à l'inscription de l'échec seulement (donc une fois par clé tant qu'elle reste en mémoire, voir R3). Le message ne porte ni le texte ni l'exception (le message d'une erreur de highlight.js peut citer un lexème du texte) ; il peut porter l'identifiant du langage.
- **Composition** : la coloration est recalculée aussi pendant une composition (AC4). Risque connu des décorations recalculées sous un IME ; le scénario à la main d'AC26 (IME japonais) le constate dans un bloc coloré. Repli, si la composition est interrompue : pendant une transaction qui porte la méta `composition` de ProseMirror, reporter l'ensemble précédent par `map(tr.mapping, tr.doc)` au lieu de le recalculer — à remonter au dev avant de l'écrire, AC4 en dépend.

### Table des portées (H5, fixée ici)

| Rôle (`CLASSES_DE_ROLE`) | Portées de highlight.js                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `motCle`                 | `keyword`, `built_in`, `meta`, `selector-tag`, `name` (nom de balise), `section`, `bullet`                       |
| `chaine`                 | `string`, `regexp`, `symbol`, `link`, `code`                                                                     |
| `nombre`                 | `number`, `literal`                                                                                              |
| `commentaire`            | `comment`, `doctag`, `quote`                                                                                     |
| `fonction`               | `title.function`                                                                                                 |
| `type`                   | `title.class`, `type`, `emphasis`, `strong`                                                                      |
| `propriete`              | `attr`, `attribute`, `property`, `variable`, `selector-class`, `selector-id`, `selector-pseudo`, `selector-attr` |

Hors table, donc sans rôle propre : `tag`, `punctuation`, `operator`, `params`, `subst`, `function`, `title` seul, et toute autre portée. La table est un `Record` fermé dans `coloration.ts`, typé contre les clés de `CLASSES_DE_ROLE`.

### Classes de rôle et jetons (`styles/`, `interface/composants/`)

- Sept jetons `--color-texte-syntaxe-<rôle>` dans `jetons.css` (`mot-cle`, `chaine`, `nombre`, `commentaire`, `fonction`, `type`, `propriete`), chacun un renvoi à une primitive opaque, au besoin nouvelle (`--primitif-<famille>-<nuance>`) ; couleurs choisies par agent-frontend, chacune à 4,5 pour 1 au moins sur chacune des sept surfaces (AC13). La famille `--color-texte-` les fait entrer d'elle-même dans les contrôles de F-004-AC2, AC3, AC7, AC20 et dans les échantillons « Textes » de la page de démonstration.
- Sept classes nommées `syntaxe-<rôle>` dans `entree.css`, chacune `@utility syntaxe-<rôle> { color: var(--color-texte-syntaxe-<rôle>); }` et rien d'autre (AC13). `tab-size: 2` ajouté à `& pre` de `contenu-de-page` (AC21).
- **La liste fermée des classes de rôle** est déclarée une fois, dans `interface/composants/edition.classes.ts` (sept clés `syntaxeMotCle` … `syntaxePropriete`), et exposée par `Edition.tsx` sous `CLASSES_DE_ROLE` (objet rôle → classe) avec le type `RoleSyntaxique`, comme `CLASSE_DU_CURSEUR_DE_DEPOT` (F-006-AC37). Le module d'édition, la page de démonstration et les tests la lisent là. Raisons : Tailwind n'émet une classe `@utility` que si son nom paraît dans un fichier qu'il lit (`interface/composants/*.classes.ts`, un seul `@source`) ; un fichier de classes n'est lu que par son dossier (F-004-AC16) ; la page de démonstration n'importe pas le module d'édition (`web-demonstration-liste-blanche`). Écart de libellé avec AC6 (« en un seul endroit du module d'édition ») : retouche R2.

### Indentation (`edition/indentation.ts`, `edition/bloc-code.ts`)

- `indentation.ts` : fonctions pures sur le texte du bloc et les décalages de la sélection — lignes touchées (la ligne où une sélection non vide finit à sa première colonne n'est pas touchée), indentation d'une ligne, et pour chaque touche la liste des modifications (positions, texte inséré ou longueur retirée) et la sélection d'arrivée ; plus **un seul lecteur de la sélection**, `selectionDuBlocCode(etat)`, qui passe par `bornesLues` (`types-de-bloc.ts`) et rend le bloc code, son début, l'ancre et la tête si toute la sélection est dans un même bloc code (Mod+A et sélection de nœud compris), `undefined` sinon. Les commandes appliquent toutes leurs modifications dans **une transaction** (un pas par ligne touchée, de la dernière à la première), posent la sélection explicitement (ancre et tête reportées par le mapping, côté −1 pour la borne de début : un cran inséré en tête de la première ligne touchée reste dans la sélection, AC16), et la dispatchent : une mise à jour Yjs (AC19).
  - Tab, sélection vide : un cran (deux espaces) au curseur (AC15) ; sélection non vide : un cran en tête de chaque ligne touchée non vide, rien de remplacé (AC16).
  - Maj+Tab : en tête de chaque ligne touchée, une tabulation si la ligne en commence une, sinon jusqu'à deux espaces ; rien à retirer → aucune transaction, et la touche est prise (`true`), le focus reste (AC17).
  - Entrée : la sélection remplacée par `"\n"` suivi de la part de l'indentation de la ligne où commence la sélection qui précède son début ; `scrollIntoView` (AC18).
- `bloc-code.ts`, `addKeyboardShortcuts` de `BlocCode` : `Tab`, `Shift-Tab`, `Enter` et `Escape` s'ajoutent à `Backspace` et `ArrowDown`. Gardes communes, lues par chaque raccourci : éditeur modifiable (`editor.isEditable`), aucune composition (`editor.view.composing`, garde de l'application en plus de celle de ProseMirror), `selectionDuBlocCode` défini ; sinon `false`, et rien n'est empêché (AC20). Les raccourcis ne reçoivent pas l'événement : rien ne dépend d'`event.isComposing` ni de l'effet de `preventDefault`, l'Entrée synthétique qu'Android et iOS font rappeler à la vue passe par le même chemin (AC18). Mod/Ctrl/Alt+Tab n'ont pas de liaison (AC20). `enableTabIndentation` et `exitOnTripleEnter` restent faux (H3) ; le commentaire de `.configure` et celui d'`ElementDeListe` (`schema.ts`) sont mis à jour (Tab indente dans un bloc code ; les raccourcis de l'élément de liste y restent neutralisés, AC15).
- Annulation (H9 a) : le code n'appelle pas `stopCapturing()` ; l'historique regroupe comme aujourd'hui. Les tests d'AC19 le closent eux-mêmes (gestionnaire lu sous `y-undo$` dans l'état, comme `gestionnaireDAnnulation` de `deplacement-de-bloc.ts`, ou délai de 500 ms simulé).
- Aucune comparaison de `event.key` : le contrôle de F-004-AC31 (`test/aides-touches.ts`) ne change pas, `interface/raccourcis.ts` non plus ; les noms de liaison de Tiptap (`Tab`, `Shift-Tab`, `Enter`, `Escape`) sont du même genre que `Backspace` et `ArrowDown` de F-005 (AC23).

### Sortie armée (AC22)

- État : `addStorage()` de `BlocCode`, `{ sortieArmee: false }`, par éditeur.
- `Escape` (gardes ci-dessus) : arme, rend `true` (rien d'écrit, curseur immobile). `Tab` ou `Shift-Tab` sortie armée : désarme et rend `false` sans rien écrire : la vue n'empêche pas l'événement, le navigateur déplace le focus.
- Désarmement, dans le greffon `blocCodeDeLaPage` du même fichier (les passages exemptés de `coutures-marques.test.tsx` restent intacts, à l'octet) :
  - `handleKeyDown` : toute touche qui atteint le greffon (les liaisons de `BlocCode` passent avant lui) désarme, sauf une touche de modification seule, reconnue par `event.location` gauche ou droite (Maj, Ctrl, Alt, Méta, qui précèdent Tab dans Maj+Tab) ; rend `false` ;
  - `handleDOMEvents` : `mousedown` (clic) et `blur` (perte du focus, y compris celle que provoque la sortie) désarment, rendent `false` ;
  - `view().update` : une sélection qui change (`!selection.eq(precedente)`) désarme.
- Alt+F10 n'a pas de liaison dans l'éditeur : elle désarme et reste à `surToucheDeLaZone` (F-003-AC42).

### Barre de blocs : aide et mention (AC9, AC23)

- `barre.ts`, `lire` : en plus, pour la sélection dans un bloc code, `modifiable` (`editeur.isEditable`) et `sansColoration` (`raisonSansColoration` du texte du bloc, `undefined` sans langage de la liste) ; aucune lecture de la sélection de plus (réutiliser `$from` : `LECTEURS` de `coutures-selection.test.tsx` garde `"barre.ts › lire": 2`).
- `messages.ts` : `AIDE_DU_BLOC_CODE` (« Tab indente. Échap puis Tab : quitter l'éditeur. »), `COLORATION_DESACTIVEE_BLOC` et `COLORATION_DESACTIVEE_LIGNE` (textes exacts d'AC9).
- `Edition.tsx`, `BarreDeBlocs` : deux propriétés facultatives, `aide` (`{ id, texte }`) et `mention` (texte), rendues en paragraphes après les commandes, sur leur propre ligne (classes nouvelles dans `edition.classes.ts`, `basis-full`, texte qui passe à la ligne) : la hauteur mesurée de la barre suit, `placerLaBarre` la pose sans couvrir la ligne du curseur ; aucun défilement horizontal à 360 pixels (F-004-AC45).
- `EditeurDePage.tsx` : identifiant par `useId()` ; un effet pose `aria-describedby` sur `editeur.view.dom` tant que la barre est affichée, la sélection dans un bloc code et l'éditeur modifiable, et le retire sinon (même forme que `useDesignation` de `menu-slash-affiche.ts`).

### Page de démonstration (AC14)

`Edition.tsx` gagne un composant de présentation `CodeColore` (`pre` > `code`, une portion `{ texte, role? }` par `span` à la classe de `CLASSES_DE_ROLE`). `demonstration/donnees.ts` porte dix échantillons, un par langage, écrits à la main en portions, qui couvrent à eux tous les sept rôles ; `PageDemonstration.tsx` les rend dans un spécimen « Coloration du bloc code ». Ce n'est pas la sortie de la bibliothèque (la page n'importe pas le module d'édition) : la page sert à juger les couleurs, la justesse de la coloration est prouvée par AC1.

## Plan par blocs (un commit par bloc)

0. **Dev** : `.dependency-cruiser.cjs` (annexe A). Puis agent-frontend : `pnpm --filter @notionlike/web add --save-exact lowlight@3.3.0 highlight.js@11.11.2` (repli `highlight.js@11.11.1`), au bloc 2 ; `apps/web/package.json` et `pnpm-lock.yaml` sont des fichiers partagés, à signaler au dev.
1. Jetons et classes de rôle : `jetons.css`, `entree.css` (`@utility syntaxe-*`, `tab-size`), `edition.classes.ts`, `Edition.tsx` (`CLASSES_DE_ROLE`, `RoleSyntaxique`) ; tests AC13, AC21 ; compte de F-004-AC7 dans `test/jetons.test.ts` (R1).
2. Coloration : dépendances, `edition/colorable.ts`, `edition/coloration.ts`, `schema.ts` ; tests AC1 à AC8, AC9 (sans la barre), AC10 à AC12, AC25 ; test de F-005-AC8 réécrit selon AC2 (H10) ; liste des fichiers de `structure-edition.test.ts` (H10).
3. Indentation et sortie : `edition/indentation.ts`, `bloc-code.ts`, `schema.ts` (commentaire) ; tests AC15 à AC20, AC22 (part jsdom) ; tests de F-005-AC5 réécrits (H10) ; entrée de `selectionDuBlocCode` dans `LECTEURS` (R1).
4. Barre : `barre.ts`, `EditeurDePage.tsx`, `Edition.tsx` (`BarreDeBlocs`), `edition.classes.ts`, `messages.ts` ; tests AC9 (textes et bascules), AC23.
5. Page de démonstration : `CodeColore`, `donnees.ts`, `PageDemonstration.tsx` ; spécimen de `demonstration.test.tsx` (H10) ; AC14.
6. Couture d'AC24 : test qui énumère dans les sources les appelants et consommateurs de `BlocCode` et de `BLOC_CODE` (liste d'AC24) et le fichier de test qui couvre chacun ; tests de couture de F-005-AC28 et AC32 inchangés.
7. Bout en bout d'AC26 : `apps/web/e2e/bloc-code-coloration.spec.ts` (Chromium), lancé à la main avant le DONE (D-003), avec le scénario à la main au téléphone et à l'IME.
8. agent-architecte-conception : `ARCHITECTURE.md` aligné sur le diff livré.

## Fichiers

Nouveaux : `apps/web/src/edition/coloration.ts`, `apps/web/src/edition/colorable.ts`, `apps/web/src/edition/indentation.ts` ; tests `apps/web/test/edition/coloration.test.tsx`, `coloration-limites.test.tsx` (AC9 à AC11, doublure), `indentation.test.tsx`, `sortie-du-bloc-code.test.tsx`, `coutures-coloration.test.tsx` ; `apps/web/test/coloration-dependances.test.ts` (AC25), `apps/web/test/jetons-syntaxe.test.ts` (AC13, AC21) ; `apps/web/e2e/bloc-code-coloration.spec.ts`.

Modifiés : `apps/web/src/edition/{bloc-code,schema,barre}.ts`, `apps/web/src/edition/EditeurDePage.tsx`, `apps/web/src/interface/composants/{Edition.tsx,edition.classes.ts}`, `apps/web/src/interface/messages.ts`, `apps/web/src/styles/{jetons,entree}.css`, `apps/web/src/demonstration/{donnees.ts,PageDemonstration.tsx}`, `apps/web/package.json`, `pnpm-lock.yaml`. Tests modifiés : `test/edition/bloc-code.test.tsx` (F-005-AC5 ×2, AC8), `test/structure-edition.test.ts` (liste des fichiers du module), `test/demonstration.test.tsx` (spécimen), et, sous réserve de R1, `test/jetons.test.ts` (compte) et `test/edition/coutures-selection.test.tsx` (une entrée).

Non touchés : `packages/**`, `apps/server/**` (AC24, « Hors périmètre ») ; `apps/web/src/edition/{langages,liaison,deplacement-de-bloc,depot,types-de-bloc,commandes-de-bloc,menu-slash,menu-slash-affiche,marques,lien,invite,poignee,placement,selection-du-navigateur,index}.ts` (l'interface du module ne change pas : `structure-edition.test.ts` garde sa liste d'exports) ; `apps/web/src/interface/raccourcis.ts`, `test/aides-touches.ts`, `test/coutures-marques.test.tsx` (passages exemptés intacts), `test/coutures-bloc-code.test.tsx`, `test/styles.test.ts` (aucun fichier de classes nouveau : le compte de treize ne bouge pas), `eslint.config.mjs`, `apps/web/vitest.config.ts`, `index.html`, `demo.html`.

## Ce qui est prouvé, et où

- **Vitest, jsdom** (dans les hooks et la CI) : AC1 à AC25. Le DOM rendu par ProseMirror sous jsdom porte les décorations (classes, `code.textContent`) ; lecture par `yjs` seul (AC5, AC24) ; deux répliques reliées (AC12) ; commandes et événements clavier de l'éditeur (AC15 à AC22) ; composition simulée par `view.input.composing` (AC18, AC20) ; lecture de `jetons.css` et `entree.css` en texte (AC13, AC21 : jsdom n'applique pas la feuille). **Doublure de la bibliothèque** (AC10, AC11) : `vi.mock("lowlight", async (importOriginal) => …)` dans le fichier de test, qui rend le vrai `createLowlight` enveloppé pour compter `highlight` ou le faire lever ou mentir ; ce n'est pas une importation au sens de dependency-cruiser (aucune arête), pourvu que le test n'écrive pas de type `import("lowlight")`.
- **Navigateur seulement** : AC26 (frappes réelles, couleur calculée des jetons, déplacement réel du focus par Échap puis Tab, rechargement) ; la mesure réelle d'AC23 (360 pixels, barre qui ne couvre pas la ligne du curseur) ; et, à la main par le dev, l'Entrée au clavier virtuel d'Android et d'iPhone et la saisie par IME japonais dans un bloc indenté et coloré (H12 ; voir le risque de composition ci-dessus). Firefox et WebKit : non prouvés (spec).

## Recouvrements

- **F-018** (`../notionLike-F-018`, lu à `f380a92`) : `.dependency-cruiser.cjs` seul fichier commun, en blocs distincts (F-018 touche `web-src-liste-blanche` et ajoute ses règles après `web-page-liste-blanche` ; F-033 ajoute deux règles avant `web-edition-par-son-interface` et étend `web-edition-liste-blanche`) : le diff de l'annexe A s'applique (`git apply --check`) sur `main` comme sur la branche `F-018` ; deux commits du dev. F-018 ne touche ni `edition/**`, ni `styles/**`, ni `messages.ts`, ni `Edition.tsx`, ni le manifeste ni le verrou ; elle ajoute `table.classes.ts` (compte de `styles.test.ts` : son affaire, F-033 n'en ajoute pas). `ARCHITECTURE.md` : sections distinctes, alignées après le code de chacune.
- **F-032** (`../notionLike-F-032`, lu à `78ce6bc`) : aucun fichier commun (ni `edition/**`, ni `styles/**`, ni dépendance, ni règle de contrats). Seuls `ARCHITECTURE.md` et la traçabilité se croisent.
- Ordre de fusion indifférent ; si F-018 fusionne avant, rebaser l'annexe A n'est pas nécessaire (vérifié).

## Retouches de spec à proposer au dev (spec non modifiée)

- **R1 (H10, tests modifiés hors de sa liste)** : (a) `apps/web/test/jetons.test.ts`, test de F-004-AC7 : `expect(liste.length).toBe(5 * 7)` devient `12 * 7`, sept textes de plus ; sans ce changement, AC13 (« les contrôles de F-004-AC7 DOIVENT passer sur ces jetons ») est impossible ; (b) `apps/web/test/edition/coutures-selection.test.tsx` : une entrée de plus dans `LECTEURS`, `"indentation.ts › selectionDuBlocCode": { lectures: 1, lecture: BORNES }` ; le test est fait pour échouer sur tout lecteur nouveau. Proposition : ajouter ces deux fichiers à la liste des tests modifiés de H10.
- **R2 (AC6, libellé)** : « d'une liste fermée déclarée en un seul endroit du module d'édition » devient « déclarée en un seul endroit, le fichier de classes de l'édition (`interface/composants/edition.classes.ts`), que le module d'édition lit par `Edition.tsx` ». Raisons dans « Classes de rôle et jetons ». Le sens d'AC6 est gardé (une liste, aucune classe dérivée du texte ou de la portée).
- **R3 (AC11, précision)** : « consigner l'échec une seule fois pour ce texte » vaut tant que ce texte est dans la mémoire de coloration (200 entrées par éditeur) ; un texte oublié puis revu est consigné de nouveau. Alternative : une mémoire des échecs non bornée, refusée (un pair qui écrit peut faire grossir toute mémoire non bornée).
- **R4 (AC22, précision)** : une touche de modification seule (Maj, Ctrl, Alt, Méta) n'est pas « une autre touche » : sans quoi Maj+Tab ne sortirait jamais, Maj précédant Tab. Information : Échap pressée dans un bloc code est prise par l'éditeur (`preventDefault`), comme toute touche liée ; l'écouteur d'Échap du tiroir (`interface/tiroir.ts`, qui ignore un événement empêché) ne la reçoit donc pas depuis un bloc code, ce qui ne se produit pas tiroir ouvert (le focus y est).
- **R5 (AC25, information)** : la règle de contrats est plus stricte que la spec : la bibliothèque n'est importable que par `edition/coloration.ts` (pas par tout le module ni par ses tests), et une règle refuse aussi l'entrée racine et `lib/common` de highlight.js. Les lots `all` et `common` de lowlight sont des exports nommés de son entrée : seul le test d'AC25 les voit.

## Menaces propres à F-033 (contenu de page piégé)

- Langage forgé par un pair (`x fixed inset-0`, `hljs`, `js`, un nombre) : `langageAdmis` avant tout appel ; aucune détection automatique ; aucune classe tirée du langage hors de `language-<id>` de F-005.
- Texte forgé pour faire travailler une grammaire (ReDoS, `highlightjs/highlight.js#4529`, coût quadratique d'une longue suite sans saut de ligne) : bornes de 10 000 unités par bloc et 500 par ligne, lues avant l'appel (pire mesuré 30 ms) ; mémoire bornée ; une page de nombreux blocs longs reste colorée en une fois à l'ouverture (coût accepté par H6).
- Injection de classes ou de HTML par le texte (`hljs-keyword`, `<script>`) : décorations seules, classe prise dans la liste fermée par la table des portées ; le nom de portée n'est jamais recopié ; aucun HTML (F-003-AC20).
- Fuite du contenu dans la console : message d'échec fixe, sans texte ni exception.
- Piège au clavier (WCAG 2.1.2) : Échap puis Tab, annoncé par l'aide désignée par `aria-describedby`.

## Annexe A : `.dependency-cruiser.cjs` (fichier protégé, commit du dev)

Éprouvé sur une copie de l'arbre à `9e69259` (scratchpad, `node_modules` liés, paquets factices `lowlight` et `highlight.js` au manifeste d'exports réel de `highlight.js@11.11.2`, relevé par `npm view`) : `depcruise --config .dependency-cruiser.cjs apps packages` sans violation (quarante-neuf règles au lieu de quarante-sept) ; avec des fichiers fautifs posés puis retirés, douze violations attendues : `lowlight` importé par un autre fichier d'`edition/`, par un test d'`test/edition/`, par `packages/document/src` (nom écrit, non résolu) ; une grammaire importée depuis `interface/` ; un type `hast` importé par un test ; l'entrée racine de highlight.js (valeur et `import type`) et `highlight.js/lib/common`, refusés même depuis `edition/coloration.ts` ; aucune violation pour `coloration.ts` qui importe `createLowlight`, deux grammaires une à une et un type `hast`. Prettier conforme ; `git apply --check` vert sur `main` (`9e69259`) et sur `F-018` (`f380a92`). À appliquer par `git apply` depuis la racine du dépôt.

```diff
--- a/.dependency-cruiser.cjs
+++ b/.dependency-cruiser.cjs
@@ -402,7 +402,35 @@
         ],
       },
     },
+    // F-033-AC25, par paquet. Deux expressions par cible, comme pour better-auth : le fichier installé
+    // et le nom tel qu'il est écrit, gardé quand le paquet n'est pas installé chez l'importateur.
     {
+      name: "coloration-confinee",
+      severity: "error",
+      comment:
+        "F-033-AC25, H1 : la bibliothèque de coloration (lowlight), ses grammaires (highlight.js) et les types de leur arbre (hast) ne sont importés que par src/edition/coloration.ts : ni par un autre fichier du module d'édition, ni par un test, ni par un autre fichier d'apps/web, ni par un paquet, ni par le serveur.",
+      from: { pathNot: "^apps/web/src/edition/coloration\\.ts$" },
+      to: {
+        path: [
+          "(^|/)node_modules/(lowlight|highlight\\.js|hast|@types/hast)/",
+          "^(lowlight|highlight\\.js|hast)(/|$)",
+        ],
+      },
+    },
+    {
+      name: "grammaires-une-a-une",
+      severity: "error",
+      comment:
+        "F-033-AC25, H1, H7 : aucun fichier n'importe un lot de grammaires de highlight.js (son entrée racine, types compris, ou lib/common, qui les enregistrent toutes) ; les grammaires s'importent une à une par highlight.js/lib/languages/<nom>. Les lots de lowlight (all, common) sont des exports nommés de son entrée : le test de F-033-AC25 les refuse dans les sources.",
+      from: {},
+      to: {
+        path: [
+          "(^|/)node_modules/highlight\\.js/((es|lib)/(index|common)\\.m?js|types/index\\.d\\.ts)$",
+          "^highlight\\.js(/lib/common)?$",
+        ],
+      },
+    },
+    {
       name: "web-edition-par-son-interface",
       severity: "error",
       comment:
@@ -414,7 +442,7 @@
       name: "web-edition-liste-blanche",
       severity: "error",
       comment:
-        "F-003-AC27, F-006-AC32, F-005-AC33 : le module d'édition n'importe que lui-même, le composant de présentation de l'édition, les textes de l'interface, react, yjs, les paquets Tiptap qu'il emploie, poignée de bloc (drag-handle, drag-handle-react, node-range), curseur de dépôt (@tiptap/extensions), bloc code (extension-code-block) et utilitaire de suggestion (suggestion) compris, et @floating-ui/dom (placement du menu slash) ; ni @floating-ui/core, ni @floating-ui/utils, ni @dnd-kit/*.",
+        "F-003-AC27, F-006-AC32, F-005-AC33, F-033-AC25 : le module d'édition n'importe que lui-même, le composant de présentation de l'édition, les textes de l'interface, react, yjs, les paquets Tiptap qu'il emploie, poignée de bloc (drag-handle, drag-handle-react, node-range), curseur de dépôt (@tiptap/extensions), bloc code (extension-code-block) et utilitaire de suggestion (suggestion) compris, @floating-ui/dom (placement du menu slash), et, depuis F-033, lowlight, highlight.js et les types hast (coloration du bloc code, réservés à coloration.ts par coloration-confinee) ; ni @floating-ui/core, ni @floating-ui/utils, ni @dnd-kit/*.",
       from: { path: "^apps/web/src/edition/" },
       to: {
         pathNot: [
@@ -424,6 +452,7 @@
           "(^|/)node_modules/(react|yjs)/",
           "(^|/)node_modules/@tiptap/(core|pm|react|extensions|suggestion|extension-(bold|code-block|collaboration|document|drag-handle|drag-handle-react|heading|italic|link|list|node-range|paragraph|text))/",
           "(^|/)node_modules/@floating-ui/dom/",
+          "(^|/)node_modules/(lowlight|highlight\\.js|@types/hast)/",
         ],
       },
     },
```

## Annexe B : autres fichiers protégés ou partagés

- Aucun autre fichier protégé : ni `eslint.config.mjs` (`no-console` admet déjà `error`), ni `vitest.config.*`, ni paquet de workspace nouveau, ni `packages/document/package.json`.
- Partagés, par agent-frontend au bloc 2, à signaler au dev : `apps/web/package.json` (deux dépendances d'exécution exactes, `"highlight.js": "11.11.2"` et `"lowlight": "3.3.0"`) et `pnpm-lock.yaml`, par la seule commande `pnpm --filter @notionlike/web add --save-exact lowlight@3.3.0 highlight.js@11.11.2`. Après l'ajout : une seule version de `highlight.js`, de `lowlight` et de `yjs` au verrou, `prosemirror-view` à 1.42.3 au moins (AC25). L'arbre de `F-033` n'a pas encore été réinstallé après la fusion de `main` (vite 8.3.2 dans `node_modules`, 8.3.4 au verrou) : `pnpm install --frozen-lockfile` avant le bloc 1.

## Addendum du 2026-10-21 : écarts au code

Écrit après le code d'agent-frontend, relu sur `af95b0b` (blocs 1 à 7 : `9fcde30`, `07b9c0a`, `1dd37dd`, `4488618`, `2c4742e`, `c03feb5`, `af95b0b`), et après la troisième retouche de la spec (`564d728`, revalidée par le dev à `c3a0253`). Là où il les contredit, il remplace les sections ci-dessus, gardées comme trace de la conception d'avant le code. Le format ne change pas (H2, ADR-0018) : toujours aucune ADR. L'annexe A est appliquée telle quelle (`f1cb8b9`) : quarante-neuf règles, `pnpm contrats` sur `af95b0b` : `✔ no dependency violations found (587 modules, 2459 dependencies cruised)`. `ARCHITECTURE.md` est aligné sur `af95b0b` (bloc 8).

### Coloration

Complète « Coloration ».

- `colorationDuBlocCode` est une **constante** d'extension (`Extension.create`), pas une fonction : `extensionsDeLEditeur` l'ajoute telle quelle, juste après `BlocCode`.
- Les nœuds de l'arbre de lowlight sont lus par leur forme (`NoeudDeLArbre` : `type`, `value`, `properties.className`, `children`), déclarée dans `coloration.ts` : aucun type n'est tiré de lowlight ni de `hast`.
- **Mémoire** (décision du dev, spec retouchée à `564d728`, AC11, H6) : classe `MemoireDeColoration`, une par éditeur, créée dans `addProseMirrorPlugins`. Elle garde au plus 200 entrées **en plus de celles que le passage en cours a lues**, qui ne sont jamais retirées : chaque parcours (`decorationsDe`) note ses clés dans un ensemble `lues`, puis `borner` retire, de la moins récemment lue à la plus récente, les entrées qui dépassent la borne, sans toucher aux clés lues. Elle est donc bornée par le nombre de blocs colorables du document plus 200. Raison : bornée à 200 entrées tout court, une page de plus de 200 blocs colorables serait recolorée entière à chaque transaction (contraire à AC10). « Trop long » et « échec » y sont retenus sous la même valeur, une liste de portions vide.
- **Échec** (AC11) : le message (`console.error`, fixe, suivi du seul identifiant du langage) est consigné à l'inscription de l'échec en mémoire, donc une fois par texte et **par éditeur**. Sous `StrictMode`, que l'application emploie, l'effet d'`EditeurDePage` crée un éditeur, le détruit et en crée un second : chacun a sa mémoire, et un texte en échec est consigné deux fois à l'ouverture en développement. Le test d'AC11 compte les consignations après l'ouverture.
- Composition : le repli (report de l'ensemble précédent sous la méta `composition`) n'est pas écrit ; il ne l'est que si le scénario à la main d'AC26 (IME japonais) constate une composition interrompue dans un bloc coloré.

### Indentation et sortie armée

Remplace « Sortie armée (AC22) » pour l'état et le désarmement, et complète « Indentation ».

- **État** : la sortie armée est l'état du greffon `blocCodeDeLaPage` (`CLE_DE_LA_PAGE`, `PluginKey<boolean>`, `bloc-code.ts`), et non `addStorage()`. Elle est armée et désarmée par une méta posée sur une transaction sans pas, envoyée seulement si l'état change (aucune mise à jour Yjs). `apply` la garde tant que la sélection lue par `selectionDuBlocCode` n'a pas bougé (`memeSelection` : même début de bloc, même ancre, même tête) : un changement de sélection, la sortie du bloc ou un déplacement du bloc la désarment, sans `view().update`.
- **Désarmement** : par `handleDOMEvents` (`keydown`, `mousedown`, `blur`), et non par `handleKeyDown`. ProseMirror appelle `handleDOMEvents.keydown` **avant** les liaisons de l'éditeur : Tab et Maj+Tab y sont donc reconnues pour ne pas désarmer avant qu'`indenter` ne lise l'état, par `keydownHandler` de `@tiptap/pm/keymap` sur les noms de liaison `Tab` et `Shift-Tab` (aucune comparaison de `event.key`, F-004-AC31) ; une touche de modification seule l'est par `event.location` (1 ou 2, gauche ou droite). Échap, sortie armée, passe d'abord par ce désarmement puis réarme. Les passages exemptés de `coutures-marques.test.tsx` sont intacts.
- **Entrée** : après `appliquer`, le curseur est posé explicitement après le texte inséré (saut de ligne et reprise de l'indentation), puis `scrollIntoView`.
- Le reste est conforme : gardes communes (`selectionPrise` : `isEditable`, `view.composing`, `selectionDuBlocCode`), une transaction par touche, Maj+Tab sans rien à retirer prise sans transaction, Tab ou Maj+Tab sortie armée qui désarme et rend `false`.

### Barre de blocs

Remplace le premier et le quatrième point de « Barre de blocs : aide et mention ».

- `lire` (`barre.ts`) n'a pas de champ `modifiable` : seul `sansColoration` s'ajoute, et `LECTEURS` garde `"barre.ts › lire": 2`. L'aide dépend de la lecture seule que l'éditeur reçoit en propriété (`lectureSeule`, F-013-AC25) : la barre n'est pas rendue en lecture seule, et `useAideDuBlocCode` (`EditeurDePage.tsx`) pose `aria-describedby` tant que la barre est affichée, que la sélection est entière dans un même bloc code (`barre.langage !== undefined`) et que `lectureSeule` est faux.
- `BarreDeBlocs` prend la classe `barreAvecAide` (celle de la barre, plus `flex-wrap`) seulement quand elle porte une aide ou une mention, et `barre` sinon ; aide et mention sont des paragraphes `aideDeBarre` (`basis-full`), la mention avant l'aide.

### Page de démonstration

Complète « Page de démonstration (AC14) ».

- La section « Coloration du bloc code » porte les dix spécimens `CodeColore` (`ECHANTILLONS_DE_CODE`, `donnees.ts`, qui importe en type `PortionDeCode` d'`Edition.tsx`) et un spécimen de `BarreDeBlocs` d'un bloc code, avec l'aide et la mention d'une ligne trop longue. `CodeColore` est ajouté à la liste des composants de `demonstration.test.tsx`.

### Couture d'AC24 et tests

Remplace le bloc 6 du plan pour la forme du test.

- `test/edition/coutures-coloration.test.tsx` énumère dans les sources les appelants et consommateurs de `BlocCode`, de `BLOC_CODE`, de la coloration et des classes de rôle (liste fermée), et **exerce chacun dans le test lui-même**, sur un bloc coloré, coloration et indentation actives, au lieu de nommer le fichier de test qui le couvre.
- Tests ajoutés hors de la liste de « Fichiers » : `test/edition/barre-du-bloc-code.test.tsx` (AC9, AC23) et l'aide `test/edition/aides-coloration.ts`. Tests modifiés hors de R1, accordés par la retouche `564d728` : `test/structure.test.ts` (F-002-AC22, `highlight.js` et `lowlight` au manifeste), les énumérations de `test/structure-edition.test.ts` (F-003-AC20, AC27, AC44 ; trente-deux fichiers) et `test/edition/aides-edition.tsx`.

### Point ouvert, remonté à l'orchestrateur

- **La mémoire garde le texte entier des blocs trop longs.** La clé est `langage + "\0" + texte` et elle est cherchée avant `raisonSansColoration` (ordre de la note, étapes 2 et 3) : un bloc d'un langage de la liste de plus de 10 000 unités est mis en mémoire comme un autre. Chaque frappe dans un bloc de 1 000 000 d'unités, ou chaque mise à jour reçue qui le change, ajoute une entrée d'environ un million d'unités, et 200 en restent : de l'ordre de 200 à 400 Mo par éditeur, et le texte est recopié et haché à chaque transaction. Défaut de la note, que le code suit. Correction proposée, sans retouche de spec (AC9 à AC11 ne demandent pas de retenir les blocs trop longs) : juger `raisonSansColoration` avant la mémoire et n'y garder que les textes colorables, soit des clés de 10 000 unités au plus.
