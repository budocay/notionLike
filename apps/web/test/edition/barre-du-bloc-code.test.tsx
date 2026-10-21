// Barre de blocs dans un bloc code (F-033-AC9, AC23) : la mention d'un bloc ou d'une ligne trop
// long, et l'aide de la sortie au clavier désignée par l'éditeur. La mesure réelle (360 pixels,
// barre qui ne couvre pas la ligne du curseur) est de bout en bout (F-033-AC26).
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { EDITION } from "../../src/interface/composants/edition.classes.ts";
import {
  AIDE_DU_BLOC_CODE,
  COLORATION_DESACTIVEE_BLOC,
  COLORATION_DESACTIVEE_LIGNE,
} from "../../src/interface/messages.ts";
import { lireDossier } from "../aides-disque.ts";
import { bloc, documentForge } from "../aides-facade-page.ts";
import { fautesDeTouches } from "../aides-touches.ts";
import { blocsCodeDuFragment, texteDuBloc } from "./aides-coloration.ts";
import {
  attributDeLEditeur,
  barreDeBlocs,
  effacerAvantLeCurseur,
  entrerDansLEditeur,
  monterLEditeur,
  placerLeCurseurDans,
  placerLeCurseurDansLeDernierBloc,
  recevoirDUneReplique,
  taper,
} from "./aides-edition.tsx";

/** Le texte de la mention de la barre, ou `null` sans mention. */
function mention(): string | null {
  const textes = [...(barreDeBlocs()?.querySelectorAll("p") ?? [])].map((p) => p.textContent);
  return textes.find((texte) => texte.startsWith("Coloration désactivée")) ?? null;
}

/** Un texte `javascript` de cette longueur, en lignes de cent signes au plus. */
function texteDeLongueur(longueur: number): string {
  const lignes = ['const a = "x";'];
  let total = lignes[0]?.length ?? 0;
  while (total < longueur) {
    const ligne = "b".repeat(Math.min(99, longueur - total - 1));
    lignes.push(ligne);
    total += ligne.length + 1;
  }
  return lignes.join("\n");
}

function recevoir(doc: Y.Doc, modifier: (texte: Y.XmlText) => void): void {
  recevoirDUneReplique(doc, (replique) => {
    modifier(texteDuBloc(blocsCodeDuFragment(replique.contenu)[0] as Y.XmlElement));
  });
}

describe("mention d'un bloc ou d'une ligne trop long", () => {
  it("F-033-AC9 par la frappe et par une mise à jour reçue : la mention du bloc de plus de 10 000 caractères paraît à 10 001 unités et se retire à 10 000", () => {
    const texte = texteDeLongueur(10_000);
    const { doc } = monterLEditeur(
      documentForge(bloc("codeBlock", texte, { language: "javascript" })),
    );
    entrerDansLEditeur();
    placerLeCurseurDans('const a = "x";', 'const a = "x";'.length);
    const lues = [mention()];

    taper("c");
    lues.push(mention());
    effacerAvantLeCurseur();
    lues.push(mention());
    recevoir(doc, (contenu) => contenu.insert(texte.length, "c"));
    lues.push(mention());
    recevoir(doc, (contenu) => contenu.delete(texte.length, 1));
    lues.push(mention());

    expect(texte).toHaveLength(10_000);
    expect(lues).toEqual([
      null,
      COLORATION_DESACTIVEE_BLOC,
      null,
      COLORATION_DESACTIVEE_BLOC,
      null,
    ]);
  });

  it("F-033-AC9 par la frappe et par une mise à jour reçue : dans un bloc court, la mention de la ligne de plus de 500 caractères paraît à 501 unités et se retire à 500", () => {
    const ligne = "b".repeat(500);
    const texte = `const a = "x";\n${ligne}`;
    const { doc } = monterLEditeur(
      documentForge(bloc("codeBlock", texte, { language: "javascript" })),
    );
    entrerDansLEditeur();
    placerLeCurseurDans(ligne, ligne.length);
    const lues = [mention()];

    taper("b");
    lues.push(mention());
    effacerAvantLeCurseur();
    lues.push(mention());
    recevoir(doc, (contenu) => contenu.insert(texte.length, "b"));
    lues.push(mention());
    recevoir(doc, (contenu) => contenu.delete(texte.length, 1));
    lues.push(mention());

    expect(lues).toEqual([
      null,
      COLORATION_DESACTIVEE_LIGNE,
      null,
      COLORATION_DESACTIVEE_LIGNE,
      null,
    ]);
  });

  it("F-033-AC9 plus de 10 000 unités et une ligne trop longue : la mention du bloc ; sans langage de la liste, aucune mention", () => {
    const long = `${"b".repeat(600)}\n${texteDeLongueur(10_000)}`;
    monterLEditeur(
      documentForge(bloc("codeBlock", long, { language: "javascript" }), bloc("codeBlock", long)),
    );
    entrerDansLEditeur();
    placerLeCurseurDans(long.slice(0, 600), 3);
    const avecLangage = mention();
    placerLeCurseurDansLeDernierBloc();

    expect(avecLangage).toBe(COLORATION_DESACTIVEE_BLOC);
    expect(mention()).toBeNull();
  });
});

