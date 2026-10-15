// Motifs du serveur, tels que le module les reçoit sur ses ouvertures (F-013-AC22, AC23, AC25 à
// AC27, AC29, AC30, AC45, AC47, AC42), contre le serveur réel.
import { demarrerServeurDEssai, type ServeurDEssai } from "@notionlike/server/essai";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { lireLeRegistre } from "../../src/persistance/index.ts";
import { LIMITES_SYNCHRO } from "@notionlike/contrats";

import { creerConnexion } from "../../src/synchronisation/connexion.ts";
import { ecrireLaVersion, lireLaVersion, VERSION_NON_PRISE_EN_CHARGE } from "../aides-format.ts";
import { DocumentSuivi } from "../../src/synchronisation/document-suivi.ts";
import { correspondance } from "../../src/synchronisation/noms.ts";
import {
  adopterEtAttendre,
  afficher,
  attendreLEtat,
  attendreQue,
  ecrireDansLaPage,
  espacePartage,
  fermerLesOnglets,
  horlogeDEssai,
  lectures,
  messagesDe,
  ouvrirUnOnglet,
  pageDEssai,
  pause,
  reseauDEssai,
  texteDeLaPage,
  TYPES_DE_MESSAGE,
} from "./aides-synchro.ts";

vi.setConfig({ testTimeout: 45_000 });

let serveur: ServeurDEssai;
beforeAll(async () => {
  serveur = await demarrerServeurDEssai();
});
afterAll(async () => {
  await serveur.fermer();
});
afterEach(() => {
  lectures.retenue = undefined;
  fermerLesOnglets();
});

function fermeturesPour(octets: readonly Uint8Array[], nom: string): number {
  return messagesDe(octets).filter(
    (message) => message.nom === nom && message.type === TYPES_DE_MESSAGE.fermeture,
  ).length;
}

function authentificationsPour(octets: readonly Uint8Array[], nom: string): number {
  return messagesDe(octets).filter(
    (message) => message.nom === nom && message.type === TYPES_DE_MESSAGE.authentification,
  ).length;
}

describe("espace détaché", () => {
  it("F-013-AC22 F-013-AC23 un retrait fait fermer les ouvertures par acces-refuse ; la lecture de l'espace répond 404 : l'espace est détaché, plus rien n'est rouvert ni envoyé, « Réessayer » rejoue la requête", async () => {
    const partage = await espacePartage(serveur, "editeur", ["Une page"]);
    const { ailleurs } = partage;

    await serveur.retirerMembre(
      partage.proprietaire.cookie,
      partage.idEspace,
      partage.membre.idCompte,
    );
    await attendreLEtat(ailleurs, "detache");
    const emis = ailleurs.reseau.emis.length;
    ailleurs.facade.creerPage("Après le retrait");
    await pause(1500);

    expect(ailleurs.reseau.emis.length).toBe(emis);
    expect(ailleurs.synchro.lireEtat().detache).toBe(true);
    expect(ailleurs.facade.lire().racines.map(({ titre }) => titre)).toContain("Après le retrait");
    ailleurs.synchro.reessayer();
    await pause(500);
    expect(ailleurs.synchro.lireEtat().affiche).toBe("detache");
  });

  it("F-013-AC22 si la lecture de l'espace répond 200, le rôle est retenu et le document rouvert une fois", async () => {
    const partage = await espacePartage(serveur, "editeur");
    const { ailleurs } = partage;
    let liberer = (): void => undefined;
    lectures.retenue = new Promise((resoudre) => {
      liberer = resoudre;
    });

    await serveur.retirerMembre(
      partage.proprietaire.cookie,
      partage.idEspace,
      partage.membre.idCompte,
    );
    await attendreQue(() =>
      ailleurs.synchro.lireEtat().documentsEnErreur.some(({ cause }) => cause === "acces-refuse"),
    );
    await serveur.ajouterMembre(
      partage.proprietaire.cookie,
      partage.idEspace,
      partage.membre.cookie,
      "lecteur",
    );
    liberer();

    await attendreLEtat(ailleurs, "synchronise", 12_000);
    expect(ailleurs.synchro.lireEtat()).toMatchObject({ detache: false, droit: "lecture" });
  });
});

