# F-003 — Conception : éditeur de page

Date : 2026-10-08
Spec : `git show F-008:specs/F-003.md` (brouillon, 32 critères, H1 à H14) ; elle fait foi. ADR : ADR-0009.
Conditions décidées par le dev : aucun git en écriture, ni `dossier-revue.sh` ni `gate.sh`. Ce document est un plan ; `ARCHITECTURE.md` sera aligné sur le code après chaque bloc.

## Approche

1. Un document Yjs par page, deux types racine (ADR-0009) : le fragment `contenu`, écrit par la seule liaison de Tiptap, et le tableau `versions`, écrit par la seule opération d'élévation.
2. `@notionlike/document` reçoit la façade du document de page : ouverture sans écriture, version lue (la plus haute inscrite), élévation, garde par observateur simple, table des versions. Toujours `yjs` seul.
3. `apps/web/src/edition/` est le seul module qui importe Tiptap, ProseMirror et `@tiptap/y-tiptap`. Il reçoit un fragment et une garde, rien d'autre : il ne connaît ni la persistance, ni la façade, ni l'espace.
4. `apps/web/src/page/` tient la session de page, sur le modèle de `espace/` : `Y.Doc`, persistance `{ type: "page", idEspace, idPage }`, façade, état immuable. Ni React ni Tiptap.
5. `interface/` ouvre la session de la page sélectionnée dans un effet, la ferme en la quittant, et rend chargement, message de version ou `<EditeurDePage>`.
6. Paquets unitaires Tiptap 3.31.4, sans `StarterKit` ni `ListKeymap` ; annulation par l'extension de collaboration ; texte d'invite rendu par React quand l'éditeur est vide (aucune dépendance `placeholder`).
7. La garde détruit l'éditeur dans l'observateur simple de `versions`, avant la liaison (qui observe en profondeur) : essayé, trois cas de F-003-AC29. L'éditeur est créé par `new Editor` dans un effet, pas par `useEditor` : sous `StrictMode`, `useEditor` laisse vivre un instant une seconde liaison que la garde ne détruit pas, et le nœud inconnu est supprimé (essai C).
8. Le module de persistance ne change pas : `ouvrirPersistance(doc, { type: "page", … })` existe déjà.
9. `apps/web/vitest.config.ts`, `apps/web/tsconfig.json` et `packages/document/package.json` ne changent pas : `setupFiles` nomme déjà `test/preparation.ts`, où `agent-frontend` ajoute les quatre fonctions de mise en page (texte essayé plus bas).
10. Ordre : un éditeur qui s'enregistre à la fin du bloc B2 ; la barre, puis la robustesse, puis le bout en bout.

## Interface figée entre les deux agents

Agent A écrit `packages/document`, agent B écrit `apps/web`. B code contre ces signatures dès maintenant ; A ne les change pas sans le dire.

```ts
// packages/document/src/index.ts — ajouts (les exports existants ne bougent pas, F-003-AC24)
export interface LigneDeVersionPage {
  readonly version: number;
  /** Nom du nœud → noms de ses attributs, triés. */
  readonly noeuds: Readonly<Record<string, readonly string[]>>;
  readonly marques: readonly string[];
  /** Types racine ajoutés à côté du fragment du contenu. */
  readonly typesPartages: readonly string[];
}
export const TABLE_DES_VERSIONS_PAGE: readonly LigneDeVersionPage[];
/** Numéro de la dernière ligne de la table : 1. */
export const VERSION_PAGE_PRISE_EN_CHARGE: number;

export interface DocumentPage {
  readonly doc: Y.Doc;
  readonly contenu: Y.XmlFragment;
  /** `rappel` est appelé dans l'observateur simple du type de version, à chaque modification
   *  qui laisse le document non pris en charge. Rend le désabonnement. */
  garderVersion(rappel: () => void): () => void;
}
/** N'écrit rien. Lève ErreurDocument("version-non-prise-en-charge") si la version lue dépasse
 *  la version prise en charge ou si la forme stockée porte autre chose que des entiers >= 1. */
export function ouvrirDocumentPage(doc: Y.Doc): DocumentPage;
/** Ne lève jamais : la plus haute version entière >= 1 inscrite, 1 s'il n'y en a aucune. */
export function lireVersionPage(doc: Y.Doc): number;
/** Sans effet si version <= version lue. Lève ErreurDocument("version-invalide") si `version`
 *  n'est pas un entier >= 1. Non bornée par la version prise en charge. */
export function eleverVersionPage(doc: Y.Doc, version: number): void;
// CodeErreurDocument reçoit "version-invalide".
```

