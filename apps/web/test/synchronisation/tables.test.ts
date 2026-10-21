// Synchronisation des documents de table (F-018-AC51, AC53, AC9), contre le serveur réel : passe de
// fond, table affichée, suppression définitive propagée, copie locale effacée, étanchéité entre les
// espaces d'un appareil. Une table est échangée sous `table:<e>:<t>`, jamais sous `page:<e>:<t>`.
import { type DocumentTable, ouvrirDocumentTable, type TableLue } from "@notionlike/document";
import { demarrerServeurDEssai, type ServeurDEssai } from "@notionlike/server/essai";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { inscrireAuRegistre, ouvrirPersistance } from "../../src/persistance/index.ts";
import { correspondance } from "../../src/synchronisation/noms.ts";
import { changerLaCleDUnePage } from "../aides-format.ts";
import { enregistrements, nomsDesBases } from "../aides-persistance.ts";
import {
  adopterEtAttendre,
  type Appareil,
  attendreLEtat,
  attendreQue,
  espacePartage,
  fermerLesOnglets,
  messagesDe,
  nouvelAppareil,
  type Onglet,
  ouvrirUnOnglet,
  pause,
  preparerLAppareil,
  TYPES_DE_MESSAGE,
} from "./aides-synchro.ts";

vi.setConfig({ testTimeout: 90_000 });

let serveur: ServeurDEssai;
beforeAll(async () => {
  serveur = await demarrerServeurDEssai();
});
afterAll(async () => {
  await serveur.fermer();
});
afterEach(() => {
  fermerLesOnglets();
});

/** Écrit dans la base d'une table de l'appareil, comme l'écran de table l'aurait fait. */
async function remplirLaBase(
  appareil: Appareil,
  idEspace: string,
  idTable: string,
  remplir: (table: DocumentTable) => void,
): Promise<void> {
  const doc = new Y.Doc({ gc: true });
  const persistance = appareil.sur(() =>
    ouvrirPersistance(doc, { type: "table", idEspace, idTable }),
  );
  await attendreQue(() => persistance.lireEtat() === "active", 12_000, "base de table");
  const table = ouvrirDocumentTable(doc);
  appareil.sur(() => remplir(table));
  table.fermer();
  await attendreQue(() => !persistance.aDesModificationsNonEnregistrees(), 12_000);
  await pause(50);
  persistance.fermer();
  doc.destroy();
}

/** La table que la base de l'appareil porte, relue dans un document vierge. */
async function lireLaBase(
  appareil: Appareil,
  idEspace: string,
  idTable: string,
): Promise<TableLue> {
  const doc = new Y.Doc();
  const persistance = appareil.sur(() =>
    ouvrirPersistance(doc, { type: "table", idEspace, idTable }),
  );
  await attendreQue(() => persistance.lireEtat() === "active", 12_000, "relecture de table");
  const table = ouvrirDocumentTable(doc);
  const lue = table.lire();
  table.fermer();
  persistance.fermer();
  doc.destroy();
  return lue;
}

function remplir(table: DocumentTable): void {
  const nom = table.creerColonne("Article", "texte");
  const prix = table.creerColonne("Prix", "nombre");
  table.creerLigne(
    new Map<string, string | number>([
      [nom, "Papier"],
      [prix, 12.5],
    ]),
  );
  table.creerLigne(new Map([[nom, "Encre"]]));
}

function basesDe(onglet: Onglet): Promise<string[]> {
  return onglet.appareil.sur(() => nomsDesBases());
}

describe("passe de fond des tables (F-018-AC51)", () => {
  it("F-018-AC51 F-018-AC9 une table créée et remplie hors ligne se lit identique sur un second appareil après la passe de fond, sans qu'il l'ait affichée ; aucun document de page n'existe pour elle", async () => {
    const membre = await serveur.inscrire();
    const idEspace = crypto.randomUUID();
    const premier = await ouvrirUnOnglet({ serveur, cookie: membre.cookie, idEspace });
    const idTable = premier.facade.creerTable("Achats");
    await remplirLaBase(premier.appareil, idEspace, idTable, remplir);
    const attendue = await lireLaBase(premier.appareil, idEspace, idTable);
    await adopterEtAttendre(premier);

    const appareil = nouvelAppareil();
    await preparerLAppareil(appareil, idEspace, { rattachement: "adopte", droit: "ecriture" });
    const second = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace,
      appareil,
      rejoint: true,
    });
    await attendreLEtat(second, "synchronise", 30_000);
    second.synchro.fermer();
    second.reseau.couper();

    expect(await lireLaBase(appareil, idEspace, idTable)).toEqual(attendue);
    const table = correspondance("table", idEspace, idTable);
    const page = correspondance("page", idEspace, idTable);
    expect(await serveur.lireInstantane(table.nomDeDocument)).toBeDefined();
    expect(await serveur.lireInstantane(page.nomDeDocument)).toBeUndefined();
    for (const onglet of [premier, second]) {
      expect(messagesDe(onglet.reseau.emis).some(({ nom }) => nom === page.nomDeDocument)).toBe(
        false,
      );
    }
    expect(await appareil.sur(() => nomsDesBases())).not.toContain(page.nomDeBase);
  });

  it("F-018-AC51 la table affichée est échangée sur son document, sans réplique : ce qui y est écrit atteint le serveur et l'autre appareil, et le document est dit acquitté", async () => {
    const partage = await espacePartage(serveur, "editeur");
    const { chez, ailleurs, idEspace } = partage;
    const idTable = chez.facade.creerTable("Suivi");
    const doc = new Y.Doc({ gc: true });
    const table = ouvrirDocumentTable(doc);
    chez.synchro.afficherTable({ idTable, doc });
    chez.appareil.sur(() => remplir(table));
    await attendreLEtat(chez, "synchronise");
    await attendreQue(() => chez.synchro.estAcquitte(doc), 10_000);
    const attendue = table.lire();
    table.fermer();

    await attendreQue(
      async () =>
        (await basesDe(ailleurs)).includes(correspondance("table", idEspace, idTable).nomDeBase),
      20_000,
    );
    ailleurs.reseau.couper();
    await attendreQue(() => ailleurs.synchro.lireEtat().affiche !== "synchronise");
    ailleurs.reseau.retablir();
    ailleurs.signaler("reseau");
    await attendreLEtat(ailleurs, "synchronise", 20_000);
    await attendreQue(
      async () =>
        JSON.stringify(await lireLaBase(ailleurs.appareil, idEspace, idTable)) ===
        JSON.stringify(attendue),
      20_000,
    );
    chez.synchro.afficherPage(undefined);
    doc.destroy();
  });
});

