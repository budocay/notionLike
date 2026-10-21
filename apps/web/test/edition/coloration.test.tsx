// Coloration du bloc code (F-033-AC1 à AC8, AC12) : jouée par l'éditeur monté comme l'application
// le monte, avec la vraie bibliothèque de coloration ; le texte est lu par `yjs` seul.
import { lireVersionPage, TABLE_DES_VERSIONS_PAGE } from "@notionlike/document";
import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  ajouter,
  bloc,
  contenuLu,
  documentForge,
  fragmentBrut,
  inventaireDuContenu,
  miseAJourDUneReplique,
} from "../aides-facade-page.ts";
import { documentDeLaLigne } from "../aides-lignes.ts";
import { afficherUnePage } from "../aides-session-page.tsx";
import {
  classesSous,
  CLASSES_DE_ROLE_ADMISES,
  elementsCode,
  portionsColorees,
  textesDesBlocsCode,
  blocsCodeDuFragment,
  texteDuBloc,
} from "./aides-coloration.ts";
import {
  annuler,
  choisirLeLangage,
  collerDuTexte,
  collerLesDonnees,
  curseurDansLeBloc,
  demonterLEditeur,
  effacerAvantLeCurseur,
  entrerDansLEditeur,
  monterLEditeur,
  placerLeCurseurALaFinDe,
  placerLeCurseurDans,
  placerLeCurseurDansLeDernierBloc,
  recevoirDUneReplique,
  retablir,
  selectionnerLeTexte,
  taper,
  zoneDeSaisie,
} from "./aides-edition.tsx";

/** Un échantillon par langage de la liste, et deux portions de rôles différents qu'il porte (H5). */
const ECHANTILLONS = [
  [
    "bash",
    'if [ -n "$x" ]; then echo "ok"; fi',
    [
      ["if", "motCle"],
      ['"ok"', "chaine"],
    ],
  ],
  [
    "css",
    '@media screen { a::before { content: "x"; } }',
    [
      ["@media", "motCle"],
      ['"x"', "chaine"],
    ],
  ],
  [
    "html",
    '<a href="x">t</a>',
    [
      ["a", "motCle"],
      ['"x"', "chaine"],
    ],
  ],
  [
    "javascript",
    'const s = "x";',
    [
      ["const", "motCle"],
      ['"x"', "chaine"],
    ],
  ],
  [
    "json",
    '{"a": "b", "n": 1}',
    [
      ['"a"', "propriete"],
      ['"b"', "chaine"],
    ],
  ],
  [
    "markdown",
    "# Titre\n*a*",
    [
      ["# Titre", "motCle"],
      ["*a*", "type"],
    ],
  ],
  [
    "python",
    'def f():\n  return "x"',
    [
      ["def", "motCle"],
      ['"x"', "chaine"],
    ],
  ],
  [
    "sql",
    "SELECT a FROM t WHERE b = 'x';",
    [
      ["SELECT", "motCle"],
      ["'x'", "chaine"],
    ],
  ],
  [
    "typescript",
    'const s: string = "x";',
    [
      ["const", "motCle"],
      ['"x"', "chaine"],
    ],
  ],
  [
    "yaml",
    "cle: 12",
    [
      ["cle:", "propriete"],
      ["12", "nombre"],
    ],
  ],
] as const;

const LANGAGES = ECHANTILLONS.map(([langage]) => langage);

/** Un document dont chaque bloc code porte ce langage et ce texte, écrit par `yjs` seul. */
function documentDeBlocsCode(...blocs: readonly (readonly [string | number | null, string])[]) {
  return documentForge(
    ...blocs.map(([langage, texte]) =>
      bloc("codeBlock", texte, langage === null ? {} : { language: langage }),
    ),
  );
}

