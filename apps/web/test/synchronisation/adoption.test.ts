// Adoption de l'espace local, registre de l'appareil, rien avant le compte et l'adoption, noms des
// documents, contre le serveur réel (F-013-AC4, AC7 à AC9, AC12 à AC16, AC42).
import { CHEMIN_SYNCHRO, schemaNomDeDocument, TYPES_DE_DOCUMENT } from "@notionlike/contrats";
import type { ServeurDEssai } from "@notionlike/server/essai";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { inscrireAuRegistre, lireLeRegistre } from "../../src/persistance/index.ts";
import { correspondance } from "../../src/synchronisation/noms.ts";
import { JETON_SANS_SECRET } from "../../src/synchronisation/ouverture.ts";
import { adresseDuPointDeSynchronisation } from "../../src/synchronisation/reseau.ts";
import {
  attendreLEtat,
  attendreQue,
  compteDEssai,
  fermerLesOnglets,
  messagesDe,
  nouvelAppareil,
  ouvrirUnOnglet,
  pause,
  preparerLAppareil,
  requetesVues,
  serveurEtCompte,
  TYPES_DE_MESSAGE,
} from "./aides-synchro.ts";

vi.setConfig({ testTimeout: 30_000 });

let serveur: ServeurDEssai;
beforeAll(async () => {
  ({ serveur } = await serveurEtCompte());
});
afterAll(async () => {
  await serveur.fermer();
});
afterEach(() => {
  fermerLesOnglets();
});

describe("rien ne part avant le compte et l'adoption", () => {
  it.each([
    ["local", "connecte"],
    ["local", "deconnecte"],
    ["local", "inconnu"],
    ["adopte", "deconnecte"],
    ["adopte", "inconnu"],
    ["adopte", "connecte"],
  ] as const)(
    "F-013-AC7 rattachement %s, compte %s : aucune WebSocket ni requête hors de la combinaison adopte et connecte",
    async (rattachement, statut) => {
      const membre = await serveur.inscrire();
      const idEspace = crypto.randomUUID();
      const appareil = nouvelAppareil();
      if (rattachement === "adopte") {
        await serveur.appeler("POST", "/api/v1/espaces", {
          cookie: membre.cookie,
          corps: { idEspace, nom: "Adopté" },
        });
      }
      if (rattachement === "adopte") {
        await preparerLAppareil(appareil, idEspace, { rattachement: "adopte", droit: "ecriture" });
      }
      const avant = requetesVues.length;
      const suivi = await ouvrirUnOnglet({
        serveur,
        cookie: membre.cookie,
        idEspace,
        appareil,
        compte: compteDEssai(statut),
      });
      await attendreQue(() => suivi.synchro.lireEtat().registreLu);
      await pause(400);

      const attendues = rattachement === "adopte" && statut === "connecte" ? 1 : 0;
      expect(suivi.reseau.ouvertes()).toBe(attendues);
      expect(requetesVues.slice(avant)).toEqual([]);
    },
  );
});

