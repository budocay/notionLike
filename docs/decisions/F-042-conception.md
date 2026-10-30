# F-042 — Conception : précision du glisser-déposer des blocs

Date : 2026-10-30
Spec : `specs/F-042.md`, validée, lue sur la branche `F-042` (base `0018bcf`). ADR : amendement F-042 de l'ADR-0015 (proposé). Code lu : `apps/web/src/edition/{depot,deplacement-de-bloc,poignee,schema,EditeurDePage}.ts(x)`, `interface/composants/edition.classes.ts`, `apps/web/test/edition/aides-edition.tsx`, `apps/web/test/structure-edition.test.ts`. Bibliothèque lue dans `node_modules` : `@tiptap/extension-drag-handle` 3.31.4 (source distribuée), la version du verrou.

`ARCHITECTURE.md` décrit `main` et n'est pas touché ici : il sera aligné sur le code livré.

## Ce que la poignée de Tiptap installée expose (lu, pas supposé)

- Options : `onNodeChange({ node, editor, pos })`, `onElementDragStart(e: DragEvent)`, `onElementDragEnd(e: DragEvent)`, `locked`, `nested`, `computePositionConfig`, `getReferencedVirtualElement`, `dragImageProperties`.
- Commandes : `lockDragHandle`, `unlockDragHandle`, `toggleDragHandle`.
- Vue du greffon : met `element.draggable = true` à chaque mise à jour, sauf quand la poignée est verrouillée (`draggable = false`) ; écoute `dragstart` et `dragend` sur la poignée, `drop` sur le document ; `mousemove` (pas `pointermove`) montre et place la poignée ; `keydown` et `mouseleave` la cachent ; ces trois écoutes ne font rien quand la poignée est verrouillée. `dragHandler` pose une `NodeSelection` ou une `NodeRangeSelection` et `view.dragging`.
- Conséquence : la poignée sait se tenir immobile et non glissable pendant un geste (`lockDragHandle`), et `onNodeChange` donne la position du bloc survolé. Rien d'autre n'est nécessaire : **aucune veille web pour Tiptap**.

## Approche

- **Mesure d'abord (F-042-AC1, AC2, H2).** Le premier bloc n'écrit que le test de mesure. Sans écart mesuré, la feature s'arrête et rend la mesure au dev.
- **Une fonction pure de cible** (`edition/cible-de-depot.ts`), entrée : les bords verticaux affichés des blocs de premier niveau et l'ordonnée du pointeur ; sortie : l'intervalle (0 à N). Le repère et le lâcher lisent la même valeur, calculée une fois par image (F-042-AC4) ; ni `posAtCoords` ni `dropPoint`.
- **Geste maison par événements de pointeur** (H4 b), un seul pour la souris et le doigt : la poignée de Tiptap reste pour son placement au survol, mais n'est plus glissable pendant le geste ; le glisser natif du navigateur n'est plus utilisé pour les blocs.
- **Repère maison** (H3 a), composant de présentation ; `Dropcursor` reste pour le contenu venu d'ailleurs (F-006-AC21).
- `deplacerLeBloc(editeur, de, vers)` inchangée (F-042-AC13) : le geste convertit l'intervalle en indice d'arrivée (`vers = intervalle` si `intervalle <= de`, sinon `intervalle - 1`) ; les intervalles `de` et `de + 1` sont la même place (F-042-AC9) : aucun repère, aucune écriture.
- Aucune dépendance, aucun paquet, aucun changement de format ni d'export de `@notionlike/document`.

## Geste de la poignée

