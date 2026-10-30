// Colonne de regroupement du kanban (F-020-AC4) : lue dans la section `kanban` des réglages de vue de
// l'appareil à l'ouverture et si la désignation de la table change, tenue en mémoire, écrite à chaque
// choix par le module de persistance, jamais dans un document ni sur le réseau (F-018-AC42).
import type { ColonneLue, IdColonne, TableLue } from "@notionlike/document";
import { useState } from "react";

import { ecrireReglagesDeVue, lireReglagesDeVue } from "../../persistance/index.ts";
import { colonneDeRegroupement, colonnesDeSelection } from "./piles.ts";
import { regroupementLu, SECTION_KANBAN, sectionDuKanban } from "./reglages-kanban.ts";

interface Designation {
  readonly idEspace: string | undefined;
  readonly idTable: string;
}

export interface Regroupement {
  /** Colonne dont les options forment les piles ; `undefined` : la table n'a aucune colonne `selection`. */
  readonly colonne: ColonneLue | undefined;
  /** Les colonnes `selection` : « Regrouper par » n'est offert qu'à partir de deux. */
  readonly choix: readonly ColonneLue[];
  readonly choisir: (colonne: IdColonne) => void;
}

// Un espace encore inconnu ne désigne aucune clé : aucun choix, les réglages restent à l'écran.
function cleDe({ idEspace, idTable }: Designation) {
  return { idEspace: idEspace ?? "", idTable };
}

function lireLeChoix(designation: Designation): IdColonne | undefined {
  return regroupementLu(lireReglagesDeVue(cleDe(designation))[SECTION_KANBAN]);
}

export function useRegroupement(designation: Designation, lue: TableLue): Regroupement {
  const { idEspace, idTable } = designation;
  const [tenu, setTenu] = useState(() => ({
    idEspace,
    idTable,
    choisie: lireLeChoix(designation),
  }));
  let { choisie } = tenu;
  if (tenu.idEspace !== idEspace || tenu.idTable !== idTable) {
    choisie = lireLeChoix(designation);
    setTenu({ idEspace, idTable, choisie });
  }
  const choix = colonnesDeSelection(lue);
  return {
    colonne: colonneDeRegroupement(lue, choisie),
    choix,
    choisir: (colonne) => {
      setTenu({ idEspace, idTable, choisie: colonne });
      const cle = cleDe(designation);
      ecrireReglagesDeVue(cle, {
        [SECTION_KANBAN]: sectionDuKanban(colonne, lireReglagesDeVue(cle)[SECTION_KANBAN]),
      });
    },
  };
}
