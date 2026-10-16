// `pnpm -w pile preparer` (F-031-AC3 à AC5, AC7, AC28) dans un arbre temporaire, sans Docker.
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type Arbre,
  creerArbre,
  DEPOT,
  ecrire,
  ENV_INFRA,
  ENV_SERVEUR,
  lancer,
  lire,
  outilReel,
  poserCommande,
  supprimerArbre,
  variables,
} from "./aides-pile.ts";

const MODE_RESERVE = 0o600;
const PERMISSIONS = 0o777;
const LECTURE_SEULE = 0o555;
const HEXADECIMAL_48 = /^[0-9a-f]{48}$/;
const HEXADECIMAL_64 = /^[0-9a-f]{64}$/;
const CLES_ECRITES = [
  "BETTER_AUTH_SECRET",
  "URL_BASE_DONNEES",
  "ORIGINES_AUTORISEES",
  "URL_PUBLIQUE",
];
const TEMPORAIRE = /^\.env\..*\.local$/;

let arbre: Arbre;

beforeEach(() => {
  arbre = creerArbre();
});

afterEach(() => {
  supprimerArbre(arbre);
});

const mode = (chemin: string): number => statSync(join(arbre.racine, chemin)).mode & PERMISSIONS;
const temporairesRestants = (): string[] =>
  ["infra", "apps/server"].flatMap((dossier) =>
    readdirSync(join(arbre.racine, dossier)).filter((nom) => TEMPORAIRE.test(nom)),
  );
const lignesSans = (texte: string, cles: readonly string[]): string[] =>
  texte.split("\n").filter((ligne) => !cles.some((cle) => ligne.startsWith(`${cle}=`)));

describe("preparer : infra/.env", () => {
  it("F-031-AC3 crée infra/.env depuis l'exemple, commentaires gardés, mot de passe aléatoire de 48 caractères hexadécimaux, en mode 600", () => {
    const resultat = lancer(arbre, ["preparer"]);

    expect(resultat.code).toBe(0);
    const cree = lire(arbre, ENV_INFRA);
    const exemple = lire(arbre, "infra/.env.example");
    expect(lignesSans(cree, ["POSTGRES_PASSWORD"])).toEqual(
      lignesSans(exemple, ["POSTGRES_PASSWORD"]),
    );
    expect(variables(cree).get("POSTGRES_PASSWORD")).toMatch(HEXADECIMAL_48);
    expect(cree).toContain("# PORT_PUBLIE_BASE=5432");
    expect(mode(ENV_INFRA)).toBe(MODE_RESERVE);
    expect(resultat.sortie).toContain("infra/.env : créé (mode 600)");
    expect(temporairesRestants()).toEqual([]);
  });
});