describe("aide de la sortie au clavier", () => {
  it("F-033-AC23 la sélection dans un bloc code : la barre affiche l'aide et l'éditeur la désigne par `aria-describedby` ; hors du bloc code, la désignation est retirée", () => {
    monterLEditeur(
      documentForge(bloc("codeBlock", "ab", { language: "python" }), bloc("paragraph", "para")),
    );
    entrerDansLEditeur();
    placerLeCurseurDans("ab", 1);

    const designee = attributDeLEditeur("aria-describedby");
    const aide = designee === null ? null : document.getElementById(designee);
    const dansLaBarre = barreDeBlocs()?.contains(aide ?? null);
    placerLeCurseurDans("para", 2);

    expect(aide?.textContent).toBe(AIDE_DU_BLOC_CODE);
    expect(dansLaBarre).toBe(true);
    expect(attributDeLEditeur("aria-describedby")).toBeNull();
    expect(screen.queryByText(AIDE_DU_BLOC_CODE)).toBeNull();
  });

  it("F-033-AC23 éditeur en lecture seule : ni aide ni désignation", () => {
    monterLEditeur(documentForge(bloc("codeBlock", "ab", { language: "python" })), {
      lectureSeule: true,
    });
    entrerDansLEditeur();
    placerLeCurseurDans("ab", 1);

    expect(attributDeLEditeur("aria-describedby")).toBeNull();
    expect(screen.queryByText(AIDE_DU_BLOC_CODE)).toBeNull();
  });

  it("F-033-AC23 F-004-AC45 l'aide et la mention passent à la ligne sous les commandes, dans une barre qui se replie et ne dépasse pas la largeur de la zone", () => {
    monterLEditeur(documentForge(bloc("codeBlock", "ab", { language: "python" })));
    entrerDansLEditeur();
    placerLeCurseurDans("ab", 1);

    const barre = barreDeBlocs();
    const classesDeLAide = EDITION.aideDeBarre.split(" ");

    expect(barre?.className).toBe(EDITION.barreAvecAide);
    expect(EDITION.barreAvecAide.split(" ")).toEqual(
      expect.arrayContaining(["flex-wrap", "max-w-full", "barre-flottante"]),
    );
    expect(classesDeLAide).toContain("basis-full");
    expect(classesDeLAide.filter((classe) => /nowrap|truncate|^w-|^min-w-/.test(classe))).toEqual(
      [],
    );
  });

  it("F-033-AC23 F-004-AC31 Tab, Maj+Tab et Échap du bloc code sont des liaisons de l'éditeur : aucune touche lue ni modificateur écrit en dur dans les fichiers du bloc code", () => {
    const fichiers = new Map(
      [...lireDossier("src/edition")].filter(([chemin]) =>
        /\/(bloc-code|indentation|coloration|colorable)\.ts$/.test(chemin),
      ),
    );

    expect([...fichiers.keys()]).toHaveLength(4);
    expect(fautesDeTouches(fichiers, {})).toEqual([]);
  });
});
