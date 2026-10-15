// Demande de passage en WebSocket (F-012-AC1 à AC4, AC15, AC24) : établie avec une session et une
// origine admises, refusée avant l'établissement sinon, constatée par un client hors navigateur.
import { CHEMIN_SYNCHRO } from "@notionlike/contrats";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  attendreQue,
  connecter,
  connecterBrut,
  DELAI_SYNCHRO_MS,
  fermerLesClients,
} from "./aides-synchro.ts";
import { demarrerServeurDEssai, type ServeurDEssai } from "./fabrique.ts";

let serveur: ServeurDEssai;

beforeAll(async () => {
  serveur = await demarrerServeurDEssai({ originesAutorisees: ["http://autre.exemple.test"] });
}, DELAI_SYNCHRO_MS);
afterEach(fermerLesClients);
afterAll(async () => {
  await serveur.fermer();
});

function refusDuJournal(motif: string): number {
  return serveur
    .lignesDuJournal()
    .filter((ligne) => ligne.type === "connexion-refusee" && ligne.motif === motif).length;
}

// Le jeton brut de la session (F-009 H15) : la valeur du cookie avant sa signature.
function jetonBrut(cookie: string): string {
  return decodeURIComponent(cookie.split("=")[1] ?? "").split(".")[0] ?? "";
}

describe("établissement (F-012-AC1)", () => {
  it(
    "F-012-AC1 une demande avec un cookie de session valide et une origine admise établit la connexion, rattachée à son compte",
    async () => {
      const { cookie, idCompte } = await serveur.inscrire();

      const client = await connecterBrut(serveur, { cookie });

      expect(client.prise.readyState).toBe(1);
      await attendreQue(() =>
        serveur
          .lignesDuJournal()
          .some((ligne) => ligne.type === "connexion-etablie" && ligne.idCompte === idCompte),
      );
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("authentification de la demande (F-012-AC2)", () => {
  it.each([
    ["sans cookie", undefined],
    ["cookie altéré", "better-auth.session_token=altere.signature"],
    ["cookie inconnu", "better-auth.session_token=inconnu"],
  ])(
    "F-012-AC2 une demande %s est refusée par 401 avant l'établissement",
    async (_cas, cookie) => {
      const avant = refusDuJournal("non-authentifie");

      const issue = await connecter(serveur, cookie === undefined ? {} : { cookie });

      expect(issue).toEqual({ issue: "refusee", statut: 401 });
      expect(refusDuJournal("non-authentifie")).toBe(avant + 1);
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC2 un cookie expiré ou révoqué est refusé de la même façon",
    async () => {
      const expire = await serveur.inscrire();
      await serveur.base.db.execute(
        `update "session" set "expiresAt" = now() - interval '1 minute' where "userId" = '${expire.idCompte}'`,
      );
      const revoque = await serveur.inscrire();
      await serveur.appeler("POST", "/api/auth/sign-out", { cookie: revoque.cookie });

      expect(await connecter(serveur, { cookie: expire.cookie })).toEqual({
        issue: "refusee",
        statut: 401,
      });
      expect(await connecter(serveur, { cookie: revoque.cookie })).toEqual({
        issue: "refusee",
        statut: 401,
      });
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC2 le jeton brut de la session n'authentifie par aucune autre voie : URL, Authorization, sous-protocole, message du protocole",
    async () => {
      const { cookie } = await serveur.inscrire();
      const jeton = jetonBrut(cookie);
      expect(jeton.length).toBeGreaterThan(10);

      const voies = [
        connecter(serveur, { chemin: `${CHEMIN_SYNCHRO}?token=${jeton}` }),
        connecter(serveur, { enTetes: { Authorization: `Bearer ${jeton}` } }),
        connecter(serveur, { protocoles: [jeton] }),
        connecter(serveur, { cookie: `better-auth.session_token=${jeton}` }),
      ];

      for (const issue of await Promise.all(voies)) {
        expect(issue).toEqual({ issue: "refusee", statut: 401 });
      }
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("origine (F-012-AC3)", () => {
  it.each([
    ["étrangère", "http://malveillant.exemple.test"],
    ["absente", null],
  ])(
    "F-012-AC3 une origine %s est refusée par 403, même avec une session valide",
    async (_cas, origine) => {
      const { cookie } = await serveur.inscrire();
      const avant = refusDuJournal("origine-refusee");

      expect(await connecter(serveur, { cookie, origine })).toEqual({
        issue: "refusee",
        statut: 403,
      });
      expect(refusDuJournal("origine-refusee")).toBe(avant + 1);
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC3 l'URL publique et une origine autorisée sont admises",
    async () => {
      const { cookie } = await serveur.inscrire();

      expect((await connecter(serveur, { cookie })).issue).toBe("etablie");
      expect(
        (await connecter(serveur, { cookie, origine: "http://autre.exemple.test" })).issue,
      ).toBe("etablie");
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("chemin (F-012-AC4)", () => {
  it(
    "F-012-AC4 un passage en WebSocket sur un autre chemin est refusé par 404",
    async () => {
      const { cookie } = await serveur.inscrire();

      for (const chemin of ["/api/v1/synchro/", "/api/v1/autre", "/"]) {
        expect(await connecter(serveur, { cookie, chemin })).toEqual({
          issue: "refusee",
          statut: 404,
        });
      }
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC4 une requête HTTP ordinaire sur le point de synchronisation reçoit 404 ressource-introuvable",
    async () => {
      const { cookie } = await serveur.inscrire();

      const reponse = await serveur.appeler("GET", CHEMIN_SYNCHRO, { cookie });

      expect(reponse.status).toBe(404);
      expect(((await reponse.json()) as { code: string }).code).toBe("ressource-introuvable");
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("vérification en échec (F-012-AC15)", () => {
  it(
    "F-012-AC15 une lecture de session en échec refuse la demande par 500, sans rien accorder",
    async () => {
      const { cookie } = await serveur.inscrire();
      await serveur.base.db.execute(`alter table "session" rename to "session_cachee"`);
      try {
        expect(await connecter(serveur, { cookie })).toEqual({ issue: "refusee", statut: 500 });
      } finally {
        await serveur.base.db.execute(`alter table "session_cachee" rename to "session"`);
      }
      expect(refusDuJournal("erreur-interne")).toBeGreaterThan(0);
    },
    DELAI_SYNCHRO_MS,
  );
});