describe("adoption de l'espace local", () => {
  it("F-013-AC12 F-013-AC16 la confirmation envoie POST /espaces avec le seul identifiant et le nom, inscrit adopte au registre et synchronise sans autre geste", async () => {
    const membre = await serveur.inscrire();
    const idEspace = crypto.randomUUID();
    const onglet = await ouvrirUnOnglet({ serveur, cookie: membre.cookie, idEspace });
    onglet.facade.creerPage("Avant l'adoption");
    await attendreQue(() => onglet.synchro.lireEtat().registreLu);
    expect(onglet.synchro.lireEtat().affiche).toBe("local");
    expect(onglet.reseau.ouvertes()).toBe(0);
    const avant = requetesVues.length;

    const issue = await onglet.synchro.adopter("Mon espace");

    expect(issue).toEqual({
      sorte: "adopte",
      nom: "Mon espace",
      rejouee: false,
      droit: "ecriture",
    });
    expect(requetesVues.slice(avant)).toEqual([
      { methode: "POST", chemin: "/api/v1/espaces", corps: { idEspace, nom: "Mon espace" } },
    ]);
    expect(await onglet.appareil.sur(() => lireLeRegistre(idEspace))).toEqual({
      issue: "lu",
      entree: { rattachement: "adopte", droit: "ecriture" },
    });
    await attendreLEtat(onglet, "synchronise");
    const nom = correspondance("espace", idEspace).nomDeDocument;
    await attendreQue(async () => (await serveur.lireInstantane(nom)) !== undefined, 15_000);
  });

  it("F-013-AC12 une réponse 200 (création rejouée) adopte l'espace et rend le nom du serveur", async () => {
    const membre = await serveur.inscrire();
    const idEspace = crypto.randomUUID();
    const premier = await ouvrirUnOnglet({ serveur, cookie: membre.cookie, idEspace });
    await attendreQue(() => premier.synchro.lireEtat().registreLu);
    await premier.synchro.adopter("Nom d'origine");
    const second = await ouvrirUnOnglet({ serveur, cookie: membre.cookie, idEspace });
    await attendreQue(() => second.synchro.lireEtat().registreLu);

    const issue = await second.synchro.adopter("Autre nom");

    expect(issue).toEqual({
      sorte: "adopte",
      nom: "Nom d'origine",
      rejouee: true,
      droit: "ecriture",
    });
    expect(second.synchro.lireEtat().rattachement).toBe("adopte");
  });

  it("F-013-AC13 409 puis 200 : le compte est membre sans être propriétaire, l'espace est adopté avec le droit de son rôle", async () => {
    const proprietaire = await serveur.inscrire();
    const lecteur = await serveur.inscrire();
    const idEspace = crypto.randomUUID();
    await serveur.appeler("POST", "/api/v1/espaces", {
      cookie: proprietaire.cookie,
      corps: { idEspace, nom: "Partagé" },
    });
    await serveur.ajouterMembre(proprietaire.cookie, idEspace, lecteur.cookie, "lecteur");
    const onglet = await ouvrirUnOnglet({ serveur, cookie: lecteur.cookie, idEspace });
    await attendreQue(() => onglet.synchro.lireEtat().registreLu);
    const avant = requetesVues.length;

    const issue = await onglet.synchro.adopter("Mon nom");

    expect(issue).toEqual({ sorte: "adopte", nom: "Partagé", rejouee: true, droit: "lecture" });
    expect(requetesVues.slice(avant).map(({ methode }) => methode)).toEqual(["POST", "GET"]);
    await attendreQue(() => onglet.synchro.lireEtat().droit === "lecture");
  });

  it("F-013-AC13 409 puis 404 : l'espace reste local, intact, et rien n'est rejoué sans un nouveau geste", async () => {
    const autre = await serveur.inscrire();
    const membre = await serveur.inscrire();
    const idEspace = crypto.randomUUID();
    await serveur.appeler("POST", "/api/v1/espaces", {
      cookie: autre.cookie,
      corps: { idEspace, nom: "Pris" },
    });
    const onglet = await ouvrirUnOnglet({ serveur, cookie: membre.cookie, idEspace });
    onglet.facade.creerPage("Gardée");
    await attendreQue(() => onglet.synchro.lireEtat().registreLu);
    const avant = requetesVues.length;

    const issue = await onglet.synchro.adopter("Mon nom");
    await pause(300);

    expect(issue).toEqual({ sorte: "identifiant-pris" });
    expect(requetesVues.slice(avant).map(({ methode }) => methode)).toEqual(["POST", "GET"]);
    expect(onglet.synchro.lireEtat().rattachement).toBe("local");
    expect(onglet.facade.lire().racines.map(({ titre }) => titre)).toEqual(["Gardée"]);
    expect(await onglet.appareil.sur(() => lireLeRegistre(idEspace))).toEqual({
      issue: "lu",
      entree: undefined,
    });
    expect(onglet.reseau.ouvertes()).toBe(0);
  });

  it("F-013-AC14 un 401, un quota atteint et un serveur injoignable laissent l'espace local ; le 401 fait revérifier le compte", async () => {
    const membre = await serveur.inscrire();
    const idEspace = crypto.randomUUID();
    const compte = compteDEssai("connecte");
    const sansSession = await ouvrirUnOnglet({
      serveur,
      cookie: "better-auth.session_token=invalide",
      idEspace,
      compte,
    });
    await attendreQue(() => sansSession.synchro.lireEtat().registreLu);

    const refusee = await sansSession.synchro.adopter("Mon nom");

    expect(refusee).toEqual({
      sorte: "echec",
      erreur: { type: "enveloppe", code: "non-authentifie" },
    });
    await attendreQue(() => compte.reverifications.length > 0);
    expect(sansSession.synchro.lireEtat().rattachement).toBe("local");

    // Quota : le compte possède déjà le nombre maximal d'espaces (F-011-AC34).
    for (let rang = 0; rang < 20; rang += 1) {
      await serveur.creerEspace(membre.cookie);
    }
    const plein = await ouvrirUnOnglet({ serveur, cookie: membre.cookie, idEspace });
    await attendreQue(() => plein.synchro.lireEtat().registreLu);
    expect(await plein.synchro.adopter("Mon nom")).toEqual({
      sorte: "echec",
      erreur: { type: "enveloppe", code: "quota-atteint" },
    });
    expect(plein.synchro.lireEtat().rattachement).toBe("local");
  });
});

