// Délais de la reprise (F-013-AC20), réglés ici et non par le fournisseur : 1 seconde, puis
// l'attente double à chaque échec jusqu'à 30 secondes, avec un aléa de 20 % au plus, sans limite de
// nombre, et jamais plus d'une tentative par seconde.
import type { Horloge } from "./environnement.ts";

export const PREMIERE_ATTENTE_MS = 1000;
export const ATTENTE_PLAFOND_MS = 30_000;
export const PART_D_ALEA = 0.2;
export const INTERVALLE_MINIMAL_MS = 1000;
/** Après une fermeture par `trop-de-requetes` (F-013-AC21). */
export const ATTENTE_APRES_TROP_DE_REQUETES_MS = 10_000;

/** Attente avant la tentative qui suit `echecs` échecs consécutifs (le premier vaut 0). */
export function attenteApres(echecs: number, alea: number): number {
  const base = Math.min(ATTENTE_PLAFOND_MS, PREMIERE_ATTENTE_MS * 2 ** echecs);
  return Math.max(INTERVALLE_MINIMAL_MS, Math.round(base * (1 - PART_D_ALEA * alea)));
}

export interface Reprise {
  /** Programme la tentative suivante, après l'attente due ; remplace une tentative programmée. */
  programmer(tenter: () => void, plancherMs?: number): void;
  /** Tente aussitôt, ou dès que l'intervalle minimal depuis la dernière tentative est écoulé. */
  aussitot(tenter: () => void): void;
  /** La connexion est établie : l'attente repart de la première. */
  reinitialiser(): void;
  annuler(): void;
  estProgrammee(): boolean;
}

export function creerReprise(horloge: Horloge, alea: () => number): Reprise {
  let echecs = 0;
  let derniere = Number.NEGATIVE_INFINITY;
  let annuler: (() => void) | undefined;
  const lancer = (tenter: () => void, delaiMs: number): void => {
    annuler?.();
    annuler = horloge.programmer(() => {
      annuler = undefined;
      derniere = horloge.maintenant();
      tenter();
    }, delaiMs);
  };
  return {
    programmer: (tenter, plancherMs = 0) => {
      const attente = Math.max(plancherMs, attenteApres(echecs, alea()));
      echecs += 1;
      lancer(tenter, attente);
    },
    aussitot: (tenter) => {
      const ecoule = horloge.maintenant() - derniere;
      lancer(tenter, Math.max(0, INTERVALLE_MINIMAL_MS - ecoule));
    },
    reinitialiser: () => {
      echecs = 0;
    },
    annuler: () => {
      annuler?.();
      annuler = undefined;
    },
    estProgrammee: () => annuler !== undefined,
  };
}
