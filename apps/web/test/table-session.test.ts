// Ouverture d'une table et persistance locale (F-018-AC13 à AC16, AC49, AC50) : la session de table
// et les tables ouvertes de l'onglet, contre le module de persistance réel sur fake-indexeddb.
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import type { EtatSessionTable } from "../src/table/session-table.ts";
import { creerTablesOuvertes } from "../src/table/tables-ouvertes.ts";
import { lire, lireDossier } from "./aides-disque.ts";
import {
  enregistrements,
  ESPACE_A,
  ESPACE_B,
  fermerDeForce,
  laisserIndexedDbTravailler,
  nomsDesBases,
  refuserLesOuverturesParUneErreur,
  retenirLesOuvertures,
  suivreLesConnexionsTenues,
} from "./aides-persistance.ts";
import {
  ecouterLesErreursNonInterceptees,
  refuserLOuvertureDe,
  simulerLHorloge,
} from "./aides-reprise.ts";
import {
  attendrePhaseDeTable,
  cleDesReglages,
  enregistrerDansLaBaseDeTable,
  estEnregistree,
  nomDeLaBaseDeTable,
  remplirUneTable,
  TABLE_A,
  TABLE_A_DE_L_ESPACE_A,
  TABLE_B,
  tableDeLaSession,
  tableEnregistree,
} from "./aides-table.ts";

const ECHEANCE_MS = 10_000;
const TABLE_VIDE = { colonnes: [], lignes: [] };
const RELEVE_DE_REGLAGES = JSON.stringify({ version: 1, sections: { x: 1 } });

function nomsDesColonnes(table: { readonly colonnes: readonly { readonly nom: string }[] }) {
  return table.colonnes.map(({ nom }) => nom);
}

describe("ouvrir une table (F-018-AC13)", () => {
  it("F-018-AC13 sur une base vide, la table se lit vide et l'ouverture n'écrit rien : le document n'a reçu aucune mise à jour", async () => {
    const tables = creerTablesOuvertes();
    const session = tables.ouvrir(TABLE_A_DE_L_ESPACE_A);
    await attendrePhaseDeTable(session, "pret");
    await laisserIndexedDbTravailler();
    const table = tableDeLaSession(session);

    expect(table.lire()).toEqual(TABLE_VIDE);
    expect(Y.decodeStateVector(Y.encodeStateVector(table.doc)).size).toBe(0);
    expect(estEnregistree(session)).toBe(true);
    tables.fermer();
  });

  it("F-018-AC13 l'état encodé du document relu est celui que la base portait, octet pour octet : l'ouverture n'ajoute ni colonne par défaut ni autre écriture", async () => {
    await enregistrerDansLaBaseDeTable(TABLE_A_DE_L_ESPACE_A, (doc) => {
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(docRempli()));
    });
    const avant = await enregistrements(nomDeLaBaseDeTable(TABLE_A_DE_L_ESPACE_A));
    const relu = new Y.Doc();
    avant.forEach((enregistrement) => Y.applyUpdate(relu, Uint8Array.from(enregistrement)));

    const tables = creerTablesOuvertes();
    const session = tables.ouvrir(TABLE_A_DE_L_ESPACE_A);
    await attendrePhaseDeTable(session, "pret");
    await laisserIndexedDbTravailler();

    expect(Y.encodeStateAsUpdate(tableDeLaSession(session).doc)).toEqual(
      Y.encodeStateAsUpdate(relu),
    );
    expect(nomsDesColonnes(tableDeLaSession(session).lire())).toEqual([
      "Nom",
      "Prix",
      "Fait",
      "Échéance",
      "État",
    ]);
    tables.fermer();
  });

  it("F-018-AC13 F-018-AC54 apps/web n'appelle jamais creerDocumentTable : le document d'une table naît vide, par ouvrirDocumentTable", () => {
    const fichiers = lireDossier("src");
    const createurs = [...fichiers.keys()].filter((chemin) =>
      /import[^;]*\bcreerDocumentTable\b|\bcreerDocumentTable\(/.test(fichiers.get(chemin) ?? ""),
    );
    expect(createurs).toEqual([]);
    expect(lire("src/table/session-table.ts")).toMatch(/\bouvrirDocumentTable\(/);
  });

  it("F-018-AC13 rechargée, l'application relit la même table : mêmes colonnes, mêmes options, mêmes lignes, même ordre, mêmes cellules", async () => {
    const premieres = creerTablesOuvertes();
    const premiere = premieres.ouvrir(TABLE_A_DE_L_ESPACE_A);
    await attendrePhaseDeTable(premiere, "pret");
    remplirUneTable(tableDeLaSession(premiere));
    const lue = tableDeLaSession(premiere).lire();
    await laisserIndexedDbTravailler();
    premieres.fermer();
    await laisserIndexedDbTravailler();

    const rechargees = creerTablesOuvertes();
    const rechargee = rechargees.ouvrir(TABLE_A_DE_L_ESPACE_A);
    await attendrePhaseDeTable(rechargee, "pret");

    expect(lue.lignes).toHaveLength(2);
    expect(tableDeLaSession(rechargee).lire()).toEqual(lue);
    rechargees.fermer();
  });

  it("F-018-AC13 F-018-AC14 tant que la relecture dure la phase est le chargement, pendant 10 secondes au plus ; à l'échéance, la table est modifiable en mémoire, et la réponse délivrée après l'échéance n'est ni appliquée ni écrite", async () => {
    await enregistrerDansLaBaseDeTable(TABLE_A_DE_L_ESPACE_A, (doc) => {
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(docRempli()));
    });
    const base = nomDeLaBaseDeTable(TABLE_A_DE_L_ESPACE_A);
    const baseAvant = await enregistrements(base);
    const relevees = ecouterLesErreursNonInterceptees();
    simulerLHorloge();
    const retenues = retenirLesOuvertures();
    const tables = creerTablesOuvertes();
    const session = tables.ouvrir(TABLE_A_DE_L_ESPACE_A);

    vi.advanceTimersByTime(ECHEANCE_MS - 1);
    const justeAvant = session.lireEtat().phase;
    vi.advanceTimersByTime(1);
    const table = tableDeLaSession(session);
    table.creerColonne("En mémoire", "texte");
    retenues.cesser();
    retenues.repondre();
    await laisserIndexedDbTravailler();
    await laisserIndexedDbTravailler();

    expect(baseAvant.length).toBeGreaterThan(0);
    expect(justeAvant).toBe("chargement");
    expect(estEnregistree(session)).toBe(false);
    expect(nomsDesColonnes(table.lire())).toEqual(["En mémoire"]);
    expect(await enregistrements(base)).toEqual(baseAvant);
    expect(relevees()).toEqual([]);
    tables.fermer();
  });
});

