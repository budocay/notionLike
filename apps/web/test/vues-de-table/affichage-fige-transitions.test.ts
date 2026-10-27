// Les transitions de l'affichage figé, sans React ni table (F-019-AC17, AC18, AC19, H11) : une table
// de cas sur la fonction pure que le hook de l'affichage appelle.
import { describe, expect, it } from "vitest";

import {
  type EtatFige,
  etatFigeApres,
  lignesFigees,
} from "../../src/vues-de-table/lignes-affichees.ts";
import { colonne, table } from "./aides-definition.ts";

type Evenement = Parameters<typeof etatFigeApres>[1];

interface Cas {
  readonly nom: string;
  readonly avant: EtatFige;
  readonly evenement: Evenement;
  readonly apres: EtatFige;
}

const CAS: readonly Cas[] = [
  {
    nom: "une écriture de l'onglet sous un élément actif fige les lignes affichées",
    avant: undefined,
    evenement: { sorte: "ecriture", ids: ["a", "b"], actif: true },
    apres: ["a", "b"],
  },
  {
    nom: "une écriture sans filtre ni tri actif ne fige rien",
    avant: undefined,
    evenement: { sorte: "ecriture", ids: ["a", "b"], actif: false },
    apres: undefined,
  },
  {
    nom: "une écriture quand l'affichage est déjà figé le laisse tel quel",
    avant: ["b", "a"],
    evenement: { sorte: "ecriture", ids: ["a", "b", "c"], actif: true },
    apres: ["b", "a"],
  },
  {
    nom: "une ligne créée s'ajoute en dernière place d'un affichage figé",
    avant: ["a", "b"],
    evenement: { sorte: "creee", ligne: "z" },
    apres: ["a", "b", "z"],
  },
  {
    nom: "une ligne créée sans affichage figé ne le fige pas",
    avant: undefined,
    evenement: { sorte: "creee", ligne: "z" },
    apres: undefined,
  },
  {
    nom: "une ligne déplacée vers le haut passe avant sa voisine",
    avant: ["a", "b", "c"],
    evenement: { sorte: "deplacee", ligne: "c", voisine: "a" },
    apres: ["c", "a", "b"],
  },
  {
    nom: "une ligne déplacée vers le bas passe après sa voisine",
    avant: ["a", "b", "c"],
    evenement: { sorte: "deplacee", ligne: "a", voisine: "b" },
    apres: ["b", "a", "c"],
  },
  {
    nom: "une voisine absente de la liste figée laisse la liste telle quelle",
    avant: ["a", "b"],
    evenement: { sorte: "deplacee", ligne: "a", voisine: "x" },
    apres: ["a", "b"],
  },
  {
    nom: "une ligne absente de la liste figée laisse la liste telle quelle",
    avant: ["a", "b"],
    evenement: { sorte: "deplacee", ligne: "x", voisine: "a" },
    apres: ["a", "b"],
  },
  {
    nom: "un déplacement sans affichage figé ne le fige pas",
    avant: undefined,
    evenement: { sorte: "deplacee", ligne: "a", voisine: "b" },
    apres: undefined,
  },
  {
    nom: "une écriture refusée rend l'état d'avant : non figé",
    avant: ["a", "b"],
    evenement: { sorte: "refusee", avant: undefined },
    apres: undefined,
  },
  {
    nom: "une écriture refusée rend l'état d'avant : déjà figé",
    avant: ["a", "b"],
    evenement: { sorte: "refusee", avant: ["a", "b"] },
    apres: ["a", "b"],
  },
  {
    nom: "le recalcul (Réappliquer, définition modifiée, vue changée) lève l'affichage figé",
    avant: ["a", "b"],
    evenement: { sorte: "recalcul" },
    apres: undefined,
  },
  {
    nom: "le recalcul d'un affichage non figé le laisse non figé",
    avant: undefined,
    evenement: { sorte: "recalcul" },
    apres: undefined,
  },
];

describe("transitions de l'affichage figé (F-019-AC17, AC18, AC19)", () => {
  it.each(CAS)("F-019-AC17 F-019-AC18 F-019-AC19 $nom", ({ avant, evenement, apres }) => {
    expect(etatFigeApres(avant, evenement)).toEqual(apres);
  });

  it("F-019-AC17 aucune transition ne modifie la liste qu'elle reçoit", () => {
    const liste = Object.freeze(["a", "b", "c"]);
    for (const evenement of [
      { sorte: "creee", ligne: "z" },
      { sorte: "deplacee", ligne: "c", voisine: "a" },
    ] as const) {
      expect(() => etatFigeApres(liste, evenement)).not.toThrow();
    }
    expect(liste).toEqual(["a", "b", "c"]);
  });
});

describe("lignes d'un affichage figé (F-019-AC17)", () => {
  const t = table([colonne("n", "nombre")], [[1], [2], [3]]);

  it("F-019-AC17 les lignes figées gardent leur ordre et leur contenu du moment ; une ligne que la table ne porte plus disparaît ; une ligne absente de la liste n'y entre pas", () => {
    expect(lignesFigees(t, ["l2", "l0"]).map(({ id }) => id)).toEqual(["l2", "l0"]);
    expect(lignesFigees(t, ["l2", "disparue", "l0"]).map(({ id }) => id)).toEqual(["l2", "l0"]);
    expect(lignesFigees(t, ["l1"]).map(({ cellules }) => cellules[0])).toEqual([2]);
  });
});
