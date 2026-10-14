// Client de la gestion du compte et coutures du client (F-027-AC27) : chemins relatifs du contrat,
// réponses validées contre les schémas avant tout affichage, erreurs classées, formes d'adresse
// reconnues, et le module d'état du compte de F-010-AC28 sans interface nouvelle.
import { CHEMINS_DU_COMPTE } from "@notionlike/contrats";
import { describe, expect, it } from "vitest";

import { creerClientDeLaGestionDuCompte } from "../src/compte/client-gestion-du-compte.ts";
import { suivreLeCompte } from "../src/compte/suivi-du-compte.ts";
import {
  estLEcranDuCompte,
  FRAGMENT_DU_COMPTE,
  fragmentDe,
  lireEcranDEspaces,
  lireRoute,
} from "../src/navigation/route.ts";
import { enveloppe, json, MOT_DE_PASSE, pageHtml, serveurSimule } from "./aides-compte.tsx";
import { lireDossier } from "./aides-disque.ts";
import {
  AUTRE_SESSION,
  autres200,
  compte200,
  G,
  ID_AUTRE_SESSION,
  NOUVEAU_MOT_DE_PASSE,
  SESSION_COURANTE,
  sessions200,
  vide204,
} from "./aides-gestion-du-compte.tsx";

const PAGE = "0b9c6c8e-7d1a-4c55-9b0e-2f4b8a6d1e01";

