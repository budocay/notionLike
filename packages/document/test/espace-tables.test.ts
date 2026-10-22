// F-018, bloc 1 : une page de type `table` dans le document d'espace, et la version 2 du format
// (ADR-0002, amendement F-018). La convergence est dans `espace-tables-convergence.test.ts`.
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import * as Y from "yjs";

import { lireLaVersion } from "../src/format.ts";
import {
  type Arborescence,
  type DocumentEspace,
  type Emplacement,
  ErreurDocument,
  type IdPage,
  type PageLue,
  type TypeDePage,
} from "../src/index.ts";
import { creerSuivie, fermerLesSuivies, ouvrirSuivie } from "./aides-corbeille.ts";
import { ETAT_V1_DE_F001, LECTURE_V1_DE_F001 } from "./etat-v1-f001.ts";

declare const crypto: { randomUUID(): string };

const ID_ABSENT = "00000000-0000-4000-8000-0000000000ff";
const TITRE_TROP_LONG = "t".repeat(201);

afterEach(() => {
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

function misesAJourPendant(doc: Y.Doc, operation: () => unknown): Uint8Array[] {
  const emises: Uint8Array[] = [];
  const ecouter = (miseAJour: Uint8Array): void => void emises.push(miseAJour);
  doc.on("update", ecouter);
  try {
    operation();
  } finally {
    doc.off("update", ecouter);
  }
  return emises;
}

function pagesStockees(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>("pages");
}

function typeStocke(doc: Y.Doc, id: IdPage): unknown {
  return pagesStockees(doc).get(id)?.get("type");
}

/** Versions inscrites dans le type racine `versions`, sans le créer s'il est absent. */
function versionsInscrites(doc: Y.Doc): unknown[] | undefined {
  return doc.share.has("versions") ? doc.getArray<unknown>("versions").toArray() : undefined;
}

/** Réplique qui a convergé avec `doc` : un document vierge qui reçoit son état complet. */
function repliqueDe(doc: Y.Doc): DocumentEspace {
  const vierge = new Y.Doc();
  Y.applyUpdate(vierge, Y.encodeStateAsUpdate(doc));
  return ouvrirSuivie(vierge);
}

function pageLue(id: IdPage, titre: string, enfants: readonly PageLue[] = []): PageLue {
  return { id, titre, enfants };
}

function tableLue(id: IdPage, titre: string, enfants: readonly PageLue[] = []): PageLue {
  return { id, titre, type: "table", enfants };
}

function toutesLesPages(arborescence: Arborescence): PageLue[] {
  const aVoir = [...arborescence.racines, ...arborescence.corbeille];
  for (const lue of aVoir) {
    aVoir.push(...lue.enfants);
  }
  return aVoir;
}

function etatV1DeF001(): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(Buffer.from(ETAT_V1_DE_F001, "base64")));
  return doc;
}

/** Une entrée écrite à la main, comme le ferait un pair qui contourne le module. */
function ecrireEntree(doc: Y.Doc, id: IdPage, champs: Record<string, unknown>): void {
  const entree = new Y.Map<unknown>();
  for (const [nom, valeur] of Object.entries(champs)) {
    entree.set(nom, valeur);
  }
  pagesStockees(doc).set(id, entree);
}

function champsValides(titre: string, rang: string): Record<string, unknown> {
  return { titre, place: { parent: null, rang }, corbeille: false };
}

// ── F-018-AC1 : créer une table ──────────────────────────────────────────────────────────────────

type Creer = (titre: string, ou?: Emplacement) => IdPage;

