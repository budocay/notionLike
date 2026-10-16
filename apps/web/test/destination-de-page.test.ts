// Destination d'un déplacement de page (F-006-AC4, AC5, AC6, AC11, AC13) : la fonction pure, sa
// table de cas tenue en un seul endroit, puis ce que `deplacerPage` fait réellement de chaque
// destination rendue, sur un document d'espace, et l'équivalence entre gestes et commandes.
import type { DocumentEspace, Emplacement, IdPage, PageLue } from "@notionlike/document";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  COMMANDES_DE_DEPLACEMENT,
  type CommandeDeDeplacement,
  type Destination,
  destinationDeLaCommande,
  destinationDuDepot,
  placeApres,
  type ZoneDeLaCible,
} from "../src/interface/destination-de-page.ts";
import { creerFacade, ouvrirFacade } from "./aides-facade.ts";

// Arborescence d'essai : six pages sur trois niveaux.
//   A ─ A1
//     └ A2 ─ A2a
//   B
//   C
const PLAN: readonly (readonly [string, string | null])[] = [
  ["A", null],
  ["A1", "A"],
  ["A2", "A"],
  ["A2a", "A2"],
  ["B", null],
  ["C", null],
];
const ZONES: readonly ZoneDeLaCible[] = ["avant", "apres", "dans"];

interface Espace {
  readonly etat: Uint8Array;
  readonly id: (titre: string) => IdPage;
  readonly titre: (id: IdPage | null) => string | null;
}

function creerLEspace(): Espace {
  const facade = creerFacade();
  const ids = new Map<string, IdPage>();
  for (const [titre, parent] of PLAN) {
    ids.set(
      titre,
      facade.creerPage(titre, { parent: parent === null ? null : (ids.get(parent) ?? null) }),
    );
  }
  const titres = new Map([...ids].map(([titre, id]) => [id, titre]));
  return {
    etat: Y.encodeStateAsUpdate(facade.doc),
    id: (titre) => ids.get(titre) ?? titre,
    titre: (id) => (id === null ? null : (titres.get(id) ?? id)),
  };
}

/** Ouvre une façade sur une copie de l'état, la donne à `agir`, et rend l'état d'après. */
function surUneCopie(etat: Uint8Array, agir: (facade: DocumentEspace) => void): Uint8Array {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, etat);
  agir(ouvrirFacade(doc));
  return Y.encodeStateAsUpdate(doc);
}

function racinesDe(etat: Uint8Array): readonly PageLue[] {
  let racines: readonly PageLue[] = [];
  surUneCopie(etat, (facade) => {
    racines = facade.lire().racines;
  });
  return racines;
}

/** L'arborescence en titres : `A(A1,A2(A2a)),B,C`. */
function enTitres(pages: readonly PageLue[]): string {
  return pages
    .map(({ titre, enfants }) => (enfants.length === 0 ? titre : `${titre}(${enTitres(enfants)})`))
    .join(",");
}

/** La destination, les identifiants remplacés par les titres. */
function lisible(espace: Espace, destination: Destination): unknown {
  if (destination.sorte !== "deplacer") {
    return destination.sorte;
  }
  const { parent, position } = destination.ou;
  return position === undefined
    ? { parent: espace.titre(parent) }
    : { parent: espace.titre(parent), position };
}

