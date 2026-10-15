// Connexion de l'onglet, reprise, refus et fermetures par le serveur réel (F-013-AC17 à AC21,
// AC33, AC42).
import { demarrerServeurDEssai, type ServeurDEssai } from "@notionlike/server/essai";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ECHEANCE_D_UNE_TENTATIVE_MS } from "../../src/synchronisation/connexion.ts";
import { correspondance } from "../../src/synchronisation/noms.ts";
import {
  ATTENTE_PLAFOND_MS,
  attenteApres,
  INTERVALLE_MINIMAL_MS,
  PREMIERE_ATTENTE_MS,
} from "../../src/synchronisation/reprise.ts";
import { ATTENTE_D_ACQUITTEMENT_MS } from "../../src/synchronisation/synchronisation.ts";
import {
  adopterEtAttendre,
  afficher,
  attendreLEtat,
  attendreQue,
  compteDEssai,
  ecrireDansLaPage,
  fermerLesOnglets,
  horlogeDEssai,
  messagesDe,
  ouvrirUnOnglet,
  pageDEssai,
  pause,
  suivreLesEtats,
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
  fermerLesOnglets();
});

describe("une connexion par onglet", () => {
  it("F-013-AC17 le document d'espace, la page affichée et la passe de fond partagent une seule connexion ; la page quittée est refermée après l'accusé de ses modifications", async () => {
    const membre = await serveur.inscrire();
    const idEspace = crypto.randomUUID();
    const onglet = await ouvrirUnOnglet({ serveur, cookie: membre.cookie, idEspace });
    const premiere = onglet.facade.creerPage("Première");
    const seconde = onglet.facade.creerPage("Seconde");
    onglet.facade.creerPage("Troisième");
    await adopterEtAttendre(onglet);
    const pageA = pageDEssai(premiere);
    afficher(onglet, pageA);
    await attendreLEtat(onglet, "synchronise");
    ecrireDansLaPage(pageA.doc, "texte de la première");

    afficher(onglet, pageDEssai(seconde));
    await attendreLEtat(onglet, "synchronise");

    expect(onglet.reseau.ouvertes()).toBe(1);
    const nomA = correspondance("page", idEspace, premiere).nomDeDocument;
    const messages = messagesDe(onglet.reseau.emis);
    const fermeture = messages.findLastIndex(
      ({ nom, type }) => nom === nomA && type === TYPES_DE_MESSAGE.fermeture,
    );
    const derniereMiseAJour = messages.findLastIndex(
      ({ nom, type }) => nom === nomA && type === TYPES_DE_MESSAGE.synchronisation,
    );
    expect(fermeture).toBeGreaterThan(derniereMiseAJour);
    const instantane = await serveur.lireInstantane(nomA);
    await attendreQue(async () => (await serveur.lireInstantane(nomA)) !== instantane, 15_000);
  });
});

describe("ouverture acquise à l'état du document", () => {
  it("F-013-AC18 un « authenticated » suivi d'un refus d'ouverture erreur-interne ne fait jamais passer l'état par « Synchronisé »", async () => {
    let enPanne = true;
    const fragile = await demarrerServeurDEssai({
      defaillance: (operation, nom) => {
        if (enPanne && operation === "chargement" && nom.startsWith("espace:")) {
          throw new Error("chargement en panne");
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
      const etats = suivreLesEtats(onglet);
      await attendreQue(() => onglet.synchro.lireEtat().registreLu);
      await onglet.synchro.adopter("Espace");
      await attendreQue(() =>
        onglet.synchro.lireEtat().documentsEnErreur.some(({ cause }) => cause === "erreur-interne"),
      );

      expect(onglet.synchro.lireEtat().affiche).toBe("erreur");
      expect(etats).not.toContain("synchronise");
      enPanne = false;
      await attendreLEtat(onglet, "synchronise", 15_000);
    } finally {
      fermerLesOnglets();
      await fragile.fermer();
    }
  });
});

describe("refus de connexion, cause invisible", () => {
  it("F-013-AC19 compte connecté : « Synchronisation en erreur », nouvel essai selon la reprise", async () => {
    const membre = await serveur.inscrire();
    const compte = compteDEssai("connecte");
    const onglet = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: crypto.randomUUID(),
      compte,
      origine: "http://ailleurs.exemple",
    });
    await attendreQue(() => onglet.synchro.lireEtat().registreLu);
    await onglet.synchro.adopter("Espace");

    await attendreQue(() => onglet.synchro.lireEtat().refusDeConnexion);
    expect(onglet.synchro.lireEtat().affiche).toBe("erreur");
    expect(compte.reverifications.length).toBeGreaterThan(0);
    await attendreQue(() => onglet.reseau.ouvertes() >= 2, 4000);
  });

  it("F-013-AC19 compte déconnecté : « Synchronisation en pause », plus aucune tentative ; compte inconnu : « Hors ligne », nouvel essai", async () => {
    const membre = await serveur.inscrire();
    const compte = compteDEssai("connecte");
    const onglet = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: crypto.randomUUID(),
      compte,
      origine: "http://ailleurs.exemple",
    });
    await attendreQue(() => onglet.synchro.lireEtat().registreLu);
    await onglet.synchro.adopter("Espace");
    await attendreQue(() => onglet.synchro.lireEtat().refusDeConnexion);

    compte.poser("deconnecte");
    await attendreLEtat(onglet, "pause");
    const tentatives = onglet.reseau.ouvertes();
    await pause(2500);
    expect(onglet.reseau.ouvertes()).toBe(tentatives);

    compte.poser("inconnu");
    await attendreLEtat(onglet, "hors-ligne");
    await pause(2500);
    expect(onglet.reseau.ouvertes()).toBe(tentatives);
    expect(compte.reverifications.length).toBeGreaterThan(1);
  });
});