const REFUS_DE_CREATION: [string, string, (espace: DocumentEspace, creer: Creer) => unknown][] = [
  ["titre trop long", "titre-trop-long", (_espace, creer) => creer(TITRE_TROP_LONG)],
  ["parent absent", "page-introuvable", (_espace, creer) => creer("t", { parent: ID_ABSENT })],
  [
    "parent à la corbeille",
    "page-a-la-corbeille",
    (espace, creer) => {
      const [jetee] = toutesLesPages(espace.lire());
      return creer("t", { parent: jetee?.id ?? ID_ABSENT });
    },
  ],
  [
    "position hors bornes",
    "position-invalide",
    (_espace, creer) => creer("t", { parent: null, position: 5 }),
  ],
  [
    "version 3 et titre trop long",
    "version-non-prise-en-charge",
    (espace, creer) => {
      espace.doc.getMap("meta").set("version", 3);
      return creer(TITRE_TROP_LONG);
    },
  ],
  [
    "façade fermée et titre trop long",
    "facade-fermee",
    (espace, creer) => {
      espace.fermer();
      return creer(TITRE_TROP_LONG);
    },
  ],
];

describe("créer une table", () => {
  it("F-018-AC1 creerTable inscrit à la racine une page de type table, sous l'identifiant tiré de crypto.randomUUID, en dernière position", () => {
    const espace = creerSuivie();
    const page = espace.creerPage("Page");
    const tirage = vi.spyOn(crypto, "randomUUID");

    const table = espace.creerTable("Tâches");

    expect(tirage).toHaveBeenCalledTimes(1);
    expect(table).toBe(tirage.mock.results[0]?.value);
    expect(espace.lire()).toEqual({
      racines: [pageLue(page, "Page"), tableLue(table, "Tâches")],
      corbeille: [],
    });
    expect(typeStocke(espace.doc, table)).toBe("table");
  });

  it("F-018-AC1 creerTable place la table sous une page existante, à la position demandée, comme creerPage", () => {
    const espace = creerSuivie();
    const parent = espace.creerPage("Parent");
    const premiere = espace.creerPage("Première", { parent });
    const seconde = espace.creerPage("Seconde", { parent });

    const table = espace.creerTable("", { parent, position: 1 });
    const enTete = espace.creerTable("En tête", { parent, position: 0 });

    expect(espace.lire().racines).toEqual([
      pageLue(parent, "Parent", [
        tableLue(enTete, "En tête"),
        pageLue(premiere, "Première"),
        tableLue(table, ""),
        pageLue(seconde, "Seconde"),
      ]),
    ]);
  });

  it("F-018-AC1 l'identifiant n'est jamais fourni par l'appelant : deux créations au même titre donnent deux tirages distincts", () => {
    const espace = creerSuivie();

    const une = espace.creerTable("Même");
    const autre = espace.creerTable("Même");

    expect(espace.creerTable.length).toBe(1);
    expect(une).not.toBe(autre);
    expect(toutesLesPages(espace.lire()).map((lue) => lue.id)).toEqual([une, autre]);
  });

  it.each(REFUS_DE_CREATION)(
    "F-018-AC1 F-018-AC8 %s : creerTable refuse par %s, le même code que creerPage, sans rien écrire",
    (_cas, code, tenter) => {
      const [pourLaTable, pourLaPage] = [creerSuivie(), creerSuivie()];
      for (const espace of [pourLaTable, pourLaPage]) {
        espace.mettreALaCorbeille(espace.creerPage("Jetée"));
      }
      const avant = Y.encodeStateAsUpdate(pourLaTable.doc);
      let refus = "";

      const emises = misesAJourPendant(pourLaTable.doc, () => {
        refus = codeDuRefus(() => tenter(pourLaTable, (...a) => pourLaTable.creerTable(...a)));
      });

      expect(refus).toBe(code);
      expect(codeDuRefus(() => tenter(pourLaPage, (...a) => pourLaPage.creerPage(...a)))).toBe(
        code,
      );
      const ecritParLePreparatif = code === "version-non-prise-en-charge" ? 1 : 0;
      expect(emises).toHaveLength(ecritParLePreparatif);
      if (ecritParLePreparatif === 0) {
        expect(Y.encodeStateAsUpdate(pourLaTable.doc)).toEqual(avant);
      }
      expect(versionsInscrites(pourLaTable.doc)).toBeUndefined();
    },
  );
});

// ── F-018-AC2 : le type de chaque page lue ───────────────────────────────────────────────────────

