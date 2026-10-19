// Bloc code (F-005-AC1 à AC8, AC10, AC29) : conversion, règle de saisie, clavier, sélecteur de
// langage, collage et rendu, joués par l'éditeur monté comme l'application le monte.
import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  bloc,
  contenuLu,
  documentForge,
  fragmentBrut,
  inventaireDuContenu,
} from "../aides-facade-page.ts";
import {
  barreDeBlocs,
  blocDuCurseur,
  choisirLeLangage,
  collerLesDonnees,
  commande,
  entrerDansLEditeur,
  menuSlash,
  monterLEditeur,
  placerLeCurseurALaFinDe,
  placerLeCurseurApres,
  placerLeCurseurAuDebutDe,
  placerLeCurseurDansLeDernierBloc,
  presser,
  presserAvecMod,
  selecteurDeLangage,
  selectionnerLeBloc,
  taper,
  textesDesBlocs,
  zoneDeSaisie,
} from "./aides-edition.tsx";

const LANGAGES_PROPOSES = [
  "",
  "bash",
  "css",
  "html",
  "javascript",
  "json",
  "markdown",
  "python",
  "sql",
  "typescript",
  "yaml",
];

/** Tape ces lignes dans un bloc code créé par la règle de saisie, au début d'un paragraphe vide. */
function taperUnBlocCode(lignes: readonly string[], ouverture = "``` "): void {
  taper(ouverture);
  lignes.forEach((ligne, rang) => {
    if (rang > 0) {
      presser("Enter");
    }
    taper(ligne);
  });
}

/** Une liste à puces dont chaque élément porte ces blocs, écrite par `yjs` seul. */
function documentAvecUneListe(...elements: (() => Y.XmlElement[])[]): Y.Doc {
  const liste = new Y.XmlElement("bulletList");
  liste.insert(
    0,
    elements.map((enfants) => {
      const element = new Y.XmlElement("listItem");
      element.insert(0, enfants());
      return element;
    }),
  );
  return documentForge(liste);
}

/** Les blocs code du fragment, lus par `yjs` seul : texte et attributs. */
function blocsCodeLus(doc: Y.Doc): { texte: string; attributs: Record<string, unknown> }[] {
  const trouves: { texte: string; attributs: Record<string, unknown> }[] = [];
  const visiter = (element: unknown): void => {
    if (element instanceof Y.XmlElement) {
      if (element.nodeName === "codeBlock") {
        trouves.push({
          texte: element
            .toArray()
            .map((enfant) => (enfant as Y.XmlText).toString())
            .join(""),
          attributs: element.getAttributes(),
        });
      }
      element.toArray().forEach(visiter);
    }
  };
  fragmentBrut(doc).toArray().forEach(visiter);
  return trouves;
}

describe("conversion vers et depuis le bloc code", () => {
  it.each([
    ["un paragraphe", "", "<codeblock>abc</codeblock>"],
    ["un titre", "# ", "<codeblock>abc</codeblock>"],
  ])(
    "F-005-AC1 « Bloc code » sur %s en fait un bloc code sans langage qui conserve son texte",
    (_cas, prefixe, attendu) => {
      const { doc } = monterLEditeur();
      entrerDansLEditeur();
      taper(`${prefixe}abc`);
      selectionnerLeBloc();

      act(() => commande("Bloc code").click());

      expect(contenuLu(doc).toLowerCase()).toBe(attendu);
      expect(blocsCodeLus(doc)).toEqual([{ texte: "abc", attributs: {} }]);
    },
  );

  it.each([
    ["Paragraphe", "paragraph", {}],
    ["Titre 1", "heading", { level: 1 }],
    ["Titre 2", "heading", { level: 2 }],
    ["Titre 3", "heading", { level: 3 }],
  ] as const)(
    "F-005-AC1 « %s » sur un bloc code lui donne ce type en conservant tous les caractères, sauts de ligne compris",
    (nom, noeud, attributs) => {
      const { doc } = monterLEditeur();
      entrerDansLEditeur();
      taperUnBlocCode(["a", "b", "", "c"], "```python ");
      selectionnerLeBloc();

      act(() => commande(nom).click());

      const [bloc] = fragmentBrut(doc).toArray() as Y.XmlElement[];
      expect(bloc?.nodeName).toBe(noeud);
      expect(bloc?.getAttributes()).toEqual(attributs);
      expect(bloc?.toArray().map(String).join("")).toBe("a\nb\n\nc");
      expect(blocsCodeLus(doc)).toEqual([]);
    },
  );

  it("F-005-AC1 la barre marque « Bloc code », et lui seul, quand le curseur est dans un bloc code, même sans sélection", () => {
    monterLEditeur();
    entrerDansLEditeur();
    taperUnBlocCode(["let a;"]);

    const marquees = [...(barreDeBlocs()?.querySelectorAll("[aria-pressed=true]") ?? [])].map(
      (bouton) => bouton.getAttribute("aria-label"),
    );

    expect(marquees).toEqual(["Bloc code"]);
    expect(commande("Bloc code").getAttribute("aria-disabled")).toBeNull();
  });
});

