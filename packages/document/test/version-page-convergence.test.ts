import fc from "fast-check";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  eleverVersionPage,
  ErreurDocument,
  lireVersionPage,
  ouvrirDocumentPage,
} from "../src/index.ts";
import { GRAINE, NOMBRE_EXECUTIONS, ordresPossibles } from "./aides.ts";

interface Elevation {
  readonly client: number;
  readonly version: number;
}

/** Une réplique par élévation ; chacune rend son document et la mise à jour qu'elle a émise. */
function elever({ client, version }: Elevation): { doc: Y.Doc; emise: Uint8Array } {
  const doc = new Y.Doc();
  doc.clientID = client;
  eleverVersionPage(doc, version);
  return { doc, emise: Y.encodeStateAsUpdate(doc) };
}

function documentQuiRecoit(misesAJour: readonly Uint8Array[]): Y.Doc {
  const doc = new Y.Doc();
  misesAJour.forEach((miseAJour) => Y.applyUpdate(doc, miseAJour));
  return doc;
}

/**
 * Les répliques après échange dans chaque ordre possible, puis un document vierge par ordre
 * possible de réception.
 */
function documentsApresConvergence(elevations: readonly Elevation[]): Y.Doc[] {
  const documents: Y.Doc[] = [];
  for (const ordre of ordresPossibles(elevations.map((_, indice) => indice))) {
    const repliques = elevations.map(elever);
    for (const emettrice of ordre) {
      repliques.forEach((destinataire, indice) => {
        if (indice !== emettrice) {
          Y.applyUpdate(destinataire.doc, (repliques[emettrice] as { emise: Uint8Array }).emise);
        }
      });
    }
    documents.push(...repliques.map((replique) => replique.doc));
    documents.push(
      documentQuiRecoit(ordre.map((i) => (repliques[i] as { emise: Uint8Array }).emise)),
    );
  }
  return documents;
}

function ouvertureRefusee(doc: Y.Doc): boolean {
  try {
    ouvrirDocumentPage(doc);
  } catch (erreur) {
    return erreur instanceof ErreurDocument && erreur.code === "version-non-prise-en-charge";
  }
  return false;
}

function documentAuxVersions(valeurs: readonly unknown[]): Y.Doc {
  const doc = new Y.Doc();
  doc.getArray("versions").push([...valeurs]);
  return documentQuiRecoit([Y.encodeStateAsUpdate(doc)]);
}

describe("convergence de la version du document de page", () => {
  it.each([
    { repartition: "le plus grand identifiant de client élève à 3", versionDuGrand: 3 },
    { repartition: "le plus grand identifiant de client élève à 2", versionDuGrand: 2 },
  ])(
    "F-003-AC31 deux répliques élèvent à 2 et à 3, $repartition : tous lisent 3 dans tous les ordres, l'ouverture est refusée, l'état relu donne 3",
    ({ versionDuGrand }) => {
      const documents = documentsApresConvergence([
        { client: 10, version: 5 - versionDuGrand },
        { client: 20, version: versionDuGrand },
      ]);

      expect(documents).toHaveLength(6);
      for (const doc of documents) {
        expect(lireVersionPage(doc)).toBe(3);
        expect(ouvertureRefusee(doc)).toBe(true);
        expect(lireVersionPage(documentQuiRecoit([Y.encodeStateAsUpdate(doc)]))).toBe(3);
      }
    },
  );

  it("F-003-AC31 pour toutes élévations séparées à des valeurs différentes et tout ordre d'échange, chaque réplique et chaque document vierge lisent la plus haute", () => {
    const elevations = fc
      .uniqueArray(
        fc.record({
          client: fc.integer({ min: 1, max: 1000 }),
          version: fc.integer({ min: 2, max: 60 }),
        }),
        {
          minLength: 2,
          maxLength: 4,
          selector: ({ client }) => client,
        },
      )
      .filter((tirees) => new Set(tirees.map(({ version }) => version)).size === tirees.length);

    fc.assert(
      fc.property(elevations, (tirees) => {
        const plusHaute = Math.max(...tirees.map(({ version }) => version));

        for (const doc of documentsApresConvergence(tirees)) {
          expect(lireVersionPage(doc)).toBe(plusHaute);
          expect(ouvertureRefusee(doc)).toBe(true);
        }
      }),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS },
    );
  });

  it("F-003-AC31 deux élévations concurrentes à la même valeur laissent un doublon sans effet sur la lecture", () => {
    const documents = documentsApresConvergence([
      { client: 10, version: 2 },
      { client: 20, version: 2 },
    ]);

    for (const doc of documents) {
      expect(doc.getArray("versions").toArray()).toEqual([2, 2]);
      expect(lireVersionPage(doc)).toBe(2);
    }
  });

  it("F-003-AC31 après convergence, redemander une version déjà dépassée n'émet rien et ne baisse rien", () => {
    const [doc] = documentsApresConvergence([
      { client: 10, version: 2 },
      { client: 20, version: 3 },
    ]) as [Y.Doc];
    let emises = 0;
    doc.on("update", () => (emises += 1));

    eleverVersionPage(doc, 2);

    expect(emises).toBe(0);
    expect(lireVersionPage(doc)).toBe(3);
  });

  it.each([
    { nom: "zéro", valeurs: [0], lue: 1 },
    { nom: "un négatif", valeurs: [-1], lue: 1 },
    { nom: "un décimal", valeurs: [1.5], lue: 1 },
    { nom: "une chaîne", valeurs: ["2"], lue: 1 },
    { nom: "null", valeurs: [null], lue: 1 },
    { nom: "un booléen", valeurs: [true], lue: 1 },
    { nom: "un objet", valeurs: [{ version: 1 }], lue: 1 },
    { nom: "un type partagé imbriqué", valeurs: [new Y.Map()], lue: 1 },
    { nom: "un intrus à côté de la version 1", valeurs: [1, "x"], lue: 1 },
  ])(
    "F-003-AC23 une forme stockée qui porte $nom est refusée à l'ouverture, et sa version se lit sans exception",
    ({ valeurs, lue }) => {
      const doc = documentAuxVersions(valeurs);

      expect(ouvertureRefusee(doc)).toBe(true);
      expect(lireVersionPage(doc)).toBe(lue);
    },
  );

  it("F-003-AC23 une forme stockée reçue sous la forme d'une table à clés est refusée à l'ouverture", () => {
    const distant = new Y.Doc();
    distant.getMap("versions").set("version", 1);
    const doc = documentQuiRecoit([Y.encodeStateAsUpdate(distant)]);

    expect(ouvertureRefusee(doc)).toBe(true);
    expect(lireVersionPage(doc)).toBe(1);
  });

  it("F-003-AC23 la seule version 1 inscrite, forme admise, laisse le document s'ouvrir", () => {
    const doc = documentAuxVersions([1]);

    expect(ouvertureRefusee(doc)).toBe(false);
    expect(lireVersionPage(doc)).toBe(1);
  });
});
