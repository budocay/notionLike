// Tiroir de la barre latérale sur écran étroit (F-004-AC42, ADR-0010) : un état tenu par React
// seul. La structure de la coquille ne change pas ; ouvert, le conteneur de la barre devient un
// dialogue modal et le reste de l'application est inerte.
import {
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

import { useEcranEtroit } from "./largeur.ts";

/** Ce qui a fermé le tiroir décide de l'élément qui reçoit le focus. */
type Fermeture = "abandon" | "selection";

export interface Tiroir {
  readonly etroit: boolean;
  readonly ouvert: boolean;
  readonly boutonDOuverture: RefObject<HTMLButtonElement | null>;
  readonly boutonDeFermeture: RefObject<HTMLButtonElement | null>;
  /** Zone principale : le focus y va quand une page est choisie dans le tiroir. */
  readonly zonePrincipale: RefObject<HTMLElement | null>;
  readonly ouvrir: () => void;
  /** Échap, voile, bouton de fermeture : le focus revient au bouton d'ouverture. */
  readonly abandonner: () => void;
  readonly surTouche: (evenement: KeyboardEvent<HTMLElement>) => void;
  /** Clic dans la barre : choisir une page ferme le tiroir. */
  readonly surClic: (evenement: MouseEvent<HTMLElement>) => void;
}

const ECHAP = "Escape";
const LIEN_DE_PAGE = "li a[href]";

export function useTiroir(): Tiroir {
  const etroit = useEcranEtroit();
  const [demande, setDemande] = useState(false);
  const fermeture = useRef<Fermeture | undefined>(undefined);
  const boutonDOuverture = useRef<HTMLButtonElement>(null);
  const boutonDeFermeture = useRef<HTMLButtonElement>(null);
  const zonePrincipale = useRef<HTMLElement>(null);
  // Repassée au-dessus du seuil, la fenêtre oublie la demande : le tiroir ne se rouvre pas seul.
  if (!etroit && demande) {
    setDemande(false);
  }
  const ouvert = etroit && demande;

  // Le focus suit l'état une fois le rendu validé : `inert` est alors posé, ou retiré.
  useEffect(() => {
    if (ouvert) {
      boutonDeFermeture.current?.focus();
    } else if (fermeture.current === "abandon") {
      boutonDOuverture.current?.focus();
    } else if (fermeture.current === "selection") {
      zonePrincipale.current?.focus();
    }
    fermeture.current = undefined;
  }, [ouvert]);

  const fermer = (cause: Fermeture): void => {
    fermeture.current = cause;
    setDemande(false);
  };
  return {
    etroit,
    ouvert,
    boutonDOuverture,
    boutonDeFermeture,
    zonePrincipale,
    ouvrir: () => setDemande(true),
    abandonner: () => fermer("abandon"),
    surTouche: (evenement) => {
      // Échap déjà pris par une saisie de titre ou par un menu ne ferme pas le tiroir.
      if (ouvert && evenement.key === ECHAP && !evenement.defaultPrevented) {
        fermer("abandon");
      }
    },
    surClic: (evenement) => {
      if (ouvert && evenement.target instanceof Element && evenement.target.closest(LIEN_DE_PAGE)) {
        fermer("selection");
      }
    },
  };
}
