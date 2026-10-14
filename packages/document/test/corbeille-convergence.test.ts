// F-007 : convergence des restaurations et des suppressions définitives entre répliques.
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { type Arborescence, ErreurDocument, type IdPage, type PageLue } from "../src/index.ts";
import {
  creerReplique,
  echanger,
  fixerDesIdentifiantsDisperses,
  GRAINE,
  lecturesDansTousLesOrdres,
  livrer,
  NOMBRE_EXECUTIONS,
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

function identifiantsLus({ racines, corbeille }: Arborescence): IdPage[] {
  const aplatir = (pages: readonly PageLue[]): IdPage[] =>
    pages.flatMap((lue) => [lue.id, ...aplatir(lue.enfants)]);
  return [...aplatir(racines), ...aplatir(corbeille)];
}

/** Échange complet ; toutes les répliques et tous les ordres de livraison lisent la même chose. */
function lectureCommune(repliques: readonly Replique[]): Arborescence {
  const lectures = lecturesDansTousLesOrdres(repliques);
  const reference = repliques[0]?.espace.lire() ?? { racines: [], corbeille: [] };
  lectures.forEach((lecture) => expect(lecture).toEqual(reference));
  return reference;
}

/** Deux répliques qui portent Racine > Parent > Page, Page à la corbeille. */
function deuxRepliquesAvecUnePageJetee(): {
  a: Replique;
  b: Replique;
  racine: IdPage;
  parent: IdPage;
  jetee: IdPage;
} {
  const a = replique(1);
  const b = replique(2);
  const racine = a.espace.creerPage("Racine");
  const parent = a.espace.creerPage("Parent", { parent: racine });
  const jetee = a.espace.creerPage("Jetée", { parent });
  a.espace.mettreALaCorbeille(jetee);
  echanger([a, b]);
  return { a, b, racine, parent, jetee };
}

describe("restauration concurrente", () => {
  it.each<[string, (b: Replique, ids: { racine: IdPage; parent: IdPage; jetee: IdPage }) => void]>([
    ["met son parent à la corbeille", (b, { parent }) => b.espace.mettreALaCorbeille(parent)],
    ["renomme son parent", (b, { parent }) => b.espace.renommerPage(parent, "Renommé")],
    [
      "déplace son parent",
      (b, { parent }) => b.espace.deplacerPage(parent, { parent: null, position: 0 }),
    ],
  ])(
    "F-007-AC14 une réplique restaure pendant que l'autre %s : même arborescence et même corbeille partout",
    (_cas, agir) => {
      const { a, b, racine, parent, jetee } = deuxRepliquesAvecUnePageJetee();

      a.espace.restaurerPage(jetee);
      agir(b, { racine, parent, jetee });
      const lecture = lectureCommune([a, b]);

      expect(identifiantsLus(lecture).sort()).toEqual([racine, parent, jetee].sort());
    },
  );

  it("F-007-AC14 restaurée pendant que son parent part à la corbeille, la page y suit son parent", () => {
    const { a, b, parent, jetee } = deuxRepliquesAvecUnePageJetee();

    a.espace.restaurerPage(jetee);
    b.espace.mettreALaCorbeille(parent);
    const lecture = lectureCommune([a, b]);

    expect(lecture.corbeille).toEqual([
      { id: parent, titre: "Parent", enfants: [{ id: jetee, titre: "Jetée", enfants: [] }] },
    ]);
  });
});

describe("suppression concurrente", () => {
  it.each<[string, (b: Replique, jetee: IdPage) => IdPage | undefined]>([
    ["la restaure", (b, jetee) => void b.espace.restaurerPage(jetee)],
    [
      "la renomme après l'avoir restaurée",
      (b, jetee) => {
        b.espace.restaurerPage(jetee);
        b.espace.renommerPage(jetee, "Renommée");
        return undefined;
      },
    ],
    [
      "crée une page sous elle après l'avoir restaurée",
      (b, jetee) => {
        b.espace.restaurerPage(jetee);
        return b.espace.creerPage("Créée dessous", { parent: jetee });
      },
    ],
  ])(
    "F-007-AC15 une réplique supprime pendant que l'autre %s : la suppression l'emporte, une page créée dessous est exposée à la racine",
    (_cas, agir) => {
      fixerDesIdentifiantsDisperses();
      const { a, b, racine, parent, jetee } = deuxRepliquesAvecUnePageJetee();

      a.espace.supprimerDefinitivement(jetee);
      const creee = agir(b, jetee);
      const lecture = lectureCommune([a, b]);

      expect(identifiantsLus(lecture)).not.toContain(jetee);
      expect(lecture.corbeille).toEqual([]);
      expect(lecture.racines).toEqual(
        expect.arrayContaining([
          { id: racine, titre: "Racine", enfants: [expect.objectContaining({ id: parent })] },
          ...(creee === undefined ? [] : [{ id: creee, titre: "Créée dessous", enfants: [] }]),
        ]),
      );
      expect(lecture.racines).toHaveLength(creee === undefined ? 1 : 2);
    },
  );
});

type TypeDOperation = "creer" | "renommer" | "deplacer" | "jeter" | "restaurer" | "supprimer";

interface Etape {
  readonly livraison: boolean;
  readonly operation: TypeDOperation;
  readonly replique: number;
  readonly page: number;
  readonly parent: number;
  readonly titre: string;
  readonly destinataire: number;
  readonly miseAJour: number;
}

const etape: fc.Arbitrary<Etape> = fc.record({
  livraison: fc.boolean(),
  operation: fc.oneof(
    { weight: 4, arbitrary: fc.constant<TypeDOperation>("creer") },
    { weight: 1, arbitrary: fc.constant<TypeDOperation>("renommer") },
    { weight: 3, arbitrary: fc.constant<TypeDOperation>("deplacer") },
    { weight: 3, arbitrary: fc.constant<TypeDOperation>("jeter") },
    { weight: 2, arbitrary: fc.constant<TypeDOperation>("restaurer") },
    { weight: 2, arbitrary: fc.constant<TypeDOperation>("supprimer") },
  ),
  replique: fc.nat(),
  page: fc.nat(),
  parent: fc.nat(),
  titre: fc.constantFrom("x", "y", "z"),
  destinataire: fc.nat(),
  miseAJour: fc.nat(),
});

const scenario = fc.record({
  nombreDeRepliques: fc.integer({ min: 2, max: 3 }),
  etapes: fc.array(etape, { maxLength: 60 }),
});

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

function operer({ espace }: Replique, choisie: Etape): void {
  const connues = identifiantsLus(espace.lire());
  const jetees = identifiantsLus({ racines: [], corbeille: espace.lire().corbeille });
  const visee = connues[choisie.page % Math.max(connues.length, 1)] ?? ID_ABSENT;
  const jetee = jetees[choisie.page % Math.max(jetees.length, 1)] ?? ID_ABSENT;
  const parent = connues[choisie.parent % (connues.length + 1)] ?? null;
  const operations: Record<TypeDOperation, () => unknown> = {
    creer: () => espace.creerPage(`page ${choisie.titre}`, { parent }),
    renommer: () => espace.renommerPage(visee, choisie.titre),
    deplacer: () => espace.deplacerPage(visee, { parent }),
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

function entreesCompletes({ espace }: Replique): IdPage[] {
  return Object.entries(espace.doc.getMap("pages").toJSON() as Record<IdPage, object>)
    .filter(([, entree]) => "titre" in entree && "place" in entree && "corbeille" in entree)
    .map(([id]) => id);
}

function jouer(nombreDeRepliques: number, etapes: readonly Etape[]): Replique[] {
  fixerDesIdentifiantsDisperses();
  const repliques = Array.from({ length: nombreDeRepliques }, (_, numero) => replique(numero + 1));
  const premiere = choisir(repliques, 0);
  const racine = premiere.espace.creerPage("racine commune");
  premiere.espace.creerPage("fille commune", { parent: racine });
  premiere.espace.creerPage("autre racine commune");
  echanger(repliques);
  for (const choisie of etapes) {
    if (choisie.livraison) {
      livrerUneMiseAJour(repliques, choisie);
    } else {
      operer(choisir(repliques, choisie.replique), choisie);
    }
  }
  return repliques;
}

describe("converger avec restaurations et suppressions, quel que soit l'ordre", () => {
  it("F-007-AC16 pour toute suite d'opérations et tout ordre de livraison, toutes les répliques lisent la même arborescence et la même corbeille, chaque entrée restante une fois, et l'état complet se relit à l'identique", () => {
    fc.assert(
      fc.property(scenario, ({ nombreDeRepliques, etapes }) => {
        const repliques = jouer(nombreDeRepliques, etapes);
        const lecture = lectureCommune(repliques);

        for (const courante of repliques) {
          const lus = identifiantsLus(courante.espace.lire());
          expect(new Set(lus).size).toBe(lus.length);
          expect([...lus].sort()).toEqual(entreesCompletes(courante).sort());
          const vierge = new Y.Doc();
          Y.applyUpdate(vierge, Y.encodeStateAsUpdate(courante.espace.doc));
          const relue = ouvrirSuivie(vierge);
          expect(relue.lire()).toEqual(lecture);
        }
      }),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS },
    );
  });
});