// F-006-AC4 : la table de cas, tenue ici et nulle part ailleurs. Chaque ligne : page, cible, zone,
// destination attendue, arborescence après `deplacerPage` (« = » : rien n'est appelé).
const CAS_DU_DEPOT: readonly (readonly [string, string, string, ZoneDeLaCible, unknown, string])[] =
  [
    [
      "vers le bas sous le même parent",
      "A",
      "B",
      "apres",
      { parent: null, position: 1 },
      "B,A(A1,A2(A2a)),C",
    ],
    [
      "vers le haut sous le même parent",
      "C",
      "B",
      "avant",
      { parent: null, position: 1 },
      "A(A1,A2(A2a)),C,B",
    ],
    [
      "vers la première place",
      "C",
      "A",
      "avant",
      { parent: null, position: 0 },
      "C,A(A1,A2(A2a)),B",
    ],
    [
      "vers la dernière place",
      "A",
      "C",
      "apres",
      { parent: null, position: 2 },
      "B,C,A(A1,A2(A2a))",
    ],
    ["vers un autre parent", "B", "A2", "avant", { parent: "A", position: 1 }, "A(A1,B,A2(A2a)),C"],
    [
      "vers un autre parent, après la cible",
      "C",
      "A1",
      "apres",
      { parent: "A", position: 1 },
      "A(A1,C,A2(A2a)),B",
    ],
    ["vers la racine", "A2a", "B", "apres", { parent: null, position: 2 }, "A(A1,A2),B,A2a,C"],
    ["dans une page sans sous-page", "C", "B", "dans", { parent: "B" }, "A(A1,A2(A2a)),B(C)"],
    [
      "dans une page qui a des sous-pages, en dernière",
      "B",
      "A",
      "dans",
      { parent: "A" },
      "A(A1,A2(A2a),B),C",
    ],
    [
      "une sous-page vers la fin de sa mère",
      "A1",
      "A",
      "dans",
      { parent: "A" },
      "A(A2(A2a),A1),B,C",
    ],
    ["une page avec sa descendance", "A", "A1", "dans", "refusee", "="],
    ["refusé : sur sa propre rangée, avant", "A", "A", "avant", "refusee", "="],
    ["refusé : dans sa propre rangée", "B", "B", "dans", "refusee", "="],
    ["refusé : avant une descendante", "A", "A1", "avant", "refusee", "="],
    ["refusé : après une petite-fille", "A", "A2a", "apres", "refusee", "="],
    ["refusé : dans une descendante", "A", "A2", "dans", "refusee", "="],
    ["sans effet : juste avant sa suivante", "A", "B", "avant", "sans-effet", "="],
    ["sans effet : juste après sa précédente", "B", "A", "apres", "sans-effet", "="],
    ["sans effet : avant sa suivante, au milieu", "B", "C", "avant", "sans-effet", "="],
    ["sans effet : dans sa mère, déjà dernière", "A2", "A", "dans", "sans-effet", "="],
    ["sans effet : après sa précédente, sous-page", "A2", "A1", "apres", "sans-effet", "="],
  ];

describe("destination d'un lâcher", () => {
  it.each(CAS_DU_DEPOT)(
    "F-006-AC4 F-006-AC5 F-006-AC6 %s : %s sur %s, %s",
    (_cas, page, cible, zone, attendue, apres) => {
      const espace = creerLEspace();
      const racines = racinesDe(espace.etat);

      const destination = destinationDuDepot(racines, espace.id(page), espace.id(cible), zone);

      expect(lisible(espace, destination)).toEqual(attendue);
      if (destination.sorte === "deplacer") {
        const suite = surUneCopie(espace.etat, (facade) =>
          facade.deplacerPage(espace.id(page), destination.ou),
        );
        expect(enTitres(racinesDe(suite))).toBe(apres);
      } else {
        expect(apres).toBe("=");
      }
    },
  );

  it("F-006-AC6 F-006-AC8 une page ou une cible qui n'est plus dans l'arborescence lue n'a aucune destination", () => {
    const espace = creerLEspace();
    const racines = racinesDe(espace.etat);

    expect(destinationDuDepot(racines, "disparue", espace.id("B"), "avant").sorte).toBe("refusee");
    expect(destinationDuDepot(racines, espace.id("B"), "disparue", "dans").sorte).toBe("refusee");
    expect(destinationDuDepot([], espace.id("B"), espace.id("A"), "apres").sorte).toBe("refusee");
  });

  // Toute combinaison de l'arborescence d'essai : la page arrive juste avant, juste après ou en
  // dernière sous-page de la cible ; un refus vise exactement la page et sa descendance ; « sans
  // effet » est exactement le cas où `deplacerPage` ne changerait rien.
  it("F-006-AC4 F-006-AC5 F-006-AC6 sur toutes les combinaisons de page, de cible et de zone, la destination rendue place la page là où la zone le dit, et seulement elle", () => {
    const espace = creerLEspace();
    const racines = racinesDe(espace.etat);
    const titres = PLAN.map(([titre]) => titre);
    let deplacements = 0;

    for (const page of titres) {
      for (const cible of titres) {
        for (const zone of ZONES) {
          const destination = destinationDuDepot(racines, espace.id(page), espace.id(cible), zone);
          const descendante = estDescendante(racines, espace.id(page), espace.id(cible));
          expect(destination.sorte === "refusee", `${page} ${zone} ${cible}`).toBe(descendante);
          if (destination.sorte === "deplacer") {
            deplacements += 1;
            const suite = racinesDe(
              surUneCopie(espace.etat, (facade) =>
                facade.deplacerPage(espace.id(page), destination.ou),
              ),
            );
            expect(voisinage(suite, espace.id(page), espace.id(cible), zone)).toBe(true);
            expect(enTitres(suite)).not.toBe(enTitres(racines));
          }
          if (destination.sorte === "sans-effet") {
            expect(voisinage(racines, espace.id(page), espace.id(cible), zone)).toBe(true);
          }
        }
      }
    }
    expect(deplacements).toBeGreaterThan(30);
  });
});