describe("persistance d'une table en échec (F-018-AC14)", () => {
  it.each([
    ["(a) indexedDB absent du navigateur", () => vi.stubGlobal("indexedDB", undefined)],
    ["(b) ouverture de la base refusée", () => refuserLesOuverturesParUneErreur()],
  ])(
    "F-018-AC14 %s : la table est tenue en mémoire et modifiable, non enregistrée, sans erreur non interceptée ni rejet non géré",
    async (_cas, couper) => {
      const relevees = ecouterLesErreursNonInterceptees();
      couper();
      const tables = creerTablesOuvertes();
      const session = tables.ouvrir(TABLE_A_DE_L_ESPACE_A);
      await attendrePhaseDeTable(session, "pret");
      await laisserIndexedDbTravailler();

      const table = tableDeLaSession(session);
      const colonne = table.creerColonne("Colonne", "texte");
      table.creerLigne(new Map([[colonne, "écrit en mémoire"]]));

      expect(estEnregistree(session)).toBe(false);
      expect(table.lire().lignes[0]?.cellules).toEqual(["écrit en mémoire"]);
      expect(relevees()).toEqual([]);
      tables.fermer();
    },
  );

  it("F-018-AC14 une cellule modifiée pendant une coupure puis la table quittée : rouverte, elle rend ce même document et la modification ; la base rétablie, la modification est relue dans un document vierge", async () => {
    simulerLHorloge();
    refuserLOuvertureDe(nomDeLaBaseDeTable(TABLE_A_DE_L_ESPACE_A));
    const tables = creerTablesOuvertes();
    const coupee = tables.ouvrir(TABLE_A_DE_L_ESPACE_A);
    await attendrePhaseDeTable(coupee, "pret");
    const table = tableDeLaSession(coupee);
    const colonne = table.creerColonne("Nom", "texte");
    const ligne = table.creerLigne();
    table.ecrireCellule(ligne, colonne, "pendant la coupure");
    const enregistreeAvant = estEnregistree(coupee);
    const doc = table.doc;

    const autre = tables.ouvrir({ idEspace: ESPACE_A, idTable: TABLE_B });
    await attendrePhaseDeTable(autre, "pret");
    const conservee = { detruit: doc.isDestroyed };
    const rouverte = tables.ouvrir(TABLE_A_DE_L_ESPACE_A);
    await attendrePhaseDeTable(rouverte, "pret");
    const rendue = tableDeLaSession(rouverte);
    vi.restoreAllMocks();
    vi.advanceTimersToNextTimer();
    await laisserIndexedDbTravailler();
    await laisserIndexedDbTravailler();

    expect(enregistreeAvant).toBe(false);
    expect(conservee).toEqual({ detruit: false });
    expect(rendue.doc).toBe(doc);
    expect(rendue.lire().lignes[0]?.cellules).toEqual(["pendant la coupure"]);
    expect(estEnregistree(rouverte)).toBe(true);
    vi.useRealTimers();
    expect((await tableEnregistree(TABLE_A_DE_L_ESPACE_A)).lignes[0]?.cellules).toEqual([
      "pendant la coupure",
    ]);
    tables.fermer();
  });

  it("F-018-AC14 un document conservé poursuit ses tentatives sans être affiché, puis est libéré une fois la modification écrite", async () => {
    simulerLHorloge();
    refuserLOuvertureDe(nomDeLaBaseDeTable(TABLE_A_DE_L_ESPACE_A));
    const tables = creerTablesOuvertes();
    const coupee = tables.ouvrir(TABLE_A_DE_L_ESPACE_A);
    await attendrePhaseDeTable(coupee, "pret");
    const table = tableDeLaSession(coupee);
    table.creerColonne("À écrire plus tard", "nombre");
    await attendrePhaseDeTable(tables.ouvrir({ idEspace: ESPACE_A, idTable: TABLE_B }), "pret");
    const conserve = !table.doc.isDestroyed;

    vi.restoreAllMocks();
    vi.advanceTimersToNextTimer();
    await laisserIndexedDbTravailler();
    await laisserIndexedDbTravailler();
    vi.useRealTimers();

    expect(conserve).toBe(true);
    expect(table.doc.isDestroyed).toBe(true);
    expect(nomsDesColonnes(await tableEnregistree(TABLE_A_DE_L_ESPACE_A))).toEqual([
      "À écrire plus tard",
    ]);
    tables.fermer();
  });

  it("F-018-AC14 tant que l'espace est inconnu, la table vit en mémoire sans base ; l'espace connu, la même table rouverte garde son document et l'enregistre", async () => {
    const tables = creerTablesOuvertes();
    const sansEspace = tables.ouvrir({ idEspace: undefined, idTable: TABLE_A });
    await attendrePhaseDeTable(sansEspace, "pret");
    const table = tableDeLaSession(sansEspace);
    table.creerColonne("Avant l'espace", "case");
    const basesSansEspace = await nomsDesBases();

    const avecEspace = tables.ouvrir(TABLE_A_DE_L_ESPACE_A);
    await attendrePhaseDeTable(avecEspace, "pret");
    await laisserIndexedDbTravailler();

    expect(basesSansEspace).toEqual([]);
    expect(tableDeLaSession(avecEspace).doc).toBe(table.doc);
    expect(nomsDesColonnes(await tableEnregistree(TABLE_A_DE_L_ESPACE_A))).toEqual([
      "Avant l'espace",
    ]);
    tables.fermer();
  });
});

