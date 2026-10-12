import { CHEMINS } from "@notionlike/contrats";
import { ouvrirBaseEmbarquee, type BaseEmbarquee } from "@notionlike/db/essai";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  arreterLesServeurs,
  baseDontLaSonde,
  DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  enveloppeDe,
  lancerServeur,
  type LigneDeJournal,
  type ServeurDEssai,
} from "./aides.ts";

const LIMITE_OCTETS = 100_000;
const JSON_ENTETES = { "Content-Type": "application/json" };

let embarquee: BaseEmbarquee;

beforeAll(async () => {
  embarquee = await ouvrirBaseEmbarquee();
}, DELAI_D_OUVERTURE_D_UNE_BASE_MS);
afterEach(arreterLesServeurs);
afterAll(() => embarquee.base.fermer());

// Un objet JSON valide d'exactement `octets` octets.
function objetJsonDe(octets: number): string {
  const enveloppe = '{"a":""}'.length;
  return `{"a":"${"x".repeat(octets - enveloppe)}"}`;
}

function poster(serveur: ServeurDEssai, chemin: string, corps: string): Promise<Response> {
  return fetch(`${serveur.url}${chemin}`, { method: "POST", headers: JSON_ENTETES, body: corps });
}

describe("chemins et méthodes inconnus", () => {
  it.each([
    ["GET", "/inconnu"],
    ["POST", "/sante"],
    ["DELETE", "/pret"],
    ["OPTIONS", "/sante"],
    ["GET", "/sante/"],
    ["GET", "/SANTE"],
  ])("F-008-AC5 %s %s répond 404 ressource-introuvable", async (method, chemin) => {
    const serveur = await lancerServeur(embarquee.base);

    const reponse = await fetch(`${serveur.url}${chemin}`, { method });

    expect(reponse.status).toBe(404);
    expect((await enveloppeDe(reponse)).code).toBe("ressource-introuvable");
  });
});

describe("corps des requêtes JSON", () => {
  it.each([
    ["tronqué", '{"a":'],
    ["qui n'est ni un objet ni un tableau", '"une chaîne seule"'],
  ])("F-008-AC6 un corps JSON %s reçoit 400 requete-invalide", async (_cas, corps) => {
    const serveur = await lancerServeur(embarquee.base);

    const reponse = await poster(serveur, "/inconnu", corps);

    expect(reponse.status).toBe(400);
    expect((await enveloppeDe(reponse)).code).toBe("requete-invalide");
  });

  it("F-008-AC6 un objet JSON de 100 000 octets est lu, puis reçoit le 404 du chemin inconnu", async () => {
    const serveur = await lancerServeur(embarquee.base);
    const corps = objetJsonDe(LIMITE_OCTETS);

    const reponse = await poster(serveur, "/inconnu", corps);

    expect(Buffer.byteLength(corps)).toBe(LIMITE_OCTETS);
    expect(reponse.status).toBe(404);
    expect((await enveloppeDe(reponse)).code).toBe("ressource-introuvable");
  });

  it("F-008-AC6 un corps qui ne s'annonce pas en JSON n'est pas lu, quelle que soit sa taille", async () => {
    const serveur = await lancerServeur(embarquee.base);

    const reponse = await fetch(`${serveur.url}/inconnu`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "x".repeat(3 * LIMITE_OCTETS),
    });

    expect(reponse.status).toBe(404);
    expect((await enveloppeDe(reponse)).code).toBe("ressource-introuvable");
  });

  it("F-008-AC6 un objet JSON de 100 001 octets reçoit 413 corps-trop-grand", async () => {
    const serveur = await lancerServeur(embarquee.base);

    const reponse = await poster(serveur, "/inconnu", objetJsonDe(LIMITE_OCTETS + 1));

    expect(reponse.status).toBe(413);
    expect((await enveloppeDe(reponse)).code).toBe("corps-trop-grand");
  });
});