describe("lire le type des pages", () => {
  it("F-018-AC2 l'arborescence et la corbeille exposent le type table ; une page n'a pas de champ type", () => {
    const espace = creerSuivie();
    const parent = espace.creerPage("Parent");
    const tableFille = espace.creerTable("Table fille", { parent });
    const pageFille = espace.creerPage("Page fille", { parent: tableFille });
    const tableJetee = espace.creerTable("Table jetée");
    espace.mettreALaCorbeille(tableJetee);
    const lue = espace.lire();

    expect(lue).toEqual({
      racines: [
        pageLue(parent, "Parent", [
          tableLue(tableFille, "Table fille", [pageLue(pageFille, "Page fille")]),
        ]),
      ],
      corbeille: [tableLue(tableJetee, "Table jetée")],
    });

    espace.mettreALaCorbeille(parent);

    expect(espace.lire().corbeille).toEqual([
      pageLue(parent, "Parent", [
        tableLue(tableFille, "Table fille", [pageLue(pageFille, "Page fille")]),
      ]),
      tableLue(tableJetee, "Table jetée"),
    ]);
    const types = toutesLesPages(espace.lire()).map((page) =>
      "type" in page ? page.type : "aucun champ",
    );
    expect(types).toEqual(["aucun champ", "table", "table", "aucun champ"]);
  });

  it("F-018-AC2 un document écrit avant F-018 (état de version 1 de F-001) se lit comme avant : aucune page n'a de champ type", () => {
    const espace = ouvrirSuivie(etatV1DeF001());

    expect(espace.lire()).toEqual(LECTURE_V1_DE_F001);
    expect(toutesLesPages(espace.lire()).filter((page) => "type" in page)).toEqual([]);
    expect(lireLaVersion(espace.doc)).toEqual({ version: 1, admise: true });
  });

  it("F-018-AC2 une entrée sans type, ou de type « page », se lit page ; une entrée de type « table » se lit table", () => {
    const doc = new Y.Doc();
    ecrireEntree(doc, "sans-type", champsValides("Sans type", "F"));
    ecrireEntree(doc, "page", { ...champsValides("Page", "N"), type: "page" });
    ecrireEntree(doc, "table", { ...champsValides("Table", "V"), type: "table" });

    expect(ouvrirSuivie(doc).lire().racines).toEqual([
      pageLue("sans-type", "Sans type"),
      pageLue("page", "Page"),
      tableLue("table", "Table"),
    ]);
  });

  it("F-018-AC2 F-018-AC8 deux arborescences qui ne diffèrent que par le type d'une page sont différentes : l'abonné est notifié", () => {
    const espace = creerSuivie();
    const page = espace.creerPage("Page");
    const rappel = vi.fn();
    espace.abonner(rappel);

    pagesStockees(espace.doc).get(page)?.set("type", "table");

    expect(rappel).toHaveBeenCalledTimes(1);
    expect(espace.lire().racines).toEqual([tableLue(page, "Page")]);
  });

  it("F-018-AC2 F-018-AC8 TypeDePage vaut page ou table, et PageLue porte le type table seulement", () => {
    expectTypeOf<TypeDePage>().toEqualTypeOf<"page" | "table">();
    expectTypeOf<PageLue["type"]>().toEqualTypeOf<"table" | undefined>();
  });
});

// ── F-018-AC3 : version 2 écrite par la première table seulement ─────────────────────────────────

/** Une façade sur un document sans table, avec une page à la racine, une fille et une page jetée. */
interface Scene {
  readonly espace: DocumentEspace;
  readonly racine: IdPage;
  readonly fille: IdPage;
  readonly jetee: IdPage;
}

