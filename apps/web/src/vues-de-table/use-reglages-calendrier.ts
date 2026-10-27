// Lecture et écriture du choix de colonne de date dans les réglages de vue de l'appareil (F-021-AC6,
// AC30) : la persistance locale est touchée ici seulement ; les fonctions pures sont dans
// `reglages-calendrier.ts`.
import type { IdColonne } from "@notionlike/document";
import { useState } from "react";

import { ecrireReglagesDeVue, lireReglagesDeVue } from "../persistance/index.ts";
import {
  colonneChoisieLue,
  SECTION_CALENDRIER,
  sectionDuCalendrier,
} from "./reglages-calendrier.ts";

interface Designation {
  readonly idEspace: string | undefined;
  readonly idTable: string;
}

function cleDe({ idEspace, idTable }: Designation) {
  // Un espace encore inconnu ne désigne aucune clé : aucun choix n'est lu.
  return { idEspace: idEspace ?? "", idTable };
}

/** Le choix de colonne de date de la table, relu si la désignation change ; écrit à chaque choix. */
export function useColonneChoisie(
  designation: Designation,
): readonly [IdColonne | undefined, (colonne: IdColonne) => void] {
  const { idEspace, idTable } = designation;
  const lire = (): IdColonne | undefined =>
    colonneChoisieLue(lireReglagesDeVue(cleDe(designation))[SECTION_CALENDRIER]);
  const [tenu, setTenu] = useState({ idEspace, idTable, colonne: lire() });
  let { colonne } = tenu;
  if (tenu.idEspace !== idEspace || tenu.idTable !== idTable) {
    colonne = lire();
    setTenu({ idEspace, idTable, colonne });
  }
  const choisir = (suivante: IdColonne): void => {
    setTenu({ idEspace, idTable, colonne: suivante });
    const cle = cleDe(designation);
    ecrireReglagesDeVue(cle, {
      [SECTION_CALENDRIER]: sectionDuCalendrier(
        suivante,
        lireReglagesDeVue(cle)[SECTION_CALENDRIER],
      ),
    });
  };
  return [colonne, choisir];
}
