// Plafonds de connexions (F-012-AC24) : 20 par compte (429), 500 pour le serveur (503), tenus par le
// traitement de la demande de passage. Les valeurs réduites passent par la fabrique.
import { request } from "node:http";

import { CHEMIN_SYNCHRO } from "@notionlike/contrats";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  attendreQue,
  connecter,
  connecterBrut,
  DELAI_SYNCHRO_MS,
  fermerLesClients,
  pause,
} from "./aides-synchro.ts";
import { demarrerServeurDEssai, type ServeurDEssai } from "./fabrique.ts";

let serveur: ServeurDEssai;

beforeAll(async () => {
  serveur = await demarrerServeurDEssai({
    reglages: { connexionsParCompte: 3, connexionsParServeur: 5 },
  });
}, DELAI_SYNCHRO_MS);
afterEach(fermerLesClients);
afterAll(async () => {
  await serveur.fermer();
});

describe("plafonds de connexions (F-012-AC24)", () => {
  it(
    "F-012-AC24 la connexion de trop d'un compte est refusée par 429, et une place libérée se reprend",
    async () => {
      const { cookie } = await serveur.inscrire();
      const ouvertes = [];
      for (let rang = 0; rang < 3; rang += 1) {
        ouvertes.push(await connecterBrut(serveur, { cookie }));
      }

      expect(await connecter(serveur, { cookie })).toEqual({ issue: "refusee", statut: 429 });

      await ouvertes[0]?.fermer();
      await attendreQue(async () => (await connecter(serveur, { cookie })).issue === "etablie");
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC24 la connexion de trop du serveur est refusée par 503",
    async () => {
      const comptes = await Promise.all([serveur.inscrire(), serveur.inscrire()]);
      const [premier, second] = comptes;
      if (premier === undefined || second === undefined) {
        throw new Error("comptes");
      }
      for (let rang = 0; rang < 3; rang += 1) {
        await connecterBrut(serveur, { cookie: premier.cookie });
      }
      for (let rang = 0; rang < 2; rang += 1) {
        await connecterBrut(serveur, { cookie: second.cookie });
      }

      const troisieme = await serveur.inscrire();
      expect(await connecter(serveur, { cookie: troisieme.cookie })).toEqual({
        issue: "refusee",
        statut: 503,
      });
      expect(
        serveur
          .lignesDuJournal()
          .some((ligne) => ligne.type === "connexion-refusee" && ligne.code === 503),
      ).toBe(true);
    },
    DELAI_SYNCHRO_MS,
  );
});

// Une demande de passage valide en cookie et en origine, mais que `ws` refuse : sans clé.
function demandeMalFormee(cookie: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const demande = request({
      host: "127.0.0.1",
      port: serveur.port,
      path: CHEMIN_SYNCHRO,
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        Cookie: cookie,
        Origin: serveur.urlPublique,
      },
    });
    demande.once("response", (reponse) => {
      reponse.resume();
      resolve(reponse.statusCode ?? 0);
    });
    demande.once("upgrade", () => {
      reject(new Error("passage accepté sans clé"));
    });
    demande.once("error", reject);
    demande.end();
  });
}

describe("réservation des places (F-012-AC24)", () => {
  it(
    "F-012-AC24 une poignée de main avortée par ws rend sa place : après autant de demandes mal formées que le plafond du serveur, une connexion est encore acceptée",
    async () => {
      const { cookie } = await serveur.inscrire();
      await pause(300);
      for (let rang = 0; rang < serveur.reglages.connexionsParServeur; rang += 1) {
        expect(await demandeMalFormee(cookie)).toBe(400);
      }
      await pause(200);

      expect((await connecter(serveur, { cookie })).issue).toBe("etablie");
    },
    DELAI_SYNCHRO_MS,
  );
});