// Chaque membre de la façade, hors `doc` et `creerTable`, joué sur un document sans table.
const OPERATIONS_SANS_TABLE: Readonly<Record<string, (scene: Scene) => unknown>> = {
  lire: ({ espace }) => espace.lire(),
  abonner: ({ espace }) => espace.abonner(() => undefined)(),
  creerPage: ({ espace, racine }) => espace.creerPage("Nouvelle", { parent: racine }),
  renommerPage: ({ espace, fille }) => espace.renommerPage(fille, "Renommée"),
  deplacerPage: ({ espace, fille }) => espace.deplacerPage(fille, { parent: null, position: 0 }),
  mettreALaCorbeille: ({ espace, racine }) => espace.mettreALaCorbeille(racine),
  restaurerPage: ({ espace, jetee }) => espace.restaurerPage(jetee),
  supprimerDefinitivement: ({ espace, jetee }) => espace.supprimerDefinitivement(jetee),
  fermer: ({ espace }) => espace.fermer(),
};

const DOCUMENTS_SANS_TABLE: [string, () => DocumentEspace, unknown][] = [
  ["créé par creerDocumentEspace", () => creerSuivie(), 1],
  ["vierge, sans clé de version", () => ouvrirSuivie(new Y.Doc()), undefined],
];

function scene(espace: DocumentEspace): Scene {
  const racine = espace.creerPage("Racine");
  const fille = espace.creerPage("Fille", { parent: racine });
  const jetee = espace.creerPage("Jetée");
  espace.mettreALaCorbeille(jetee);
  return { espace, racine, fille, jetee };
}

describe("élever la version à 2 par la première table, et seulement par elle", () => {
  it("F-018-AC3 le tableau des opérations couvre chaque membre de la façade hors doc et creerTable", () => {
    const membres = Object.keys(creerSuivie()).filter((nom) => nom !== "doc");

    expect([...Object.keys(OPERATIONS_SANS_TABLE), "creerTable"].sort()).toEqual(membres.sort());
  });

  it.each(DOCUMENTS_SANS_TABLE)(
    "F-018-AC3 document %s : l'ouverture et chaque opération de la façade hors creerTable laissent la version lue à 1 et n'écrivent aucune version",
    (_cas, ouvrir, versionDeDepart) => {
      for (const [nom, operation] of Object.entries(OPERATIONS_SANS_TABLE)) {
        const espace = ouvrir();
        const meta = espace.doc.getMap("meta");
        let ecrituresDeMeta = 0;
        meta.observe(() => void (ecrituresDeMeta += 1));
        const ouverte = ouvrirSuivie(espace.doc);

        operation(scene(ouverte));

        expect(ecrituresDeMeta, nom).toBe(0);
        expect(meta.get("version"), nom).toBe(versionDeDepart);
        expect(espace.doc.share.has("versions"), nom).toBe(false);
        expect(lireLaVersion(espace.doc), nom).toEqual({ version: 1, admise: true });
        expect(lireLaVersion(repliqueDe(espace.doc).doc), nom).toEqual({
          version: 1,
          admise: true,
        });
      }
    },
  );

  it.each(DOCUMENTS_SANS_TABLE)(
    "F-018-AC3 document %s : la première table élève meta.version et versions à 2 dans la transaction même de son inscription",
    (_cas, ouvrir) => {
      const espace = ouvrir();
      const transactions: Y.Transaction[] = [];
      const noter = (transaction: Y.Transaction): void => void transactions.push(transaction);
      espace.doc.on("afterTransaction", noter);

      const table = espace.creerTable("Première table");
      espace.doc.off("afterTransaction", noter);

      expect(transactions).toHaveLength(1);
      const changes = [...(transactions[0]?.changed.keys() ?? [])];
      expect(changes).toEqual(
        expect.arrayContaining([
          espace.doc.getMap("meta"),
          espace.doc.getArray("versions"),
          espace.doc.getMap("pages"),
        ]),
      );
      expect(espace.doc.getMap("meta").get("version")).toBe(2);
      expect(versionsInscrites(espace.doc)).toEqual([2]);
      expect(lireLaVersion(espace.doc)).toEqual({ version: 2, admise: true });
      expect(repliqueDe(espace.doc).lire().racines).toEqual([tableLue(table, "Première table")]);
    },
  );

  it("F-018-AC3 une seule mise à jour porte la version et la table : la réplique qui la reçoit ne lit jamais la table en version 1", () => {
    const espace = creerSuivie();
    const recue = repliqueDe(espace.doc);
    const emises = misesAJourPendant(espace.doc, () => espace.creerTable("T"));

    expect(emises).toHaveLength(1);
    Y.applyUpdate(recue.doc, emises[0] ?? new Uint8Array());
    expect(lireLaVersion(recue.doc)).toEqual({ version: 2, admise: true });
    expect(toutesLesPages(recue.lire()).map((page) => page.type)).toEqual(["table"]);
  });

  it("F-018-AC3 les tables suivantes et les autres opérations n'écrivent plus de version", () => {
    const espace = creerSuivie();
    const premiere = espace.creerTable("Première");
    const meta = espace.doc.getMap("meta");
    let ecrituresDeMeta = 0;
    meta.observe(() => void (ecrituresDeMeta += 1));
    let ecrituresDeVersions = 0;
    espace.doc.getArray("versions").observe(() => void (ecrituresDeVersions += 1));

    espace.creerTable("Seconde", { parent: premiere });
    espace.renommerPage(premiere, "Renommée");
    espace.mettreALaCorbeille(premiere);
    espace.supprimerDefinitivement(premiere);

    expect(ecrituresDeMeta).toBe(0);
    expect(ecrituresDeVersions).toBe(0);
    expect(versionsInscrites(espace.doc)).toEqual([2]);
    expect(lireLaVersion(espace.doc)).toEqual({ version: 2, admise: true });
  });

  it("F-018-AC3 une création de table refusée n'écrit aucune version", () => {
    const espace = creerSuivie();

    expect(codeDuRefus(() => espace.creerTable(TITRE_TROP_LONG))).toBe("titre-trop-long");
    expect(espace.doc.getMap("meta").get("version")).toBe(1);
    expect(espace.doc.share.has("versions")).toBe(false);
  });

  it("F-018-AC3 une forme stockée incomplète (pair défectueux) est réparée par la création de table suivante", () => {
    const espace = creerSuivie();
    espace.doc.getArray("versions").push([2]);

    espace.creerTable("Répare meta.version");

    expect(espace.doc.getMap("meta").get("version")).toBe(2);
    expect(versionsInscrites(espace.doc)).toEqual([2]);

    const autre = creerSuivie();
    autre.doc.getMap("meta").set("version", 2);
    autre.creerTable("Répare versions");
    expect(versionsInscrites(autre.doc)).toEqual([2]);
  });
});

