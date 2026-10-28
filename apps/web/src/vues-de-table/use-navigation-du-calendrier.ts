// Navigation de la vue calendrier (F-021-AC2, AC9, AC8) : le mois affiché, les cases dépliées, la
// case qui porte l'arrêt de tabulation et la longueur du panneau « Sans date ». Tout vit en mémoire,
// par onglet : rien n'est inscrit dans un document, dans les réglages de vue ni dans l'adresse, et
// la vue rouvre sur le mois d'aujourd'hui.
import { useState } from "react";

import { aujourdhui } from "./aujourdhui.ts";
import { moisDuJour, type MoisAffiche } from "./jours.ts";
import { titreDuMois } from "./textes-calendrier.ts";

/** Entrées présentées dans une case non dépliée (AC9). */
export const ENTREES_PAR_CASE = 3;
/** Lignes du panneau « Sans date » présentées, et ajoutées à chaque demande (AC8). */
export const LIGNES_DU_PANNEAU = 100;

export interface NavigationDuCalendrier {
  readonly mois: MoisAffiche;
  readonly depliees: ReadonlySet<string>;
  readonly limiteDuPanneau: number;
  readonly courant: string | undefined;
  /** Affiche le mois et l'annonce ; sans effet si le mois est hors des bornes. */
  readonly afficherLeMois: (mois: MoisAffiche | undefined) => void;
  /** Affiche le mois sans l'annoncer : le déplacement d'un jour l'annonce lui-même. */
  readonly montrerLeMois: (mois: MoisAffiche) => void;
  readonly choisirLeJour: (jour: string) => void;
  readonly deplier: (jour: string) => void;
  /** Montre au moins `rang + 1` lignes du panneau, par paquets de 100. */
  readonly elargirLePanneauJusqua: (rang: number) => void;
}

export function moisDAujourdhui(): MoisAffiche {
  return moisDuJour(aujourdhui()) ?? { annee: 1, mois: 1 };
}

export function useNavigationDuCalendrier(
  annoncer: (texte: string) => void,
): NavigationDuCalendrier {
  const [mois, setMois] = useState<MoisAffiche>(moisDAujourdhui);
  const [depliees, setDepliees] = useState<ReadonlySet<string>>(new Set());
  const [limiteDuPanneau, setLimite] = useState(LIGNES_DU_PANNEAU);
  const [courant, setCourant] = useState<string | undefined>(undefined);
  const montrerLeMois = (suivant: MoisAffiche): void => {
    setMois(suivant);
    setDepliees(new Set());
  };
  return {
    mois,
    depliees,
    limiteDuPanneau,
    courant,
    montrerLeMois,
    afficherLeMois: (suivant) => {
      if (suivant !== undefined) {
        montrerLeMois(suivant);
        setCourant(undefined);
        annoncer(titreDuMois(suivant));
      }
    },
    choisirLeJour: setCourant,
    deplier: (jour) => setDepliees((avant) => new Set(avant).add(jour)),
    elargirLePanneauJusqua: (rang) =>
      setLimite((avant) =>
        Math.max(avant, Math.ceil((rang + 1) / LIGNES_DU_PANNEAU) * LIGNES_DU_PANNEAU),
      ),
  };
}
