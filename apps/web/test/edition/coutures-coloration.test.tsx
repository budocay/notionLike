// Couture de F-033-AC24 : cette feature change le rendu et les touches de l'extension de bloc code
// livrée par F-005. Ses appelants et consommateurs sont énumérés dans les sources (liste fermée), et
// chacun est exercé ici sur un bloc coloré, coloration et indentation actives : l'éditeur monté est
// celui de l'application (`extensionsDeLEditeur`). Le format ne change pas (ADR-0018) : les tests de
// couture de F-005-AC28 et AC32 (`coutures-marques.test.tsx`) passent sans que leurs listes
// attendues changent.
import { TABLE_DES_VERSIONS_PAGE, VERSION_PAGE_PRISE_EN_CHARGE } from "@notionlike/document";
import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { PageDemonstration } from "../../src/demonstration/PageDemonstration.tsx";
import { CLASSES_DE_ROLE } from "../../src/interface/composants/Edition.tsx";
import { lire, lireDossier } from "../aides-disque.ts";
import { bloc, contenuLu, documentForge } from "../aides-facade-page.ts";
import { classesSous, elementsCode, textesDesBlocsCode } from "./aides-coloration.ts";
import {
  appelerUneCommandeDuBlocCode,
  barreDeBlocs,
  choisirLeLangage,
  collerLesDonnees,
  commande,
  entrerDansLEditeur,
  extensionsDeLEditeurMonte,
  glisserLeBlocParSaPoignee,
  laisserLeMenuSuivre,
  monterLEditeur,
  placerLeCurseurDans,
  placerLeCurseurDansLeDernierBloc,
  presser,
  schemaDeLEditeur,
  selectionnerLeBloc,
  selectionnerLeBlocEntier,
  taper,
  textesDesBlocs,
} from "./aides-edition.tsx";

// ——— Énumération des appelants et consommateurs ———