describe("reprise", () => {
  it("F-013-AC20 les délais : 1 seconde, puis le double à chaque échec, 30 secondes au plus, un aléa de 20 % au plus, jamais moins d'une seconde", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10].map((echecs) => attenteApres(echecs, 0))).toEqual([
      1000, 2000, 4000, 8000, 16_000, 30_000, 30_000, 30_000,
    ]);
    for (const echecs of [0, 1, 4, 5, 9]) {
      const sansAlea = attenteApres(echecs, 0);
      const plusPetit = attenteApres(echecs, 0.999_999);
      expect(plusPetit).toBeGreaterThanOrEqual(Math.max(INTERVALLE_MINIMAL_MS, sansAlea * 0.8));
      expect(plusPetit).toBeLessThanOrEqual(sansAlea);
    }
    expect(PREMIERE_ATTENTE_MS).toBe(1000);
    expect(ATTENTE_PLAFOND_MS).toBe(30_000);
  });

  it("F-013-AC20 connexion perdue puis refusée, les tentatives suivent les délais réglés par le module, horloge injectée ; le retour du réseau fait tenter aussitôt", async () => {
    const membre = await serveur.inscrire();
    const horloge = horlogeDEssai();
    const onglet = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: crypto.randomUUID(),
      horloge,
      alea: () => 0,
    });
    await adopterEtAttendre(onglet);
    // Les rappels programmés par la reprise ; l'échéance d'une tentative n'en est pas un.
    const reprises = (): number[] =>
      horloge.delais.filter((delai) => delai !== ECHEANCE_D_UNE_TENTATIVE_MS);
    const depart = reprises().length;
    onglet.reseau.couper();
    const programmes: number[] = [];
    for (let rang = 0; rang < 6; rang += 1) {
      await attendreQue(() => reprises().length > depart + rang);
      const attente = reprises()[depart + rang] ?? 0;
      programmes.push(attente);
      const avant = onglet.reseau.ouvertes();
      horloge.avancer(attente);
      await attendreQue(() => onglet.reseau.ouvertes() === avant + 1);
    }
    expect(onglet.synchro.lireEtat().refusDeConnexion).toBe(true);

    expect(programmes).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000]);
    onglet.reseau.retablir();
    const avant = onglet.reseau.ouvertes();
    horloge.avancer(INTERVALLE_MINIMAL_MS);
    onglet.signaler("reseau");
    await attendreQue(() => onglet.reseau.ouvertes() === avant + 1);
    await attendreLEtat(onglet, "synchronise");
  });

  it("F-013-AC20 une fermeture 1001 (arrêt du serveur) est une perte ordinaire : la connexion revient quand le serveur redémarre", async () => {
    const membre = await serveur.inscrire();
    const onglet = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: crypto.randomUUID(),
    });
    onglet.facade.creerPage("Avant l'arrêt");
    await adopterEtAttendre(onglet);

    await serveur.arreter();
    await attendreLEtat(onglet, "hors-ligne");
    onglet.facade.creerPage("Pendant l'arrêt");
    await serveur.redemarrer();

    await attendreLEtat(onglet, "synchronise", 20_000);
  });
});