describe("client de la gestion du compte", () => {
  it("F-027-AC27 les cinq appels partent vers les chemins relatifs du contrat, sur l'origine de l'application, corps au schéma, sans en-tête Authorization", async () => {
    const serveur = serveurSimule({
      [G.nom]: () => compte200("Alice M."),
      [G.motDePasse]: () => vide204(),
      [G.sessions]: () => sessions200([SESSION_COURANTE, AUTRE_SESSION]),
      [G.revocation()]: () => vide204(),
      [G.autres]: () => autres200(2),
    });
    const client = creerClientDeLaGestionDuCompte(serveur.requeter);

    expect(await client.changerLeNom({ nom: "Alice M." })).toMatchObject({ ok: true });
    expect(
      await client.changerLeMotDePasse({
        motDePasseActuel: MOT_DE_PASSE,
        nouveauMotDePasse: NOUVEAU_MOT_DE_PASSE,
      }),
    ).toEqual({ ok: true, valeur: null });
    expect(await client.listerLesSessions()).toEqual({
      ok: true,
      valeur: [SESSION_COURANTE, AUTRE_SESSION],
    });
    expect(
      await client.revoquerUneSession(ID_AUTRE_SESSION, { motDePasseActuel: MOT_DE_PASSE }),
    ).toEqual({ ok: true, valeur: null });
    expect(await client.revoquerLesAutres({ motDePasseActuel: MOT_DE_PASSE })).toEqual({
      ok: true,
      valeur: 2,
    });

    expect(serveur.routesAppelees()).toEqual([
      G.nom,
      G.motDePasse,
      G.sessions,
      G.revocation(),
      G.autres,
    ]);
    expect(serveur.requetes.map((requete) => requete.adresse.pathname)).toEqual([
      CHEMINS_DU_COMPTE.compte,
      CHEMINS_DU_COMPTE.motDePasse,
      CHEMINS_DU_COMPTE.sessions,
      `/api/v1/compte/sessions/${ID_AUTRE_SESSION}/revocation`,
      CHEMINS_DU_COMPTE.revocationDesAutres,
    ]);
    for (const requete of serveur.requetes) {
      expect(requete.adresse.origin).toBe(window.location.origin);
      expect(requete.entetes.has("authorization")).toBe(false);
    }
    expect(serveur.requetes.map((requete) => requete.corps)).toEqual([
      JSON.stringify({ nom: "Alice M." }),
      JSON.stringify({ motDePasseActuel: MOT_DE_PASSE, nouveauMotDePasse: NOUVEAU_MOT_DE_PASSE }),
      undefined,
      JSON.stringify({ motDePasseActuel: MOT_DE_PASSE }),
      JSON.stringify({ motDePasseActuel: MOT_DE_PASSE }),
    ]);
  });

  it("F-027-AC27 F-027-AC9 une réponse 200 non conforme au schéma strict n'est jamais rendue : champ en trop (jeton), forme fausse, page HTML", async () => {
    const serveur = serveurSimule();
    const client = creerClientDeLaGestionDuCompte(serveur.requeter);
    const generique = { ok: false, erreur: { type: "generique" } };

    serveur.poser(G.sessions, () =>
      json(200, { sessions: [{ ...SESSION_COURANTE, jeton: "jeton-secret" }] }),
    );
    expect(await client.listerLesSessions()).toEqual(generique);
    serveur.poser(G.sessions, () =>
      json(200, { sessions: [{ ...SESSION_COURANTE, courante: 1 }] }),
    );
    expect(await client.listerLesSessions()).toEqual(generique);
    serveur.poser(G.sessions, () => pageHtml());
    expect(await client.listerLesSessions()).toEqual(generique);
    serveur.poser(G.nom, () => json(200, { id: SESSION_COURANTE.idSession, nom: "x" }));
    expect(await client.changerLeNom({ nom: "x" })).toEqual(generique);
    serveur.poser(G.autres, () => json(200, { supprimees: -1 }));
    expect(await client.revoquerLesAutres({ motDePasseActuel: MOT_DE_PASSE })).toEqual(generique);
  });

  it("F-027-AC25 F-027-AC27 les deux codes de F-027, le 404, le 401, le 429 et son délai, et l'échec réseau sont classés", async () => {
    const serveur = serveurSimule({
      [G.revocation()]: () => enveloppe(403, "mot-de-passe-incorrect"),
      [G.autres]: () => enveloppe(429, "trop-de-requetes", { "Retry-After": "7" }),
      [G.nom]: () => enveloppe(401, "non-authentifie"),
    });
    const client = creerClientDeLaGestionDuCompte(serveur.requeter);
    const corps = { motDePasseActuel: MOT_DE_PASSE };

    expect(await client.revoquerUneSession(ID_AUTRE_SESSION, corps)).toMatchObject({
      ok: false,
      erreur: { type: "enveloppe", code: "mot-de-passe-incorrect" },
    });
    serveur.poser(G.revocation(), () => enveloppe(409, "session-courante"));
    expect(await client.revoquerUneSession(ID_AUTRE_SESSION, corps)).toMatchObject({
      erreur: { type: "enveloppe", code: "session-courante" },
    });
    serveur.poser(G.revocation(), () => enveloppe(404, "ressource-introuvable"));
    expect(await client.revoquerUneSession(ID_AUTRE_SESSION, corps)).toMatchObject({
      erreur: { type: "enveloppe", code: "ressource-introuvable" },
    });
    expect(await client.revoquerLesAutres(corps)).toEqual({
      ok: false,
      erreur: { type: "trop-de-requetes", delaiSecondes: 7 },
    });
    expect(await client.changerLeNom({ nom: "x" })).toMatchObject({
      erreur: { type: "enveloppe", code: "non-authentifie" },
    });
    expect(await client.listerLesSessions()).toEqual({ ok: false, erreur: { type: "hors-ligne" } });
  });

  it("F-027-AC23 F-027-AC27 un corps hors du schéma n'est jamais envoyé : nouveau mot de passe trop court, nom fait de blancs, champ en trop", async () => {
    const serveur = serveurSimule({ [G.motDePasse]: () => vide204(), [G.nom]: () => vide204() });
    const client = creerClientDeLaGestionDuCompte(serveur.requeter);

    expect(
      await client.changerLeMotDePasse({
        motDePasseActuel: MOT_DE_PASSE,
        nouveauMotDePasse: "court",
      }),
    ).toEqual({ ok: false, erreur: { type: "generique" } });
    expect(await client.changerLeNom({ nom: "   " })).toEqual({
      ok: false,
      erreur: { type: "generique" },
    });
    expect(
      await client.changerLeNom({ nom: "Alice", courriel: "x@y.fr" } as unknown as { nom: string }),
    ).toEqual({ ok: false, erreur: { type: "generique" } });
    expect(serveur.requetes).toEqual([]);
  });
});

// ── F-027-AC27 : coutures du client ──────────────────────────────────────────────────────────

const sources = new Map([...lireDossier("src")].filter(([chemin]) => /\.tsx?$/.test(chemin)));
const FICHIERS_DE_F027 = [
  "src/compte/client-gestion-du-compte.ts",
  "src/interface/EcranDuCompte.tsx",
  "src/interface/MotDePasseDuCompte.tsx",
  "src/interface/SessionsDuCompte.tsx",
  "src/interface/RevocationDeSession.tsx",
  "src/interface/outils-gestion-du-compte.ts",
  "src/interface/messages-gestion-du-compte.ts",
];

