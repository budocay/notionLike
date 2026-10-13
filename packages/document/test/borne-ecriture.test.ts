// F-029, écriture : aucun rang hors borne écrit, réattribution élargie à la borne, refus typé en
// dernier recours, convergence préservée.
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { type DocumentEspace, ouvrirDocumentEspaceBorne } from "../src/document-espace.ts";
import { admettrePlace } from "../src/format.ts";
import type { IdPage, PageLue } from "../src/index.ts";
import {
  BORNE,
  codeDuRefus,
  ecrireEntrees,
  ecrituresDePlace,
  type Entree,
  estAdmis,
  id,
  identifiantsLus,
  idsDe,
  misesAJourPendant,
  placesDuDoc,
  trouver,
} from "./aides-borne.ts";
import {
  creerReplique,
  fixerDesIdentifiantsDisperses,
  GRAINE,
  lecturesDansTousLesOrdres,
  livrer,
  NOMBRE_EXECUTIONS,
  type Replique,
} from "./aides.ts";

const PRES_DE_LA_BORNE = "V".repeat(BORNE - 1);
const Z_A_LA_BORNE = "z".repeat(BORNE);
const ZEROS_PUIS_UN = `${"0".repeat(BORNE - 1)}1`;
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

afterEach(() => {
  vi.restoreAllMocks();
});

function semer(entrees: ReadonlyArray<[IdPage, Entree]>, clientID = 1): Replique {
  const replique = creerReplique(clientID);
  ecrireEntrees(replique.espace.doc, new Map(entrees));
  return replique;
}

function soeursLues(espace: DocumentEspace, parent: IdPage | null): readonly PageLue[] {
  const { racines } = espace.lire();
  return parent === null ? racines : (trouver(racines, parent)?.enfants ?? []);
}

interface Constat {
  readonly nouvelle: IdPage;
  readonly ecritures: Map<IdPage, number>;
}

/**
 * Applique une création ou un déplacement et vérifie tout ce que F-029-AC7 exige de l'opération :
 * réussite, page lue à la position demandée, ordre relatif des autres sœurs inchangé, une écriture
 * de place au plus par page, parent enregistré recopié, corbeille intacte, une seule mise à jour,
 * et rien que des rangs admis dans le document.
 */
function constaterLInsertion(
  espace: DocumentEspace,
  parent: IdPage | null,
  position: number,
  operation: () => IdPage,
  borne = BORNE,
): Constat {
  const doc = espace.doc;
  const avant = placesDuDoc(doc);
  const corbeilleAvant = espace.lire().corbeille;
  const idsDeLaCorbeille = identifiantsLus({ racines: [], corbeille: corbeilleAvant });
  let nouvelle = "";
  const soeursAvant = idsDe(soeursLues(espace, parent));
  let emises: Uint8Array[] = [];
  const ecritures = ecrituresDePlace(doc, () => {
    emises = misesAJourPendant(doc, () => {
      nouvelle = operation();
    });
  });

  const soeursApres = idsDe(soeursLues(espace, parent));
  expect(soeursApres[position]).toBe(nouvelle);
  expect(soeursApres.filter((soeur) => soeur !== nouvelle)).toEqual(
    soeursAvant.filter((soeur) => soeur !== nouvelle),
  );
  expect([...ecritures.values()].every((nombre) => nombre === 1)).toBe(true);
  const apres = placesDuDoc(doc);
  for (const ecrite of ecritures.keys()) {
    if (ecrite !== nouvelle) {
      expect(apres.get(ecrite)?.parent, ecrite).toBe(avant.get(ecrite)?.parent);
    }
    expect(estAdmis(apres.get(ecrite)?.rang, borne), ecrite).toBe(true);
  }
  for (const jetee of idsDeLaCorbeille) {
    expect(ecritures.has(jetee), jetee).toBe(false);
  }
  expect(espace.lire().corbeille).toEqual(corbeilleAvant);
  expect(emises).toHaveLength(1);
  return { nouvelle, ecritures };
}