// ── F-018-AC4 : versions 1 et 2 lues et modifiées, au-delà refusées ──────────────────────────────

/** La règle de la version 1 (ADR-0002, « Lecture », étape 1) : clé présente et différente de 1. */
function refuseeParUneApplicationDeVersion1(doc: Y.Doc): boolean {
  const meta = doc.getMap("meta");
  return meta.has("version") && meta.get("version") !== 1;
}

function jouerToutesLesOperations(espace: DocumentEspace): void {
  const racine = espace.creerPage("Racine");
  const table = espace.creerTable("Table", { parent: racine });
  const fille = espace.creerPage("Fille", { parent: table });
  espace.renommerPage(table, "Table renommée");
  espace.deplacerPage(fille, { parent: null, position: 0 });
  espace.mettreALaCorbeille(racine);
  espace.restaurerPage(racine);
  espace.mettreALaCorbeille(fille);
  espace.supprimerDefinitivement(fille);
  expect(espace.lire().racines.at(-1)).toEqual(
    pageLue(racine, "Racine", [tableLue(table, "Table renommée")]),
  );
}

// Chaque forge reçoit le document et l'état à y appliquer (une page, une table jetée) : elle l'applique
// avant d'écrire, sauf quand elle doit définir `versions` sous un autre type partagé d'abord.
type Forge = (doc: Y.Doc, recevoirLEtat: () => void) => void;

