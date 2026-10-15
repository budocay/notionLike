// Les pages d'un espace que la synchronisation traite : celles de l'arborescence et de la
// corbeille, descendances comprises (F-013-AC5), lues par qui tient la façade du document.
import type { Arborescence, PageLue } from "@notionlike/document";

// Parcours itératif : une arborescence reçue n'a pas de profondeur bornée.
function ajouter(pages: readonly PageLue[], ids: Set<string>): void {
  const aVoir = [...pages];
  for (const page of aVoir) {
    ids.add(page.id);
    aVoir.push(...page.enfants);
  }
}

/** Les identifiants des pages lues, arborescence et corbeille, descendances comprises. */
export function idsDesPages({ racines, corbeille }: Arborescence): ReadonlySet<string> {
  const ids = new Set<string>();
  ajouter(racines, ids);
  ajouter(corbeille, ids);
  return ids;
}

export interface Ecart {
  readonly ajoutees: readonly string[];
  readonly retirees: readonly string[];
}

export function ecart(avant: ReadonlySet<string>, apres: ReadonlySet<string>): Ecart {
  return {
    ajoutees: [...apres].filter((id) => !avant.has(id)),
    retirees: [...avant].filter((id) => !apres.has(id)),
  };
}
