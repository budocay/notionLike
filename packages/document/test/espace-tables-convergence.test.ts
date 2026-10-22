// F-018 : convergence d'un document d'espace qui porte des tables. La version ne baisse jamais
// (AC5), et les suites d'opérations à graine fixe de F-001 et de F-007 sont reprises avec des
// créations de table (AC6).
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { lireLaVersion } from "../src/format.ts";
import {
  type Arborescence,
  type Emplacement,
  ErreurDocument,
  type IdPage,
  type PageLue,
  type TypeDePage,
} from "../src/index.ts";
import {
  creerReplique,
  echanger,
  fixerDesIdentifiantsDisperses,
  GRAINE,
  lecturesDansTousLesOrdres,
  livrer,
  NOMBRE_EXECUTIONS,
  ordresPossibles,
  type Replique,
} from "./aides.ts";
import { fermerLesSuivies, ouvrirSuivie } from "./aides-corbeille.ts";

const ID_ABSENT = "00000000-0000-4000-8000-0000000000ff";

const ouvertes: Replique[] = [];
function replique(identifiantDeClient: number): Replique {
  const creee = creerReplique(identifiantDeClient);
  ouvertes.push(creee);
  return creee;
}

afterEach(() => {
  ouvertes.splice(0).forEach(({ espace }) => espace.fermer());
  vi.restoreAllMocks();
  expect(fermerLesSuivies()).toBe(0);
});

function codeDuRefus(operation: () => unknown): string {
  try {
    operation();
    return "acceptée";
  } catch (erreur) {
    return erreur instanceof ErreurDocument ? erreur.code : "autre exception";
  }
}

function pagesLues({ racines, corbeille }: Arborescence): PageLue[] {
  const aVoir = [...racines, ...corbeille];
  for (const lue of aVoir) {
    aVoir.push(...lue.enfants);
  }
  return aVoir;
}

function typesLus(arborescence: Arborescence): Map<IdPage, TypeDePage> {
  return new Map(pagesLues(arborescence).map((lue) => [lue.id, lue.type ?? "page"]));
}

/** Version lue par un observateur vierge qui reçoit tout, dans chaque ordre des émettrices. */
function versionsDansTousLesOrdres(repliques: readonly Replique[]): unknown[] {
  return ordresPossibles(repliques).map((ordre) => {
    const vierge = new Y.Doc();
    ordre.forEach((emettrice) => emettrice.emises.forEach((m) => Y.applyUpdate(vierge, m)));
    return lireLaVersion(vierge);
  });
}

// ── F-018-AC5 : la version ne baisse jamais ──────────────────────────────────────────────────────

describe("la version lue ne baisse jamais", () => {
  it.each([
    ["la première réplique livre d'abord", [1, 2]],
    ["la seconde réplique livre d'abord", [2, 1]],
  ])(
    "F-018-AC5 deux élévations à 2 (%s) : les deux répliques et tout observateur lisent la version 2, et les deux tables",
    (_cas, identifiants) => {
      const [a, b] = identifiants.map((identifiant) => replique(identifiant));
      if (a === undefined || b === undefined) {
        throw new Error("deux répliques attendues");
      }
      const deA = a.espace.creerTable("Table de A");
      const deB = b.espace.creerTable("Table de B");

      echanger([b, a]);

      for (const { espace } of [a, b]) {
        expect(lireLaVersion(espace.doc)).toEqual({ version: 2, admise: true });
        expect(espace.doc.getArray("versions").toArray()).toEqual([2, 2]);
        expect(espace.doc.getMap("meta").get("version")).toBe(2);
        expect(typesLus(espace.lire())).toEqual(
          new Map([
            [deA, "table"],
            [deB, "table"],
          ]),
        );
      }
      expect(versionsDansTousLesOrdres([a, b])).toEqual([
        { version: 2, admise: true },
        { version: 2, admise: true },
      ]);
    },
  );

  it.each([
    ["l'élévation à 2 a le plus petit identifiant de client", 1, 2],
    ["l'élévation à 2 a le plus grand identifiant de client", 2, 1],
  ])(
    "F-018-AC5 une élévation à 2 concurrente d'une version 3 inscrite dans la forme stockée (%s) : la lecture est refusée sur les deux répliques et par tout observateur",
    (_cas, clientDeLaTable, clientDuTrois) => {
      const a = replique(clientDeLaTable);
      const b = replique(clientDuTrois);
      a.espace.creerTable("Table");
      b.espace.doc.transact(() => {
        b.espace.doc.getMap("meta").set("version", 3);
        b.espace.doc.getArray("versions").push([3]);
      });

      echanger([a, b]);

      for (const { espace } of [a, b]) {
        expect(lireLaVersion(espace.doc)).toEqual({ version: 3, admise: true });
        expect(codeDuRefus(() => espace.lire())).toBe("version-non-prise-en-charge");
        expect(codeDuRefus(() => espace.creerTable("t"))).toBe("version-non-prise-en-charge");
      }
      expect(versionsDansTousLesOrdres([a, b])).toEqual([
        { version: 3, admise: true },
        { version: 3, admise: true },
      ]);
    },
  );

  it("F-018-AC5 témoin de la forme stockée : quand la dernière écriture de meta.version garde 2, seul le type racine versions porte le 3, et la lecture le retient", () => {
    const issues = [1, 2].map((clientDeLaTable) => {
      const a = replique(clientDeLaTable);
      const b = replique(3 - clientDeLaTable);
      a.espace.creerTable("Table");
      b.espace.doc.transact(() => {
        b.espace.doc.getMap("meta").set("version", 3);
        b.espace.doc.getArray("versions").push([3]);
      });
      echanger([a, b]);
      return a.espace.doc.getMap("meta").get("version");
    });

    // Yjs départage les deux écritures de la clé : l'une des deux issues garde 2.
    expect([...issues].sort()).toEqual([2, 3]);
  });
});