describe("coloration selon le langage", () => {
  it.each(ECHANTILLONS)(
    "F-033-AC1 un bloc `%s` est coloré selon sa grammaire, dans `pre` > `code`, son texte affiché tel quel",
    (langage, texte, attendues) => {
      const doc = documentDeBlocsCode([langage, texte]);
      monterLEditeur(doc);

      const [code] = elementsCode();

      expect(code?.parentElement?.tagName).toBe("PRE");
      expect(code?.tagName).toBe("CODE");
      expect(portionsColorees(code as Element)).toEqual(
        expect.arrayContaining(attendues.map(([portion, role]) => [portion, role])),
      );
      expect(new Set(attendues.map(([, role]) => role)).size).toBe(2);
      expect(code?.textContent).toBe(texte);
      expect(textesDesBlocsCode(doc)).toEqual([texte]);
    },
  );

  it("F-033-AC1 espaces, tabulations et sauts de ligne restent exactement le texte du bloc", () => {
    const texte = '\tconst  a = "x";\n\n    // fin\t\n';
    const doc = documentDeBlocsCode(["typescript", texte]);
    monterLEditeur(doc);

    const [code] = elementsCode();

    expect(code?.textContent).toBe(texte);
    expect(textesDesBlocsCode(doc)).toEqual([texte]);
    expect(portionsColorees(code as Element)).toEqual(
      expect.arrayContaining([
        ["const", "motCle"],
        ["// fin\t", "commentaire"],
      ]),
    );
  });

  it("F-033-AC2 sans langage, ou avec une valeur hors de la liste que la bibliothèque connaît ou non, aucun descendant de `code` ne porte de classe", () => {
    const texte = 'const s = "x"; // <a href="y">';
    const doc = documentDeBlocsCode(
      [null, texte],
      ["xml", texte],
      ["js", texte],
      ["x fixed inset-0", texte],
      ["hljs", texte],
      [3, texte],
    );
    monterLEditeur(doc);

    const codes = elementsCode();

    expect(codes).toHaveLength(6);
    for (const code of codes) {
      expect(code.querySelectorAll("*")).toHaveLength(0);
      expect(code.getAttribute("class")).toBeNull();
      expect(code.textContent).toBe(texte);
    }
  });

  it("F-033-AC3 le langage changé par la règle de saisie, le sélecteur ou une mise à jour reçue recolore le bloc, ou le décolore pour « Texte brut » et une valeur hors liste, sans toucher au texte", () => {
    const { doc, emises } = monterLEditeur();
    entrerDansLEditeur();
    taper("```python ");
    taper("SELECT 'x'");
    const lire = () => portionsColorees(elementsCode()[0] as Element);
    const enPython = lire();

    const avantLeSelecteur = emises.length;
    choisirLeLangage("sql");
    const enSql = [lire(), emises.length - avantLeSelecteur] as const;
    choisirLeLangage("");
    const enTexteBrut = lire();
    recevoirDUneReplique(doc, (replique) => {
      blocsCodeDuFragment(replique.contenu)[0]?.setAttribute("language", "javascript");
    });
    const enJavascript = lire();
    recevoirDUneReplique(doc, (replique) => {
      blocsCodeDuFragment(replique.contenu)[0]?.setAttribute("language", "xml");
    });

    expect(enPython).toEqual([["'x'", "chaine"]]);
    expect(enSql).toEqual([
      [
        ["SELECT", "motCle"],
        ["'x'", "chaine"],
      ],
      1,
    ]);
    expect(enTexteBrut).toEqual([]);
    // En javascript, un nom tout en capitales est une constante : portée `variable.constant`.
    expect(enJavascript).toEqual([
      ["SELECT", "propriete"],
      ["'x'", "chaine"],
    ]);
    expect(lire()).toEqual([]);
    expect(textesDesBlocsCode(doc)).toEqual(["SELECT 'x'"]);
    expect(elementsCode()[0]?.textContent).toBe("SELECT 'x'");
  });
});