describe("droits modifiés", () => {
  it("F-013-AC26 F-013-AC45 promu, le lecteur rouvre sans reconnexion ni message de fermeture, et sa frappe suivante est transmise ; rétrogradé, il repasse en lecture seule ; un retour de visibilité n'émet aucune demande d'ouverture", async () => {
    const partage = await espacePartage(serveur, "lecteur", ["Commune"]);
    const { ailleurs, chez } = partage;
    const nom = correspondance("espace", partage.idEspace).nomDeDocument;
    expect(ailleurs.synchro.lireEtat().droit).toBe("lecture");
    const fermetures = fermeturesPour(ailleurs.reseau.emis, nom);
    const connexions = ailleurs.reseau.ouvertes();

    await serveur.changerRole(
      partage.proprietaire.cookie,
      partage.idEspace,
      partage.membre.idCompte,
      "editeur",
    );
    await attendreQue(() => ailleurs.synchro.lireEtat().droit === "ecriture");

    expect(ailleurs.synchro.lireEtat().droitChange).toBe("ecriture");
    expect(fermeturesPour(ailleurs.reseau.emis, nom)).toBe(fermetures);
    expect(ailleurs.reseau.ouvertes()).toBe(connexions);
    await attendreQue(async () => {
      const lu = await ailleurs.appareil.sur(() => lireLeRegistre(partage.idEspace));
      return lu.issue === "lu" && lu.entree?.droit === "ecriture";
    });
    ailleurs.facade.creerPage("Écrite après la promotion");
    await attendreQue(() =>
      chez.facade.lire().racines.some(({ titre }) => titre === "Écrite après la promotion"),
    );
    await attendreLEtat(ailleurs, "synchronise");

    // 2 secondes plus tard, l'ouverture rouverte reçoit encore les mises à jour d'un autre client.
    await pause(2000);
    chez.facade.creerPage("Reçue après la réouverture");
    await attendreQue(() =>
      ailleurs.facade.lire().racines.some(({ titre }) => titre === "Reçue après la réouverture"),
    );

    await serveur.changerRole(
      partage.proprietaire.cookie,
      partage.idEspace,
      partage.membre.idCompte,
      "lecteur",
    );
    await attendreQue(() => ailleurs.synchro.lireEtat().droit === "lecture");
    expect(ailleurs.synchro.lireEtat().droitChange).toBe("lecture");
    expect(fermeturesPour(ailleurs.reseau.emis, nom)).toBe(fermetures);

    await attendreLEtat(ailleurs, "synchronise");
    const authentifications = authentificationsPour(ailleurs.reseau.emis, nom);
    ailleurs.signaler("visible");
    await pause(800);
    expect(authentificationsPour(ailleurs.reseau.emis, nom)).toBe(authentifications);
  });

  it("F-013-AC25 F-013-AC27 rétrogradé pendant qu'il était hors ligne avec des modifications, l'appareil le constate de lui-même : copie divergente, jamais « Synchronisé », plus rien de proposé", async () => {
    const partage = await espacePartage(serveur, "editeur", ["Commune"]);
    const { ailleurs } = partage;
    ailleurs.reseau.couper();
    await attendreQue(() => ailleurs.synchro.lireEtat().affiche !== "synchronise");
    ailleurs.facade.creerPage("Faite hors ligne");
    await serveur.changerRole(
      partage.proprietaire.cookie,
      partage.idEspace,
      partage.membre.idCompte,
      "lecteur",
    );

    ailleurs.reseau.retablir();
    ailleurs.signaler("reseau");
    const reconnexion = Date.now();
    await attendreQue(() => ailleurs.synchro.lireEtat().divergentes.length > 0, 12_000);

    const etat = ailleurs.synchro.lireEtat();
    expect(etat).toMatchObject({ affiche: "erreur", droit: "lecture" });
    expect(etat.divergentes).toContain(undefined);
    // Rien de ce qui a été fait hors ligne n'est plus proposé au serveur.
    const emis = ailleurs.reseau.emis.length;
    await pause(2000);
    const proposes = ailleurs.reseau.emis
      .slice(emis)
      .filter((octets) => new TextDecoder().decode(octets).includes("Faite hors ligne"));
    expect(proposes).toEqual([]);
    expect(ailleurs.synchro.lireEtat().affiche).not.toBe("synchronise");
    expect(Date.now() - reconnexion).toBeGreaterThan(0);
  });
});

