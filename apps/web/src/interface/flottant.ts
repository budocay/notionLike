// Surface flottante ouverte par une commande (menu « ⋯ » d'une rangée, liste des pages
// intermédiaires du fil d'Ariane) : un seul état, tenu par le composant qui l'ouvre.
import { type RefObject, useEffect, useRef, useState } from "react";

import { estLeBoutonPrincipal } from "./clic.ts";

export interface Flottant<Surface extends HTMLElement> {
  readonly ouvert: boolean;
  /** Commande qui ouvre la surface : le focus lui revient à la fermeture sans choix. */
  readonly commande: RefObject<HTMLButtonElement | null>;
  readonly surface: RefObject<Surface | null>;
  readonly basculer: () => void;
  /** Ferme sans toucher au focus : un choix vient d'être fait, il décide de la suite. */
  readonly fermer: () => void;
}

const ECHAP = "Escape";
const PREMIER_ACTIVABLE = "button, a[href]";

function contient(element: Element | null, cible: EventTarget | null): boolean {
  return element !== null && cible instanceof Node && element.contains(cible);
}

interface Dehors {
  /** Vrai si la cible est dans la surface ou sur sa commande. */
  readonly dedans: (cible: EventTarget | null) => boolean;
  /** Ferme et rend le focus à la commande. */
  readonly abandonner: () => void;
  readonly fermer: () => void;
}

// Écoute le document tant que la surface est ouverte, et rend de quoi cesser. Le bouton principal
// enfoncé au dehors ne déplace pas le focus : la surface reste ouverte jusqu'au clic, qui est alors
// arrêté avant d'atteindre ce qu'il vise. Un clic droit ou du milieu garde son effet par défaut.
function ecouterLeDehors({ dedans, abandonner, fermer }: Dehors): () => void {
  const sansEffet = (evenement: Event): void => {
    evenement.preventDefault();
    evenement.stopPropagation();
    abandonner();
  };
  const surAppui = (evenement: MouseEvent): void => {
    if (estLeBoutonPrincipal(evenement) && !dedans(evenement.target)) {
      evenement.preventDefault();
    }
  };
  const surClic = (evenement: MouseEvent): void => {
    if (!dedans(evenement.target)) {
      sansEffet(evenement);
    }
  };
  const surTouche = (evenement: KeyboardEvent): void => {
    if (evenement.key === ECHAP) {
      sansEffet(evenement);
    }
  };
  const surFocus = (evenement: FocusEvent): void => {
    if (!dedans(evenement.target)) {
      fermer();
    }
  };
  document.addEventListener("mousedown", surAppui, true);
  document.addEventListener("click", surClic, true);
  document.addEventListener("keydown", surTouche, true);
  document.addEventListener("focusin", surFocus);
  return () => {
    document.removeEventListener("mousedown", surAppui, true);
    document.removeEventListener("click", surClic, true);
    document.removeEventListener("keydown", surTouche, true);
    document.removeEventListener("focusin", surFocus);
  };
}

/**
 * Tant que la surface est ouverte : le focus va à son premier élément ; Échap et un clic au dehors
 * la ferment sans effet (le clic n'active pas ce qu'il vise) et rendent le focus à la commande ; le
 * focus qui la quitte la ferme.
 */
export function useFlottant<Surface extends HTMLElement>(): Flottant<Surface> {
  const [ouvert, setOuvert] = useState(false);
  const commande = useRef<HTMLButtonElement>(null);
  const surface = useRef<Surface>(null);

  useEffect(() => {
    if (!ouvert) {
      return undefined;
    }
    surface.current?.querySelector<HTMLElement>(PREMIER_ACTIVABLE)?.focus();
    return ecouterLeDehors({
      dedans: (cible) => contient(surface.current, cible) || contient(commande.current, cible),
      abandonner: () => {
        setOuvert(false);
        commande.current?.focus();
      },
      fermer: () => setOuvert(false),
    });
  }, [ouvert]);

  return {
    ouvert,
    commande,
    surface,
    basculer: () => setOuvert((avant) => !avant),
    fermer: () => setOuvert(false),
  };
}