// Un document de table d'une version que l'application ne prend pas en charge, et un document
// d'un autre genre, écrits sans le paquet du document.
const DOCUMENTS_REFUSES: [string, (doc: Y.Doc) => void, string][] = [
  [
    "version de format 2",
    (doc) => doc.getArray<unknown>("versions").push([2]),
    "version-non-prise-en-charge",
  ],
  ["document d'un autre genre", (doc) => doc.getText("contenu").insert(0, "x"), "illisible"],
];

describe("table refusée (F-018-AC15)", () => {
  it.each(DOCUMENTS_REFUSES)(
    "F-018-AC15 %s dans la base : la session le dit sans rien ouvrir, et rien n'est écrit dans la base",
    async (_cas, ecrire, phase) => {
      await enregistrerDansLaBaseDeTable(TABLE_A_DE_L_ESPACE_A, ecrire);
      const base = nomDeLaBaseDeTable(TABLE_A_DE_L_ESPACE_A);
      const avant = await enregistrements(base);
      const tables = creerTablesOuvertes();
      const session = tables.ouvrir(TABLE_A_DE_L_ESPACE_A);

      await attendrePhaseDeTable(session, phase as "illisible");
      await laisserIndexedDbTravailler();

      expect(session.lireEtat()).toEqual({ phase });
      expect(await enregistrements(base)).toEqual(avant);
      tables.fermer();
    },
  );

  it("F-018-AC15 une version non prise en charge reçue après l'ouverture : la session passe au refus, la table n'est plus offerte", async () => {
    const tables = creerTablesOuvertes();
    const session = tables.ouvrir(TABLE_A_DE_L_ESPACE_A);
    await attendrePhaseDeTable(session, "pret");
    const { doc } = tableDeLaSession(session);
    const recue = new Y.Doc();
    recue.getArray<unknown>("versions").push([2]);

    Y.applyUpdate(doc, Y.encodeStateAsUpdate(recue));

    expect(session.lireEtat()).toEqual({ phase: "version-non-prise-en-charge" });
    tables.fermer();
  });

  it("F-018-AC15 un identifiant refusé par la fonction de nommage n'ouvre rien : la table est introuvable", async () => {
    const tables = creerTablesOuvertes();
    const session = tables.ouvrir({ idEspace: ESPACE_A, idTable: "pas-un-uuid" });
    await laisserIndexedDbTravailler();

    expect(session.lireEtat()).toEqual({ phase: "introuvable" });
    expect(await nomsDesBases()).toEqual([]);
    tables.fermer();
  });
});