const VERSIONS_REFUSEES: [string, Forge][] = [
  ["meta.version à 3", (doc, recevoir) => (recevoir(), doc.getMap("meta").set("version", 3))],
  ["versions contenant 3", (doc, recevoir) => (recevoir(), doc.getArray("versions").push([3]))],
  ["versions contenant 99", (doc, recevoir) => (recevoir(), doc.getArray("versions").push([99]))],
  [
    "meta.version à 2 et versions contenant 2 puis 3",
    (doc, recevoir) => {
      recevoir();
      doc.getMap("meta").set("version", 2);
      doc.getArray("versions").push([3]);
    },
  ],
  ["versions contenant 2,5", (doc, recevoir) => (recevoir(), doc.getArray("versions").push([2.5]))],
  ["versions contenant 0", (doc, recevoir) => (recevoir(), doc.getArray("versions").push([0]))],
  [
    'versions contenant la chaîne "2"',
    (doc, recevoir) => (recevoir(), doc.getArray("versions").push(["2"])),
  ],
  [
    "versions défini sous un autre type partagé",
    (doc, recevoir) => {
      doc.getMap("versions").set("v", 2);
      recevoir();
    },
  ],
  [
    "versions portant une entrée nommée",
    (doc, recevoir) => {
      recevoir();
      const forge = new Y.Doc();
      forge.getMap("versions").set("v", 2);
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(forge));
    },
  ],
];

describe("lire et modifier les versions 1 et 2, refuser au-delà", () => {
  it("F-018-AC4 un document de version 1 (état de F-001) se lit et se modifie, table comprise ; il passe alors en version 2 et se modifie encore", () => {
    const espace = ouvrirSuivie(etatV1DeF001());

    espace.creerPage("Page en version 1");
    expect(lireLaVersion(espace.doc)).toEqual({ version: 1, admise: true });
    jouerToutesLesOperations(espace);

    expect(lireLaVersion(espace.doc)).toEqual({ version: 2, admise: true });
    jouerToutesLesOperations(espace);
    expect(repliqueDe(espace.doc).lire()).toEqual(espace.lire());
  });

  it.each(VERSIONS_REFUSEES)(
    "F-018-AC4 %s : lire() et chaque écriture refusent par version-non-prise-en-charge, sans rien modifier, ici et sur une réplique",
    (_cas, forger) => {
      const source = creerSuivie();
      const page = source.creerPage("Page");
      const jetee = source.creerTable("Jetée");
      source.mettreALaCorbeille(jetee);
      const doc = new Y.Doc();
      forger(doc, () => Y.applyUpdate(doc, Y.encodeStateAsUpdate(source.doc)));
      const espace = ouvrirSuivie(doc);

      for (const lue of [espace, repliqueDe(espace.doc)]) {
        const avant = Y.encodeStateAsUpdate(lue.doc);
        const ecritures = [
          () => lue.lire(),
          () => lue.creerPage("p"),
          () => lue.creerTable("t"),
          () => lue.renommerPage(page, "r"),
          () => lue.deplacerPage(page, { parent: null }),
          () => lue.mettreALaCorbeille(page),
          () => lue.restaurerPage(jetee),
          () => lue.supprimerDefinitivement(jetee),
        ];

        const emises = misesAJourPendant(lue.doc, () => {
          expect(ecritures.map(codeDuRefus)).toEqual(
            ecritures.map(() => "version-non-prise-en-charge"),
          );
        });

        expect(emises).toEqual([]);
        expect(Y.encodeStateAsUpdate(lue.doc)).toEqual(avant);
      }
    },
  );

  it("F-018-AC4 la règle de la version 1 accepte un document sans table : le contrôle n'est pas vide", () => {
    const espace = creerSuivie();
    espace.creerPage("Page");

    expect(refuseeParUneApplicationDeVersion1(espace.doc)).toBe(false);
    expect(refuseeParUneApplicationDeVersion1(new Y.Doc())).toBe(false);
    // Cas fautif : la seule forme `versions` (option b de l'amendement) passerait la règle.
    const versionsSeules = new Y.Doc();
    versionsSeules.getArray("versions").push([2]);
    expect(refuseeParUneApplicationDeVersion1(versionsSeules)).toBe(false);
  });

  it("F-018-AC4 une application de version 1 refuse un document qui porte une table, sur la réplique qui l'a créée et sur une réplique qui a convergé avec elle", () => {
    const creatrice = creerSuivie();
    const autre = ouvrirSuivie(new Y.Doc());
    Y.applyUpdate(autre.doc, Y.encodeStateAsUpdate(creatrice.doc));
    autre.creerPage("Écrite ailleurs");

    creatrice.creerTable("Table");
    Y.applyUpdate(autre.doc, Y.encodeStateAsUpdate(creatrice.doc));
    Y.applyUpdate(creatrice.doc, Y.encodeStateAsUpdate(autre.doc));

    for (const doc of [creatrice.doc, autre.doc, repliqueDe(creatrice.doc).doc]) {
      expect(refuseeParUneApplicationDeVersion1(doc)).toBe(true);
      expect(lireLaVersion(doc)).toEqual({ version: 2, admise: true });
    }
  });
});