// ── F-018-AC6 : suites d'opérations à graine fixe, créations de table comprises ──────────────────

type TypeDOperation =
  "creer" | "creerTable" | "renommer" | "deplacer" | "jeter" | "restaurer" | "supprimer";

interface Etape {
  readonly livraison: boolean;
  readonly operation: TypeDOperation;
  readonly replique: number;
  readonly page: number;
  readonly parent: number;
  readonly position: number | undefined;
  readonly titre: string;
  readonly destinataire: number;
  readonly miseAJour: number;
}

function etape(poids: Readonly<Record<TypeDOperation, number>>): fc.Arbitrary<Etape> {
  return fc.record({
    livraison: fc.boolean(),
    operation: fc.oneof(
      ...Object.entries(poids)
        .filter(([, weight]) => weight > 0)
        .map(([operation, weight]) => ({
          weight,
          arbitrary: fc.constant(operation as TypeDOperation),
        })),
    ),
    replique: fc.nat(),
    page: fc.nat(),
    parent: fc.nat(),
    position: fc.option(fc.nat({ max: 3 }), { nil: undefined }),
    titre: fc.constantFrom("x", "y", "z"),
    destinataire: fc.nat(),
    miseAJour: fc.nat(),
  });
}

// Poids de F-001 (`convergence.test.ts`) et de F-007 (`corbeille-convergence.test.ts`), plus des
// créations de table au poids d'une création de page.
const OPERATIONS_DE_F001: Readonly<Record<TypeDOperation, number>> = {
  creer: 4,
  creerTable: 4,
  renommer: 2,
  deplacer: 5,
  jeter: 1,
  restaurer: 0,
  supprimer: 0,
};
const OPERATIONS_DE_F007: Readonly<Record<TypeDOperation, number>> = {
  creer: 4,
  creerTable: 4,
  renommer: 1,
  deplacer: 3,
  jeter: 3,
  restaurer: 2,
  supprimer: 2,
};

function scenario(poids: Readonly<Record<TypeDOperation, number>>) {
  return fc.record({
    nombreDeRepliques: fc.integer({ min: 2, max: 3 }),
    etapes: fc.array(etape(poids), { maxLength: 60 }),
  });
}

function choisir<T>(elements: readonly T[], choix: number): T {
  const choisi = elements[choix % elements.length];
  if (choisi === undefined) {
    throw new Error("aucun élément");
  }
  return choisi;
}

function passerLesRefus(operation: () => unknown): void {
  try {
    operation();
  } catch (erreur) {
    if (!(erreur instanceof ErreurDocument)) {
      throw erreur;
    }
  }
}

interface Partie {
  readonly repliques: Replique[];
  /** Type de chaque page créée, quelle que soit la réplique qui l'a créée. */
  readonly creees: Map<IdPage, TypeDePage>;
}

function operer({ espace }: Replique, choisie: Etape, creees: Map<IdPage, TypeDePage>): void {
  const lue = espace.lire();
  const connues = pagesLues({ racines: lue.racines, corbeille: [] }).map(({ id }) => id);
  const jetees = pagesLues({ racines: [], corbeille: lue.corbeille }).map(({ id }) => id);
  const visee = connues[choisie.page % Math.max(connues.length, 1)] ?? ID_ABSENT;
  const jetee = jetees[choisie.page % Math.max(jetees.length, 1)] ?? ID_ABSENT;
  const parent = connues[choisie.parent % (connues.length + 1)] ?? null;
  const ou: Emplacement =
    choisie.position === undefined ? { parent } : { parent, position: choisie.position };
  const operations: Record<TypeDOperation, () => unknown> = {
    creer: () => creees.set(espace.creerPage(`page ${choisie.titre}`, ou), "page"),
    creerTable: () => creees.set(espace.creerTable(`table ${choisie.titre}`, ou), "table"),
    renommer: () => espace.renommerPage(visee, choisie.titre),
    deplacer: () => espace.deplacerPage(visee, ou),
    jeter: () => espace.mettreALaCorbeille(visee),
    restaurer: () => espace.restaurerPage(jetee),
    supprimer: () => espace.supprimerDefinitivement(jetee),
  };
  passerLesRefus(operations[choisie.operation]);
}

