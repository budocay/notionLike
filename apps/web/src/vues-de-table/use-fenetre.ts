// Défilement de la grille et fenêtre des rangées présentes (F-018-AC46, AC47) : la zone défilante
// est mesurée à chaque défilement et à chaque redimensionnement ; la rangée de la rangée d'en-têtes,
// collée en haut, est retirée de la hauteur visible.
import { type RefObject, type UIEvent, useCallback, useEffect, useRef, useState } from "react";

import { defilementPour, type Fenetre, fenetre } from "./fenetre.ts";
import { HAUTEUR_DE_RANGEE } from "./grille.ts";

export interface FenetreDeLaGrille {
  readonly zone: RefObject<HTMLDivElement | null>;
  readonly courante: Fenetre;
  /** Rangées d'une hauteur de zone, une au moins (Page précédente, Page suivante). */
  readonly parPage: number;
  readonly surDefilement: (evenement: UIEvent<HTMLDivElement>) => void;
  /** Fait défiler la zone pour amener la ligne d'indice donné (0 pour la première) dans la vue. */
  readonly amener: (indice: number) => void;
}

interface Mesure {
  readonly defilement: number;
  readonly hauteur: number;
}

function mesurer(zone: HTMLDivElement | null): Mesure {
  return {
    defilement: zone?.scrollTop ?? 0,
    hauteur: Math.max(0, (zone?.clientHeight ?? 0) - HAUTEUR_DE_RANGEE),
  };
}

export function useFenetre(nombre: number): FenetreDeLaGrille {
  const zone = useRef<HTMLDivElement>(null);
  const [mesure, setMesure] = useState<Mesure>({ defilement: 0, hauteur: 0 });
  const remesurer = useCallback(() => {
    const suivante = mesurer(zone.current);
    setMesure((avant) =>
      avant.defilement === suivante.defilement && avant.hauteur === suivante.hauteur
        ? avant
        : suivante,
    );
  }, []);
  useEffect(() => {
    remesurer();
    window.addEventListener("resize", remesurer);
    return () => window.removeEventListener("resize", remesurer);
  }, [remesurer]);
  return {
    zone,
    courante: fenetre({
      defilement: mesure.defilement,
      hauteurZone: mesure.hauteur,
      hauteurRangee: HAUTEUR_DE_RANGEE,
      nombre,
    }),
    parPage: Math.max(1, Math.floor(mesure.hauteur / HAUTEUR_DE_RANGEE)),
    surDefilement: remesurer,
    amener: (indice) => {
      const element = zone.current;
      if (element === null) {
        return;
      }
      const cible = defilementPour(indice, {
        defilement: element.scrollTop,
        hauteurZone: mesurer(element).hauteur,
        hauteurRangee: HAUTEUR_DE_RANGEE,
      });
      if (cible !== undefined) {
        element.scrollTop = cible;
        remesurer();
      }
    },
  };
}
