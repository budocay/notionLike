// F-034-AC11, troisième cas : `lire()` après `fermer()` rend la table lue à l'instant de la fermeture,
// sans relire le document, que l'appel ait lieu hors transaction ou dans une transaction.
import { describe, expect, it, vi } from "vitest";

import { creerDocumentTable, ouvrirDocumentTable } from "../src/document-table.ts";

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

describe("F-034-AC11 lire() après fermer()", () => {
  it("F-034-AC11 fermer() hors transaction, puis lire() dans une transaction qui écrit : la table d'avant l'écriture", () => {
    const table = creerDocumentTable();
    table.creerColonne("Nom", "texte");
    table.creerLigne();
    const autre = ouvrirDocumentTable(table.doc);
    table.fermer();
    const fermee = table.lire();
    table.doc.transact(() => {
      autre.creerLigne();
      compte.appels = 0;
      expect(table.lire()).toBe(fermee);
      expect(table.lire().lignes).toHaveLength(1);
      expect(compte.appels).toBe(0);
    });
    autre.fermer();
  });

  it("F-034-AC11 fermer() dans une transaction, écriture directe, puis lire() hors transaction : la table d'avant, sans relecture", () => {
    const table = creerDocumentTable();
    table.creerColonne("Nom", "texte");
    table.creerLigne();
    const autre = ouvrirDocumentTable(table.doc);
    table.doc.transact(() => table.fermer());
    autre.creerLigne();
    compte.appels = 0;
    expect(table.lire().lignes).toHaveLength(1);
    expect(compte.appels).toBe(0);
    expect(autre.lire().lignes).toHaveLength(2);
    autre.fermer();
  });

  it("F-034-AC11 abonner() après fermer() : désabonnement inerte, aucune notification", () => {
    const table = creerDocumentTable();
    table.creerColonne("Nom", "texte");
    table.fermer();
    let notifications = 0;
    const retirer = table.abonner(() => {
      notifications += 1;
    });
    const autre = ouvrirDocumentTable(table.doc);
    table.doc.transact(() => autre.creerLigne());
    expect(notifications).toBe(0);
    expect(retirer()).toBeUndefined();
    autre.fermer();
  });
});
