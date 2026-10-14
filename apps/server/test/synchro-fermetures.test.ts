// Fermeture d'une ouverture par le client et plafond des documents ouverts (F-012-AC24, AC37, AC34),
// contre la bibliothèque réelle, avec le client officiel et le client du protocole écrit pour les
// tests. Le relais écarte un message de fermeture qui vise un nom sans ouverture accordée.
import { randomUUID } from "node:crypto";

import { nomDeDocument } from "@notionlike/contrats";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  attendreQue,
  brut,
  connecterBrut,
  DELAI_SYNCHRO_MS,
  fermerLesClients,
  fournisseur,
  fournisseurSynchronise,
  miseAJourTexte,
  pause,
  preparerUnEspace,
  priseDeFournisseur,
  texteDe,
  type ClientBrut,
  type EspaceDEssai,
  type Fournisseur,
} from "./aides-synchro.ts";
import { demarrerServeurDEssai, type ServeurDEssai } from "./fabrique.ts";

let serveur: ServeurDEssai;
let reduit: ServeurDEssai;
let espace: EspaceDEssai;
let espaceReduit: EspaceDEssai;

beforeAll(async () => {
  [serveur, reduit] = await Promise.all([
    demarrerServeurDEssai(),
    demarrerServeurDEssai({ reglages: { documentsParConnexion: 3 } }),
  ]);
  [espace, espaceReduit] = await Promise.all([preparerUnEspace(serveur), preparerUnEspace(reduit)]);
}, DELAI_SYNCHRO_MS);
afterEach(fermerLesClients);
afterAll(async () => {
  await Promise.all([serveur.fermer(), reduit.fermer()]);
});

const page = (idEspace = espace.idEspace): string =>
  nomDeDocument({ type: "page", idEspace, idDocument: randomUUID() });

// L'ouverture reste en service : 2 secondes plus tard, elle reçoit la mise à jour d'un autre client.
async function constaterEnService(recoit: () => string, document: string): Promise<void> {
  await pause(2000);
  const autre = await connecterBrut(serveur, { cookie: espace.proprietaire.cookie });
  await autre.ouvrirEtSynchroniser(document);
  const texte = `encore ${randomUUID()}`;
  autre.envoyer(brut.miseAJour(document, miseAJourTexte(texte, autre.doc(document))));
  await attendreQue(() => recoit().includes(texte), 3000);
}

async function promouvoirPuisRetrograder(compte: string): Promise<void> {
  await serveur.changerRole(espace.proprietaire.cookie, espace.idEspace, compte, "lecteur");
  await serveur.changerRole(espace.proprietaire.cookie, espace.idEspace, compte, "editeur");
}

async function rouvrir(ouvert: Fournisseur): Promise<void> {
  ouvert.provider.detach();
  ouvert.provider.attach();
  await attendreQue(() => ouvert.provider.isSynced && ouvert.provider.isAuthenticated);
}

