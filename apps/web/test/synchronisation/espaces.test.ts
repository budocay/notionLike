// F-032, sur le serveur réel de la fabrique d'essai (F-032-AC33) : attente d'acquittement avant un
// changement d'espace, à horloge injectée (AC12) ; fermeture complète de l'espace quitté avant la
// première ouverture de l'espace choisi, constatée par le serveur (AC15) ; aucune WebSocket pour un
// espace `local` ni sans compte connecté, d'un espace à l'autre (AC24).
import {
  demarrerServeurDEssai,
  type LigneDeJournal,
  type ServeurDEssai,
} from "@notionlike/server/essai";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { StatutDuCompte } from "../../src/synchronisation/index.ts";
import { fermerLesOngletsReels, lancerUnOnglet } from "./aides-onglet-reel.ts";
import {
  adopterEtAttendre,
  afficher,
  attendreLEtat,
  attendreQue,
  compteDEssai,
  ecrireDansLaPage,
  fermerLesOnglets,
  horlogeDEssai,
  nouvelAppareil,
  type Onglet,
  ouvrirUnOnglet,
  pageDEssai,
  pause,
  preparerLAppareil,
  requetesVues,
  reseauDEssai,
} from "./aides-synchro.ts";

vi.setConfig({ testTimeout: 60_000 });

const ATTENTE_MS = 2000;
const FERMANTE = 2;
const FERMEE = 3;

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

/** Ce que l'interface ferme de l'espace quitté avant d'ouvrir l'espace choisi (`avant()`). */
function quitter(onglet: Onglet): void {
  onglet.synchro.fermer();
  onglet.persistance.fermer();
  onglet.facade.fermer();
}