describe("réattribution élargie à la borne", () => {
  it("F-029-AC7 (a) une insertion entre deux sœurs voisines de rangs de 1024 unités, sans rang admis entre elles, réussit à la position demandée", () => {
    const { espace } = semer([
      [id(1), { rang: "F" }],
      [id(2), { rang: `${PRES_DE_LA_BORNE}1` }],
      [id(3), { rang: `${PRES_DE_LA_BORNE}2` }],
      [id(4), { rang: "k" }],
      [id(5), { rang: `${PRES_DE_LA_BORNE}1`, corbeille: true }],
      [id(6), { rang: "V", parent: id(2) }],
    ]);

    const { ecritures } = constaterLInsertion(espace, null, 2, () =>
      espace.creerPage("Insérée", { parent: null, position: 2 }),
    );

    expect(ecritures.size).toBeGreaterThan(1);
    expect(idsDe(trouver(espace.lire().racines, id(2))?.enfants ?? [])).toEqual([id(6)]);
  });

  it("F-029-AC7 (a) un déplacement entre les deux mêmes sœurs réussit de même", () => {
    const { espace } = semer([
      [id(1), { rang: "F" }],
      [id(2), { rang: `${PRES_DE_LA_BORNE}1` }],
      [id(3), { rang: `${PRES_DE_LA_BORNE}2` }],
      [id(4), { rang: "V", parent: id(1) }],
    ]);

    constaterLInsertion(espace, null, 2, () => {
      espace.deplacerPage(id(4), { parent: null, position: 2 });
      return id(4);
    });
  });

  it("F-029-AC7 (b) une insertion en dernière position après une sœur de rang fait de 1024 « z » réussit", () => {
    const { espace } = semer([
      [id(1), { rang: "F" }],
      [id(2), { rang: Z_A_LA_BORNE }],
    ]);

    constaterLInsertion(espace, null, 2, () => espace.creerPage("Dernière"));
  });

  it("F-029-AC7 (c) une insertion en première position avant une sœur de rang fait de 1023 « 0 » suivis de « 1 » réussit", () => {
    const { espace } = semer([
      [id(1), { rang: ZEROS_PUIS_UN }],
      [id(2), { rang: "k" }],
    ]);

    constaterLInsertion(espace, null, 0, () =>
      espace.creerPage("Première", { parent: null, position: 0 }),
    );
  });

  it.each([
    { cas: "première", position: (_nombre: number): number => 0 },
    { cas: "dernière", position: (nombre: number): number => nombre },
    { cas: "milieu", position: (): number => 2 },
  ])(
    "F-029-AC7 (d) des insertions successives en $cas position, sous une borne abaissée à 4, déclenchent la réattribution élargie au moins deux fois",
    ({ position }) => {
      const borne = 4;
      const doc = new Y.Doc();
      ecrireEntrees(
        doc,
        new Map<IdPage, Entree>([
          [id(1), { rang: "0001" }],
          [id(2), { rang: "V" }],
          [id(3), { rang: "VVV1" }],
          [id(4), { rang: "zzzz" }],
        ]),
      );
      const espace = ouvrirDocumentEspaceBorne(doc, borne);
      let elargies = 0;

      for (let numero = 0; numero < 80; numero += 1) {
        const ici = position(espace.lire().racines.length);
        const { ecritures } = constaterLInsertion(
          espace,
          null,
          ici,
          () => espace.creerPage(`P${numero}`, { parent: null, position: ici }),
          borne,
        );
        elargies += ecritures.size > 1 ? 1 : 0;
      }

      expect(elargies).toBeGreaterThanOrEqual(2);
    },
  );

  it.each([
    { cas: "première", position: (_nombre: number): number => 0 },
    { cas: "dernière", position: (nombre: number): number => nombre },
    { cas: "milieu", position: (): number => 2 },
  ])(
    "F-029-AC7 (d) à la borne de 1024, des insertions successives en $cas position sur un document semé près de la borne déclenchent la réattribution élargie",
    ({ position }) => {
      const { espace } = semer([
        [id(1), { rang: ZEROS_PUIS_UN }],
        [id(2), { rang: `${PRES_DE_LA_BORNE}1` }],
        [id(3), { rang: `${PRES_DE_LA_BORNE}2` }],
        [id(4), { rang: Z_A_LA_BORNE }],
      ]);
      let elargies = 0;

      for (let numero = 0; numero < 12; numero += 1) {
        const ici = position(espace.lire().racines.length);
        const { ecritures } = constaterLInsertion(espace, null, ici, () =>
          espace.creerPage(`P${numero}`, { parent: null, position: ici }),
        );
        elargies += ecritures.size > 1 ? 1 : 0;
      }

      expect(elargies).toBeGreaterThanOrEqual(1);
    },
  );

  it("F-029-AC7 (e) une sœur exposée à la racine dont le parent enregistré n'est pas null garde ce parent quand la réattribution élargie la touche", () => {
    const absente = id(99);
    const { espace } = semer([
      [id(1), { rang: `${PRES_DE_LA_BORNE}1` }],
      [id(2), { rang: `${PRES_DE_LA_BORNE}2`, parent: absente }],
      [id(3), { rang: Z_A_LA_BORNE, parent: absente }],
    ]);
    expect(idsDe(espace.lire().racines)).toEqual([id(1), id(2), id(3)]);

    const { ecritures } = constaterLInsertion(espace, null, 1, () =>
      espace.creerPage("Entre", { parent: null, position: 1 }),
    );

    expect(ecritures.has(id(2)) || ecritures.has(id(3))).toBe(true);
    expect(placesDuDoc(espace.doc).get(id(2))?.parent).toBe(absente);
    expect(placesDuDoc(espace.doc).get(id(3))?.parent).toBe(absente);
  });
});

