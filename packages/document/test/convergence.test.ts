import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  type Arborescence,
  type DocumentEspace,
  type Emplacement,
  ErreurDocument,
  type IdPage,
  ouvrirDocumentEspace,
  type PageLue,
} from "../src/index.ts";
import {
  creerReplique,
  echanger,
  fixerDesIdentifiantsDisperses,
  fixerLesProchainsIdentifiants,
  GRAINE,
  identifiantFixe,
  lecturesDansTousLesOrdres,
  livrer,
  livrerToutesLesEmises,
  NOMBRE_EXECUTIONS,
  type Replique,
} from "./aides.ts";

const RANG_VALIDE = /^[0-9A-Za-z]*[1-9A-Za-z]$/;
const ID_ABSENT = "00000000-0000-4000-8000-0000000000ff";

interface PlaceEnregistree {
  readonly parent: IdPage | null;
  readonly rang: string;
}

interface EntreeEnregistree {
  readonly titre: string;
  readonly place: PlaceEnregistree;
  readonly corbeille: boolean;
}

function page(id: IdPage, titre: string, enfants: readonly PageLue[] = []): PageLue {
  return { id, titre, enfants };
}

function emplacement(parent: IdPage | null, position: number | undefined): Emplacement {
  return position === undefined ? { parent } : { parent, position };
}

function pagesEnregistrees(replique: Replique): Record<IdPage, EntreeEnregistree> {
  return replique.espace.doc.getMap("pages").toJSON() as Record<IdPage, EntreeEnregistree>;
}

function placeEnregistree(replique: Replique, id: IdPage): PlaceEnregistree | undefined {
  return pagesEnregistrees(replique)[id]?.place;
}

function rangEnregistre(replique: Replique, id: IdPage): string {
  return placeEnregistree(replique, id)?.rang ?? "";
}

// Écriture directe dans le Y.Doc, au format de l'ADR-0002, pour fabriquer un état qu'une seule
// réplique ne produit pas par les opérations.
function ecrireEntree(replique: Replique, id: IdPage, place: PlaceEnregistree): void {
  const champs = new Y.Map<unknown>();
  champs.set("titre", `page ${id.slice(-1)}`);
  champs.set("place", place);
  champs.set("corbeille", false);
  replique.espace.doc.getMap("pages").set(id, champs);
}

function identifiantsLus({ racines, corbeille }: Arborescence): IdPage[] {
  const aplatir = (pages: readonly PageLue[]): IdPage[] =>
    pages.flatMap((lue) => [lue.id, ...aplatir(lue.enfants)]);
  return [...aplatir(racines), ...aplatir(corbeille)];
}

function compterMisesAJour(replique: Replique, action: () => void): number {
  const avant = replique.emises.length;
  action();
  return replique.emises.length - avant;
}

function copieParEtatComplet(espace: DocumentEspace): DocumentEspace {
  const copie = ouvrirDocumentEspace(new Y.Doc());
  Y.applyUpdate(copie.doc, Y.encodeStateAsUpdate(espace.doc));
  return copie;
}

