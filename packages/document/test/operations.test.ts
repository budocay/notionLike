import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  type Arborescence,
  type CodeErreurDocument,
  creerDocumentEspace,
  type DocumentEspace,
  type Emplacement,
  ErreurDocument,
  type IdPage,
  ouvrirDocumentEspace,
  type PageLue,
} from "../src/index.ts";
import { GRAINE, NOMBRE_EXECUTIONS } from "./aides.ts";

declare const crypto: { randomUUID(): string };

const RANG_VALIDE = /^[0-9A-Za-z]*[1-9A-Za-z]$/;
const ID_ABSENT = "00000000-0000-4000-8000-0000000000ff";
const TITRE_MAXIMAL = "t".repeat(200);
const TITRE_TROP_LONG = "t".repeat(201);

interface EntreeEnregistree {
  readonly titre: string;
  readonly place: { readonly parent: IdPage | null; readonly rang: string };
  readonly corbeille: boolean;
}

interface Refus {
  readonly erreurTypee: boolean;
  readonly code: CodeErreurDocument | undefined;
  readonly misesAJour: number;
}

function page(id: IdPage, titre: string, enfants: readonly PageLue[] = []): PageLue {
  return { id, titre, enfants };
}

function titres(pages: readonly PageLue[]): string[] {
  return pages.map((lue) => lue.titre);
}

function emplacement(parent: IdPage | null, position: number | undefined): Emplacement {
  return position === undefined ? { parent } : { parent, position };
}

function pagesEnregistrees(espace: DocumentEspace): Record<IdPage, EntreeEnregistree> {
  return espace.doc.getMap("pages").toJSON() as Record<IdPage, EntreeEnregistree>;
}

function rangEnregistre(espace: DocumentEspace, id: IdPage): string | undefined {
  return pagesEnregistrees(espace)[id]?.place.rang;
}

function compterMisesAJour(doc: Y.Doc, action: () => void): number {
  let misesAJour = 0;
  const compter = (): void => {
    misesAJour += 1;
  };
  doc.on("update", compter);
  try {
    action();
  } finally {
    doc.off("update", compter);
  }
  return misesAJour;
}

function observerRefus(espace: DocumentEspace, operation: () => void): Refus {
  let erreur: unknown;
  const misesAJour = compterMisesAJour(espace.doc, () => {
    try {
      operation();
    } catch (levee) {
      erreur = levee;
    }
  });
  return erreur instanceof ErreurDocument
    ? { erreurTypee: true, code: erreur.code, misesAJour }
    : { erreurTypee: false, code: undefined, misesAJour };
}

function refus(code: CodeErreurDocument): Refus {
  return { erreurTypee: true, code, misesAJour: 0 };
}

function identifiantFixe(numero: number): IdPage {
  return `00000000-0000-4000-8000-00000000000${numero}`;
}

