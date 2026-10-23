// F-032 (bloc 6), sur le serveur réel de la fabrique d'essai, sans doublure du serveur, du
// fournisseur ni du protocole (F-032-AC33) : un onglet lancé comme l'entrée le lance (magasin,
// pilote et session réels, synchronisation de production), sur des appareils simulés. Ajout à
// l'appareil (AC5), rien d'écrit à la place du serveur (AC7), base déjà présente (AC9), aucune
// frappe perdue (AC11, second test), étanchéité par un changement réel (AC14, part serveur),
// lecture seule dès l'ajout (AC25), membre retiré (AC26).
import type { CompteInscrit, ServeurDEssai } from "@notionlike/server/essai";
import { demarrerServeurDEssai } from "@notionlike/server/essai";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { ESPACE_DE_CET_APPAREIL, MENTION_DETACHE } from "../../src/interface/messages-espaces.ts";
import type { Synchronisation } from "../../src/synchronisation/index.ts";
import { correspondance } from "../../src/synchronisation/noms.ts";
import { changerLaCleDUnePage } from "../aides-format.ts";
import { ouvrirFacade } from "../aides-facade.ts";
import { fermerLesOngletsReels, lancerUnOnglet, type OngletReel } from "./aides-onglet.ts";
import {
  adopterEtAttendre,
  type Appareil,
  attendreQue,
  contenuDeLaBase,
  contenuDeLAppareil,
  ecrireDansLaBase,
  ecrireDansLaPage,
  entreeDuRegistre,
  fermerLesOnglets,
  lireDansLaBase,
  lireLaBaseDEspace,
  lireMessage,
  lireSynchronisation,
  nouvelAppareil,
  type Onglet,
  ouvrirLaBaseDUnePage,
  ouvrirUnOnglet,
  pause,
  poserLaBaseDEspace,
  requetesVues,
  SORTES_DE_SYNCHRONISATION,
  texteDeLaPage,
} from "./aides-synchro.ts";

vi.setConfig({ testTimeout: 120_000 });

let serveur: ServeurDEssai;
beforeAll(async () => {
  serveur = await demarrerServeurDEssai();
}, 30_000);
afterAll(async () => {
  await serveur.fermer();
});
afterEach(() => {
  fermerLesOngletsReels();
  fermerLesOnglets();
});

const APPAREIL = { sorte: "appareil" } as const;
const ajoute = (idEspace: string) => ({ sorte: "ajoute", idEspace }) as const;

function contient(octets: Uint8Array | undefined, texte: string): boolean {
  return octets !== undefined && new TextDecoder().decode(octets).includes(texte);
}

async function nomsDesBases(appareil: Appareil): Promise<string[]> {
  return (await appareil.idb.databases()).map(({ name = "" }) => name).sort();
}

const nomDeLEspace = (idEspace: string): string => correspondance("espace", idEspace).nomDeDocument;
const nomDeLaPage = (idEspace: string, idPage: string): string =>
  correspondance("page", idEspace, idPage).nomDeDocument;

/** Vrai si cette mise à jour, appliquée à cet état, y change quelque chose. */
function changeraitLEtat(etat: Uint8Array, miseAJour: Uint8Array): boolean {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, etat);
  let change = false;
  doc.on("update", () => {
    change = true;
  });
  Y.applyUpdate(doc, miseAJour);
  doc.destroy();
  return change;
}

/** Vrai si ces deux états portent exactement les mêmes opérations (insertions et suppressions). */
function memesOperations(un: Uint8Array, autre: Uint8Array): boolean {
  return !changeraitLEtat(un, autre) && !changeraitLEtat(autre, un);
}

async function attendreLEtatAffiche(
  synchro: Synchronisation,
  attendu: ReturnType<Synchronisation["lireEtat"]>["affiche"],
  delaiMs = 30_000,
): Promise<void> {
  await attendreQue(
    () => synchro.lireEtat().affiche === attendu,
    delaiMs,
    `état « ${attendu} » non atteint (reste « ${synchro.lireEtat().affiche} »)`,
  );
}

interface PageDuServeur {
  readonly titre: string;
  readonly contenu: string;
}