describe("suppression et effacements (F-018-AC53)", () => {
  it("F-018-AC53 une table supprimée définitivement sur un appareil : l'autre n'a plus, après sa reconnexion, ni sa base de table ni de base de page", async () => {
    const partage = await espacePartage(serveur, "editeur");
    const { chez, ailleurs, idEspace } = partage;
    const idTable = chez.facade.creerTable("À supprimer");
    await remplirLaBase(chez.appareil, idEspace, idTable, remplir);
    const base = correspondance("table", idEspace, idTable).nomDeBase;
    await attendreQue(async () => (await basesDe(ailleurs)).includes(base), 20_000);
    await attendreLEtat(ailleurs, "synchronise", 20_000);
    ailleurs.reseau.couper();
    await attendreQue(() => ailleurs.synchro.lireEtat().affiche !== "synchronise");

    chez.facade.mettreALaCorbeille(idTable);
    chez.facade.supprimerDefinitivement(idTable);
    await attendreLEtat(chez, "synchronise");
    ailleurs.reseau.retablir();
    ailleurs.signaler("reseau");

    await attendreQue(async () => !(await basesDe(ailleurs)).includes(base), 20_000);
    expect(
      (await basesDe(ailleurs)).includes(correspondance("page", idEspace, idTable).nomDeBase),
    ).toBe(false);
  });

  it("F-018-AC53 effacer la copie locale efface aussi la base de chaque table de l'espace, désignée dans cet espace", async () => {
    const membre = await serveur.inscrire();
    const idEspace = crypto.randomUUID();
    const onglet = await ouvrirUnOnglet({ serveur, cookie: membre.cookie, idEspace });
    const idTable = onglet.facade.creerTable("Locale");
    await remplirLaBase(onglet.appareil, idEspace, idTable, remplir);
    const autreEspace = crypto.randomUUID();
    await remplirLaBase(onglet.appareil, autreEspace, idTable, remplir);
    await attendreQue(() => onglet.synchro.lireEtat().registreLu);

    await onglet.appareil.sur(() => onglet.synchro.effacerLaCopieLocale());

    const bases = await basesDe(onglet);
    expect(bases).not.toContain(correspondance("table", idEspace, idTable).nomDeBase);
    expect(bases).toContain(correspondance("table", autreEspace, idTable).nomDeBase);
  });

  it("F-018-AC53 F-013-AC44 une table de l'espace A portée par l'arborescence d'un espace B : rien de la base de A n'est envoyé sous table:B, la base de A reste octet pour octet", async () => {
    const membre = await serveur.inscrire();
    const autre = await serveur.inscrire();
    const appareil = nouvelAppareil();
    const idEspaceA = crypto.randomUUID();
    const espaceA = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: idEspaceA,
      appareil,
    });
    const idTable = espaceA.facade.creerTable("Témoin de A");
    await remplirLaBase(appareil, idEspaceA, idTable, (table) => {
      table.creerColonne("TEMOIN-DE-A", "texte");
    });
    const baseA = correspondance("table", idEspaceA, idTable).nomDeBase;
    const avant = await appareil.sur(() => enregistrements(baseA));
    const idEspaceB = crypto.randomUUID();
    const chezAutre = await ouvrirUnOnglet({ serveur, cookie: autre.cookie, idEspace: idEspaceB });
    const forgee = chezAutre.facade.creerTable("Table de B");
    changerLaCleDUnePage(chezAutre.facade.doc, forgee, idTable);
    await adopterEtAttendre(chezAutre);
    await serveur.ajouterMembre(autre.cookie, idEspaceB, membre.cookie, "editeur");
    expect(
      await appareil.sur(() =>
        inscrireAuRegistre(idEspaceB, { rattachement: "adopte", droit: "ecriture" }),
      ),
    ).toBe(true);
    const espaceB = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: idEspaceB,
      appareil,
      autreEspace: true,
      rejoint: true,
    });
    await attendreLEtat(espaceB, "synchronise", 20_000);
    const nomB = correspondance("table", idEspaceB, idTable).nomDeDocument;
    await attendreQue(
      () =>
        messagesDe(espaceB.reseau.emis).some(
          ({ nom, type }) => nom === nomB && type === TYPES_DE_MESSAGE.fermeture,
        ),
      20_000,
    );
    await pause(1000);

    const instantane = await serveur.lireInstantane(nomB);
    expect(
      instantane === undefined || !new TextDecoder().decode(instantane).includes("TEMOIN-DE-A"),
    ).toBe(true);
    expect(
      espaceB.reseau.emis.some((octets) =>
        new TextDecoder().decode(octets).includes("TEMOIN-DE-A"),
      ),
    ).toBe(false);
    expect(await appareil.sur(() => enregistrements(baseA))).toEqual(avant);
  });
});
