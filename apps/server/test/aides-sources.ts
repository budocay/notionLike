// Le code d'exécution du dépôt, lu comme du texte : `src/` de chaque application et de chaque
// paquet. Les coutures de F-009 y cherchent qui fait quoi ; celles de F-012 et de F-031 y suivent
// les importations d'un point d'entrée.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const SERVEUR = fileURLToPath(new URL("../", import.meta.url));

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

// Les importations atteignables depuis un module, de proche en proche par les chemins relatifs :
// les fichiers par leur chemin depuis apps/server, les paquets par leur nom.
export function importationsAtteignables(depart: URL): { fichiers: string[]; paquets: string[] } {
  const fichiers = new Set<string>();
  const paquets = new Set<string>();
  const aVoir = [depart];
  while (aVoir.length > 0) {
    const courant = aVoir.pop();
    if (courant === undefined || fichiers.has(courant.href)) {
      continue;
    }
    fichiers.add(courant.href);
    const texte = readFileSync(courant, "utf8");
    for (const [, cible = ""] of texte.matchAll(/(?:from|import)\s+"([^"]+)"/g)) {
      if (cible.startsWith(".")) {
        aVoir.push(new URL(cible, courant));
      } else {
        paquets.add(cible);
      }
    }
  }
  return {
    fichiers: [...fichiers].map((href) => fileURLToPath(href).replace(SERVEUR, "")),
    paquets: [...paquets],
  };
}
