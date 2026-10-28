// Lecture et écriture du choix de colonne de date dans les réglages de vue de l'appareil (F-021-AC6,
// AC30) : la persistance locale est touchée ici seulement ; les fonctions pures sont dans
// `reglages-calendrier.ts`.
import type { IdColonne } from "@notionlike/document";
import { useState } from "react";

import { ecrireReglagesDeVue, lireReglagesDeVue } from "../persistance/index.ts";
import { colonneChoisieLue, sectionDuCalendrier } from "./reglages-calendrier.ts";
import { SECTION_CALENDRIER } from "./reglages.ts";

interface Designation {
  readonly idEspace: string | undefined;
  readonly idTable: string;
}

/** Un espace encore inconnu ne désigne aucune clé : rien n'est lu, rien n'est écrit. */
function lireLeChoix({ idEspace, idTable }: Designation): IdColonne | undefined {
  return idEspace === undefined
    ? undefined
    : colonneChoisieLue(lireReglagesDeVue({ idEspace, idTable })[SECTION_CALENDRIER]);
}

/** Le choix de colonne de date de la table, relu si la désignation change ; écrit à chaque choix. */
export function useColonneChoisie(
  designation: Designation,
): readonly [IdColonne | undefined, (colonne: IdColonne) => void] {
  const { idEspace, idTable } = designation;
  const [tenu, setTenu] = useState(() => ({
    idEspace,
    idTable,
    colonne: lireLeChoix(designation),
  }));
  let { colonne } = tenu;
  if (tenu.idEspace !== idEspace || tenu.idTable !== idTable) {
    colonne = lireLeChoix(designation);
    setTenu({ idEspace, idTable, colonne });
  }
  const choisir = (suivante: IdColonne): void => {
    setTenu({ idEspace, idTable, colonne: suivante });
    if (idEspace === undefined) {
      return;
    }
    const cle = { idEspace, idTable };
    ecrireReglagesDeVue(cle, {
      [SECTION_CALENDRIER]: sectionDuCalendrier(
        suivante,
        lireReglagesDeVue(cle)[SECTION_CALENDRIER],
      ),
    });
  };
  return [colonne, choisir];
}