Ligne 1 de la table : `{ version: 1, noeuds: { bulletList: [], doc: [], heading: ["level"], listItem: [], orderedList: ["start", "type"], paragraph: [], text: [] }, marques: [], typesPartages: [] }`.

```ts
// apps/web/src/edition/index.ts (agent B) : aucun type de Tiptap ne sort
export interface ProprietesEditeurDePage {
  readonly contenu: Y.XmlFragment; // import type de yjs
  readonly garderVersion: (rappel: () => void) => () => void;
}
export function EditeurDePage(proprietes: ProprietesEditeurDePage): ReactElement;

// apps/web/src/page/session-page.ts (agent B)
export type EtatSessionPage =
  | { readonly phase: "chargement" }
  | { readonly phase: "version-non-prise-en-charge" }
  | {
      readonly phase: "pret";
      readonly page: Pick<DocumentPage, "contenu" | "garderVersion">;
      readonly enregistre: boolean;
    };
export interface SessionPage {
  lireEtat(): EtatSessionPage;
  abonner(rappel: () => void): () => void;
  fermer(): void;
  readonly doc: Y.Doc; // reçoit les mises à jour (tests, puis F-013)
}
export function ouvrirSessionPage(idEspace: string, idPage: IdPage): SessionPage;
```

Seul point où l'ordre compte entre A et B : dès que A1 ajoute `version-invalide`, la table `MESSAGE_PAR_CODE` d'`apps/web/src/interface/messages.ts` (un `Record` exhaustif) ne compile plus. B y ajoute la ligne, et le code dans la liste de `test/coutures.test.ts`, dès que A1 est dans l'arbre ; d'ici là `pnpm typecheck` est rouge sur cette seule ligne.

## Plan par blocs

Bloc 0 : le dev (script plus bas). A1 et B1 démarrent ensemble après lui et n'ont aucun fichier commun ; B2 attend A1 ; A2 est parallèle à B2, B3 et B4. Un commit par bloc quand git revient. Chaque bloc laisse `prettier --check .`, `pnpm lint`, `pnpm typecheck`, `pnpm contrats` et `pnpm test` verts (sauf la ligne ci-dessus entre A1 et B2).