describe("règle de saisie du bloc code", () => {
  it.each([
    ["``` ", {}],
    ["```python ", { language: "python" }],
    ["```zz ", {}],
    ["~~~json ", { language: "json" }],
  ])(
    "F-005-AC2 « %s » en tête d'un paragraphe vide donne un bloc code, sans la séquence, au langage de la liste ou sans langage",
    (sequence, attributs) => {
      const { doc } = monterLEditeur();
      entrerDansLEditeur();

      taper(sequence);
      taper("x");

      expect(blocsCodeLus(doc)).toEqual([{ texte: "x", attributs }]);
      expect(blocDuCurseur().noeud).toBe("codeBlock");
    },
  );
});

describe("clavier dans un bloc code", () => {
  it("F-005-AC3 Entrée insère un saut de ligne dans le bloc, sans créer de bloc, même après deux sauts de ligne", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taperUnBlocCode(["ab"]);

    presser("Enter");
    presser("Enter");
    presser("Enter");
    taper("c");

    expect(blocsCodeLus(doc)).toEqual([{ texte: "ab\n\n\nc", attributs: {} }]);
    expect(fragmentBrut(doc).length).toBe(1);
  });

  it("F-005-AC3 dans un bloc code d'un élément de liste, Entrée insère aussi un saut de ligne et ne coupe pas l'élément", () => {
    const { doc } = monterLEditeur(
      documentAvecUneListe(() => [bloc("paragraph", "puce"), bloc("codeBlock", "ab")]),
    );
    entrerDansLEditeur();
    placerLeCurseurALaFinDe("ab");

    presser("Enter");
    taper("c");

    expect(contenuLu(doc).toLowerCase()).toBe(
      "<bulletlist><listitem><paragraph>puce</paragraph><codeblock>ab\nc</codeblock></listitem></bulletlist>",
    );
  });

  it("F-005-AC4 Mod+Entrée dans un bloc code crée un paragraphe à la suite et y place le curseur", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taperUnBlocCode(["un", "deux"]);
    placerLeCurseurApres("un\ndeux");
    placerLeCurseurAuDebutDe("un\ndeux");

    presserAvecMod("Enter");
    taper("suite");

    expect(contenuLu(doc).toLowerCase()).toBe(
      "<codeblock>un\ndeux</codeblock><paragraph>suite</paragraph>",
    );
  });

  it("F-005-AC4 Flèche bas à la fin d'un bloc code qui est le dernier bloc de la page crée un paragraphe à la suite et y place le curseur", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taperUnBlocCode(["fin"]);

    presser("ArrowDown");
    taper("après");

    expect(contenuLu(doc).toLowerCase()).toBe(
      "<codeblock>fin</codeblock><paragraph>après</paragraph>",
    );
  });

  it("F-005-AC4 Flèche bas à la fin d'un bloc code dernier enfant d'un élément de liste suivi d'un autre élément y mène le curseur, sans rien écrire", () => {
    const { doc, emises } = monterLEditeur(
      documentAvecUneListe(
        () => [bloc("paragraph", "un"), bloc("codeBlock", "code")],
        () => [bloc("paragraph", "deux")],
      ),
    );
    entrerDansLEditeur();
    placerLeCurseurALaFinDe("code");
    const avant = [contenuLu(doc), emises.length] as const;

    presser("ArrowDown");

    expect([contenuLu(doc), emises.length]).toEqual(avant);
    expect(blocDuCurseur()).toEqual({ noeud: "paragraph", texte: "deux" });
  });

  it("F-005-AC4 Retour arrière en tête d'un bloc code vide en fait un paragraphe vide, à sa place, y compris dans un élément de liste", () => {
    const { doc } = monterLEditeur(
      documentAvecUneListe(() => [bloc("paragraph", "puce"), bloc("codeBlock", "")]),
    );
    entrerDansLEditeur();
    placerLeCurseurDansLeDernierBloc();
    const dansLeBlocCode = blocDuCurseur().noeud;

    presser("Backspace");

    expect(dansLeBlocCode).toBe("codeBlock");
    expect(contenuLu(doc).toLowerCase()).toBe(
      "<bulletlist><listitem><paragraph>puce</paragraph><paragraph></paragraph></listitem></bulletlist>",
    );
    expect(blocDuCurseur().noeud).toBe("paragraph");
  });

  it("F-005-AC4 Retour arrière en tête d'un bloc code vide de premier niveau en fait un paragraphe vide", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("avant");
    presser("Enter");
    taper("``` ");

    presser("Backspace");

    expect(contenuLu(doc).toLowerCase()).toBe(
      "<paragraph>avant</paragraph><paragraph></paragraph>",
    );
  });

  it("F-005-AC5 dans un bloc code, les règles de saisie ne se déclenchent pas, `/` n'ouvre pas le menu, et Tab ne modifie rien", () => {
    const { doc, emises } = monterLEditeur();
    entrerDansLEditeur();
    taperUnBlocCode(["# - 1. > **x** *y* _z_ ``` https://exemple.fr / /tit"]);
    const avantTab = [contenuLu(doc), emises.length] as const;

    const tabTraitee = presser("Tab");
    const majTabTraitee = presser("Tab", { shiftKey: true });

    expect(blocsCodeLus(doc)).toEqual([
      { texte: "# - 1. > **x** *y* _z_ ``` https://exemple.fr / /tit", attributs: {} },
    ]);
    expect(inventaireDuContenu(doc).marques).toEqual([]);
    expect(menuSlash()).toBeNull();
    expect([tabTraitee, majTabTraitee]).toEqual([false, false]);
    expect([contenuLu(doc), emises.length]).toEqual(avantTab);
  });

  it("F-005-AC5 dans un bloc code d'un élément de liste, Tab et Maj+Tab ne déplacent pas l'élément", () => {
    const { doc, emises } = monterLEditeur(
      documentAvecUneListe(
        () => [bloc("paragraph", "un")],
        () => [bloc("paragraph", "deux"), bloc("codeBlock", "code")],
      ),
    );
    entrerDansLEditeur();
    placerLeCurseurALaFinDe("code");
    const avant = [contenuLu(doc), emises.length] as const;

    const traitees = [presser("Tab"), presser("Tab", { shiftKey: true })];

    expect(traitees).toEqual([false, false]);
    expect([contenuLu(doc), emises.length]).toEqual(avant);
  });
});

