// Messages de réponse de synchronisation (type 4 du protocole de la bibliothèque) : le relais les
// remet comme ceux du type 0, et ils passent par les mêmes contrôles. Une mise à jour ainsi portée
// n'échappe ni à la lecture seule (F-012-AC10), ni à la version (F-012-AC38), ni à la taille
// comptée (F-012-AC23), ni au quota de l'espace (F-012-AC24).
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
  memesOctets,
  miseAJourTexte,
  pause,
  preparerUnEspace,
  texteDe,
  type ClientBrut,
  type EspaceDEssai,
} from "./aides-synchro.ts";
import { demarrerServeurDEssai, type ServeurDEssai } from "./fabrique.ts";

let serveur: ServeurDEssai;
let espace: EspaceDEssai;

beforeAll(async () => {
  serveur = await demarrerServeurDEssai({
    reglages: {
      attenteDEnregistrementMs: 50,
      attenteMaxDEnregistrementMs: 200,
      octetsParDocument: 4000,
      documentsParEspace: 2,
    },
  });
  espace = await preparerUnEspace(serveur);
}, DELAI_SYNCHRO_MS);
afterEach(fermerLesClients);
afterAll(async () => {
  await serveur.fermer();
});

const page = (idEspace = espace.idEspace): string =>
  nomDeDocument({ type: "page", idEspace, idDocument: randomUUID() });

async function ouvrir(cookie: string, document: string): Promise<ClientBrut> {
  const client = await connecterBrut(serveur, { cookie });
  await client.ouvrirEtSynchroniser(document);
  return client;
}

// La mise à jour, portée par le type 4 en mise à jour puis en étape 2 : chaque envoi ferme
// l'ouverture par le motif attendu, sans rien appliquer ni relayer.
async function refuseeParLesDeuxFormes(
  cookie: string,
  document: string,
  fabriquer: (client: ClientBrut) => Uint8Array,
  motif: string,
): Promise<void> {
  const temoin = await ouvrir(espace.proprietaire.cookie, document);
  for (const forme of [brut.reponseMiseAJour, brut.reponseEtape2]) {
    const client = await ouvrir(cookie, document);
    const depuisTemoin = temoin.recus.length;
    const depuis = client.recus.length;

    client.envoyer(forme(document, fabriquer(client)));

    expect(await client.attendre((lu) => lu.type === "fermeture", depuis)).toEqual({
      nom: document,
      type: "fermeture",
      raison: motif,
    });
    await pause(300);
    expect(temoin.depuis(depuisTemoin)).toEqual([]);
  }
}

describe("réponse de synchronisation (type 4) d'un lecteur (F-012-AC10)", () => {
  it(
    "F-012-AC10 une mise à jour brute de type 4 d'un lecteur n'est ni appliquée, ni stockée, ni relayée, et reçoit l'accusé négatif",
    async () => {
      const document = page();
      const editeur = await ouvrir(espace.editeur.cookie, document);
      editeur.envoyer(brut.miseAJour(document, miseAJourTexte("original", editeur.doc(document))));
      await attendreQue(async () => (await serveur.lireInstantane(document)) !== undefined);
      const stocke = await serveur.lireInstantane(document);
      const lecteur = await ouvrir(espace.lecteur.cookie, document);
      const depuisEditeur = editeur.recus.length;
      const depuis = lecteur.recus.length;

      lecteur.envoyer(brut.reponseMiseAJour(document, miseAJourTexte("forgé ", new Y.Doc())));
      lecteur.envoyer(brut.reponseEtape2(document, miseAJourTexte("forgé aussi ", new Y.Doc())));
      await lecteur.attendre(
        (lu) => lu.type === "accuse" && lecteur.depuis(depuis, document).length >= 2,
        depuis,
      );
      await pause(400);

      expect(lecteur.depuis(depuis, document).filter((lu) => lu.type === "accuse")).toEqual([
        { nom: document, type: "accuse", applique: false },
        { nom: document, type: "accuse", applique: false },
      ]);
      expect(editeur.depuis(depuisEditeur, document)).toEqual([]);
      expect(texteDe(editeur.doc(document))).toBe("original");
      expect(memesOctets(await serveur.lireInstantane(document), stocke)).toBe(true);
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("réponse de synchronisation (type 4) d'un éditeur (F-012-AC23, AC24, AC38)", () => {
  it(
    "F-012-AC38 une version refusée portée par le type 4 est refusée par version-refusee",
    async () => {
      const document = nomDeDocument({
        type: "espace",
        idEspace: espace.idEspace,
        idDocument: espace.idEspace,
      });
      await refuseeParLesDeuxFormes(
        espace.editeur.cookie,
        document,
        (client) => {
          const copie = new Y.Doc();
          Y.applyUpdate(copie, Y.encodeStateAsUpdate(client.doc(document)));
          const avant = Y.encodeStateVector(copie);
          copie.getMap("meta").set("version", 99);
          return Y.encodeStateAsUpdate(copie, avant);
        },
        "version-refusee",
      );
      expect(await serveur.lireInstantane(document)).toBeUndefined();
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC23 une mise à jour au-delà de la taille comptée, portée par le type 4, est refusée par document-trop-grand",
    async () => {
      const document = page();
      await refuseeParLesDeuxFormes(
        espace.editeur.cookie,
        document,
        (client) => miseAJourTexte("y".repeat(5000), client.doc(document)),
        "document-trop-grand",
      );
      expect(await serveur.lireInstantane(document)).toBeUndefined();
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC24 une mise à jour portée par le type 4 qui créerait un document de trop dans l'espace est refusée par quota-atteint",
    async () => {
      const autre = await preparerUnEspace(serveur);
      for (let rang = 0; rang < 2; rang += 1) {
        const document = page(autre.idEspace);
        const client = await ouvrir(autre.editeur.cookie, document);
        client.envoyer(brut.miseAJour(document, miseAJourTexte("x", client.doc(document))));
        await attendreQue(async () => (await serveur.lireInstantane(document)) !== undefined);
      }
      const nouveau = page(autre.idEspace);
      const temoin = await ouvrir(autre.proprietaire.cookie, nouveau);
      for (const forme of [brut.reponseMiseAJour, brut.reponseEtape2]) {
        const client = await ouvrir(autre.editeur.cookie, nouveau);
        const depuis = client.recus.length;
        const depuisTemoin = temoin.recus.length;

        client.envoyer(forme(nouveau, miseAJourTexte("de trop", new Y.Doc())));

        expect(await client.attendre((lu) => lu.type === "fermeture", depuis)).toEqual({
          nom: nouveau,
          type: "fermeture",
          raison: "quota-atteint",
        });
        await pause(300);
        expect(temoin.depuis(depuisTemoin)).toEqual([]);
      }
      expect(await serveur.lireInstantane(nouveau)).toBeUndefined();
    },
    DELAI_SYNCHRO_MS,
  );
});
