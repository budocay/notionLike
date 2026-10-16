// État du panneau de lien (F-028-AC6, AC7, AC12, AC27) : ouvert par la commande « Lien » ou par
// Mod+K, fermé par Échap, par une adresse appliquée, par un lien retiré, ou quand le focus quitte la
// zone d'édition ou revient dans la zone de saisie. Ouvrir ou fermer le panneau n'écrit rien.
import type { Editor } from "@tiptap/core";
import { type FocusEvent, type KeyboardEvent, useEffect, useState } from "react";

import { effetDuRaccourciDeLien, poserLeLien, retirerLeLien } from "./commandes-de-marque.ts";

interface Etat {
  readonly ouvert: boolean;
  /** Vrai après une adresse refusée, jusqu'à la fermeture (F-028-AC12). */
  readonly refuse: boolean;
}

const FERME: Etat = { ouvert: false, refuse: false };
const OUVERT: Etat = { ouvert: true, refuse: false };
const REFUSE: Etat = { ouvert: true, refuse: true };

export interface EtatDuPanneau extends Etat {
  /** Commande « Lien » : sans effet si elle est indisponible. */
  readonly ouvrir: (disponible: boolean) => void;
  /** Mod+K depuis la zone de saisie (H12). */
  readonly surRaccourci: (frappe: KeyboardEvent<HTMLElement>) => void;
  readonly surPerteDeFocus: (evenement: FocusEvent<HTMLElement>) => void;
  readonly valider: (saisie: string) => void;
  readonly retirer: () => void;
  /** Ferme sans rien modifier et rend le focus à l'éditeur, sélection conservée. */
  readonly abandonner: () => void;
}

// Vrai si Mod+K ouvre le panneau. Sélection vide hors d'un lien : la combinaison reste à la
// palette de commandes, et n'est pas retenue (H12).
function surLeRaccourci(editeur: Editor, frappe: KeyboardEvent<HTMLElement>): boolean {
  const effet = effetDuRaccourciDeLien(editeur);
  if (effet !== "palette") {
    frappe.preventDefault();
  }
  return effet === "panneau";
}

export function usePanneauDeLien(editeur: Editor | null): EtatDuPanneau {
  const [etat, setEtat] = useState(FERME);
  useEffect(() => {
    if (editeur === null) {
      return undefined;
    }
    const fermer = (): void => setEtat(FERME);
    editeur.on("focus", fermer);
    return () => void editeur.off("focus", fermer);
  }, [editeur]);

  const abandonner = (): void => {
    setEtat(FERME);
    editeur?.view.focus();
  };
  return {
    ...etat,
    ouvrir: (disponible) => {
      if (disponible) {
        setEtat(OUVERT);
      }
    },
    surRaccourci: (frappe) => {
      if (editeur !== null && surLeRaccourci(editeur, frappe)) {
        setEtat(OUVERT);
      }
    },
    surPerteDeFocus: (evenement) => {
      if (!evenement.currentTarget.contains(evenement.relatedTarget)) {
        setEtat(FERME);
      }
    },
    valider: (saisie) => {
      if (editeur !== null && poserLeLien(editeur, saisie)) {
        abandonner();
      } else {
        setEtat(REFUSE);
      }
    },
    retirer: () => {
      if (editeur !== null) {
        retirerLeLien(editeur);
      }
      abandonner();
    },
    abandonner,
  };
}