describe("sélecteur de langage", () => {
  it("F-005-AC6 dans un bloc code, la barre propose « Langage du bloc code » : « Texte brut » puis la liste, la valeur du bloc montrée ; hors d'un bloc code, il n'est pas proposé", () => {
    monterLEditeur();
    entrerDansLEditeur();
    taper("texte");
    selectionnerLeBloc();
    const horsDuCode = selecteurDeLangage();
    placerLeCurseurApres("texte");
    presser("Enter");
    taperUnBlocCode(["print(1)"], "```python ");

    const selecteur = selecteurDeLangage();

    expect(horsDuCode).toBeNull();
    expect(barreDeBlocs()).not.toBeNull();
    expect([...(selecteur?.options ?? [])].map((option) => option.value)).toEqual(
      LANGAGES_PROPOSES,
    );
    expect(selecteur?.options[0]?.textContent).toBe("Texte brut");
    expect(selecteur?.value).toBe("python");
    expect(selecteur?.tabIndex).toBe(-1);
  });

  it("F-005-AC6 choisir un langage l'enregistre dans le bloc sans modifier son texte ; « Texte brut » retire le langage", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taperUnBlocCode(["a", "b"]);

    choisirLeLangage("typescript");
    const choisi = blocsCodeLus(doc);
    choisirLeLangage("");

    expect(choisi).toEqual([{ texte: "a\nb", attributs: { language: "typescript" } }]);
    expect(blocsCodeLus(doc)).toEqual([{ texte: "a\nb", attributs: {} }]);
    expect(selecteurDeLangage()?.value).toBe("");
  });
});