describe("coloration à la frappe", () => {
  it('F-033-AC4 caractère par caractère, le texte affiché est celui du document et le curseur suit la frappe ; à la fin, `const` est un mot-clé et `"x"` une chaîne', () => {
    const { doc } = monterLEditeur(documentDeBlocsCode(["typescript", ""]));
    entrerDansLEditeur();
    placerLeCurseurDansLeDernierBloc();
    const saisie = 'const a = "x";';

    [...saisie].forEach((caractere, rang) => {
      taper(caractere);

      expect(elementsCode()[0]?.textContent).toBe(saisie.slice(0, rang + 1));
      expect(textesDesBlocsCode(doc)).toEqual([saisie.slice(0, rang + 1)]);
      expect(curseurDansLeBloc()).toEqual({ bloc: 0, decalage: rang + 2 });
    });

    expect(portionsColorees(elementsCode()[0] as Element)).toEqual([
      ["const", "motCle"],
      ['"x"', "chaine"],
    ]);
  });

  it("F-033-AC4 effacer, coller, annuler et rétablir recolorent le texte dès la transaction, curseur en place", () => {
    const { doc } = monterLEditeur(documentDeBlocsCode(["javascript", "let a"]));
    entrerDansLEditeur();
    placerLeCurseurALaFinDe("let a");
    const lire = () => [
      elementsCode()[0]?.textContent,
      portionsColorees(elementsCode()[0] as Element),
    ];

    collerDuTexte(' = "b";');
    const apresCollage = [lire(), curseurDansLeBloc()];
    effacerAvantLeCurseur();
    effacerAvantLeCurseur();
    const apresEffacement = [lire(), curseurDansLeBloc()];
    // L'historique regroupe ces modifications rapprochées (H9) : une annulation les défait toutes.
    annuler();
    const apresAnnulation = [lire(), textesDesBlocsCode(doc)];
    retablir();
    const apresRetablissement = [lire(), textesDesBlocsCode(doc)];

    expect(apresCollage).toEqual([
      [
        'let a = "b";',
        [
          ["let", "motCle"],
          ['"b"', "chaine"],
        ],
      ],
      { bloc: 0, decalage: 13 },
    ]);
    expect(apresEffacement).toEqual([
      [
        'let a = "b',
        [
          ["let", "motCle"],
          ['"b', "chaine"],
        ],
      ],
      { bloc: 0, decalage: 11 },
    ]);
    expect(apresAnnulation).toEqual([["let a", [["let", "motCle"]]], ["let a"]]);
    expect(apresRetablissement).toEqual([
      [
        'let a = "b',
        [
          ["let", "motCle"],
          ['"b', "chaine"],
        ],
      ],
      ['let a = "b'],
    ]);
  });
});

/** Le document de version 3 de F-033-AC5 : la ligne 3, un bloc de chaque langage, 10 001 signes. */
function documentDeVersion3AvecLesDixLangages(): Y.Doc {
  const doc = documentDeLaLigne(3);
  Y.applyUpdate(
    doc,
    miseAJourDUneReplique(doc, (replique) => {
      ajouter(
        replique,
        ...ECHANTILLONS.map(([langage, texte]) => bloc("codeBlock", texte, { language: langage })),
        bloc("codeBlock", "x".repeat(10_001), { language: "typescript" }),
      );
    }),
  );
  return doc;
}

