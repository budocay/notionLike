// F-034-AC11 (preuve d'intégration de la couture, `coutures-table.test.ts`) : la session de table, avec
// la vraie persistance IndexedDB (fake-indexeddb) qui applique la base relue dans ses propres
// transactions, n'atteint jamais `lire()`, `abonner()` ni `fermer()` de la façade pendant une
// transaction du document. La façade est enveloppée, pas remplacée : son comportement reste réel.
import * as Y from "yjs";
import { describe, expect, it, vi } from "vitest";

import { creerTablesOuvertes } from "../src/table/tables-ouvertes.ts";
import { laisserIndexedDbTravailler } from "./aides-persistance.ts";
import {
  attendrePhaseDeTable,
  enregistrerDansLaBaseDeTable,
  remplirUneTable,
  TABLE_A_DE_L_ESPACE_A,
  tableDeLaSession,
} from "./aides-table.ts";

const releve = vi.hoisted(() => ({
  appels: [] as string[],
  enTransaction: [] as string[],
}));

vi.mock("@notionlike/document", async (importer) => {
  const reel = await importer<typeof import("@notionlike/document")>();
  return {
    ...reel,
    ouvrirDocumentTable: (doc: Y.Doc) => {
      const facade = reel.ouvrirDocumentTable(doc);
      const noter = (nom: string): void => {
        releve.appels.push(nom);
        if ((doc as unknown as { _transaction: unknown })["_transaction"] !== null) {
          releve.enTransaction.push(nom);
        }
      };
      return {
        ...facade,
        lire: () => {
          noter("lire");
          return facade.lire();
        },
        abonner: (rappel: () => void) => {
          noter("abonner");
          return facade.abonner(rappel);
        },
        fermer: () => {
          noter("fermer");
          facade.fermer();
        },
      };
    },
  };
});

describe("F-034-AC11 la session de table n'appelle la façade hors transaction que", () => {
  it("F-034-AC11 ouverture sur une base remplie, écriture locale puis fermeture : aucun lire(), abonner() ni fermer() en transaction", async () => {
    const reel =
      await vi.importActual<typeof import("@notionlike/document")>("@notionlike/document");
    await enregistrerDansLaBaseDeTable(TABLE_A_DE_L_ESPACE_A, (doc) => {
      remplirUneTable(reel.ouvrirDocumentTable(doc));
    });
    releve.appels.length = 0;
    releve.enTransaction.length = 0;

    const tables = creerTablesOuvertes();
    const session = tables.ouvrir(TABLE_A_DE_L_ESPACE_A);
    await attendrePhaseDeTable(session, "pret");
    tableDeLaSession(session).creerLigne();
    await laisserIndexedDbTravailler();
    tables.fermer();
    await laisserIndexedDbTravailler();

    expect(releve.appels).toEqual(expect.arrayContaining(["lire", "abonner", "fermer"]));
    expect(releve.enTransaction).toEqual([]);
  });
});
