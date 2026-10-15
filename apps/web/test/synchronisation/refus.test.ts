// Les couples (motif, canal) que les autres fichiers ne provoquent pas, sur le serveur réel
// (F-013-AC30, AC42) : chaque refus de connexion est lu par un client hors navigateur (son statut)
// puis subi par le module (F-013-AC19), et les fermetures et refus restants y sont provoqués.
import { randomBytes } from "node:crypto";
import { request } from "node:http";

import { demarrerServeurDEssai, type ServeurDEssai } from "@notionlike/server/essai";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  type CompteDEssai,
  compteDEssai,
  adopterEtAttendre,
  afficher,
  attendreLEtat,
  attendreQue,
  ecrireDansLaBase,
  ecrireDansLaPage,
  espacePartage,
  fermerLesOnglets,
  lireMessage,
  nouvelAppareil,
  type Onglet,
  ouvrirUnOnglet,
  pageDEssai,
  preparerLAppareil,
  TYPES_DE_MESSAGE,
} from "./aides-synchro.ts";

vi.setConfig({ testTimeout: 60_000 });

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

/** Le statut que le serveur écrit sur la demande de passage en WebSocket, lu hors navigateur. */
function statutDuPassage(
  cible: ServeurDEssai,
  entetes: { readonly cookie?: string; readonly origine?: string },
): Promise<number> {
  const adresse = new URL(cible.urlDeSynchro);
  return new Promise((resoudre, rejeter) => {
    const demande = request({
      host: adresse.hostname,
      port: adresse.port,
      path: adresse.pathname,
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
        Origin: entetes.origine ?? cible.urlPublique,
        ...(entetes.cookie === undefined ? {} : { Cookie: entetes.cookie }),
      },
    });
    demande.on("upgrade", (reponse, prise) => {
      prise.destroy();
      resoudre(reponse.statusCode ?? 101);
    });
    demande.on("response", (reponse) => {
      reponse.resume();
      resoudre(reponse.statusCode ?? 0);
    });
    demande.on("error", rejeter);
    demande.end();
  });
}

/** Un appareil où l'espace, créé sur le serveur, est déjà adopté (posé par le test, H4). */
async function ongletAdopte(
  cible: ServeurDEssai,
  cookie: string,
  idEspace: string,
  compte: CompteDEssai = compteDEssai(),
): Promise<Onglet> {
  const appareil = nouvelAppareil();
  await preparerLAppareil(appareil, idEspace, { rattachement: "adopte", droit: "ecriture" });
  return ouvrirUnOnglet({ serveur: cible, cookie, idEspace, appareil, rejoint: true, compte });
}

