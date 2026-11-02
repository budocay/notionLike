// F-034-AC11 : sans abonné, aucune relecture de la table à chaque transaction ; la lecture se fait au
// `lire()` suivant, une seule fois. Les appels à `lireEntrees` (la relecture complète) sont comptés.
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  creerDocumentTable,
  ouvrirDocumentTable,
  transactionOuverte,
} from "../src/document-table.ts";

const compte = vi.hoisted(() => ({ appels: 0 }));

vi.mock("../src/format-table.ts", async (importer) => {
  const reel = await importer<typeof import("../src/format-table.ts")>();
  return {
    ...reel,
    lireEntrees: (...arguments_: Parameters<typeof reel.lireEntrees>) => {
      compte.appels += 1;
      return reel.lireEntrees(...arguments_);
    },
  };
});

describe("F-034-AC11 lecture paresseuse sans abonné", () => {
  it("F-034-AC11 aucune relecture pendant N créations et N transactions, une seule au lire() suivant", () => {
    const table = creerDocumentTable();
    const colonne = table.creerColonne("Nom", "texte");
    // Première création : elle lit l'ordre des lignes une fois (cache d'ordre, hors de AC11).
    table.creerLigne();
    const N = 40;
    compte.appels = 0;
    for (let i = 0; i < N; i += 1) {
      table.creerLigne(new Map([[colonne, String(i)]]), i % 2 === 0 ? 0 : undefined);
    }
    for (let i = 0; i < N; i += 1) {
      table.doc.transact(() => undefined);
    }
    expect(compte.appels).toBe(0);

    const lue = table.lire();
    expect(compte.appels).toBe(1);
    expect(table.lire()).toBe(lue);
    expect(compte.appels).toBe(1);
    expect(lue.lignes).toHaveLength(N + 1);

    const neuve = ouvrirDocumentTable(table.doc);
    expect(lue).toEqual(neuve.lire());
    neuve.fermer();
  });

  it("F-034-AC11 avec un abonné, la table est relue à chaque transaction (témoin du compteur)", () => {
    const table = creerDocumentTable();
    table.creerColonne("Nom", "texte");
    table.creerLigne();
    table.abonner(() => undefined);
    compte.appels = 0;
    table.creerLigne();
    table.creerLigne();
    expect(compte.appels).toBe(2);
  });

  it("F-034-AC11 transaction englobante, sans abonné : lire() reflète la transaction en cours", () => {
    const table = creerDocumentTable();
    table.creerColonne("Nom", "texte");
    table.creerLigne();
    table.doc.transact(() => {
      table.creerLigne();
      expect(table.lire().lignes).toHaveLength(2);
    });
  });

  it("F-034-AC11 transaction englobante, avec abonné : lire() garde la dernière table de fin de transaction", () => {
    const table = creerDocumentTable();
    table.creerColonne("Nom", "texte");
    table.creerLigne();
    table.abonner(() => undefined);
    table.doc.transact(() => {
      table.creerLigne();
      expect(table.lire().lignes).toHaveLength(1);
    });
    expect(table.lire().lignes).toHaveLength(2);
  });

  it("F-034-AC11 transactionOuverte suit le champ interne _transaction de Yjs (yjs 13.6.33)", () => {
    const doc = new Y.Doc();
    expect(transactionOuverte(doc)).toBe(false);
    doc.transact(() => {
      expect(transactionOuverte(doc)).toBe(true);
      expect((doc as unknown as Record<string, unknown>)["_transaction"]).not.toBeNull();
    });
    expect(transactionOuverte(doc)).toBe(false);
  });
});