/** Ce qui nomme le bloc code, son extension, son langage, sa coloration ou ses classes de rôle. */
const NOMME_LE_BLOC_CODE =
  /\b(BLOC_CODE|BlocCode|choisirLeLangage|langageAdmis|LANGAGES|colorationDuBlocCode|selectionDuBlocCode|raisonSansColoration|CLASSES_DE_ROLE|CodeColore|ECHANTILLONS_DE_CODE)\b|["']codeBlock["']/;

/**
 * Liste fermée des appelants et consommateurs (F-033-AC24), chacun avec ses fichiers. La poignée,
 * le dépôt et le déplacement ne nomment pas le bloc code : ils agissent sur tout bloc, et sont
 * inscrits à la main.
 */
const CONSOMMATEURS = {
  "l'extension de bloc code, sa coloration, son indentation et la liste des langages": [
    "src/edition/bloc-code.ts",
    "src/edition/coloration.ts",
    "src/edition/colorable.ts",
    "src/edition/indentation.ts",
    "src/edition/langages.ts",
    "src/edition/commandes-de-bloc.ts",
  ],
  "le schéma de l'éditeur et l'élément de liste qui neutralise ses raccourcis dans un bloc code": [
    "src/edition/schema.ts",
  ],
  "la barre de blocs et le sélecteur de langage": [
    "src/edition/barre.ts",
    "src/edition/EditeurDePage.tsx",
    "src/interface/composants/Edition.tsx",
  ],
  "le menu slash": ["src/edition/menu-slash.ts"],
  "la règle de saisie": ["src/edition/bloc-code.ts"],
  "le collage, et le collage depuis un éditeur de code": ["src/edition/bloc-code.ts"],
  "les conversions de type de F-005-AC1": ["src/edition/types-de-bloc.ts"],
  "la poignée": ["src/edition/poignee.ts"],
  "le glisser-déposer et le dépôt de F-006": [
    "src/edition/depot.ts",
    "src/edition/deplacement-de-bloc.ts",
  ],
  "la garde des langages": ["src/edition/bloc-code.ts", "src/edition/langages.ts"],
  "la page de démonstration": [
    "src/demonstration/PageDemonstration.tsx",
    "src/demonstration/donnees.ts",
  ],
} as const satisfies Readonly<Record<string, readonly string[]>>;

type Consommateur = keyof typeof CONSOMMATEURS;

/** Les fichiers de ces sources qui nomment le bloc code et qu'aucun consommateur n'inscrit. */
function appelantsNonInscrits(
  sources: ReadonlyMap<string, string>,
  inscrits: Readonly<Record<string, readonly string[]>>,
): string[] {
  const fichiers = new Set(Object.values(inscrits).flat());
  return [...sources]
    .filter(([chemin, texte]) => /\.tsx?$/.test(chemin) && NOMME_LE_BLOC_CODE.test(texte))
    .map(([chemin]) => chemin)
    .filter((chemin) => !fichiers.has(chemin));
}

describe("couture : appelants et consommateurs du bloc code", () => {
  it("F-033-AC24 chaque fichier d'apps/web qui nomme le bloc code, sa coloration ou ses classes de rôle est inscrit à un consommateur, et chaque fichier inscrit existe", () => {
    const sources = lireDossier("src");
    const inscrits = [...new Set(Object.values(CONSOMMATEURS).flat())];

    expect(appelantsNonInscrits(sources, CONSOMMATEURS)).toEqual([]);
    expect(inscrits.filter((chemin) => !sources.has(chemin))).toEqual([]);
  });

  it("F-033-AC24 cas fautif : un fichier nouveau qui nomme le bloc code ou sa coloration est nommé", () => {
    const sources = new Map([
      ["src/edition/schema.ts", "BlocCode,"],
      ["src/edition/nouveau.ts", 'const nom = "codeBlock";'],
      ["src/interface/Autre.tsx", "CLASSES_DE_ROLE.motCle"],
      ["src/a.ts", "const a = 1;"],
    ]);

    expect(appelantsNonInscrits(sources, CONSOMMATEURS)).toEqual([
      "src/edition/nouveau.ts",
      "src/interface/Autre.tsx",
    ]);
  });

  it("F-033-AC24 F-005-AC23 le format ne change pas : version prise en charge 3, dernière ligne de la table au seul attribut `language` du bloc code, schéma de l'éditeur égal à elle", () => {
    monterLEditeur();
    const derniere = TABLE_DES_VERSIONS_PAGE.at(-1);

    expect(VERSION_PAGE_PRISE_EN_CHARGE).toBe(3);
    expect(TABLE_DES_VERSIONS_PAGE.map((ligne) => ligne.version)).toEqual([1, 2, 3]);
    expect(derniere?.noeuds.codeBlock).toEqual(["language"]);
    expect(schemaDeLEditeur().noeuds).toEqual(derniere?.noeuds);
    expect(lire("src/edition/schema.ts")).toMatch(/BlocCode,\n[^\n]*\n\s*colorationDuBlocCode,/);
  });
});

// ——— Chaque consommateur, sur un bloc coloré ———

const CODE = 'x = "a"';

/** Un éditeur sur un paragraphe, un bloc code `python` coloré, puis un paragraphe. */
function pageAvecUnBlocColore(): Y.Doc {
  const { doc } = monterLEditeur(
    documentForge(
      bloc("paragraph", "avant"),
      bloc("codeBlock", CODE, { language: "python" }),
      bloc("paragraph", "après"),
    ),
  );
  entrerDansLEditeur();
  return doc;
}

/** Le bloc code d'indice donné est coloré, et son texte affiché est celui du document. */
function colore(doc: Y.Doc, indice = 0): boolean {
  const code = elementsCode()[indice];
  return (
    code !== undefined &&
    classesSous(code).length > 0 &&
    code.textContent === textesDesBlocsCode(doc)[indice]
  );
}

const JEUX: Readonly<Record<Consommateur, () => Promise<void> | void>> = {
  "l'extension de bloc code, sa coloration, son indentation et la liste des langages": () => {
    const doc = pageAvecUnBlocColore();
    placerLeCurseurDans(CODE, 0);

    presser("Tab");

    expect(extensionsDeLEditeurMonte()).toEqual(
      expect.arrayContaining(["codeBlock", "colorationDuBlocCode"]),
    );
    expect(textesDesBlocsCode(doc)).toEqual([`  ${CODE}`]);
    expect(colore(doc)).toBe(true);
  },
  "le schéma de l'éditeur et l'élément de liste qui neutralise ses raccourcis dans un bloc code":
    () => {
      const liste = new Y.XmlElement("bulletList");
      const element = new Y.XmlElement("listItem");
      element.insert(0, [
        bloc("paragraph", "élément"),
        bloc("codeBlock", CODE, { language: "python" }),
      ]);
      liste.insert(0, [element]);
      const doc = documentForge(liste);
      monterLEditeur(doc);
      entrerDansLEditeur();
      placerLeCurseurDans(CODE, 0);
      const avant = contenuLu(doc);

      presser("Tab");
      presser("Tab", { shiftKey: true });

      expect(contenuLu(doc)).toBe(avant);
      expect(colore(doc)).toBe(true);
    },
  "la barre de blocs et le sélecteur de langage": () => {
    const doc = pageAvecUnBlocColore();
    placerLeCurseurDans(CODE, 1);

    choisirLeLangage("javascript");

    expect(barreDeBlocs()?.textContent).toContain("Tab indente");
    expect(colore(doc)).toBe(true);
    expect(textesDesBlocsCode(doc)).toEqual([CODE]);
  },
  "le menu slash": async () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("/");
    await laisserLeMenuSuivre();
    taper("cod");
    await laisserLeMenuSuivre();
    presser("Enter");
    await laisserLeMenuSuivre();
    taper(CODE);
    choisirLeLangage("python");

    expect(textesDesBlocsCode(doc)).toEqual([CODE]);
    expect(colore(doc)).toBe(true);
  },
  "la règle de saisie": () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();

    taper("```python ");
    taper(CODE);
    presser("Enter");

    expect(textesDesBlocsCode(doc)).toEqual([`${CODE}\n`]);
    expect(colore(doc)).toBe(true);
  },
  "le collage, et le collage depuis un éditeur de code": () => {
    const doc = pageAvecUnBlocColore();
    placerLeCurseurDans(CODE, CODE.length);
    collerLesDonnees({ "text/plain": "\ny = 1", "text/html": "<p>y = <b>1</b></p>" });
    placerLeCurseurDansLeDernierBloc();

    collerLesDonnees({
      "vscode-editor-data": '{"mode":"python"}',
      "text/plain": "z = 2",
    });

    expect(textesDesBlocsCode(doc)).toEqual([`${CODE}\ny = 1`, "z = 2"]);
    expect(colore(doc)).toBe(true);
    expect(classesSous(elementsCode()[1] as Element)).toEqual([]);
  },
  "les conversions de type de F-005-AC1": () => {
    const doc = pageAvecUnBlocColore();
    placerLeCurseurDans(CODE, 1);
    selectionnerLeBloc();

    act(() => commande("Paragraphe").click());
    const enParagraphe = textesDesBlocsCode(doc);
    selectionnerLeBloc();
    act(() => commande("Bloc code").click());
    choisirLeLangage("python");

    expect(enParagraphe).toEqual([]);
    expect(textesDesBlocs()).toEqual(["avant", CODE, "après"]);
    expect(colore(doc)).toBe(true);
  },
  "la poignée": () => {
    const doc = pageAvecUnBlocColore();

    selectionnerLeBlocEntier(1);
    presser("Tab");

    expect(textesDesBlocsCode(doc)).toEqual([`  ${CODE}`]);
    expect(colore(doc)).toBe(true);
  },
  "le glisser-déposer et le dépôt de F-006": () => {
    const doc = pageAvecUnBlocColore();

    glisserLeBlocParSaPoignee(1, 3);
    const apresLeGlisser = textesDesBlocs();
    placerLeCurseurDans(CODE, 1);
    presser("ArrowUp", { altKey: true, shiftKey: true });

    expect(apresLeGlisser).toEqual(["avant", "après", CODE]);
    expect(textesDesBlocs()).toEqual(["avant", CODE, "après"]);
    expect(colore(doc)).toBe(true);
  },
  "la garde des langages": () => {
    const doc = pageAvecUnBlocColore();
    placerLeCurseurDans(CODE, 1);

    appelerUneCommandeDuBlocCode("updateAttributes", "xml");

    expect(classesSous(elementsCode()[0] as Element)).toEqual([]);
    expect(contenuLu(doc)).not.toContain("xml");
    appelerUneCommandeDuBlocCode("updateAttributes", "python");
    expect(colore(doc)).toBe(true);
  },
  "la page de démonstration": () => {
    const { container } = render(<PageDemonstration jetons={lire("src/styles/jetons.css")} />);

    for (const classe of Object.values(CLASSES_DE_ROLE)) {
      expect(container.getElementsByClassName(classe).length, classe).toBeGreaterThan(0);
    }
  },
};

describe("couture : chaque consommateur exercé sur un bloc coloré", () => {
  it("F-033-AC24 chaque consommateur inscrit a son jeu ici, et aucun jeu n'est orphelin", () => {
    expect(Object.keys(JEUX).sort()).toEqual(Object.keys(CONSOMMATEURS).sort());
  });

  it.each(Object.keys(CONSOMMATEURS) as Consommateur[])(
    "F-033-AC24 %s : exercé coloration et indentation actives",
    async (consommateur) => {
      await JEUX[consommateur]();
    },
  );
});