describe("preparer : apps/server/.env", () => {
  it("F-031-AC4 crée apps/server/.env en mode 600 : secret de 64 caractères hexadécimaux, URL du mode hôte sur le mot de passe d'infra/.env, origines du client, NODE_ENV en commentaire", () => {
    const resultat = lancer(arbre, ["preparer"]);

    expect(resultat.code).toBe(0);
    const cree = lire(arbre, ENV_SERVEUR);
    const lues = variables(cree);
    const motDePasse = variables(lire(arbre, ENV_INFRA)).get("POSTGRES_PASSWORD") ?? "";
    expect(lignesSans(cree, CLES_ECRITES)).toEqual(
      lignesSans(lire(arbre, "apps/server/.env.example"), CLES_ECRITES),
    );
    expect(lues.get("BETTER_AUTH_SECRET")).toMatch(HEXADECIMAL_64);
    expect(lues.get("URL_BASE_DONNEES")).toBe(
      `postgres://notionlike:${motDePasse}@127.0.0.1:5432/notionlike`,
    );
    expect(lues.get("ORIGINES_AUTORISEES")).toBe("http://127.0.0.1:5173,http://127.0.0.1:5174");
    expect(lues.get("URL_PUBLIQUE")).toBe("http://127.0.0.1:5173");
    expect(lues.has("NODE_ENV")).toBe(false);
    expect(cree).toMatch(/^# NODE_ENV=/m);
    expect(mode(ENV_SERVEUR)).toBe(MODE_RESERVE);
  });

  it("F-031-AC4 bâtit l'URL du mode hôte sur le mot de passe et le port publié d'un infra/.env déjà présent, laissé tel quel", () => {
    const infra = "POSTGRES_PASSWORD=QzQzQzQzQzQzQzQzQzQz\nPORT_PUBLIE_BASE=55433\n";
    ecrire(arbre, ENV_INFRA, infra);

    const resultat = lancer(arbre, ["preparer"]);

    expect(resultat.code).toBe(0);
    expect(lire(arbre, ENV_INFRA)).toBe(infra);
    expect(variables(lire(arbre, ENV_SERVEUR)).get("URL_BASE_DONNEES")).toBe(
      "postgres://notionlike:QzQzQzQzQzQzQzQzQzQz@127.0.0.1:55433/notionlike",
    );
  });

  it("F-031-AC4 garde l'URL factice de l'exemple quand le mot de passe d'infra/.env est refusé, et le dit sans valeur", () => {
    ecrire(arbre, ENV_INFRA, "POSTGRES_PASSWORD=factice-a-remplacer\n");

    const resultat = lancer(arbre, ["preparer"]);

    expect(resultat.code).toBe(0);
    expect(variables(lire(arbre, ENV_SERVEUR)).get("URL_BASE_DONNEES")).toBe(
      variables(lire(arbre, "apps/server/.env.example")).get("URL_BASE_DONNEES"),
    );
    expect(resultat.erreur).toContain("URL_BASE_DONNEES laissée à la valeur de l'exemple");
    expect(resultat.erreur).toContain("valeur factice de l'exemple");
  });
});

type Forme = "fichier" | "lien cassé" | "lien valide" | "dossier";

function poserForme(chemin: string, forme: Forme): void {
  const absolu = join(arbre.racine, chemin);
  if (forme === "fichier") ecrire(arbre, chemin, "CONTENU=du-dev\n");
  if (forme === "lien cassé") symlinkSync(join(arbre.dossier, "cible-absente"), absolu);
  if (forme === "lien valide") {
    ecrire(arbre, "cible", "CIBLE=intacte\n");
    symlinkSync(join(arbre.racine, "cible"), absolu);
  }
  if (forme === "dossier") mkdirSync(absolu);
}

function constaterForme(chemin: string, forme: Forme): void {
  const absolu = join(arbre.racine, chemin);
  if (forme === "fichier") expect(lire(arbre, chemin)).toBe("CONTENU=du-dev\n");
  if (forme === "lien cassé") {
    expect(readlinkSync(absolu)).toBe(join(arbre.dossier, "cible-absente"));
    expect(existsSync(join(arbre.dossier, "cible-absente"))).toBe(false);
  }
  if (forme === "lien valide") {
    expect(lstatSync(absolu).isSymbolicLink()).toBe(true);
    expect(lire(arbre, "cible")).toBe("CIBLE=intacte\n");
  }
  if (forme === "dossier") expect(readdirSync(absolu)).toEqual([]);
}

describe("preparer : fichiers déjà présents", () => {
  it.each([
    [ENV_INFRA, ENV_SERVEUR, "fichier"],
    [ENV_INFRA, ENV_SERVEUR, "lien cassé"],
    [ENV_INFRA, ENV_SERVEUR, "lien valide"],
    [ENV_INFRA, ENV_SERVEUR, "dossier"],
    [ENV_SERVEUR, ENV_INFRA, "fichier"],
    [ENV_SERVEUR, ENV_INFRA, "lien cassé"],
    [ENV_SERVEUR, ENV_INFRA, "lien valide"],
    [ENV_SERVEUR, ENV_INFRA, "dossier"],
  ] as const)(
    "F-031-AC5 %s présent (%s absent), sous forme de %s : laissé tel quel, sans suivre de lien, l'autre créé",
    (present, absent, forme) => {
      poserForme(present, forme);

      const resultat = lancer(arbre, ["preparer"]);

      expect(resultat.code).toBe(0);
      constaterForme(present, forme);
      expect(resultat.sortie).toContain(`${present} : déjà présent, laissé tel quel.`);
      expect(statSync(join(arbre.racine, absent)).isFile()).toBe(true);
      expect(mode(absent)).toBe(MODE_RESERVE);
      expect(temporairesRestants()).toEqual([]);
    },
  );

  it("F-031-AC5 les deux fichiers présents : aucun n'est modifié, et rien n'est créé", () => {
    ecrire(arbre, ENV_INFRA, "A=1\n");
    ecrire(arbre, ENV_SERVEUR, "B=2\n");

    const resultat = lancer(arbre, ["preparer"]);

    expect(resultat.code).toBe(0);
    expect([lire(arbre, ENV_INFRA), lire(arbre, ENV_SERVEUR)]).toEqual(["A=1\n", "B=2\n"]);
    expect(temporairesRestants()).toEqual([]);
  });

  it("F-031-AC5 un fichier apparu juste avant la pose n'est pas écrasé : la création est exclusive", () => {
    poserCommande(
      arbre,
      "link",
      `printf 'APPARU=entre-temps\\n' >"$2"\nexec '${outilReel("link")}' "$@"\n`,
    );

    const resultat = lancer(arbre, ["preparer"]);

    expect(resultat.code).toBe(0);
    expect(lire(arbre, ENV_INFRA)).toBe("APPARU=entre-temps\n");
    expect(lire(arbre, ENV_SERVEUR)).toBe("APPARU=entre-temps\n");
    expect(resultat.sortie).toContain(
      "infra/.env : apparu pendant la préparation, laissé tel quel.",
    );
    expect(temporairesRestants()).toEqual([]);
  });
});

describe("preparer : échec d'écriture", () => {
  it.each([
    ["apps/server", ENV_SERVEUR],
    ["infra", ENV_INFRA],
  ])(
    "F-031-AC7 dossier %s non inscriptible : code non nul, le fichier nommé, rien à son chemin",
    (dossier, chemin) => {
      chmodSync(join(arbre.racine, dossier), LECTURE_SEULE);

      const resultat = lancer(arbre, ["preparer"]);

      expect(resultat.code).not.toBe(0);
      expect(resultat.erreur).toContain(`${chemin} : écriture impossible`);
      expect(existsSync(join(arbre.racine, chemin))).toBe(false);
      expect(temporairesRestants()).toEqual([]);
    },
  );

  it("F-031-AC7 une pose au chemin final qui échoue ne laisse ni fichier ni temporaire", () => {
    poserCommande(arbre, "link", "exit 1\n");

    const resultat = lancer(arbre, ["preparer"]);

    expect(resultat.code).not.toBe(0);
    expect(resultat.erreur).toContain("infra/.env : création impossible au chemin final");
    expect(existsSync(join(arbre.racine, ENV_INFRA))).toBe(false);
    expect(existsSync(join(arbre.racine, ENV_SERVEUR))).toBe(false);
    expect(temporairesRestants()).toEqual([]);
  });
});

// Couture : les origines que le dépôt sert, lues dans la configuration de Vite et de Playwright.
function originesServies(vite: string, playwright: string): string[] {
  const portDeVite = /\bport:\s*(\d+)/.exec(vite)?.[1];
  const adresseDePlaywright = /"(http:\/\/127\.0\.0\.1:\d+)"/.exec(playwright)?.[1];
  return [`http://127.0.0.1:${portDeVite ?? "?"}`, adresseDePlaywright ?? "?"];
}

describe("preparer : origines du client", () => {
  const vite = readFileSync(join(DEPOT, "apps/web/vite.config.ts"), "utf8");
  const playwright = readFileSync(join(DEPOT, "apps/web/playwright.config.ts"), "utf8");

  it("F-031-AC28 écrit exactement les origines de Vite et de Playwright, dans cet ordre", () => {
    const resultat = lancer(arbre, ["preparer"]);

    expect(resultat.code).toBe(0);
    const ecrites = variables(lire(arbre, ENV_SERVEUR)).get("ORIGINES_AUTORISEES")?.split(",");
    expect(ecrites).toEqual(originesServies(vite, playwright));
    expect(variables(lire(arbre, ENV_SERVEUR)).get("URL_PUBLIQUE")).toBe(
      originesServies(vite, playwright)[0],
    );
  });

  it("F-031-AC28 un port de Vite ou de Playwright changé sans que preparer suive est vu", () => {
    const resultat = lancer(arbre, ["preparer"]);
    const ecrites = variables(lire(arbre, ENV_SERVEUR)).get("ORIGINES_AUTORISEES")?.split(",");

    expect(resultat.code).toBe(0);
    expect(ecrites).not.toEqual(
      originesServies(vite.replace(/\bport:\s*5173/, "port: 5180"), playwright),
    );
    expect(ecrites).not.toEqual(originesServies(vite, playwright.replace("5174", "5175")));
  });
});