describe("rien de la coloration dans le document", () => {
  it.each(TABLE_DES_VERSIONS_PAGE.map((ligne) => ligne.version))(
    "F-033-AC5 un document de la ligne %s s'ouvre coloré sans aucune mise à jour",
    async (version) => {
      const doc =
        version === 3 ? documentDeVersion3AvecLesDixLangages() : documentDeLaLigne(version);
      const depart = [...Y.encodeStateAsUpdate(doc)];

      const { emises } = await afficherUnePage(doc);

      expect([emises.length, [...Y.encodeStateAsUpdate(doc)]]).toEqual([0, depart]);
      expect(lireVersionPage(doc)).toBe(version);
    },
  );

  it("F-033-AC5 un caractère saisi dans un bloc coloré donne une seule mise à jour, qui n'ajoute que ce caractère au fragment", async () => {
    const doc = documentDeVersion3AvecLesDixLangages();
    const { emises } = await afficherUnePage(doc);
    const avant = Y.encodeStateAsUpdate(doc);
    const fragmentAvant = fragmentBrut(doc).toString();
    const inventaireAvant = inventaireDuContenu(doc);
    const colorees = elementsCode().filter((code) => classesSous(code).length > 0);
    entrerDansLEditeur();
    placerLeCurseurALaFinDe('const s: string = "x";');

    taper("!");
    const copie = new Y.Doc();
    Y.applyUpdate(copie, avant);
    emises.forEach((miseAJour) => Y.applyUpdate(copie, miseAJour));

    // Les dix blocs, et le bloc `python` de la ligne 3.
    expect(colorees).toHaveLength(LANGAGES.length + 1);
    expect(emises).toHaveLength(1);
    expect(fragmentBrut(copie).toString()).toBe(
      fragmentAvant.replace('const s: string = "x";', 'const s: string = "x";!'),
    );
    expect(inventaireDuContenu(copie)).toEqual(inventaireAvant);
    expect(lireVersionPage(copie)).toBe(3);
  });
});

const HOSTILES =
  '<script>alert(1)</script>\n"><img src=x onerror=alert(1)>\nx fixed inset-0\nhljs-keyword';

describe("aucun HTML, aucune valeur du document dans le DOM", () => {
  it("F-033-AC6 F-003-AC20 des textes hostiles dans un bloc de chacun des dix langages : ni `script` ni `img`, textes tels quels, et seules des classes de la liste fermée", () => {
    const fenetre = window as Window & { alert?: unknown };
    const alerte = fenetre.alert;
    let alertes = 0;
    fenetre.alert = () => void (alertes += 1);
    const doc = documentDeBlocsCode(...LANGAGES.map((langage) => [langage, HOSTILES] as const));
    monterLEditeur(doc);

    const codes = elementsCode();
    const classes = codes.flatMap(classesSous);
    fenetre.alert = alerte;

    expect(codes).toHaveLength(10);
    expect(zoneDeSaisie().querySelectorAll("script, img")).toHaveLength(0);
    for (const code of codes) {
      expect(code.textContent).toBe(HOSTILES);
    }
    expect(classes.length).toBeGreaterThan(0);
    expect(classes.filter((classe) => !CLASSES_DE_ROLE_ADMISES.includes(classe))).toEqual([]);
    expect(zoneDeSaisie().querySelectorAll("[class*='hljs'], [class*='fixed']")).toHaveLength(0);
    expect(alertes).toBe(0);
  });
});

/** Le presse-papiers d'un événement `copy` ou `cut` : jsdom n'a pas `ClipboardEvent`. */
function copierLaSelection(type: "copy" | "cut"): Record<string, string> {
  const donnees: Record<string, string> = {};
  const evenement = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(evenement, "clipboardData", {
    value: {
      clearData: () => undefined,
      setData: (format: string, valeur: string) => void (donnees[format] = valeur),
      getData: (format: string) => donnees[format] ?? "",
    },
  });
  act(() => void zoneDeSaisie().dispatchEvent(evenement));
  return donnees;
}

describe("copie d'un bloc coloré", () => {
  it.each(["copy", "cut"] as const)(
    "F-033-AC7 par « %s », deux lignes d'un bloc `python` coloré : le texte exact en `text/plain`, aucune classe de rôle en `text/html`, et collées dans un autre bloc code, le même texte",
    (type) => {
      const deuxLignes = "a = 1\nb = 'x'";
      const doc = documentDeBlocsCode(["python", `${deuxLignes}\nc = 2`], [null, ""]);
      monterLEditeur(doc);
      entrerDansLEditeur();
      const coloree = classesSous(elementsCode()[0] as Element).length;
      selectionnerLeTexte(deuxLignes);

      const presse = copierLaSelection(type);
      placerLeCurseurDansLeDernierBloc();
      collerLesDonnees(presse);

      expect(coloree).toBeGreaterThan(0);
      expect(presse["text/plain"]).toBe(deuxLignes);
      expect(presse["text/html"]).toBeDefined();
      for (const classe of CLASSES_DE_ROLE_ADMISES) {
        expect(presse["text/html"]).not.toContain(classe);
      }
      expect(presse["text/html"]).not.toMatch(/<span/);
      expect(textesDesBlocsCode(doc)).toEqual([
        type === "copy" ? `${deuxLignes}\nc = 2` : "\nc = 2",
        deuxLignes,
      ]);
    },
  );
});