describe("réattribution d'égalité dans la borne", () => {
  it.each([
    { cas: "court", rang: "V" },
    { cas: "proche de la borne", rang: `${PRES_DE_LA_BORNE.slice(1)}k` },
  ])(
    "F-029-AC8 une insertion en position 1 parmi 2 000 sœurs de même rang ($cas) donne l'ordre de l'ADR-0002 et n'écrit que des rangs admis",
    ({ rang }) => {
      const soeurs = Array.from({ length: 2000 }, (_, indice) => id(indice + 1));
      const { espace } = semer(soeurs.map((soeur): [IdPage, Entree] => [soeur, { rang }]));
      expect(idsDe(espace.lire().racines)).toEqual(soeurs);

      const nouvelle = espace.creerPage("Insérée", { parent: null, position: 1 });

      expect(idsDe(espace.lire().racines)).toEqual([soeurs[0], nouvelle, ...soeurs.slice(1)]);
      const places = placesDuDoc(espace.doc);
      expect([...places.values()].every((place) => estAdmis(place.rang))).toBe(true);
      expect(places.get(soeurs[0] ?? "")?.rang).toBe(rang);
    },
  );
});

describe("pas de réattribution sans nécessité", () => {
  it("F-029-AC9 une insertion ordinaire entre deux sœurs de rangs différents n'écrit que la place de la page insérée", () => {
    const { espace } = semer([
      [id(1), { rang: "F" }],
      [id(2), { rang: `${PRES_DE_LA_BORNE.slice(2)}1` }],
      [id(3), { rang: "k" }],
    ]);

    const { nouvelle, ecritures } = constaterLInsertion(espace, null, 2, () =>
      espace.creerPage("Ordinaire", { parent: null, position: 2 }),
    );

    expect([...ecritures.keys()]).toEqual([nouvelle]);
  });

  it("F-029-AC9 un déplacement ordinaire n'écrit que la place de la page déplacée", () => {
    const { espace } = semer([
      [id(1), { rang: "F" }],
      [id(2), { rang: "V" }],
      [id(3), { rang: "k" }],
      [id(4), { rang: "V", parent: id(1) }],
    ]);

    const ecritures = ecrituresDePlace(espace.doc, () =>
      espace.deplacerPage(id(4), { parent: null, position: 2 }),
    );

    expect([...ecritures.keys()]).toEqual([id(4)]);
    expect(idsDe(espace.lire().racines)).toEqual([id(1), id(2), id(4), id(3)]);
  });
});