| Moment                 | Effet                                                                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pointerdown`          | refusé si l'éditeur n'est pas modifiable ou si la sélection couvre plusieurs blocs (F-042-AC9) ; origine : le bloc de la poignée de Tiptap (position de `onNodeChange`) ou le bloc du curseur (poignée du curseur) ; `lockDragHandle()`, `setPointerCapture` |
| `pointermove`          | sous 4 pixels (`DISTANCE_D_ACTIVATION`) : rien (F-042-AC6). Au-delà : geste démarré ; à chaque image (`requestAnimationFrame`), lecture des bords (`view.nodeDOM(pos).getBoundingClientRect()` de chaque bloc de premier niveau), cible, repère, défilement  |
| `pointerup`            | geste non démarré : clic (sélection du bloc, F-006-AC14). Démarré : hors de la zone de défilement, abandon ; sinon `deplacerLeBloc` et annonce de la phrase de position du clavier (F-042-AC11) ; `preventDefault`                                           |
| Échap, `pointercancel` | abandon : repère retiré, rien d'écrit, rien d'annoncé (F-042-AC8). Échap est pris en capture pendant le geste pour ne pas atteindre l'éditeur                                                                                                                |
| Fin                    | `unlockDragHandle()`, libération du pointeur, arrêt du défilement                                                                                                                                                                                            |

- **Parade au glisser natif** : la poignée verrouillée n'est plus `draggable` ; en défense, un écouteur `dragstart` en capture sur l'enveloppe de l'éditeur annule tout glisser natif né de la poignée. `depot.ts` garde `handleDrop` pour avaler un lâcher de la poignée qui passerait quand même.
- **Défilement (F-042-AC10)** : bande de 48 pixels en haut et en bas de l'ancêtre défilant le plus proche, 20 pixels par image au plus ; coupé sous `prefers-reduced-motion` selon la règle de la spec. Constantes dans `cible-de-depot.ts`.
- **Au doigt (F-042-AC7)** : la poignée du curseur (`PoigneeDuCurseur`) est montrée sous `pointer: coarse` ou en fenêtre étroite, cible de 44 pixels au moins, `touch-action: none` ; même geste.

## Fichiers (`apps/web/src`)

| Fichier                                                  | Changement                                                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `edition/cible-de-depot.ts` (nouveau, pur)               | `cibleDeDepot(bords, y)`, `indiceDArrivee(de, intervalle)`, `ordonneeDuRepere(bords, intervalle)`, `pasDeDefilement(...)`, constantes ; n'importe rien |
| `edition/geste-de-la-poignee.ts` (nouveau)               | le geste ci-dessus, branché par `EditeurDePage.tsx`                                                                                                    |
| `edition/depot.ts`                                       | retrait de `lacherLeBloc`, `intervalleDe`, `posAtCoords`, `dropPoint` ; refus des fichiers et clavier inchangés                                        |
| `edition/EditeurDePage.tsx`, `poignee.ts`                | branchement du geste, position de `onNodeChange`, poignée du curseur au doigt                                                                          |
| `interface/composants/Edition.tsx`, `edition.classes.ts` | `RepereDeDepot` (trait de 2 pixels, `transform`, jetons de F-004) ; classes de la poignée au doigt                                                     |
| `edition/schema.ts`                                      | `Dropcursor` gardé (contenu externe)                                                                                                                   |

**Couture (F-042-AC13)** : un test énumère les appelants de `deplacerLeBloc` dans `apps/web/src` (attendus : le geste, le clavier, la barre de blocs) et vérifie qu'aucune source d'`edition/` n'appelle `posAtCoords` ni `dropPoint`.

**Aide de test** : `apps/web/test/edition/aides-edition.tsx` est réécrite (pointeur, bords simulés des blocs) en gardant la signature de `glisserLeBlocParSaPoignee(de, intervalle)` et son résultat (vrai quand le lâcher est pris, par le `preventDefault` du `pointerup`), pour que ses appelants de F-006 et F-033 passent sans modification.

## Plan par blocs (agent-frontend ; un commit par bloc)

| Bloc | Contenu                                                                                                                                                                 | Preuves                          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 1    | Test de mesure de bout en bout (blocs et barre latérale), lancé sur `a64bf5f` ; mesures remises à l'orchestrateur pour `MEMORY/features/F-042.md`. **Arrêt sans écart** | AC1, AC2                         |
| 2    | `cible-de-depot.ts` et ses tests                                                                                                                                        | AC3, AC9 (même place)            |
| 3    | Geste à la souris, repère, `depot.ts`, aide de test, tests de la liste fermée, couture                                                                                  | AC4 à AC6, AC8, AC9, AC11 à AC13 |
| 4    | Doigt et défilement                                                                                                                                                     | AC7, AC10                        |
| 5    | Bout en bout ; `e2e/glisser-deposer.spec.ts` passé au pointeur                                                                                                          | AC14                             |

## Tests livrés modifiés : liste confrontée à H8

| Fichier                                                                                               | Changement                                                   | Dans H8                          |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------- |
| `apps/web/test/edition/deplacement-de-bloc.test.tsx` (F-006)                                          | tests de F-006-AC15, AC16 (l. 173 : `empeche` reste vrai)    | oui                              |
| même fichier, l. 198 à 207 (abandon par lâcher sur `body` puis `dragend`)                             | devient un abandon par Échap ou `pointercancel`              | **à confirmer : écart probable** |
| `apps/web/test/structure-edition.test.ts`                                                             | deux fichiers nouveaux dans la liste exacte d'`src/edition/` | oui                              |
| `apps/web/test/edition/coutures-selection.test.tsx`                                                   | `LECTEURS` si le geste lit la sélection                      | oui                              |
| `e2e/glisser-deposer.spec.ts`                                                                         | gestes au pointeur                                           | oui                              |
| `composants.test.tsx`, `styles.test.ts`                                                               | si les classes de la poignée changent                        | oui                              |
| `coutures-coloration.test.tsx` l. 270 (F-033), `convergence-deplacement.test.tsx` (F-006-AC22 à AC26) | aucun si l'aide garde sa signature ; sinon écart             | **risque**                       |

Retouche de spec proposée : nommer l'abandon de l. 198 dans H8.

## Règle de dépendances proposée (texte exact, au dev)

À ajouter dans `forbidden` de `.dependency-cruiser.cjs`, après `web-destination-pure` :

```js
    {
      name: "web-cible-de-depot-pure",
      severity: "error",
      comment:
        "F-042-AC3 : la cible de dépôt d'un bloc est une fonction pure du module d'édition, sans DOM ni bibliothèque ; elle n'importe rien.",
      from: { path: "^apps/web/src/edition/cible-de-depot\\.ts$" },
      to: { pathNot: "^apps/web/src/edition/cible-de-depot\\.ts$" },
    },
