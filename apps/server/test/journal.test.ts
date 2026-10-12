import { CHEMINS } from "@notionlike/contrats";
import { ouvrirBase, type Base } from "@notionlike/db";
import { ouvrirBaseEmbarquee, portFerme, type BaseEmbarquee } from "@notionlike/db/essai";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  arreterLesServeurs,
  baseDontLaSonde,
  DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  lancerServeur,
  type LigneDeJournal,
  type ServeurDEssai,
} from "./aides.ts";

const SECRET_DE_LA_BASE = "secret-de-la-base-a-ne-pas-journaliser";
const MARQUEURS = {
  cookie: "marqueur-du-cookie",
  autorisation: "marqueur-de-l-autorisation",
  corps: "marqueur-du-corps",
  requete: "marqueur-de-la-chaine-de-requete",
};

let embarquee: BaseEmbarquee;
let injoignable: Base;
let urlInjoignable: string;

beforeAll(async () => {
  embarquee = await ouvrirBaseEmbarquee();
  urlInjoignable = `postgres://essai:${SECRET_DE_LA_BASE}@127.0.0.1:${await portFerme()}/essai`;
  injoignable = ouvrirBase(urlInjoignable);
}, DELAI_D_OUVERTURE_D_UNE_BASE_MS);
afterEach(arreterLesServeurs);
afterAll(async () => {
  await injoignable.fermer();
  await embarquee.base.fermer();
});

function lignesDe(serveur: ServeurDEssai, idRequete: string | null): LigneDeJournal[] {
  return serveur.lignesDuJournal().filter((ligne) => ligne.idRequete === idRequete);
}

function requeteMarquee(serveur: ServeurDEssai, chemin: string): Promise<Response> {
  return fetch(`${serveur.url}${chemin}?jeton=${MARQUEURS.requete}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `session=${MARQUEURS.cookie}`,
      Authorization: `Bearer ${MARQUEURS.autorisation}`,
    },
    body: JSON.stringify({ secret: MARQUEURS.corps }),
  });
}

describe("ligne de journal d'une requête", () => {
  it("F-008-AC11 porte l'identifiant, la méthode, le chemin sans chaîne de requête, le statut et la durée, et rien d'autre", async () => {
    const serveur = await lancerServeur(embarquee.base);

    const reponse = await fetch(`${serveur.url}${CHEMINS.sante}?jeton=${MARQUEURS.requete}`);
    const [ligne, ...autres] = lignesDe(serveur, reponse.headers.get("x-request-id"));

    expect(autres).toEqual([]);
    expect(ligne).toEqual({
      niveau: "info",
      time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      message: "requete",
      idRequete: reponse.headers.get("x-request-id"),
      methode: "GET",
      chemin: "/sante",
      statut: 200,
      dureeMs: expect.any(Number),
    });
  });

  it("F-008-AC11 porte le statut réel d'une réponse d'erreur", async () => {
    const serveur = await lancerServeur(embarquee.base);

    const reponse = await requeteMarquee(serveur, "/inconnu");

    expect(lignesDe(serveur, reponse.headers.get("x-request-id"))).toMatchObject([
      { methode: "POST", chemin: "/inconnu", statut: 404 },
    ]);
  });
});

describe("contenu du journal", () => {
  it("F-008-AC11 chaque ligne est un objet JSON, sans en-tête sensible, corps, chaîne de requête ni secret de la configuration", async () => {
    const serveur = await lancerServeur(injoignable, { env: { URL_BASE_DONNEES: urlInjoignable } });

    await requeteMarquee(serveur, "/inconnu");
    await fetch(`${serveur.url}/inconnu`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `session=${MARQUEURS.cookie}` },
      body: `{"secret":"${MARQUEURS.corps}"`,
    });
    const indisponible = await fetch(`${serveur.url}${CHEMINS.pret}`);
    const journal = serveur.texteDuJournal();

    expect(indisponible.status).toBe(503);
    expect(serveur.lignesDuJournal()).toHaveLength(4);
    expect(journal.endsWith("\n")).toBe(true);
    for (const interdit of [...Object.values(MARQUEURS), SECRET_DE_LA_BASE, "postgres://"]) {
      expect(journal).not.toContain(interdit);
    }
  });

  it("F-008-AC11 une base indisponible est consignée par son code, sans l'objet d'erreur", async () => {
    const serveur = await lancerServeur(injoignable, { env: { URL_BASE_DONNEES: urlInjoignable } });

    const reponse = await fetch(`${serveur.url}${CHEMINS.pret}`);
    const idRequete = reponse.headers.get("x-request-id");

    expect(lignesDe(serveur, idRequete)).toEqual([
      {
        niveau: "warn",
        time: expect.any(String),
        message: "base-indisponible",
        idRequete,
        code: "base-injoignable",
      },
      expect.objectContaining({ message: "requete", statut: 503 }),
    ]);
  });

  it("F-008-AC11 une erreur non prévue est consignée au niveau error, sans en-tête ni corps de la requête", async () => {
    const base = baseDontLaSonde(embarquee.base.db, () => Promise.reject(new Error("panne")));
    const serveur = await lancerServeur(base);

    const reponse = await fetch(`${serveur.url}${CHEMINS.pret}`, {
      headers: { Cookie: `session=${MARQUEURS.cookie}` },
    });
    const [erreur] = lignesDe(serveur, reponse.headers.get("x-request-id"));

    expect(reponse.status).toBe(500);
    expect(Object.keys(erreur ?? {}).sort()).toEqual(
      ["erreur", "idRequete", "message", "niveau", "time"].sort(),
    );
    expect(erreur).toMatchObject({ niveau: "error", message: "erreur-interne" });
    expect(serveur.texteDuJournal()).not.toContain(MARQUEURS.cookie);
  });
});