/** Échange complet, puis exige la même lecture sur chaque réplique et pour chaque ordre de livraison. */
function lectureCommune(repliques: readonly Replique[]): Arborescence {
  const lectures = lecturesDansTousLesOrdres(repliques);
  const reference = repliques[0]?.espace.lire() ?? { racines: [], corbeille: [] };
  expect(lectures.length).toBeGreaterThan(repliques.length);
  lectures.forEach((lecture) => expect(lecture).toEqual(reference));
  return reference;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("converger après des opérations différentes", () => {
  it("F-001-AC7 deux répliques aux opérations disjointes lisent la même arborescence, dans les deux ordres d'échange", () => {
    const [a, b] = [creerReplique(1), creerReplique(2)];
    const commune = a.espace.creerPage("Commune");
    echanger([a, b]);

    const deA = a.espace.creerPage("De A", { parent: commune });
    a.espace.renommerPage(commune, "Commune renommée");
    const deB = b.espace.creerPage("De B");
    const sousB = b.espace.creerPage("Sous B", { parent: deB });
    const jetee = b.espace.creerPage("Jetée");
    b.espace.mettreALaCorbeille(jetee);

    expect(lectureCommune([a, b])).toEqual({
      racines: [
        page(commune, "Commune renommée", [page(deA, "De A")]),
        page(deB, "De B", [page(sousB, "Sous B")]),
      ],
      corbeille: [page(jetee, "Jetée")],
    });
  });

  it("F-001-AC7 trois répliques aux opérations disjointes lisent la même arborescence, dans tous les ordres d'échange", () => {
    const repliques = [creerReplique(1), creerReplique(2), creerReplique(3)];
    const creees = repliques.map((replique, numero) => {
      const racine = replique.espace.creerPage(`Racine ${numero}`);
      return [racine, replique.espace.creerPage(`Fille ${numero}`, { parent: racine })];
    });

    const lecture = lectureCommune(repliques);

    expect(identifiantsLus(lecture).sort()).toEqual(creees.flat().sort());
    expect(lecture.racines.map((lue) => lue.enfants.length)).toEqual([1, 1, 1]);
  });
});

describe("créer à la même position sur deux répliques", () => {
  function deuxPagesDeMemeRang(): { a: Replique; b: Replique; x: IdPage; y: IdPage } {
    const [a, b] = [creerReplique(1), creerReplique(2)];
    const [x, y] = [identifiantFixe(1), identifiantFixe(2)];
    fixerLesProchainsIdentifiants(y, x);
    b.espace.creerPage("Y");
    a.espace.creerPage("X");
    return { a, b, x, y };
  }

  it("F-001-AC8 les deux pages sont conservées, avec le même rang, dans le même ordre sur les deux répliques", () => {
    const { a, b, x, y } = deuxPagesDeMemeRang();

    expect(lectureCommune([a, b]).racines).toEqual([page(x, "X"), page(y, "Y")]);
    expect(rangEnregistre(a, x)).toBe(rangEnregistre(a, y));
  });

  it.each([{ auteur: "la première réplique" }, { auteur: "la seconde réplique" }])(
    "F-001-AC8 $auteur insère entre deux sœurs de même rang : l'ordre demandé est lu partout, par réattribution du rang de la suivante",
    ({ auteur }) => {
      const { a, b, x, y } = deuxPagesDeMemeRang();
      echanger([a, b]);
      const rangCommun = rangEnregistre(a, x);
      const inseree = identifiantFixe(3);
      fixerLesProchainsIdentifiants(inseree);
      const autrice = auteur === "la première réplique" ? a : b;

      const misesAJour = compterMisesAJour(autrice, () =>
        autrice.espace.creerPage("Entre", { parent: null, position: 1 }),
      );

      expect(misesAJour).toBe(1);
      expect(lectureCommune([a, b]).racines).toEqual([
        page(x, "X"),
        page(inseree, "Entre"),
        page(y, "Y"),
      ]);
      const rangs = [x, inseree, y].map((id) => rangEnregistre(a, id));
      expect(rangs[0]).toBe(rangCommun);
      rangs.forEach((rang) => expect(rang).toMatch(RANG_VALIDE));
      expect([...rangs].sort()).toEqual(rangs);
      expect(new Set(rangs).size).toBe(rangs.length);
    },
  );

  it("F-001-AC8 les deux répliques insèrent en même temps entre les deux sœurs de même rang : mêmes quatre pages, même ordre partout", () => {
    const { a, b, x, y } = deuxPagesDeMemeRang();
    echanger([a, b]);
    const [deA, deB] = [identifiantFixe(4), identifiantFixe(3)];
    fixerLesProchainsIdentifiants(deA, deB);

    a.espace.creerPage("De A", { parent: null, position: 1 });
    b.espace.creerPage("De B", { parent: null, position: 1 });

    expect(lectureCommune([a, b]).racines).toEqual([
      page(x, "X"),
      page(deB, "De B"),
      page(deA, "De A"),
      page(y, "Y"),
    ]);
  });

  it("F-001-AC8 un déplacement entre deux sœurs de même rang réattribue lui aussi le rang de la suivante", () => {
    const { a, b, x, y } = deuxPagesDeMemeRang();
    echanger([a, b]);
    const deplacee = a.espace.creerPage("Déplacée");

    a.espace.deplacerPage(deplacee, { parent: null, position: 1 });

    expect(lectureCommune([a, b]).racines).toEqual([
      page(x, "X"),
      page(deplacee, "Déplacée"),
      page(y, "Y"),
    ]);
  });

  it.each([
    { position: 0, attendu: ["Entre", "1", "2", "3", "Après"], rangsChanges: [] },
    { position: 1, attendu: ["1", "Entre", "2", "3", "Après"], rangsChanges: ["2", "3"] },
    { position: 2, attendu: ["1", "2", "Entre", "3", "Après"], rangsChanges: ["3"] },
    { position: 3, attendu: ["1", "2", "3", "Entre", "Après"], rangsChanges: [] },
  ])(
    "F-001-AC8 parmi trois sœurs de même rang, l'insertion en position $position ne change que les rangs des sœurs de même rang qui la suivent",
    ({ position, attendu, rangsChanges }) => {
      const repliques = [creerReplique(1), creerReplique(2), creerReplique(3)] as const;
      const [a, b, c] = repliques;
      const parent = a.espace.creerPage("Parent");
      echanger(repliques);
      fixerLesProchainsIdentifiants(identifiantFixe(3), identifiantFixe(1), identifiantFixe(2));
      const titresParId = new Map([
        [c.espace.creerPage("3", { parent }), "3"],
        [a.espace.creerPage("1", { parent }), "1"],
        [b.espace.creerPage("2", { parent }), "2"],
      ]);
      echanger(repliques);
      a.espace.creerPage("Après", { parent });
      const avant = pagesEnregistrees(a);

      a.espace.creerPage("Entre", { parent, position });

      const lecture = lectureCommune(repliques);
      expect(lecture.racines[0]?.enfants.map((lue) => lue.titre)).toEqual(attendu);
      const apres = pagesEnregistrees(a);
      const titresDesRangsChanges = Object.keys(avant)
        .filter((id) => avant[id]?.place.rang !== apres[id]?.place.rang)
        .map((id) => titresParId.get(id));
      expect(titresDesRangsChanges.sort()).toEqual(rangsChanges);
      for (const id of Object.keys(avant)) {
        expect(apres[id]?.place.parent).toBe(avant[id]?.place.parent);
      }
    },
  );

  it("F-001-AC8 à la racine, l'insertion devant une sœur de même rang exposée par coupure de cycle change son rang sans toucher à son parent enregistré", () => {
    const [a, b] = [creerReplique(1), creerReplique(2)];
    const [devant, coupee, complice, inseree] = [
      identifiantFixe(1),
      identifiantFixe(2),
      identifiantFixe(3),
      identifiantFixe(4),
    ];
    a.espace.doc.transact(() => {
      ecrireEntree(a, devant, { parent: null, rang: "V" });
      ecrireEntree(a, coupee, { parent: complice, rang: "V" });
      ecrireEntree(a, complice, { parent: coupee, rang: "V" });
    });
    echanger([a, b]);
    expect(b.espace.lire().racines).toEqual([
      page(devant, "page 1"),
      page(coupee, "page 2", [page(complice, "page 3")]),
    ]);
    fixerLesProchainsIdentifiants(inseree);

    b.espace.creerPage("Insérée", { parent: null, position: 1 });

    expect(lectureCommune([a, b]).racines).toEqual([
      page(devant, "page 1"),
      page(inseree, "Insérée"),
      page(coupee, "page 2", [page(complice, "page 3")]),
    ]);
    expect(placeEnregistree(a, coupee)?.parent).toBe(complice);
    expect(rangEnregistre(a, coupee) > rangEnregistre(a, inseree)).toBe(true);
    expect(rangEnregistre(a, devant)).toBe("V");
  });
});

describe("déplacer en sens contraires sur deux répliques", () => {
  function cycleADeux(
    numeroDeA: number,
    numeroDeB: number,
  ): { r1: Replique; r2: Replique; a: IdPage; b: IdPage; filleDeA: IdPage; filleDeB: IdPage } {
    const [r1, r2] = [creerReplique(1), creerReplique(2)];
    const [a, b, filleDeA, filleDeB] = [
      identifiantFixe(numeroDeA),
      identifiantFixe(numeroDeB),
      identifiantFixe(3),
      identifiantFixe(4),
    ];
    fixerLesProchainsIdentifiants(a, b, filleDeA, filleDeB);
    r1.espace.creerPage("A");
    r1.espace.creerPage("B");
    r1.espace.creerPage("Fille de A", { parent: a });
    r1.espace.creerPage("Fille de B", { parent: b });
    echanger([r1, r2]);
    r1.espace.deplacerPage(a, { parent: b });
    r2.espace.deplacerPage(b, { parent: a });
    return { r1, r2, a, b, filleDeA, filleDeB };
  }

  it("F-001-AC9 A sous B contre B sous A : même lecture sans cycle, la page au plus petit identifiant (A) est exposée à la racine", () => {
    const { r1, r2, a, b, filleDeA, filleDeB } = cycleADeux(1, 2);

    expect(lectureCommune([r1, r2])).toEqual({
      racines: [
        page(a, "A", [page(filleDeA, "Fille de A"), page(b, "B", [page(filleDeB, "Fille de B")])]),
      ],
      corbeille: [],
    });
    expect(placeEnregistree(r1, a)?.parent).toBe(b);
    expect(placeEnregistree(r1, b)?.parent).toBe(a);
  });

  it("F-001-AC9 A sous B contre B sous A : quand B a le plus petit identifiant, c'est B qui est exposée à la racine", () => {
    const { r1, r2, a, b, filleDeA, filleDeB } = cycleADeux(2, 1);

    expect(lectureCommune([r1, r2])).toEqual({
      racines: [
        page(b, "B", [page(filleDeB, "Fille de B"), page(a, "A", [page(filleDeA, "Fille de A")])]),
      ],
      corbeille: [],
    });
  });

  it("F-001-AC9 un cycle de trois pages est coupé à la page au plus petit identifiant, sur trois répliques", () => {
    const repliques = [creerReplique(1), creerReplique(2), creerReplique(3)] as const;
    const [x, y, z] = [identifiantFixe(3), identifiantFixe(1), identifiantFixe(2)];
    fixerLesProchainsIdentifiants(x, y, z);
    repliques[0].espace.creerPage("X");
    repliques[0].espace.creerPage("Y");
    repliques[0].espace.creerPage("Z");
    echanger(repliques);

    repliques[0].espace.deplacerPage(x, { parent: y });
    repliques[1].espace.deplacerPage(y, { parent: z });
    repliques[2].espace.deplacerPage(z, { parent: x });

    expect(lectureCommune(repliques)).toEqual({
      racines: [page(y, "Y", [page(x, "X", [page(z, "Z")])])],
      corbeille: [],
    });
  });

  it("F-001-AC9 une page enregistrée comme parente d'elle-même est exposée à la racine", () => {
    const a = creerReplique(1);
    ecrireEntree(a, identifiantFixe(1), { parent: identifiantFixe(1), rang: "V" });

    expect(a.espace.lire()).toEqual({
      racines: [page(identifiantFixe(1), "page 1")],
      corbeille: [],
    });
  });

  it("F-001-AC9 la mise à la corbeille de la page coupée emporte tout le cycle dans la corbeille", () => {
    const { r1, r2, a, b, filleDeA, filleDeB } = cycleADeux(1, 2);
    echanger([r1, r2]);

    r2.espace.mettreALaCorbeille(a);

    expect(lectureCommune([r1, r2])).toEqual({
      racines: [],
      corbeille: [
        page(a, "A", [page(filleDeA, "Fille de A"), page(b, "B", [page(filleDeB, "Fille de B")])]),
      ],
    });
  });

  it("F-001-AC9 déplacer ensuite une page du cycle consolide la page coupée à la racine, rang inchangé, dans la même mise à jour", () => {
    const { r1, r2, a, b, filleDeA, filleDeB } = cycleADeux(1, 2);
    echanger([r1, r2]);
    const rangDeA = rangEnregistre(r1, a);

    const misesAJour = compterMisesAJour(r1, () => r1.espace.deplacerPage(b, { parent: null }));

    expect(misesAJour).toBe(1);
    expect(placeEnregistree(r1, a)).toEqual({ parent: null, rang: rangDeA });
    expect(lectureCommune([r1, r2])).toEqual({
      racines: [
        page(a, "A", [page(filleDeA, "Fille de A")]),
        page(b, "B", [page(filleDeB, "Fille de B")]),
      ],
      corbeille: [],
    });
  });

  it("F-001-AC9 déplacer une descendante de la page coupée hors du cycle la consolide aussi, sans changer la lecture du cycle", () => {
    const { r1, r2, a, b, filleDeA, filleDeB } = cycleADeux(1, 2);
    echanger([r1, r2]);
    const rangDeA = rangEnregistre(r2, a);

    r2.espace.deplacerPage(filleDeB, { parent: null, position: 0 });

    expect(placeEnregistree(r2, a)).toEqual({ parent: null, rang: rangDeA });
    expect(lectureCommune([r1, r2]).racines).toEqual([
      page(filleDeB, "Fille de B"),
      page(a, "A", [page(filleDeA, "Fille de A"), page(b, "B")]),
    ]);
  });

  it("F-001-AC9 demander à la page coupée la place qu'elle occupe à la racine n'écrit rien", () => {
    const { r1, r2, a, b } = cycleADeux(1, 2);
    echanger([r1, r2]);

    const misesAJour = compterMisesAJour(r1, () =>
      r1.espace.deplacerPage(a, { parent: null, position: 0 }),
    );

    expect(misesAJour).toBe(0);
    expect(placeEnregistree(r1, a)?.parent).toBe(b);
  });

  it("F-001-AC9 déplacer la page coupée elle-même défait le cycle sans autre écriture", () => {
    const { r1, r2, a, b, filleDeA, filleDeB } = cycleADeux(1, 2);
    echanger([r1, r2]);
    const autre = r1.espace.creerPage("Autre");
    const avant = pagesEnregistrees(r1);

    r1.espace.deplacerPage(a, { parent: autre });

    expect(pagesEnregistrees(r1)).toEqual({
      ...avant,
      [a]: { ...avant[a], place: { parent: autre, rang: expect.stringMatching(RANG_VALIDE) } },
    });
    expect(lectureCommune([r1, r2]).racines).toEqual([
      page(autre, "Autre", [
        page(a, "A", [page(filleDeA, "Fille de A"), page(b, "B", [page(filleDeB, "Fille de B")])]),
      ]),
    ]);
  });

  it("F-001-AC9 une descendante de la page coupée insérée devant elle, entre deux rangs égaux : la page coupée reçoit une seule place, à la racine, avec son nouveau rang", () => {
    const [r1, r2] = [creerReplique(1), creerReplique(2)];
    const [devant, coupee, complice, descendante] = [
      identifiantFixe(1),
      identifiantFixe(2),
      identifiantFixe(3),
      identifiantFixe(4),
    ];
    r1.espace.doc.transact(() => {
      ecrireEntree(r1, devant, { parent: null, rang: "V" });
      ecrireEntree(r1, coupee, { parent: complice, rang: "V" });
      ecrireEntree(r1, complice, { parent: coupee, rang: "V" });
      ecrireEntree(r1, descendante, { parent: complice, rang: "V" });
    });
    echanger([r1, r2]);

    const misesAJour = compterMisesAJour(r2, () =>
      r2.espace.deplacerPage(descendante, { parent: null, position: 1 }),
    );

    expect(misesAJour).toBe(1);
    expect(placeEnregistree(r2, coupee)?.parent).toBeNull();
    expect(rangEnregistre(r2, coupee) > rangEnregistre(r2, descendante)).toBe(true);
    expect(rangEnregistre(r2, descendante) > "V").toBe(true);
    expect(lectureCommune([r1, r2]).racines).toEqual([
      page(devant, "page 1"),
      page(descendante, "page 4"),
      page(coupee, "page 2", [page(complice, "page 3")]),
    ]);
  });
});

describe("renommer la même page sur deux répliques", () => {
  it("F-001-AC10 les deux répliques exposent le même titre, égal à l'un des deux titres saisis", () => {
    const [a, b] = [creerReplique(1), creerReplique(2)];
    const renommee = a.espace.creerPage("Titre d'origine");
    echanger([a, b]);

    a.espace.renommerPage(renommee, "Titre de A");
    b.espace.renommerPage(renommee, "Titre de B");

    const lecture = lectureCommune([a, b]);
    expect(lecture.racines).toHaveLength(1);
    expect(["Titre de A", "Titre de B"]).toContain(lecture.racines[0]?.titre);
  });
});

describe("mettre à la corbeille pendant qu'une autre réplique ajoute une page fille", () => {
  it("F-001-AC11 corbeille contre création sous la page : la fille est listée dans la corbeille, son entrée reste dans le document", () => {
    const [a, b] = [creerReplique(1), creerReplique(2)];
    const jetee = a.espace.creerPage("Jetée");
    echanger([a, b]);

    a.espace.mettreALaCorbeille(jetee);
    const fille = b.espace.creerPage("Fille", { parent: jetee });

    expect(lectureCommune([a, b])).toEqual({
      racines: [],
      corbeille: [page(jetee, "Jetée", [page(fille, "Fille")])],
    });
    expect(pagesEnregistrees(a)[fille]).toEqual({
      titre: "Fille",
      place: { parent: jetee, rang: expect.stringMatching(RANG_VALIDE) },
      corbeille: false,
    });
  });

  it("F-001-AC11 corbeille contre déplacement sous la page : la page déplacée et sa descendance sont listées dans la corbeille, sans effacement", () => {
    const [a, b] = [creerReplique(1), creerReplique(2)];
    const jetee = a.espace.creerPage("Jetée");
    const deplacee = a.espace.creerPage("Déplacée");
    const fille = a.espace.creerPage("Fille", { parent: deplacee });
    echanger([a, b]);

    a.espace.mettreALaCorbeille(jetee);
    b.espace.deplacerPage(deplacee, { parent: jetee });

    expect(lectureCommune([a, b])).toEqual({
      racines: [],
      corbeille: [page(jetee, "Jetée", [page(deplacee, "Déplacée", [page(fille, "Fille")])])],
    });
    expect(Object.keys(pagesEnregistrees(b)).sort()).toEqual([jetee, deplacee, fille].sort());
    expect(pagesEnregistrees(b)[deplacee]?.corbeille).toBe(false);
  });
});

describe("recharger l'état complet d'un document", () => {
  it("F-001-AC12 l'état encodé puis appliqué à un Y.Doc vierge rend la même arborescence et la même corbeille", () => {
    const { espace } = creerReplique(1);
    const parent = espace.creerPage("Parent");
    const fille = espace.creerPage("Fille", { parent });
    espace.creerPage("Devant", { parent: null, position: 0 });
    espace.renommerPage(fille, "Fille renommée");
    const jetee = espace.creerPage("Jetée", { parent });
    espace.mettreALaCorbeille(jetee);

    const copie = copieParEtatComplet(espace);

    expect(copie.lire()).toEqual(espace.lire());
    expect(copie.lire().racines.map((lue) => lue.titre)).toEqual(["Devant", "Parent"]);
    expect(copie.lire().corbeille).toEqual([page(jetee, "Jetée")]);
  });
});

describe("lire une entrée à laquelle une mise à jour retenue doit encore un champ", () => {
  // A crée P et sa fille ; B les reçoit, crée Q, puis modifie P ; A reçoit la seconde mise à jour de B
  // avant la première. Yjs supprime alors l'ancienne valeur du champ et retient la nouvelle.
  const cas = [
    {
      champ: "place",
      modifier: (b: Replique, p: IdPage): void =>
        b.espace.deplacerPage(p, { parent: null, position: 1 }),
    },
    {
      champ: "titre",
      modifier: (b: Replique, p: IdPage): void => b.espace.renommerPage(p, "P renommée"),
    },
    {
      champ: "corbeille",
      modifier: (b: Replique, p: IdPage): void => b.espace.mettreALaCorbeille(p),
    },
  ];

  function fenetre(modifier: (b: Replique, p: IdPage) => void): {
    a: Replique;
    b: Replique;
    p: IdPage;
    fille: IdPage;
    premiere: Uint8Array;
    seconde: Uint8Array;
  } {
    const [a, b] = [creerReplique(1), creerReplique(2)];
    const p = a.espace.creerPage("P");
    const fille = a.espace.creerPage("Fille", { parent: p });
    livrerToutesLesEmises(b, a);
    b.espace.creerPage("Q");
    modifier(b, p);
    const [premiere, seconde] = b.emises;
    if (premiere === undefined || seconde === undefined) {
      throw new Error("B devait émettre deux mises à jour");
    }
    return { a, b, p, fille, premiere, seconde };
  }

  it.each(cas)(
    "F-001-AC7 champ $champ manquant : la mise à jour s'applique et lire() ne lève pas ; la page est ignorée, sa fille exposée à la racine, puis la lecture rejoint celle de l'émetteur",
    ({ champ, modifier }) => {
      const { a, b, p, fille, premiere, seconde } = fenetre(modifier);
      const lectures: Arborescence[] = [];
      a.espace.abonner(() => lectures.push(a.espace.lire()));

      expect(() => livrer(a, seconde)).not.toThrow();

      expect(pagesEnregistrees(a)[p]).not.toHaveProperty(champ);
      const pendantLaFenetre = { racines: [page(fille, "Fille")], corbeille: [] };
      expect(a.espace.lire()).toEqual(pendantLaFenetre);

      expect(() => livrer(a, premiere)).not.toThrow();

      expect(a.espace.lire()).toEqual(b.espace.lire());
      expect(identifiantsLus(a.espace.lire())).toContain(p);
      expect(lectures).toEqual([pendantLaFenetre, b.espace.lire()]);
    },
  );

  it("F-001-AC7 pendant la fenêtre, aucune lecture n'expose un titre indéfini ni une page jetée comme vivante", () => {
    for (const { modifier } of cas) {
      const { a, p, seconde } = fenetre(modifier);

      livrer(a, seconde);

      const lues = [...a.espace.lire().racines, ...a.espace.lire().corbeille];
      expect(lues.map((lue) => lue.id)).not.toContain(p);
      lues.forEach((lue) => expect(typeof lue.titre).toBe("string"));
    }
  });

  it.each(cas)(
    "F-001-AC7 champ $champ manquant : toute opération locale sur la page ignorée est refusée par page-introuvable, sans mise à jour",
    ({ modifier }) => {
      const { a, p, seconde } = fenetre(modifier);
      livrer(a, seconde);
      const avant = pagesEnregistrees(a);
      const codes: unknown[] = [];
      const noter = (operation: () => void): void => {
        try {
          operation();
          codes.push("acceptée");
        } catch (erreur) {
          codes.push(erreur instanceof ErreurDocument ? erreur.code : erreur);
        }
      };

      const misesAJour = compterMisesAJour(a, () => {
        noter(() => a.espace.renommerPage(p, "x"));
        noter(() => a.espace.deplacerPage(p, { parent: null }));
        noter(() => a.espace.mettreALaCorbeille(p));
        noter(() => a.espace.creerPage("x", { parent: p }));
      });

      expect(codes).toEqual(Array.from({ length: 4 }, () => "page-introuvable"));
      expect(misesAJour).toBe(0);
      expect(pagesEnregistrees(a)).toEqual(avant);
    },
  );

  it("F-001-AC7 pendant la fenêtre, une création à la racine reste possible et converge quand la mise à jour manquante arrive", () => {
    const { a, b, premiere, seconde } = fenetre((emettrice, p) =>
      emettrice.espace.renommerPage(p, "P renommée"),
    );
    livrer(a, seconde);

    const creee = a.espace.creerPage("Créée pendant la fenêtre", { parent: null, position: 0 });
    livrer(a, premiere);

    const lecture = lectureCommune([a, b]);
    expect(lecture.racines.map((lue) => lue.titre)).toEqual([
      "Créée pendant la fenêtre",
      "P renommée",
      "Q",
    ]);
    expect(identifiantsLus(lecture)).toContain(creee);
  });
});

describe("lire une page dont le parent n'est pas encore arrivé", () => {
  it("F-001-AC17 une page au parent absent est exposée à la racine, puis rejoint son parent quand il arrive", () => {
    const [a, b, troisieme, quatrieme] = [
      creerReplique(1),
      creerReplique(2),
      creerReplique(3),
      creerReplique(4),
    ];
    const [dejaLa, parent, orpheline, inseree] = [
      identifiantFixe(1),
      identifiantFixe(5),
      identifiantFixe(2),
      identifiantFixe(3),
    ];
    fixerLesProchainsIdentifiants(dejaLa, parent, orpheline, inseree);
    troisieme.espace.creerPage("Déjà là");
    a.espace.creerPage("Parent");
    livrerToutesLesEmises(b, a);
    b.espace.creerPage("Orpheline", { parent });

    livrerToutesLesEmises(troisieme, b);
    livrerToutesLesEmises(quatrieme, troisieme);
    livrerToutesLesEmises(quatrieme, b);

    const sansLeParent = {
      racines: [page(dejaLa, "Déjà là"), page(orpheline, "Orpheline")],
      corbeille: [],
    };
    expect(troisieme.espace.lire()).toEqual(sansLeParent);
    expect(quatrieme.espace.lire()).toEqual(sansLeParent);
    expect(rangEnregistre(troisieme, orpheline)).toBe(rangEnregistre(troisieme, dejaLa));

    troisieme.espace.creerPage("Insérée", { parent: null, position: 1 });

    expect(troisieme.espace.lire().racines).toEqual([
      page(dejaLa, "Déjà là"),
      page(inseree, "Insérée"),
      page(orpheline, "Orpheline"),
    ]);
    expect(placeEnregistree(troisieme, orpheline)?.parent).toBe(parent);

    livrerToutesLesEmises(troisieme, a);

    expect(troisieme.espace.lire().racines).toEqual([
      page(dejaLa, "Déjà là"),
      page(parent, "Parent", [page(orpheline, "Orpheline")]),
      page(inseree, "Insérée"),
    ]);
    expect(lectureCommune([a, b, troisieme, quatrieme])).toEqual(troisieme.espace.lire());
  });

  it("F-001-AC17 déplacer la descendante d'une page au parent absent ne fixe pas cette page à la racine", () => {
    const [a, b, troisieme] = [creerReplique(1), creerReplique(2), creerReplique(3)];
    const parent = a.espace.creerPage("Parent");
    livrerToutesLesEmises(b, a);
    const orpheline = b.espace.creerPage("Orpheline", { parent });
    const fille = b.espace.creerPage("Fille", { parent: orpheline });
    livrerToutesLesEmises(troisieme, b);

    troisieme.espace.deplacerPage(fille, { parent: null });

    expect(placeEnregistree(troisieme, orpheline)?.parent).toBe(parent);
    expect(lectureCommune([a, b, troisieme]).racines).toEqual([
      page(parent, "Parent", [page(orpheline, "Orpheline")]),
      page(fille, "Fille"),
    ]);
  });
});

type TypeDOperation = "creer" | "renommer" | "deplacer" | "jeter";

// Une étape est une opération locale sur une réplique, ou la livraison d'une de ses mises à jour.
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

const typeDOperation = fc.oneof(
  { weight: 4, arbitrary: fc.constant<TypeDOperation>("creer") },
  { weight: 2, arbitrary: fc.constant<TypeDOperation>("renommer") },
  { weight: 5, arbitrary: fc.constant<TypeDOperation>("deplacer") },
  { weight: 1, arbitrary: fc.constant<TypeDOperation>("jeter") },
);

const etape: fc.Arbitrary<Etape> = fc.record({
  livraison: fc.boolean(),
  operation: typeDOperation,
  replique: fc.nat(),
  page: fc.nat(),
  parent: fc.nat(),
  position: fc.option(fc.nat({ max: 3 }), { nil: undefined }),
  titre: fc.constantFrom("x", "y", "z"),
  destinataire: fc.nat(),
  miseAJour: fc.nat(),
});

const scenario = fc.record({
  nombreDeRepliques: fc.integer({ min: 2, max: 3 }),
  etapes: fc.array(etape, { maxLength: 60 }),
});

function choisirReplique(repliques: readonly Replique[], choix: number): Replique {
  const choisie = repliques[choix % repliques.length];
  if (choisie === undefined) {
    throw new Error("aucune réplique");
  }
  return choisie;
}

function passerLesRefus(operation: () => void): void {
  try {
    operation();
  } catch (erreur) {
    if (!(erreur instanceof ErreurDocument)) {
      throw erreur;
    }
  }
}

// Une entrée est incomplète tant qu'une mise à jour retenue par Yjs lui doit un champ.
function entreesCompletes(replique: Replique): IdPage[] {
  return Object.entries(pagesEnregistrees(replique))
    .filter(([, entree]) => "titre" in entree && "place" in entree && "corbeille" in entree)
    .map(([id]) => id);
}

// Chaque entrée complète de la réplique est lue une fois et une seule : ni perte, ni doublon, ni cycle.
function exigerUneLectureComplete(replique: Replique): void {
  const lus = identifiantsLus(replique.espace.lire());
  expect(lus.sort()).toEqual(entreesCompletes(replique).sort());
}

function operer(replique: Replique, choisie: Etape, creees: IdPage[]): Replique {
  const { espace } = replique;
  const connues = identifiantsLus(espace.lire());
  const visee = connues[choisie.page % connues.length] ?? ID_ABSENT;
  const ou = emplacement(connues[choisie.parent % (connues.length + 1)] ?? null, choisie.position);
  const operations: Record<TypeDOperation, () => void> = {
    creer: () => creees.push(espace.creerPage(`page ${creees.length}`, ou)),
    renommer: () => espace.renommerPage(visee, choisie.titre),
    deplacer: () => espace.deplacerPage(visee, ou),
    jeter: () => espace.mettreALaCorbeille(visee),
  };
  passerLesRefus(operations[choisie.operation]);
  return replique;
}

// Une livraison porte une mise à jour quelconque de l'émettrice : désordre et doublons compris.
function livrerUneMiseAJour(repliques: readonly Replique[], choisie: Etape): Replique {
  const emettrice = choisirReplique(repliques, choisie.replique);
  const destinataire = choisirReplique(repliques, choisie.destinataire);
  const miseAJour = emettrice.emises[choisie.miseAJour % emettrice.emises.length];
  if (destinataire !== emettrice && miseAJour !== undefined) {
    livrer(destinataire, miseAJour);
  }
  return destinataire;
}

function jouer(
  nombreDeRepliques: number,
  etapes: readonly Etape[],
): { repliques: Replique[]; creees: IdPage[] } {
  fixerDesIdentifiantsDisperses();
  const repliques = Array.from({ length: nombreDeRepliques }, (_, numero) =>
    creerReplique(numero + 1),
  );
  const premiere = choisirReplique(repliques, 0);
  const racine = premiere.espace.creerPage("racine commune");
  const creees = [racine, premiere.espace.creerPage("fille commune", { parent: racine })];
  creees.push(premiere.espace.creerPage("autre racine commune"));
  echanger(repliques);

  for (const choisie of etapes) {
    exigerUneLectureComplete(
      choisie.livraison
        ? livrerUneMiseAJour(repliques, choisie)
        : operer(choisirReplique(repliques, choisie.replique), choisie, creees),
    );
  }
  return { repliques, creees };
}

describe("converger quelles que soient les opérations et l'ordre de livraison", () => {
  it("F-001-AC7 pour toute suite d'opérations et tout ordre de livraison : lire() ne lève jamais, toutes les répliques lisent la même chose, chaque page créée apparaît une fois et une seule", () => {
    fc.assert(
      fc.property(scenario, ({ nombreDeRepliques, etapes }) => {
        const { repliques, creees } = jouer(nombreDeRepliques, etapes);

        const lecture = lectureCommune(repliques);

        expect(identifiantsLus(lecture).sort()).toEqual([...creees].sort());
      }),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS },
    );
  });

  it("F-001-AC9 pour toute suite d'opérations, aucune page n'apparaît deux fois ni ne disparaît : la lecture est sans cycle", () => {
    fc.assert(
      fc.property(scenario, ({ nombreDeRepliques, etapes }) => {
        const { repliques } = jouer(nombreDeRepliques, etapes);
        echanger(repliques);

        repliques.forEach(exigerUneLectureComplete);
      }),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS },
    );
  });

  it("F-001-AC12 après toute suite d'opérations et de livraisons, l'état complet de chaque réplique se relit à l'identique", () => {
    fc.assert(
      fc.property(scenario, ({ nombreDeRepliques, etapes }) => {
        const { repliques } = jouer(nombreDeRepliques, etapes);

        for (const { espace } of repliques) {
          expect(copieParEtatComplet(espace).lire()).toEqual(espace.lire());
        }
      }),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS },
    );
  });
});
