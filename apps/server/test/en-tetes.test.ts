import { connect } from "node:net";

import { CHEMINS, schemaEnveloppeErreur } from "@notionlike/contrats";
import { ouvrirBase, type Base } from "@notionlike/db";
import { ouvrirBaseEmbarquee, portFerme, type BaseEmbarquee } from "@notionlike/db/essai";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  arreterLesServeurs,
  baseDontLaSonde,
  lancerServeur,
  MOT_DE_PASSE_D_ESSAI,
  type ServeurDEssai,
} from "./aides.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ID_DU_CLIENT = "identifiant-envoye-par-le-client";
const ORIGINE_AUTORISEE = "https://app.exemple.test";
const AUTRE_ORIGINE = "https://ailleurs.exemple.test";

type Requete = (url: string) => Promise<Response>;

const obtenir =
  (chemin: string): Requete =>
  (url) =>
    fetch(`${url}${chemin}`, { headers: { "X-Request-Id": ID_DU_CLIENT } });

const poster =
  (corps: string): Requete =>
  (url) =>
    fetch(`${url}/inconnu`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-Id": ID_DU_CLIENT },
      body: corps,
    });

let embarquee: BaseEmbarquee;
let injoignable: Base;

beforeAll(async () => {
  embarquee = await ouvrirBaseEmbarquee();
  const port = await portFerme();
  injoignable = ouvrirBase(`postgres://essai:${MOT_DE_PASSE_D_ESSAI}@127.0.0.1:${port}/essai`);
});
afterEach(arreterLesServeurs);
afterAll(async () => {
  await injoignable.fermer();
  await embarquee.base.fermer();
});

function baseEnPanne(): Base {
  return baseDontLaSonde(embarquee.base.db, () => Promise.reject(new Error("panne")));
}

// Les six statuts que le serveur de F-008 sait émettre, chacun avec la base qui le provoque.
const REPONSES: readonly (readonly [number, () => Base, Requete])[] = [
  [200, () => embarquee.base, obtenir(CHEMINS.sante)],
  [404, () => embarquee.base, obtenir("/inconnu")],
  [400, () => embarquee.base, poster('{"a":')],
  [413, () => embarquee.base, poster(`{"a":"${"x".repeat(100_000)}"}`)],
  [500, baseEnPanne, obtenir(CHEMINS.pret)],
  [503, () => injoignable, obtenir(CHEMINS.pret)],
];

function texteDesEnTetes(reponse: Response): string {
  return [...reponse.headers].map(([nom, valeur]) => `${nom}: ${valeur}`).join("\n");
}

// Tout ce que le serveur renvoie sur une connexion qui n'est pas du HTTP, jusqu'à sa fermeture.
function envoyerHorsHttp(serveur: ServeurDEssai): Promise<string> {
  return new Promise((resolve, reject) => {
    const morceaux: Buffer[] = [];
    const connexion = connect(serveur.port, "127.0.0.1", () => {
      connexion.write("CECI N'EST PAS DU HTTP\r\n\r\n");
    });
    connexion.on("data", (morceau: Buffer) => morceaux.push(morceau));
    connexion.on("error", reject);
    connexion.on("close", () => {
      resolve(Buffer.concat(morceaux).toString("utf8"));
    });
  });
}

describe("identifiant de requête", () => {
  it.each(REPONSES)(
    "F-008-AC4 une réponse %i porte un X-Request-Id généré par le serveur, repris dans l'enveloppe",
    async (statut, base, requete) => {
      const serveur = await lancerServeur(base());

      const reponse = await requete(serveur.url);
      const suivante = await requete(serveur.url);
      const id = reponse.headers.get("x-request-id");
      const corps = schemaEnveloppeErreur.safeParse(await reponse.json());

      expect(reponse.status).toBe(statut);
      expect(id).toMatch(UUID);
      expect(suivante.headers.get("x-request-id")).toMatch(UUID);
      expect(suivante.headers.get("x-request-id")).not.toBe(id);
      expect(corps.success).toBe(statut !== 200);
      expect(corps.data?.idRequete).toBe(statut === 200 ? undefined : id);
    },
  );

  it("F-008-AC4 une connexion qui n'envoie pas du HTTP est fermée sans réponse, et le serveur continue de servir", async () => {
    const serveur = await lancerServeur(embarquee.base);

    const recu = await envoyerHorsHttp(serveur);

    expect(recu).toBe("");
    expect((await fetch(`${serveur.url}${CHEMINS.sante}`)).status).toBe(200);
  });
});

describe("en-têtes de sécurité", () => {
  it.each(REPONSES)(
    "F-008-AC9 une réponse %i porte les trois en-têtes exigés et ne révèle aucune version",
    async (statut, base, requete) => {
      const serveur = await lancerServeur(base());

      const reponse = await requete(serveur.url);
      const politique = reponse.headers.get("content-security-policy")?.split(";");
      const visible = `${texteDesEnTetes(reponse)}\n${await reponse.text()}`;

      expect(reponse.status).toBe(statut);
      expect(reponse.headers.get("x-content-type-options")).toBe("nosniff");
      expect(politique).toContain("default-src 'none'");
      expect(politique).toContain("frame-ancestors 'none'");
      expect(reponse.headers.get("referrer-policy")).toBe("no-referrer");
      expect(reponse.headers.has("x-powered-by")).toBe(false);
      expect(reponse.headers.has("etag")).toBe(false);
      expect(visible).not.toMatch(/express|postgres|node\.?js/i);
      expect(visible).not.toContain(process.versions.node);
    },
  );
});

describe("origines", () => {
  function avecOrigine(serveur: ServeurDEssai, origine: string): Promise<Response> {
    return fetch(`${serveur.url}${CHEMINS.sante}`, { headers: { Origin: origine } });
  }

  it("F-008-AC10 avec la liste vide par défaut, aucune origine ne reçoit d'en-tête d'autorisation", async () => {
    const serveur = await lancerServeur(embarquee.base);

    const reponse = await avecOrigine(serveur, ORIGINE_AUTORISEE);

    expect(reponse.status).toBe(200);
    expect(reponse.headers.has("access-control-allow-origin")).toBe(false);
    expect(reponse.headers.has("access-control-allow-credentials")).toBe(false);
    expect(reponse.headers.get("vary")).toBe("Origin");
  });

  it("F-008-AC10 une origine absente de la liste ne reçoit aucun en-tête d'autorisation", async () => {
    const serveur = await lancerServeur(embarquee.base, {
      env: { ORIGINES_AUTORISEES: ORIGINE_AUTORISEE },
    });

    const reponse = await avecOrigine(serveur, AUTRE_ORIGINE);

    expect(reponse.status).toBe(200);
    expect(reponse.headers.has("access-control-allow-origin")).toBe(false);
    expect(reponse.headers.has("access-control-allow-credentials")).toBe(false);
    expect(reponse.headers.get("vary")).toBe("Origin");
  });

  it("F-008-AC10 une origine de la liste reçoit son origine et l'autorisation des identifiants", async () => {
    const serveur = await lancerServeur(embarquee.base, {
      env: { ORIGINES_AUTORISEES: `${AUTRE_ORIGINE},${ORIGINE_AUTORISEE}` },
    });

    const reponse = await avecOrigine(serveur, ORIGINE_AUTORISEE);

    expect(reponse.headers.get("access-control-allow-origin")).toBe(ORIGINE_AUTORISEE);
    expect(reponse.headers.get("access-control-allow-credentials")).toBe("true");
    expect(reponse.headers.get("vary")).toBe("Origin");
  });
});
