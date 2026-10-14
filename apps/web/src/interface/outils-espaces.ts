// Outils communs aux écrans des espaces (F-014) : une action à la fois (F-014-AC29), boîtes de
// dialogue qui rendent le focus (F-014-AC36), relecture au retour de l'onglet (F-014-AC32).
import { type KeyboardEvent, type RefObject, useEffect, useRef, useState } from "react";

import type { Resultat } from "../compte/index.ts";
import { estLaFrappe, TOUCHES_DE_BOITE } from "./raccourcis.ts";

export interface Verrou {
  /** Vrai pendant une requête d'action : les actions restent visibles mais désactivées. */
  readonly occupe: boolean;
  /** Lance l'appel s'il n'y en a aucun en cours ; sinon n'envoie rien et rend `undefined`. */
  readonly executer: <T>(appel: () => Promise<Resultat<T>>) => Promise<Resultat<T> | undefined>;
}

export function useVerrou(): Verrou {
  const verrou = useRef(false);
  const [occupe, setOccupe] = useState(false);
  return {
    occupe,
    executer: async (appel) => {
      if (verrou.current) {
        return undefined;
      }
      verrou.current = true;
      setOccupe(true);
      try {
        return await appel();
      } finally {
        verrou.current = false;
        setOccupe(false);
      }
    },
  };
}

export interface Boite<T> {
  readonly ouverte: T | undefined;
  /** L'origine est la commande qui a le focus, ou celle donnée quand une requête a précédé. */
  readonly ouvrir: (valeur: T, origine?: Element | null) => void;
  /** Ferme la boîte ; le focus revient à la commande d'origine, ou au repli si elle a disparu. */
  readonly fermer: () => void;
}

export function useBoite<T>(repli: RefObject<HTMLElement | null>): Boite<T> {
  const [ouverte, setOuverte] = useState<T | undefined>(undefined);
  const origine = useRef<HTMLElement | null>(null);
  const aRendre = useRef(false);
  useEffect(() => {
    if (ouverte !== undefined || !aRendre.current) {
      return;
    }
    aRendre.current = false;
    const cible = origine.current?.isConnected === true ? origine.current : repli.current;
    cible?.focus();
  });
  return {
    ouverte,
    ouvrir: (valeur, donnee) => {
      const actif = donnee === undefined ? document.activeElement : donnee;
      origine.current = actif instanceof HTMLElement ? actif : null;
      setOuverte(valeur);
    },
    fermer: () => {
      aRendre.current = true;
      setOuverte(undefined);
    },
  };
}

const VISIBLE = "visible";

/** Relit quand l'onglet redevient visible ; les listes ne sont pas tenues à jour en direct. */
export function useRelectureAuRetour(relire: () => void): void {
  const rappel = useRef(relire);
  useEffect(() => {
    rappel.current = relire;
  });
  useEffect(() => {
    const surVisibilite = (): void => {
      if (document.visibilityState === VISIBLE) {
        rappel.current();
      }
    };
    document.addEventListener("visibilitychange", surVisibilite);
    return () => document.removeEventListener("visibilitychange", surVisibilite);
  }, []);
}

/** Code de l'enveloppe d'une erreur, s'il y en a un. */
export function codeDe(resultat: Resultat<unknown> | undefined): string | undefined {
  return resultat !== undefined && !resultat.ok && resultat.erreur.type === "enveloppe"
    ? resultat.erreur.code
    : undefined;
}

/** Ce qu'un écran d'espace transmet à l'écran des espaces quand il y revient. */
export interface Sortie {
  readonly annonce: string | undefined;
  readonly alerte: string | undefined;
}

const FOCALISABLES =
  "button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], textarea:not([disabled])";

/**
 * Touches d'une boîte de dialogue (F-014-AC35, AC36) : Échap la ferme ; Tab et Maj+Tab bouclent sur
 * ses éléments focalisables, le reste de la page étant inerte.
 */
export function touchesDeBoite(
  fermer: () => void,
): (evenement: KeyboardEvent<HTMLElement>) => void {
  return (evenement) => {
    if (estLaFrappe(evenement, TOUCHES_DE_BOITE.fermer)) {
      evenement.preventDefault();
      evenement.stopPropagation();
      fermer();
      return;
    }
    const arriere = estLaFrappe(evenement, TOUCHES_DE_BOITE.precedent);
    if (!arriere && !estLaFrappe(evenement, TOUCHES_DE_BOITE.suivant)) {
      return;
    }
    const elements = [...evenement.currentTarget.querySelectorAll<HTMLElement>(FOCALISABLES)];
    const actif = elements.findIndex((element) => element === document.activeElement);
    const depart = actif === -1 ? (arriere ? 0 : -1) : actif;
    const suivant = elements[(depart + (arriere ? -1 : 1) + elements.length) % elements.length];
    if (suivant !== undefined) {
      evenement.preventDefault();
      suivant.focus();
    }
  };
}

/** Échap abandonne un formulaire sans requête (F-014-AC9). */
export function toucheDAbandon(
  abandonner: () => void,
): (evenement: KeyboardEvent<HTMLElement>) => void {
  return (evenement) => {
    if (estLaFrappe(evenement, TOUCHES_DE_BOITE.fermer)) {
      evenement.preventDefault();
      abandonner();
    }
  };
}
