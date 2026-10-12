// Ce que l'écran dit de l'enregistrement sur l'appareil (F-030) : l'avertissement pendant une
// coupure, et la zone d'état de la barre du haut. Seul lecteur de l'affirmation « Enregistré sur
// cet appareil », qu'il ne donne que pour un état dont la preuve d'écriture est faite (F-030-AC29).
import { type ReactElement, type RefObject, useCallback, useState } from "react";

import type { EtatPret } from "../espace/session-espace.ts";
import { ZoneEtat } from "./composants/BarreDuHaut.tsx";
import { Avertissement } from "./composants/Etats.tsx";
import {
  ANNONCE_DE_REPRISE,
  AVERTISSEMENT_BASE_NON_RELUE,
  AVERTISSEMENT_BASES_NON_RATTACHEES,
  AVERTISSEMENT_NON_ENREGISTRE,
  ENREGISTRE,
  NON_ENREGISTRE,
  REESSAYER_MAINTENANT,
} from "./messages.ts";

function phrasesDe(etat: EtatPret): string[] {
  return [
    ...(etat.enregistre ? [] : [AVERTISSEMENT_NON_ENREGISTRE]),
    ...(etat.enregistre || etat.baseRelue ? [] : [AVERTISSEMENT_BASE_NON_RELUE]),
    ...(etat.basesNonRattachees ? [AVERTISSEMENT_BASES_NON_RATTACHEES] : []),
  ];
}

interface ProprietesAvertissementDEnregistrement {
  readonly etat: EtatPret;
  /** Reçoit le focus quand la reprise retire le bouton qui l'avait. */
  readonly zonePrincipale: RefObject<HTMLElement | null>;
}

/**
 * Avertissement affiché sans interruption de la coupure à la reprise, tentatives comprises : son
 * contenu ne dépend pas d'elles, il n'est donc annoncé qu'une fois (F-030-AC12).
 */
export function AvertissementDEnregistrement(
  props: ProprietesAvertissementDEnregistrement,
): ReactElement | null {
  const { etat, zonePrincipale } = props;
  // Le bouton disparaît avec l'avertissement : s'il avait le focus, le focus irait au document.
  const refBouton = useCallback(
    (bouton: HTMLButtonElement | null) => () => {
      if (bouton !== null && document.activeElement === bouton) {
        zonePrincipale.current?.focus();
      }
    },
    [zonePrincipale],
  );
  const phrases = phrasesDe(etat);
  if (phrases.length === 0) {
    return null;
  }
  const action = etat.enregistre
    ? undefined
    : { libelle: REESSAYER_MAINTENANT, surActivation: etat.reessayer, refBouton };
  return <Avertissement phrases={phrases} action={action} />;
}

// Vrai depuis qu'une reprise a eu lieu sous les yeux de l'utilisateur, tant que l'enregistrement
// tient : l'état d'une ouverture réussie n'est pas une reprise, et n'est pas annoncé comme telle.
function useReprise(enregistre: boolean): boolean {
  const [suivi, setSuivi] = useState({ enregistre, reprise: false });
  if (suivi.enregistre !== enregistre) {
    setSuivi({ enregistre, reprise: enregistre });
    return enregistre;
  }
  return suivi.reprise;
}

/** Zone d'état de la barre du haut : elle lit l'état de la session, sans autre abonné (F-004-AC40). */
export function ZoneDEnregistrement({ etat }: { readonly etat: EtatPret }): ReactElement {
  const reprise = useReprise(etat.enregistre);
  if (!etat.enregistre) {
    return <ZoneEtat echec={NON_ENREGISTRE} />;
  }
  return (
    <ZoneEtat
      echec={undefined}
      affirmation={ENREGISTRE}
      annonce={reprise ? ANNONCE_DE_REPRISE : undefined}
    />
  );
}
