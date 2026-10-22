// Réglages de vue hors des documents (F-018-AC42), joués dans l'application rendue par le point
// d'entrée de l'interface sur fake-indexeddb : changer une largeur ou la vue active n'écrit ni dans
// le document d'espace ni dans le document de table.
import { ouvrirDocumentTable } from "@notionlike/document";
import { act, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { type CoquilleRendue, docDe, ouvrirCoquille, recevoir } from "../aides-coquille.tsx";
import { enregistrements, laisserIndexedDbTravailler } from "../aides-persistance.ts";
import {
  cleDesReglages,
  type DesignationDeTableDEssai,
  enregistrerDansLaBaseDeTable,
  nomDeLaBaseDeTable,
} from "../aides-table.ts";

// La liste des vues est remplacée par deux vues, pour que le sélecteur paraisse et que le choix de
// la vue active soit joué dans l'application ; chaque document de table dont une façade reste
// ouverte est retenu, pour constater son état encodé (le témoin de la relecture, lu par une façade
// aussitôt fermée, ne l'est pas).
vi.mock("../../src/vues-de-table/vues.ts", async (originales) => {
  const module = await originales<typeof import("../../src/vues-de-table/vues.ts")>();
  const vues = [...module.VUES, { id: "seconde", libelle: "Seconde" }];
  return {
    ...module,
    VUES: vues,
    IDS_DES_VUES: vues.map(({ id }) => id),
    avecSelecteur: () => module.avecSelecteur(vues),
  };
});
const documentsDeTableOuverts = vi.hoisted(() => new Set<unknown>());
vi.mock("@notionlike/document", async (originales) => {
  // Typé par la seule fonction doublée : le paquet n'entre pas en entier (énumération de F-002-AC31).
  const module = await originales<{ readonly ouvrirDocumentTable: typeof ouvrirDocumentTable }>();
  return {
    ...module,
    ouvrirDocumentTable: (doc: Y.Doc) => {
      const facade = module.ouvrirDocumentTable(doc);
      documentsDeTableOuverts.add(doc);
      return {
        ...facade,
        fermer: () => {
          documentsDeTableOuverts.delete(doc);
          facade.fermer();
        },
      };
    },
  };
});

// Typée par l'aide de la coquille : ce fichier n'importe pas la session (lecteurs de F-030-AC29).
function designation(
  session: CoquilleRendue["session"],
  idTable: string,
): DesignationDeTableDEssai {
  const etat = session.lireEtat();
  if (etat.phase !== "pret" || etat.idEspace === undefined) {
    throw new Error("L'espace n'est pas ouvert.");
  }
  return { idEspace: etat.idEspace, idTable };
}

/**
 * Retient l'état encodé de chaque document et les mises à jour qu'il émet à partir de maintenant ;
 * `constater` vérifie qu'aucun n'a changé, octet pour octet, et qu'aucune mise à jour n'est émise.
 */
function observerLesDocuments(docs: readonly Y.Doc[]): { constater: () => void } {
  const avant = docs.map((doc) => Y.encodeStateAsUpdate(doc));
  const emises: Uint8Array[] = [];
  const noter = (miseAJour: Uint8Array): void => void emises.push(miseAJour);
  docs.forEach((doc) => doc.on("update", noter));
  return {
    constater: () => {
      docs.forEach((doc) => doc.off("update", noter));
      expect(emises).toEqual([]);
      expect(docs.map((doc) => Y.encodeStateAsUpdate(doc))).toEqual(avant);
    },
  };
}

/** La table « Budget », reçue d'une autre réplique, une colonne « Nom », affichée ; et son document. */
async function afficherLaTableBudget() {
  const { session, utilisateur } = await ouvrirCoquille();
  let id = "";
  recevoir(session, (espace) => {
    id = espace.creerTable("Budget");
  });
  const table = designation(session, id);
  await enregistrerDansLaBaseDeTable(table, (doc) => {
    const facade = ouvrirDocumentTable(doc);
    facade.creerColonne("Nom", "texte");
    facade.fermer();
  });
  documentsDeTableOuverts.clear();
  await utilisateur.click(await screen.findByRole("link", { name: "Table Budget" }));
  await screen.findByRole("separator", { name: "Largeur de la colonne Nom" });
  await act(() => laisserIndexedDbTravailler());
  const ouverts = [...documentsDeTableOuverts];
  expect(ouverts).toHaveLength(1);
  return { session, utilisateur, table, docDeTable: ouverts[0] as Y.Doc };
}

describe("réglages de vue hors des documents (F-018-AC42)", () => {
  it("F-018-AC42 élargir une colonne n'écrit ni dans le document d'espace ni dans le document de table : états encodés et base inchangés, aucune mise à jour Yjs", async () => {
    const { session, utilisateur, table, docDeTable } = await afficherLaTableBudget();
    const separateur = screen.getByRole("separator", { name: "Largeur de la colonne Nom" });
    const documents = observerLesDocuments([docDe(session), docDeTable]);
    const baseAvant = await enregistrements(nomDeLaBaseDeTable(table));

    act(() => separateur.focus());
    await utilisateur.keyboard("{ArrowRight}{ArrowRight}");
    await act(() => laisserIndexedDbTravailler());

    expect(separateur.getAttribute("aria-valuenow")).toBe("212");
    expect(localStorage.getItem(cleDesReglages(table))).not.toBeNull();
    documents.constater();
    expect(await enregistrements(nomDeLaBaseDeTable(table))).toEqual(baseAvant);
    localStorage.clear();
  });

  it("F-018-AC42 F-018-AC44 changer la vue active n'écrit ni dans le document d'espace ni dans le document de table : états encodés et base inchangés, aucune mise à jour Yjs", async () => {
    const { session, utilisateur, table, docDeTable } = await afficherLaTableBudget();
    const selecteur = screen.getByRole("group", { name: "Vue de la table" });
    const documents = observerLesDocuments([docDe(session), docDeTable]);
    const baseAvant = await enregistrements(nomDeLaBaseDeTable(table));

    await utilisateur.click(within(selecteur).getByRole("button", { name: "Seconde" }));
    await act(() => laisserIndexedDbTravailler());

    expect(
      within(selecteur).getByRole("button", { name: "Seconde" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(JSON.parse(localStorage.getItem(cleDesReglages(table)) ?? "null")).toEqual({
      version: 1,
      sections: { vue: { active: "seconde" } },
    });
    await utilisateur.click(within(selecteur).getByRole("button", { name: "Tableau" }));
    await act(() => laisserIndexedDbTravailler());
    expect(localStorage.getItem(cleDesReglages(table))).toBeNull();
    documents.constater();
    expect(await enregistrements(nomDeLaBaseDeTable(table))).toEqual(baseAvant);
    localStorage.clear();
  });
});