interface EspaceDuServeur {
  readonly idEspace: string;
  readonly nom: string;
  readonly proprietaire: CompteInscrit;
  readonly membre: CompteInscrit;
  /** L'onglet du propriétaire, sur son appareil, qui a adopté l'espace. */
  readonly chez: Onglet;
  readonly pages: readonly string[];
}

/**
 * Un espace du serveur, adopté par son propriétaire depuis son appareil avec ses pages et leur
 * contenu, dont un second compte est membre avec ce rôle ; l'appareil du membre ne le détient pas.
 */
async function espaceDuServeur(
  role: "editeur" | "lecteur",
  pages: readonly PageDuServeur[],
  nom = "Espace partagé",
): Promise<EspaceDuServeur> {
  const proprietaire = await serveur.inscrire("proprietaire");
  const membre = await serveur.inscrire("membre");
  const idEspace = crypto.randomUUID();
  const chez = await ouvrirUnOnglet({ serveur, cookie: proprietaire.cookie, idEspace });
  const ids: string[] = [];
  for (const { titre, contenu } of pages) {
    const idPage = chez.facade.creerPage(titre);
    ids.push(idPage);
    await ecrireDansLaBase(chez.appareil, idEspace, idPage, contenu);
  }
  await adopterEtAttendre(chez, nom);
  await serveur.ajouterMembre(proprietaire.cookie, idEspace, membre.cookie, role);
  for (const [rang, idPage] of ids.entries()) {
    const { contenu } = pages[rang] as PageDuServeur;
    await attendreQue(
      async () => contient(await serveur.lireInstantane(nomDeLaPage(idEspace, idPage)), contenu),
      20_000,
      "contenu de page enregistré par le serveur",
    );
  }
  await attendreQue(
    async () => (await serveur.lireInstantane(nomDeLEspace(idEspace))) !== undefined,
    20_000,
    "document d'espace enregistré par le serveur",
  );
  return { idEspace, nom, proprietaire, membre, chez, pages: ids };
}

/** Lance un onglet sur un appareil neuf, qui n'a que l'espace de l'appareil, ouvert et prêt. */
async function ongletNeuf(cookie: string, appareil = nouvelAppareil()): Promise<OngletReel> {
  const onglet = await lancerUnOnglet({ serveur, cookie, appareil });
  await onglet.attendreLaSession();
  expect(onglet.ouvert().espace.cible).toEqual(APPAREIL);
  return onglet;
}

/** Ajoute l'espace à l'appareil de l'onglet et attend sa première synchronisation achevée. */
async function ajouterEtSynchroniser(
  onglet: OngletReel,
  idEspace: string,
): Promise<Synchronisation> {
  expect((await onglet.ajouter(idEspace)).sorte).toBe("inscrit");
  const synchro = await onglet.attendreLaSynchronisation();
  await attendreLEtatAffiche(synchro, "synchronise");
  return synchro;
}

function titresDe(onglet: OngletReel): string[] {
  const lu = onglet.ouvert().espace.session.lireEtat();
  return lu.phase === "pret" ? lu.arborescence.racines.map(({ titre }) => titre).sort() : [];
}

