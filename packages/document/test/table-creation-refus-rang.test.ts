// F-034-AC5 : sans rang admis, `creerLigne` lève `rang-indisponible` en dernier contrôle et n'écrit
// rien, sur une table de 5 000 lignes. La borne des rangs d'une table n'est pas réglable : le calcul
// d'insertion est donc remplacé, ailleurs inchangé, pour ne rien admettre.
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { AUCUN_RANG_ADMIS } from "../src/rang.ts";

const etat = vi.hoisted(() => ({ refuser: false }));

vi.mock("../src/rang.ts", async (importer) => {
  const reel = await importer<typeof import("../src/rang.ts")>();
  return {
    ...reel,
    insertionParmi: (...arguments_: Parameters<typeof reel.insertionParmi>) =>
      etat.refuser ? reel.AUCUN_RANG_ADMIS : reel.insertionParmi(...arguments_),
  };
});

const { creerDocumentTable } = await import("../src/index.ts");
const { refusDe } = await import("./aides-table.ts");

describe("F-034 rang-indisponible", () => {
  it("F-034-AC5 le refus vient après tous les autres et rien n'est écrit sur 5 000 lignes", () => {
    expect(AUCUN_RANG_ADMIS).toBeDefined();
    const table = creerDocumentTable();
    const colonne = table.creerColonne("Nom", "texte");
    for (let i = 0; i < 5000; i += 1) {
      table.creerLigne();
    }
    const avant = Y.encodeStateAsUpdate(table.doc);
    const inconnue = "00000000-0000-4000-8000-0000000003e7";
    etat.refuser = true;

    expect(refusDe(table.doc, () => table.creerLigne())).toEqual({
      code: "rang-indisponible",
      misesAJour: 0,
    });
    expect(refusDe(table.doc, () => table.creerLigne(undefined, 0))).toEqual({
      code: "rang-indisponible",
      misesAJour: 0,
    });
    // Les autres refus passent avant lui, dans l'ordre : colonnes, valeurs, position.
    expect(refusDe(table.doc, () => table.creerLigne(new Map([[inconnue, "x"]])))).toEqual({
      code: "colonne-introuvable",
      misesAJour: 0,
    });
    expect(refusDe(table.doc, () => table.creerLigne(new Map([[colonne, 3]])))).toEqual({
      code: "valeur-non-conforme",
      misesAJour: 0,
    });
    expect(refusDe(table.doc, () => table.creerLigne(undefined, 5001))).toEqual({
      code: "position-invalide",
      misesAJour: 0,
    });

    etat.refuser = false;
    expect(Y.encodeStateAsUpdate(table.doc)).toEqual(avant);
    expect(table.lire().lignes).toHaveLength(5000);
  }, 60_000);
});
