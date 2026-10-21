// Limites et erreurs de la coloration du bloc code (F-033-AC9 sans la barre, AC10, AC11) : la
// bibliothèque de coloration est doublée, pour compter ses appels ou la faire lever ou mentir. La
// doublure enveloppe la vraie bibliothèque ; elle ne l'importe pas (F-033-AC25 : `vi.mock` n'est
// pas une importation, et aucun type de la bibliothèque n'est nommé ici).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { bloc, documentForge } from "../aides-facade-page.ts";
import {
  blocsCodeDuFragment,
  classesSous,
  elementsCode,
  portionsColorees,
  texteDuBloc,
  textesDesBlocsCode,
} from "./aides-coloration.ts";
import {
  annuler,
  collerDuTexte,
  effacerAvantLeCurseur,
  entrerDansLEditeur,
  monterLEditeur,
  placerLeCurseurALaFinDe,
  placerLeCurseurDans,
  presser,
  recevoirDUneReplique,
  taper,
  textesDesBlocs,
} from "./aides-edition.tsx";

/** Ce que la doublure fait d'un appel : passer, lever, ou rendre un arbre au texte changé. */
type Comportement = "passer" | "lever" | "mentir";

interface Arbre {
  readonly type: string;
  readonly children?: readonly unknown[];
}

interface Bibliotheque {
  highlight(langage: string, texte: string): Arbre;
  highlightAuto(texte: string): Arbre;
  registered(langage: string): boolean;
}

const doublure = vi.hoisted(() => ({
  appels: 0,
  appelsAutomatiques: 0,
  /** Le comportement d'un appel, selon le texte. */
  comportement: (_texte: string): "passer" | "lever" | "mentir" => "passer",
}));

vi.mock("lowlight", async (importOriginal) => {
  const vraie = await importOriginal<{ createLowlight: (grammaires: unknown) => Bibliotheque }>();
  return {
    ...vraie,
    createLowlight: (grammaires: unknown): Bibliotheque => {
      const bibliotheque = vraie.createLowlight(grammaires);
      return {
        ...bibliotheque,
        highlight: (langage, texte) => {
          doublure.appels += 1;
          const comportement: Comportement = doublure.comportement(texte);
          if (comportement === "lever") {
            throw new Error(`échec forgé sur « ${texte} »`);
          }
          if (comportement === "mentir") {
            // Même longueur, autre texte : le contrôle compare les chaînes, pas les longueurs.
            const autre = "Z".repeat(texte.length);
            return {
              type: "root",
              children: [
                {
                  type: "element",
                  tagName: "span",
                  properties: { className: ["hljs-keyword"] },
                  children: [{ type: "text", value: autre }],
                },
              ],
            };
          }
          return bibliotheque.highlight(langage, texte);
        },
        highlightAuto: (texte) => {
          doublure.appelsAutomatiques += 1;
          return bibliotheque.highlightAuto(texte);
        },
      };
    },
  };
});

