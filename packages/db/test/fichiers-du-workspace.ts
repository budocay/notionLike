// Lecture des sources du workspace pour les tests de couture : ils énumèrent les fichiers qui font
// entrer un nom, pour qu'un appelant de plus ne passe pas sans être inscrit.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const RACINE = fileURLToPath(new URL("../../..", import.meta.url));
const DOSSIERS_IGNORES = ["node_modules", "dist", "coverage", "migrations-essai"];

function fichiersTs(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((element) => {
    const chemin = join(dossier, element.name);
    if (element.isDirectory()) {
      return DOSSIERS_IGNORES.includes(element.name) ? [] : fichiersTs(chemin);
    }
    return /\.tsx?$/.test(element.name) ? [chemin] : [];
  });
}

export function fichiersDuWorkspace(): Map<string, string> {
  const chemins = ["apps", "packages"].flatMap((dossier) => fichiersTs(join(RACINE, dossier)));
  return new Map(
    chemins.map((chemin) => [
      relative(RACINE, chemin).replaceAll("\\", "/"),
      readFileSync(chemin, "utf8"),
    ]),
  );
}

// Les noms qu'un fichier fait entrer ou réexporte entre accolades, et la source de chacun.
function nomsEntres(texte: string): { nom: string; source: string }[] {
  const declarations = texte.matchAll(
    /\b(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*"([^"]+)"/g,
  );
  return [...declarations].flatMap(([, noms = "", source = ""]) =>
    noms
      .split(",")
      .map(
        (nom) =>
          nom
            .replace(/^\s*type\s+/, "")
            .split(/\s+as\s+/)[0]
            ?.trim() ?? "",
      )
      .filter((nom) => nom !== "")
      .map((nom) => ({ nom, source })),
  );
}

export function faitEntrer(texte: string, nom: string): boolean {
  return nomsEntres(texte).some((entre) => entre.nom === nom);
}
