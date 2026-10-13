// Client d'authentification de F-010 (module de F-010-AC22) : classement de `{ data, error }`,
// `Retry-After`, délai, jeton jamais rendu, base des requêtes. Le serveur est simulé derrière
// `fetch`, et ses réponses sont validées contre `packages/contrats` (F-010-AC27).
import {
  CHEMINS_COMPTES,
  schemaCorpsConnexion,
  schemaCorpsInscription,
} from "@notionlike/contrats";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CODE_NATIF_COMPTE_EXISTANT,
  CODE_NATIF_IDENTIFIANTS_INVALIDES,
  type ClientDeCompte,
  creerClientDeCompte,
  delaiDeRetryAfter,
} from "../src/compte/client-auth.ts";
import { DELAI_DE_REPONSE_MS } from "../src/compte/moi.ts";
import {
  COMPTE,
  compteNatif,
  deconnexionReussie,
  enveloppe,
  ID_REQUETE,
  jamais,
  JETON,
  json,
  MOT_DE_PASSE,
  natif,
  pageHtml,
  ROUTES,
  type ServeurSimule,
  serveurSimule,
} from "./aides-compte.tsx";

const INSCRIPTION = { name: COMPTE.nom, email: COMPTE.courriel, password: MOT_DE_PASSE };
const CONNEXION = { email: COMPTE.courriel, password: MOT_DE_PASSE };

function client(serveur: ServeurSimule): ClientDeCompte {
  return creerClientDeCompte({ requeter: serveur.requeter });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  window.localStorage.clear();
});