function estDescendante(racines: readonly PageLue[], id: IdPage, cible: IdPage): boolean {
  const page = chercher(racines, id);
  return page !== undefined && chercher([page], cible) !== undefined;
}

function chercher(pages: readonly PageLue[], id: IdPage): PageLue | undefined {
  for (const page of pages) {
    const trouvee = page.id === id ? page : chercher(page.enfants, id);
    if (trouvee !== undefined) {
      return trouvee;
    }
  }
  return undefined;
}

/** Vrai si la page est juste avant, juste après, ou dernière sous-page de la cible. */
function voisinage(
  racines: readonly PageLue[],
  id: IdPage,
  cible: IdPage,
  zone: ZoneDeLaCible,
): boolean {
  if (zone === "dans") {
    return chercher(racines, cible)?.enfants.at(-1)?.id === id;
  }
  const fratrie = fratrieDe(racines, cible);
  const rang = fratrie.findIndex((soeur) => soeur.id === cible);
  return fratrie[zone === "avant" ? rang - 1 : rang + 1]?.id === id;
}

function fratrieDe(pages: readonly PageLue[], id: IdPage): readonly PageLue[] {
  if (pages.some((page) => page.id === id)) {
    return pages;
  }
  for (const page of pages) {
    const fratrie = fratrieDe(page.enfants, id);
    if (fratrie.length > 0) {
      return fratrie;
    }
  }
  return [];
}

// F-006-AC11 : une commande sans destination est « sans effet », donc exposée indisponible.
const CAS_DES_COMMANDES: readonly (readonly [string, CommandeDeDeplacement, unknown])[] = [
  ["A", "monter", "sans-effet"],
  ["C", "descendre", "sans-effet"],
  ["A1", "sous-la-precedente", "sans-effet"],
  ["B", "sortir", "sans-effet"],
  ["B", "monter", { parent: null, position: 0 }],
  ["B", "descendre", { parent: null, position: 2 }],
  ["B", "sous-la-precedente", { parent: "A" }],
  ["A2", "sous-la-precedente", { parent: "A1" }],
  ["A2a", "sortir", { parent: "A", position: 2 }],
  ["A1", "sortir", { parent: null, position: 1 }],
  ["A2", "monter", { parent: "A", position: 0 }],
];

