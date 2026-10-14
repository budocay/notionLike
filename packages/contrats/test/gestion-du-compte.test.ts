// Contrats de la gestion du compte (F-027-AC19) : chemins, plafonds et schémas stricts des cinq
// routes, que le serveur et l'écran du compte prennent ici.
import { describe, expect, it } from "vitest";

import {
  CHEMINS_DU_COMPTE,
  PLAFONDS_DU_COMPTE,
  ROUTES_DU_COMPTE,
  schemaCorpsChangementDeMotDePasse,
  schemaCorpsChangementDeNom,
  schemaCorpsInscription,
  schemaCorpsRevocation,
  schemaListeSessions,
  schemaRevocationDesAutres,
  schemaSessionDuCompte,
} from "../src/index.ts";
import type { CorpsChangementDeMotDePasse, SessionDuCompte } from "../src/index.ts";

const ID_SESSION = "3f0e7a52-9f4f-4b7e-8a51-1c1f0d6f2b11";
const INSTANT = "2026-10-14T08:30:00.000Z";

const SESSION: SessionDuCompte = {
  idSession: ID_SESSION,
  creeLe: INSTANT,
  prolongeeLe: INSTANT,
  expireLe: "2026-10-21T08:30:00.000Z",
  adresseIp: "203.0.113.7",
  agentUtilisateur: "Mozilla/5.0",
  courante: true,
};

const CHANGEMENT: CorpsChangementDeMotDePasse = {
  motDePasseActuel: "ancien-mot-de-passe",
  nouveauMotDePasse: "nouveau-mot-de-passe",
};

function accepte(schema: { safeParse(valeur: unknown): { success: boolean } }, valeur: unknown) {
  return schema.safeParse(valeur).success;
}

describe("chemins et plafonds publiés", () => {
  it("F-027-AC19 les cinq routes sont publiées sous /api/v1/compte, avec leur méthode", () => {
    expect(CHEMINS_DU_COMPTE).toEqual({
      compte: "/api/v1/compte",
      motDePasse: "/api/v1/compte/mot-de-passe",
      sessions: "/api/v1/compte/sessions",
      revocation: "/api/v1/compte/sessions/:idSession/revocation",
      revocationDesAutres: "/api/v1/compte/sessions/revocation-des-autres",
    });
    expect(ROUTES_DU_COMPTE.map(({ methode, chemin }) => `${methode} ${chemin}`)).toEqual([
      "PATCH /api/v1/compte",
      "POST /api/v1/compte/mot-de-passe",
      "GET /api/v1/compte/sessions",
      "POST /api/v1/compte/sessions/:idSession/revocation",
      "POST /api/v1/compte/sessions/revocation-des-autres",
    ]);
  });

  it("F-027-AC19 F-027-AC9 F-027-AC15 les plafonds de la liste et du débit sont publiés", () => {
    expect(PLAFONDS_DU_COMPTE).toEqual({
      sessionsListees: 100,
      agentUtilisateur: 300,
      actionsSensibles: { fenetreS: 60, max: 5 },
      requetes: { fenetreS: 60, max: 30 },
    });
  });
});

describe("corps du changement de nom", () => {
  it.each(["n", "n".repeat(100), " Ada ", "Ada Lovelace"])(
    "F-027-AC1 le nom %j est accepté tel quel",
    (nom) => {
      expect(schemaCorpsChangementDeNom.parse({ nom })).toEqual({ nom });
    },
  );

  it.each([
    ["nom absent", {}],
    ["nom vide", { nom: "" }],
    ["nom fait de blancs", { nom: " \t\n" }],
    ["nom de 101 caractères", { nom: "n".repeat(101) }],
    ["nom qui n'est pas un texte", { nom: 12 }],
    ["courriel en plus", { nom: "Ada", courriel: "autre@exemple.test" }],
    ["email en plus", { nom: "Ada", email: "autre@exemple.test" }],
    ["image en plus", { nom: "Ada", image: "https://exemple.test/a.png" }],
    ["emailVerified en plus", { nom: "Ada", emailVerified: true }],
    ["id en plus", { nom: "Ada", id: ID_SESSION }],
  ])("F-027-AC2 le corps est refusé : %s", (_cas, corps) => {
    expect(accepte(schemaCorpsChangementDeNom, corps)).toBe(false);
  });

  it("F-027-AC1 les bornes du nom sont celles de l'inscription (F-009-AC4)", () => {
    for (const nom of ["", " ", "n".repeat(100), "n".repeat(101), "Ada"]) {
      const inscription = schemaCorpsInscription.safeParse({
        name: nom,
        email: "ada@exemple.test",
        password: "douze-signes",
      }).success;
      expect(accepte(schemaCorpsChangementDeNom, { nom }), nom).toBe(inscription);
    }
  });
});

