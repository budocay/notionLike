// F-034-AC11 (preuve d'intégration de la couture, `coutures-table.test.ts`) : la session de table, avec
// la vraie persistance IndexedDB (fake-indexeddb), n'appelle jamais `lire()`, `abonner()` ni `fermer()`
// de la façade pendant une transaction du document après son ouverture. Aucun mock de module : un
// espion est posé sur l'instance de façade que rend la session (son comportement reste réel).
import { describe, expect, it } from "vitest";

import { creerTablesOuvertes } from "../src/table/tables-ouvertes.ts";
import { laisserIndexedDbTravailler } from "./aides-persistance.ts";
import { attendrePhaseDeTable, TABLE_A_DE_L_ESPACE_A, tableDeLaSession } from "./aides-table.ts";

describe("F-034-AC11 la session de table n'appelle la façade hors transaction que", () => {
  it("F-034-AC11 écriture locale puis fermeture : aucun lire(), abonner() ni fermer() en transaction", async () => {
    const tables = creerTablesOuvertes();
    const session = tables.ouvrir(TABLE_A_DE_L_ESPACE_A);
    await attendrePhaseDeTable(session, "pret");
    const facade = tableDeLaSession(session);
    const appels: string[] = [];
    const enTransaction: string[] = [];
    for (const nom of ["lire", "abonner", "fermer"] as const) {
      const reelle = facade[nom].bind(facade) as (...arguments_: unknown[]) => unknown;
      (facade as unknown as Record<string, unknown>)[nom] = (...arguments_: unknown[]) => {
        appels.push(nom);
        if ((facade.doc as unknown as { _transaction: unknown })["_transaction"] !== null) {
          enTransaction.push(nom);
        }
        return reelle(...arguments_);
      };
    }

    facade.creerLigne();
    await laisserIndexedDbTravailler();
    tables.fermer();
    await laisserIndexedDbTravailler();

    expect(appels).toEqual(expect.arrayContaining(["lire", "fermer"]));
    expect(enTransaction).toEqual([]);
  });
});