describe("envoi bloqué", () => {
  it("F-013-AC29 F-013-AC45 « document-trop-grand » : la page est bloquée, sans réouverture ni message de fermeture ; quittée puis reprise, « Réessayer » obtient une ouverture accordée qui reçoit l'état", async () => {
    const petit = await demarrerServeurDEssai({ reglages: { octetsParDocument: 4096 } });
    try {
      const membre = await petit.inscrire();
      const onglet = await ouvrirUnOnglet({
        serveur: petit,
        cookie: membre.cookie,
        idEspace: crypto.randomUUID(),
      });
      const idPage = onglet.facade.creerPage("Grande");
      await adopterEtAttendre(onglet);
      const page = pageDEssai(idPage);
      afficher(onglet, page);
      await attendreLEtat(onglet, "synchronise");
      const nom = correspondance("page", onglet.idEspace, idPage).nomDeDocument;
      // La passe de fond a déjà ouvert et refermé cette page : seules comptent les fermetures à venir.
      const fermetures = fermeturesPour(onglet.reseau.emis, nom);

      ecrireDansLaPage(page.doc, "x".repeat(8000));
      await attendreQue(() =>
        onglet.synchro
          .lireEtat()
          .documentsEnErreur.some(({ cause }) => cause === "document-trop-grand"),
      );
      const authentifications = authentificationsPour(onglet.reseau.emis, nom);
      await pause(1500);
      expect(authentificationsPour(onglet.reseau.emis, nom)).toBe(authentifications);
      expect(fermeturesPour(onglet.reseau.emis, nom)).toBe(fermetures);
      expect(texteDeLaPage(page.doc)).toContain("x".repeat(8000));

      afficher(onglet, undefined);
      afficher(onglet, page);
      const recus = onglet.reseau.recus.length;
      onglet.synchro.reessayerLeDocument(idPage);
      await attendreQue(() => authentificationsPour(onglet.reseau.emis, nom) > authentifications);
      await attendreQue(() =>
        messagesDe(onglet.reseau.recus.slice(recus)).some(
          (message) => message.nom === nom && message.type === TYPES_DE_MESSAGE.synchronisation,
        ),
      );
      expect(fermeturesPour(onglet.reseau.emis, nom)).toBe(fermetures);
    } finally {
      fermerLesOnglets();
      await petit.fermer();
    }
  });

  it("F-013-AC29 « quota-atteint » : le document qui dépasse le nombre de documents de l'espace est bloqué, les autres continuent", async () => {
    const borne = await demarrerServeurDEssai({ reglages: { documentsParEspace: 1 } });
    try {
      const membre = await borne.inscrire();
      const onglet = await ouvrirUnOnglet({
        serveur: borne,
        cookie: membre.cookie,
        idEspace: crypto.randomUUID(),
      });
      const premiere = onglet.facade.creerPage("Première");
      const seconde = onglet.facade.creerPage("Seconde");
      await attendreQue(() => onglet.synchro.lireEtat().registreLu);
      await onglet.synchro.adopter("Espace");
      afficher(onglet, pageDEssai(premiere));
      const pageSeconde = pageDEssai(seconde);
      await attendreQue(() => onglet.synchro.lireEtat().affiche !== "local");
      ecrireDansLaPage(pageSeconde.doc, "texte");
      afficher(onglet, pageSeconde);

      await attendreQue(
        () =>
          onglet.synchro
            .lireEtat()
            .documentsEnErreur.some(({ cause }) => cause === "quota-atteint"),
        15_000,
      );
      onglet.facade.creerPage("Encore transmise");
      await attendreQue(async () => {
        const instantane = await borne.lireInstantane(
          correspondance("espace", onglet.idEspace).nomDeDocument,
        );
        // Les chaînes d'une mise à jour Yjs y sont en UTF-8 : le titre se lit dans l'instantané.
        return (
          instantane !== undefined &&
          new TextDecoder().decode(instantane).includes("Encore transmise")
        );
      }, 15_000);
    } finally {
      fermerLesOnglets();
      await borne.fermer();
    }
  });

  it("F-013-AC47 F-013-AC45 « version-refusee » : envoi bloqué, aucune demande d'ouverture pendant 2 secondes, la version locale n'est ni abaissée ni retirée", async () => {
    const membre = await serveur.inscrire();
    const onglet = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: crypto.randomUUID(),
    });
    await adopterEtAttendre(onglet);
    const nom = correspondance("espace", onglet.idEspace).nomDeDocument;

    ecrireLaVersion(onglet.facade.doc, VERSION_NON_PRISE_EN_CHARGE);
    const avant = Y.encodeStateAsUpdate(onglet.facade.doc);
    await attendreQue(() =>
      onglet.synchro.lireEtat().documentsEnErreur.some(({ cause }) => cause === "version-refusee"),
    );
    const authentifications = authentificationsPour(onglet.reseau.emis, nom);
    await pause(2000);

    expect(authentificationsPour(onglet.reseau.emis, nom)).toBe(authentifications);
    expect(fermeturesPour(onglet.reseau.emis, nom)).toBe(0);
    expect(onglet.synchro.lireEtat().affiche).toBe("erreur");
    expect(Y.encodeStateAsUpdate(onglet.facade.doc)).toEqual(avant);
    expect(lireLaVersion(onglet.facade.doc)).toBe(VERSION_NON_PRISE_EN_CHARGE);
  });
});

