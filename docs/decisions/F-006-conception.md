# F-006 — Conception (mode rapide) : glisser-déposer des blocs et des pages

Date : 2026-10-16
Spec : `specs/F-006.md` (validée, structurel). ADR : ADR-0015 (proposé). Base : branche `F-006`, partie de la tête de F-028 (`bd6f809`).

Note courte écrite avant le code (mode rapide, ROADMAP : ni plan détaillé par blocs ni gate de conception). Elle ne décrit pas le code livré : `ARCHITECTURE.md` le décrit depuis l'alignement du 2026-10-16, et les écarts entre cette note et le code sont datés dans la « Note de fin ».

## Essais exécutés

Gabarit : `git archive HEAD` de `bd6f809` dans le scratchpad, `pnpm install --frozen-lockfile --ignore-scripts`, puis `pnpm --filter @notionlike/web add --save-exact --ignore-scripts` des sept paquets de la spec. Node 26, pnpm 12.10.1, Vitest 5.0.3, jsdom.

| Essai | Question                                                                                            | Résultat                                                                                                                                                                                                                                                                                                                                                                              |
| ----- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1    | Installation                                                                                        | 8 paquets ajoutés ; une seule version de `yjs` (13.6.33), de `prosemirror-view` (1.42.6) et de `@floating-ui/dom` (1.8.0, déjà au verrou par `@tiptap/react`) ; `tslib` 2.8.1 et `@dnd-kit/accessibility` 3.1.1 en transitif                                                                                                                                                          |
| E2    | Contrats avec des fichiers témoins conformes et la configuration ci-dessous                         | configuration actuelle : 7 violations (`web-src-liste-blanche` sur `src/glisser/`, `web-edition-liste-blanche` sur les quatre paquets Tiptap) ; configuration proposée : `no dependency violations found (523 modules, 2147 dependencies cruised)` ; `prettier --check` et `eslint` du fichier : sans remarque                                                                        |
| E3    | Chaque règle nouvelle voit son cas fautif                                                           | 13 violations attendues, une par cas : `@dnd-kit/core` depuis `src/interface/`, `src/edition/`, `test/`, `apps/server/src` (nom non résolu) ; `glisser/zone.ts` atteint sans l'interface ; `react-dom`, `interface/messages.ts` et `@dnd-kit/accessibility` depuis `src/glisser/` ; `@floating-ui/dom` depuis `src/edition/` ; `react` et `navigation/route.ts` depuis la destination |
| E4    | `pnpm --filter @notionlike/web typecheck` sur les témoins                                           | code 0 : `DragHandle` (React) accepte l'`Editor` de `@tiptap/core` que crée `EditeurDePage` ; `Dropcursor.configure({ color: false, class })` est typé                                                                                                                                                                                                                                |
| E5    | Montage de la poignée (`DragHandle`, `StrictMode`) sur un éditeur relié à un `Y.Doc`                | 0 mise à jour Yjs : l'enregistrement du greffon après la création (`registerPlugin`) n'écrit rien (F-006-AC14)                                                                                                                                                                                                                                                                        |
| E6    | Déplacement en une transaction (`tr.delete` puis `tr.insert`)                                       | 1 mise à jour Yjs, `one\|two\|three` devient `two\|three\|one`, curseur gardé dans son bloc ; annulation sans précaution : elle défait aussi le contenu posé moins de 500 ms avant (délai de capture du gestionnaire d'annulation de la liaison) ; avec `stopCapturing()` avant et après : l'annulation ne défait que le déplacement, la frappe reste                                 |
| E7    | Lâcher intercepté dans `handleDrop`, `view.dragging` et `NodeRangeSelection` posés comme la poignée | déplacement interne : `moved` vrai, 1 mise à jour, `two\|three\|one`, événement empêché ; fichier lâché : `handleDrop` appelée (`moved` faux, tranche vide), `true` rendu : aucune mise à jour, événement empêché                                                                                                                                                                     |

Lu dans `@tiptap/extension-drag-handle` 3.31.4 (`dist/index.js`) : la poignée glisse la sélection entière quand le bloc survolé est dedans (plusieurs blocs possibles) ; elle se masque à chaque frappe dans l'éditeur (`handleDOMEvents.keydown`) et ne se place qu'au survol (`mousemove`) ; options `onElementDragStart`, `onElementDragEnd`, `onNodeChange`, `locked`, `nested` (faux par défaut : seuls les blocs de premier niveau, une liste d'un seul tenant).

Non essayé : tout geste réel (pointeur, poignée au survol, repères) ; le capteur clavier de dnd-kit dans la barre réelle ; la portée macOS d'Alt+Maj+Flèche.

## Décisions

### Module de glisser-déposer : `apps/web/src/glisser/`

Seul importateur de `@dnd-kit/core`, `@dnd-kit/sortable` et `@dnd-kit/utilities` (F-006-AC32, ADR-0015). Il ne porte que le geste : ni le document, ni les textes, ni la destination. Il n'importe que lui-même, `react` et ces trois paquets. Importé par `interface/BarreLaterale.tsx` (la liste) et `interface/RangeePage.tsx` (chaque rangée), plus tard par F-020. Interface (`index.ts`), sans aucun type de la bibliothèque :

```ts
export type ZoneDeDepot = "avant" | "apres" | "dans";

export interface AnnoncesDuGlisser {
  readonly instructions: string;
  saisie(actif: string): string;
  survol(actif: string, cible: string | undefined, zone: ZoneDeDepot | undefined): string;
  depot(actif: string, cible: string | undefined, zone: ZoneDeDepot | undefined): string;
  abandon(actif: string): string;
}

export interface ProprietesListeGlissable {
  readonly identifiants: readonly string[]; // ordre affiché
  readonly desactivee: boolean; // lecture seule (F-013-AC25), saisie de titre ouverte
  readonly zoneAdmise: (actif: string, cible: string, zone: ZoneDeDepot) => boolean;
  readonly surLacher: (actif: string, cible: string, zone: ZoneDeDepot) => void;
  readonly annonces: AnnoncesDuGlisser;
  readonly children: ReactNode;
}
export function ListeGlissable(props: ProprietesListeGlissable): ReactElement;

export interface ElementGlissable {
  readonly ref: (element: HTMLElement | null) => void; // la rangée
  readonly ecouteursDuPointeur: Pick<DOMAttributes<HTMLElement>, "onPointerDown">;
  readonly ecouteursDuClavier: Pick<DOMAttributes<HTMLElement>, "onKeyDown">;
  readonly idDesInstructions: string;
  readonly deplacement: string | undefined; // valeur de `transform`, jamais de transition
  readonly enGlissement: boolean;
  readonly zone: ZoneDeDepot | undefined; // repère à dessiner sur cette rangée
}
export function useElementGlissable(id: string): ElementGlissable;
```

- Zone : calcul pur du module (`glisser/zone.ts`), d'après le rectangle de la cible et la position de l'élément glissé : quart haut « avant », quart bas « après », milieu « dans ». Une zone que `zoneAdmise` refuse n'a ni repère ni lâcher (F-006-AC1, AC5, AC6, AC7).
- `surLacher` n'est appelé que si l'actif et la cible sont encore dans `identifiants` au lâcher ; sinon le geste est abandonné (F-006-AC8).
- Capteurs : `PointerSensor` avec une distance d'activation (un clic sur le lien reste un clic) ; `KeyboardSensor` démarré par Espace seul (`keyboardCodes`), pour qu'Entrée suive toujours le lien et que F2 et les boutons de la rangée gardent leurs touches (F-002-AC10). Les écouteurs du pointeur vont sur la rangée, ceux du clavier sur le lien seul : une touche Espace sur « ⋯ » ne démarre pas de geste.
- Les `attributes` de dnd-kit ne sont pas posés tels quels : ni `role="button"`, ni `tabindex`, ni `aria-roledescription` sur le lien (la rangée garde la sémantique de F-002 et F-004) ; seul `aria-describedby` vers les instructions, joint à la description de sous-page. Annonces, instructions : texte français reçu par `annonces` (F-006-AC36).
- Pas d'écartement des rangées voisines (stratégie sans transformation) et pas de `transition` : la rangée glissée suit le pointeur par `transform` seul. F-006-AC29 tient sans jeton de durée, et rien n'est animé sous mouvement réduit.
- Le lien de la rangée porte `draggable={false}` : sinon le navigateur lance son propre glisser du lien.

### Barre latérale (`apps/web/src/interface/`)

- `interface/destination-de-page.ts`, fonction pure (contrat `web-destination-pure` ; livrée sans aucun import, voir la note de fin) : `destinationDuDepot(racines, id, cible, zone)` et `destinationDeLaCommande(racines, id, commande)`, commande parmi `monter`, `descendre`, `sous-la-precedente`, `sortir`. Résultat : `{ sorte: "deplacer", ou: Emplacement }`, `{ sorte: "sans-effet" }` ou `{ sorte: "refusee" }`. La table de cas de F-006-AC4 et l'énumération de F-006-AC13 l'éprouvent ; `zoneAdmise` et l'état « indisponible » des commandes (F-006-AC11) en sont dérivés, sans second calcul.
- Appel unique de `deplacerPage` : une action `deplacerPage(id, destination)` de `actionsDeLaBarre` (`Application.tsx`), par `essayer` comme les autres ; refus typé : message de F-002-AC15. Succès : dépli du nouveau parent (F-006-AC3, AC9) ; livré sans dépli explicite de ses ancêtres, déjà dépliés (note de fin). La session expose l'opération : `OperationsEspace` (`espace/session-espace.ts`) gagne `deplacerPage`. C'est le seul appelant que le test de F-006-AC30 énumère (F-007 ne l'appelle pas).
- Commandes au clavier : quatre entrées du menu « ⋯ » (`entreesDuMenu`), désactivées avec leur raison quand la destination est « sans-effet » ou « refusee », et les raccourcis Alt+Maj+Flèche dans `surTouche` de la rangée ; les combinaisons sont déclarées dans `raccourcis.ts`. Après un déplacement au clavier, le focus est rendu explicitement à la rangée : React déplace le nœud de la liste, et un nœud retiré puis réinséré perd le focus (à constater). Annonce de F-006-AC12 : une région `role="status"` de la barre, textes dans `messages.ts`.
- Lecture seule : liste `desactivee`, commandes désactivées avec la raison de F-013-AC25.
- `Rangee.tsx` (présentation) reçoit une propriété `glisser` typée dans son propre fichier ; le repère est une classe de `rangee.classes.ts` (trait ou contour, pas la couleur seule, F-006-AC28).

### Blocs (`apps/web/src/edition/`)

- `edition/deplacement-de-bloc.ts` : l'opération unique de F-006-AC16, `deplacerLeBloc(editeur, de, vers): boolean`, indices parmi les blocs de premier niveau, `vers` étant l'indice final. Une transaction de l'éditeur à deux pas `ReplaceStep` (retrait, insertion : la règle des liens refusés de `marques.ts` reconnaît ainsi un déplacement, F-028 H5), donc une mise à jour Yjs (E6). Rien n'est émis si `de === vers` (F-006-AC17). Le curseur reste au même endroit du texte de son bloc (F-006-AC18). `stopCapturing()` du gestionnaire d'annulation de la liaison avant et après (E6, F-006-AC20), atteint par la clé de son greffon (`y-undo$`) comme `marques.ts` atteint `y-sync$`, sans importer `@tiptap/y-tiptap`. Aucune transaction Yjs ouverte par l'application (ADR-0007), pas d'appel à `eleverVersion` (F-006-AC31) : un déplacement ne réinscrit que des éléments déjà présents.
- Interception du lâcher : un greffon du module (`edition/depot.ts`), `handleDrop`, appelé avant le traitement par défaut (E7) :
  1. fichier dans `dataTransfer.files` : rend `true` (ProseMirror empêche alors l'action par défaut), rien n'est inscrit (F-006-AC35 ; si F-022 est fusionnée avant, son branchement passe d'abord) ;
  2. geste de la poignée (drapeau levé par `onElementDragStart`, baissé par `onElementDragEnd`, indépendant de la touche de copie) : origine = la `NodeRangeSelection` posée par la poignée, à une seule plage de profondeur 0, sinon le geste est abandonné et rien n'est modifié (plusieurs blocs : hors périmètre) ; arrivée = `dropPoint(doc, pos, tranche)` de `@tiptap/pm/transform` sur `posAtCoords` de l'événement, le calcul du curseur de dépôt, pour que le bloc arrive là où le repère était ; puis `deplacerLeBloc`, `true` rendu ;
  3. tout autre lâcher (contenu extérieur, sélection de texte glissée) : `false`, chemin du collage de ProseMirror et de `marques.ts` (F-006-AC21).
- Raccourcis Alt+Maj+Flèche haut et bas : `handleKeyDown` du même greffon, qui interroge un prédicat reçu en propriété (`deplacementDuBloc(frappe)`, comparé à `RACCOURCIS` par `ZonePrincipale.tsx`, comme `meneALaBarre`) et appelle `preventDefault` pour ces deux combinaisons, commande disponible ou non (F-006-AC18). La barre de blocs reçoit « Monter le bloc » et « Descendre le bloc », indisponibles sur le premier, le dernier, ou une sélection sur plusieurs blocs.
- Poignée : `DragHandle` de `@tiptap/extension-drag-handle-react` dans `EditeurDePage`, `nested` faux, enfant `PoigneeDeBloc` (bouton « Déplacer le bloc », hors de l'ordre de tabulation, composant de présentation de `Edition.tsx`), non rendue en lecture seule. La poignée de Tiptap ne suit que le pointeur et se masque à chaque frappe : pour « ou que le curseur s'y trouve » (F-006-AC14), le module affiche le même composant au bloc du curseur, placé par mesure comme la barre de blocs (`placement.ts`), tant que l'éditeur a le focus et que la poignée de Tiptap est masquée ; celui-ci ne se glisse pas, le clavier passe par les raccourcis et la barre. Livré ainsi (`edition/poignee.ts`), voir la note de fin.
- Curseur de dépôt : `Dropcursor` de `@tiptap/extensions`, `color: false`, classe exportée par `Edition.tsx` (F-006-AC37).

### Convergence (F-006-AC22 à AC27)

Les comportements figés par AC24 à AC26 découlent de la liaison : le déplacement retire l'élément Yjs du bloc et en insère un nouveau. Une modification concurrente vise l'ancien élément (perdue), une suppression concurrente aussi (sans effet), deux déplacements insèrent deux éléments (dupliqué). Rien dans l'application ne les corrige (H2). Les tests de F-006-AC23 à AC26 lient deux éditeurs à deux `Y.Doc`, appliquent l'opération d'un côté et une commande de l'éditeur de l'autre, échangent les mises à jour dans les deux ordres par `Y.encodeStateAsUpdate` et `Y.applyUpdate` (permis aux tests), et comparent le contenu lu. F-006-AC27 : deux façades `DocumentEspace`, `deplacerPage` des deux côtés, échange, puis `lire()` identiques sans doublon (ADR-0002). F-006-AC22 : déplacements tirés au hasard, suite des blocs comparée en permutation après chacun.

## Ce que prouvent les tests

- Sous Vitest et jsdom, dans les hooks : destination et zones (F-006-AC4, AC5, AC13) ; commandes et raccourcis des pages (AC10 à AC12) par Testing Library ; opération unique, annulation, raccourcis et barre des blocs (AC16 à AC20) ; lâcher construit par le test (AC21, AC35, et le chemin du geste de la poignée par l'état de la vue posé à la main, comme E7) ; convergence (AC22 à AC27) ; coutures, schéma, version, confinement, jetons (AC29 à AC33, AC36, AC37) ; capteur clavier de dnd-kit avec rectangles bouchonnés dans le fichier de test (AC36, veille). Abandon et refus (AC6, AC8) en appelant `surLacher` et `destinationDuDepot` directement.
- Seulement de bout en bout (Playwright, Chromium, hors hooks tant que D-003 est ouverte) : le geste lui-même, les repères, la poignée au survol, Échap (AC1 à AC3, AC7, AC14, AC15), et le scénario de F-006-AC34. Gestes à la souris par `page.mouse` avec des pas intermédiaires (distance d'activation de dnd-kit, `dragover` de ProseMirror) ; contenu riche lâché par un `DragEvent` construit dans la page avec un `DataTransfer` réel (Chromium l'a), script témoin inscrit sur `window`.

## Ordre des lots (H13)

1. Pages : `destination-de-page.ts` et sa table ; action `deplacerPage`, commandes et raccourcis ; module `glisser/` et branchement de la barre ; annonces.
2. Blocs : `deplacement-de-bloc.ts` ; greffon de lâcher et de raccourcis ; poignée, curseur de dépôt, barre de blocs ; convergence.
3. Tests de structure (énumération des importateurs de Tiptap dans `structure-edition.test.ts`, importateurs de `@dnd-kit/*`, appelants de `deplacerPage`), bout en bout, puis alignement d'`ARCHITECTURE.md` et amendement de l'ADR-0007 (la phrase « ni `deplacerPage` (hors périmètre de F-002) » ne vaudra plus).

## Fichiers protégés à commiter par le dev

Avant le premier commit de code, dans cet ordre.

1. Dépendances (fichiers partagés `apps/web/package.json` et `pnpm-lock.yaml`), depuis la racine du worktree :

```bash
pnpm --filter @notionlike/web add --save-exact @dnd-kit/core@6.3.1 @dnd-kit/sortable@10.0.0 @dnd-kit/utilities@3.2.2 @tiptap/extension-drag-handle@3.31.4 @tiptap/extension-drag-handle-react@3.31.4 @tiptap/extension-node-range@3.31.4 @tiptap/extensions@3.31.4
```

Effet attendu sur le manifeste (E1) : sept lignes ajoutées sous `dependencies`, triées, sans autre changement ; le verrou ne résout qu'une version de `yjs`, de `prosemirror-view` et de `@floating-ui/dom`.

2. `.dependency-cruiser.cjs` (fichier protégé) : patch ci-dessous, vérifié par `git apply --check` sur `bd6f809` (objet `3762a9e`). Il ajoute `glisser` aux modules exclus de `web-src-liste-blanche`, élargit `web-edition-liste-blanche` aux quatre paquets Tiptap de la spec (pas à `@floating-ui/dom`), et ajoute quatre règles : `dnd-kit-confine` (F-006-AC32), `web-glisser-liste-blanche`, `web-glisser-par-son-interface` et `web-destination-pure` (F-006-AC4). Si F-005 est fusionnée avant, la ligne `@tiptap/(…)` de `web-edition-liste-blanche` est à fusionner à la main avec ses ajouts (`@tiptap/suggestion`, `@floating-ui/dom`).

```diff
diff --git a/.dependency-cruiser.cjs b/.dependency-cruiser.cjs
index 3762a9e..8e3eb93 100644
--- a/.dependency-cruiser.cjs
+++ b/.dependency-cruiser.cjs
@@ -298,11 +298,11 @@ module.exports = {
       name: "web-src-liste-blanche",
       severity: "error",
       comment:
-        "ADR-0007, F-003-AC27, F-010, F-013 : hors persistance, espace, navigation, identifiants, édition, page, compte et synchronisation, le code d'apps/web n'importe que src/ (persistance et identifiants exceptés), les exports de @notionlike/document, react et react-dom : ni yjs, ni y-indexeddb, ni dépendance de test, ni module de Node.",
+        "ADR-0007, F-003-AC27, F-010, F-013, F-006 : hors persistance, espace, navigation, identifiants, édition, page, compte, synchronisation et glisser-déposer, le code d'apps/web n'importe que src/ (persistance et identifiants exceptés), les exports de @notionlike/document, react et react-dom : ni yjs, ni y-indexeddb, ni dépendance de test, ni module de Node.",
       from: {
         path: "^apps/web/src/",
         pathNot:
-          "^apps/web/src/(persistance|espace|navigation|identifiants|edition|page|compte|synchronisation)/",
+          "^apps/web/src/(persistance|espace|navigation|identifiants|edition|page|compte|synchronisation|glisser)/",
       },
       to: {
         pathNot: [
@@ -391,7 +391,7 @@ module.exports = {
       name: "web-edition-liste-blanche",
       severity: "error",
       comment:
-        "F-003-AC27 : le module d'édition n'importe que lui-même, le composant de présentation de l'édition, les textes de l'interface, react, yjs et les paquets Tiptap qu'il emploie.",
+        "F-003-AC27, F-006-AC32 : le module d'édition n'importe que lui-même, le composant de présentation de l'édition, les textes de l'interface, react, yjs et les paquets Tiptap qu'il emploie, poignée de bloc (drag-handle, drag-handle-react, node-range) et curseur de dépôt (@tiptap/extensions) compris ; ni @floating-ui/dom, ni @dnd-kit/*.",
       from: { path: "^apps/web/src/edition/" },
       to: {
         pathNot: [
@@ -399,11 +399,53 @@ module.exports = {
           "^apps/web/src/interface/composants/Edition\\.tsx$",
           "^apps/web/src/interface/messages\\.ts$",
           "(^|/)node_modules/(react|yjs)/",
-          "(^|/)node_modules/@tiptap/(core|pm|react|extension-(bold|collaboration|document|heading|italic|link|list|paragraph|text))/",
+          "(^|/)node_modules/@tiptap/(core|pm|react|extensions|extension-(bold|collaboration|document|drag-handle|drag-handle-react|heading|italic|link|list|node-range|paragraph|text))/",
+        ],
+      },
+    },
+    // F-006-AC32, par paquet. Deux expressions par cible, comme pour better-auth : le fichier installé
+    // et le nom tel qu'il est écrit, gardé quand le paquet n'est pas installé chez l'importateur.
+    {
+      name: "dnd-kit-confine",
+      severity: "error",
+      comment:
+        "F-006-AC32, H6 : la bibliothèque de glisser-déposer (tout paquet @dnd-kit/*) n'est importée que par le module de glisser-déposer d'apps/web (src/glisser/) : ni par un autre fichier d'apps/web (tests compris), ni par un paquet, ni par le serveur.",
+      from: { pathNot: "^apps/web/src/glisser/" },
+      to: { path: ["(^|/)node_modules/@dnd-kit/", "^@dnd-kit/"] },
+    },
+    {
+      name: "web-glisser-liste-blanche",
+      severity: "error",
+      comment:
+        "F-006-AC32, ADR-0015 : le module de glisser-déposer n'importe que lui-même, react et les trois paquets de l'ancienne famille dnd-kit (core, sortable, utilities) : ni react-dom, ni le document, ni l'interface, ni bibliothèque d'animation.",
+      from: { path: "^apps/web/src/glisser/" },
+      to: {
+        pathNot: [
+          "^apps/web/src/glisser/",
+          "(^|/)node_modules/react/",
+          "(^|/)node_modules/@dnd-kit/(core|sortable|utilities)/",
         ],
       },
     },
     {
+      name: "web-glisser-par-son-interface",
+      severity: "error",
+      comment:
+        "F-006-AC32 : hors du module de glisser-déposer et de ses tests (test/glisser/), seul son index.ts est importable ; c'est l'interface qui n'expose aucun type de dnd-kit.",
+      from: { path: "^apps/web/", pathNot: "^apps/web/(src|test)/glisser/" },
+      to: { path: "^apps/web/src/glisser/", pathNot: "^apps/web/src/glisser/index\\.ts$" },
+    },
+    {
+      name: "web-destination-pure",
+      severity: "error",
+      comment:
+        "F-006-AC4 : le calcul de la destination d'un déplacement de page est sans DOM ni bibliothèque ; il n'importe que les exports de @notionlike/document et les parcours purs de l'arborescence (interface/pages.ts).",
+      from: { path: "^apps/web/src/interface/destination-de-page\\.ts$" },
+      to: {
+        pathNot: ["^packages/document/src/index\\.ts$", "^apps/web/src/interface/pages\\.ts$"],
+      },
+    },
+    {
       name: "web-page-liste-blanche",
       severity: "error",
       comment:
```

3. `apps/web/vitest.config.ts` : aucune modification. Aucun nouveau paquet de workspace.

## Note de fin (2026-10-16, après le code)

Code de F-006 décrit par `ARCHITECTURE.md` : `cfe7e71` (dépendances), `f9a5d63` (contrats, commit du dev, texte de la section précédente appliqué tel quel), `6869a82` (pages), `4adbe79` (blocs), `b45d0cc` (bout en bout), `5d661e3` (poignées), `eb01a5f` (mémoire). Écarts avec la note :

- **F-006-AC14, poignée au bloc du curseur** : faite comme proposé. `usePoigneeAuCurseur` (`edition/poignee.ts`) mesure le haut du bloc du curseur à chaque transaction ; `PoigneeDuCurseur` (`Edition.tsx`) est rendue tant que l'éditeur a le focus, qu'il est modifiable et que la poignée de Tiptap ne montre aucun bloc (`onNodeChange`). Elle ne se glisse pas ; depuis `3135f66`, activée, elle sélectionne tout le bloc du curseur (sans rien écrire), la barre de blocs paraît et le focus va à « Monter le bloc » ; Échap le rend à l'éditeur. La mesure n'est faite que si les poignées sont rendues (ni en lecture seule, ni sur écran étroit). Prouvée sous jsdom (affichage, aucune mise à jour Yjs) ; l'alternance avec la poignée au survol n'est vue qu'au bout en bout. Le même fichier tient le drapeau du geste de la poignée que lit `depot.ts`.
- **Pas de poignée sur écran étroit ni sous pointeur imprécis** (`5d661e3`, trouvé par `e2e/largeurs.spec.ts`) : `ZonePrincipale` reçoit `poignees={!tiroir.etroit}` et l'éditeur ne rend aucune poignée quand c'est faux ; au-dessus du seuil, la feuille ne les montre que sous pointeur fin (`hidden etroit:pointer-fine:inline-flex`). Le bloc s'y déplace par la barre de blocs et le clavier.
- **Destination sans aucun import** : `destination-de-page.ts` décrit par leur forme les types de l'arborescence et de l'emplacement (`PageDeLArbre`, `Emplacement`) au lieu de les importer de `@notionlike/document`, pour ne pas allonger les listes fermées des importateurs du paquet. Le contrat `web-destination-pure` reste plus large que le fichier. Il exporte aussi `placeApres` (mère, rang et nombre de sœurs après un déplacement), lu par l'annonce de F-006-AC12.
- **Dépli de la seule nouvelle mère** : `deplacerLaPage` (`Application.tsx`) appelle `deplier([ou.parent])` sans ses ancêtres. Ils sont déjà dépliés, puisque la nouvelle mère était visible : cible du geste, sœur précédente, ou mère de la mère de la page déplacée.
- **Action** : nommée `deplacer(id, ou, auClavier)` dans `ActionsBarre`, et non `deplacerPage(id, destination)` ; elle reçoit l'`Emplacement` déjà calculé.
- **Interface du module `glisser/`** : un type de plus, `TouchesDuGlisser` (valeurs de `code` des touches qui saisissent, déposent et abandonnent, déclarées par `raccourcis.ts` dans `TOUCHES_DU_GLISSER`) ; distance d'activation de 4 pixels ; détection de la cible `pointerWithin` au pointeur et `closestCenter` au clavier ; la région d'annonces et les instructions de la bibliothèque sont rendues après `CadreDeBarre`, hors de la liste.
- **Région d'annonce** : la région `role="status"` de F-006-AC12 est dans la tête de `CadreDeBarre` (propriété `annonce`). `MenuActions` saute aux flèches les entrées désactivées.
- **Preuve du geste** : le geste au pointeur est aussi éprouvé sous jsdom, par le capteur pointeur de dnd-kit et des rectangles bouchonnés dans le fichier de test (F-006-AC1 à AC3, AC5 à AC8, AC29) ; le bout en bout reste la seule preuve dans un navigateur réel.
- **Correctifs après le premier passage des gates** (`7f42f60`, `3135f66`, mémoire `994f1a2`) :
  - fichiers : le refus passe par `handleDOMEvents` (`dragenter`, `dragover`, `drop`), qui empêche l'action par défaut dès le survol (type `Files`) et que ProseMirror appelle aussi en lecture seule ; `handleDrop` ne traite plus que le geste de la poignée ;
  - raccourci sans destination (F-006-AC11, AC18, AC28) : il ne déplace rien et est annoncé « <commande> : indisponible. », avec la raison pour une page. Pour une page, par une huitième action obligatoire de la barre, `annoncer(texte)`, dans la région d'état de la barre ; pour un bloc, par `surIndisponible` des options du dépôt, dans une région d'état de l'éditeur (`annonce` de `ZoneDEdition`), rendue seulement tant que le focus est dans la zone d'édition.