describe("corps du changement de mot de passe et des révocations", () => {
  it("F-027-AC4 un corps aux bornes est accepté tel quel", () => {
    const auxBornes = { motDePasseActuel: "m".repeat(128), nouveauMotDePasse: "n".repeat(12) };

    expect(schemaCorpsChangementDeMotDePasse.parse(CHANGEMENT)).toEqual(CHANGEMENT);
    expect(schemaCorpsChangementDeMotDePasse.parse(auxBornes)).toEqual(auxBornes);
    expect(
      accepte(schemaCorpsChangementDeMotDePasse, {
        ...CHANGEMENT,
        nouveauMotDePasse: "n".repeat(128),
      }),
    ).toBe(true);
  });

  it.each([
    ["nouveau mot de passe absent", { motDePasseActuel: "ancien" }],
    ["nouveau mot de passe de 11 caractères", { ...CHANGEMENT, nouveauMotDePasse: "n".repeat(11) }],
    [
      "nouveau mot de passe de 129 caractères",
      { ...CHANGEMENT, nouveauMotDePasse: "n".repeat(129) },
    ],
    ["mot de passe actuel absent", { nouveauMotDePasse: CHANGEMENT.nouveauMotDePasse }],
    ["mot de passe actuel de 129 caractères", { ...CHANGEMENT, motDePasseActuel: "m".repeat(129) }],
    ["champ inconnu", { ...CHANGEMENT, revokeOtherSessions: false }],
    ["mot de passe qui n'est pas un texte", { ...CHANGEMENT, motDePasseActuel: 12 }],
  ])("F-027-AC7 le corps du changement est refusé : %s", (_cas, corps) => {
    expect(accepte(schemaCorpsChangementDeMotDePasse, corps)).toBe(false);
  });

  it.each([
    ["mot de passe actuel absent", {}],
    ["mot de passe actuel de 129 caractères", { motDePasseActuel: "m".repeat(129) }],
    ["champ inconnu", { motDePasseActuel: "ancien", token: "jeton" }],
  ])("F-027-AC7 le corps d'une révocation est refusé : %s", (_cas, corps) => {
    expect(accepte(schemaCorpsRevocation, corps)).toBe(false);
  });

  it("F-027-AC10 F-027-AC12 le corps d'une révocation ne porte que le mot de passe actuel", () => {
    expect(schemaCorpsRevocation.parse({ motDePasseActuel: "ancien" })).toEqual({
      motDePasseActuel: "ancien",
    });
  });
});

describe("réponses", () => {
  it("F-027-AC9 une session de la liste est rendue telle quelle, adresse et agent nuls compris", () => {
    const sansTrace = { ...SESSION, adresseIp: null, agentUtilisateur: null, courante: false };

    expect(schemaListeSessions.parse({ sessions: [SESSION, sansTrace] })).toEqual({
      sessions: [SESSION, sansTrace],
    });
  });

  it.each([
    ["un jeton en plus", { ...SESSION, token: "jeton" }],
    ["un identifiant de compte en plus", { ...SESSION, userId: ID_SESSION }],
    ["un identifiant qui n'est pas un uuid canonique", { ...SESSION, idSession: "ABC" }],
    ["un agent de 301 caractères", { ...SESSION, agentUtilisateur: "a".repeat(301) }],
    ["une date qui n'est pas un instant ISO", { ...SESSION, creeLe: "hier" }],
    ["la marque de session courante absente", { ...SESSION, courante: undefined }],
  ])("F-027-AC9 une session est refusée : %s", (_cas, session) => {
    expect(accepte(schemaSessionDuCompte, session)).toBe(false);
  });

  it("F-027-AC9 la liste est refusée au-delà de 100 sessions", () => {
    const sessions = Array.from({ length: 101 }, () => SESSION);

    expect(accepte(schemaListeSessions, { sessions: sessions.slice(0, 100) })).toBe(true);
    expect(accepte(schemaListeSessions, { sessions })).toBe(false);
  });

  it("F-027-AC12 la révocation des autres rend un nombre entier positif ou nul, rien d'autre", () => {
    expect(schemaRevocationDesAutres.parse({ supprimees: 0 })).toEqual({ supprimees: 0 });
    for (const corps of [
      { supprimees: -1 },
      { supprimees: 1.5 },
      { supprimees: 2, total: 3 },
      {},
    ]) {
      expect(accepte(schemaRevocationDesAutres, corps)).toBe(false);
    }
  });
});
