// Jetons et classes de rôle du bloc code (F-033-AC13), tabulation sur un cran (F-033-AC21) : lus
// dans le fichier des jetons et la feuille d'entrée, que jsdom n'applique pas (F-033 H12).
import { describe, expect, it } from "vitest";

import { CLASSES_DE_ROLE } from "../src/interface/composants/Edition.tsx";
import { lireJetons } from "../src/styles/lecture-jetons.ts";
import { lire } from "./aides-disque.ts";
import {
  CONTRASTE_TEXTE,
  controlerContrastes,
  controlerCouleurs,
  couples,
} from "./aides-jetons.ts";
import { FEUILLE_D_ENTREE, FICHIER_DES_JETONS } from "./aides-styles.ts";

const jetons = lire(FICHIER_DES_JETONS);
const entree = lire(FEUILLE_D_ENTREE);
const PREFIXE_DU_JETON = "--color-texte-";
const JETON_DE_ROLE = /^--color-texte-(syntaxe-[\w-]+)$/;

/** Les classes de rôle de la liste fermée : `syntaxe-<rôle>`. */
const CLASSES = Object.values(CLASSES_DE_ROLE);

function sansCommentaires(texte: string): string {
  return texte.replace(/\/\*[^]*?\*\//g, "");
}

/**
 * Fautes de l'habillage des classes de rôle : un jeton de rôle par classe et une classe par jeton,
 * chaque classe déclarée une fois par `@utility`, dont la seule déclaration est sa couleur, par son
 * jeton ; ni la classe ni le jeton ne paraissent ailleurs dans la feuille.
 */
function fautesDesRoles(
  fichierDesJetons: string,
  feuille: string,
  classes: readonly string[],
): string[] {
  const declares = lireJetons(fichierDesJetons)
    .theme.map(({ nom }) => JETON_DE_ROLE.exec(nom)?.[1])
    .filter((classe) => classe !== undefined);
  const texte = sansCommentaires(feuille);
  const fautes = [
    ...classes
      .filter((classe) => !declares.includes(classe))
      .map((classe) => `${classe} : aucun jeton ${PREFIXE_DU_JETON}${classe}`),
    ...declares
      .filter((classe) => !classes.includes(classe))
      .map((classe) => `${PREFIXE_DU_JETON}${classe} : aucun rôle de la liste fermée`),
  ];
  for (const classe of classes) {
    const jeton = `${PREFIXE_DU_JETON}${classe}`;
    const attendue = `@utility ${classe} {\n  color: var(${jeton});\n}`;
    const declarations = texte.split(`@utility ${classe} {`).length - 1;
    if (declarations !== 1 || !texte.includes(attendue)) {
      fautes.push(`${classe} : habillage attendu « ${attendue.replace(/\s+/g, " ")} »`);
      continue;
    }
    const ailleurs = texte.replace(attendue, "");
    if (ailleurs.includes(classe) || ailleurs.includes(jeton)) {
      fautes.push(`${classe} : nommée ailleurs dans la feuille`);
    }
  }
  return fautes;
}

describe("jetons de rôle du bloc code", () => {
  it("F-033-AC13 les jetons de rôle correspondent un à un aux sept rôles de la liste fermée et renvoient chacun à une couleur primitive opaque", () => {
    const declares = lireJetons(jetons).theme.filter(({ nom }) => JETON_DE_ROLE.test(nom));

    expect(CLASSES).toHaveLength(7);
    expect(declares.map(({ nom }) => nom)).toEqual(
      CLASSES.map((classe) => `${PREFIXE_DU_JETON}${classe}`),
    );
    for (const { valeur } of declares) {
      expect(valeur).toMatch(/^var\(--primitif-[\w-]+\)$/);
    }
    expect(controlerCouleurs(jetons)).toEqual([]);
  });

  it("F-033-AC13 F-004-AC7 F-004-AC20 chaque jeton de rôle, commentaire compris, tient 4,5 pour 1 sur chacune des sept surfaces du thème sombre", () => {
    const liste = couples(jetons, "texte").filter(({ premier }) => JETON_DE_ROLE.test(premier));

    expect(liste).toHaveLength(7 * 7);
    for (const { premier, surface, rapport } of liste) {
      expect(rapport, `${premier} sur ${surface}`).toBeGreaterThanOrEqual(CONTRASTE_TEXTE);
    }
    expect(controlerContrastes(jetons)).toEqual([]);
  });

  it("F-033-AC13 chaque classe de rôle est habillée dans la feuille d'entrée, une seule fois, et seulement par son jeton", () => {
    expect(fautesDesRoles(jetons, entree, CLASSES)).toEqual([]);
  });

  it("F-033-AC13 un rôle sans jeton, un jeton sans rôle, une classe habillée d'une couleur littérale, d'un autre jeton ou nommée ailleurs sont nommés", () => {
    const classes = ["syntaxe-a", "syntaxe-b"];
    const fichier = (noms: string): string =>
      `@theme static {\n  --*: initial;\n  --primitif-x: #ffffff;\n${noms}}\n`;
    const deux =
      "  --color-texte-syntaxe-a: var(--primitif-x);\n  --color-texte-syntaxe-b: var(--primitif-x);\n";
    const habille = (classe: string): string =>
      `@utility ${classe} {\n  color: var(--color-texte-${classe});\n}\n`;
    const conforme = `${habille("syntaxe-a")}${habille("syntaxe-b")}`;

    expect(fautesDesRoles(fichier(deux), conforme, classes)).toEqual([]);
    expect(
      fautesDesRoles(
        fichier(
          "  --color-texte-syntaxe-a: var(--primitif-x);\n  --color-texte-syntaxe-c: var(--primitif-x);\n",
        ),
        conforme,
        classes,
      ),
    ).toEqual([
      "syntaxe-b : aucun jeton --color-texte-syntaxe-b",
      "--color-texte-syntaxe-c : aucun rôle de la liste fermée",
    ]);
    expect(
      fautesDesRoles(
        fichier(deux),
        conforme.replace("var(--color-texte-syntaxe-b)", "#ff0000"),
        classes,
      ),
    ).toEqual([expect.stringContaining("syntaxe-b : habillage attendu")]);
    expect(
      fautesDesRoles(
        fichier(deux),
        conforme.replace("color: var(--color-texte-syntaxe-a);", "$&\n  font-weight: 700;"),
        classes,
      ),
    ).toEqual([expect.stringContaining("syntaxe-a : habillage attendu")]);
    expect(
      fautesDesRoles(fichier(deux), `${conforme}.x .syntaxe-a { color: red; }\n`, classes),
    ).toEqual(["syntaxe-a : nommée ailleurs dans la feuille"]);
    expect(fautesDesRoles(fichier(deux), `${conforme}${habille("syntaxe-a")}`, classes)).toEqual([
      expect.stringContaining("syntaxe-a : habillage attendu"),
    ]);
  });
});

describe("tabulation du bloc code", () => {
  it("F-033-AC21 l'élément `pre` du bloc code affiche une tabulation sur deux colonnes, la largeur d'un cran", () => {
    const pre = /\n {2}& pre \{[^}]*\}/.exec(sansCommentaires(entree))?.[0] ?? "";

    expect(pre).toContain("white-space: pre-wrap;");
    expect(pre.match(/tab-size:\s*([^;]+);/g)).toEqual(["tab-size: 2;"]);
    expect(sansCommentaires(entree).match(/tab-size/g)).toHaveLength(1);
  });
});
