// Seule aide qui simule la largeur de la fenêtre sous jsdom, qui n'a ni mise en page ni
// `matchMedia` (F-004-AC41) : elle pose sur la racine la valeur du seuil lue dans le fichier des
// jetons, comme la feuille compilée le fait dans un navigateur, et répond aux requêtes de largeur
// d'après la largeur voulue.
import { act } from "@testing-library/react";
import { vi } from "vitest";

import { lireJetons } from "../src/styles/lecture-jetons.ts";
import { lire } from "./aides-disque.ts";

const PIXELS_PAR_REM = 16;
const JETON_DU_SEUIL = "--breakpoint-etroit";

/** Valeur du seuil étroit, telle que le fichier des jetons la déclare (« 51.25rem »). */
export function seuilEtroit(): string {
  const { theme } = lireJetons(lire("src/styles/jetons.css"));
  const jeton = theme.find(({ nom }) => nom === JETON_DU_SEUIL);
  if (jeton === undefined) {
    throw new Error(`Le fichier des jetons ne déclare pas ${JETON_DU_SEUIL}.`);
  }
  return jeton.valeur;
}

export function seuilEtroitEnPixels(): number {
  return Number.parseFloat(seuilEtroit()) * PIXELS_PAR_REM;
}

export interface FenetreSimulee {
  /** Requêtes que le code a posées à `matchMedia`, dans l'ordre. */
  readonly requetes: string[];
  /** Change la largeur et prévient les abonnés des requêtes dont la réponse change. */
  changer(largeur: number): void;
}

const REQUETE_DE_LARGEUR = /^\(width >= ([\d.]+)rem\)$/;

function repond(requete: string, largeur: number): boolean {
  const seuil = REQUETE_DE_LARGEUR.exec(requete)?.[1];
  if (seuil === undefined) {
    throw new Error(`Requête que l'aide ne sait pas simuler : ${requete}`);
  }
  return largeur >= Number(seuil) * PIXELS_PAR_REM;
}

/** Donne à la fenêtre simulée la largeur voulue, en pixels, jusqu'à la fin du test. */
export function simulerLaLargeur(largeurInitiale: number): FenetreSimulee {
  let largeur = largeurInitiale;
  const requetes: string[] = [];
  const abonnes = new Map<() => void, string>();
  document.documentElement.style.setProperty(JETON_DU_SEUIL, seuilEtroit());
  vi.stubGlobal("matchMedia", (requete: string) => {
    requetes.push(requete);
    return {
      media: requete,
      get matches(): boolean {
        return repond(requete, largeur);
      },
      addEventListener: (_type: string, rappel: () => void) => void abonnes.set(rappel, requete),
      removeEventListener: (_type: string, rappel: () => void) => void abonnes.delete(rappel),
    };
  });
  return {
    requetes,
    changer(nouvelle) {
      const avant = largeur;
      largeur = nouvelle;
      act(() => {
        for (const [rappel, requete] of [...abonnes]) {
          if (repond(requete, avant) !== repond(requete, nouvelle)) {
            rappel();
          }
        }
      });
    },
  };
}