// ── F-018-AC6 : une table subit toutes les opérations d'une page, sans changer de type ───────────

describe("appliquer à une table les opérations d'une page", () => {
  it("F-018-AC6 une table se renomme, se déplace, sert de parent, va à la corbeille, se restaure et se supprime définitivement", () => {
    const espace = creerSuivie();
    const page = espace.creerPage("Page");
    const table = espace.creerTable("Table");
    const sousPage = espace.creerPage("Sous-page", { parent: table });
    const sousTable = espace.creerTable("Sous-table", { parent: table });
    const deplacee = espace.creerPage("Déplacée");

    espace.renommerPage(table, "Renommée");
    espace.deplacerPage(table, { parent: page, position: 0 });
    espace.deplacerPage(deplacee, { parent: sousTable });
    expect(codeDuRefus(() => espace.deplacerPage(page, { parent: sousTable }))).toBe(
      "deplacement-cyclique",
    );

    const sousArbre = tableLue(table, "Renommée", [
      pageLue(sousPage, "Sous-page"),
      tableLue(sousTable, "Sous-table", [pageLue(deplacee, "Déplacée")]),
    ]);
    expect(espace.lire()).toEqual({ racines: [pageLue(page, "Page", [sousArbre])], corbeille: [] });

    espace.mettreALaCorbeille(table);
    expect(espace.lire()).toEqual({ racines: [pageLue(page, "Page")], corbeille: [sousArbre] });
    espace.restaurerPage(table);
    expect(espace.lire().racines).toEqual([pageLue(page, "Page", [sousArbre])]);
    espace.mettreALaCorbeille(table);

    expect(espace.supprimerDefinitivement(table)).toEqual([table, sousPage, sousTable, deplacee]);
    expect(espace.lire()).toEqual({ racines: [pageLue(page, "Page")], corbeille: [] });
    expect([...pagesStockees(espace.doc).keys()]).toEqual([page]);
  });

  it("F-018-AC6 aucune opération hors creerTable n'écrit le champ type, et le type stocké d'une table reste table", () => {
    const espace = creerSuivie();
    const table = espace.creerTable("Table");
    const page = espace.creerPage("Page", { parent: table });
    const ecrituresDuType: string[] = [];
    pagesStockees(espace.doc).observeDeep((evenements) => {
      for (const evenement of evenements) {
        if (evenement.target !== pagesStockees(espace.doc) && evenement.keys.has("type")) {
          ecrituresDuType.push(String(evenement.path));
        }
      }
    });

    espace.renommerPage(table, "Renommée");
    espace.renommerPage(page, "Renommée aussi");
    espace.deplacerPage(page, { parent: null, position: 0 });
    espace.deplacerPage(table, { parent: page });
    espace.mettreALaCorbeille(table);
    espace.restaurerPage(table);
    espace.mettreALaCorbeille(page);
    espace.restaurerPage(page);

    expect(ecrituresDuType).toEqual([]);
    expect(typeStocke(espace.doc, table)).toBe("table");
    expect(pagesStockees(espace.doc).get(page)?.has("type")).toBe(false);
    expect([...(pagesStockees(espace.doc).get(page)?.keys() ?? [])].sort()).toEqual([
      "corbeille",
      "place",
      "titre",
    ]);
  });
});