function fixerLesProchainsIdentifiants(...identifiants: IdPage[]): void {
  const tirage = vi.spyOn(crypto, "randomUUID");
  for (const identifiant of identifiants) {
    tirage.mockReturnValueOnce(identifiant);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("créer un document d'espace", () => {
  it("F-001-AC1 un document créé a une arborescence lue vide et une corbeille vide", () => {
    const espace = creerDocumentEspace();

    const lue: Arborescence = espace.lire();

    expect(lue).toEqual({ racines: [], corbeille: [] });
  });

  it("F-001-AC1 un document créé est un Y.Doc dont la version de format vaut 1", () => {
    const espace = creerDocumentEspace();

    expect(espace.doc).toBeInstanceOf(Y.Doc);
    expect(espace.doc.getMap("meta").get("version")).toBe(1);
  });
});

describe("créer une page", () => {
  it("F-001-AC2 sans emplacement, la page apparaît à la racine avec son titre", () => {
    const espace = creerDocumentEspace();

    const id = espace.creerPage("Accueil");

    expect(espace.lire()).toEqual({ racines: [page(id, "Accueil")], corbeille: [] });
  });

  it("F-001-AC2 une création écrit une entrée au format de l'ADR-0002, en une seule mise à jour", () => {
    const espace = creerDocumentEspace();
    let id = "";

    const misesAJour = compterMisesAJour(espace.doc, () => {
      id = espace.creerPage("Accueil");
    });

    expect(misesAJour).toBe(1);
    expect(pagesEnregistrees(espace)).toEqual({
      [id]: {
        titre: "Accueil",
        place: { parent: null, rang: expect.stringMatching(RANG_VALIDE) },
        corbeille: false,
      },
    });
  });

  it("F-001-AC2 sous une page existante, la page apparaît parmi les enfants de ce parent", () => {
    const espace = creerDocumentEspace();
    const parent = espace.creerPage("Projets");

    const fille = espace.creerPage("Refonte", { parent });
    const petiteFille = espace.creerPage("Maquettes", { parent: fille });

    expect(espace.lire().racines).toEqual([
      page(parent, "Projets", [page(fille, "Refonte", [page(petiteFille, "Maquettes")])]),
    ]);
    expect(pagesEnregistrees(espace)[fille]?.place.parent).toBe(parent);
  });

  it("F-001-AC2 sans position, la page va en dernière position parmi ses sœurs", () => {
    const espace = creerDocumentEspace();
    const parent = espace.creerPage("Projets");

    for (const titre of ["a", "b", "c"]) {
      espace.creerPage(titre);
      espace.creerPage(titre, { parent });
    }

    expect(titres(espace.lire().racines)).toEqual(["Projets", "a", "b", "c"]);
    expect(titres(espace.lire().racines[0]?.enfants ?? [])).toEqual(["a", "b", "c"]);
  });

  it("F-001-AC2 en position 0, la page passe devant ses sœurs", () => {
    const espace = creerDocumentEspace();
    const parent = espace.creerPage("Projets");
    espace.creerPage("b", { parent });

    espace.creerPage("a", { parent, position: 0 });
    espace.creerPage("Avant tout", { parent: null, position: 0 });

    expect(titres(espace.lire().racines)).toEqual(["Avant tout", "Projets"]);
    expect(titres(espace.lire().racines[1]?.enfants ?? [])).toEqual(["a", "b"]);
  });

  it("F-001-AC2 à une position du milieu, la page s'insère entre ses deux voisines", () => {
    const espace = creerDocumentEspace();
    for (const titre of ["a", "d"]) {
      espace.creerPage(titre);
    }

    espace.creerPage("b", { parent: null, position: 1 });
    espace.creerPage("c", { parent: null, position: 2 });

    expect(titres(espace.lire().racines)).toEqual(["a", "b", "c", "d"]);
  });

  it("F-001-AC2 la position égale au nombre de sœurs est la dernière", () => {
    const espace = creerDocumentEspace();
    espace.creerPage("a");

    espace.creerPage("b", { parent: null, position: 1 });

    expect(titres(espace.lire().racines)).toEqual(["a", "b"]);
  });

  it("F-001-AC2 sous un parent sans enfant, la position 0 est acceptée", () => {
    const espace = creerDocumentEspace();
    const parent = espace.creerPage("Projets");

    const fille = espace.creerPage("Seule", { parent, position: 0 });

    expect(espace.lire().racines).toEqual([page(parent, "Projets", [page(fille, "Seule")])]);
  });

  it("F-001-AC2 les sœurs à la corbeille ne comptent pas dans la position", () => {
    const espace = creerDocumentEspace();
    const a = espace.creerPage("a");
    espace.creerPage("b");
    espace.mettreALaCorbeille(a);

    espace.creerPage("c", { parent: null, position: 1 });

    expect(titres(espace.lire().racines)).toEqual(["b", "c"]);
    expect(
      observerRefus(espace, () => espace.creerPage("d", { parent: null, position: 3 })),
    ).toEqual(refus("position-invalide"));
  });

  it("F-001-AC2 chaque page créée reçoit un identifiant unique dans le document", () => {
    const espace = creerDocumentEspace();
    const parent = espace.creerPage("Projets");

    const identifiants = [parent];
    for (let numero = 0; numero < 50; numero += 1) {
      identifiants.push(espace.creerPage("même titre", { parent }));
    }

    expect(new Set(identifiants).size).toBe(identifiants.length);
    expect(Object.keys(pagesEnregistrees(espace)).sort()).toEqual([...identifiants].sort());
  });

  it.each([
    { cas: "négative", position: -1 },
    { cas: "au-delà du nombre de sœurs", position: 4 },
    { cas: "non entière", position: 0.5 },
    { cas: "qui n'est pas un nombre", position: Number.NaN },
    { cas: "infinie", position: Number.POSITIVE_INFINITY },
  ])(
    "F-001-AC2 une position $cas est refusée par position-invalide, sans mise à jour",
    ({ position }) => {
      const espace = creerDocumentEspace();
      const parent = espace.creerPage("Projets");
      for (const titre of ["a", "b"]) {
        espace.creerPage(titre);
        espace.creerPage(titre, { parent });
      }
      const avant = espace.lire();

      expect(
        observerRefus(espace, () => espace.creerPage("x", { parent: null, position })),
      ).toEqual(refus("position-invalide"));
      expect(observerRefus(espace, () => espace.creerPage("x", { parent, position }))).toEqual(
        refus("position-invalide"),
      );
      expect(espace.lire()).toEqual(avant);
    },
  );

  it("F-001-AC2 un Y.Doc vierge ouvert se lit vide, reçoit une page et la rend à une seconde façade", () => {
    const doc = new Y.Doc();
    let espace: DocumentEspace | undefined;

    const misesAJourALOuverture = compterMisesAJour(doc, () => {
      espace = ouvrirDocumentEspace(doc);
    });

    expect(misesAJourALOuverture).toBe(0);
    expect(espace?.doc).toBe(doc);
    expect(espace?.lire()).toEqual({ racines: [], corbeille: [] });

    const id = espace?.creerPage("Accueil") ?? "";

    expect(espace?.lire()).toEqual({ racines: [page(id, "Accueil")], corbeille: [] });
    expect(ouvrirDocumentEspace(doc).lire()).toEqual({
      racines: [page(id, "Accueil")],
      corbeille: [],
    });
  });

  it("F-001-AC2 toute suite de créations donne l'ordre d'un modèle naïf en tableaux", () => {
    interface PageModele {
      readonly id: IdPage;
      readonly titre: string;
      readonly enfants: PageModele[];
    }
    const creation = fc.record({
      choixDuParent: fc.nat(),
      choixDeLaPosition: fc.option(fc.nat(), { nil: undefined }),
    });

    fc.assert(
      fc.property(fc.array(creation, { maxLength: 40 }), (creations) => {
        const espace = creerDocumentEspace();
        const racines: PageModele[] = [];
        const creees: PageModele[] = [];

        creations.forEach(({ choixDuParent, choixDeLaPosition }, numero) => {
          const parent = creees[choixDuParent % (creees.length + 1)];
          const soeurs = parent?.enfants ?? racines;
          const position =
            choixDeLaPosition === undefined ? undefined : choixDeLaPosition % (soeurs.length + 1);
          const titre = `page ${numero}`;

          const id = espace.creerPage(titre, emplacement(parent?.id ?? null, position));

          const creee = { id, titre, enfants: [] };
          soeurs.splice(position ?? soeurs.length, 0, creee);
          creees.push(creee);
        });

        expect(espace.lire()).toEqual({ racines, corbeille: [] });
      }),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS },
    );
  });
});

describe("mettre une page à la corbeille", () => {
  it("F-001-AC5 la page et sa descendance quittent l'arborescence lue et sont listées dans la corbeille", () => {
    const espace = creerDocumentEspace();
    const gardee = espace.creerPage("Gardée");
    const jetee = espace.creerPage("Jetée");
    const fille = espace.creerPage("Fille", { parent: jetee });
    const petiteFille = espace.creerPage("Petite-fille", { parent: fille });

    espace.mettreALaCorbeille(jetee);

    expect(espace.lire()).toEqual({
      racines: [page(gardee, "Gardée")],
      corbeille: [
        page(jetee, "Jetée", [page(fille, "Fille", [page(petiteFille, "Petite-fille")])]),
      ],
    });
  });

  it("F-001-AC5 une page fille mise à la corbeille quitte son parent, qui reste dans l'arborescence", () => {
    const espace = creerDocumentEspace();
    const parent = espace.creerPage("Parent");
    const gardee = espace.creerPage("Gardée", { parent });
    const jetee = espace.creerPage("Jetée", { parent });
    const fille = espace.creerPage("Fille", { parent: jetee });

    espace.mettreALaCorbeille(jetee);

    expect(espace.lire()).toEqual({
      racines: [page(parent, "Parent", [page(gardee, "Gardée")])],
      corbeille: [page(jetee, "Jetée", [page(fille, "Fille")])],
    });
  });

  it("F-001-AC5 une page déjà à la corbeille reste sous son parent quand celui-ci y passe", () => {
    const espace = creerDocumentEspace();
    const parent = espace.creerPage("Parent");
    const fille = espace.creerPage("Fille", { parent });
    espace.mettreALaCorbeille(fille);

    espace.mettreALaCorbeille(parent);

    expect(espace.lire()).toEqual({
      racines: [],
      corbeille: [page(parent, "Parent", [page(fille, "Fille")])],
    });
  });

  it("F-001-AC5 rien n'est effacé du document : seul le drapeau de la page visée est écrit, en une mise à jour", () => {
    const espace = creerDocumentEspace();
    const jetee = espace.creerPage("Jetée");
    const fille = espace.creerPage("Fille", { parent: jetee });
    espace.creerPage("Autre");
    const avant = pagesEnregistrees(espace);

    const misesAJour = compterMisesAJour(espace.doc, () => espace.mettreALaCorbeille(jetee));

    expect(misesAJour).toBe(1);
    expect(pagesEnregistrees(espace)).toEqual({
      ...avant,
      [jetee]: { ...avant[jetee], corbeille: true },
    });
    expect(pagesEnregistrees(espace)[fille]?.corbeille).toBe(false);
  });

  it("F-001-AC5 deux sœurs de même rang dans la corbeille sont ordonnées par identifiant, pas par création", () => {
    const [p, t, n] = [identifiantFixe(1), identifiantFixe(3), identifiantFixe(2)];
    fixerLesProchainsIdentifiants(p, t, n);
    const espace = creerDocumentEspace();

    expect(espace.creerPage("P")).toBe(p);
    expect(espace.creerPage("T", { parent: p })).toBe(t);
    espace.mettreALaCorbeille(t);

    expect(espace.lire()).toEqual({ racines: [page(p, "P")], corbeille: [page(t, "T")] });

    expect(espace.creerPage("N", { parent: p })).toBe(n);
    espace.mettreALaCorbeille(p);

    expect(rangEnregistre(espace, t)).toMatch(RANG_VALIDE);
    expect(rangEnregistre(espace, n)).toBe(rangEnregistre(espace, t));
    expect(espace.lire()).toEqual({
      racines: [],
      corbeille: [page(p, "P", [page(n, "N"), page(t, "T")])],
    });
  });

  it("F-001-AC5 deux racines de corbeille de même rang, venues de parents différents, sont ordonnées par identifiant", () => {
    const [a, b, x, y] = [
      identifiantFixe(1),
      identifiantFixe(2),
      identifiantFixe(4),
      identifiantFixe(3),
    ];
    fixerLesProchainsIdentifiants(a, b, x, y);
    const espace = creerDocumentEspace();

    expect(espace.creerPage("A")).toBe(a);
    expect(espace.creerPage("B")).toBe(b);
    expect(espace.creerPage("X", { parent: a })).toBe(x);
    expect(espace.creerPage("Y", { parent: b })).toBe(y);
    espace.mettreALaCorbeille(x);
    espace.mettreALaCorbeille(y);

    expect(rangEnregistre(espace, x)).toMatch(RANG_VALIDE);
    expect(rangEnregistre(espace, y)).toBe(rangEnregistre(espace, x));
    expect(espace.lire()).toEqual({
      racines: [page(a, "A"), page(b, "B")],
      corbeille: [page(y, "Y"), page(x, "X")],
    });
  });

  it("F-001-AC5 les racines de la corbeille sont ordonnées par rang avant l'identifiant", () => {
    const [a, premiere, seconde] = [identifiantFixe(1), identifiantFixe(3), identifiantFixe(2)];
    fixerLesProchainsIdentifiants(a, premiere, seconde);
    const espace = creerDocumentEspace();
    espace.creerPage("A");
    espace.creerPage("Première", { parent: a });
    espace.creerPage("Seconde", { parent: a });

    espace.mettreALaCorbeille(seconde);
    espace.mettreALaCorbeille(premiere);

    expect(espace.lire().corbeille).toEqual([page(premiere, "Première"), page(seconde, "Seconde")]);
  });
});

// Les deux tests se suivent : le premier laisse un identifiant fixé non consommé, que seule la
// restauration des simulacres après chaque test empêche d'atteindre le second.
describe("restaurer le tirage des identifiants après chaque test", () => {
  it("un test fixe deux identifiants et n'en consomme qu'un", () => {
    fixerLesProchainsIdentifiants(identifiantFixe(1), identifiantFixe(2));

    expect(creerDocumentEspace().creerPage("Fixée")).toBe(identifiantFixe(1));
  });

  it("le test suivant reçoit un identifiant tiré, pas l'identifiant resté en attente", () => {
    expect(creerDocumentEspace().creerPage("Libre")).not.toBe(identifiantFixe(2));
  });
});

describe("refuser une opération sur une page absente ou à la corbeille", () => {
  function espaceAvecCorbeille(): {
    espace: DocumentEspace;
    jetee: IdPage;
    descendante: IdPage;
  } {
    const espace = creerDocumentEspace();
    const jetee = espace.creerPage("Jetée");
    const fille = espace.creerPage("Fille", { parent: jetee });
    const descendante = espace.creerPage("Petite-fille", { parent: fille });
    espace.mettreALaCorbeille(jetee);
    return { espace, jetee, descendante };
  }

  it("F-001-AC14 créer sous un identifiant absent du document est refusé par page-introuvable", () => {
    const espace = creerDocumentEspace();
    espace.creerPage("Présente");
    const avant = espace.lire();

    expect(observerRefus(espace, () => espace.creerPage("x", { parent: ID_ABSENT }))).toEqual(
      refus("page-introuvable"),
    );
    expect(espace.lire()).toEqual(avant);
  });

  it("F-001-AC14 créer sous une page à la corbeille est refusé par page-a-la-corbeille", () => {
    const { espace, jetee } = espaceAvecCorbeille();
    const avant = espace.lire();

    expect(observerRefus(espace, () => espace.creerPage("x", { parent: jetee }))).toEqual(
      refus("page-a-la-corbeille"),
    );
    expect(espace.lire()).toEqual(avant);
  });

  it("F-001-AC14 créer sous la descendante d'une page à la corbeille est refusé par page-a-la-corbeille", () => {
    const { espace, descendante } = espaceAvecCorbeille();

    expect(observerRefus(espace, () => espace.creerPage("x", { parent: descendante }))).toEqual(
      refus("page-a-la-corbeille"),
    );
  });

  it("F-001-AC14 mettre à la corbeille un identifiant absent du document est refusé par page-introuvable", () => {
    const espace = creerDocumentEspace();
    espace.creerPage("Présente");

    expect(observerRefus(espace, () => espace.mettreALaCorbeille(ID_ABSENT))).toEqual(
      refus("page-introuvable"),
    );
  });

  it("F-001-AC14 mettre à la corbeille une page qui y est déjà est refusé par page-a-la-corbeille", () => {
    const { espace, jetee } = espaceAvecCorbeille();
    const avant = pagesEnregistrees(espace);

    expect(observerRefus(espace, () => espace.mettreALaCorbeille(jetee))).toEqual(
      refus("page-a-la-corbeille"),
    );
    expect(pagesEnregistrees(espace)).toEqual(avant);
  });

  it("F-001-AC14 mettre à la corbeille la descendante d'une page à la corbeille est refusé par page-a-la-corbeille", () => {
    const { espace, descendante } = espaceAvecCorbeille();
    const avant = pagesEnregistrees(espace);

    expect(observerRefus(espace, () => espace.mettreALaCorbeille(descendante))).toEqual(
      refus("page-a-la-corbeille"),
    );
    expect(pagesEnregistrees(espace)).toEqual(avant);
  });

  it("F-001-AC14 le parent est contrôlé avant la position : parent absent et position invalide donnent page-introuvable", () => {
    const espace = creerDocumentEspace();

    expect(
      observerRefus(espace, () => espace.creerPage("x", { parent: ID_ABSENT, position: 9 })),
    ).toEqual(refus("page-introuvable"));
  });
});

describe("limiter la longueur d'un titre", () => {
  it("F-001-AC15 un titre de 201 caractères est refusé à la création par titre-trop-long, sans mise à jour", () => {
    const espace = creerDocumentEspace();
    const parent = espace.creerPage("Projets");
    const avant = espace.lire();

    expect(observerRefus(espace, () => espace.creerPage(TITRE_TROP_LONG))).toEqual(
      refus("titre-trop-long"),
    );
    expect(observerRefus(espace, () => espace.creerPage(TITRE_TROP_LONG, { parent }))).toEqual(
      refus("titre-trop-long"),
    );
    expect(espace.lire()).toEqual(avant);
  });

  it("F-001-AC15 un titre de 200 caractères est accepté à la création", () => {
    const espace = creerDocumentEspace();

    const id = espace.creerPage(TITRE_MAXIMAL);

    expect(espace.lire().racines).toEqual([page(id, TITRE_MAXIMAL)]);
  });

  it("F-001-AC15 un titre vide est accepté à la création", () => {
    const espace = creerDocumentEspace();

    const id = espace.creerPage("");

    expect(espace.lire().racines).toEqual([page(id, "")]);
  });

  it("F-001-AC15 le titre est contrôlé avant le parent : titre trop long et parent absent donnent titre-trop-long", () => {
    const espace = creerDocumentEspace();

    expect(
      observerRefus(espace, () => espace.creerPage(TITRE_TROP_LONG, { parent: ID_ABSENT })),
    ).toEqual(refus("titre-trop-long"));
  });
});

function creerParTitre(
  espace: DocumentEspace,
  parent: IdPage | null,
  ...titresVoulus: string[]
): (titre: string) => IdPage {
  const identifiants = new Map(
    titresVoulus.map((titre) => [titre, espace.creerPage(titre, { parent })]),
  );
  return (titre) => identifiants.get(titre) ?? ID_ABSENT;
}

function espaceAvecPageJetee(): {
  espace: DocumentEspace;
  vivante: IdPage;
  jetee: IdPage;
  descendante: IdPage;
} {
  const espace = creerDocumentEspace();
  const vivante = espace.creerPage("Vivante");
  const jetee = espace.creerPage("Jetée");
  const fille = espace.creerPage("Fille", { parent: jetee });
  const descendante = espace.creerPage("Petite-fille", { parent: fille });
  espace.mettreALaCorbeille(jetee);
  return { espace, vivante, jetee, descendante };
}

describe("renommer une page", () => {
  it("F-001-AC3 le nouveau titre est exposé sans changer le parent, la position ni la descendance", () => {
    const espace = creerDocumentEspace();
    const parent = espace.creerPage("Parent");
    const avant = espace.creerPage("Avant", { parent });
    const renommee = espace.creerPage("Ancien titre", { parent });
    const apres = espace.creerPage("Après", { parent });
    const fille = espace.creerPage("Fille", { parent: renommee });

    espace.renommerPage(renommee, "Nouveau titre");

    expect(espace.lire()).toEqual({
      racines: [
        page(parent, "Parent", [
          page(avant, "Avant"),
          page(renommee, "Nouveau titre", [page(fille, "Fille")]),
          page(apres, "Après"),
        ]),
      ],
      corbeille: [],
    });
  });

  it("F-001-AC3 un renommage n'écrit que le titre de la page visée, en une seule mise à jour", () => {
    const espace = creerDocumentEspace();
    const renommee = espace.creerPage("Ancien titre");
    espace.creerPage("Fille", { parent: renommee });
    const avant = pagesEnregistrees(espace);

    const misesAJour = compterMisesAJour(espace.doc, () =>
      espace.renommerPage(renommee, "Nouveau titre"),
    );

    expect(misesAJour).toBe(1);
    expect(pagesEnregistrees(espace)).toEqual({
      ...avant,
      [renommee]: { ...avant[renommee], titre: "Nouveau titre" },
    });
  });

  it("F-001-AC3 renommer avec le titre déjà enregistré n'émet aucune mise à jour", () => {
    const espace = creerDocumentEspace();
    const id = espace.creerPage("Titre");
    const avant = espace.lire();

    expect(compterMisesAJour(espace.doc, () => espace.renommerPage(id, "Titre"))).toBe(0);
    expect(espace.lire()).toEqual(avant);
  });

  it("F-001-AC15 un titre de 201 caractères est refusé au renommage par titre-trop-long, sans mise à jour", () => {
    const espace = creerDocumentEspace();
    const id = espace.creerPage("Titre");

    expect(observerRefus(espace, () => espace.renommerPage(id, TITRE_TROP_LONG))).toEqual(
      refus("titre-trop-long"),
    );
    expect(espace.lire().racines).toEqual([page(id, "Titre")]);
  });

  it("F-001-AC15 un titre de 200 caractères puis un titre vide sont acceptés au renommage", () => {
    const espace = creerDocumentEspace();
    const id = espace.creerPage("Titre");

    espace.renommerPage(id, TITRE_MAXIMAL);
    expect(espace.lire().racines).toEqual([page(id, TITRE_MAXIMAL)]);

    espace.renommerPage(id, "");
    expect(espace.lire().racines).toEqual([page(id, "")]);
  });

  it("F-001-AC15 le titre est contrôlé avant la page : titre trop long et page absente donnent titre-trop-long", () => {
    const espace = creerDocumentEspace();

    expect(observerRefus(espace, () => espace.renommerPage(ID_ABSENT, TITRE_TROP_LONG))).toEqual(
      refus("titre-trop-long"),
    );
  });

  it("F-001-AC14 renommer un identifiant absent du document est refusé par page-introuvable", () => {
    const espace = creerDocumentEspace();
    espace.creerPage("Présente");

    expect(observerRefus(espace, () => espace.renommerPage(ID_ABSENT, "x"))).toEqual(
      refus("page-introuvable"),
    );
  });

  it("F-001-AC14 renommer une page à la corbeille ou l'une de ses descendantes est refusé par page-a-la-corbeille", () => {
    const { espace, jetee, descendante } = espaceAvecPageJetee();
    const avant = pagesEnregistrees(espace);

    expect(observerRefus(espace, () => espace.renommerPage(jetee, "x"))).toEqual(
      refus("page-a-la-corbeille"),
    );
    expect(observerRefus(espace, () => espace.renommerPage(descendante, "x"))).toEqual(
      refus("page-a-la-corbeille"),
    );
    expect(pagesEnregistrees(espace)).toEqual(avant);
  });
});

describe("déplacer une page", () => {
  it("F-001-AC4 vers un autre parent sans position, la page arrive en dernier avec toute sa descendance", () => {
    const espace = creerDocumentEspace();
    const source = espace.creerPage("Source");
    const cible = espace.creerPage("Cible");
    const deplacee = espace.creerPage("Déplacée", { parent: source });
    const restante = espace.creerPage("Restante", { parent: source });
    const fille = espace.creerPage("Fille", { parent: deplacee });
    const petiteFille = espace.creerPage("Petite-fille", { parent: fille });
    const dejaLa = espace.creerPage("Déjà là", { parent: cible });

    espace.deplacerPage(deplacee, { parent: cible });

    expect(espace.lire()).toEqual({
      racines: [
        page(source, "Source", [page(restante, "Restante")]),
        page(cible, "Cible", [
          page(dejaLa, "Déjà là"),
          page(deplacee, "Déplacée", [page(fille, "Fille", [page(petiteFille, "Petite-fille")])]),
        ]),
      ],
      corbeille: [],
    });
  });

  it.each([
    { position: 0, attendu: ["x", "a", "b", "c"] },
    { position: 1, attendu: ["a", "x", "b", "c"] },
    { position: 2, attendu: ["a", "b", "x", "c"] },
    { position: 3, attendu: ["a", "b", "c", "x"] },
  ])(
    "F-001-AC4 vers la position $position d'un autre parent, sans changer l'ordre des autres pages",
    ({ position, attendu }) => {
      const espace = creerDocumentEspace();
      const cible = espace.creerPage("Cible");
      const x = espace.creerPage("x");
      espace.creerPage("Témoin");
      creerParTitre(espace, cible, "a", "b", "c");

      espace.deplacerPage(x, { parent: cible, position });

      expect(titres(espace.lire().racines)).toEqual(["Cible", "Témoin"]);
      expect(titres(espace.lire().racines[0]?.enfants ?? [])).toEqual(attendu);
    },
  );

  it.each([
    { deplacee: "a", position: 2, attendu: ["b", "c", "a", "d"] },
    { deplacee: "a", position: 3, attendu: ["b", "c", "d", "a"] },
    { deplacee: "a", position: undefined, attendu: ["b", "c", "d", "a"] },
    { deplacee: "d", position: 0, attendu: ["d", "a", "b", "c"] },
    { deplacee: "c", position: 1, attendu: ["a", "c", "b", "d"] },
    { deplacee: "b", position: 2, attendu: ["a", "c", "b", "d"] },
  ])(
    "F-001-AC4 $deplacee vers la position $position du même parent, comptée sans la page déplacée",
    ({ deplacee, position, attendu }) => {
      const espace = creerDocumentEspace();
      const parent = espace.creerPage("Parent");
      const aLaRacine = creerParTitre(espace, null, "a", "b", "c", "d");
      const sousLeParent = creerParTitre(espace, parent, "a", "b", "c", "d");

      espace.deplacerPage(
        aLaRacine(deplacee),
        emplacement(null, position === undefined ? undefined : position + 1),
      );
      espace.deplacerPage(sousLeParent(deplacee), emplacement(parent, position));

      expect(titres(espace.lire().racines)).toEqual(["Parent", ...attendu]);
      expect(titres(espace.lire().racines[0]?.enfants ?? [])).toEqual(attendu);
    },
  );

  it("F-001-AC4 d'un parent vers la racine, la page et sa descendance arrivent à la position demandée", () => {
    const espace = creerDocumentEspace();
    const parent = espace.creerPage("Parent");
    const autre = espace.creerPage("Autre");
    const deplacee = espace.creerPage("Déplacée", { parent });
    const fille = espace.creerPage("Fille", { parent: deplacee });

    espace.deplacerPage(deplacee, { parent: null, position: 1 });

    expect(espace.lire().racines).toEqual([
      page(parent, "Parent"),
      page(deplacee, "Déplacée", [page(fille, "Fille")]),
      page(autre, "Autre"),
    ]);
  });

  it("F-001-AC4 un déplacement n'écrit que la place de la page déplacée, en une seule mise à jour", () => {
    const espace = creerDocumentEspace();
    const cible = espace.creerPage("Cible");
    const deplacee = espace.creerPage("Déplacée");
    espace.creerPage("Fille", { parent: deplacee });
    espace.creerPage("Déjà là", { parent: cible });
    const avant = pagesEnregistrees(espace);

    const misesAJour = compterMisesAJour(espace.doc, () =>
      espace.deplacerPage(deplacee, { parent: cible, position: 0 }),
    );

    expect(misesAJour).toBe(1);
    expect(pagesEnregistrees(espace)).toEqual({
      ...avant,
      [deplacee]: {
        ...avant[deplacee],
        place: { parent: cible, rang: expect.stringMatching(RANG_VALIDE) },
      },
    });
  });

  it.each([
    { cas: "à la position qu'elle occupe", deplacee: "b", position: 1 },
    { cas: "à la première position qu'elle occupe déjà", deplacee: "a", position: 0 },
    { cas: "à la dernière position qu'elle occupe déjà", deplacee: "c", position: 2 },
    { cas: "sans position alors qu'elle est déjà la dernière", deplacee: "c", position: undefined },
  ])(
    "F-001-AC4 déplacer une page $cas, sous le même parent, n'émet aucune mise à jour",
    ({ deplacee, position }) => {
      const espace = creerDocumentEspace();
      const parent = espace.creerPage("Parent");
      const sousLeParent = creerParTitre(espace, parent, "a", "b", "c");
      const avant = pagesEnregistrees(espace);

      const misesAJour = compterMisesAJour(espace.doc, () =>
        espace.deplacerPage(sousLeParent(deplacee), emplacement(parent, position)),
      );

      expect(misesAJour).toBe(0);
      expect(pagesEnregistrees(espace)).toEqual(avant);
    },
  );

  it("F-001-AC4 déplacer une page de la racine à la place qu'elle y occupe n'émet aucune mise à jour", () => {
    const espace = creerDocumentEspace();
    const aLaRacine = creerParTitre(espace, null, "a", "b");

    expect(
      compterMisesAJour(espace.doc, () =>
        espace.deplacerPage(aLaRacine("a"), { parent: null, position: 0 }),
      ),
    ).toBe(0);
    expect(
      compterMisesAJour(espace.doc, () => espace.deplacerPage(aLaRacine("b"), { parent: null })),
    ).toBe(0);
  });

  it.each([
    { cas: "négative", position: -1 },
    { cas: "égale au nombre de sœurs, page déplacée comprise", position: 3 },
    { cas: "non entière", position: 0.5 },
    { cas: "qui n'est pas un nombre", position: Number.NaN },
  ])(
    "F-001-AC4 une position $cas est refusée par position-invalide, sans mise à jour",
    ({ position }) => {
      const espace = creerDocumentEspace();
      const autreParent = espace.creerPage("Autre parent");
      creerParTitre(espace, autreParent, "x", "y");
      const parent = espace.creerPage("Parent");
      const sousLeParent = creerParTitre(espace, parent, "a", "b", "c");
      const avant = pagesEnregistrees(espace);

      expect(
        observerRefus(espace, () => espace.deplacerPage(sousLeParent("b"), { parent, position })),
      ).toEqual(refus("position-invalide"));
      expect(
        observerRefus(espace, () =>
          espace.deplacerPage(sousLeParent("b"), { parent: autreParent, position }),
        ),
      ).toEqual(refus("position-invalide"));
      expect(pagesEnregistrees(espace)).toEqual(avant);
    },
  );

  it("F-001-AC4 toute suite de créations et de déplacements donne l'ordre d'un modèle naïf en tableaux", () => {
    interface PageModele {
      readonly id: IdPage;
      readonly titre: string;
      readonly enfants: PageModele[];
    }
    interface Modele {
      readonly racines: PageModele[];
      readonly creees: PageModele[];
      readonly fratries: Map<IdPage, PageModele[]>;
    }
    const choix = {
      choixDeLaPage: fc.nat(),
      choixDuParent: fc.nat(),
      choixDeLaPosition: fc.option(fc.nat(), { nil: undefined }),
    };
    const operation = fc.oneof(
      fc.record({ deplacement: fc.constant(false), ...choix }),
      fc.record({ deplacement: fc.constant(true), ...choix }),
    );
    type Operation = typeof operation extends fc.Arbitrary<infer T> ? T : never;

    function contient(racine: PageModele, cherchee: PageModele): boolean {
      return racine === cherchee || racine.enfants.some((enfant) => contient(enfant, cherchee));
    }

    function inserer(
      modele: Modele,
      inseree: PageModele,
      parent: PageModele | undefined,
      choixDeLaPosition: number | undefined,
    ): Emplacement {
      const soeurs = parent?.enfants ?? modele.racines;
      const position =
        choixDeLaPosition === undefined ? undefined : choixDeLaPosition % (soeurs.length + 1);
      soeurs.splice(position ?? soeurs.length, 0, inseree);
      modele.fratries.set(inseree.id, soeurs);
      return emplacement(parent?.id ?? null, position);
    }

    function creer(espace: DocumentEspace, modele: Modele, choisie: Operation): void {
      const parent = modele.creees[choisie.choixDuParent % (modele.creees.length + 1)];
      const titre = `page ${modele.creees.length}`;
      const soeurs = parent?.enfants ?? modele.racines;
      const position =
        choisie.choixDeLaPosition === undefined
          ? undefined
          : choisie.choixDeLaPosition % (soeurs.length + 1);
      const id = espace.creerPage(titre, emplacement(parent?.id ?? null, position));
      const creee = { id, titre, enfants: [] };
      inserer(modele, creee, parent, position);
      modele.creees.push(creee);
    }

    function deplacer(espace: DocumentEspace, modele: Modele, choisie: Operation): void {
      const deplacee = modele.creees[choisie.choixDeLaPage % modele.creees.length];
      const parent = modele.creees[choisie.choixDuParent % (modele.creees.length + 1)];
      if (deplacee === undefined) {
        return;
      }
      if (parent !== undefined && contient(deplacee, parent)) {
        expect(
          observerRefus(espace, () => espace.deplacerPage(deplacee.id, { parent: parent.id })),
        ).toEqual(refus("deplacement-cyclique"));
        return;
      }
      const anciennes = modele.fratries.get(deplacee.id) ?? [];
      anciennes.splice(anciennes.indexOf(deplacee), 1);
      espace.deplacerPage(
        deplacee.id,
        inserer(modele, deplacee, parent, choisie.choixDeLaPosition),
      );
    }

    fc.assert(
      fc.property(fc.array(operation, { maxLength: 40 }), (operations) => {
        const espace = creerDocumentEspace();
        const modele: Modele = { racines: [], creees: [], fratries: new Map() };

        for (const choisie of operations) {
          if (choisie.deplacement) {
            deplacer(espace, modele, choisie);
          } else {
            creer(espace, modele, choisie);
          }
        }

        expect(espace.lire()).toEqual({ racines: modele.racines, corbeille: [] });
      }),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS },
    );
  });

  it.each([
    { cas: "elle-même", destination: "Déplacée" },
    { cas: "sa fille", destination: "Fille" },
    { cas: "sa petite-fille", destination: "Petite-fille" },
  ])(
    "F-001-AC13 déplacer une page sous $cas est refusé par deplacement-cyclique, sans mise à jour",
    ({ destination }) => {
      const espace = creerDocumentEspace();
      const deplacee = espace.creerPage("Déplacée");
      const fille = espace.creerPage("Fille", { parent: deplacee });
      const petiteFille = espace.creerPage("Petite-fille", { parent: fille });
      const parDestination = new Map([
        ["Déplacée", deplacee],
        ["Fille", fille],
        ["Petite-fille", petiteFille],
      ]);
      const avant = pagesEnregistrees(espace);

      expect(
        observerRefus(espace, () =>
          espace.deplacerPage(deplacee, { parent: parDestination.get(destination) ?? null }),
        ),
      ).toEqual(refus("deplacement-cyclique"));
      expect(pagesEnregistrees(espace)).toEqual(avant);
    },
  );

  it("F-001-AC13 le cycle est contrôlé avant la position : cycle et position invalide donnent deplacement-cyclique", () => {
    const espace = creerDocumentEspace();
    const deplacee = espace.creerPage("Déplacée");
    const fille = espace.creerPage("Fille", { parent: deplacee });

    expect(
      observerRefus(espace, () => espace.deplacerPage(deplacee, { parent: fille, position: 9 })),
    ).toEqual(refus("deplacement-cyclique"));
  });

  it("F-001-AC13 déplacer une page sous une sœur de sa descendance n'est pas un cycle", () => {
    const espace = creerDocumentEspace();
    const parent = espace.creerPage("Parent");
    const fille = espace.creerPage("Fille", { parent });
    const autre = espace.creerPage("Autre");

    espace.deplacerPage(fille, { parent: autre });
    espace.deplacerPage(parent, { parent: fille });

    expect(espace.lire().racines).toEqual([
      page(autre, "Autre", [page(fille, "Fille", [page(parent, "Parent")])]),
    ]);
  });

  it("F-001-AC14 déplacer un identifiant absent du document est refusé par page-introuvable", () => {
    const { espace, vivante } = espaceAvecPageJetee();

    expect(
      observerRefus(espace, () => espace.deplacerPage(ID_ABSENT, { parent: vivante })),
    ).toEqual(refus("page-introuvable"));
  });

  it("F-001-AC14 déplacer une page à la corbeille ou l'une de ses descendantes est refusé par page-a-la-corbeille", () => {
    const { espace, vivante, jetee, descendante } = espaceAvecPageJetee();
    const avant = pagesEnregistrees(espace);

    expect(observerRefus(espace, () => espace.deplacerPage(jetee, { parent: vivante }))).toEqual(
      refus("page-a-la-corbeille"),
    );
    expect(observerRefus(espace, () => espace.deplacerPage(descendante, { parent: null }))).toEqual(
      refus("page-a-la-corbeille"),
    );
    expect(pagesEnregistrees(espace)).toEqual(avant);
  });

  it("F-001-AC14 déplacer sous un identifiant absent du document est refusé par page-introuvable", () => {
    const { espace, vivante } = espaceAvecPageJetee();

    expect(
      observerRefus(espace, () => espace.deplacerPage(vivante, { parent: ID_ABSENT })),
    ).toEqual(refus("page-introuvable"));
  });

  it("F-001-AC14 déplacer sous une page à la corbeille ou l'une de ses descendantes est refusé par page-a-la-corbeille", () => {
    const { espace, vivante, jetee, descendante } = espaceAvecPageJetee();
    const avant = pagesEnregistrees(espace);

    expect(observerRefus(espace, () => espace.deplacerPage(vivante, { parent: jetee }))).toEqual(
      refus("page-a-la-corbeille"),
    );
    expect(
      observerRefus(espace, () => espace.deplacerPage(vivante, { parent: descendante })),
    ).toEqual(refus("page-a-la-corbeille"));
    expect(pagesEnregistrees(espace)).toEqual(avant);
  });

  it("F-001-AC14 la page visée est contrôlée avant le parent : page à la corbeille et parent absent donnent page-a-la-corbeille", () => {
    const { espace, jetee } = espaceAvecPageJetee();

    expect(observerRefus(espace, () => espace.deplacerPage(jetee, { parent: ID_ABSENT }))).toEqual(
      refus("page-a-la-corbeille"),
    );
  });

  it("F-001-AC14 le parent est contrôlé avant la position : parent à la corbeille et position invalide donnent page-a-la-corbeille", () => {
    const { espace, vivante, jetee } = espaceAvecPageJetee();

    expect(
      observerRefus(espace, () => espace.deplacerPage(vivante, { parent: jetee, position: 9 })),
    ).toEqual(refus("page-a-la-corbeille"));
  });
});
