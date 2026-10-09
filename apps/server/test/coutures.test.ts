// Couture d'apps/server avec @notionlike/contrats et @notionlike/db : les fichiers de src/ sont lus
// comme du texte et chaque nom qu'ils font entrer de ces deux paquets est énuméré ici. Un appelant
// de plus, ou un nom de plus, fait échouer ce test : il se déclare, avec le test qui l'exerce.
import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const SRC = new URL("../src/", import.meta.url);
const PAQUETS = ["@notionlike/contrats", "@notionlike/db"] as const;
// Le mot-clé des textes fautifs est composé ici : la couture de F-002 (apps/web) lit ce fichier
// comme du texte et prendrait un import entier écrit en clair pour l'un des siens.
const MOT_CLE = "import";

type Entrees = Readonly<Record<string, readonly string[]>>;

// Les noms importés d'un paquet par un texte source, `type` retiré, triés ; un import qui n'est
// pas une liste de noms (espace de noms, défaut, effet de bord, import dynamique) est rendu tel quel.
function nomsImportes(texte: string, paquet: string): string[] {
  const declaration = new RegExp(
    `import\\s+(?:type\\s+)?([^;]*?)\\s+from\\s+"${paquet}(/[^"]*)?"`,
    "g",
  );
  const autres = new RegExp(`(?:import|require)\\s*\\(?\\s*"${paquet}(?:/[^"]*)?"`, "g");
  const noms = [...texte.matchAll(declaration)].flatMap(([, liste = "", sousChemin = ""]) =>
    /^\{[^}]*\}$/.test(liste) && sousChemin === ""
      ? liste
          .slice(1, -1)
          .split(",")
          .map((nom) => nom.trim().replace(/^type\s+/, ""))
      : [`${liste} depuis ${paquet}${sousChemin}`],
  );
  return [...noms.filter((nom) => nom !== ""), ...(texte.match(autres) ?? [])].sort();
}

function entreesDe(fichiers: ReadonlyMap<string, string>, paquet: string): Entrees {
  const entrees = [...fichiers].map(([nom, texte]) => [nom, nomsImportes(texte, paquet)] as const);
  return Object.fromEntries(entrees.filter(([, noms]) => noms.length > 0));
}

const sources = new Map(
  readdirSync(SRC).map((nom) => [nom, readFileSync(new URL(nom, SRC), "utf8")] as const),
);

describe("appelants des deux paquets", () => {
  it("F-008-AC22 les fichiers d'apps/server/src qui consomment @notionlike/contrats sont énumérés", () => {
    expect(entreesDe(sources, "@notionlike/contrats")).toEqual({
      "application.ts": ["CHEMINS", "ReponsePret", "ReponseSante"],
      "enveloppe.ts": ["CodeErreur", "EnveloppeErreur"],
    });
  });

  it("F-008-AC17 les fichiers d'apps/server/src qui consomment @notionlike/db sont énumérés", () => {
    expect(entreesDe(sources, "@notionlike/db")).toEqual({
      "application.ts": ["Base", "ErreurBase"],
      "main.ts": ["ouvrirBase"],
    });
  });

  it.each(PAQUETS)("F-008-AC23 un import de %s hors de la liste de noms est vu", (paquet) => {
    const fautifs = new Map([
      ["nom-en-plus.ts", `import { type Base, ouvrirPilotePg } from "${paquet}";`],
      ["espace-de-noms.ts", `${MOT_CLE} * as tout from "${paquet}";`],
      ["sous-chemin.ts", `import { ouvrirBaseEmbarquee } from "${paquet}/essai";`],
      ["dynamique.ts", `const paquet = await ${MOT_CLE}("${paquet}");`],
      ["sans-import.ts", `export const texte = "${paquet}";`],
    ]);

    expect(entreesDe(fautifs, paquet)).toEqual({
      "nom-en-plus.ts": ["Base", "ouvrirPilotePg"],
      "espace-de-noms.ts": [`* as tout depuis ${paquet}`],
      "sous-chemin.ts": [`{ ouvrirBaseEmbarquee } depuis ${paquet}/essai`],
      "dynamique.ts": [`${MOT_CLE}("${paquet}"`],
    });
  });
});