// ── F-018-AC7 : type inconnu ignoré, table lue même en version 1 ─────────────────────────────────

describe("lire un type d'entrée inattendu", () => {
  it.each<[string, unknown]>([
    ["une autre chaîne", "base"],
    ["Table, avec une majuscule", "Table"],
    ["la chaîne vide", ""],
    ["un nombre", 1],
    ["null", null],
    ["un booléen", true],
    ["un objet", { type: "table" }],
    ["un type partagé", new Y.Map()],
  ])(
    "F-018-AC7 type %s : l'entrée est ignorée comme une entrée mal formée, sans exception, et sa fille rejoint la racine",
    (_cas, type) => {
      const doc = new Y.Doc();
      ecrireEntree(doc, "bonne", champsValides("Bonne", "F"));
      ecrireEntree(doc, "mauvaise", { ...champsValides("Mauvaise", "N"), type });
      ecrireEntree(doc, "fille", {
        titre: "Fille",
        place: { parent: "mauvaise", rang: "V" },
        corbeille: false,
      });

      for (const lue of [ouvrirSuivie(doc), repliqueDe(doc)]) {
        expect(lue.lire()).toEqual({
          racines: [pageLue("bonne", "Bonne"), pageLue("fille", "Fille")],
          corbeille: [],
        });
      }
    },
  );

  it("F-018-AC7 une entrée de type table dans un document de version 1 se lit comme une table, de même sur toutes les répliques, sans exception", () => {
    const espace = creerSuivie();
    const page = espace.creerPage("Page");
    ecrireEntree(espace.doc, "forgee", { ...champsValides("Forgée", "k"), type: "table" });

    const surUnEtatDeF001 = ouvrirSuivie(etatV1DeF001());
    Y.applyUpdate(surUnEtatDeF001.doc, Y.encodeStateAsUpdate(espace.doc));
    const repliques = [espace, repliqueDe(espace.doc), surUnEtatDeF001];

    expect(espace.doc.getMap("meta").get("version")).toBe(1);
    for (const lue of repliques) {
      expect(lireLaVersion(lue.doc)).toEqual({ version: 1, admise: true });
      const pages = toutesLesPages(lue.lire());
      expect(pages.find((trouvee) => trouvee.id === "forgee")).toEqual(
        tableLue("forgee", "Forgée"),
      );
      expect(pages.find((trouvee) => trouvee.id === page)).toEqual(pageLue(page, "Page"));
    }
  });
});

// ── F-018-AC8 : couture de l'interface ───────────────────────────────────────────────────────────

describe("couture de l'interface du paquet", () => {
  it("F-018-AC8 creerDocumentEspace fournit toujours un document de version 1 : meta.version à 1, aucun type racine versions", () => {
    const espace = creerSuivie();

    expect(espace.doc.getMap("meta").toJSON()).toEqual({ version: 1 });
    expect(espace.doc.share.has("versions")).toBe(false);
    expect(lireLaVersion(espace.doc)).toEqual({ version: 1, admise: true });
    expect(refuseeParUneApplicationDeVersion1(espace.doc)).toBe(false);
  });

  it("F-018-AC8 la façade a ses neuf opérations d'avant, de même arité, plus creerTable", () => {
    const espace = creerSuivie();
    const arites = Object.fromEntries(
      Object.entries(espace)
        .filter(([, valeur]) => typeof valeur === "function")
        .map(([nom, valeur]) => [nom, (valeur as (...arguments_: unknown[]) => unknown).length]),
    );

    expect(arites).toEqual({
      abonner: 1,
      creerPage: 1,
      creerTable: 1,
      deplacerPage: 2,
      fermer: 0,
      lire: 0,
      mettreALaCorbeille: 1,
      renommerPage: 2,
      restaurerPage: 1,
      supprimerDefinitivement: 1,
    });
  });
});