describe("message de fermeture sans ouverture (F-012-AC37)", () => {
  it(
    "F-012-AC37 F-012-AC34 un message de fermeture brut pour un nom jamais ouvert est écarté : l'ouverture qui suit reste en service",
    async () => {
      const document = page();
      const client = await connecterBrut(serveur, { cookie: espace.editeur.cookie });

      client.envoyer(brut.fermeture(document));
      await pause(100);
      await client.ouvrirEtSynchroniser(document);

      expect(client.depuis(0, document).filter((lu) => lu.type === "fermeture")).toEqual([]);
      await constaterEnService(() => texteDe(client.doc(document)), document);
      expect(client.prise.readyState).toBe(1);
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC37 F-012-AC34 une ouverture fermée par le serveur, refermée puis rouverte par le client officiel, est accordée et reste en service",
    async () => {
      const membre = await serveur.inscrire("rouvre");
      await serveur.ajouterMembre(
        espace.proprietaire.cookie,
        espace.idEspace,
        membre.cookie,
        "editeur",
      );
      const document = page();
      const ouvert = await fournisseurSynchronise(
        priseDeFournisseur(serveur, membre.cookie),
        document,
      );

      await promouvoirPuisRetrograder(membre.idCompte);
      await attendreQue(() => ouvert.fermetures.includes("droits-modifies"));
      await rouvrir(ouvert);

      expect(ouvert.provider.authorizedScope).toBe("read-write");
      await constaterEnService(() => texteDe(ouvert.doc), document);
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC37 la même suite après la fermeture par le serveur de toutes les ouvertures de la connexion",
    async () => {
      const membre = await serveur.inscrire("toutes");
      await serveur.ajouterMembre(
        espace.proprietaire.cookie,
        espace.idEspace,
        membre.cookie,
        "editeur",
      );
      const prise = priseDeFournisseur(serveur, membre.cookie);
      const documents = [page(), page()];
      const ouverts: Fournisseur[] = [];
      for (const document of documents) {
        ouverts.push(await fournisseurSynchronise(prise, document));
      }

      await promouvoirPuisRetrograder(membre.idCompte);
      await attendreQue(() => ouverts.every((ouvert) => ouvert.fermetures.length > 0));
      for (const ouvert of ouverts) {
        await rouvrir(ouvert);
      }

      for (const [rang, ouvert] of ouverts.entries()) {
        await constaterEnService(() => texteDe(ouvert.doc), documents[rang] ?? "");
      }
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC37 un message de fermeture pour une ouverture qui attend sa décision la referme aussitôt accordée et libère sa place",
    async () => {
      const client = await connecterBrut(reduit, { cookie: espaceReduit.editeur.cookie });
      for (let rang = 0; rang < 5; rang += 1) {
        const document = page(espaceReduit.idEspace);
        client.envoyer(brut.ouverture(document));
        client.envoyer(brut.fermeture(document));
        await client.attendre((lu) => lu.nom === document && lu.type === "fermeture");
      }

      for (let rang = 0; rang < 3; rang += 1) {
        await client.ouvrirEtSynchroniser(page(espaceReduit.idEspace));
      }
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC37 un message de fermeture qui suit une ouverture refusée n'a aucun effet sur une ouverture ultérieure",
    async () => {
      const futur = await serveur.inscrire("futur");
      const document = page();
      const client = await connecterBrut(serveur, { cookie: futur.cookie });
      client.envoyer(brut.ouverture(document));
      client.envoyer(brut.fermeture(document));
      await client.attendre((lu) => lu.type === "refusee");

      await serveur.ajouterMembre(
        espace.proprietaire.cookie,
        espace.idEspace,
        futur.cookie,
        "editeur",
      );
      await client.ouvrirEtSynchroniser(document);

      await constaterEnService(() => texteDe(client.doc(document)), document);
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("plafond des documents ouverts (F-012-AC24)", () => {
  it(
    "F-012-AC24 l'ouverture de trop est refusée par quota-atteint ; une ouverture refermée par le client ou par le serveur libère sa place dans la seconde",
    async () => {
      const membre = await reduit.inscrire("plafond");
      await reduit.ajouterMembre(
        espaceReduit.proprietaire.cookie,
        espaceReduit.idEspace,
        membre.cookie,
        "editeur",
      );
      const client: ClientBrut = await connecterBrut(reduit, { cookie: membre.cookie });
      const documents = [0, 1, 2].map(() => page(espaceReduit.idEspace));
      for (const document of documents) {
        await client.ouvrirEtSynchroniser(document);
      }

      expect(await client.ouvrir(page(espaceReduit.idEspace))).toMatchObject({
        type: "refusee",
        texte: "quota-atteint",
      });

      client.envoyer(brut.fermeture(documents[0] ?? ""));
      await pause(1000);
      await client.ouvrirEtSynchroniser(page(espaceReduit.idEspace));

      await reduit.changerRole(
        espaceReduit.proprietaire.cookie,
        espaceReduit.idEspace,
        membre.idCompte,
        "lecteur",
      );
      await client.attendre((lu) => lu.type === "fermeture" && lu.raison === "droits-modifies");
      await pause(1000);
      for (let rang = 0; rang < 3; rang += 1) {
        await client.ouvrirEtSynchroniser(page(espaceReduit.idEspace));
      }
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC24 F-012-AC34 une connexion qui ouvre et referme tour à tour 300 documents avec le client officiel ne reçoit aucun refus",
    async () => {
      const prise = priseDeFournisseur(serveur, espace.editeur.cookie);
      const refus: string[] = [];
      for (let rang = 0; rang < 300; rang += 1) {
        if (rang % 50 === 0) {
          // Le débit de F-012-AC25 se compte sur l'horloge injectée : chaque tranche a sa fenêtre.
          serveur.horloge.avancer(serveur.reglages.fenetreDesMessagesMs);
        }
        const ouvert = fournisseur(prise, page(), new Y.Doc());
        await attendreQue(() => ouvert.provider.isSynced || ouvert.refus.length > 0);
        refus.push(...ouvert.refus);
        ouvert.provider.detach();
      }

      expect(refus).toEqual([]);
    },
    DELAI_SYNCHRO_MS * 2,
  );
});