describe("classement des réponses : deux familles de codes", () => {
  it("F-010-AC14 un succès d'inscription, de connexion ou de déconnexion est un succès, sans rien d'autre", async () => {
    const serveur = serveurSimule({
      [ROUTES.inscription]: () => compteNatif(),
      [ROUTES.connexion]: () => compteNatif(),
      [ROUTES.deconnexion]: deconnexionReussie,
    });
    const c = client(serveur);

    expect(await c.inscrire(INSCRIPTION)).toEqual({ ok: true });
    expect(await c.connecter(CONNEXION)).toEqual({ ok: true });
    expect(await c.deconnecter()).toEqual({ ok: true });
  });

  it("F-010-AC14 le code natif « compte existant » à l'inscription, « identifiants invalides » à la connexion", async () => {
    const serveur = serveurSimule({
      [ROUTES.inscription]: () => natif(422, CODE_NATIF_COMPTE_EXISTANT),
      [ROUTES.connexion]: () => natif(401, CODE_NATIF_IDENTIFIANTS_INVALIDES),
    });
    const c = client(serveur);

    expect(await c.inscrire(INSCRIPTION)).toEqual({
      ok: false,
      erreur: { type: "compte-existant" },
    });
    expect(await c.connecter(CONNEXION)).toEqual({
      ok: false,
      erreur: { type: "identifiants-invalides" },
    });
  });

  it("F-010-AC14 F-010-AC17 un code natif inconnu, ou attendu par l'autre écran, est générique", async () => {
    const serveur = serveurSimule({
      [ROUTES.inscription]: () => natif(400, CODE_NATIF_IDENTIFIANTS_INVALIDES),
      [ROUTES.connexion]: () => natif(400, "PASSWORD_TOO_SHORT"),
    });
    const c = client(serveur);

    expect(await c.inscrire(INSCRIPTION)).toEqual({ ok: false, erreur: { type: "generique" } });
    expect(await c.connecter(CONNEXION)).toEqual({ ok: false, erreur: { type: "generique" } });
  });

  it.each([
    [400, "requete-invalide"],
    [500, "erreur-interne"],
    [503, "base-indisponible"],
    [403, "origine-refusee"],
  ] as const)(
    "F-010-AC16 un %i portant l'enveloppe « %s » rend son code et son identifiant de requête",
    async (statut, code) => {
      const serveur = serveurSimule({ [ROUTES.connexion]: () => enveloppe(statut, code) });

      expect(await client(serveur).connecter(CONNEXION)).toEqual({
        ok: false,
        erreur: { type: "enveloppe", code, idRequete: ID_REQUETE },
      });
    },
  );

  it.each([
    [
      "un 403 sans corps (origine refusée de F-009-AC16)",
      () => new Response(null, { status: 403 }),
    ],
    ["un 500 en HTML", () => pageHtml(500)],
    [
      "un code d'enveloppe inconnu",
      () => json(400, { code: "code-futur", message: "x", idRequete: "r" }),
    ],
    [
      "une enveloppe sans identifiant de requête",
      () => json(500, { code: "erreur-interne", message: "x" }),
    ],
  ])("F-010-AC17 %s : message générique", async (_cas, reponse) => {
    const serveur = serveurSimule({ [ROUTES.deconnexion]: reponse });

    expect(await client(serveur).deconnecter()).toEqual({
      ok: false,
      erreur: { type: "generique" },
    });
  });

  it.each([
    ["la page HTML de repli d'un serveur de développement", () => pageHtml(200)],
    ["un `user` hors du schéma natif", () => json(200, { token: JETON, user: { id: "x" } })],
    ["un corps sans `user`", () => json(200, { token: JETON })],
    ["un corps vide", () => new Response("", { status: 200 })],
  ])(
    "F-010-AC17 une inscription ou une connexion qui reçoit un 200 avec %s échoue",
    async (_cas, reponse) => {
      const serveur = serveurSimule({
        [ROUTES.inscription]: reponse,
        [ROUTES.connexion]: reponse,
        [ROUTES.deconnexion]: reponse,
      });
      const c = client(serveur);
      const echec = { ok: false, erreur: { type: "generique" } };

      expect(await c.inscrire(INSCRIPTION)).toEqual(echec);
      expect(await c.connecter(CONNEXION)).toEqual(echec);
      expect(await c.deconnecter()).toEqual(echec);
    },
  );

  it("F-010-AC17 un échec réseau, que le client lève, est intercepté : serveur hors ligne", async () => {
    const c = client(serveurSimule());

    expect(await c.inscrire(INSCRIPTION)).toEqual({ ok: false, erreur: { type: "hors-ligne" } });
    expect(await c.connecter(CONNEXION)).toEqual({ ok: false, erreur: { type: "hors-ligne" } });
    expect(await c.deconnecter()).toEqual({ ok: false, erreur: { type: "hors-ligne" } });
  });

  it("F-010-AC17 sans réponse en 10 secondes, l'appel est abandonné : serveur hors ligne, sans rejet non géré", async () => {
    vi.useFakeTimers();
    const serveur = serveurSimule({ [ROUTES.connexion]: jamais });
    let resultat: unknown;
    void client(serveur)
      .connecter(CONNEXION)
      .then((rendu) => (resultat = rendu));

    await vi.advanceTimersByTimeAsync(DELAI_DE_REPONSE_MS - 1);
    expect(resultat).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);

    expect(DELAI_DE_REPONSE_MS).toBe(10_000);
    expect(resultat).toEqual({ ok: false, erreur: { type: "hors-ligne" } });
  });
});

describe("trop de requêtes : le statut et Retry-After seulement", () => {
  it.each([
    ["natif (F-009-AC14)", () => natif(429, "TOO_MANY_REQUESTS", { "Retry-After": "7" }), 7],
    [
      "d'enveloppe (F-009-AC31)",
      () => enveloppe(429, "trop-de-requetes", { "Retry-After": "12" }),
      12,
    ],
    ["sans corps", () => new Response(null, { status: 429, headers: { "Retry-After": "3" } }), 3],
  ])(
    "F-010-AC15 un 429 %s : délai lu par le crochet de réponse",
    async (_cas, reponse, secondes) => {
      const serveur = serveurSimule({ [ROUTES.connexion]: reponse });

      expect(await client(serveur).connecter(CONNEXION)).toEqual({
        ok: false,
        erreur: { type: "trop-de-tentatives", delaiSecondes: secondes },
      });
    },
  );

  it.each([
    [null, 60],
    ["", 60],
    ["abc", 60],
    ["0", 60],
    ["61", 60],
    ["-5", 60],
    ["2.5", 60],
    ["Wed, 21 Oct 2026 07:28:00 GMT", 60],
    ["1", 1],
    [" 30 ", 30],
    ["60", 60],
  ])("F-010-AC15 Retry-After « %s » donne %i secondes", (valeur, secondes) => {
    expect(delaiDeRetryAfter(valeur)).toBe(secondes);
  });
});

