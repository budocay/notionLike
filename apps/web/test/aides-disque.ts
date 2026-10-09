// Lecture des sources d'`apps/web` sur le disque, pour les contrôles statiques de F-004 : chemins
// rendus depuis `apps/web`, avec des barres obliques.
import { existsSync, readdirSync, readFileSync } from "node:fs";

const RACINE = import.meta.dirname.replaceAll("\\", "/").replace(/\/test$/, "");

export function existe(chemin: string): boolean {
  return existsSync(`${RACINE}/${chemin}`);
}

export function lire(chemin: string): string {
  return readFileSync(`${RACINE}/${chemin}`, "utf8");
}

/** Tous les fichiers d'un dossier d'`apps/web`, sous-dossiers compris, triés. */
export function lister(dossier: string): string[] {
  const base = `${RACINE}/${dossier}`;
  return readdirSync(base, { recursive: true, withFileTypes: true })
    .filter((entree) => entree.isFile())
    .map((entree) => {
      const parent = entree.parentPath.replaceAll("\\", "/");
      return `${dossier}${parent.slice(base.length)}/${entree.name}`;
    })
    .sort();
}

/** Texte de chaque fichier d'un dossier, par chemin depuis `apps/web`. */
export function lireDossier(dossier: string): Map<string, string> {
  return new Map(lister(dossier).map((chemin) => [chemin, lire(chemin)]));
}
