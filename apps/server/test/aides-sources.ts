// Le code d'exécution du dépôt, lu comme du texte : `src/` de chaque application et de chaque
// paquet. Les coutures de F-009 y cherchent qui fait quoi.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));

// Chaque fichier `.ts` ou `.tsx`, par son chemin depuis la racine du dépôt.
export function sourcesDuDepot(): Map<string, string> {
  const sources = new Map<string, string>();
  for (const groupe of ["apps", "packages"]) {
    const projets = readdirSync(join(RACINE, groupe), { withFileTypes: true })
      .filter(
        (entree) => entree.isDirectory() && existsSync(join(RACINE, groupe, entree.name, "src")),
      )
      .map(({ name }) => name);
    for (const projet of projets) {
      const src = join(RACINE, groupe, projet, "src");
      const fichiers = readdirSync(src, { recursive: true, encoding: "utf8" }).filter((nom) =>
        /\.tsx?$/.test(nom),
      );
      for (const fichier of fichiers) {
        sources.set(`${groupe}/${projet}/src/${fichier}`, readFileSync(join(src, fichier), "utf8"));
      }
    }
  }
  return sources;
}