// Une livraison porte une mise à jour quelconque de l'émettrice : désordre et doublons compris.
function livrerUneMiseAJour(repliques: readonly Replique[], choisie: Etape): void {
  const emettrice = choisir(repliques, choisie.replique);
  const destinataire = choisir(repliques, choisie.destinataire);
  const miseAJour = emettrice.emises[choisie.miseAJour % Math.max(emettrice.emises.length, 1)];
  if (destinataire !== emettrice && miseAJour !== undefined) {
    livrer(destinataire, miseAJour);
  }
}

/** Joue la partie ; après chaque étape, la version lue de chaque réplique n'a pas baissé. */
function jouer(nombreDeRepliques: number, etapes: readonly Etape[]): Partie {
  fixerDesIdentifiantsDisperses();
  const repliques = Array.from({ length: nombreDeRepliques }, (_, numero) => replique(numero + 1));
  const premiere = choisir(repliques, 0);
  const creees = new Map<IdPage, TypeDePage>();
  const racine = premiere.espace.creerPage("racine commune");
  creees.set(racine, "page");
  creees.set(premiere.espace.creerTable("table commune", { parent: racine }), "table");
  creees.set(premiere.espace.creerPage("autre racine commune"), "page");
  echanger(repliques);
  const versionsVues = new Map<Replique, number>();
  for (const choisie of etapes) {
    if (choisie.livraison) {
      livrerUneMiseAJour(repliques, choisie);
    } else {
      operer(choisir(repliques, choisie.replique), choisie, creees);
    }
    for (const courante of repliques) {
      const { version, admise } = lireLaVersion(courante.espace.doc);
      expect(admise).toBe(true);
      expect(version).toBeGreaterThanOrEqual(versionsVues.get(courante) ?? 1);
      versionsVues.set(courante, version);
    }
  }
  return { repliques, creees };
}

/** Échange complet ; toutes les répliques et tous les ordres de livraison lisent la même chose. */
function lectureCommune(repliques: readonly Replique[]): Arborescence {
  const lectures = lecturesDansTousLesOrdres(repliques);
  const reference = repliques[0]?.espace.lire() ?? { racines: [], corbeille: [] };
  lectures.forEach((lecture) => expect(lecture).toEqual(reference));
  return reference;
}

function exigerLesTypesCrees(lecture: Arborescence, creees: ReadonlyMap<IdPage, TypeDePage>): void {
  for (const [id, type] of typesLus(lecture)) {
    expect(creees.get(id), id).toBe(type);
  }
}

describe("converger avec des tables, quelles que soient les opérations et l'ordre de livraison", () => {
  it("F-018-AC6 F-018-AC5 suites de F-001 avec créations de table : toutes les répliques lisent la même arborescence, les mêmes types et la même version, chaque page créée une fois, et la version ne baisse jamais", () => {
    fc.assert(
      fc.property(scenario(OPERATIONS_DE_F001), ({ nombreDeRepliques, etapes }) => {
        const { repliques, creees } = jouer(nombreDeRepliques, etapes);

        const lecture = lectureCommune(repliques);

        expect(
          pagesLues(lecture)
            .map(({ id }) => id)
            .sort(),
        ).toEqual([...creees.keys()].sort());
        exigerLesTypesCrees(lecture, creees);
        const versions = repliques.map(({ espace }) => lireLaVersion(espace.doc));
        expect(versions).toEqual(repliques.map(() => ({ version: 2, admise: true })));
      }),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS },
    );
  });

  it("F-018-AC6 F-018-AC5 suites de F-007 avec créations de table : mêmes arborescence, corbeille et types partout, chaque entrée restante une fois, et l'état complet se relit à l'identique", () => {
    fc.assert(
      fc.property(scenario(OPERATIONS_DE_F007), ({ nombreDeRepliques, etapes }) => {
        const { repliques, creees } = jouer(nombreDeRepliques, etapes);
        const lecture = lectureCommune(repliques);

        exigerLesTypesCrees(lecture, creees);
        for (const courante of repliques) {
          const lus = pagesLues(courante.espace.lire()).map(({ id }) => id);
          expect(new Set(lus).size).toBe(lus.length);
          const vierge = new Y.Doc();
          Y.applyUpdate(vierge, Y.encodeStateAsUpdate(courante.espace.doc));
          const relue = ouvrirSuivie(vierge);
          expect(relue.lire()).toEqual(lecture);
          expect(lireLaVersion(vierge)).toEqual({ version: 2, admise: true });
        }
        expect(fermerLesSuivies()).toBe(0);
      }),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS },
    );
  });
});
