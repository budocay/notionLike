// Ce que l'interface garantit et ne garantit pas d'un bloc déplacé (F-006-AC22 à AC26, H1, H2).
// Les répliques sont deux documents, modifiés tour à tour par l'éditeur sans rien échanger, comme
// deux appareils hors ligne, puis réunis dans les deux ordres. Les limites (saisie perdue, bloc
// dupliqué, suppression sans effet) sont des constats figés : si une version de la liaison les
// change, ces tests le diront.
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { fragmentBrut } from "../aides-facade-page.ts";
import {
  demonterLEditeur,
  entrerDansLEditeur,
  glisserLeBlocParSaPoignee,
  monterLEditeur,
  placerLeCurseurApres,
  placerLeCurseurDans,
  presser,
  selectionnerLeBloc,
  taper,
  textesDesBlocs,
} from "./aides-edition.tsx";

function ecrire(...textes: string[]): void {
  textes.forEach((texte, rang) => {
    if (rang > 0) {
      presser("Enter");
    }
    taper(texte);
  });
}

function docDuClient(identifiant: number): Y.Doc {
  const doc = new Y.Doc();
  doc.clientID = identifiant;
  return doc;
}

/** Texte de chaque bloc de premier niveau d'un document, lu dans son fragment. */
function blocs(doc: Y.Doc): string {
  return fragmentBrut(doc)
    .toArray()
    .map((element) =>
      element instanceof Y.XmlElement
        ? element
            .toArray()
            .map((enfant) => (enfant instanceof Y.XmlText ? enfant.toString() : ""))
            .join("")
        : "",
    )
    .join("|");
}

interface Scenario {
  readonly surA: () => void;
  readonly surB: () => void;
}

/**
 * « one|two|three » saisi, puis deux répliques modifiées chacune par l'éditeur, sans échange ; rend
 * ce que lit chacune après l'échange, et deux documents vierges qui reçoivent les mêmes mises à jour
 * dans un ordre et dans l'autre.
 */
function apresConvergence({ surA, surB }: Scenario): string[] {
  const a = docDuClient(1);
  monterLEditeur(a);
  entrerDansLEditeur();
  ecrire("one", "two", "three");
  const commun = Y.encodeStateAsUpdate(a);
  const vecteur = Y.encodeStateVector(a);
  const b = docDuClient(2);
  Y.applyUpdate(b, commun);
  surA();
  const deA = Y.encodeStateAsUpdate(a, vecteur);
  demonterLEditeur();
  monterLEditeur(b);
  entrerDansLEditeur();
  surB();
  const deB = Y.encodeStateAsUpdate(b, vecteur);
  demonterLEditeur();

  Y.applyUpdate(a, deB);
  Y.applyUpdate(b, deA);
  const tiers = [
    [deA, deB],
    [deB, deA],
  ].map((ordre, rang) => {
    const doc = docDuClient(10 + rang);
    [commun, ...ordre].forEach((miseAJour) => Y.applyUpdate(doc, miseAJour));
    return doc;
  });
  return [a, b, ...tiers].map(blocs);
}

const ONE_A_LA_FIN = (): void => void glisserLeBlocParSaPoignee(0, 3);

function supprimerLeBloc(texte: string): void {
  placerLeCurseurApres(texte);
  selectionnerLeBloc();
  presser("Backspace");
  presser("Backspace");
}

/** Générateur pseudo-aléatoire à graine fixe : le test se rejoue à l'identique. */
function hasard(graine: number): () => number {
  let etat = graine;
  return () => {
    etat = (etat * 1_103_515_245 + 12_345) % 2_147_483_648;
    return etat / 2_147_483_648;
  };
}

describe("garanti sur un seul appareil", () => {
  it("F-006-AC22 des déplacements tirés au hasard sur un document ne perdent ni ne dupliquent aucun bloc : après chacun, la suite des blocs est une permutation de celle d'origine", () => {
    monterLEditeur();
    entrerDansLEditeur();
    const origine = ["a", "b", "c", "d", "e", "f"];
    ecrire(...origine);
    const tirer = hasard(6);
    let deplaces = 0;

    for (let essai = 0; essai < 40; essai += 1) {
      const avant = textesDesBlocs();
      const de = Math.floor(tirer() * origine.length);
      const intervalle = Math.floor(tirer() * (origine.length + 1));
      glisserLeBlocParSaPoignee(de, intervalle);
      const apres = textesDesBlocs();
      expect([...apres].sort(), `essai ${essai}`).toEqual(origine);
      deplaces += apres.join() === avant.join() ? 0 : 1;
    }
    expect(deplaces).toBeGreaterThan(20);
  });
});

describe("garanti entre répliques", () => {
  it.each([
    [
      "modifie le texte d'un autre bloc",
      () => {
        placerLeCurseurApres("two");
        taper("X");
      },
      "twoX|three|one",
    ],
    [
      "ajoute un bloc",
      () => {
        placerLeCurseurApres("three");
        presser("Enter");
        taper("four");
      },
      // Deux insertions au même endroit : l'ordre est celui de la liaison, le même partout.
      "two|three|one|four",
    ],
    ["supprime un autre bloc", () => supprimerLeBloc("three"), "two|one"],
  ])(
    "F-006-AC23 une réplique déplace « one » pendant que l'autre %s : les deux lisent le même contenu, avec le déplacement et la modification, dans les deux ordres",
    (_cas, surB, attendu) => {
      const lectures = apresConvergence({ surA: ONE_A_LA_FIN, surB });

      expect(lectures).toEqual([attendu, attendu, attendu, attendu]);
    },
  );
});

describe("limites acceptées, constatées telles quelles (H1)", () => {
  it("F-006-AC24 une réplique déplace « one » à la fin pendant que l'autre y ajoute « X » : « two|three|one » sur les deux, la saisie est perdue", () => {
    const lectures = apresConvergence({
      surA: ONE_A_LA_FIN,
      surB: () => {
        placerLeCurseurApres("one");
        taper("X");
      },
    });

    expect(lectures).toEqual(Array(4).fill("two|three|one"));
  });

  it("F-006-AC25 deux répliques déplacent « one », à la fin et au milieu : « two|one|three|one » sur les deux, le bloc est dupliqué, et rien ne retire l'un des deux", () => {
    const lectures = apresConvergence({
      surA: ONE_A_LA_FIN,
      surB: () => void glisserLeBlocParSaPoignee(0, 2),
    });

    expect(lectures).toEqual(Array(4).fill("two|one|three|one"));
  });

  it.each([
    ["« one »", "one", "two|three|one"],
    ["« two »", "two", "three|one"],
  ])(
    "F-006-AC26 une réplique déplace « one » à la fin pendant que l'autre supprime %s : le bloc déplacé survit à sa nouvelle place, sur les deux, dans les deux ordres",
    (_cas, supprime, attendu) => {
      const lectures = apresConvergence({
        surA: ONE_A_LA_FIN,
        surB: () => supprimerLeBloc(supprime),
      });

      expect(lectures).toEqual(Array(4).fill(attendu));
    },
  );

  it("F-006-AC24 le curseur posé dans un autre bloc ne change rien au constat", () => {
    const lectures = apresConvergence({
      surA: () => {
        placerLeCurseurDans("three", 1);
        ONE_A_LA_FIN();
      },
      surB: () => {
        placerLeCurseurApres("one");
        taper("Y");
      },
    });

    expect(lectures).toEqual(Array(4).fill("two|three|one"));
  });
});