describe("lecture seule", () => {
  it("F-033-AC8 éditeur non modifiable : les blocs colorables sont colorés comme en écriture, sans rien écrire", () => {
    const doc = documentDeBlocsCode(
      ...ECHANTILLONS.map(([langage, texte]) => [langage, texte] as const),
    );
    const { emises } = monterLEditeur(doc, { lectureSeule: true });

    const codes = elementsCode();

    expect(zoneDeSaisie().getAttribute("contenteditable")).toBe("false");
    ECHANTILLONS.forEach(([, , attendues], rang) => {
      expect(portionsColorees(codes[rang] as Element)).toEqual(
        expect.arrayContaining(attendues.map(([portion, role]) => [portion, role])),
      );
    });
    expect(emises).toEqual([]);
  });
});

describe("mise à jour reçue pendant une saisie", () => {
  it("F-033-AC12 deux répliques reliées : l'une saisit dans un bloc `javascript` pendant que l'autre y insère une ligne et change le langage en `python` ; même texte des deux côtés, coloré en `python`", () => {
    const a = documentDeBlocsCode(["javascript", 'x = "a"\nprint(x)']);
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const versB = (miseAJour: Uint8Array, origine: unknown): void => {
      if (origine !== "de b") {
        Y.applyUpdate(b, miseAJour, "de a");
      }
    };
    const versA = (miseAJour: Uint8Array, origine: unknown): void => {
      if (origine !== "de a") {
        act(() => Y.applyUpdate(a, miseAJour, "de b"));
      }
    };
    a.on("update", versB);
    b.on("update", versA);
    const { emises } = monterLEditeur(a);
    entrerDansLEditeur();
    placerLeCurseurDans('x = "a"', 'x = "a"'.length);
    let leve: unknown;

    try {
      taper(";");
      const [blocDeB] = blocsCodeDuFragment(fragmentBrut(b));
      b.transact(() =>
        texteDuBloc(blocDeB as Y.XmlElement).insert(
          texteDuBloc(blocDeB as Y.XmlElement).length,
          "\nimport os",
        ),
      );
      taper(" #");
      b.transact(() => blocDeB?.setAttribute("language", "python"));
      taper(" fin");
    } catch (erreur) {
      leve = erreur;
    }
    const emisesParLaSaisie = emises.length;
    const enA = [elementsCode()[0]?.textContent, portionsColorees(elementsCode()[0] as Element)];
    demonterLEditeur();
    a.off("update", versB);
    b.off("update", versA);
    monterLEditeur(b);
    const enB = [elementsCode()[0]?.textContent, portionsColorees(elementsCode()[0] as Element)];

    expect(leve).toBeUndefined();
    expect(textesDesBlocsCode(a)).toEqual(['x = "a"; # fin\nprint(x)\nimport os']);
    expect(textesDesBlocsCode(b)).toEqual(textesDesBlocsCode(a));
    expect(contenuLu(a)).toBe(contenuLu(b));
    expect(enA).toEqual([
      'x = "a"; # fin\nprint(x)\nimport os',
      [
        ['"a"', "chaine"],
        ["# fin", "commentaire"],
        ["print", "motCle"],
        ["import", "motCle"],
      ],
    ]);
    expect(enB).toEqual(enA);
    // Sept caractères saisis en A, deux mises à jour reçues de B, rien de plus.
    expect(emisesParLaSaisie).toBe(9);
  });
});
