// Contrôles statiques de F-010 : chacun passe sur les fichiers réels, lus sur le disque, et voit un
// cas fautif donné comme donnée de test.
import { CODES_ERREUR } from "@notionlike/contrats";
import { describe, expect, it } from "vitest";

import { MESSAGES_DES_CODES } from "../src/compte/messages-erreur.ts";
import { validerConnexion, validerInscription } from "../src/compte/validation.ts";
import { fragmentDe, lireRoute } from "../src/navigation/route.ts";
import { lire, lireDossier } from "./aides-disque.ts";

const sources = new Map([...lireDossier("src")].filter(([chemin]) => /\.tsx?$/.test(chemin)));
const FICHIERS_DU_COMPTE = [...sources.keys()].filter((chemin) =>
  /^src\/(compte\/|interface\/(ZoneDeCompte|EcranDeCompte|messages-compte))/.test(chemin),
);

// ── F-010-AC4 : l'atome de session du client n'est jamais lu ──────────────────────────────────

const LECTURE_DE_SESSION =
  /\buseSession\b|\$store\b|\bgetSession\b|["']better-auth\/react["']|get-session/g;

function lecturesDeSession(fichiers: ReadonlyMap<string, string>): string[] {
  return [...fichiers].flatMap(([chemin, texte]) =>
    [...texte.matchAll(LECTURE_DE_SESSION)].map(([trouve]) => `${chemin} : ${trouve}`),
  );
}

describe("atome de session", () => {
  it("F-010-AC4 aucun module d'apps/web n'emploie useSession, $store, getSession, better-auth/react ni get-session", () => {
    expect(sources.size).toBeGreaterThan(50);
    expect(lecturesDeSession(sources)).toEqual([]);
  });

  it("F-010-AC4 chaque emploi interdit est nommé avec son fichier", () => {
    expect(
      lecturesDeSession(
        new Map([
          ["src/a.ts", "const { data } = client.useSession();"],
          ["src/b.ts", "client.$store.atoms.session.get();"],
          ["src/c.ts", "await client.getSession();"],
          ["src/d.ts", 'import { createAuthClient } from "better-auth/react";'],
          ["src/e.ts", 'fetch("/api/auth/get-session");'],
          ["src/f.ts", "const sessionUtile = 1;"],
        ]),
      ),
    ).toEqual([
      "src/a.ts : useSession",
      "src/b.ts : $store",
      "src/c.ts : getSession",
      'src/d.ts : "better-auth/react"',
      "src/e.ts : get-session",
    ]);
  });
});

// ── F-010-AC22 : un seul module importe le client, par son seul sous-chemin ───────────────────

const SPECIFICATEUR_BETTER_AUTH =
  /(?:\bfrom\s*|\bimport\s*\(?\s*)["'`]((?:@better-auth\/|better-auth)[^"'`]*)["'`]/g;

function importsDeBetterAuth(fichiers: ReadonlyMap<string, string>): string[] {
  return [...fichiers].flatMap(([chemin, texte]) =>
    [...texte.matchAll(SPECIFICATEUR_BETTER_AUTH)].map(([, cible]) => `${chemin} -> ${cible}`),
  );
}

describe("client d'authentification confiné", () => {
  it("F-010-AC22 seul src/compte/client-auth.ts nomme better-auth, par better-auth/client, et crée le client sans greffon par défaut", () => {
    // Ce fichier-ci est écarté : ses cas fautifs sont des imports écrits en données.
    const tout = new Map(
      [...sources, ...lireDossier("test"), ...lireDossier("e2e")].filter(
        ([chemin]) => chemin !== "test/compte-structure.test.ts",
      ),
    );
    expect(importsDeBetterAuth(tout)).toEqual(["src/compte/client-auth.ts -> better-auth/client"]);
    expect(sources.get("src/compte/client-auth.ts")).toMatch(/disableDefaultFetchPlugins: true/);
  });

  it("F-010-AC22 un import de la racine, d'un autre sous-chemin ou d'un autre fichier est nommé", () => {
    expect(
      importsDeBetterAuth(
        new Map([
          ["src/a.ts", 'import { betterAuth } from "better-auth";'],
          ["src/b.ts", 'import { x } from "better-auth/client/plugins";'],
          ["src/c.ts", "const m = await import('@better-auth/core');"],
          ["src/d.ts", 'import { createAuthClient } from "better-auth/client";'],
        ]),
      ),
    ).toEqual([
      "src/a.ts -> better-auth",
      "src/b.ts -> better-auth/client/plugins",
      "src/c.ts -> @better-auth/core",
      "src/d.ts -> better-auth/client",
    ]);
  });
});

// ── F-010-AC20, AC21, AC27 : jeton, origine, contrats ─────────────────────────────────────────

const AUTHORIZATION = /\bauthorization\b/gi;
const ADRESSE_ABSOLUE = /["'`]https?:\/\//g;
const CHEMIN_RECOPIE = /["'`]\/api\//g;
const FETCH = /\bfetch\s*\(/g;

function trouves(fichiers: ReadonlyMap<string, string>, motif: RegExp): string[] {
  return [...fichiers].flatMap(([chemin, texte]) =>
    [...texte.matchAll(motif)].map(([trouve]) => `${chemin} : ${trouve}`),
  );
}

describe("requêtes du compte", () => {
  it("F-010-AC20 F-010-AC21 F-010-AC27 aucun en-tête Authorization, aucune adresse absolue, aucun chemin d'API recopié ; fetch n'est appelé que par reseau.ts", () => {
    expect(trouves(sources, AUTHORIZATION)).toEqual([]);
    expect(trouves(sources, ADRESSE_ABSOLUE)).toEqual([]);
    expect(trouves(sources, CHEMIN_RECOPIE)).toEqual([]);
    expect(trouves(sources, FETCH)).toEqual(["src/compte/reseau.ts : fetch("]);
  });

  it("F-010-AC20 F-010-AC21 F-010-AC27 un en-tête, une adresse absolue, un chemin recopié et un appel de fetch sont nommés", () => {
    const fautifs = new Map([
      ["src/a.ts", 'headers: { Authorization: "Bearer x" }'],
      ["src/b.ts", 'const base = "https://api.exemple.fr";'],
      ["src/c.ts", 'const moi = "/api/v1/moi";'],
      ["src/d.ts", "await fetch (chemin);"],
    ]);
    expect(trouves(fautifs, AUTHORIZATION)).toEqual(["src/a.ts : Authorization"]);
    expect(trouves(fautifs, ADRESSE_ABSOLUE)).toEqual(['src/b.ts : "https://']);
    expect(trouves(fautifs, CHEMIN_RECOPIE)).toEqual(['src/c.ts : "/api/']);
    expect(trouves(fautifs, FETCH)).toEqual(["src/d.ts : fetch ("]);
  });

  it("F-010-AC27 les deux codes natifs ne sont déclarés que dans le module du client", () => {
    const declarants = [...sources]
      .filter(([, texte]) =>
        /USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL|INVALID_EMAIL_OR_PASSWORD/.test(texte),
      )
      .map(([chemin]) => chemin);
    expect(declarants).toEqual(["src/compte/client-auth.ts"]);
  });

  it("F-010-AC21 le serveur de Vite relaie /api sous la forme objet, avec ws, sans changeOrigin ni rewriteWsOrigin", () => {
    const configuration = lire("vite.config.ts").replaceAll(/\/\/.*$/gm, "");
    expect(configuration).toMatch(/"\/api":\s*\{[^}]*target:[^}]*ws: true,?\s*\}/s);
    expect(configuration).not.toMatch(/changeOrigin|rewriteWsOrigin|xfwd/);
  });

  it("F-010-AC11 aucun fichier du compte n'écrit dans la console", () => {
    expect(FICHIERS_DU_COMPTE.length).toBeGreaterThanOrEqual(9);
    expect(
      FICHIERS_DU_COMPTE.filter((chemin) => /\bconsole\./.test(sources.get(chemin) ?? "")),
    ).toEqual([]);
  });
});

// ── F-010-AC16 : une table, un message par code publié ────────────────────────────────────────

/** Les sept textes que F-011-AC34 fixe, lus dans la spec elle-même. */
function textesDeF011(): Record<string, string> {
  const critere = lire("../../specs/F-011.md")
    .split("\n")
    .find((ligne) => ligne.includes("F-011-AC34 (couture de F-010"));
  return Object.fromEntries(
    [...(critere ?? "").matchAll(/`([a-z-]+)` : « ([^»]+?) »/g)].map(([, code, texte]) => [
      code,
      texte,
    ]),
  );
}

describe("table de messages des codes de l'enveloppe", () => {
  it("F-010-AC16 chaque code de la liste fermée publiée par contrats a son message, et la table n'en a pas d'autre", () => {
    // F-027 : deux codes ajoutés à la fin de la liste fermée (F-027-AC19).
    expect(CODES_ERREUR).toHaveLength(16);
    expect(Object.keys(MESSAGES_DES_CODES).sort()).toEqual([...CODES_ERREUR].sort());
    for (const code of CODES_ERREUR) {
      const message = MESSAGES_DES_CODES[code];
      expect(message, code).toMatch(/^[A-ZÀ-Ý][^]*\.$/u);
      expect(message, code).not.toContain(code);
    }
  });

  it("F-010-AC16 les sept messages de F-011 sont ceux de F-011-AC34, à la lettre", () => {
    const attendus = textesDeF011();
    expect(Object.keys(attendus)).toEqual([
      "acces-refuse",
      "origine-refusee",
      "identifiant-indisponible",
      "dernier-proprietaire",
      "deja-membre",
      "invitation-invalide",
      "quota-atteint",
    ]);
    for (const [code, texte] of Object.entries(attendus)) {
      expect(MESSAGES_DES_CODES[code as keyof typeof MESSAGES_DES_CODES]).toBe(texte);
    }
  });

  it("F-027-AC25 F-010-AC16 les deux messages de F-027 sont ceux de F-027-AC25, à la lettre", () => {
    const critere = lire("../../specs/F-027.md")
      .split("\n")
      .find((ligne) => ligne.includes("F-027-AC25 (erreurs)"));
    const attendus = Object.fromEntries(
      [...(critere ?? "").matchAll(/`([a-z-]+)` : « ([^»]+?) »/g)].map(([, code, texte]) => [
        code,
        texte,
      ]),
    );
    expect(attendus).toEqual({
      "mot-de-passe-incorrect": "Mot de passe actuel incorrect.",
      "session-courante": "Pour fermer la session de cet appareil, déconnectez-vous.",
    });
    for (const [code, texte] of Object.entries(attendus)) {
      expect(MESSAGES_DES_CODES[code as keyof typeof MESSAGES_DES_CODES]).toBe(texte);
    }
  });

  it("F-010-AC16 un code publié sans message est vu", () => {
    const publies = [...CODES_ERREUR, "code-futur"];
    expect(publies.filter((code) => !Object.hasOwn(MESSAGES_DES_CODES, code))).toEqual([
      "code-futur",
    ]);
  });
});

// ── F-010-AC9 : contrôle par les schémas de contrats ──────────────────────────────────────────

describe("contrôle des formulaires", () => {
  it("F-010-AC9 le courriel perd ses blancs de bord, le mot de passe est rendu tel quel", () => {
    expect(
      validerConnexion({ nom: "", courriel: "  alice@exemple.fr\t", motDePasse: "  secret  " }),
    ).toEqual({ ok: true, corps: { email: "alice@exemple.fr", password: "  secret  " } });
    expect(
      validerInscription({ nom: " A ", courriel: " a@b.fr ", motDePasse: " douze carac " }),
    ).toEqual({ ok: true, corps: { name: " A ", email: "a@b.fr", password: " douze carac " } });
  });

  it("F-010-AC9 les bornes des messages sont lues dans le schéma", () => {
    expect(
      validerInscription({ nom: "n".repeat(101), courriel: "x", motDePasse: "court" }),
    ).toEqual({
      ok: false,
      fautes: {
        nom: { regle: "trop-long", borne: 100 },
        courriel: { regle: "format" },
        motDePasse: { regle: "trop-court", borne: 12 },
      },
    });
    expect(validerConnexion({ nom: "", courriel: "a@b.fr", motDePasse: "a".repeat(129) })).toEqual({
      ok: false,
      fautes: { motDePasse: { regle: "trop-long", borne: 128 } },
    });
  });
});

// ── F-010-AC26 : deux formes d'adresse nouvelles, jamais prises pour des pages ─────────────────

describe("routes des écrans de compte", () => {
  it("F-010-AC26 #/connexion et #/inscription sont deux formes exactes ; toute variante désigne l'accueil, jamais une page", () => {
    expect(lireRoute("#/connexion")).toEqual({ forme: "connexion" });
    expect(lireRoute("#/inscription")).toEqual({ forme: "inscription" });
    for (const fragment of [
      "#/connexion?retour=%23%2Fpage%2Fx",
      "#/connexion/",
      "#/inscription/autre",
      "#connexion",
      "#/Connexion",
    ]) {
      expect(lireRoute(fragment), fragment).toEqual({ forme: "accueil" });
    }
    expect(lireRoute("#/page/connexion")).toEqual({ forme: "page-introuvable" });
    expect(fragmentDe({ forme: "connexion" })).toBe("#/connexion");
    expect(fragmentDe({ forme: "inscription" })).toBe("#/inscription");
    expect(fragmentDe({ forme: "page-introuvable" })).toBe("#/");
  });
});
