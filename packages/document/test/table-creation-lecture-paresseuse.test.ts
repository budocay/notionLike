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

  // Sans abonné, lire() dans une transaction englobante rend la table que rendrait une relecture
  // complète, que la lecture gardée soit à jour (lire() juste avant) ou déjà périmée.
  it.each([
    ["lecture à jour avant la transaction", true],
    ["lecture déjà périmée avant la transaction", false],
  ])(
    "F-034-AC11 transaction englobante, sans abonné, %s : lire() rend N+1 lignes",
    (_nom, aJour) => {
      const table = creerDocumentTable();
      table.creerColonne("Nom", "texte");
      table.creerLigne();
      if (aJour) {
        expect(table.lire().lignes).toHaveLength(1);
      } else {
        table.creerLigne();
        table.doc.transact(() => undefined);
      }
      const avant = table.lire().lignes.length;
      table.doc.transact(() => {
        table.creerLigne();
        expect(table.lire().lignes).toHaveLength(avant + 1);
        table.creerLigne();
        expect(table.lire().lignes).toHaveLength(avant + 2);
      });
      const neuve = ouvrirDocumentTable(table.doc);
      expect(table.lire()).toEqual(neuve.lire());
      expect(table.lire().lignes).toHaveLength(avant + 2);
      neuve.fermer();
    },
  );

  it("F-034-AC11 transaction englobante, sans abonné : la lecture en cours ne remplace pas la lecture gardée", () => {
    const table = creerDocumentTable();
    table.creerColonne("Nom", "texte");
    table.creerLigne();
    const gardee = table.lire();
    table.doc.transact(() => {
      table.creerLigne();
      expect(table.lire()).not.toBe(gardee);
    });
    // La transaction terminée rend la lecture périmée : la lecture suivante est une relecture.
    expect(table.lire().lignes).toHaveLength(2);
  });

  it("F-034-AC11 abonner() dans une transaction : l'abonné est notifié à la fin des écritures déjà faites", () => {
    for (const aJour of [true, false]) {
      const table = creerDocumentTable();
      table.creerColonne("Nom", "texte");
      table.creerLigne();
      if (aJour) {
        table.lire();
      }
      let notifications = 0;
      table.doc.transact(() => {
        table.creerLigne();
        table.abonner(() => {
          notifications += 1;
        });
        expect(notifications).toBe(0);
        // Avec abonné, pas de relecture en cours de transaction : la lecture gardée est rendue, celle
        // d'avant la transaction (ou plus ancienne si elle était déjà périmée).
        expect(table.lire().lignes).toHaveLength(aJour ? 1 : 0);
      });
      expect(notifications).toBe(1);
      expect(table.lire().lignes).toHaveLength(2);
      table.creerLigne();
      expect(notifications).toBe(2);
    }
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
