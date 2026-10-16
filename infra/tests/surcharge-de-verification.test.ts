// Garde statique de la surcharge infra/verification-configuration.yml (constat 1 d'agent-securite,
// F-031) : elle retire le volume des données de `base`. Employée avec `up`, la base de travail
// tournerait sur la couche éphémère du conteneur et perdrait ses données au `down`. Elle n'est donc
// référencée, dans tout fichier suivi qui s'exécute, que par la ligne `run --rm --no-deps -T serveur`
// d'infra/pile.sh ; la documentation ne la cite jamais avec `up`.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEPOT } from "./aides-pile.ts";

const NOM = "verification-configuration.yml";
const SURCHARGE = `infra/${NOM}`;
const SCRIPT = "infra/pile.sh";
const VARIABLE = "SURCHARGE_DE_VERIFICATION";
const DEFINITION = `${VARIABLE}="$RACINE/${SURCHARGE}"`;
const EMPLOI = `-f "$${VARIABLE}"`;
const SEUL_EMPLOI_PERMIS = " run --rm --no-deps -T serveur ";
const EN_TETE = "NE JAMAIS EMPLOYER AVEC `up`";
// Hors des fichiers qui s'exécutent : la documentation (lue à part) et les tests de l'infra.
const HORS_EXECUTION = /\.md$|^infra\/tests\/|^\.agents\//;
const LANCEMENT_UP = /\bup\b/;

/** Lignes de commande d'un script bash, suites de ligne (`\`) jointes, commentaires retirés. */
function commandes(texte: string): string[] {
  return texte
    .replace(/\\\n\s*/g, " ")
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== "" && !ligne.startsWith("#"));
}

/** Hors d'infra/pile.sh : aucun fichier qui s'exécute ne la cite ; la documentation jamais avec up. */
function constatsHorsDuScript(chemin: string, texte: string): string[] {
  if (chemin === SURCHARGE || chemin === SCRIPT) return [];
  if (chemin.endsWith(".md")) {
    return texte
      .split("\n")
      .flatMap((ligne, rang) =>
        ligne.includes(NOM) && LANCEMENT_UP.test(ligne)
          ? [`${chemin}:${String(rang + 1)} : la surcharge citée avec up`]
          : [],
      );
  }
  return !HORS_EXECUTION.test(chemin) && texte.includes(NOM)
    ? [`${chemin} : référence la surcharge hors d'${SCRIPT}`]
    : [];
}

/** Dans infra/pile.sh : une définition, un seul emploi, celui de `run --rm --no-deps -T serveur`. */
function constatsDuScript(texte: string): string[] {
  const script = commandes(texte);
  const emplois = script.filter((ligne) => ligne.includes(`$${VARIABLE}`) && ligne !== DEFINITION);
  const constats: string[] = [];
  if (script.filter((ligne) => ligne === DEFINITION).length !== 1) {
    constats.push(`${SCRIPT} : ${VARIABLE} n'est pas défini une fois`);
  }
  if (emplois.length !== 1) {
    constats.push(`${SCRIPT} : ${String(emplois.length)} emplois de ${VARIABLE}, un seul attendu`);
  }
  for (const emploi of emplois) {
    if (!emploi.includes(EMPLOI) || !emploi.includes(SEUL_EMPLOI_PERMIS)) {
      constats.push(
        `${SCRIPT} : ${VARIABLE} employé hors de la ligne run --rm --no-deps -T serveur`,
      );
    }
    if (LANCEMENT_UP.test(emploi)) constats.push(`${SCRIPT} : ${VARIABLE} employé avec up`);
  }
  if (
    script.some(
      (ligne) => ligne.includes(`-f "$RACINE/${SURCHARGE}"`) || ligne.includes(`-f ${SURCHARGE}`),
    )
  ) {
    constats.push(`${SCRIPT} : la surcharge passée par son chemin à -f`);
  }
  return constats;
}

/** Constats sur l'emploi de la surcharge ; `fichiers` : chemin suivi -> texte. */
function constatsEmploiDeLaSurcharge(fichiers: ReadonlyMap<string, string>): string[] {
  return [
    ...[...fichiers].flatMap(([chemin, texte]) => constatsHorsDuScript(chemin, texte)),
    ...constatsDuScript(fichiers.get(SCRIPT) ?? ""),
  ];
}

function fichiersSuivis(): Map<string, string> {
  const { stdout } = spawnSync("git", ["ls-files", "-z"], { cwd: DEPOT, encoding: "utf8" });
  return new Map(
    stdout
      .split("\0")
      .filter((chemin) => chemin !== "")
      .flatMap((chemin) => {
        try {
          return [[chemin, readFileSync(join(DEPOT, chemin), "utf8")] as const];
        } catch {
          return [];
        }
      }),
  );
}

describe("surcharge de vérification, jamais avec up", () => {
  it("F-031-AC8 son en-tête dit de ne jamais l'employer avec up et nomme son seul usage", () => {
    const premiereLigne = readFileSync(join(DEPOT, SURCHARGE), "utf8").split("\n")[0] ?? "";

    expect(premiereLigne).toContain(EN_TETE);
    expect(premiereLigne).toContain(SEUL_EMPLOI_PERMIS.trim());
  });

  it("F-031-AC8 dans les fichiers suivis, seule la ligne run --rm --no-deps -T serveur d'infra/pile.sh l'emploie", () => {
    const fichiers = fichiersSuivis();

    expect(fichiers.has(SCRIPT)).toBe(true);
    expect(constatsEmploiDeLaSurcharge(fichiers)).toEqual([]);
  });

  it("F-031-AC8 cas fautifs : up, second emploi, chemin direct, autre script ou documentation avec up", () => {
    const script = readFileSync(join(DEPOT, SCRIPT), "utf8");
    const avec = (ajout: string): Map<string, string> =>
      new Map([[SCRIPT, `${script}\n${ajout}\n`]]);

    expect(constatsEmploiDeLaSurcharge(avec(`compose ${EMPLOI} up -d --wait`))).toEqual([
      `${SCRIPT} : 2 emplois de ${VARIABLE}, un seul attendu`,
      `${SCRIPT} : ${VARIABLE} employé hors de la ligne run --rm --no-deps -T serveur`,
      `${SCRIPT} : ${VARIABLE} employé avec up`,
    ]);
    expect(
      constatsEmploiDeLaSurcharge(avec(`compose -f "$RACINE/${SURCHARGE}" \\\n  up -d`)),
    ).toEqual([`${SCRIPT} : la surcharge passée par son chemin à -f`]);
    expect(
      constatsEmploiDeLaSurcharge(
        new Map([
          [SCRIPT, script],
          ["infra/autre.sh", `docker compose -f ${SURCHARGE} up -d\n`],
          ["package.json", `{ "scripts": { "x": "docker compose -f ${SURCHARGE} up" } }\n`],
          ["README.md", `docker compose -f infra/docker-compose.yml -f ${SURCHARGE} up -d\n`],
        ]),
      ),
    ).toEqual([
      "infra/autre.sh : référence la surcharge hors d'infra/pile.sh",
      "package.json : référence la surcharge hors d'infra/pile.sh",
      "README.md:1 : la surcharge citée avec up",
    ]);
    expect(constatsEmploiDeLaSurcharge(new Map([[SCRIPT, ""]]))).toEqual([
      `${SCRIPT} : ${VARIABLE} n'est pas défini une fois`,
      `${SCRIPT} : 0 emplois de ${VARIABLE}, un seul attendu`,
    ]);
  });
});