| Bloc | Qui | Critères                                                                                 | Fichiers créés                                                                                                                                                                | Fichiers modifiés                                                                                                                                                                                                   | Livré à la fin                                                           |
| ---- | --- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 0    | dev | prépare AC26, AC27, AC30                                                                 | aucun                                                                                                                                                                         | `apps/web/package.json`, `.dependency-cruiser.cjs`, `eslint.config.mjs`, `apps/web/test/structure.test.ts`, `pnpm-lock.yaml`                                                                                        | Tiptap installé, contrats et règle ESLint en place                       |
| A1   | A   | AC22 (table), AC23, AC24 (paquet), AC31 (refus, sans effet)                              | `packages/document/src/format-page.ts` (noms des types racine, table, lecture et écriture de la forme stockée), `src/document-page.ts` (façade), `test/document-page.test.ts` | `src/index.ts`, `src/erreurs.ts`, `test/structure.test.ts` (liste des exports et des codes)                                                                                                                         | toute l'interface figée, réelle                                          |
| A2   | A   | AC31 (convergence), AC29 (côté façade), AC23 (formes invalides)                          | `test/version-page-convergence.test.ts`, `test/garde-version.test.ts`                                                                                                         | `src/*` seulement si un test le demande                                                                                                                                                                             | preuves de la forme stockée et de la garde, sous Node                    |
| B1   | B   | AC2 (aucune mise à jour), AC7, AC9, AC10, AC11, AC12, AC27                               | `apps/web/src/edition/index.ts`, `EditeurDePage.tsx`, `extensions.ts`, `test/edition/editeur.test.tsx`                                                                        | `test/preparation.ts` (quatre fonctions), `test/coutures.test.ts` (liste des importateurs de `yjs`), `src/styles.css`                                                                                               | éditeur monté sur un fragment nu : saisie, séquences, listes, annulation |
| B2   | B   | AC1, AC3, AC4, AC5, AC6, AC25                                                            | `src/page/session-page.ts`, `test/page-session.test.ts`, `test/page-affichage.test.tsx`                                                                                       | `src/espace/session-espace.ts` (`idEspace` dans l'état `pret`), `src/interface/Application.tsx` (session de page ouverte par un effet, avertissement), `ZonePrincipale.tsx`, `messages.ts`, `test/coutures.test.ts` | **éditeur utilisable : taper, recharger, retrouver**                     |
| B3   | B   | AC8, AC16, AC2 (texte d'invite)                                                          | `src/edition/BarreDeBlocs.tsx`, `test/edition/barre-de-blocs.test.tsx`                                                                                                        | `EditeurDePage.tsx`, `src/styles.css`                                                                                                                                                                               | six commandes, état activé, noms accessibles                             |
| B4   | B   | AC13, AC14, AC15, AC17, AC18, AC19, AC29, AC20, AC21, AC22, AC24 (web), AC26, AC30, AC32 | `test/edition/collage.test.tsx`, `test/edition/convergence.test.tsx`, `test/edition/schema.test.ts`, `test/page-version.test.tsx`, `test/page-echecs.test.tsx`                | `test/structure.test.ts`, `test/coutures.test.ts`, `src/*` selon les défauts révélés                                                                                                                                | robustesse prouvée                                                       |
| B5   | B   | AC28                                                                                     | `e2e/editeur.spec.ts`                                                                                                                                                         | aucun `src/` attendu                                                                                                                                                                                                | scénario en navigateur réel, lancé à la main (D-003)                     |

Précisions qui évitent de buter :

- B1, montage (essayé tel quel, essais A à F) :

  ```tsx
  const [editor, setEditor] = useState<Editor | null>(null);
  useEffect(() => {
    const cree = new Editor({
      extensions: [
        Document,
        Paragraph,
        Text,
        Heading.configure({ levels: [1, 2, 3] }),
        BulletList,
        OrderedList,
        ListItem,
        Collaboration.configure({ fragment: contenu }),
      ],
      editorProps: {
        attributes: {
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": "Contenu de la page",
        },
      },
    });
    const cesserDeGarder = garderVersion(() => cree.destroy());
    setEditor(cree);
    return () => {
      cesserDeGarder();
      cree.destroy();
    };
  }, [contenu, garderVersion]);
  return <EditorContent editor={editor} />;
  ```

  `Editor` et `EditorContent` viennent de `@tiptap/react`. Les tests atteignent l'éditeur par `document.querySelector(".ProseMirror").editor`. Une séquence de F-003-AC9 se joue par `view.someProp("handleTextInput", (f) => f(view, from, to, " ", () => state.tr.insertText(" ", from, to)))` ; Entrée, Tab et Ctrl+Z par un `KeyboardEvent("keydown", { bubbles: true, cancelable: true })` sur `.ProseMirror`. Aucun `transact` autour d'une commande (H9, déjà interdit par ESLint).

- B1, à ajouter à `apps/web/test/preparation.ts` (sans elles, Entrée et Tab lèvent hors du test) :

  ```ts
  function aucunRectangle(): DOMRectList {
    return Object.assign([], { item: () => null }) as unknown as DOMRectList;
  }
  function rectangleNul(): DOMRect {
    return new DOMRect(0, 0, 0, 0);
  }
  Range.prototype.getClientRects = aucunRectangle;
  Range.prototype.getBoundingClientRect = rectangleNul;
  Element.prototype.getClientRects = aucunRectangle;
  document.elementFromPoint = () => null;
  ```

- B1 : le test F-002-AC22 de `test/coutures.test.ts` rougit dès qu'`EditeurDePage.tsx` importe le type de `yjs` (constaté) : sa liste d'importateurs devient `edition/EditeurDePage.tsx` et `espace/session-espace.ts`, puis reçoit `page/session-page.ts` au bloc B2.
- B2 : `Coquille` appelle `ouvrirSessionPage(etat.idEspace, page.id)` dans un `useEffect` dont le nettoyage appelle `fermer()` ; `<EditeurDePage key={page.id} …>`. La session attend que la persistance quitte `relecture`, appelle `ouvrirDocumentPage`, traduit l'erreur typée en phase `version-non-prise-en-charge`, s'abonne à `garderVersion` pour y passer plus tard, et ferme alors la persistance, comme la session d'espace. `enregistre` vaut `persistance.etat() === "active"` ; l'avertissement de F-002-AC16 s'affiche si l'espace ou la page ne s'enregistre pas.
- B4 : AC19, `vi.mock` du module d'édition pour compter les montages. AC13, `view.pasteHTML(html, new Event("paste") as ClipboardEvent)` : jsdom n'a pas `ClipboardEvent`, l'appel sans second argument lève (constaté). AC29, les trois cas par `Y.applyUpdate(session.doc, …)`.

### Attendu chiffré

Après chaque bloc : `pnpm exec vitest run --project <projet>; echo "code=$?"`, sans ligne `Errors`. Base constatée le 2026-10-08 : `document` 6 fichiers, 222 tests ; `web` 10 fichiers, 93 tests plus ceux que l'agent du bout en bout de F-002 ajoute (noté `W`).

| Après | Projet `document` : fichiers, tests                                      | Projet `web` : fichiers, tests au moins                                                                                                                     |
| ----- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | 6, 222                                                                   | 10, `W`                                                                                                                                                     |
| A1    | 7 (`document-page.test.ts`, 12 tests au moins), 234                      | inchangé                                                                                                                                                    |
| A2    | 9 (`version-page-convergence.test.ts` 6, `garde-version.test.ts` 6), 246 | inchangé                                                                                                                                                    |
| B1    | inchangé                                                                 | 11 (`edition/editeur.test.tsx` 10), `W` + 10                                                                                                                |
| B2    | inchangé                                                                 | 13 (`page-session.test.ts` 8, `page-affichage.test.tsx` 6), `W` + 24                                                                                        |
| B3    | inchangé                                                                 | 14 (`edition/barre-de-blocs.test.tsx` 8), `W` + 32                                                                                                          |
| B4    | inchangé                                                                 | 19 (`edition/collage` 4, `edition/convergence` 5, `edition/schema` 3, `page-version` 6, `page-echecs` 4, 4 ajouts dans `structure` et `coutures`), `W` + 58 |
| B5    | inchangé                                                                 | inchangé ; `pnpm --filter @notionlike/web test:e2e` : le scénario de F-003 passe                                                                            |

Un fichier attendu absent ou un total inférieur : le bloc suivant ne démarre pas. Chaque test cite son critère dans son nom.

## Correspondance critère par critère

| Critère              | Bloc   | Atteint par                                                                           | Preuve                                                                                         |
| -------------------- | ------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| AC1                  | B2     | `ouvrirSessionPage(idEspace, idPage)` → `ouvrirPersistance(doc, { type: "page", … })` | `page-session` : nom de la base lu dans `indexedDB.databases()`                                |
| AC2                  | B1, B3 | liaison sans écriture au montage ; invite hors du contenu                             | `edition/editeur` : zéro `update` après montage et focus                                       |
| AC3                  | B2     | persistance du document de page                                                       | `page-affichage` : saisir, démonter, remonter, même contenu lu                                 |
| AC4                  | B2     | phase `chargement` tant que la persistance est en `relecture`                         | `page-affichage` : ouvertures retenues, puis échéance de 10 s                                  |
| AC5                  | B2     | effet et nettoyage ; `key={page.id}`                                                  | `page-affichage` : modifier, changer aussitôt, relire dans un document vierge                  |
| AC6                  | B2     | la sélection quitte la page, le nettoyage ferme                                       | `page-affichage` : base intacte après corbeille                                                |
| AC7, AC9, AC10, AC11 | B1     | extensions unitaires                                                                  | `edition/editeur` : commandes, `handleTextInput`, `KeyboardEvent`                              |
| AC8, AC16            | B3     | `BarreDeBlocs` : boutons natifs, `aria-pressed`                                       | `edition/barre-de-blocs`                                                                       |
| AC12                 | B1     | historique de l'extension de collaboration                                            | `edition/editeur` : `undo` laisse une mise à jour appliquée                                    |
| AC13, AC20           | B4     | schéma fermé ; aucun HTML brut                                                        | `edition/collage` ; énumération des sources dans `structure`                                   |
| AC14, AC15           | B4     | liaison Yjs                                                                           | `edition/convergence` : deux répliques, deux ordres                                            |
| AC17                 | B4     | lecture tolérante de la liaison                                                       | `edition/schema` : niveau 9 et attribut inconnu, zéro `update`                                 |
| AC18                 | B4     | états `coupee` de la persistance                                                      | `page-echecs`                                                                                  |
| AC19                 | B4     | `ouvrirDocumentPage` refuse avant tout montage                                        | `page-version` : état encodé identique octet pour octet                                        |
| AC21                 | B4     | aucun appel réseau du module                                                          | `edition/collage` et `edition/editeur` sous globales piégées                                   |
| AC22                 | A1, B4 | table dans `format-page.ts`                                                           | `edition/schema` : schéma de l'éditeur comparé à la dernière ligne                             |
| AC23                 | A1, A2 | `ouvrirDocumentPage`, `lireVersionPage`                                               | `document-page`                                                                                |
| AC24                 | A1, B4 | exports ajoutés seulement                                                             | `structure` du paquet ; `coutures` du web                                                      |
| AC25                 | B2     | interface de persistance inchangée                                                    | `page-session` : quatre types de blocs relus dans un document vierge                           |
| AC26, AC30           | B4     | verrou                                                                                | `structure` : `yjs` unique, `prosemirror-view` >= 1.42.3, fragment instance de `Y.XmlFragment` |
| AC27                 | 0, B1  | contrats `edition-confinee` et suivants                                               | `pnpm contrats`                                                                                |
| AC28                 | B5     | —                                                                                     | `e2e/editeur.spec.ts`                                                                          |
| AC29                 | A2, B4 | `garderVersion` puis `editor.destroy()`                                               | `garde-version` (doublure d'observateur profond) ; `page-version` (éditeur réel, trois cas)    |
| AC31                 | A1, A2 | `eleverVersionPage` sur tableau en ajout seul                                         | `version-page-convergence`                                                                     |
| AC32                 | B4     | l'édition n'écrit que `contenu`                                                       | `page-version` : version lue 1, `versions` vide après les actions                              |

## Règles de dépendances ajoutées

Dans `.dependency-cruiser.cjs` (bloc 0) : `edition-confinee` (Tiptap, ProseMirror, `y-prosemirror`, `y-protocols` importables seulement depuis `apps/web/src/edition/` et `apps/web/test/edition/`, paquets compris) ; `web-edition-par-son-interface` (hors du module, seul `edition/index.ts`) ; `web-edition-liste-blanche` (le module n'importe que lui-même, `react`, `react-dom`, `yjs`, `@tiptap/*`) ; `web-page-liste-blanche` (`page/` n'importe que lui-même, `persistance/index.ts`, `@notionlike/document`, `yjs`). `web-src-liste-blanche` cesse de couvrir `page/` et `edition/`, qui ont leur propre liste. Sens : `interface → page → persistance` ; `interface → edition` ; `edition` et `page` ne se connaissent pas. ESLint : `no-restricted-imports` des mêmes paquets hors des deux dossiers d'édition. Les tests du module importent Tiptap parce que jsdom oblige à piloter l'éditeur par ses commandes (veille, H12).

## Points de la spec

- Aucun critère jugé irréalisable.
- F-003-AC25 : sa clause « si l'interface du module de persistance change » est sans objet, l'interface de F-002 ouvre déjà un document de page.
- H12 demande un fichier de préparation déclaré dans `apps/web/vitest.config.ts` : il l'est déjà par F-002 ; le fichier protégé ne change pas.
- Le test F-002-AC22 de `apps/web/test/structure.test.ts` fige la liste des dépendances d'exécution : le bloc 0 doit l'étendre, sans quoi l'installation le rougit. C'est un test modifié par le script du dev, signalé ici.
- F-003-AC17, titre de niveau hors de 1 à 3 : conservé dans le document, rendu en `h1` par l'extension, aucune mise à jour (essai F). Collé, un `h5` devient un paragraphe (essai E).

## Bloc 0 (dev)

Fichiers : `apps/web/package.json` (partagé : onze dépendances), `.dependency-cruiser.cjs` (protégé : quatre contrats, une liste retouchée), `eslint.config.mjs` (protégé : une constante, un bloc), `apps/web/test/structure.test.ts` (test : liste attendue), `pnpm-lock.yaml` (par `pnpm install`). Versions de la veille, toutes publiées depuis plus de 7 jours : `@tiptap/*` 3.31.4, `@tiptap/y-tiptap` 3.0.9, `y-protocols` 1.0.7 (pair obligatoire de `@tiptap/y-tiptap`).

À lancer à la racine du dépôt, F-002 dans l'arbre :

```bash
sed -n '230,347p' docs/decisions/F-003-conception.md | zsh
```

Le script vérifie tout avant d'écrire : sur `ARRET`, rien n'est écrit ; relancé après un succès, il s'arrête sans rien écrire.

```bash
# F-003 BLOC 0 DEBUT
python3 - <<'PY' && pnpm install && pnpm exec prettier --check . && pnpm lint && pnpm typecheck && pnpm contrats && pnpm test; echo "bloc 0 : code=$?"
import pathlib, sys

MANIFESTE = "apps/web/package.json"
CONTRATS = ".dependency-cruiser.cjs"
ESLINT = "eslint.config.mjs"
TEST_STRUCTURE = "apps/web/test/structure.test.ts"

TIPTAP = "3.31.4"
PAQUETS_TIPTAP = ("core", "extension-collaboration", "extension-document", "extension-heading",
                  "extension-list", "extension-paragraph", "extension-text", "pm", "react")
DEPENDANCES_TIPTAP = "".join(f'    "@tiptap/{nom}": "{TIPTAP}",\n' for nom in PAQUETS_TIPTAP)
DEPENDANCES_TIPTAP += '    "@tiptap/y-tiptap": "3.0.9",\n'

CONTRATS_AJOUTES = r'''    {
      name: "edition-confinee",
      severity: "error",
      comment:
        "F-003-AC27 : Tiptap, ProseMirror et leur liaison Yjs ne s'importent que dans apps/web/src/edition et dans ses tests (apps/web/test/edition).",
      from: { path: "^(apps|packages)/", pathNot: "^apps/web/(src|test)/edition/" },
      to: { path: "(^|/)node_modules/(@tiptap|prosemirror-[^/]+|y-prosemirror|y-protocols)/" },
    },
    {
      name: "web-edition-par-son-interface",
      severity: "error",
      comment:
        "F-003-AC27 : hors du module d'édition et de ses tests, seul son index.ts est importable.",
      from: { path: "^apps/web/", pathNot: "^apps/web/(src|test)/edition/" },
      to: { path: "^apps/web/src/edition/", pathNot: "^apps/web/src/edition/index\\.ts$" },
    },
    {
      name: "web-edition-liste-blanche",
      severity: "error",
      comment:
        "ADR-0009 : le module d'édition n'importe que lui-même, react, react-dom, Tiptap et yjs (ni persistance, ni façade, ni le reste de l'application).",
      from: { path: "^apps/web/src/edition/" },
      to: {
        pathNot: ["^apps/web/src/edition/", "(^|/)node_modules/(react|react-dom|yjs|@tiptap)/"],
      },
    },
    {
      name: "web-page-liste-blanche",
      severity: "error",
      comment:
        "ADR-0009 : la session de page n'importe qu'elle-même, l'interface de la persistance, les exports de @notionlike/document et yjs (ni React, ni Tiptap).",
      from: { path: "^apps/web/src/page/" },
      to: {
        pathNot: [
          "^apps/web/src/page/",
          "^apps/web/src/persistance/index\\.ts$",
          "^packages/document/src/index\\.ts$",
          "(^|/)node_modules/yjs/",
        ],
      },
    },
'''

ESLINT_CONSTANTE = '''const IMPORTS_DE_L_EDITION = [
  {
    group: ["@tiptap/*", "prosemirror-*", "y-prosemirror", "y-protocols", "y-protocols/*"],
    message:
      "F-003-AC27 : Tiptap, ProseMirror et leur liaison Yjs ne s'importent que dans apps/web/src/edition.",
  },
];

'''
ESLINT_BLOC = '''  {
    files: ["apps/**", "packages/**"],
    ignores: ["apps/web/src/edition/**", "apps/web/test/edition/**"],
    rules: { "no-restricted-imports": ["error", { patterns: IMPORTS_DE_L_EDITION }] },
  },
'''

LISTE_AVANT = '      "@notionlike/document",\n      "react",\n      "react-dom",\n      "y-indexeddb",\n      "yjs",\n'
LISTE_APRES = ('      "@notionlike/document",\n'
               + "".join(f'      "@tiptap/{nom}",\n' for nom in PAQUETS_TIPTAP)
               + '      "@tiptap/y-tiptap",\n      "react",\n      "react-dom",\n      "y-indexeddb",\n'
               + '      "y-protocols",\n      "yjs",\n')

# (fichier, texte attendu une seule fois, texte qui le remplace)
REMPLACEMENTS = (
    (MANIFESTE, '    "@notionlike/document": "workspace:*",\n',
     '    "@notionlike/document": "workspace:*",\n' + DEPENDANCES_TIPTAP),
    (MANIFESTE, '    "y-indexeddb": "9.0.12",\n',
     '    "y-indexeddb": "9.0.12",\n    "y-protocols": "1.0.7",\n'),
    (CONTRATS, '"ADR-0007 : hors persistance et espace, le code',
     '"ADR-0007 : hors persistance, espace, page et édition, le code'),
    (CONTRATS, 'pathNot: "^apps/web/src/(persistance|espace)/" },',
     'pathNot: "^apps/web/src/(persistance|espace|page|edition)/" },'),
    (CONTRATS, "  ],\n  options: {", CONTRATS_AJOUTES + "  ],\n  options: {"),
    (ESLINT, "export default tseslint.config(", ESLINT_CONSTANTE + "export default tseslint.config("),
    (ESLINT, '  {\n    files: ["**/*.cjs"],', ESLINT_BLOC + '  {\n    files: ["**/*.cjs"],'),
    (TEST_STRUCTURE, LISTE_AVANT, LISTE_APRES),
)
DEJA_APPLIQUE = ((MANIFESTE, "@tiptap/"), (CONTRATS, "edition-confinee"),
                 (ESLINT, "IMPORTS_DE_L_EDITION"), (TEST_STRUCTURE, "@tiptap/"))

# Tout est verifie avant la premiere ecriture : le script n'ecrit rien s'il doit s'arreter.
textes = {}
for chemin in (MANIFESTE, CONTRATS, ESLINT, TEST_STRUCTURE):
    if not pathlib.Path(chemin).is_file():
        sys.exit(f"ARRET : {chemin} absent ; le script se lance a la racine du depot, F-002 dans l'arbre")
    textes[chemin] = pathlib.Path(chemin).read_text(encoding="utf-8")
for chemin, marque in DEJA_APPLIQUE:
    if marque in textes[chemin]:
        sys.exit(f"ARRET : {chemin} porte deja les ajouts de F-003, rien n'est ecrit")
for chemin, attendu, _ in REMPLACEMENTS:
    if textes[chemin].count(attendu) != 1:
        sys.exit(f"ARRET : repere trouve {textes[chemin].count(attendu)} fois dans {chemin} (attendu : 1), rien n'est ecrit : {attendu!r}")

for chemin, attendu, remplacant in REMPLACEMENTS:
    textes[chemin] = textes[chemin].replace(attendu, remplacant)
for chemin, texte in textes.items():
    pathlib.Path(chemin).write_text(texte, encoding="utf-8")
    print("modifie ", chemin)
PY
# F-003 BLOC 0 FIN
```

## Essais

Gabarit jetable hors du dépôt : copie de l'arbre de travail du 2026-10-08 (`packages/document` et `apps/web` tels quels), `node_modules` réinstallé sur place, supprimé ensuite.

### S — script du bloc 0

Extrait de ce document par la commande ci-dessus et lancé tel quel. Sortie (codes de couleur, lignes vides et avertissements `localStorage` de Node retirés) :

```text
modifie  apps/web/package.json
modifie  .dependency-cruiser.cjs
modifie  eslint.config.mjs
modifie  apps/web/test/structure.test.ts
Scope: all 3 workspace projects
Progress: resolved 35, reused 147, downloaded 35, added 35, done
Done in 1.1s using pnpm v12.10.1
Checking formatting...
All matched files use Prettier code style!
$ eslint --no-warn-ignored .
$ pnpm -r run typecheck
$ tsc --noEmit -p tsconfig.json
$ tsc --noEmit -p tsconfig.json
$ depcruise --config .dependency-cruiser.cjs apps packages
✔ no dependency violations found (64 modules, 146 dependencies cruised)
$ vitest run --passWithNoTests
 Test Files  16 passed (16)
      Tests  315 passed | 1 skipped (316)
bloc 0 : code=0
```

- Les lignes `Progress` et `Done` sont celles de la première installation ; le reste vient de la passe complète rejouée sur les quatre fichiers remis dans leur état d'origine.
- Relance : `ARRET : apps/web/package.json porte deja les ajouts de F-003, rien n'est ecrit`, `bloc 0 : code=1`, les quatre fichiers identiques octet pour octet.
- Verrou après installation : `yjs@13.6.33` seule, `prosemirror-view@1.42.6`, `y-protocols@1.0.7`, `lib0@0.2.119`, `@tiptap/y-tiptap@3.0.9`.
- Deux écarts du gabarit avec le dépôt, dus au travail en cours de l'autre agent : le test « barre latérale : profondeur » de `apps/web/test/barre-laterale.test.tsx`, qui ne se terminait pas au moment de la copie, y est sauté (d'où `1 skipped`) ; `apps/web/e2e/tmp.spec.ts`, non formaté, y est retiré. Dans le dépôt, le script ne finira en `code=0` qu'une fois ces deux fichiers en état.
- Barrières, par fichiers jetables : un import de `@tiptap/core`, de `@tiptap/pm/keymap` et de `edition/EditeurDePage.tsx` depuis `src/interface/` donne `edition-confinee` (2), `web-src-liste-blanche` (2) et `web-edition-par-son-interface` (1) ; depuis `packages/document/src/`, `document-yjs-seulement` ; ESLint donne trois erreurs `no-restricted-imports`.

### A à G — faisabilité (Vitest 5.0.3, jsdom 30.1.1, React 19.3.0 en `StrictMode`, Tiptap 3.31.4)

Le gabarit a reçu une façade minimale aux signatures figées, le composant de B1 ci-dessus, les quatre fonctions de préparation et un fichier `apps/web/test/edition/faisabilite.test.tsx`. Avec eux, `prettier --check`, `pnpm lint`, `pnpm typecheck` et `pnpm contrats` passent ; seul le test F-002-AC22 de `coutures.test.ts` rougit (liste des importateurs de `yjs`, voir B1).

```text
 ✓ A. taper, fermer aussitôt, rouvrir, relire : base notionlike:page:<espace>:<page> 84ms
 ✓ B. annulation locale : Ctrl+Z défait la frappe, pas la mise à jour reçue 14ms
 ✓ C. garde de version, version seule puis noeud : éditeur détruit, nœud inconnu conservé, aucune mise à jour locale 10ms
 ✓ C. garde de version, version puis noeud : éditeur détruit, nœud inconnu conservé, aucune mise à jour locale 9ms
 ✓ C. garde de version, noeud puis version : éditeur détruit, nœud inconnu conservé, aucune mise à jour locale 9ms
 ✓ D. sans garde, la liaison supprime le nœud inconnu (témoin) 4ms
 ✓ E. collage riche : rien hors du schéma n'entre dans le document 20ms
 ✓ F. titre de niveau 9 et attribut inconnu déjà dans le document : affichés, aucune mise à jour 6ms
 ✓ G. convergence de l'élévation : 2 et 3 élevées séparément se lisent 3 des deux côtés 1ms
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

- A : `Y.Doc` ouvert par `ouvrirPersistance(doc, { type: "page", … })`, éditeur monté sur `ouvrirDocumentPage(doc).contenu` ; zéro `update` après montage et prise de focus ; saisie de `# Titre`, Entrée, `Bonjour`, `- un`, `deux`, Tab, sortie de liste, `1. premier` ; démontage et `fermer()` aussitôt ; relu dans un `Y.Doc` vierge : `<heading level="1">Titre</heading><paragraph>Bonjour</paragraph><bulletlist><listitem><paragraph>un</paragraph><bulletlist><listitem><paragraph>deux</paragraph></listitem></bulletlist></listitem></bulletlist><orderedlist start="1"><listitem><paragraph>premier</paragraph></listitem></orderedlist>`, identique à l'écrit ; version lue 1.
- C : avec `useEditor` sous `StrictMode`, le fragment porte deux observateurs profonds juste après le montage (un seul 20 ms plus tard) et les trois cas échouent, nœud supprimé ; avec le montage par effet, un seul observateur dès le montage et les trois cas passent. Sans `StrictMode`, les deux montages passent.
- E : `<h2 style onclick>Titre <b>gras</b></h2><h5>cinq</h5><p><a href="javascript:x">lien</a><img onerror></p><script>…</script><ol start="3">…` donne `<heading level="2">Titre gras</heading><paragraph>cinq</paragraph><paragraph>lien</paragraph><orderedlist start="3"><listitem><paragraph>trois</paragraph></listitem></orderedlist>`.
- F : rendu `<h1>neuf</h1><p>texte</p>`, zéro `update`.

### Non essayé

- Le script dans le dépôt lui-même, et la commande `sed` avec ses numéros de ligne autrement que par comparaison de l'extrait avec celui de l'essai.
- La session de page, son branchement dans `Coquille`, le changement de page (F-003-AC5 sous React), les états `chargement` et `coupee` pour une page.
- La barre de blocs, l'état activé, le texte d'invite.
- La convergence de deux éditeurs (F-003-AC15), la matrice complète de F-003-AC31 (identifiants de client, troisième document), la garde par une doublure d'observateur profond sous Node.
- Le navigateur réel (F-003-AC28), le rendu sous Vite, le poids du lot.