describe("refus de connexion : statut lu hors navigateur, conduite de F-013-AC19", () => {
  it("F-013-AC30 F-013-AC19 « non-authentifie » 401 : sans session, le compte est revérifié ; déconnecté, la synchronisation se met en pause", async () => {
    const proprietaire = await serveur.inscrire();
    const idEspace = await serveur.creerEspace(proprietaire.cookie);
    expect(await statutDuPassage(serveur, {})).toBe(401);

    const compte = compteDEssai("connecte");
    const onglet = await ongletAdopte(serveur, "", idEspace, compte);
    await attendreQue(() => onglet.synchro.lireEtat().refusDeConnexion);
    expect(compte.reverifications.length).toBeGreaterThan(0);
    compte.poser("deconnecte");
    await attendreLEtat(onglet, "pause");
  });

  it("F-013-AC30 F-013-AC19 « origine-refusee » 403 : une origine étrangère est refusée, le module ne l'affirme pas et réessaie", async () => {
    const membre = await serveur.inscrire();
    const idEspace = await serveur.creerEspace(membre.cookie);
    expect(
      await statutDuPassage(serveur, {
        cookie: membre.cookie,
        origine: "http://ailleurs.exemple",
      }),
    ).toBe(403);

    const compte = compteDEssai("connecte");
    const appareil = nouvelAppareil();
    await preparerLAppareil(appareil, idEspace, { rattachement: "adopte", droit: "ecriture" });
    const onglet = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace,
      appareil,
      rejoint: true,
      compte,
      origine: "http://ailleurs.exemple",
    });
    await attendreQue(() => onglet.synchro.lireEtat().refusDeConnexion);
    expect(onglet.synchro.lireEtat().affiche).toBe("erreur");
    expect(compte.reverifications.length).toBeGreaterThan(0);
    await attendreQue(() => onglet.reseau.ouvertes() >= 2, 5000);
  });

  it("F-013-AC30 F-013-AC19 « quota-atteint » 429 : au-delà des connexions du compte, « le serveur refuse la connexion », sans cause affirmée", async () => {
    const borne = await demarrerServeurDEssai({ reglages: { connexionsParCompte: 1 } });
    try {
      const membre = await borne.inscrire();
      const premier = await ouvrirUnOnglet({
        serveur: borne,
        cookie: membre.cookie,
        idEspace: crypto.randomUUID(),
      });
      await adopterEtAttendre(premier);
      expect(await statutDuPassage(borne, { cookie: membre.cookie })).toBe(429);

      const second = await ongletAdopte(borne, membre.cookie, premier.idEspace);
      await attendreQue(() => second.synchro.lireEtat().refusDeConnexion);
      expect(second.synchro.lireEtat().affiche).toBe("erreur");
      expect(second.compte.reverifications.length).toBeGreaterThan(0);
    } finally {
      fermerLesOnglets();
      await borne.fermer();
    }
  });

  it("F-013-AC30 F-013-AC19 « quota-atteint » 503 : au-delà des connexions du serveur, le refus est traité de même", async () => {
    const plein = await demarrerServeurDEssai({ reglages: { connexionsParServeur: 1 } });
    try {
      const premier = await plein.inscrire("premier");
      const autre = await plein.inscrire("autre");
      const onglet = await ouvrirUnOnglet({
        serveur: plein,
        cookie: premier.cookie,
        idEspace: crypto.randomUUID(),
      });
      await adopterEtAttendre(onglet);
      expect(await statutDuPassage(plein, { cookie: autre.cookie })).toBe(503);

      const idEspace = await plein.creerEspace(autre.cookie);
      const refuse = await ongletAdopte(plein, autre.cookie, idEspace);
      await attendreQue(() => refuse.synchro.lireEtat().refusDeConnexion);
      expect(refuse.synchro.lireEtat().affiche).toBe("erreur");
    } finally {
      fermerLesOnglets();
      await plein.fermer();
    }
  });

  it("F-013-AC30 F-013-AC19 « erreur-interne » 500 : une session illisible refuse la connexion ; rétablie, la synchronisation reprend d'elle-même", async () => {
    const membre = await serveur.inscrire();
    const idEspace = await serveur.creerEspace(membre.cookie);
    await serveur.base.db.execute(`alter table "session" rename to "session_cachee"`);
    let onglet: Onglet;
    try {
      expect(await statutDuPassage(serveur, { cookie: membre.cookie })).toBe(500);
      onglet = await ongletAdopte(serveur, membre.cookie, idEspace);
      await attendreQue(() => onglet.synchro.lireEtat().refusDeConnexion);
      expect(onglet.synchro.lireEtat().affiche).toBe("erreur");
    } finally {
      await serveur.base.db.execute(`alter table "session_cachee" rename to "session"`);
    }
    await attendreLEtat(onglet, "synchronise", 20_000);
  });
});

