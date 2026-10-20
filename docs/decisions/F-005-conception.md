# F-005 — Conception (mode rapide) : bloc code et commandes slash

Date : 2026-10-16
Spec : `specs/F-005.md`, validée. Base : `main` à `f6871c3`, plus la branche `F-006` (`422a1ed`, glisser-déposer, fusionnée avant le premier commit de code de F-005), lue en lecture seule. ADR : ADR-0018 (bloc code du document de page, accepté le 2026-10-19 sur décision du dev, après correction des écarts ; voir l'addendum en fin de note). Veille : `MEMORY/VEILLE.md`, sections « Tiptap 3.31.4 — bloc code », « Tiptap 3.31.4 — @tiptap/suggestion et menu slash », « Tiptap 3.31.4 et Yjs — changement de type concurrent d'une saisie » et « … portée de l'historique d'annulation » (2026-10-08). Lu en plus : tarballs `@tiptap/suggestion@3.31.4` et `@tiptap/extension-code-block@3.31.4` (`src/`), `prosemirror-transform@1.12.2` installé.

Note courte, écrite avant le code. `ARCHITECTURE.md` décrit `main` et n'est pas touché ici : il sera aligné après le code.

## Version 3 et ligne de la table

Version prise en charge par `main` : 2 (F-028). F-005 prend **3** (F-005 H1, AC23). Ligne ajoutée à `TABLE_DES_VERSIONS_PAGE` : celle de la ligne 2, plus `codeBlock: ["language"]` (texte exact dans l'ADR-0018). Rien d'autre ne change dans `packages/document` : ni forme stockée, ni lecture, ni export (F-005-AC32). L'élévation passe déjà par tous les chemins : `filterTransaction` de `marquesDeLEditeur` (`edition/marques.ts`) appelle `preparerLaVersion` pour toute transaction locale qui inscrit un nœud, et `versionExigee` (`page/session-page.ts`) trouve `codeBlock` dans la ligne 3 par son nom. Barre, menu slash, règle de saisie, collage, dépôt et déplacement de F-006 y passent sans code nouveau ; les tests de F-005-AC25 le prouvent par chemin.

## Bloc code (`edition/bloc-code.ts`, `edition/langages.ts`)

- `langages.ts`, sans import : `LANGAGES` (les dix identifiants de H5, dans cet ordre) et `langageAdmis(valeur: unknown): Langage | null`, seule fonction qui admet une valeur.
- `bloc-code.ts` : `CodeBlock.extend(...)` de `@tiptap/extension-code-block`, configurée `exitOnTripleEnter: false` (AC3), `enableTabIndentation: false` (défaut, AC5), et :
  - `renderHTML` réécrit : `pre` > `code`, classe `language-<id>` seulement si `langageAdmis` rend un identifiant, aucun autre attribut dérivé du langage (AC8, AC9) ;
  - attribut `language` : `parseHTML` rend toujours `null` : rien n'est tiré d'un HTML collé ou déposé (AC7) ; la liaison Yjs ne passe pas par `parseHTML`, le langage d'un document reçu est donc gardé tel quel dans le fragment (AC9) ;
  - raccourcis : ceux de l'extension sauf `Mod-Alt-c`, retiré (AC11 : aucune voie d'activation qui contourne la disponibilité ; F-004-AC31 : pas de combinaison hors de la déclaration des raccourcis) ; Retour arrière, Entrée, Flèche haut et Flèche bas gardés (AC4, H6) ; Mod+Entrée vient du noyau ;
  - greffon de collage `codeBlockVSCodeHandler` remplacé (son `JSON.parse` lève sur des données malformées) : données `vscode-editor-data` qui sont un objet, et texte non vide → bloc code **sans langage** ; JSON invalide ou non-objet → `false`, le collage suit le chemin du texte (AC36) ; rien dans un bloc code (AC7 : ProseMirror y colle du texte brut).
- **Garde des langages**, un `appendTransaction` dans le même fichier, seule autorité à l'écriture (AC35) : pour une transaction locale (pas d'origine `y-sync$`, même test que `estAppliqueeDepuisYjs` de `marques.ts`), chaque `codeBlock` **inséré** par un pas (début du nœud dans une étendue insérée, ce qui exclut le bloc où l'on tape) et chaque `AttrStep` sur `language` dont la valeur n'est pas admise est réécrit à `language: null`. Elle couvre la règle de saisie (qui accepte toute suite de minuscules), une commande, le dépôt et le déplacement de F-006 (`deplacerLeBloc` réinsère le nœud avec ses attributs). Comme le greffon des marques, elle passe avant que la liaison n'écrive : une seule mise à jour Yjs. Un document reçu n'est jamais réécrit (AC9).
- Changement de type **depuis** un bloc code vers paragraphe ou titre : par `tr.setNodeMarkup`, jamais `setNode`/`setBlockType`. Constaté à la lecture : `setBlockType` de `prosemirror-transform@1.12.2` (`clearIncompatible`, lignes 953 à 967 et 1098 à 1109 du `dist`) remplace chaque saut de ligne par une espace quand la cible n'est pas `whitespace: "pre"` et que le schéma n'a pas de `linebreakReplacement` ; AC1 exige de les garder. Vers une liste : `setNodeMarkup` vers paragraphe, puis la bascule de liste. Vers le bloc code : `setCodeBlock()` (marques retirées par le schéma, AC29).
- Schéma : `BlocCode` et la garde ajoutés à `extensionsDeLEditeur` (`schema.ts`). Aucune autre extension de Tiptap.

## Liste des commandes, disponibilité, barre

- **Liste des commandes unique** : `COMMANDES_DE_TYPE` de `types-de-bloc.ts` devient `LISTE_DES_COMMANDES`, sept entrées dans l'ordre du vocabulaire, chacune `{ nom, repere, motsCles, type }` ; `TypeDeBloc` reçoit `{ forme: "code" }`. La barre (`commandesDe` d'`EditeurDePage.tsx`) et le menu slash la lisent tous deux, aucune autre liste (AC21). Mots-clés proposés : Paragraphe `texte`, Titre N `hN`, Liste à puces `puces`, Liste numérotée `numéros`, Bloc code `code`, `pre` ; aucun ne contient `tit` (scénario d'AC34).
- **Filtre** : `edition/filtre-des-commandes.ts`, sans import, fonction pure `commandesFiltrees(commandes, saisie)` : libellé ou mot-clé qui contient la saisie, comparés après `normalize("NFD")`, retrait des diacritiques et `toLowerCase()`, ordre d'origine (AC14).
- **Disponibilité** (AC11) : une seule fonction construit la chaîne de commandes d'un type (`chaineDuType`), appliquée soit à `editeur.chain()`, soit à `editeur.can().chain()`. Une commande est disponible si la chaîne à blanc rend vrai ; elle est rejugée juste avant l'application. Pour « Bloc code », la chaîne ne sort pas des listes : `setCodeBlock()` seul, faux dans le premier paragraphe d'un élément (veille, piège de `setNode`), vrai à partir du second. Barre : `indisponible: true` (déjà rendu `aria-disabled` par `BarreDeBlocs`). Menu : non listée.
- **Barre** (H11) : `barre.ts` ne s'affiche plus dans un bloc vide (`appelee` perd `dansUnBlocVide`), lit le langage du bloc code courant. Sélecteur « Langage du bloc code » : un `select` natif rendu par `interface/composants/Edition.tsx`, options « Texte brut » puis `LANGAGES`, valeur affichée `langageAdmis(attrs.language) ?? ""` ; le choix écrit `updateAttributes("codeBlock", { language })` (AC6). Invite `INVITE_DU_BLOC_VIDE` = « Écris, ou tape / pour insérer un bloc » (F-003-AC40) ; F-003-AC43 passe par le menu slash pour un bloc vide.

## Menu slash (`edition/menu-slash.ts`)

- **`@tiptap/suggestion` 3.31.4** (H9, retenu par la spec et confirmé ici) : `char: "/"`, `allowedPrefixes: [" "]` et début de bloc (AC12, AC13), `allow` faux dans un bloc code (AC5, AC13), `items` = `commandesFiltrees` des commandes **disponibles**, `command` = `chain().deleteRange(range)` suivi de `chaineDuType`, une transaction et une mise à jour Yjs (AC16, H10), rejugée par `can()` (sinon fermeture, rien d'écrit). Échap : traité par l'utilitaire, qui retient l'étendue écartée (`dismissedRange`) : le menu ne se rouvre pas pour ce `/` (AC17).
- Extension de priorité **101**, comme la mention de Tiptap : son `handleKeyDown` passe avant les raccourcis du noyau (Entrée) et avant le dépôt de F-006 (Alt+Maj+Flèches). `onKeyDown` ne prend que Flèche haut, Flèche bas et Entrée **sans modificateur** ; Entrée avec « Aucune commande » rend `false` : l'éditeur coupe le bloc et le menu se ferme (AC18).
- **Placement** : `props.mount(element, { onPosition })` de l'utilitaire, qui calcule par `@floating-ui/dom` (`computePosition`, `autoUpdate`, référence virtuelle sur le curseur) et laisse l'application poser `x`, `y` dans l'état React : aucun style écrit par la bibliothèque. Configuration : `placement: "bottom-start"`, `flip` (défaut), `floatingUi: { strategy: "fixed", middleware: [shift({ padding: 8 })] }` : `shift` est le seul import direct de `@floating-ui/dom`, pour garder le menu entier dans la fenêtre en largeur (AC34, écrans de 360 px). `dismissOnOutsideClick` (défaut) ferme au clic hors du menu et de l'éditeur (AC17). Pas de nouveau calcul dans `placement.ts`.
- **État et accessibilité** : l'état du menu (ouvert, commandes listées, commande active) vit dans React, alimenté par `render()` (`onStart`, `onUpdate`, `onExit`, `onKeyDown`), jamais dans le document (AC20). `MenuDeCommandes` (liste d'options « Commandes de bloc ») dans `interface/composants/Edition.tsx` ; `aria-controls` et `aria-activedescendant` posés sur l'élément de l'éditeur tant que le menu est ouvert, retirés à la fermeture ; le nombre de commandes ou « Aucune commande » dans la région d'état de la zone d'édition (la même que F-006) (AC22, H12).

## Changement de type concurrent d'une saisie

Rien à concevoir : la liaison remplace l'élément (H8). Le constat est figé par le test d'AC31 (« abc|zzz », Titre 1 puis Bloc code, « X » au début, au milieu, à la fin). Même nature que le déplacement de F-006 (ADR-0015).

## Fichiers d'`apps/web/src/edition/` et croisement avec F-006

| Fichier                                                                   | F-005                                                            | F-006                                                                |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| `schema.ts`                                                               | ajoute `BlocCode`, la garde des langages, le menu slash          | a ajouté `Dropcursor`, `depotDeLEditeur` et le paramètre `depot`     |
| `EditeurDePage.tsx`                                                       | commandes tirées de la liste, sélecteur, menu, annonce du filtre | poignées, commandes de déplacement, région d'état, `useLiensDuDepot` |
| `barre.ts`                                                                | plus d'affichage dans un bloc vide, langage courant              | a ajouté `focusDedans`                                               |
| `types-de-bloc.ts`                                                        | liste des commandes, forme `code`, `chaineDuType`, disponibilité | non touché                                                           |
| `bloc-code.ts`, `langages.ts`, `menu-slash.ts`, `filtre-des-commandes.ts` | nouveaux                                                         | —                                                                    |
| `depot.ts`, `deplacement-de-bloc.ts`, `poignee.ts`                        | non touchés : la garde des langages et l'élévation les couvrent  | nouveaux                                                             |
| `invite.ts`, `placement.ts`, `marques.ts`                                 | non touchés (le texte d'invite vient de `messages.ts`)           | non touchés                                                          |

Hors d'`edition/` : `interface/composants/Edition.tsx` et `edition.classes.ts` (menu, sélecteur, `pre`/`code` en police à chasse fixe, jeton de F-004 ou ajout demandé, H15), `interface/messages.ts` (textes), `packages/document/src/format-page.ts` (ligne 3). Les deux features modifient `schema.ts`, `EditeurDePage.tsx`, `barre.ts`, `Edition.tsx`, `messages.ts` : F-005 part de `main` après la fusion de F-006 (fusionner `main` dans la branche `F-005` avant le premier commit de code), sans quoi ces cinq fichiers sont en conflit.

## Prouvé seulement en navigateur (F-005-AC34, H14)

- Position du menu (près du curseur, entier dans la fenêtre, retournement) : jsdom n'a ni mise en page ni `ResizeObserver`.
- Frappe réelle du `/` (saisie du navigateur, composition, clavier où `/` demande Maj ou une touche morte) et rendu du `pre` en chasse fixe.
- Après « Paragraphe » ou un titre sur un bloc code, les sauts de ligne gardés dans le texte : leur conservation à la conversion se prouve sous Vitest ; leur affichage (la feuille de ProseMirror pose `white-space: pre-wrap`, ils s'afficheraient comme des retours à la ligne et non comme les espaces que dit AC1) et leur tenue quand on tape à côté (relecture du DOM par ProseMirror) ne se voient qu'en navigateur. Un écart avec AC1 se remonte au dev, il ne se corrige pas en silence.
- Le tout sous Vitest reste à constater au premier test (la veille a exécuté des scripts Node avec jsdom).

## Prérequis à la charge du dev (bloc 0)

Après la fusion de F-006 dans `main`, puis de `main` dans `F-005` :

```bash
pnpm --filter @notionlike/web add --save-exact @tiptap/extension-code-block@3.31.4 @tiptap/suggestion@3.31.4 @floating-ui/dom@1.8.0
```

Constaté sur deux copies jetables (`main` `f6871c3` et `F-006` `422a1ed`) : `apps/web/package.json` reçoit les trois lignes, le verrou ne résout qu'une `@floating-ui/dom@1.8.0`, `prosemirror-view@1.42.6`, `yjs@13.6.33` seul. Puis le diff de `.dependency-cruiser.cjs` ci-dessous (forme « après F-006 »), et `pnpm contrats`.

Le diff élargit `web-edition-liste-blanche` (`suggestion`, `extension-code-block`, `@floating-ui/dom`) et ajoute `suggestion-et-positionnement-confines` (ni `@tiptap/suggestion` ni `@floating-ui/*` hors de `apps/web/src/edition/`, tests compris : les tests du menu passent par l'éditeur, pas par l'utilitaire). Vérifié sur chaque copie, paquets installés : `pnpm contrats` sans violation ; sondes posées puis retirées : un fichier d'`edition/` qui importe les trois paquets passe ; refusés : `@floating-ui/core` depuis `edition/` (`web-edition-liste-blanche`), `@floating-ui/dom` depuis `interface/` (nouvelle règle et `web-src-liste-blanche`), `@tiptap/suggestion` depuis `test/edition/` (nouvelle règle), `@floating-ui/dom` depuis `packages/document/src/` (nouvelle règle et `document-yjs-seulement`). `prettier --check` vert.

Forme après F-006 (s'applique sur `F-006` `422a1ed`, donc sur `main` une fois F-006 fusionnée) :

```diff
--- a/.dependency-cruiser.cjs
+++ b/.dependency-cruiser.cjs
@@ -386,6 +386,21 @@
         "F-003-AC27 : Tiptap, ProseMirror et leur liaison Yjs ne sont importés que par le module d'édition (src/edition/) et l'aide de ses tests (test/edition/).",
       from: { path: "^(apps|packages)/", pathNot: "^apps/web/(src|test)/edition/" },
       to: { path: "(^|/)node_modules/(@tiptap|prosemirror-[^/]+|y-prosemirror)/" },
+    },
+    // F-005-AC33, par paquet. Deux expressions par cible, comme pour better-auth : le fichier installé
+    // et le nom tel qu'il est écrit, gardé quand le paquet n'est pas installé chez l'importateur.
+    {
+      name: "suggestion-et-positionnement-confines",
+      severity: "error",
+      comment:
+        "F-005-AC33, H9 : l'utilitaire de suggestion de Tiptap (@tiptap/suggestion) et la bibliothèque de positionnement (tout paquet @floating-ui/*) ne sont importés que par le module d'édition d'apps/web (src/edition/) : ni par ses tests, ni par un autre fichier d'apps/web, ni par un paquet, ni par le serveur.",
+      from: { pathNot: "^apps/web/src/edition/" },
+      to: {
+        path: [
+          "(^|/)node_modules/(@tiptap/suggestion|@floating-ui/[^/]+)/",
+          "^(@tiptap/suggestion|@floating-ui/[^/]+)(/|$)",
+        ],
+      },
     },
     {
       name: "web-edition-par-son-interface",
@@ -399,7 +414,7 @@
       name: "web-edition-liste-blanche",
       severity: "error",
       comment:
-        "F-003-AC27, F-006-AC32 : le module d'édition n'importe que lui-même, le composant de présentation de l'édition, les textes de l'interface, react, yjs et les paquets Tiptap qu'il emploie, poignée de bloc (drag-handle, drag-handle-react, node-range) et curseur de dépôt (@tiptap/extensions) compris ; ni @floating-ui/dom, ni @dnd-kit/*.",
+        "F-003-AC27, F-006-AC32, F-005-AC33 : le module d'édition n'importe que lui-même, le composant de présentation de l'édition, les textes de l'interface, react, yjs, les paquets Tiptap qu'il emploie, poignée de bloc (drag-handle, drag-handle-react, node-range), curseur de dépôt (@tiptap/extensions), bloc code (extension-code-block) et utilitaire de suggestion (suggestion) compris, et @floating-ui/dom (placement du menu slash) ; ni @floating-ui/core, ni @floating-ui/utils, ni @dnd-kit/*.",
       from: { path: "^apps/web/src/edition/" },
       to: {
         pathNot: [
@@ -407,7 +422,8 @@
           "^apps/web/src/interface/composants/Edition\\.tsx$",
           "^apps/web/src/interface/messages\\.ts$",
           "(^|/)node_modules/(react|yjs)/",
-          "(^|/)node_modules/@tiptap/(core|pm|react|extensions|extension-(bold|collaboration|document|drag-handle|drag-handle-react|heading|italic|link|list|node-range|paragraph|text))/",
+          "(^|/)node_modules/@tiptap/(core|pm|react|extensions|suggestion|extension-(bold|code-block|collaboration|document|drag-handle|drag-handle-react|heading|italic|link|list|node-range|paragraph|text))/",
+          "(^|/)node_modules/@floating-ui/dom/",
         ],
       },
     },
```

Forme sur la branche `F-005` telle qu'elle est (`main` `f6871c3`, sans F-006), vérifiée de même ; seules diffèrent les lignes de `web-edition-liste-blanche` :

```diff
--- a/.dependency-cruiser.cjs
+++ b/.dependency-cruiser.cjs
@@ -386,6 +386,21 @@
         "F-003-AC27 : Tiptap, ProseMirror et leur liaison Yjs ne sont importés que par le module d'édition (src/edition/) et l'aide de ses tests (test/edition/).",
       from: { path: "^(apps|packages)/", pathNot: "^apps/web/(src|test)/edition/" },
       to: { path: "(^|/)node_modules/(@tiptap|prosemirror-[^/]+|y-prosemirror)/" },
+    },
+    // F-005-AC33, par paquet. Deux expressions par cible, comme pour better-auth : le fichier installé
+    // et le nom tel qu'il est écrit, gardé quand le paquet n'est pas installé chez l'importateur.
+    {
+      name: "suggestion-et-positionnement-confines",
+      severity: "error",
+      comment:
+        "F-005-AC33, H9 : l'utilitaire de suggestion de Tiptap (@tiptap/suggestion) et la bibliothèque de positionnement (tout paquet @floating-ui/*) ne sont importés que par le module d'édition d'apps/web (src/edition/) : ni par ses tests, ni par un autre fichier d'apps/web, ni par un paquet, ni par le serveur.",
+      from: { pathNot: "^apps/web/src/edition/" },
+      to: {
+        path: [
+          "(^|/)node_modules/(@tiptap/suggestion|@floating-ui/[^/]+)/",
+          "^(@tiptap/suggestion|@floating-ui/[^/]+)(/|$)",
+        ],
+      },
     },
     {
       name: "web-edition-par-son-interface",
@@ -399,7 +414,7 @@
       name: "web-edition-liste-blanche",
       severity: "error",
       comment:
-        "F-003-AC27 : le module d'édition n'importe que lui-même, le composant de présentation de l'édition, les textes de l'interface, react, yjs et les paquets Tiptap qu'il emploie.",
+        "F-003-AC27, F-005-AC33 : le module d'édition n'importe que lui-même, le composant de présentation de l'édition, les textes de l'interface, react, yjs, les paquets Tiptap qu'il emploie, bloc code (extension-code-block) et utilitaire de suggestion (suggestion) compris, et @floating-ui/dom (placement du menu slash) ; ni @floating-ui/core, ni @floating-ui/utils.",
       from: { path: "^apps/web/src/edition/" },
       to: {
         pathNot: [
@@ -407,7 +422,8 @@
           "^apps/web/src/interface/composants/Edition\\.tsx$",
           "^apps/web/src/interface/messages\\.ts$",
           "(^|/)node_modules/(react|yjs)/",
-          "(^|/)node_modules/@tiptap/(core|pm|react|extension-(bold|collaboration|document|heading|italic|link|list|paragraph|text))/",
+          "(^|/)node_modules/@tiptap/(core|pm|react|suggestion|extension-(bold|code-block|collaboration|document|heading|italic|link|list|paragraph|text))/",
+          "(^|/)node_modules/@floating-ui/dom/",
         ],
       },
     },
```

Appliquée sur `main` puis fusionnée avec F-006, elle entre en conflit sur la ligne `@tiptap/(…)` et le commentaire : la résolution est la forme après F-006. Aucun `vitest.config.*` ni paquet nouveau.

## Addendum du 2026-10-19 : écarts au code

Écrit après le code d'agent-frontend (`ecdf155`, `8c7f719`, `5fa7491`, `c28fa74`), puis relu sur ses correctifs de revue (`60cef42`, `8a3bb99`), à la demande du gate d'architecture (`.agents/review/F-005/agent-architecte.md`, corrections 1 et 3), et après les décisions du dev du 2026-10-19 (`specs/F-005.md` retouchée au commit `c39e7c4` : AC1, AC6, AC11, AC18, AC21, H11, H13, H16). Là où il les contredit, il remplace les sections ci-dessus, gardées comme trace de la conception d'avant le code. Les raisons des écarts sont relevées dans `MEMORY/features/F-005.md` (« Décisions prises au code »). Aucune décision de l'ADR-0018 ne change.

### Disponibilité : une composition jouée sur des états successifs, pas `can().chain()`

Remplace le point « Disponibilité (AC11) » de « Liste des commandes, disponibilité, barre ».

- Il n'y a ni `chaineDuType` ni `editor.can().chain()`. `etapesDuType($from, type)` (`edition/types-de-bloc.ts`) rend la suite des étapes qui donnent ce type au bloc de cette position, chacune une fonction de `ChainedCommands` qui rend faux si le schéma la refuse : « Bloc code », une étape (jamais de sortie de liste, refusée dans le premier paragraphe d'un élément) ; une liste, paragraphe puis bascule de la liste ; un titre ou « Paragraphe », sortie de chaque liste qui entoure le bloc, puis le changement de type.
- `composer(editeur, type, retrait?)` joue ces étapes, précédées du retrait de la séquence du menu slash quand il y en a une, sur des états successifs : chaque étape part d'une transaction neuve de l'état courant, par un `CommandManager` créé sur cet état (`createChain(tr, true)`), et l'état suivant est un `EditorState.create` **sans greffons**, fait du document et de la sélection de la transaction. Rien n'est envoyé. `typeDisponible` est vrai si la composition aboutit : c'est le jugement à blanc d'AC11. `donnerLeType` recompose sur l'état de l'instant (rejugement d'AC11 et d'AC16), recopie les pas de toutes les étapes dans **une** transaction de l'éditeur, y pose la sélection finale et l'envoie : une transaction, une mise à jour Yjs (AC16, H10).
- Raisons, constatées au code : `can().chain()` ne compose pas (veille) ; enchaînées dans une seule transaction, les commandes de ProseMirror qui lisent `tr.mapping` se trompent (`liftListItem` rendait faux après le retrait du `/`, et « Titre » et « Paragraphe » manquaient au menu dans une liste) ; `EditorState.apply` passerait la transaction aux greffons de l'éditeur, dont l'élévation de version, qui écrirait dans Yjs pendant un jugement à blanc (attrapé par le test d'AC20).
- Coût : une composition par commande, soit sept à chaque rendu de la barre (`commandesDe` d'`EditeurDePage.tsx`) et à chaque mise à jour du menu ouvert. Accepté par le gate, sans correction exigée. Depuis `60cef42`, `typeDisponible` garde ses jugements par état de l'éditeur (`WeakMap` sur l'`EditorState`, clé du type et de l'étendue retirée) : un état ne change jamais, et la barre et le menu ne recomposent plus sur un même état. `donnerLeType` ne lit pas ce cache : il recompose toujours sur l'état de l'instant.
- Conversions : vers le bloc code, `tr.setBlockType` sur chaque bloc de texte de la sélection que son parent admet à cette place (marques retirées, AC29), et non `setCodeBlock()`, dont le repli `setNode` sortirait l'élément de sa liste. Vers un paragraphe ou un titre, `tr.setNodeMarkup`, jamais `setBlockType` (raison au point « Changement de type depuis un bloc code » ci-dessus). Décision du dev du 2026-10-19 (AC1, H16 a), qui remplace « sauts de ligne gardés » : dans la même transaction, chaque saut de ligne du texte est remplacé par une espace, tous les autres caractères gardés ; aucun saut de ligne ne reste hors d'un bloc code. Le code de `c28fa74` les gardait, et Chromium les affichait en retours à la ligne puis les remplaçait lui-même à la frappe suivante. Depuis `60cef42`, `remplacerLesSautsDeLigne` (`types-de-bloc.ts`) écrit une espace à la place de chaque saut de ligne, juste avant le `setNodeMarkup`, dans la même transaction ; le bout en bout d'AC1 est `8a3bb99`. Conséquence acceptée : un bloc code de plusieurs lignes converti puis reconverti ne retrouve pas ses sauts de ligne ; Mod+Z les rend. Le troisième point de « Prouvé seulement en navigateur » devient sans objet : le test d'AC1 lit « aaa bbb » par `yjs` seul, puis « aaa Xbbb » après une frappe.

### Menu slash : `items: () => []` et un contrôleur synchrone

Remplace le premier point de « Menu slash » pour `allowedPrefixes`, `items` et `command`, et le deuxième pour les touches.

- `items: () => []`. L'utilitaire charge ses éléments de façon asynchrone (veille du 2026-10-16) : Entrée pourrait appliquer une liste qui n'est plus celle affichée. La liste vient du contrôleur que rend `render()`, à `onStart` et à `onUpdate` : `commandesFiltrees(commandesDisponibles(editeur), props.query)`, calculée de façon synchrone sur l'état courant ; les commandes disponibles sont jugées après le retrait de la séquence. Une liste nouvelle rend la première commande active, la même liste garde la sienne.
- `allow` : `menuPermis(state, range.from)` relit dans le document le caractère qui précède le `/` : début d'un bloc de texte, ou espace, et jamais dans un bloc code (AC12, AC13). `allowedPrefixes: [" "]` reste posé, mais ne suffit pas : l'utilitaire ne lit que le nœud de texte du curseur, et un `/` après du gras ouvrirait le menu.
- `command` et clic sur une option : `appliquer`, qui appelle `donnerLeType(editeur, type, séquence)` ; le retrait de la séquence est la première étape de la composition, rejugée à cet instant. Refusée : `exitSuggestion`, le menu se ferme, rien n'est écrit.
- Touches (`reponseALaTouche`) : Flèche haut et Flèche bas parcourent la liste en boucle ; Entrée applique la commande active. Aucun modificateur n'est lu (F-004-AC31 : le module d'édition ne lit aucun modificateur d'une frappe), au contraire de la note qui ne prenait que les touches sans modificateur : menu ouvert, Mod+Entrée et Alt+Maj+Flèches vont au menu. Décision du dev du 2026-10-19 (AC11, AC18, H16 b), qui remplace « Entrée avec "Aucune commande" rend `false` » : menu ouvert sans commande listée, Entrée est prise par le menu et ne fait rien, partout (ni coupure du bloc ou de l'élément, ni mise à jour Yjs ; le menu reste ouvert, la séquence dans le texte) ; Échap le ferme (AC17).
- Fermetures ajoutées au code : perte du focus de l'éditeur (`onBlur` de l'extension) ; mise à jour **reçue** qui change le texte de la séquence ou le balisage du bloc qui la porte (greffon `appendTransaction` voisin de l'utilitaire, AC19 ; la liaison remplace tout le document à chaque réception : un bloc retiré puis réinséré à l'identique n'est pas distingué).
- Placement : conforme à la note (`props.mount` avec `onPosition`, `placement: "bottom-start"`, `flip: true` écrit, `strategy: "fixed"`, `shift({ padding: 8 })`). Les coordonnées sont posées par l'interface (voir la structure plus bas).

### Barre de blocs

Complète le point « Barre (H11) ».

- Décision du dev du 2026-10-19 (H11, AC6) : la barre s'affiche aussi tant que la sélection, vide ou non, est entièrement dans un même bloc code, sélecteur « Langage du bloc code » compris : seule exception à F-003-AC41. Ailleurs, elle suit F-003-AC41 : sur une sélection non vide, et plus dans un bloc vide. Sur `c28fa74`, `barre.ts` (`lire`) ne lisait que le bloc de `$from` ; depuis `60cef42`, le bloc code n'appelle la barre et ne donne un langage, donc le sélecteur (`selecteurDeLangage` d'`EditeurDePage.tsx`), que si `$from.sameParent($to)`.
- La valeur affichée est `langageAdmis(attrs.language) ?? ""` ; le choix passe par `choisirLeLangage` (`bloc-code.ts`), qui écrit `updateAttributes("codeBlock", { language: langageAdmis(valeur) })`.

### Bloc code

Complète « Bloc code ».

- Attribut `language` : `default: null`, `parseHTML: () => null`, `rendered: false` (le rendu passe par `renderHTML` seul).
- Retour arrière et Flèche bas sont réécrits, pas gardés de l'extension : Retour arrière en tête d'un bloc code vide le change en paragraphe vide **à sa place**, liste comprise (`setNodeMarkup`) ; Flèche bas à la fin d'un bloc code ajoute un paragraphe seulement si le bloc est le dernier de la page, et sinon passe le curseur au bloc suivant, sans rien écrire (cas d'un élément de liste, AC4). Retour arrière en tête d'un bloc code non vide premier de la page est laissé à ProseMirror. Entrée et Flèche haut restent ceux de l'extension, Mod+Entrée celui du noyau.
- `schema.ts` étend aussi `ListItem` (`ElementDeListe`) : dans un bloc code d'un élément de liste, les raccourcis de l'élément n'agissent pas (Entrée insère un saut de ligne, AC3 ; Tab ne modifie rien, AC5, H6). Aucune autre extension de Tiptap.
- La règle de saisie (« ``` », « ~~~ ») est réécrite : `getAttributes` rend `langageAdmis` de l'identifiant saisi. La garde des langages reste la seule autorité qui couvre tous les chemins (AC35) ; la règle et le sélecteur filtrent en plus, par la même fonction.
- Le collage d'un éditeur de code est aussi refusé là où le schéma refuse un bloc code (premier paragraphe d'un élément de liste, AC11) : le collage suit alors le chemin du texte.

### Structure du module d'édition (corrections 5 à 8 du gate)

Structure exigée par le gate, relue au code le 2026-10-19 sur `8a3bb99` (correctifs `60cef42`) : elle y est telle quelle.

- `edition/commandes-de-bloc.ts`, **sans import**, comme `langages.ts` et `filtre-des-commandes.ts` : `NiveauDeTitre`, `NIVEAUX_DE_TITRE`, `NoeudDeListe`, `BLOC_CODE`, `TypeDeBloc`, `CommandeDeType`, `LISTE_DES_COMMANDES` et `memeType`. `index.ts` en réexporte `LISTE_DES_COMMANDES` : la liste se charge sans la bibliothèque d'édition. `CommandeDeType.noeud` est retiré : le nœud se déduit du type seul, et le test d'AC21 constate le nœud que chaque commande donne. `types-de-bloc.ts` garde le moteur (`etapesDuType`, `composer`, `typeDisponible`, `donnerLeType`, `typeDuBlocCourant`, `Retrait`) ; le repli mort `retrait?.from ?? 0` de `composer` a disparu.
- `edition/liaison.ts` porte `estAppliqueeDepuisYjs`, importé par `marques.ts`, `bloc-code.ts` et `menu-slash.ts`.
- `menu-slash.ts` garde l'extension (utilitaire de suggestion, contrôleur, `menuPermis`, `reponseALaTouche`, greffon de fermeture sur mise à jour reçue, `EtatDuMenu`, `OptionsDuMenu`) et reste le seul importateur de `@floating-ui/dom` (`shift`) ; `menu-slash-affiche.ts` porte la partie interface (`usePosition`, `useDesignation`, `useMenuAffiche`, `MenuAffiche`) et n'importe que `@tiptap/core` (type), `react`, `PositionDuMenu` et `EtatDuMenu`.
- `LiensDuDepot` et `useLiensDuDepot` d'`EditeurDePage.tsx` deviennent `LiensHorsEditeur` et `useLiensHorsEditeur`. `PositionDuMenu` vit dans `interface/composants/Edition.tsx`, à côté de `PositionDeBarre`, sous la même forme `{ gauche, haut }` ; le menu est posé par ses propres variables CSS, `--menu-x` et `--menu-y` (`styles/entree.css`), admises par le contrôle des jetons, et non plus par `--barre-gauche` et `--barre-haut`.
- Retouche de F-006-AC32 accordée par le dev le 2026-10-19 (H13) : `apps/web/test/structure-glisser.test.ts` constate que `@floating-ui/dom` n'est importé que par `src/edition/menu-slash.ts` (F-005-AC33).
