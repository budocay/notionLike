// Réglages de vue de la table affichée (F-018-AC40 à AC44) : lus à l'ouverture, et relus si la clé
// qui les désigne change, tenus en mémoire, écrits sur l'appareil à chaque changement par le module
// de persistance, jamais dans un document ni sur le réseau (AC42). Une largeur glissée au pointeur
// n'est écrite qu'au lâcher.
import type { IdColonne } from "@notionlike/document";
import { useState } from "react";

import { ecrireReglagesDeVue, lireReglagesDeVue } from "../persistance/index.ts";
import {
  largeurBornee,
  largeurDe,
  largeursLues,
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

function lireLaDesignation(designation: Designation): ReglagesDeLaTable {
  return lireLesReglages(lireReglagesDeVue(designationDe(designation)), IDS_DES_VUES);
}

interface Tenus {
  readonly idEspace: string | undefined;
  readonly idTable: string;
  readonly reglages: ReglagesDeLaTable;
}

export function useReglages(
  designation: Designation,
  colonnesLues: readonly IdColonne[],
): ReglagesDeVue {
  const { idEspace, idTable } = designation;
  const [tenus, setTenus] = useState<Tenus>(() => ({
    idEspace,
    idTable,
    reglages: lireLaDesignation(designation),
  }));
  // Une table peut s'afficher avant que le stockage ne dise son espace (table tenue en mémoire,
  // F-018-AC14 ; `useTableOuverte`) : aucune clé, les réglages par défaut. L'espace connu, ou la désignation changée, ils sont relus sous la clé qui
  // les désigne désormais, pendant ce même rendu (état ajusté au changement d'une propriété).
  let { reglages } = tenus;
  if (tenus.idEspace !== idEspace || tenus.idTable !== idTable) {
    reglages = lireLaDesignation(designation);
    setTenus({ idEspace, idTable, reglages });
  }
  const setReglages = (suivants: ReglagesDeLaTable): void =>
    setTenus({ idEspace, idTable, reglages: suivants });
  // Seule la section changée est écrite, à partir de celle enregistrée : une vue ou une clé que
  // cette version ne connaît pas (écrite par un onglet plus récent) reste telle quelle (AC41, H4).
  const ecrire = (nom: string, section: (lue: unknown) => unknown): void => {
    const cle = designationDe(designation);
    ecrireReglagesDeVue(cle, { [nom]: section(lireReglagesDeVue(cle)[nom]) });
  };
  return {
    vueActive: reglages.vueActive,
    largeurDe: (colonne) => largeurDe(reglages, colonne),
    reglerLargeur: (colonne, largeur, enregistrer) => {
      const bornee = largeurBornee(largeur);
      setReglages({ ...reglages, largeurs: new Map(reglages.largeurs).set(colonne, bornee) });
      // La largeur réglée s'ajoute à celles enregistrées : celles qu'un autre onglet a écrites pour
      // d'autres colonnes restent (H4).
      if (enregistrer) {
        ecrire(SECTION_TABLEAU, (lue) =>
          sectionDuTableau(new Map(largeursLues(lue)).set(colonne, bornee), colonnesLues, lue),
        );
      }
    },
    choisirLaVue: (vue) => {
      if (IDS_DES_VUES.includes(vue)) {
        setReglages({ ...reglages, vueActive: vue });
        ecrire(SECTION_VUE, (lue) => sectionDeLaVue(vue, IDS_DES_VUES[0] ?? "", lue));
      }
    },
  };
}