describe("ajout à l'appareil (F-032-AC5)", () => {
  it.each([
    ["editeur", "ecriture"],
    ["lecteur", "lecture"],
    ["proprietaire", "ecriture"],
  ] as const)(
    "F-032-AC5 rôle %s : une seule lecture de l'espace au serveur, puis l'entrée { adopte, %s }, le nom et la marque inscrits, sans base de l'espace ni WebSocket avant l'inscription ; puis le changement l'ouvre et le synchronise",
    async (role, droit) => {
      const espace = await espaceDuServeur(role === "lecteur" ? "lecteur" : "editeur", [
        { titre: "Page du serveur", contenu: "contenu du serveur" },
      ]);
      const { idEspace } = espace;
      const cookie = role === "proprietaire" ? espace.proprietaire.cookie : espace.membre.cookie;
      const onglet = await ongletNeuf(cookie);
      const { appareil, reseau } = onglet;
      const requetes = requetesVues.length;
      const avantLeChangement: {
        requetes?: unknown[];
        bases?: string[];
        ouvertes?: number;
        entree?: unknown;
        inscrit?: unknown;
      } = {};

      const issue = await onglet.ajouter(idEspace, async () => {
        avantLeChangement.requetes = requetesVues
          .slice(requetes)
          .map(({ methode, chemin }) => `${methode} ${chemin}`);
        avantLeChangement.ouvertes = reseau.ouvertes();
        avantLeChangement.bases = (await nomsDesBases(appareil)).filter((nom) =>
          nom.includes(idEspace),
        );
        avantLeChangement.entree = await entreeDuRegistre(appareil, idEspace);
        const relu = await appareil.sur(() => onglet.magasin.relire());
        avantLeChangement.inscrit = relu.autres.find((autre) => autre.idEspace === idEspace);
      });

      expect(issue).toEqual({ sorte: "inscrit", nom: espace.nom });
      expect(avantLeChangement.requetes).toEqual([`GET /api/v1/espaces/${idEspace}`]);
      expect(avantLeChangement.ouvertes).toBe(0);
      expect(avantLeChangement.bases).toEqual([]);
      expect(avantLeChangement.entree).toEqual({ rattachement: "adopte", droit });
      expect(avantLeChangement.inscrit).toEqual({
        idEspace,
        entree: { rattachement: "adopte", droit },
        nom: espace.nom,
        marque: true,
      });
      // Le changement de F-032-AC10 : l'espace ajouté est ouvert avec le droit inscrit.
      expect(onglet.ouvert().espace).toMatchObject({ cible: ajoute(idEspace), droit });
      const synchro = await onglet.attendreLaSynchronisation();
      await attendreLEtatAffiche(synchro, "synchronise");
      expect(reseau.ouvertes()).toBeGreaterThan(0);
      expect(titresDe(onglet)).toEqual(["Page du serveur"]);
      expect(await nomsDesBases(appareil)).toContain(correspondance("espace", idEspace).nomDeBase);
      expect(
        requetesVues
          .slice(requetes)
          .filter(({ chemin }) => chemin === `/api/v1/espaces/${idEspace}`),
      ).toHaveLength(1);
    },
  );
});

describe("rien d'écrit à la place du serveur (F-032-AC7)", () => {
  it("F-032-AC7 la première ouverture et la première synchronisation d'un espace ajouté sur un second appareil n'émettent aucune mise à jour ; l'état encodé du document d'espace du serveur est le même octet pour octet ; les bases locales portent l'état du serveur", async () => {
    const espace = await espaceDuServeur("editeur", [
      { titre: "Première", contenu: "contenu de la première" },
      { titre: "Seconde", contenu: "contenu de la seconde" },
    ]);
    const { idEspace, pages } = espace;
    const noms = [nomDeLEspace(idEspace), ...pages.map((idPage) => nomDeLaPage(idEspace, idPage))];
    // Le propriétaire ferme son onglet : plus rien ne change l'état du serveur pendant l'essai.
    espace.chez.synchro.fermer();
    await pause(1500);
    const avant = new Map<string, Uint8Array>();
    for (const nom of noms) {
      avant.set(nom, (await serveur.lireInstantane(nom)) as Uint8Array);
    }
    const onglet = await ongletNeuf(espace.membre.cookie);

    const synchro = await ajouterEtSynchroniser(onglet, idEspace);
    await pause(1000);
    const emis = onglet.reseau.emis.map(lireSynchronisation).filter((lu) => lu !== undefined);
    onglet.fermer();
    await pause(1500);

    // Les deux documents de page ont été échangés par la passe de fond, comme celui de l'espace.
    expect(new Set(emis.map(({ nom }) => nom))).toEqual(new Set(noms));
    expect(emis.filter(({ sorte }) => sorte === SORTES_DE_SYNCHRONISATION.miseAJour)).toEqual([]);
    for (const { nom, charge } of emis.filter(
      ({ sorte }) => sorte === SORTES_DE_SYNCHRONISATION.reponse,
    )) {
      expect(changeraitLEtat(avant.get(nom) as Uint8Array, charge), nom).toBe(false);
    }
    expect(synchro.lireEtat().affiche).toBe("synchronise");
    for (const nom of noms) {
      expect(await serveur.lireInstantane(nom), nom).toEqual(avant.get(nom));
    }
    const local = await lireLaBaseDEspace(onglet.appareil, idEspace);
    expect(
      memesOperations(Y.encodeStateAsUpdate(local), avant.get(noms[0] as string) as Uint8Array),
    ).toBe(true);
    local.destroy();
    for (const idPage of pages) {
      const page = await ouvrirLaBaseDUnePage(onglet.appareil, idEspace, idPage);
      expect(
        memesOperations(
          Y.encodeStateAsUpdate(page.doc),
          avant.get(nomDeLaPage(idEspace, idPage)) as Uint8Array,
        ),
      ).toBe(true);
      page.persistance.fermer();
      page.doc.destroy();
    }
  });
});