/** Fichiers qui passent par le client d'authentification de F-010-AC22. */
function passentParLeClientDAuthentification(fichiers: ReadonlyMap<string, string>): string[] {
  return [...fichiers]
    .filter(([, texte]) =>
      /client-auth|\bcompte\.client\b|\.client\.(?:inscrire|connecter)/.test(texte),
    )
    .map(([chemin]) => chemin);
}

describe("coutures du client (F-027-AC27)", () => {
  it("F-027-AC27 les formes d'adresse reconnues : celles de F-002, F-010 et F-014 inchangées ; #/compte, forme exacte, jamais prise pour une page ni pour un écran d'espaces", () => {
    expect(lireRoute(`#/page/${PAGE}`)).toEqual({ forme: "page", idPage: PAGE });
    expect(lireRoute("#/page/x")).toEqual({ forme: "page-introuvable" });
    expect(lireRoute("#/page/compte")).toEqual({ forme: "page-introuvable" });
    expect(lireRoute("#/connexion")).toEqual({ forme: "connexion" });
    expect(lireRoute("#/inscription")).toEqual({ forme: "inscription" });
    expect(lireEcranDEspaces("#/espaces")).toEqual({ ecran: "espaces" });
    expect(lireEcranDEspaces(`#/espaces/${PAGE}`)).toEqual({ ecran: "espace", idEspace: PAGE });
    expect(lireEcranDEspaces("#/invitation")).toEqual({ ecran: "invitation" });
    expect(FRAGMENT_DU_COMPTE).toBe("#/compte");
    expect(estLEcranDuCompte("#/compte")).toBe(true);
    for (const fragment of [
      "#/compte",
      "#/compte/",
      "#/compte?retour=x",
      "#/compte/sessions",
      "#/Compte",
      "#compte",
    ]) {
      expect(lireRoute(fragment), fragment).toEqual({ forme: "accueil" });
      expect(lireEcranDEspaces(fragment), fragment).toBeUndefined();
    }
    for (const fragment of [
      "#/compte/",
      "#/compte?retour=x",
      "#/compte/sessions",
      "#/Compte",
      "#compte",
      "#/",
      `#/page/${PAGE}`,
      "#/connexion",
      "#/espaces",
    ]) {
      expect(estLEcranDuCompte(fragment), fragment).toBe(false);
    }
    expect(fragmentDe({ forme: "accueil" })).toBe("#/");
  });

  it("F-027-AC27 aucun module de F-027 ne passe par le client d'authentification, et un seul appelle les routes du compte", () => {
    for (const chemin of FICHIERS_DE_F027) {
      expect(sources.has(chemin), chemin).toBe(true);
    }
    expect(
      passentParLeClientDAuthentification(
        new Map(FICHIERS_DE_F027.map((c) => [c, sources.get(c) ?? ""])),
      ),
    ).toEqual([]);
    const appelants = [...sources]
      .filter(([, texte]) => /\bCHEMINS_DU_COMPTE\b/.test(texte))
      .map(([chemin]) => chemin);
    expect(appelants).toEqual(["src/compte/client-gestion-du-compte.ts"]);
  });

  it("F-027-AC27 un passage par le client d'authentification est nommé", () => {
    expect(
      passentParLeClientDAuthentification(
        new Map([
          ["src/a.ts", 'import { creerClientDeCompte } from "../compte/client-auth.ts";'],
          ["src/b.tsx", "await compte.client.deconnecter();"],
          ["src/c.tsx", "await moyens.compte.gestion.changerLeNom(corps);"],
        ]),
      ),
    ).toEqual(["src/a.ts", "src/b.tsx"]);
  });

  it("F-027-AC27 le module d'état du compte de F-010-AC28 garde son interface : lecture, abonnement, revérification, fermeture", () => {
    const suivi = suivreLeCompte(serveurSimule().requeter);
    expect(Object.keys(suivi).sort()).toEqual(["abonner", "fermer", "lire", "reverifier"]);
    suivi.fermer();
    const module = sources.get("src/compte/suivi-du-compte.ts") ?? "";
    expect(module).not.toMatch(/gestion|F-027/);
  });
});