describe("quitter une table (F-018-AC16)", () => {
  it("F-018-AC16 vingt tables ouvertes puis quittées, chacune modifiée : aucune persistance ne reste ouverte et chaque document est détruit", async () => {
    const connexions = suivreLesConnexionsTenues();
    const tables = creerTablesOuvertes();
    const docs: Y.Doc[] = [];
    for (let rang = 0; rang < 20; rang += 1) {
      const idTable = `${String(rang).padStart(8, "0")}-1111-4222-8333-444444444444`;
      const session = tables.ouvrir({ idEspace: ESPACE_A, idTable });
      await attendrePhaseDeTable(session, "pret");
      await laisserIndexedDbTravailler();
      const table = tableDeLaSession(session);
      table.creerColonne(`Colonne ${String(rang)}`, "texte");
      docs.push(table.doc);
      await laisserIndexedDbTravailler();
      session.fermer();
    }
    await laisserIndexedDbTravailler();

    expect(connexions).toEqual([]);
    expect(docs.every((doc) => doc.isDestroyed)).toBe(true);
    expect((await nomsDesBases()).filter((nom) => nom.includes(":table:"))).toHaveLength(20);
    tables.fermer();
  });
});

describe("effacer les tables supprimées définitivement (F-018-AC49)", () => {
  it("F-018-AC49 une table de même identifiant dans deux espaces : supprimée dans l'un, sa base et ses réglages de vue y disparaissent, ceux de l'autre restent intacts ; rouverte, elle est vide", async () => {
    const dansB = { idEspace: ESPACE_B, idTable: TABLE_A };
    for (const designation of [TABLE_A_DE_L_ESPACE_A, dansB]) {
      await enregistrerDansLaBaseDeTable(designation, (doc) => {
        Y.applyUpdate(doc, Y.encodeStateAsUpdate(docRempli()));
      });
      localStorage.setItem(cleDesReglages(designation), RELEVE_DE_REGLAGES);
    }
    const tables = creerTablesOuvertes();
    const affichee = tables.ouvrir(TABLE_A_DE_L_ESPACE_A);
    await attendrePhaseDeTable(affichee, "pret");
    const { doc } = tableDeLaSession(affichee);

    const issue = await tables.effacer(ESPACE_A, [TABLE_A]);

    expect(issue).toBe("effacee");
    expect(doc.isDestroyed).toBe(true);
    expect(await nomsDesBases()).toEqual([nomDeLaBaseDeTable(dansB)]);
    expect(localStorage.getItem(cleDesReglages(TABLE_A_DE_L_ESPACE_A))).toBeNull();
    expect(localStorage.getItem(cleDesReglages(dansB))).toBe(RELEVE_DE_REGLAGES);
    expect(nomsDesColonnes(await tableEnregistree(dansB))).toHaveLength(5);
    const rouverte = tables.ouvrir(TABLE_A_DE_L_ESPACE_A);
    await attendrePhaseDeTable(rouverte, "pret");
    expect(tableDeLaSession(rouverte).lire()).toEqual(TABLE_VIDE);
    tables.fermer();
    localStorage.clear();
  });

  it("F-018-AC49 effacer une base et des réglages qui n'existent pas n'est pas une erreur ; sans espace désigné rien n'est effacé, l'issue est un échec et le document conservé est détruit", async () => {
    const tables = creerTablesOuvertes();
    expect(await tables.effacer(ESPACE_A, [TABLE_B])).toBe("effacee");

    simulerLHorloge();
    refuserLOuvertureDe(nomDeLaBaseDeTable(TABLE_A_DE_L_ESPACE_A));
    const coupee = tables.ouvrir(TABLE_A_DE_L_ESPACE_A);
    await attendrePhaseDeTable(coupee, "pret");
    const table = tableDeLaSession(coupee);
    table.creerColonne("Non écrite", "texte");
    await attendrePhaseDeTable(tables.ouvrir({ idEspace: ESPACE_A, idTable: TABLE_B }), "pret");

    expect(await tables.effacer(undefined, [TABLE_A])).toBe("echec");
    expect(table.doc.isDestroyed).toBe(true);
    tables.fermer();
  });
});

