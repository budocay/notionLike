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
  // complète, que la lecture gardée soit à jour (lire() juste avant) ou déjà périmée. Le nombre de
  // lignes de départ est connu (pas de lire() qui rafraîchirait la lecture), et l'état périmé est
  // vérifié : les créations n'ont déclenché aucune relecture complète.
  it.each([
    ["lecture à jour avant la transaction", true],
    ["lecture déjà périmée avant la transaction", false],
  ])(
    "F-034-AC11 transaction englobante, sans abonné, %s : lire() rend N+1 lignes",
    (_nom, aJour) => {
      const table = creerDocumentTable();
      table.creerColonne("Nom", "texte");
      table.creerLigne();
      let avant = 1;
      if (aJour) {
        expect(table.lire().lignes).toHaveLength(1);
      } else {
        table.creerLigne();
        table.creerLigne();
        avant = 3;
      }
      compte.appels = 0;
      table.doc.transact(() => undefined);
      expect(compte.appels).toBe(0);
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

  // Revue du tour 5 : aucun abonné, N créations (lecture gardée périmée), puis abonner() et lire() dans
  // la même transaction : lire() ne rend jamais la lecture périmée.
  it("F-034-AC11 lecture gardée périmée, abonner() puis lire() dans la même transaction : N lignes, jamais la lecture périmée", () => {
    const table = creerDocumentTable();
    table.creerColonne("Nom", "texte");
    for (let i = 0; i < 4; i += 1) {
      table.creerLigne();
    }
    compte.appels = 0;
    let notifications = 0;
    let vue = -1;
    table.doc.transact(() => {
      table.abonner(() => {
        notifications += 1;
      });
      vue = table.lire().lignes.length;
    });
    expect(compte.appels).toBeGreaterThan(0);
    expect(vue).toBe(4);
    expect(notifications).toBe(0);
    expect(table.lire().lignes).toHaveLength(4);
  });

  it("F-034-AC11 lecture gardée à jour, abonné inscrit : lire() en transaction rend la lecture gardée, sans relecture", () => {
    const table = creerDocumentTable();
    table.creerColonne("Nom", "texte");
    table.creerLigne();
    const gardee = table.lire();
    table.abonner(() => undefined);
    table.doc.transact(() => {
      compte.appels = 0;
      expect(table.lire()).toBe(gardee);
      expect(compte.appels).toBe(0);
    });
  });

  // Règle : la base de comparaison d'un abonné est la table lue à son inscription ; en transaction,
  // une relecture fraîche. Les écritures d'avant l'inscription ne le notifient pas, celles d'après si.
  // (La lecture en cours de `lire()` ne peut donc plus changer une notification : propriété inobservable.)
  function tableDUneLigne() {
    const table = creerDocumentTable();
    table.creerColonne("Nom", "texte");
    table.creerLigne();
    return table;
  }

  it("F-034-AC11 lecture gardée périmée, abonner() en transaction sans écriture : 0 notification", () => {
    const table = creerDocumentTable();
    table.creerColonne("Nom", "texte");
    for (let i = 0; i < 5; i += 1) {
      table.creerLigne();
    }
    let notifications = 0;
    table.doc.transact(() => {
      table.abonner(() => {
        notifications += 1;
      });
    });
    expect(notifications).toBe(0);
    expect(table.lire().lignes).toHaveLength(5);
  });

  it.each([true, false])(
    "F-034-AC11 abonner() puis écriture dans la même transaction : 1 notification à la fin (lecture à jour : %s)",
    (aJour) => {
      const table = tableDUneLigne();
      if (aJour) {
        table.lire();
      }
      let notifications = 0;
      table.doc.transact(() => {
        table.abonner(() => {
          notifications += 1;
        });
        table.creerLigne();
        expect(notifications).toBe(0);
      });
      expect(notifications).toBe(1);
      table.creerLigne();
      expect(notifications).toBe(2);
    },
  );

  it.each([true, false])(
    "F-034-AC11 écriture puis abonner() dans la même transaction : 0 notification (lecture à jour : %s)",
    (aJour) => {
      const table = tableDUneLigne();
      if (aJour) {
        table.lire();
      }
      let notifications = 0;
      table.doc.transact(() => {
        table.creerLigne();
        table.abonner(() => {
          notifications += 1;
        });
      });
      expect(notifications).toBe(0);
      expect(table.lire().lignes).toHaveLength(2);
      table.creerLigne();
      expect(notifications).toBe(1);
    },
  );

  it("F-034-AC11 deuxième abonné inscrit en transaction après une écriture : seul le premier est notifié", () => {
    const table = tableDUneLigne();
    const notifies: string[] = [];
    table.abonner(() => notifies.push("premier"));
    table.doc.transact(() => {
      table.creerLigne();
      table.abonner(() => notifies.push("second"));
    });
    expect(notifies).toEqual(["premier"]);
    table.creerLigne();
    expect(notifies).toEqual(["premier", "premier", "second"]);
  });

  it("F-034-AC11 hors transaction, lecture périmée : 0 notification à l'inscription, 1 à la création", () => {
    const table = tableDUneLigne();
    table.creerLigne();
    table.doc.transact(() => undefined);
    let notifications = 0;
    table.abonner(() => {
      notifications += 1;
    });
    expect(notifications).toBe(0);
    table.creerLigne();
    expect(notifications).toBe(1);
  });

  it("F-034-AC11 façade ouverte dans une transaction : le compteur de transactions ne descend pas sous 0", () => {
    const doc = new Y.Doc();
    const creatrice = ouvrirDocumentTable(doc);
    creatrice.creerColonne("Nom", "texte");
    creatrice.fermer();
    let table: ReturnType<typeof ouvrirDocumentTable> | undefined;
    doc.transact(() => {
      table = ouvrirDocumentTable(doc);
    });
    let notifications = 0;
    table?.abonner(() => {
      notifications += 1;
    });
    table?.creerLigne();
    expect(notifications).toBe(1);
    expect(table?.lire().lignes).toHaveLength(1);
    table?.fermer();
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