describe("base déjà présente (F-032-AC9)", () => {
  it("F-032-AC9 une base d'espace et une base de page témoins, posées sans entrée au registre, sont ouvertes telles quelles à l'ajout : le témoin et le contenu du serveur se lisent tous les deux sur l'appareil et sur le serveur", async () => {
    const espace = await espaceDuServeur("editeur", [
      { titre: "Page du serveur", contenu: "CONTENU-DU-SERVEUR" },
    ]);
    const { idEspace } = espace;
    const idPage = espace.pages[0] as string;
    const appareil = nouvelAppareil();
    // Copie d'avant la perte du registre (H7) : l'état du serveur, plus une page créée ici.
    const copie = new Y.Doc();
    Y.applyUpdate(copie, Y.encodeStateAsUpdate(espace.chez.facade.doc));
    const facade = ouvrirFacade(copie);
    facade.creerPage("TEMOIN-TITRE-DE-LA-BASE");
    facade.fermer();
    await poserLaBaseDEspace(appareil, idEspace, Y.encodeStateAsUpdate(copie));
    copie.destroy();
    await ecrireDansLaBase(appareil, idEspace, idPage, "TEMOIN-DE-LA-BASE");
    const basesPosees = (await nomsDesBases(appareil)).filter((nom) => nom.includes(idEspace));
    const onglet = await ongletNeuf(espace.membre.cookie, appareil);
    expect(await entreeDuRegistre(appareil, idEspace)).toBeUndefined();

    await ajouterEtSynchroniser(onglet, idEspace);

    // Sur l'appareil : les bases posées, ni effacées ni renommées, qui portent le témoin et le
    // serveur ; la passe de fond y ajoute seulement celle de la page créée dans la copie.
    expect(basesPosees).toHaveLength(2);
    expect((await nomsDesBases(appareil)).filter((nom) => nom.includes(idEspace))).toEqual(
      expect.arrayContaining(basesPosees),
    );
    expect(titresDe(onglet)).toEqual(["Page du serveur", "TEMOIN-TITRE-DE-LA-BASE"]);
    await attendreQue(
      async () =>
        contient(await serveur.lireInstantane(nomDeLaPage(idEspace, idPage)), "TEMOIN-DE-LA-BASE"),
      20_000,
      "témoin de la base de page transmis par la passe de fond",
    );
    onglet.fermer();
    const texte = await lireDansLaBase(appareil, idEspace, idPage);
    expect(texte).toContain("TEMOIN-DE-LA-BASE");
    expect(texte).toContain("CONTENU-DU-SERVEUR");
    // Sur le serveur : le témoin du document d'espace et celui de la page, avec le contenu d'avant.
    await attendreQue(
      async () =>
        contient(await serveur.lireInstantane(nomDeLEspace(idEspace)), "TEMOIN-TITRE-DE-LA-BASE"),
      20_000,
      "témoin de la base d'espace transmis",
    );
    const pageDuServeur = await serveur.lireInstantane(nomDeLaPage(idEspace, idPage));
    expect(contient(pageDuServeur, "CONTENU-DU-SERVEUR")).toBe(true);
    await attendreQue(() =>
      espace.chez.facade.lire().racines.some(({ titre }) => titre === "TEMOIN-TITRE-DE-LA-BASE"),
    );
  });
});