describe("jeton, base et contrats", () => {
  it("F-010-AC20 le résultat ne porte ni `data` ni le jeton ; aucune requête ne porte d'en-tête Authorization ni le jeton", async () => {
    const serveur = serveurSimule({
      [ROUTES.inscription]: () => compteNatif(),
      [ROUTES.connexion]: () => compteNatif(),
      [ROUTES.deconnexion]: deconnexionReussie,
    });
    const c = client(serveur);

    const resultats = [
      await c.inscrire(INSCRIPTION),
      await c.connecter(CONNEXION),
      await c.deconnecter(),
    ];

    for (const resultat of resultats) {
      expect(Object.keys(resultat)).toEqual(["ok"]);
      expect(JSON.stringify(resultat)).not.toContain(JETON);
    }
    expect(serveur.requetes).toHaveLength(3);
    for (const requete of serveur.requetes) {
      expect(requete.entetes.has("authorization")).toBe(false);
      expect(`${requete.adresse.href} ${requete.corps ?? ""}`).not.toContain(JETON);
    }
  });

  it("F-010-AC21 F-010-AC27 les requêtes partent vers l'origine courante, aux chemins publiés par contrats, même avec BETTER_AUTH_URL définie", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://ailleurs.example");
    vi.stubEnv("NEXT_PUBLIC_BETTER_AUTH_URL", "https://ailleurs.example");
    const serveur = serveurSimule({
      [ROUTES.inscription]: () => compteNatif(),
      [ROUTES.connexion]: () => compteNatif(),
      [ROUTES.deconnexion]: deconnexionReussie,
    });
    const c = client(serveur);

    await c.inscrire(INSCRIPTION);
    await c.connecter(CONNEXION);
    await c.deconnecter();

    expect(serveur.requetes.map(({ adresse }) => adresse.href)).toEqual([
      `${window.location.origin}${CHEMINS_COMPTES.inscription}`,
      `${window.location.origin}${CHEMINS_COMPTES.connexion}`,
      `${window.location.origin}${CHEMINS_COMPTES.deconnexion}`,
    ]);
  });

  it("F-010-AC27 les corps envoyés sont conformes aux schémas d'inscription et de connexion de contrats", async () => {
    const serveur = serveurSimule({
      [ROUTES.inscription]: () => compteNatif(),
      [ROUTES.connexion]: () => compteNatif(),
    });
    const c = client(serveur);

    await c.inscrire(INSCRIPTION);
    await c.connecter(CONNEXION);

    const [inscription, connexion] = serveur.requetes.map(({ corps }) => JSON.parse(corps ?? ""));
    expect(schemaCorpsInscription.parse(inscription)).toEqual(INSCRIPTION);
    expect(schemaCorpsConnexion.parse(connexion)).toEqual(CONNEXION);
  });

  it("F-010-AC22 sans greffon de requête par défaut : une réponse qui demande une redirection ne fait pas naviguer", async () => {
    const avant = window.location.href;
    const serveur = serveurSimule({
      [ROUTES.connexion]: () =>
        json(200, {
          redirect: true,
          url: "https://ailleurs.example/piege",
          token: JETON,
          user: { id: COMPTE.id, name: COMPTE.nom, email: COMPTE.courriel },
        }),
    });

    expect(await client(serveur).connecter(CONNEXION)).toEqual({ ok: true });
    expect(window.location.href).toBe(avant);
  });

  it("F-010-AC4 F-010-AC19 les trois appels n'appellent jamais get-session et n'écrivent rien dans le stockage, même après le délai du signal de session", async () => {
    const serveur = serveurSimule({
      [ROUTES.inscription]: () => compteNatif(),
      [ROUTES.connexion]: () => compteNatif(),
      [ROUTES.deconnexion]: deconnexionReussie,
    });
    const c = client(serveur);

    await c.inscrire(INSCRIPTION);
    await c.connecter(CONNEXION);
    await c.deconnecter();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(serveur.routesAppelees()).toEqual([
      ROUTES.inscription,
      ROUTES.connexion,
      ROUTES.deconnexion,
    ]);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
