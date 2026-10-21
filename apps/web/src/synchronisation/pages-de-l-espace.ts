// Les pages d'un espace que la synchronisation traite : celles de l'arborescence et de la
// corbeille, descendances comprises (F-013-AC5), lues par qui tient la façade du document.
import type { Arborescence, PageLue, TypeDePage } from "@notionlike/document";

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

/**
 * Le type de chaque page lue (F-018-AC51, ADR-0019), arborescence et corbeille : une table ouvre
 * son document de table, jamais un document de page (F-018-AC9).
 */
export function typesDesPages({
  racines,
  corbeille,
}: Arborescence): ReadonlyMap<string, TypeDePage> {
  const types = new Map<string, TypeDePage>();
  const aVoir = [...racines, ...corbeille];
  for (const page of aVoir) {
    types.set(page.id, page.type ?? "page");
    aVoir.push(...page.enfants);
  }
  return types;
}

// Repris sous son nom pour l'orchestre et la passe de fond : l'orchestre, qui porte ses propres
// codes d'erreur, n'importe pas @notionlike/document (F-002-AC31, `PORTEURS_D_UN_AUTRE_CODE`).
export type { TypeDePage };

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