describe("erreur non prévue", () => {
  const MESSAGE_PIEGE =
    "Failed query: select jeton from table_des_membres at /srv/app/packages/db/src/acces.ts";
  const VALEUR_EN_PLUS = "valeur-d-une-propriete-en-plus";

  function erreurPiegee(cause?: unknown): Error {
    const erreur = new Error(MESSAGE_PIEGE, { cause });
    return Object.assign(erreur, { parametres: VALEUR_EN_PLUS });
  }

  function ligneDErreur(serveur: ServeurDEssai, idRequete: string): LigneDeJournal | undefined {
    return serveur
      .lignesDuJournal()
      .find((ligne) => ligne.idRequete === idRequete && "erreur" in ligne);
  }

  async function provoquer(
    erreur: unknown,
  ): Promise<{ serveur: ServeurDEssai; reponse: Response }> {
    const base = baseDontLaSonde(embarquee.base.db, () => Promise.reject(erreur));
    const serveur = await lancerServeur(base);
    return { serveur, reponse: await fetch(`${serveur.url}${CHEMINS.pret}`) };
  }

  it("F-008-AC8 répond 500 erreur-interne, sans message d'origine, pile, requête SQL, chemin ni nom de table", async () => {
    const { reponse } = await provoquer(erreurPiegee());
    const corps = await reponse.clone().text();

    expect(reponse.status).toBe(500);
    expect(await enveloppeDe(reponse)).toMatchObject({
      code: "erreur-interne",
      message: "Une erreur interne est survenue.",
    });
    for (const interdit of [
      "Failed query",
      "select",
      "table_des_membres",
      "/srv/app",
      "acces.ts",
    ]) {
      expect(corps).not.toContain(interdit);
    }
    expect(corps).not.toMatch(/\bat\b|Error|\.ts\b|node_modules/);
  });

  it("F-008-AC8 consigne l'erreur complète avec le même idRequete, sans ses autres propriétés", async () => {
    const { serveur, reponse } = await provoquer(erreurPiegee());
    const { idRequete } = await enveloppeDe(reponse);

    const ligne = ligneDErreur(serveur, idRequete);

    expect(ligne?.erreur).toEqual([
      { type: "Error", message: MESSAGE_PIEGE, pile: expect.stringContaining("erreurs.test.ts") },
    ]);
    expect(serveur.texteDuJournal()).not.toContain(VALEUR_EN_PLUS);
  });

  it("F-008-AC8 consigne la chaîne des causes, bornée à cinq éléments", async () => {
    const chaine = [1, 2, 3, 4, 5, 6, 7].reduce<unknown>(
      (cause, rang) => new TypeError(`cause ${rang}`, { cause }),
      "une cause qui n'est pas une erreur",
    );
    const { serveur, reponse } = await provoquer(chaine);
    const { idRequete } = await enveloppeDe(reponse);

    const erreur = ligneDErreur(serveur, idRequete)?.erreur as { type: string; message: string }[];

    expect(reponse.status).toBe(500);
    expect(erreur.map(({ type, message }) => [type, message])).toEqual([
      ["TypeError", "cause 7"],
      ["TypeError", "cause 6"],
      ["TypeError", "cause 5"],
      ["TypeError", "cause 4"],
      ["TypeError", "cause 3"],
    ]);
  });

  it("F-008-AC8 une erreur non prévue qui porte un statut de serveur reçoit 500, et elle est consignée", async () => {
    const { serveur, reponse } = await provoquer(
      Object.assign(new Error("panne"), { status: 503 }),
    );
    const { idRequete, code } = await enveloppeDe(reponse);

    expect(reponse.status).toBe(500);
    expect(code).toBe("erreur-interne");
    expect(ligneDErreur(serveur, idRequete)?.erreur).toMatchObject([{ message: "panne" }]);
  });

  it("F-008-AC8 une valeur levée qui n'est pas une erreur reçoit aussi 500, et sa nature est consignée", async () => {
    const { serveur, reponse } = await provoquer("une chaîne levée");
    const { idRequete, code } = await enveloppeDe(reponse);

    expect(code).toBe("erreur-interne");
    expect(ligneDErreur(serveur, idRequete)?.erreur).toEqual([
      { type: "string", message: "valeur levée qui n'est pas une erreur", pile: "" },
    ]);
  });
});