describe("destination d'une commande", () => {
  it.each(CAS_DES_COMMANDES)("F-006-AC10 F-006-AC11 %s : %s", (page, commande, attendue) => {
    const espace = creerLEspace();

    const destination = destinationDeLaCommande(racinesDe(espace.etat), espace.id(page), commande);

    expect(lisible(espace, destination)).toEqual(attendue);
  });

  it("F-006-AC11 une page absente de l'arborescence lue n'a de destination pour aucune commande", () => {
    const espace = creerLEspace();

    for (const commande of COMMANDES_DE_DEPLACEMENT) {
      expect(destinationDeLaCommande(racinesDe(espace.etat), "absente", commande).sorte).toBe(
        "refusee",
      );
    }
  });

  it("F-006-AC12 la place annoncée est lue dans l'arborescence d'avant : mère, rang à partir de 1 et nombre de sœurs, page comprise", () => {
    const espace = creerLEspace();
    const racines = racinesDe(espace.etat);
    const a = espace.id("A");

    expect(placeApres(racines, espace.id("B"), { parent: a })).toMatchObject({ rang: 3, total: 3 });
    expect(placeApres(racines, espace.id("B"), { parent: a })?.parent?.titre).toBe("A");
    expect(placeApres(racines, espace.id("B"), { parent: null, position: 0 })).toEqual({
      parent: undefined,
      rang: 1,
      total: 3,
    });
    expect(placeApres(racines, espace.id("B"), { parent: "absente" })).toBeUndefined();
  });
});

/** Où est la page : `titre-de-la-mère:rang`. */
function placeLue(espace: Espace, racines: readonly PageLue[], id: IdPage): string {
  const fratrie = fratrieDe(racines, id);
  const mere = chercherLaMere(racines, id);
  return `${espace.titre(mere ?? null) ?? "racine"}:${fratrie.findIndex((p) => p.id === id)}`;
}

function chercherLaMere(pages: readonly PageLue[], id: IdPage, mere?: IdPage): IdPage | undefined {
  for (const page of pages) {
    if (page.id === id) {
      return mere;
    }
    const trouvee = chercherLaMere(page.enfants, id, page.id);
    if (trouvee !== undefined) {
      return trouvee;
    }
  }
  return undefined;
}

/** Toutes les places atteintes par la page en partant de `etat`, par les seules quatre commandes. */
function placesAtteintes(espace: Espace, etat: Uint8Array, id: IdPage): Set<string> {
  const vues = new Map<string, Uint8Array>([[placeLue(espace, racinesDe(etat), id), etat]]);
  const aVoir = [etat];
  for (let courant = aVoir.shift(); courant !== undefined; courant = aVoir.shift()) {
    const racines = racinesDe(courant);
    for (const commande of COMMANDES_DE_DEPLACEMENT) {
      const destination = destinationDeLaCommande(racines, id, commande);
      if (destination.sorte !== "deplacer") {
        continue;
      }
      const ou: Emplacement = destination.ou;
      const suite = surUneCopie(courant, (facade) => facade.deplacerPage(id, ou));
      const place = placeLue(espace, racinesDe(suite), id);
      if (!vues.has(place)) {
        vues.set(place, suite);
        aVoir.push(suite);
      }
    }
  }
  return new Set(vues.keys());
}

describe("équivalence des gestes et des commandes", () => {
  it("F-006-AC13 F-006-AC28 sur six pages et trois niveaux, chaque destination qu'un lâcher accepte est atteinte par une suite des quatre commandes", () => {
    const espace = creerLEspace();
    const racines = racinesDe(espace.etat);
    let destinations = 0;

    for (const [page] of PLAN) {
      const id = espace.id(page);
      const atteintes = placesAtteintes(espace, espace.etat, id);
      for (const [cible] of PLAN) {
        for (const zone of ZONES) {
          const destination = destinationDuDepot(racines, id, espace.id(cible), zone);
          if (destination.sorte === "deplacer") {
            destinations += 1;
            const suite = surUneCopie(espace.etat, (facade) =>
              facade.deplacerPage(id, destination.ou),
            );
            const visee = placeLue(espace, racinesDe(suite), id);
            expect(atteintes.has(visee), `${page} ${zone} ${cible} → ${visee}`).toBe(true);
          }
        }
      }
    }
    expect(destinations).toBeGreaterThan(30);
  });
});