describe("fermetures et refus restants", () => {
  it("F-013-AC30 « erreur-interne » en fermeture d'ouverture : la page est rouverte selon la reprise, en erreur jusqu'à son acquisition", async () => {
    const membre = await serveur.inscrire();
    const onglet = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: crypto.randomUUID(),
    });
    const idPage = onglet.facade.creerPage("Réévaluée");
    await adopterEtAttendre(onglet);
    afficher(onglet, pageDEssai(idPage));
    // Sous la charge de toute la suite, le serveur d'essai répond lentement : délais larges.
    await attendreLEtat(onglet, "synchronise", 30_000);

    await serveur.base.db.execute(`alter table "adhesion" rename to "adhesion_cachee"`);
    try {
      serveur.horloge.avancer(serveur.reglages.periodeDeReverificationMs);
      await attendreQue(() =>
        onglet.synchro.lireEtat().documentsEnErreur.some(({ cause }) => cause === "erreur-interne"),
      );
      expect(onglet.synchro.lireEtat().affiche).toBe("erreur");
      expect(
        serveur
          .lignesDuJournal()
          .some((ligne) => ligne.type === "acces-retire" && ligne.motif === "erreur-interne"),
      ).toBe(true);
    } finally {
      await serveur.base.db.execute(`alter table "adhesion_cachee" rename to "adhesion"`);
    }
    await attendreLEtat(onglet, "synchronise", 30_000);
    expect(onglet.horloge.delais.some((delai) => delai >= 800)).toBe(true);
  });

  it("F-013-AC30 F-013-AC21 « erreur-interne » en fermeture de connexion (1008) : la raison décide, la connexion est reprise selon les délais", async () => {
    const membre = await serveur.inscrire();
    const onglet = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: crypto.randomUUID(),
    });
    await adopterEtAttendre(onglet);
    const ouvertes = onglet.reseau.ouvertes();

    await serveur.base.db.execute(`alter table "session" rename to "session_cachee"`);
    try {
      serveur.horloge.avancer(serveur.reglages.periodeDeReverificationMs);
      await attendreQue(() =>
        serveur
          .lignesDuJournal()
          .some(
            (ligne) =>
              ligne.type === "acces-retire" &&
              ligne.motif === "erreur-interne" &&
              ligne.code === 1008,
          ),
      );
      await attendreQue(() => onglet.synchro.lireEtat().affiche !== "synchronise");
    } finally {
      await serveur.base.db.execute(`alter table "session_cachee" rename to "session"`);
    }
    await attendreLEtat(onglet, "synchronise", 20_000);
    expect(onglet.reseau.ouvertes()).toBeGreaterThan(ouvertes);
    expect(onglet.synchro.lireEtat().detache).toBe(false);
  });

  it("F-013-AC30 F-013-AC23 « acces-refuse » en refus d'ouverture : retiré pendant une coupure, l'appareil le constate à la reconnexion et l'espace est détaché", async () => {
    const partage = await espacePartage(serveur, "editeur", ["Partagée"]);
    const { ailleurs } = partage;
    ailleurs.reseau.couper();
    await attendreQue(() => ailleurs.synchro.lireEtat().affiche !== "synchronise");
    await serveur.retirerMembre(
      partage.proprietaire.cookie,
      partage.idEspace,
      partage.membre.idCompte,
    );

    ailleurs.reseau.retablir();
    ailleurs.signaler("reseau");
    await attendreLEtat(ailleurs, "detache", 20_000);
    expect(
      serveur
        .lignesDuJournal()
        .some((ligne) => ligne.type === "ouverture-refusee" && ligne.motif === "acces-refuse"),
    ).toBe(true);
  });

  it("F-013-AC30 F-013-AC29 « quota-atteint » en fermeture d'ouverture : deux pages admises ensemble, l'affichée, enregistrée après l'autre, dépasse le plafond et est bloquée", async () => {
    const borne = await demarrerServeurDEssai({ reglages: { documentsParEspace: 2 } });
    try {
      const membre = await borne.inscrire();
      const onglet = await ouvrirUnOnglet({
        serveur: borne,
        cookie: membre.cookie,
        idEspace: crypto.randomUUID(),
      });
      await adopterEtAttendre(onglet);
      onglet.reseau.couper();
      await attendreQue(() => onglet.synchro.lireEtat().affiche !== "synchronise");
      const premiere = onglet.facade.creerPage("Première");
      const seconde = onglet.facade.creerPage("Seconde");
      // La seconde est échangée par la passe puis refermée : le serveur l'enregistre aussitôt. La
      // première, affichée, reste ouverte : son enregistrement, après elle, dépasse le plafond.
      await ecrireDansLaBase(onglet.appareil, onglet.idEspace, seconde, "deux");
      const affichee = pageDEssai(premiere);
      ecrireDansLaPage(affichee.doc, "un");
      afficher(onglet, affichee);

      onglet.reseau.retablir();
      onglet.signaler("reseau");
      await attendreQue(
        () =>
          onglet.synchro
            .lireEtat()
            .documentsEnErreur.some(({ cause }) => cause === "quota-atteint"),
        20_000,
      );
      // La raison d'une fermeture d'ouverture, dans le message de fermeture reçu (F-012 H8).
      expect(
        onglet.reseau.recus.some(
          (octets) =>
            lireMessage(octets).type === TYPES_DE_MESSAGE.fermeture &&
            new TextDecoder().decode(octets).includes("quota-atteint"),
        ),
      ).toBe(true);
    } finally {
      fermerLesOnglets();
      await borne.fermer();
    }
  });
});
