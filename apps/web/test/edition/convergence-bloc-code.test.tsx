// Convergence autour du bloc code (F-005-AC30, AC31) : deux répliques modifiées séparément, chacune
// par un éditeur, puis échangées dans les deux ordres ; deux documents vierges reçoivent les mêmes
// mises à jour dans un ordre et dans l'autre.
import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { contenuLu } from "../aides-facade-page.ts";
import {
  choisirLeLangage,
  commande,
  demonterLEditeur,
  entrerDansLEditeur,
  monterLEditeur,
  placerLeCurseurDans,
  presser,
  selectionnerLeBloc,
  taper,
} from "./aides-edition.tsx";

/** Ce que fait chaque réplique, après un départ commun saisi par la première. */
interface Separation {
  readonly depart: () => void;
  readonly surA: () => void;
  readonly surB: () => void;
}

function replique(identifiant: number): Y.Doc {
  const doc = new Y.Doc();
  doc.clientID = identifiant;
  return doc;
}

/** Joue cette modification dans un éditeur monté sur ce document ; rend ce qu'il a émis depuis. */
function modifierPar(doc: Y.Doc, vecteur: Uint8Array, modifier: () => void): Uint8Array {
  monterLEditeur(doc);
  entrerDansLEditeur();
  modifier();
  demonterLEditeur();
  return Y.encodeStateAsUpdate(doc, vecteur);
}

/** Le contenu lu des deux répliques échangées, puis de deux tiers qui reçoivent tout. */
function apresEchange({ depart, surA, surB }: Separation): string[] {
  const a = replique(1);
  monterLEditeur(a);
  entrerDansLEditeur();
  depart();
  demonterLEditeur();
  const commun = Y.encodeStateAsUpdate(a);
  const vecteur = Y.encodeStateVector(a);
  const b = replique(2);
  Y.applyUpdate(b, commun);
  const deA = modifierPar(a, vecteur, surA);
  const deB = modifierPar(b, vecteur, surB);

  Y.applyUpdate(a, deB);
  Y.applyUpdate(b, deA);
  const tiers = [
    [deA, deB],
    [deB, deA],
  ].map((ordre, rang) => {
    const doc = replique(10 + rang);
    [commun, ...ordre].forEach((miseAJour) => Y.applyUpdate(doc, miseAJour));
    return doc;
  });
  return [a, b, ...tiers].map((doc) => contenuLu(doc).toLowerCase());
}

function blocCodeDeDeuxLignes(): void {
  taper("``` let a;");
  presser("Enter");
  taper("let b;");
}

describe("convergence dans un bloc code", () => {
  it("F-005-AC30 l'une saisit dans un bloc code pendant que l'autre en change le langage : le même contenu partout, avec le texte saisi et le langage choisi", () => {
    const lectures = apresEchange({
      depart: blocCodeDeDeuxLignes,
      surA: () => {
        placerLeCurseurDans("let a;", 3);
        taper("XY");
      },
      surB: () => {
        placerLeCurseurDans("let a;", 0);
        choisirLeLangage("json");
      },
    });

    expect(new Set(lectures).size).toBe(1);
    expect(lectures[0]).toBe('<codeblock language="json">letxy a;\nlet b;</codeblock>');
  });

  it("F-005-AC30 les deux saisissent en deux endroits du même bloc code : le même contenu partout, avec les deux saisies", () => {
    const lectures = apresEchange({
      depart: blocCodeDeDeuxLignes,
      surA: () => {
        placerLeCurseurDans("let a;", 0);
        taper("1");
      },
      surB: () => {
        placerLeCurseurDans("let b;", "let b;".length);
        taper("2");
      },
    });

    expect(new Set(lectures).size).toBe(1);
    expect(lectures[0]).toBe("<codeblock>1let a;\nlet b;2</codeblock>");
  });
});

describe("changement de type concurrent d'une saisie (limite acceptée)", () => {
  it.each(
    (["Titre 1", "Bloc code"] as const).flatMap((nom) =>
      (
        [
          ["au début", 0],
          ["au milieu", 1],
          ["à la fin", 3],
        ] as const
      ).map(([ou, decalage]) => [nom, ou, decalage] as const),
    ),
  )(
    "F-005-AC31 l'une donne « %s » au premier bloc pendant que l'autre y saisit « X » %s : le même contenu partout, le nouveau type et le texte de la première, sans « X »",
    (nom, _ou, decalage) => {
      const lectures = apresEchange({
        depart: () => {
          taper("abc");
          presser("Enter");
          taper("zzz");
        },
        surA: () => {
          placerLeCurseurDans("abc", 0);
          selectionnerLeBloc();
          act(() => commande(nom).click());
        },
        surB: () => {
          placerLeCurseurDans("abc", decalage);
          taper("X");
        },
      });

      const bloc =
        nom === "Titre 1" ? '<heading level="1">abc</heading>' : "<codeblock>abc</codeblock>";
      expect(new Set(lectures).size).toBe(1);
      expect(lectures[0]).toBe(`${bloc}<paragraph>zzz</paragraph>`);
    },
  );

  it.each([
    ["au début", 0],
    ["au milieu", 1],
    ["à la fin", 3],
  ] as const)(
    "F-005-AC31 l'une donne « Titre 1 », puis « Bloc code », au premier bloc pendant que l'autre y saisit « X » %s : le même contenu partout, un bloc code au texte de la première, sans « X »",
    (_ou, decalage) => {
      const lectures = apresEchange({
        depart: () => {
          taper("abc");
          presser("Enter");
          taper("zzz");
        },
        surA: () => {
          placerLeCurseurDans("abc", 0);
          selectionnerLeBloc();
          act(() => commande("Titre 1").click());
          selectionnerLeBloc();
          act(() => commande("Bloc code").click());
        },
        surB: () => {
          placerLeCurseurDans("abc", decalage);
          taper("X");
        },
      });

      expect(new Set(lectures).size).toBe(1);
      expect(lectures[0]).toBe("<codeblock>abc</codeblock><paragraph>zzz</paragraph>");
    },
  );
});
