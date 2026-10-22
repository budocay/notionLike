// Aides des tests de la table (F-018) : identifiants, session de table démarrée par les tables
// ouvertes de l'onglet, et lecture de ce qu'une base de table porte, relue dans un document vierge.
import { type DocumentTable, ouvrirDocumentTable, type TableLue } from "@notionlike/document";
import * as Y from "yjs";

import { ouvrirPersistance } from "../src/persistance/index.ts";
import type { EtatSessionTable, SessionTable } from "../src/table/session-table.ts";
import { attendreEtat, ESPACE_A, laisserIndexedDbTravailler } from "./aides-persistance.ts";

export const TABLE_A = "aaaaaaaa-1111-4222-8333-444444444444";
export const TABLE_B = "bbbbbbbb-5555-4666-9777-888888888888";

export interface DesignationDeTableDEssai {
  readonly idEspace: string;
  readonly idTable: string;
}

export const TABLE_A_DE_L_ESPACE_A: DesignationDeTableDEssai = {
  idEspace: ESPACE_A,
  idTable: TABLE_A,
};

/** Nom de la base d'une table, tel que F-002-AC25 l'écrit : seul le module de persistance l'assemble. */
export function nomDeLaBaseDeTable({ idEspace, idTable }: DesignationDeTableDEssai): string {
  return ["notionlike", "table", idEspace, idTable].join(":");
}

/** Clé des réglages de vue, telle que F-018-AC40 l'écrit. */
export function cleDesReglages({ idEspace, idTable }: DesignationDeTableDEssai): string {
  return ["notionlike", "vue", idEspace, idTable].join(":");
}

export function attendrePhaseDeTable(
  session: SessionTable,
  phase: EtatSessionTable["phase"],
): Promise<void> {
  return new Promise((resoudre) => {
    if (session.lireEtat().phase === phase) {
      resoudre();
      return;
    }
    const desabonner = session.abonner(() => {
      if (session.lireEtat().phase === phase) {
        desabonner();
        resoudre();
      }
    });
  });
}

/** La façade de la table que la session tient ; lève si la session n'est pas prête. */
export function tableDeLaSession(session: SessionTable): DocumentTable {
  const etat = session.lireEtat();
  if (etat.phase !== "pret") {
    throw new Error(`La session de table n'est pas prête : ${etat.phase}.`);
  }
  return etat.table;
}

export function estEnregistree(session: SessionTable): boolean {
  const etat = session.lireEtat();
  return etat.phase === "pret" && etat.enregistre;
}

/** Ce que la base de cette table porte, relu dans un document vierge par le module de persistance. */
export async function etatEnregistre(designation: DesignationDeTableDEssai): Promise<Uint8Array> {
  const doc = new Y.Doc();
  const persistance = ouvrirPersistance(doc, { type: "table", ...designation });
  await attendreEtat(persistance, "active");
  const etat = Y.encodeStateAsUpdate(doc);
  persistance.fermer();
  await laisserIndexedDbTravailler();
  doc.destroy();
  return etat;
}

/** La table que la base porte, relue dans un document vierge. */
export async function tableEnregistree(designation: DesignationDeTableDEssai): Promise<TableLue> {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, await etatEnregistre(designation));
  const facade = ouvrirDocumentTable(doc);
  try {
    return facade.lire();
  } finally {
    facade.fermer();
    doc.destroy();
  }
}

/** Écrit dans la base d'une table ce qu'une autre application y aurait enregistré. */
export async function enregistrerDansLaBaseDeTable(
  designation: DesignationDeTableDEssai,
  ecrire: (doc: Y.Doc) => void,
): Promise<void> {
  const doc = new Y.Doc();
  const persistance = ouvrirPersistance(doc, { type: "table", ...designation });
  await attendreEtat(persistance, "active");
  ecrire(doc);
  await laisserIndexedDbTravailler();
  persistance.fermer();
  await laisserIndexedDbTravailler();
  doc.destroy();
}

/** Une table d'une colonne de chaque type, deux options et deux lignes remplies. */
export function remplirUneTable(table: DocumentTable): void {
  const texte = table.creerColonne("Nom", "texte");
  const nombre = table.creerColonne("Prix", "nombre");
  const caseACocher = table.creerColonne("Fait", "case");
  const date = table.creerColonne("Échéance", "date");
  const selection = table.creerColonne("État", "selection");
  const enCours = table.ajouterOption(selection, "En cours");
  table.ajouterOption(selection, "Terminé");
  table.creerLigne(
    new Map<string, string | number | boolean>([
      [texte, "Première"],
      [nombre, 3.5],
      [caseACocher, true],
      [date, "2026-10-21"],
      [selection, enCours],
    ]),
  );
  table.creerLigne(new Map([[texte, "Seconde"]]));
}