describe("attente d'acquittement avant un changement d'espace (F-032-AC12)", () => {
  it("F-032-AC12 connexion établie, aucune modification en attente : `acquitte` aussitôt, sans rien programmer", async () => {
    const membre = await serveur.inscrire();
    const onglet = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: crypto.randomUUID(),
    });
    await adopterEtAttendre(onglet);
    const programmes = onglet.horloge.delais.length;

    expect(await onglet.synchro.attendreLAcquittement(ATTENTE_MS)).toBe("acquitte");
    expect(onglet.horloge.delais.slice(programmes)).not.toContain(ATTENTE_MS);
  });

  it("F-032-AC12 connexion établie, modification en attente : `acquitte` dès que le serveur l'acquitte, avant l'échéance", async () => {
    const membre = await serveur.inscrire();
    const onglet = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: crypto.randomUUID(),
    });
    await adopterEtAttendre(onglet);

    onglet.facade.creerPage("Juste avant le changement");
    const attente = onglet.synchro.attendreLAcquittement(ATTENTE_MS);

    expect(await attente).toBe("acquitte");
    expect(onglet.synchro.toutEstAcquitte()).toBe(true);
  });

  it("F-032-AC12 connexion établie, accusés perdus : `non-acquitte` à l'échéance de 2 secondes de l'horloge injectée, pas avant", async () => {
    const membre = await serveur.inscrire();
    const horloge = horlogeDEssai();
    const onglet = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: crypto.randomUUID(),
      horloge,
    });
    await adopterEtAttendre(onglet);
    onglet.reseau.accusesPerdus = true;

    onglet.facade.creerPage("Jamais acquittée");
    let issue: string | undefined;
    void onglet.synchro.attendreLAcquittement(ATTENTE_MS).then((fin) => {
      issue = fin;
    });
    // L'horloge d'essai suit aussi le temps réel : l'avance laisse une marge à ce qui s'écoule.
    horloge.avancer(ATTENTE_MS / 2);
    await pause(50);
    expect(issue).toBeUndefined();

    horloge.avancer(ATTENTE_MS / 2);
    await attendreQue(() => issue !== undefined);
    expect(issue).toBe("non-acquitte");
    expect(horloge.delais).toContain(ATTENTE_MS);
  });

  it("F-032-AC12 synchronisation fermée pendant l'attente : `non-acquitte`", async () => {
    const membre = await serveur.inscrire();
    const onglet = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: crypto.randomUUID(),
    });
    await adopterEtAttendre(onglet);
    onglet.reseau.accusesPerdus = true;
    onglet.facade.creerPage("En attente");

    const pendant = onglet.synchro.attendreLAcquittement(ATTENTE_MS);
    onglet.synchro.fermer();

    expect(await pendant).toBe("non-acquitte");
  });

  it.each([
    ["compte déconnecté", "compte"],
    ["réseau coupé", "reseau"],
  ] as const)(
    "F-032-AC12 adopté, connexion non établie (%s), rien en attente, une modification acquittée avant la coupure : `acquitte` aussitôt, sans rien programmer, d'où un changement sans boîte",
    async (_, coupure) => {
      const membre = await serveur.inscrire();
      const compte = compteDEssai();
      const onglet = await ouvrirUnOnglet({
        serveur,
        cookie: membre.cookie,
        idEspace: crypto.randomUUID(),
        compte,
      });
      await adopterEtAttendre(onglet);
      onglet.facade.creerPage("Acquittée avant la coupure");
      await attendreQue(() => onglet.synchro.toutEstAcquitte());
      await attendreLEtat(onglet, "synchronise");
      if (coupure === "compte") {
        compte.poser("deconnecte");
        await attendreLEtat(onglet, "pause");
      } else {
        onglet.reseau.couper();
        await attendreQue(() =>
          ["hors-ligne", "connexion"].includes(onglet.synchro.lireEtat().affiche),
        );
      }
      const programmes = onglet.horloge.delais.length;

      expect(await onglet.synchro.attendreLAcquittement(ATTENTE_MS)).toBe("acquitte");
      expect(onglet.horloge.delais.slice(programmes)).not.toContain(ATTENTE_MS);
    },
  );

  it("F-032-AC12 page affichée modifiée sans connexion : `non-acquitte` aussitôt ; la connexion rétablie et la frappe acquittée, `acquitte`", async () => {
    const membre = await serveur.inscrire();
    const compte = compteDEssai();
    const onglet = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: crypto.randomUUID(),
      compte,
    });
    const page = pageDEssai(onglet.facade.creerPage("Affichée"));
    await adopterEtAttendre(onglet);
    afficher(onglet, page);
    await attendreLEtat(onglet, "synchronise");
    compte.poser("deconnecte");
    await attendreLEtat(onglet, "pause");

    onglet.appareil.sur(() => ecrireDansLaPage(page.doc, "FRAPPE-HORS-CONNEXION"));

    expect(await onglet.synchro.attendreLAcquittement(ATTENTE_MS)).toBe("non-acquitte");
    compte.poser("connecte");
    await attendreLEtat(onglet, "synchronise");
    expect(await onglet.synchro.attendreLAcquittement(ATTENTE_MS)).toBe("acquitte");
  });

  it("F-032-AC12 connexion non établie, document d'espace modifié depuis : `non-acquitte` aussitôt (H6)", async () => {
    const membre = await serveur.inscrire();
    const compte = compteDEssai();
    const onglet = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: crypto.randomUUID(),
      compte,
    });
    await adopterEtAttendre(onglet);
    compte.poser("deconnecte");
    await attendreLEtat(onglet, "pause");

    onglet.facade.creerPage("Sans connexion");

    expect(await onglet.synchro.attendreLAcquittement(ATTENTE_MS)).toBe("non-acquitte");
  });
});