describe("autres motifs", () => {
  it("F-013-AC30 « erreur-interne » : l'ouverture est rouverte selon les délais de la reprise, l'état d'erreur tient jusqu'à son acquisition", async () => {
    let enPanne = false;
    const fragile = await demarrerServeurDEssai({
      defaillance: (operation, nomDuDocument) => {
        if (enPanne && operation === "chargement" && nomDuDocument.startsWith("page:")) {
          throw new Error("panne");
        }
      },
    });
    try {
      const membre = await fragile.inscrire();
      const onglet = await ouvrirUnOnglet({
        serveur: fragile,
        cookie: membre.cookie,
        idEspace: crypto.randomUUID(),
      });
      const idPage = onglet.facade.creerPage("Fragile");
      await adopterEtAttendre(onglet);
      enPanne = true;
      afficher(onglet, pageDEssai(idPage));

      await attendreQue(() =>
        onglet.synchro.lireEtat().documentsEnErreur.some(({ cause }) => cause === "erreur-interne"),
      );
      expect(onglet.synchro.lireEtat().affiche).toBe("erreur");
      enPanne = false;
      await attendreLEtat(onglet, "synchronise", 15_000);
    } finally {
      fermerLesOnglets();
      await fragile.fermer();
    }
  });

  it("F-013-AC30 « nom-de-document-invalide » : le document est en envoi bloqué, sans réouverture", async () => {
    const membre = await serveur.inscrire();
    const reseau = reseauDEssai(serveur, membre.cookie);
    const horloge = horlogeDEssai();
    const nom = "page:pas-un-identifiant";
    let suivi: DocumentSuivi | undefined;
    const connexion = creerConnexion({
      environnement: { WebSocket: reseau.WebSocket, adresse: serveur.urlDeSynchro, horloge },
      limiteDeMessage: LIMITES_SYNCHRO.octetsParMessage,
      fenetreDesMessagesMs: LIMITES_SYNCHRO.fenetreDesMessagesMs,
      surEtablie: (prise) => {
        suivi = new DocumentSuivi(nom, "pas-un-identifiant", new Y.Doc(), {
          prise: () => prise,
          horloge,
          alea: () => 0,
          verifierLEspace: () => Promise.resolve("membre"),
          surAcquise: () => undefined,
          surChangement: () => undefined,
          blocage: () => undefined,
          noterLeBlocage: () => undefined,
        });
        suivi.ouvrir();
      },
      surFermee: () => undefined,
      surMessageTropGrand: () => undefined,
    });
    try {
      connexion.tenter();
      await attendreQue(() => suivi?.erreur() !== undefined);

      expect(suivi?.erreur()).toEqual({
        idPage: "pas-un-identifiant",
        cause: "motif-inconnu",
        reessayable: true,
      });
      await pause(1500);
      expect(authentificationsPour(reseau.emis, nom)).toBe(1);
      expect(fermeturesPour(reseau.emis, nom)).toBe(0);
    } finally {
      suivi?.fermer();
      connexion.fermer();
    }
  });
});
