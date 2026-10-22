// Séparateur de largeur d'un en-tête (F-018-AC43, AC34) : glissé au pointeur, ou, au focus, réglé
// par Flèche gauche et Flèche droite de 16 pixels par pression, de 60 à 800 ; Échap ou Entrée rend
// le focus à l'en-tête. La largeur glissée n'est écrite qu'au lâcher.
import type { ColonneLue } from "@notionlike/document";
import { type KeyboardEvent, type PointerEvent, type ReactElement, useRef } from "react";

import { SeparateurDeColonne } from "../interface/composants/Table.tsx";
import { estLaFrappe, TOUCHES_DE_L_EDITION } from "../interface/raccourcis.ts";
import { cleDeCellule } from "./courante.ts";
import { LARGEUR_MAX, LARGEUR_MIN, PAS_DE_LARGEUR } from "./reglages.ts";
import { largeurDeLaColonne } from "./textes.ts";
import type { VueTableau } from "./use-vue-tableau.ts";

// Flèches gauche et droite : 16 pixels de moins ou de plus ; Échap ou Entrée : retour à l'en-tête.
function toucheDuSeparateur(
  evenement: KeyboardEvent<HTMLDivElement>,
  effets: { readonly regler: (pas: number) => void; readonly quitter: () => void },
): void {
  const pas = estLaFrappe(evenement, TOUCHES_DE_L_EDITION.elargir)
    ? PAS_DE_LARGEUR
    : estLaFrappe(evenement, TOUCHES_DE_L_EDITION.retrecir)
      ? -PAS_DE_LARGEUR
      : 0;
  if (pas !== 0) {
    evenement.preventDefault();
    effets.regler(pas);
  } else if (
    estLaFrappe(evenement, TOUCHES_DE_L_EDITION.abandonner) ||
    estLaFrappe(evenement, TOUCHES_DE_L_EDITION.validerEtDescendre)
  ) {
    evenement.preventDefault();
    effets.quitter();
  }
}

interface Glissement {
  readonly depart: number;
  readonly largeur: number;
}

export function Separateur(props: {
  readonly vue: VueTableau;
  readonly colonne: ColonneLue;
}): ReactElement {
  const { vue, colonne } = props;
  const { largeurDe, reglerLargeur } = vue.proprietes;
  const largeur = largeurDe(colonne.id);
  const glissement = useRef<Glissement | undefined>(undefined);
  const surTouche = (evenement: KeyboardEvent<HTMLDivElement>): void =>
    toucheDuSeparateur(evenement, {
      regler: (pas) => reglerLargeur(colonne.id, largeur + pas, true),
      quitter: () => vue.courante.elementDe(cleDeCellule(null, colonne.id))?.focus(),
    });
  const glisse = (evenement: PointerEvent<HTMLDivElement>, fin: boolean): void => {
    const encours = glissement.current;
    if (encours !== undefined) {
      reglerLargeur(colonne.id, encours.largeur + evenement.clientX - encours.depart, fin);
    }
    if (fin) {
      glissement.current = undefined;
    }
  };
  return (
    <SeparateurDeColonne
      nom={largeurDeLaColonne(colonne.nom)}
      valeur={largeur}
      min={LARGEUR_MIN}
      max={LARGEUR_MAX}
      refSeparateur={(element) => {
        if (element === null) {
          vue.separateurs.delete(colonne.id);
        } else {
          vue.separateurs.set(colonne.id, element);
        }
      }}
      surTouche={surTouche}
      surAppui={(evenement) => {
        evenement.preventDefault();
        evenement.currentTarget.setPointerCapture?.(evenement.pointerId);
        glissement.current = { depart: evenement.clientX, largeur };
      }}
      surGlisse={(evenement) => glisse(evenement, false)}
      surLacher={(evenement) => glisse(evenement, true)}
    />
  );
}