describe("collage et bloc code", () => {
  it("F-005-AC7 dans un bloc code, un contenu collé n'inscrit que son texte, sauts de ligne conservés, dans ce seul bloc", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taperUnBlocCode(["x"]);

    collerLesDonnees({
      "text/plain": "a\r\nb\n**c**",
      "text/html":
        "<p>a</p><p><strong>b</strong></p><pre><code class='language-sql'>c</code></pre>",
    });

    expect(blocsCodeLus(doc)).toEqual([{ texte: "xa\nb\n**c**", attributs: {} }]);
    expect(fragmentBrut(doc).length).toBe(1);
    expect(inventaireDuContenu(doc).marques).toEqual([]);
  });

  it("F-005-AC7 hors d'un bloc code, un contenu riche qui contient un `pre` donne un bloc code sans langage qui en porte le texte", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("avant");
    presser("Enter");

    collerLesDonnees({
      "text/plain": "let a = 1;",
      "text/html": '<pre><code class="language-javascript">let <b>a</b> = 1;</code></pre>',
    });

    expect(blocsCodeLus(doc)).toEqual([{ texte: "let a = 1;", attributs: {} }]);
  });
});

describe("rendu du bloc code", () => {
  it("F-005-AC8 un bloc code est rendu par un `pre` qui contient un `code`, son texte tel quel, sans coloration", () => {
    monterLEditeur();
    entrerDansLEditeur();
    taperUnBlocCode(["  a  b", "c"], "```python ");

    const pre = zoneDeSaisie().querySelector("pre");
    const code = pre?.firstElementChild;

    expect(code?.tagName).toBe("CODE");
    expect(code?.textContent).toBe("  a  b\nc");
    expect(code?.getAttribute("class")).toBe("language-python");
    expect(code?.children).toHaveLength(0);
    expect(pre?.attributes).toHaveLength(0);
  });

  it("F-005-AC10 un bloc code qui contient du balisage HTML ou un script l'affiche comme du texte, sans l'interpréter", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    const fenetre = window as Window & { temoinDuBlocCode?: number };
    taperUnBlocCode([
      "<b>gras</b>",
      "<script>window.temoinDuBlocCode = 1</script>",
      '<img src="x" onerror="window.temoinDuBlocCode = 2">',
    ]);

    const code = zoneDeSaisie().querySelector("pre code");

    expect(code?.children).toHaveLength(0);
    expect(code?.textContent).toContain("<script>window.temoinDuBlocCode = 1</script>");
    expect(zoneDeSaisie().querySelectorAll("b, script, img")).toHaveLength(0);
    expect(fenetre.temoinDuBlocCode).toBeUndefined();
    expect(blocsCodeLus(doc)[0]?.texte).toContain("<b>gras</b>");
  });
});

describe("marques et bloc code", () => {
  it("F-005-AC29 un bloc transformé en bloc code perd ses marques et garde son texte", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("a **gras** *pench*");
    const avant = inventaireDuContenu(doc).marques;
    selectionnerLeBloc();

    act(() => commande("Bloc code").click());

    expect(avant).toEqual(["bold", "italic"]);
    expect(inventaireDuContenu(doc).marques).toEqual([]);
    expect(blocsCodeLus(doc)).toEqual([{ texte: "a gras pench", attributs: {} }]);
  });

  it("F-005-AC29 aucune marque n'entre dans un bloc code : ni Gras, ni Italique, ni Lien, ni raccourci, ni règle de saisie, ni collage", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taperUnBlocCode(["mot"]);
    selectionnerLeBloc();

    act(() => commande("Gras").click());
    presserAvecMod("i");
    presserAvecMod("b");
    placerLeCurseurALaFinDe("mot");
    taper(" **fort** _penche_");
    collerLesDonnees({ "text/plain": "colle", "text/html": "<strong>colle</strong>" });

    expect(inventaireDuContenu(doc).marques).toEqual([]);
    expect(commande("Lien").getAttribute("aria-disabled")).toBe("true");
    expect(textesDesBlocs()).toEqual(["mot **fort** _penche_colle"]);
  });
});