describe("couture du module de persistance (F-018-AC50)", () => {
  it("F-018-AC14 F-018-AC50 F-030-AC19 la session de table traite chaque état de la persistance, dont le retour de la coupure à l'état actif : ses abonnés sont prévenus à chaque passage, sans erreur non interceptée ni rejet non géré pendant la connexion fermée de force", async () => {
    const relevees = ecouterLesErreursNonInterceptees();
    const connexions = suivreLesConnexionsTenues();
    const tables = creerTablesOuvertes();
    const session = tables.ouvrir(TABLE_A_DE_L_ESPACE_A);
    const publies = [publie(session)];
    session.abonner(() => publies.push(publie(session)));
    await attendrePhaseDeTable(session, "pret");
    await laisserIndexedDbTravailler();
    const connexion = connexions.at(-1) as IDBDatabase;
    simulerLHorloge();

    fermerDeForce(connexion);
    await laisserIndexedDbTravailler();
    vi.advanceTimersToNextTimer();
    await laisserIndexedDbTravailler();
    await laisserIndexedDbTravailler();

    expect(publies).toEqual([
      "chargement",
      "pret, enregistré",
      "pret, non enregistré",
      "pret, enregistré",
    ]);
    expect(relevees()).toEqual([]);
    tables.fermer();
  });

  // Les appelants de production du module de persistance, dont la session de table et les tables
  // ouvertes, sont énumérés par F-007-AC26 (`corbeille-effacement.test.ts`) ; ici, le nom de la
  // base est constaté sur l'appareil, ouverte puis effacée par ce module.
  it("F-018-AC50 la base d'une table s'ouvre et s'efface par le module de persistance : elle porte le nom notionlike:table:<idEspace>:<idTable>, et n'existe plus une fois effacée", async () => {
    const tables = creerTablesOuvertes();
    const session = tables.ouvrir(TABLE_A_DE_L_ESPACE_A);
    await attendrePhaseDeTable(session, "pret");
    tableDeLaSession(session).creerColonne("Témoin", "texte");
    await vi.waitFor(() => expect(estEnregistree(session)).toBe(true));

    expect(await nomsDesBases()).toEqual([nomDeLaBaseDeTable(TABLE_A_DE_L_ESPACE_A)]);
    expect(await tables.effacer(ESPACE_A, [TABLE_A])).toBe("effacee");
    expect(await nomsDesBases()).toEqual([]);
    tables.fermer();
  });
});

function publie(session: { lireEtat(): EtatSessionTable }): string {
  const etat = session.lireEtat();
  if (etat.phase !== "pret") {
    return etat.phase;
  }
  return etat.enregistre ? "pret, enregistré" : "pret, non enregistré";
}

function docRempli(): Y.Doc {
  const tables = creerTablesOuvertes();
  const session = tables.ouvrir({ idEspace: undefined, idTable: TABLE_A });
  const table = tableDeLaSession(session);
  remplirUneTable(table);
  const copie = new Y.Doc();
  Y.applyUpdate(copie, Y.encodeStateAsUpdate(table.doc));
  tables.fermer();
  return copie;
}