beforeEach(() => {
  doublure.appels = 0;
  doublure.appelsAutomatiques = 0;
  doublure.comportement = () => "passer";
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Un texte `javascript` colorable de cette longueur, fait de lignes de cent signes au plus. */
function texteDeLongueur(longueur: number, ligne = 100): string {
  const tete = 'const a = "x";';
  let texte = tete;
  while (texte.length < longueur) {
    const reste = longueur - texte.length - 1;
    texte += `\n${"b".repeat(Math.min(ligne - 1, Math.max(reste, 0)))}`;
  }
  return texte.slice(0, longueur);
}

function premierCode(): Element {
  return elementsCode()[0] as Element;
}

function estColore(): boolean {
  return classesSous(premierCode()).length > 0;
}

describe("bloc ou ligne trop long", () => {
  it("F-033-AC9 par la frappe : coloré à 10 000 unités, plus à 10 001, de nouveau à 10 000, texte jamais tronqué", () => {
    const texte = texteDeLongueur(10_000);
    const { doc } = monterLEditeur(
      documentForge(bloc("codeBlock", texte, { language: "javascript" })),
    );
    entrerDansLEditeur();
    placerLeCurseurALaFinDe('const a = "x";');
    const avant = estColore();

    taper("c");
    const aDixMilleUn = [
      estColore(),
      premierCode().textContent?.length,
      textesDesBlocsCode(doc)[0],
    ];
    effacerAvantLeCurseur();

    expect(texte).toHaveLength(10_000);
    expect(avant).toBe(true);
    expect(aDixMilleUn).toEqual([false, 10_001, `${texte}c`]);
    expect(estColore()).toBe(true);
    expect(textesDesBlocsCode(doc)).toEqual([texte]);
  });

  it("F-033-AC9 par une mise à jour reçue : plus coloré à 10 001 unités, de nouveau à 10 000", () => {
    const texte = texteDeLongueur(10_000);
    const { doc, emises } = monterLEditeur(
      documentForge(bloc("codeBlock", texte, { language: "javascript" })),
    );
    const ajouterUnSigne = () =>
      recevoirDUneReplique(doc, (replique) => {
        const [premier] = blocsCodeDuFragment(replique.contenu);
        texteDuBloc(premier as Y.XmlElement).insert(texte.length, "c");
      });
    const retirerLeSigne = () =>
      recevoirDUneReplique(doc, (replique) => {
        const [premier] = blocsCodeDuFragment(replique.contenu);
        texteDuBloc(premier as Y.XmlElement).delete(texte.length, 1);
      });

    ajouterUnSigne();
    const aDixMilleUn = [estColore(), premierCode().textContent];
    retirerLeSigne();

    expect(aDixMilleUn).toEqual([false, `${texte}c`]);
    expect(estColore()).toBe(true);
    expect(premierCode().textContent).toBe(texte);
    expect(emises).toHaveLength(2);
  });

  it("F-033-AC9 par la frappe puis par une mise à jour reçue : une ligne de 501 unités ôte la coloration d'un bloc court, une ligne de 500 la rend", () => {
    const ligne = "b".repeat(499);
    const texte = `const a = "x";\n${ligne}\nfin`;
    const { doc } = monterLEditeur(
      documentForge(bloc("codeBlock", texte, { language: "javascript" })),
    );
    entrerDansLEditeur();
    placerLeCurseurDans(ligne, ligne.length);
    const lectures: boolean[] = [estColore()];

    taper("b");
    lectures.push(estColore());
    taper("b");
    lectures.push(estColore());
    effacerAvantLeCurseur();
    lectures.push(estColore());
    recevoirDUneReplique(doc, (replique) => {
      const [premier] = blocsCodeDuFragment(replique.contenu);
      texteDuBloc(premier as Y.XmlElement).insert(texte.indexOf(ligne), "b");
    });
    lectures.push(estColore());
    recevoirDUneReplique(doc, (replique) => {
      const [premier] = blocsCodeDuFragment(replique.contenu);
      texteDuBloc(premier as Y.XmlElement).delete(texte.indexOf(ligne), 1);
    });
    lectures.push(estColore());

    // 499, 500, 501, 500 par la frappe ; 501, 500 par une mise à jour reçue.
    expect(lectures).toEqual([true, true, false, true, false, true]);
    expect(textesDesBlocsCode(doc)).toEqual([`const a = "x";\n${ligne}b\nfin`]);
    expect(texte.length).toBeLessThan(10_000);
  });
});

/** Vingt blocs `javascript` aux textes deux à deux distincts, et un paragraphe à la fin. */
function documentDeVingtBlocs(): Y.Doc {
  return documentForge(
    ...Array.from({ length: 20 }, (_, rang) =>
      bloc("codeBlock", `const v${String(rang)} = ${String(rang)};`, { language: "javascript" }),
    ),
    bloc("paragraph", "paragraphe"),
  );
}

describe("recalcul borné", () => {
  it("F-033-AC10 vingt blocs colorés à l'ouverture ; une frappe dans l'un, puis une mise à jour reçue qui en modifie un autre, puis une qui ne touche qu'un paragraphe : un appel, un appel, aucun", () => {
    const { doc } = monterLEditeur(documentDeVingtBlocs());
    const aLOuverture = doublure.appels;
    entrerDansLEditeur();
    placerLeCurseurALaFinDe("const v3 = 3;");
    const appels: number[] = [];
    const compter = (agir: () => void): void => {
      const avant = doublure.appels;
      agir();
      appels.push(doublure.appels - avant);
    };

    compter(() => taper("x"));
    compter(() =>
      recevoirDUneReplique(doc, (replique) => {
        texteDuBloc(blocsCodeDuFragment(replique.contenu)[7] as Y.XmlElement).insert(0, "// ");
      }),
    );
    compter(() =>
      recevoirDUneReplique(doc, (replique) => {
        const paragraphe = replique.contenu.get(20) as Y.XmlElement;
        (paragraphe.get(0) as Y.XmlText).insert(0, "un ");
      }),
    );

    expect(aLOuverture).toBeGreaterThanOrEqual(20);
    expect(appels).toEqual([1, 1, 0]);
    expect(elementsCode().filter((code) => classesSous(code).length > 0)).toHaveLength(20);
    expect(textesDesBlocs().at(-1)).toBe("un paragraphe");
  });

  it("F-033-AC10 un collage recolore le seul bloc collé ; une annulation qui rend un texte déjà vu et le déplacement d'un bloc n'appellent pas la bibliothèque", () => {
    monterLEditeur(documentDeVingtBlocs());
    entrerDansLEditeur();
    placerLeCurseurALaFinDe("const v5 = 5;");
    const appels: number[] = [];
    const compter = (agir: () => void): void => {
      const avant = doublure.appels;
      agir();
      appels.push(doublure.appels - avant);
    };

    compter(() => collerDuTexte(" // collé"));
    compter(() => annuler());
    compter(() => presser("ArrowDown", { altKey: true, shiftKey: true }));

    expect(appels).toEqual([1, 0, 0]);
    expect(textesDesBlocs().slice(5, 7)).toEqual(["const v6 = 6;", "const v5 = 5;"]);
    expect(doublure.appelsAutomatiques).toBe(0);
  });
});

describe("échec de la coloration", () => {
  it.each(["lever", "mentir"] as const)(
    "F-033-AC11 la bibliothèque qui doit %s pour un bloc : ce bloc sans coloration, les autres colorés, aucune exception, un seul message sans extrait du texte, puis la saisie inscrite",
    (comportement) => {
      const erreurs = vi.spyOn(console, "error").mockImplementation(() => undefined);
      doublure.comportement = (texte) => (texte.includes("SECRET") ? comportement : "passer");
      let leve: unknown;
      let montage: ReturnType<typeof monterLEditeur> | undefined;
      const consignes: number[] = [];

      try {
        montage = monterLEditeur(
          documentForge(
            bloc("codeBlock", 'let SECRET = "piège";', { language: "javascript" }),
            bloc("codeBlock", 'let autre = "ok";', { language: "javascript" }),
          ),
        );
        // Sous `StrictMode`, comme l'application, l'effet crée un éditeur, le détruit et en crée
        // un second : chacun a sa mémoire, chacun consigne une fois.
        consignes.push(erreurs.mock.calls.length);
        entrerDansLEditeur();
        placerLeCurseurALaFinDe('let autre = "ok";');
        taper(" ");
        consignes.push(erreurs.mock.calls.length);
        placerLeCurseurALaFinDe('let SECRET = "piège";');
        taper("!");
        consignes.push(erreurs.mock.calls.length);
      } catch (erreur) {
        leve = erreur;
      }
      const [enEchec, colore] = elementsCode();
      const messages = erreurs.mock.calls.map((appel) => appel.map(String).join(" "));

      expect(leve).toBeUndefined();
      expect(enEchec?.querySelectorAll("*")).toHaveLength(0);
      expect(enEchec?.textContent).toBe('let SECRET = "piège";!');
      expect(portionsColorees(colore as Element)).toEqual([
        ["let", "motCle"],
        ['"ok"', "chaine"],
      ]);
      // Le texte d'origine consigné à l'ouverture, pas de nouveau par la frappe dans l'autre
      // bloc ; une fois de plus pour le texte saisi, nouveau.
      const [aLOuverture = 0] = consignes;
      expect(aLOuverture).toBeGreaterThanOrEqual(1);
      expect(consignes).toEqual([aLOuverture, aLOuverture, aLOuverture + 1]);
      for (const message of messages) {
        expect(message).not.toMatch(/SECRET|piège|let|échec forgé/);
        expect(message).toContain("javascript");
      }
      expect(textesDesBlocsCode(montage?.doc as Y.Doc)).toEqual([
        'let SECRET = "piège";!',
        'let autre = "ok"; ',
      ]);
    },
  );

  it("F-033-AC11 un texte en échec resté dans la page n'est consigné qu'une fois, quel que soit le nombre de transactions", () => {
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    doublure.comportement = (texte) => (texte.includes("SECRET") ? "lever" : "passer");
    monterLEditeur(
      documentForge(bloc("codeBlock", "SECRET", { language: "python" }), bloc("paragraph", "p")),
    );
    const aLOuverture = erreurs.mock.calls.length;
    entrerDansLEditeur();
    placerLeCurseurALaFinDe("p");

    taper("abc");
    presser("Enter");
    taper("de");

    expect(aLOuverture).toBeGreaterThanOrEqual(1);
    expect(erreurs).toHaveBeenCalledTimes(aLOuverture);
  });
});