describe("fermetures de connexion par le serveur", () => {
  it("F-013-AC21 une fermeture « non-authentifie » fait revérifier le compte, qui décide : déconnecté, la synchronisation se met en pause", async () => {
    const vigilant = await demarrerServeurDEssai({ reglages: { periodeDeReverificationMs: 500 } });
    try {
      const membre = await vigilant.inscrire();
      const compte = compteDEssai("connecte");
      const onglet = await ouvrirUnOnglet({
        serveur: vigilant,
        cookie: membre.cookie,
        idEspace: crypto.randomUUID(),
        compte,
      });
      await adopterEtAttendre(onglet);
      const avant = compte.reverifications.length;

      await vigilant.appeler("POST", "/api/auth/sign-out", { cookie: membre.cookie });
      compte.poser("deconnecte");

      await attendreLEtat(onglet, "pause", 10_000);
      expect(compte.reverifications.length).toBeGreaterThanOrEqual(avant);
      const tentatives = onglet.reseau.ouvertes();
      await pause(1500);
      expect(onglet.reseau.ouvertes()).toBe(tentatives);
    } finally {
      fermerLesOnglets();
      await vigilant.fermer();
    }
  });

  it("F-013-AC21 une fermeture « trop-de-requetes » fait attendre 10 secondes au moins avant de se reconnecter", async () => {
    const etroit = await demarrerServeurDEssai({ reglages: { messagesParFenetre: 12 } });
    try {
      const membre = await etroit.inscrire();
      const horloge = horlogeDEssai();
      const onglet = await ouvrirUnOnglet({
        serveur: etroit,
        cookie: membre.cookie,
        idEspace: crypto.randomUUID(),
        horloge,
      });
      for (let rang = 0; rang < 8; rang += 1) {
        onglet.facade.creerPage(`Page ${String(rang)}`);
      }
      await attendreQue(() => onglet.synchro.lireEtat().registreLu);
      await onglet.synchro.adopter("Espace");
      await attendreQue(() => etroit.texteDuJournal().includes("trop-de-requetes"), 15_000);
      await attendreQue(() => onglet.synchro.lireEtat().affiche !== "en-cours");

      const tentatives = onglet.reseau.ouvertes();
      expect(horloge.delais.some((delai) => delai >= 10_000)).toBe(true);
      await pause(2000);
      expect(onglet.reseau.ouvertes()).toBe(tentatives);
    } finally {
      fermerLesOnglets();
      await etroit.fermer();
    }
  });
});

describe("modification en attente", () => {
  it("F-013-AC33 une modification en attente 30 secondes, connexion établie, ferme la connexion et fait reprendre ; la perte de connexion quitte « Synchronisé »", async () => {
    const membre = await serveur.inscrire();
    const horloge = horlogeDEssai();
    const onglet = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: crypto.randomUUID(),
      horloge,
    });
    await adopterEtAttendre(onglet);
    const etats = suivreLesEtats(onglet);
    onglet.reseau.accusesPerdus = true;

    onglet.facade.creerPage("Jamais acquittée");
    await attendreLEtat(onglet, "en-cours");
    const avant = onglet.reseau.ouvertes();
    horloge.avancer(ATTENTE_D_ACQUITTEMENT_MS - 1000);
    await pause(100);
    expect(onglet.reseau.ouvertes()).toBe(avant);
    horloge.avancer(1000);

    await attendreQue(() => etats.includes("hors-ligne") || etats.includes("connexion"));
    onglet.reseau.accusesPerdus = false;
    horloge.avancer(1000);
    await attendreQue(() => onglet.reseau.ouvertes() === avant + 1);
    await attendreLEtat(onglet, "synchronise");
  });
});

describe("compte inconnu", () => {
  it("F-013-AC20 F-013-AC7 compte inconnu, chaque tentative revérifie d'abord le compte, sans WebSocket, aux mêmes délais", async () => {
    const membre = await serveur.inscrire();
    const horloge = horlogeDEssai();
    const compte = compteDEssai("connecte");
    const onglet = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: crypto.randomUUID(),
      horloge,
      compte,
      alea: () => 0,
    });
    await adopterEtAttendre(onglet);
    compte.poser("inconnu");
    onglet.reseau.couper();
    await attendreLEtat(onglet, "hors-ligne");
    const ouvertes = onglet.reseau.ouvertes();
    const avant = compte.reverifications.length;

    horloge.avancer(1000);
    await attendreQue(() => compte.reverifications.length > avant);
    horloge.avancer(2000);
    await attendreQue(() => compte.reverifications.length > avant + 1);

    expect(onglet.reseau.ouvertes()).toBe(ouvertes);
    expect(onglet.synchro.lireEtat().affiche).toBe("hors-ligne");
    onglet.reseau.retablir();
    compte.poser("connecte");
    await attendreLEtat(onglet, "synchronise");
  });
});