describe("fermeture complète de l'espace quitté (F-032-AC15)", () => {
  it("F-032-AC15 F-032-AC14 changement par le pilote réel, avec le `avant()` de l'interface : le serveur constate la fermeture de la connexion de l'espace quitté au plus 2 secondes après le changement, avant toute connexion de l'espace choisi, qui s'ouvre sur une connexion neuve", async () => {
    const membre = await serveur.inscrire();
    const appareil = nouvelAppareil();
    const reseau = reseauDEssai(serveur, membre.cookie);
    const quitte = await serveur.creerEspace(membre.cookie);
    const choisi = await serveur.creerEspace(membre.cookie);
    await preparerLAppareil(appareil, crypto.randomUUID());
    for (const idEspace of [quitte, choisi]) {
      await preparerLAppareil(appareil, idEspace, { rattachement: "adopte", droit: "ecriture" });
    }
    const onglet = await lancerUnOnglet({ serveur, cookie: membre.cookie, appareil, reseau });
    await onglet.attendreLaSession();
    onglet.changer({ sorte: "ajoute", idEspace: quitte }, "Quitté");
    const deLEspaceQuitte = await onglet.attendreLaSynchronisation();
    await attendreQue(
      () => deLEspaceQuitte.lireEtat().affiche === "synchronise",
      30_000,
      "espace quitté synchronisé",
    );
    expect(reseau.ouvertes()).toBeGreaterThan(0);
    const avantLeChangement = serveur.lignesDuJournal().length;
    const constructions = reseau.etatsDesPrecedentes.length;
    const deCetOnglet = (): LigneDeJournal[] =>
      serveur
        .lignesDuJournal()
        .slice(avantLeChangement)
        .filter((ligne) => ligne.idCompte === membre.idCompte);

    const instantDuChangement = Date.now();
    onglet.changer({ sorte: "ajoute", idEspace: choisi }, "Choisi");

    expect(onglet.ouvert().espace.cible).toEqual({ sorte: "ajoute", idEspace: choisi });
    await attendreQue(
      () => deCetOnglet().some((ligne) => ligne.type === "connexion-fermee"),
      ATTENTE_MS + 3000,
      "fermeture constatée par le serveur",
    );
    const fermeture = deCetOnglet().find((ligne) => ligne.type === "connexion-fermee");
    const ecartMs = Date.parse(String(fermeture?.time)) - instantDuChangement;
    expect(ecartMs).toBeGreaterThanOrEqual(0);
    expect(ecartMs).toBeLessThanOrEqual(ATTENTE_MS);
    const deLEspaceChoisi = await onglet.attendreLaSynchronisation();
    await attendreQue(
      () => deLEspaceChoisi.lireEtat().affiche === "synchronise",
      30_000,
      "espace choisi synchronisé",
    );
    const types = deCetOnglet()
      .map((ligne) => ligne.type)
      .filter((type) => type === "connexion-fermee" || type === "connexion-etablie");
    expect(types[0]).toBe("connexion-fermee");
    expect(types).toContain("connexion-etablie");
    const premiereDeLEspaceChoisi = reseau.etatsDesPrecedentes[constructions];
    expect(premiereDeLEspaceChoisi).toBeDefined();
    expect(premiereDeLEspaceChoisi?.every((etat) => etat === FERMANTE || etat === FERMEE)).toBe(
      true,
    );
    expect(reseau.adresses.slice(constructions).length).toBeGreaterThan(0);
  });
});

describe("hors ligne et compte non connecté, d'un espace à l'autre (F-032-AC24)", () => {
  it.each<StatutDuCompte>(["connecte", "deconnecte", "inconnu"])(
    "F-032-AC24 compte %s : de l'espace de l'appareil `local` à un espace `adopte`, puis retour ; aucune WebSocket ni requête pour l'espace `local`, aucune sans compte connecté",
    async (statut) => {
      const membre = await serveur.inscrire();
      const appareil = nouvelAppareil();
      const local = crypto.randomUUID();
      const adopte = await serveur.creerEspace(membre.cookie);
      await preparerLAppareil(appareil, local);
      await preparerLAppareil(appareil, adopte, { rattachement: "adopte", droit: "ecriture" });
      const compte = compteDEssai(statut);
      const requetes = requetesVues.length;
      const reseaux: ReturnType<typeof reseauDEssai>[] = [];

      for (const [idEspace, autreEspace] of [
        [local, false],
        [adopte, true],
        [local, false],
      ] as const) {
        const reseau = reseauDEssai(serveur, membre.cookie);
        reseaux.push(reseau);
        const onglet = await ouvrirUnOnglet({
          serveur,
          cookie: membre.cookie,
          idEspace,
          appareil,
          reseau,
          compte,
          autreEspace,
          rejoint: autreEspace,
        });
        await attendreQue(() => onglet.synchro.lireEtat().registreLu);
        await pause(800);
        quitter(onglet);
      }

      const [versLocal, versAdopte, retour] = reseaux.map((reseau) => reseau.ouvertes());
      expect(versLocal).toBe(0);
      expect(retour).toBe(0);
      expect(versAdopte === 0).toBe(statut !== "connecte");
      const portees = requetesVues
        .slice(requetes)
        .filter((requete) => JSON.stringify(requete).includes(local));
      expect(portees).toEqual([]);
      if (statut !== "connecte") {
        expect(requetesVues.slice(requetes)).toEqual([]);
      }
    },
  );
});