describe("aucune frappe perdue (F-032-AC11)", () => {
  it("F-032-AC11 (second test) espace `adopte`, connexion établie : le titre d'une page et le contenu d'une autre, modifiés dans la même tâche que la demande de changement, se lisent sur un second appareil après sa passe de fond", async () => {
    const espace = await espaceDuServeur("editeur", [
      { titre: "Titre d'avant", contenu: "contenu de la première" },
      { titre: "Seconde", contenu: "contenu de la seconde" },
    ]);
    const { idEspace } = espace;
    const [idTitre, idContenu] = espace.pages as [string, string];
    const onglet = await ongletNeuf(espace.membre.cookie);
    const synchro = await ajouterEtSynchroniser(onglet, idEspace);
    const page = await onglet.afficherLaPage(idContenu);
    await attendreQue(() => texteDeLaPage(page.doc).includes("contenu de la seconde"), 20_000);
    await attendreLEtatAffiche(synchro, "synchronise");
    const { operations } = await onglet.attendreLaSession();

    // Une seule tâche : le titre, la dernière frappe, la demande de changement.
    onglet.appareil.sur(() => {
      operations.renommerPage(idTitre, "TITRE-MODIFIE");
      ecrireDansLaPage(page.doc, "FRAPPE-DE-LA-FIN");
      onglet.changer(APPAREIL, ESPACE_DE_CET_APPAREIL);
    });

    expect(onglet.ouvert().espace.cible).toEqual(APPAREIL);
    const second = await ongletNeuf(espace.membre.cookie);
    await ajouterEtSynchroniser(second, idEspace);
    const titres = (await second.attendreLaSession()).arborescence.racines.map(({ id, titre }) => [
      id,
      titre,
    ]);
    expect(titres).toContainEqual([idTitre, "TITRE-MODIFIE"]);
    second.fermer();
    expect(await lireDansLaBase(second.appareil, idEspace, idContenu)).toContain(
      "FRAPPE-DE-LA-FIN",
    );
  });
});