```

## Veille à demander (agent-veille, avant le bloc 3)

- Navigateurs : un `dragstart` annulé, ou une poignée rendue non `draggable` dès le `pointerdown`, laisse-t-il la capture du pointeur et les `pointermove` continuer (Chromium, Firefox, WebKit) ?
- Playwright : moyen de dérouler un glisser tactile (contexte `hasTouch`, `Input.dispatchTouchEvent` de CDP, Chromium seulement ?) pour F-042-AC14.
- Safari iOS : `touch-action: none` et `-webkit-touch-callout: none` sur la poignée.

## Ordre et conflits

- Après F-040 puis F-041 (H7) ; la branche intègre `main` après chaque fusion. Fichiers communs : `Edition.tsx`, `edition.classes.ts`, `messages.ts`, `structure-edition.test.ts`, `EditeurDePage.tsx`, `schema.ts` (et F-015 pour `Edition.tsx`). Aucun fichier commun avec F-044, F-045.
- Fichier protégé pour le dev : `.dependency-cruiser.cjs` (règle ci-dessus). Aucun fichier partagé.

## Risques

- Le verrou de la poignée ne suffit pas sur un navigateur (glisser natif démarré quand même) : la parade en capture et `handleDrop` gardé limitent l'effet ; la veille tranche.
- Lire les bords de tous les blocs à chaque image coûte sur une longue page : une lecture par image, pas par `pointermove`.
- Sous jsdom, la géométrie n'existe pas (F-006 H11) : l'alignement, le doigt et le défilement ne se prouvent qu'en bout en bout, hors CI (D-003).
