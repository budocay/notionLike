// Pages repliées de la barre latérale : un état d'écran, hors du document d'espace.
import type { IdPage, PageLue } from "@notionlike/document";
import { useState } from "react";

import { ancetresDe } from "./pages.ts";

export interface Repli {
  readonly repliees: ReadonlySet<IdPage>;
  readonly deplier: (pages: readonly IdPage[]) => void;
  readonly basculer: (id: IdPage) => void;
}

interface Etat {
  readonly repliees: ReadonlySet<IdPage>;
  /** Page désignée par l'adresse au dernier rendu. */
  readonly designee: IdPage | undefined;
}

const AU_DEPART: Etat = { repliees: new Set(), designee: undefined };

function sansLesPages(
  repliees: ReadonlySet<IdPage>,
  pages: readonly IdPage[],
): ReadonlySet<IdPage> {
  if (!pages.some((id) => repliees.has(id))) {
    return repliees;
  }
  const restantes = new Set(repliees);
  pages.forEach((id) => restantes.delete(id));
  return restantes;
}

function avecBascule(repliees: ReadonlySet<IdPage>, id: IdPage): ReadonlySet<IdPage> {
  const suivantes = new Set(repliees);
  if (!suivantes.delete(id)) {
    suivantes.add(id);
  }
  return suivantes;
}

/**
 * Les ancêtres de la page désignée se déplient quand elle change, pas quand l'arbre change, et dans
 * le rendu même qui affiche la sélection : l'état est ajusté pendant le rendu, jamais dans un effet
 * postérieur, de sorte qu'aucune validation ne montre la page sans sa rangée (F-004-AC54).
 */
export function useRepli(racines: readonly PageLue[], idPageDesignee: IdPage | undefined): Repli {
  const [etat, setEtat] = useState(AU_DEPART);
  let { repliees } = etat;
  if (etat.designee !== idPageDesignee) {
    const ancetres =
      idPageDesignee === undefined ? [] : ancetresDe(racines, idPageDesignee).map(({ id }) => id);
    repliees = sansLesPages(repliees, ancetres);
    setEtat({ repliees, designee: idPageDesignee });
  }
  return {
    repliees,
    deplier: (pages) =>
      setEtat((avant) => ({ ...avant, repliees: sansLesPages(avant.repliees, pages) })),
    basculer: (id) => setEtat((avant) => ({ ...avant, repliees: avecBascule(avant.repliees, id) })),
  };
}