describe("étanchéité entre espaces, par un changement réel (F-032-AC14)", () => {
  it("F-032-AC14 deux espaces A et B dont les arborescences portent le même identifiant de page : de A à B puis de B à A dans le même onglet, chacun affiche son contenu, aucun Y.Doc ni canal de l'espace quitté ne survit, aucun octet du témoin de A n'est envoyé sous un nom qui porte B, et le retrait de B laisse la base de la page de A intacte", async () => {
    const proprietaire = await serveur.inscrire("proprietaire");
    const membre = await serveur.inscrire("membre");
    const idA = crypto.randomUUID();
    const idB = crypto.randomUUID();
    const chezA = await ouvrirUnOnglet({ serveur, cookie: proprietaire.cookie, idEspace: idA });
    const idPage = chezA.facade.creerPage("Page de A");
    await ecrireDansLaBase(chezA.appareil, idA, idPage, "TEMOIN-DE-A");
    await adopterEtAttendre(chezA, "Alpha");
    const chezB = await ouvrirUnOnglet({ serveur, cookie: proprietaire.cookie, idEspace: idB });
    changerLaCleDUnePage(chezB.facade.doc, chezB.facade.creerPage("Page de B"), idPage);
    await ecrireDansLaBase(chezB.appareil, idB, idPage, "TEMOIN-DE-B");
    await adopterEtAttendre(chezB, "Beta");
    for (const idEspace of [idA, idB]) {
      await serveur.ajouterMembre(proprietaire.cookie, idEspace, membre.cookie, "editeur");
    }
    const onglet = await ongletNeuf(membre.cookie);
    const { reseau } = onglet;

    // Dans A : son contenu, et une frappe de plus, témoin écrit sur cet appareil.
    const synchroA = await ajouterEtSynchroniser(onglet, idA);
    const pageA = await onglet.afficherLaPage(idPage);
    await attendreQue(() => texteDeLaPage(pageA.doc).includes("TEMOIN-DE-A"), 20_000);
    onglet.appareil.sur(() => ecrireDansLaPage(pageA.doc, "TEMOIN-LOCAL-DE-A"));
    await attendreLEtatAffiche(synchroA, "synchronise");
    expect(titresDe(onglet)).toEqual(["Page de A"]);
    const canauxDeA = onglet.canaux.length;

    // De A à B, par l'ajout de B.
    const synchroB = await ajouterEtSynchroniser(onglet, idB);
    expect(onglet.canaux.slice(0, canauxDeA).every(({ ferme }) => ferme)).toBe(true);
    const pageB = await onglet.afficherLaPage(idPage);
    await attendreQue(() => texteDeLaPage(pageB.doc).includes("TEMOIN-DE-B"), 20_000);
    await attendreLEtatAffiche(synchroB, "synchronise");
    expect(titresDe(onglet)).toEqual(["Page de B"]);
    expect(texteDeLaPage(pageB.doc)).not.toContain("TEMOIN-DE-A");
    const canauxDeB = onglet.canaux.length;

    // De B à A.
    onglet.changer(ajoute(idA), "Alpha");
    const retour = await onglet.attendreLaSynchronisation();
    await attendreLEtatAffiche(retour, "synchronise");
    expect(onglet.canaux.slice(0, canauxDeB).every(({ ferme }) => ferme)).toBe(true);
    const pageA2 = await onglet.afficherLaPage(idPage);
    expect(texteDeLaPage(pageA2.doc)).toContain("TEMOIN-LOCAL-DE-A");
    expect(texteDeLaPage(pageA2.doc)).not.toContain("TEMOIN-DE-B");
    expect(titresDe(onglet)).toEqual(["Page de A"]);
    await attendreLEtatAffiche(retour, "synchronise");

    // Aucun Y.Doc réutilisé d'un espace ouvert à l'autre : ni document d'espace, ni page.
    const docs = onglet.generations.map(({ espace }) => espace.session.doc);
    expect(onglet.generations.map(({ espace }) => espace.cible)).toEqual([
      APPAREIL,
      ajoute(idA),
      ajoute(idB),
      ajoute(idA),
    ]);
    expect(new Set(docs).size).toBe(docs.length);
    expect(new Set([pageA.doc, pageB.doc, pageA2.doc]).size).toBe(3);
    // Contre le serveur réel : rien du témoin de A sous un nom qui porte B.
    const sousB = reseau.emis.filter((octets) => lireMessage(octets).nom.includes(idB));
    expect(sousB.length).toBeGreaterThan(0);
    for (const temoin of ["TEMOIN-DE-A", "TEMOIN-LOCAL-DE-A"]) {
      expect(
        sousB.some((octets) => contient(octets, temoin)),
        temoin,
      ).toBe(false);
    }
    await pause(1500);
    for (const nom of [nomDeLEspace(idB), nomDeLaPage(idB, idPage)]) {
      const instantane = await serveur.lireInstantane(nom);
      expect(contient(instantane, "TEMOIN-DE-A"), nom).toBe(false);
      expect(contient(instantane, "TEMOIN-LOCAL-DE-A"), nom).toBe(false);
    }
    expect(
      contient(await serveur.lireInstantane(nomDeLaPage(idA, idPage)), "TEMOIN-LOCAL-DE-A"),
    ).toBe(true);

    // Le retrait de B (F-032-AC20), A quitté et ses écritures faites : la base de la page de A
    // est la même, octet pour octet, et plus aucune base ne porte B.
    onglet.changer(APPAREIL, ESPACE_DE_CET_APPAREIL);
    await onglet.attendreLaSession();
    await pause(500);
    const baseDeLaPageDeA = correspondance("page", idA, idPage).nomDeBase;
    const avantLeRetrait = await contenuDeLaBase(onglet.appareil, baseDeLaPageDeA);
    expect(avantLeRetrait).toContain("TEMOIN-LOCAL-DE-A");

    expect(await onglet.appareil.sur(() => onglet.magasin.retirer(idB))).toBe("retire");

    expect((await nomsDesBases(onglet.appareil)).filter((nom) => nom.includes(idB))).toEqual([]);
    expect(await contenuDeLaBase(onglet.appareil, baseDeLaPageDeA)).toEqual(avantLeRetrait);
  });
});

