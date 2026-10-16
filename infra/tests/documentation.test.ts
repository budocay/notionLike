// Documentation de la commande de la pile (F-031-AC29) : README.md, infra/RETOUR-ARRIERE.md et les
// deux fichiers d'exemple, lus comme du texte.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { DELAI_D_UN_TEST_MS, DEPOT, SOUS_COMMANDES } from "./aides-pile.ts";

vi.setConfig({ testTimeout: DELAI_D_UN_TEST_MS });

const lire = (chemin: string): string => readFileSync(join(DEPOT, chemin), "utf8");
const LIGNE_DE_L_AIDE = /^ {2}([a-z]+) {2,}/;
const CITATION = /pnpm -w pile ([a-z]+)/g;
const SECTION = "## Lancer le serveur et la base";
const TABLE_DES_PANNES = "### Pannes connues";

function sousCommandesDeLAide(): string[] {
  const { stdout } = spawnSync("/bin/bash", [join(DEPOT, "infra/pile.sh"), "aide"], {
    encoding: "utf8",
    env: { PATH: "/usr/bin:/bin" },
  });
  return stdout.split("\n").flatMap((ligne) => LIGNE_DE_L_AIDE.exec(ligne)?.[1] ?? []);
}

function section(texte: string, titre: string): string {
  const debut = texte.indexOf(titre);
  if (debut === -1) return "";
  const suite = texte.slice(debut + titre.length);
  const fin = suite.search(/^## /m);
  return fin === -1 ? suite : suite.slice(0, fin);
}

/** Écarts entre les sous-commandes de l'aide et celles que cite un texte. */
function ecarts(aide: readonly string[], texte: string): string[] {
  const citees = new Set([...texte.matchAll(CITATION)].map(([, nom]) => nom ?? ""));
  return [
    ...aide.filter((nom) => !citees.has(nom)).map((nom) => `${nom} : absente du README`),
    ...[...citees].filter((nom) => !aide.includes(nom)).map((nom) => `${nom} : inconnue de l'aide`),
  ];
}

function lignesDeTable(texte: string): string[] {
  return texte.split("\n").filter((ligne) => ligne.startsWith("| ") && !ligne.startsWith("| -"));
}

describe("documentation de la commande de la pile", () => {
  const readme = section(lire("README.md"), SECTION);

  it("F-031-AC29 chaque sous-commande listée par pile aide est citée dans la section du README, et aucune autre", () => {
    expect(sousCommandesDeLAide()).toEqual(SOUS_COMMANDES);
    expect(ecarts(sousCommandesDeLAide(), readme)).toEqual([]);
  });

  it("F-031-AC29 une sous-commande absente du README, ou citée sans exister, est vue", () => {
    const sansAccorder = readme.replaceAll("pnpm -w pile accorder", "accorder");

    expect(ecarts(SOUS_COMMANDES, sansAccorder)).toEqual(["accorder : absente du README"]);
    expect(ecarts(SOUS_COMMANDES, `${readme}\npnpm -w pile relancer\n`)).toEqual([
      "relancer : inconnue de l'aide",
    ]);
  });

  it("F-031-AC29 le README décrit le mode hôte, /pret à 503 et une table symptôme, cause, commande des six incidents", () => {
    const pannes = section(readme, TABLE_DES_PANNES);

    expect(readme).toContain("Mode hôte");
    expect(readme).toContain("pnpm --filter @notionlike/server demarrer");
    expect(readme).toContain("503");
    expect(lignesDeTable(pannes)[0]).toMatch(/^\| Symptôme +\| Cause +\| Commande +\|$/);
    expect(lignesDeTable(pannes)).toHaveLength(7);
    for (const incident of [
      "BETTER_AUTH_SECRET",
      "POSTGRES_PASSWORD de infra/.env refusé",
      "La base refuse POSTGRES_PASSWORD",
      "est déjà en écoute",
      "pnpm -w fumee",
      "http://localhost:5173",
    ]) {
      expect(pannes).toContain(incident);
    }
  });

  it("F-031-AC29 la section 3 d'infra/RETOUR-ARRIERE.md renvoie à pnpm -w pile accorder", () => {
    const retour = lire("infra/RETOUR-ARRIERE.md");
    const sectionTrois = section(retour, "## 3. Échec d'une migration");

    expect(sectionTrois).toContain("pnpm -w pile accorder");
  });

  it("F-031-AC29 les deux fichiers d'exemple disent que preparer les copie et ce qu'il y écrit", () => {
    const infra = lire("infra/.env.example");
    const serveur = lire("apps/server/.env.example");

    expect(infra).toContain("`pnpm -w pile preparer` (F-031) copie ce");
    expect(infra).toContain("POSTGRES_PASSWORD tiré au hasard");
    expect(serveur).toContain("`pnpm -w pile preparer` (F-031) copie ce fichier");
    expect(serveur).toContain("BETTER_AUTH_SECRET aléatoire");
  });
});
