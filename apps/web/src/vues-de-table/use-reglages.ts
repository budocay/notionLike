// Réglages de vue de la table affichée (F-018-AC40 à AC44) : lus une fois à l'ouverture, tenus en
// mémoire, écrits sur l'appareil à chaque changement par le module de persistance, jamais dans un
// document ni sur le réseau (AC42). Une largeur glissée au pointeur n'est écrite qu'au lâcher.
import type { IdColonne } from "@notionlike/document";
import { useState } from "react";

import { ecrireReglagesDeVue, lireReglagesDeVue } from "../persistance/index.ts";
import {
  largeurBornee,
  largeurDe,
  lireLesReglages,
  type ReglagesDeLaTable,
  SECTION_TABLEAU,
  SECTION_VUE,
  sectionDeLaVue,
  sectionDuTableau,
} from "./reglages.ts";
import { IDS_DES_VUES } from "./vues.ts";

export interface ReglagesDeVue {
  readonly vueActive: string;
  readonly largeurDe: (colonne: IdColonne) => number;
  /** `enregistrer` faux pendant un glissement : la largeur n'est écrite qu'au lâcher. */
  readonly reglerLargeur: (colonne: IdColonne, largeur: number, enregistrer: boolean) => void;
  readonly choisirLaVue: (vue: string) => void;
}

interface Designation {
  readonly idEspace: string | undefined;
  readonly idTable: string;
}

function designationDe({ idEspace, idTable }: Designation) {
  // Un espace encore inconnu ne désigne aucune clé : les réglages restent à l'écran.
  return { idEspace: idEspace ?? "", idTable };
}

export function useReglages(
  designation: Designation,
  colonnesLues: readonly IdColonne[],
): ReglagesDeVue {
  const [reglages, setReglages] = useState<ReglagesDeLaTable>(() =>
    lireLesReglages(lireReglagesDeVue(designationDe(designation)), IDS_DES_VUES),
  );
  const changer = (suivants: ReglagesDeLaTable, enregistrer: boolean): void => {
    setReglages(suivants);
    if (enregistrer) {
      ecrireReglagesDeVue(designationDe(designation), {
        [SECTION_VUE]: sectionDeLaVue(suivants.vueActive, IDS_DES_VUES[0] ?? ""),
        [SECTION_TABLEAU]: sectionDuTableau(suivants.largeurs, colonnesLues),
      });
    }
  };
  return {
    vueActive: reglages.vueActive,
    largeurDe: (colonne) => largeurDe(reglages, colonne),
    reglerLargeur: (colonne, largeur, enregistrer) => {
      const largeurs = new Map(reglages.largeurs);
      largeurs.set(colonne, largeurBornee(largeur));
      changer({ ...reglages, largeurs }, enregistrer);
    },
    choisirLaVue: (vue) => {
      if (IDS_DES_VUES.includes(vue)) {
        changer({ ...reglages, vueActive: vue }, true);
      }
    },
  };
}
