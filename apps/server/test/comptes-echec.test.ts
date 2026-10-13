// Ce que la route rend quand better-auth annonce une réponse mais que l'opération a échoué
// (F-009-AC20, AC26) : l'enveloppe `erreur-interne`, et des cookies de better-auth, seulement ceux
// qui effacent. L'authentification est remplacée par une doublure, qui rend la réponse choisie.
import { Writable } from "node:stream";

import { CHEMINS_COMPTES } from "@notionlike/contrats";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";

import type { Authentification, Traitement } from "../src/authentification.ts";
import { monterLesComptes } from "../src/comptes.ts";
import { creerCompteurs } from "../src/debit.ts";
import { creerGestionnaireDErreurs, identifierLaRequete } from "../src/enveloppe.ts";
import { creerJournal } from "../src/journal.ts";
import { demarrerServeur } from "../src/serveur.ts";
import { enveloppeDe, URL_PUBLIQUE_D_ESSAI } from "./aides.ts";
import { corpsUnique } from "./aides-comptes.ts";

const POSE =
  "better-auth.session_token=jeton.signature; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax";
const EFFACE = "better-auth.session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax";

const arrets: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(arrets.splice(0).map((arreter) => arreter()));
});

// Un serveur dont l'authentification rend, pour toute requête, le traitement donné.
async function servirAvec(traitement: Traitement) {
  const doublure: Authentification = {
    traiter: () => Promise.resolve(traitement),
    deconnecter: () => Promise.resolve(traitement),
    lireLaSession: () => Promise.resolve(undefined),
  };
  const journal = creerJournal(new Writable({ write: (_morceau, _encodage, fin) => fin() }));
  const application = express();
  application.use(identifierLaRequete);
  monterLesComptes(application, {
    authentification: doublure,
    journal,
    consommer: creerCompteurs(),
    proxysDeConfiance: 0,
    urlPublique: URL_PUBLIQUE_D_ESSAI,
  });
  application.use(creerGestionnaireDErreurs(journal));
  const ecoute = await demarrerServeur({
    application,
    hote: "127.0.0.1",
    port: 0,
    delaiArretMs: 100,
  });
  arrets.push(ecoute.arreter);
  return { url: `http://127.0.0.1:${String(ecoute.port)}` };
}

function inscrireAupres(url: string): Promise<Response> {
  return fetch(`${url}${CHEMINS_COMPTES.inscription}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: URL_PUBLIQUE_D_ESSAI },
    body: JSON.stringify(corpsUnique()),
  });
}

function reponseNative(statut: number, cookies: readonly string[]): Response {
  const enTetes = new Headers({ "Content-Type": "application/json" });
  for (const cookie of cookies) {
    enTetes.append("Set-Cookie", cookie);
  }
  return new Response(JSON.stringify({ token: "jeton", user: {} }), {
    status: statut,
    headers: enTetes,
  });
}

describe("opération en échec derrière une réponse native", () => {
  it.each<[string, Traitement]>([
    [
      "une erreur que better-auth a tue",
      { supprimees: [], erreurTaie: new Error("tue"), reponse: reponseNative(200, [POSE, EFFACE]) },
    ],
    [
      "une suppression de session en échec",
      {
        supprimees: [],
        suppressionEnEchec: new Error("refus"),
        reponse: reponseNative(200, [POSE, EFFACE]),
      },
    ],
    ["une réponse native 500", { supprimees: [], reponse: reponseNative(500, [POSE, EFFACE]) }],
  ])(
    "F-009-AC20 F-009-AC26 %s : 500 erreur-interne, sans le cookie de session posé, avec son effacement",
    async (_cas, traitement) => {
      const serveur = await servirAvec(traitement);

      const reponse = await inscrireAupres(serveur.url);

      expect(reponse.status).toBe(500);
      expect((await enveloppeDe(reponse)).code).toBe("erreur-interne");
      expect(reponse.headers.getSetCookie()).toEqual([EFFACE]);
    },
  );

  it("F-009-AC20 le témoin : une réponse native 200 sans échec est rendue telle quelle, cookies compris", async () => {
    const serveur = await servirAvec({ supprimees: [], reponse: reponseNative(200, [POSE]) });

    const reponse = await inscrireAupres(serveur.url);

    expect(reponse.status).toBe(200);
    expect(reponse.headers.getSetCookie()).toEqual([POSE]);
  });
});