describe("plusieurs onglets, registre illisible", () => {
  it("F-013-AC15 quand un onglet adopte l'espace, l'autre onglet du même appareil passe à adopte dans les 2 secondes et établit sa propre connexion", async () => {
    const membre = await serveur.inscrire();
    const idEspace = crypto.randomUUID();
    const appareil = nouvelAppareil();
    const premier = await ouvrirUnOnglet({ serveur, cookie: membre.cookie, idEspace, appareil });
    const second = await ouvrirUnOnglet({ serveur, cookie: membre.cookie, idEspace, appareil });
    await attendreQue(() => second.synchro.lireEtat().registreLu);
    expect(second.synchro.lireEtat().rattachement).toBe("local");

    await premier.synchro.adopter("Commun");
    const adoption = Date.now();

    await attendreQue(() => second.synchro.lireEtat().rattachement === "adopte", 2000);
    expect(Date.now() - adoption).toBeLessThan(2000);
    await attendreQue(() => second.reseau.ouvertes() === 1);
    expect(premier.reseau.ouvertes()).toBe(1);
  });

  it("F-013-AC4 un registre illisible tient l'espace pour local sans proposer l'adoption ni rien inscrire, puis il est relu à la cadence de la reprise", async () => {
    const membre = await serveur.inscrire();
    const idEspace = crypto.randomUUID();
    const appareil = nouvelAppareil();
    await preparerLAppareil(appareil, idEspace);
    await appareil.sur(() => ecrireDansLeRegistre(idEspace, { rattachement: "inconnu" }));

    const onglet = await ouvrirUnOnglet({ serveur, cookie: membre.cookie, idEspace, appareil });
    await pause(300);

    expect(onglet.synchro.lireEtat()).toMatchObject({
      affiche: "local",
      rattachement: "local",
      registreLu: false,
    });
    expect(await appareil.sur(() => lireLeRegistre(idEspace))).toEqual({ issue: "illisible" });
    expect(onglet.reseau.ouvertes()).toBe(0);

    await appareil.sur(() =>
      inscrireAuRegistre(idEspace, { rattachement: "adopte", droit: "ecriture" }),
    );
    onglet.horloge.avancer(2000);
    await attendreQue(() => onglet.synchro.lireEtat().registreLu);
    expect(onglet.synchro.lireEtat().rattachement).toBe("adopte");
  });
});

describe("connexion et ouverture vues du serveur", () => {
  it("F-013-AC8 F-013-AC9 la connexion vise l'adresse publiée sans paramètre ; chaque ouverture joint le jeton constant ; aucun message de présence n'est émis", async () => {
    const membre = await serveur.inscrire();
    const idEspace = crypto.randomUUID();
    const onglet = await ouvrirUnOnglet({ serveur, cookie: membre.cookie, idEspace });
    onglet.facade.creerPage("Une page");
    await attendreQue(() => onglet.synchro.lireEtat().registreLu);
    await onglet.synchro.adopter("Espace");
    await attendreLEtat(onglet, "synchronise");

    const emis = messagesDe(onglet.reseau.emis);
    const authentifications = emis.filter(({ type }) => type === TYPES_DE_MESSAGE.authentification);
    expect(authentifications.length).toBeGreaterThan(0);
    expect(new Set(authentifications.map(({ jeton }) => jeton))).toEqual(
      new Set([JETON_SANS_SECRET]),
    );
    expect(emis.filter(({ type }) => type === TYPES_DE_MESSAGE.presence)).toEqual([]);
    expect(adresseDuPointDeSynchronisation({ protocol: "https:", host: "exemple.test:8443" })).toBe(
      `wss://exemple.test:8443${CHEMIN_SYNCHRO}`,
    );
    expect(adresseDuPointDeSynchronisation({ protocol: "http:", host: "127.0.0.1:5173" })).toBe(
      `ws://127.0.0.1:5173${CHEMIN_SYNCHRO}`,
    );
    expect(JETON_SANS_SECRET).not.toContain(membre.cookie);
  });
});

describe("noms des bases et noms des documents", () => {
  it.each(TYPES_DE_DOCUMENT)(
    "F-013-AC16 F-013-AC46 le type « %s » a sa correspondance : base = « notionlike: » + document, aller-retour des identifiants",
    (type) => {
      const idEspace = crypto.randomUUID();
      const idDocument = type === "espace" ? idEspace : crypto.randomUUID();
      const lien = correspondance(type, idEspace, idDocument);

      expect(lien.nomDeBase).toBe(`notionlike:${lien.nomDeDocument}`);
      expect(schemaNomDeDocument.parse(lien.nomDeDocument)).toEqual({ type, idEspace, idDocument });
    },
  );
});

// Une valeur que l'application n'a pas écrite, posée à la clé du registre de cet espace.
function ecrireDansLeRegistre(idEspace: string, valeur: unknown): Promise<void> {
  return new Promise((resoudre, rejeter) => {
    const demande = indexedDB.open("notionlike:appareil");
    demande.onsuccess = () => {
      const connexion = demande.result;
      const transaction = connexion.transaction("reglages", "readwrite");
      transaction.objectStore("reglages").put(valeur, `registre:${idEspace}`);
      transaction.oncomplete = () => {
        connexion.close();
        resoudre();
      };
      transaction.onerror = () => rejeter(new Error("écriture refusée"));
    };
    demande.onerror = () => rejeter(new Error("base refusée"));
  });
}