describe("refus typé, dernier recours", () => {
  // 61 rangs d'une unité existent : 62 sœurs, plus la page insérée, n'y tiennent pas.
  function fratriePleine(): DocumentEspace {
    const doc = new Y.Doc();
    const entrees = new Map<IdPage, Entree>();
    [...ALPHABET.slice(1), "z"].forEach((rang, indice) => entrees.set(id(indice + 1), { rang }));
    entrees.set(id(100), { rang: "V", parent: id(1) });
    ecrireEntrees(doc, entrees);
    return ouvrirDocumentEspaceBorne(doc, 1);
  }

  it("F-029-AC10 avec une borne de 1 unité et 62 sœurs, une création lève rang-indisponible et n'émet aucune mise à jour, le document restant inchangé", () => {
    const espace = fratriePleine();
    expect(espace.lire().racines).toHaveLength(62);
    const etat = Y.encodeStateAsUpdate(espace.doc);

    const emises = misesAJourPendant(espace.doc, () => {
      expect(codeDuRefus(() => espace.creerPage("De trop"))).toBe("rang-indisponible");
      expect(codeDuRefus(() => espace.deplacerPage(id(100), { parent: null, position: 0 }))).toBe(
        "rang-indisponible",
      );
    });

    expect(emises).toEqual([]);
    expect(Y.encodeStateAsUpdate(espace.doc)).toEqual(etat);
  });

  it.each<[string, (espace: DocumentEspace) => unknown, string]>([
    ["un titre trop long", (espace) => espace.creerPage("t".repeat(201)), "titre-trop-long"],
    [
      "une position invalide",
      (espace) => espace.creerPage("Titre", { parent: null, position: 99 }),
      "position-invalide",
    ],
    [
      "un parent introuvable",
      (espace) => espace.creerPage("Titre", { parent: id(500) }),
      "page-introuvable",
    ],
    [
      "un déplacement cyclique",
      (espace) => espace.deplacerPage(id(1), { parent: id(100) }),
      "deplacement-cyclique",
    ],
  ])(
    "F-029-AC10 le refus rang-indisponible vient après les autres : %s donne son propre code",
    (_cas, operation, code) => {
      expect(codeDuRefus(() => operation(fratriePleine()))).toBe(code);
    },
  );

  it("F-029-AC10 avec une borne de 1 unité, 60 sœurs laissent encore place à une création, par réattribution élargie", () => {
    const doc = new Y.Doc();
    ecrireEntrees(
      doc,
      new Map([...ALPHABET.slice(1, 61)].map((rang, indice) => [id(indice + 1), { rang }])),
    );
    const espace = ouvrirDocumentEspaceBorne(doc, 1);

    constaterLInsertion(
      espace,
      null,
      0,
      () => espace.creerPage("Tient encore", { parent: null, position: 0 }),
      1,
    );
  });

  it("F-029-AC6 F-029-AC10 le point unique de contrôle refuse un rang non admis par rang-indisponible, et admet un rang de 1024 unités", () => {
    expect(
      codeDuRefus(() => admettrePlace({ parent: null, rang: `${Z_A_LA_BORNE}V` }, BORNE)),
    ).toBe("rang-indisponible");
    expect(codeDuRefus(() => admettrePlace({ parent: null, rang: "V0" }, BORNE))).toBe(
      "rang-indisponible",
    );
    expect(admettrePlace({ parent: id(1), rang: Z_A_LA_BORNE }, BORNE)).toEqual({
      parent: id(1),
      rang: Z_A_LA_BORNE,
    });
  });
});

// Rangs de semis près de la borne : faits de « z », de « 0 » terminés par « 1 », ou quelconques.
const rangDeSemis = fc.oneof(
  fc.constantFrom(
    Z_A_LA_BORNE,
    Z_A_LA_BORNE.slice(1),
    ZEROS_PUIS_UN,
    ZEROS_PUIS_UN.slice(1),
    `${PRES_DE_LA_BORNE}1`,
    `${PRES_DE_LA_BORNE}2`,
    `${PRES_DE_LA_BORNE.slice(1)}k`,
  ),
  fc.constantFrom("F", "V", "k"),
);
const semis = fc.array(fc.tuple(rangDeSemis, fc.boolean(), fc.nat({ max: 3 })), {
  minLength: 2,
  maxLength: 8,
});
const operation: fc.Arbitrary<Operation> = fc.record({
  sorte: fc.constantFrom("creer", "deplacer"),
  page: fc.nat(),
  parent: fc.nat(),
  position: fc.double({ min: 0, max: 1, noNaN: true }),
});