describe("lecture seule dès l'ajout (F-032-AC25)", () => {
  it("F-032-AC25 ajouté en `lecteur`, réseau coupé avant l'établissement de la connexion : le droit `lecture` est lu au registre dès l'ouverture, et l'état encodé de chaque document est inchangé, octet pour octet", async () => {
    const espace = await espaceDuServeur("lecteur", [
      { titre: "Page du serveur", contenu: "contenu du serveur" },
    ]);
    const { idEspace } = espace;
    const onglet = await ongletNeuf(espace.membre.cookie);
    const { appareil, reseau } = onglet;

    const issue = await onglet.ajouter(idEspace, () => reseau.couper());

    expect(issue.sorte).toBe("inscrit");
    // Dès la première publication de l'espace ouvert, avant toute connexion.
    expect(onglet.ouvert().espace).toMatchObject({ cible: ajoute(idEspace), droit: "lecture" });
    const pret = await onglet.attendreLaSession();
    const synchro = await onglet.attendreLaSynchronisation();
    await attendreQue(() => synchro.lireEtat().registreLu, 15_000);
    expect(synchro.lireEtat()).toMatchObject({ rattachement: "adopte", droit: "lecture" });
    expect(pret.arborescence.racines).toEqual([]);
    const doc = onglet.ouvert().espace.session.doc as Y.Doc;
    const etatAvant = Y.encodeStateAsUpdate(doc);
    const basesAvant = await contenuDeLAppareil(appareil);

    await pause(2500);

    expect(synchro.lireEtat().affiche).not.toBe("synchronise");
    expect(Y.encodeStateAsUpdate(doc)).toEqual(etatAvant);
    expect(await contenuDeLAppareil(appareil)).toEqual(basesAvant);
    expect(reseau.emis).toEqual([]);
  });
});

describe("membre retiré (F-032-AC26)", () => {
  it("F-032-AC26 le membre est retiré pendant que l'appareil détient l'espace sans l'avoir ouvert : la liste du serveur ne le rend plus (mention calculée, jamais inscrite) ; ouvert ensuite, il est constaté détaché, et son contenu local se lit", async () => {
    const espace = await espaceDuServeur("editeur", [
      { titre: "Page gardée", contenu: "CONTENU-GARDE" },
    ]);
    const { idEspace } = espace;
    const idPage = espace.pages[0] as string;
    const onglet = await ongletNeuf(espace.membre.cookie);
    await ajouterEtSynchroniser(onglet, idEspace);
    onglet.changer(APPAREIL, ESPACE_DE_CET_APPAREIL);
    await onglet.attendreLaSession();

    await serveur.retirerMembre(espace.proprietaire.cookie, idEspace, espace.membre.idCompte);

    const liste = await onglet.client.listerEspaces();
    expect(liste.ok).toBe(true);
    const duServeur = liste.ok ? liste.valeur.map((lu) => lu.idEspace) : [];
    expect(duServeur).not.toContain(idEspace);
    const relu = await onglet.appareil.sur(() => onglet.magasin.relire());
    // Base de la mention « Ne se synchronise plus avec ce compte » : une entrée au registre, et la
    // liste du serveur sans cet espace ; rien de la mention n'est inscrit sur l'appareil.
    expect(relu.autres.find((autre) => autre.idEspace === idEspace)?.entree).toEqual({
      rattachement: "adopte",
      droit: "ecriture",
    });
    expect(await contenuDeLAppareil(onglet.appareil)).not.toContain(MENTION_DETACHE);

    onglet.changer(ajoute(idEspace), espace.nom);
    const synchro = await onglet.attendreLaSynchronisation();
    await attendreLEtatAffiche(synchro, "detache");

    expect(synchro.lireEtat().detache).toBe(true);
    expect(titresDe(onglet)).toEqual(["Page gardée"]);
    const page = await onglet.afficherLaPage(idPage);
    expect(texteDeLaPage(page.doc)).toContain("CONTENU-GARDE");
  });
});