function semerAuHasard(replique: Replique, valeurs: readonly [string, boolean, number][]): void {
  const entrees = new Map<IdPage, Entree>();
  valeurs.forEach(([rang, sousLaPremiere, corbeille], indice) => {
    const parent = sousLaPremiere && indice > 0 ? id(1) : null;
    entrees.set(id(indice + 1), { rang, parent, corbeille: corbeille === 3 && indice > 0 });
  });
  ecrireEntrees(replique.espace.doc, entrees);
}

interface Operation {
  readonly sorte: "creer" | "deplacer";
  readonly page: number;
  readonly parent: number;
  readonly position: number;
}

function appliquer(espace: DocumentEspace, op: Operation): void {
  const lues = identifiantsLus({ racines: espace.lire().racines, corbeille: [] });
  const parents = [null, ...lues];
  const parent = parents[op.parent % parents.length] ?? null;
  const nombre = soeursLues(espace, parent).length;
  try {
    if (op.sorte === "creer" || lues.length === 0) {
      espace.creerPage("Créée", { parent, position: Math.round(op.position * nombre) });
    } else {
      const page = lues[op.page % lues.length] ?? "";
      const autres = soeursLues(espace, parent).filter((soeur) => soeur.id !== page).length;
      espace.deplacerPage(page, { parent, position: Math.round(op.position * autres) });
    }
  } catch (erreur) {
    // Seul refus attendu ici : un déplacement sous sa propre descendance.
    expect((erreur as { code?: unknown }).code).toBe("deplacement-cyclique");
  }
}

describe("aucun rang hors borne écrit", () => {
  it("F-029-AC6 après chaque opération d'une suite sur un document semé de rangs de 1023 et 1024 unités, tous les rangs du Y.Doc sont admis et chaque page écrite est lue", () => {
    fc.assert(
      fc.property(semis, fc.array(operation, { minLength: 1, maxLength: 12 }), (valeurs, ops) => {
        const replique = creerReplique(1);
        semerAuHasard(replique, valeurs);
        const { espace } = replique;

        for (const op of ops) {
          const ecritures = ecrituresDePlace(espace.doc, () => appliquer(espace, op));

          const places = [...placesDuDoc(espace.doc).values()];
          expect(places.every((place) => estAdmis(place.rang))).toBe(true);
          const lues = new Set(identifiantsLus({ racines: espace.lire().racines, corbeille: [] }));
          expect([...ecritures.keys()].filter((ecrite) => !lues.has(ecrite))).toEqual([]);
        }
      }),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS / 3 },
    );
  });
});

describe("convergence préservée", () => {
  it("F-029-AC11 deux répliques qui déclenchent sans se voir la réattribution élargie dans la même fratrie convergent dans tous les ordres, chaque entrée valide lue une fois", () => {
    fc.assert(
      fc.property(
        semis,
        fc.array(operation, { maxLength: 5 }),
        fc.array(operation, { maxLength: 5 }),
        (valeurs, opsDeA, opsDeB) => {
          fixerDesIdentifiantsDisperses();
          const a = creerReplique(1);
          const b = creerReplique(2);
          semerAuHasard(a, [...valeurs, [Z_A_LA_BORNE, false, 0]]);
          a.emises.forEach((miseAJour) => livrer(b, miseAJour));
          // Chacune insère en dernière position à la racine, après 1024 « z » : réattribution élargie.
          a.espace.creerPage("Dernière de A");
          b.espace.creerPage("Dernière de B");
          opsDeA.forEach((op) => appliquer(a.espace, op));
          opsDeB.forEach((op) => appliquer(b.espace, op));

          const [premiere, ...autres] = lecturesDansTousLesOrdres([a, b]);

          for (const lue of autres) {
            expect(lue).toEqual(premiere);
          }
          const lus = identifiantsLus(premiere ?? { racines: [], corbeille: [] });
          expect(new Set(lus).size).toBe(lus.length);
          expect(lus.length).toBe(placesDuDoc(a.espace.doc).size);
          vi.restoreAllMocks();
        },
      ),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS / 3 },
    );
  });
});
