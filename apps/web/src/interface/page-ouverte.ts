// Page ouverte par l'onglet (F-003-AC1, AC5) : la session de la page sélectionnée, ouverte quand la
// sélection paraît et fermée quand elle change ou disparaît. Au plus une à la fois.
import { useEffect, useState, useSyncExternalStore } from "react";

import { creerPagesOuvertes, type PagesOuvertes } from "../page/pages-ouvertes.ts";
import type { EtatSessionPage, SessionPage } from "../page/session-page.ts";

/** État de la page sélectionnée ; `undefined` quand aucune page ne l'est. */
export type EtatDeLaPage = EtatSessionPage | undefined;

const CHARGEMENT_AVANT_L_OUVERTURE: EtatSessionPage = { phase: "chargement" };
const SANS_ABONNEMENT = (): (() => void) => () => undefined;

interface Ouverte {
  readonly idPage: string;
  readonly session: SessionPage;
}

// Les documents de page de l'onglet vivent autant que l'écran de l'espace : les fermer libère
// aussi ceux qu'une coupure faisait conserver.
function usePagesOuvertes(): PagesOuvertes {
  const [pages] = useState(creerPagesOuvertes);
  useEffect(() => () => pages.fermer(), [pages]);
  return pages;
}

/**
 * Ouvre la page désignée par l'espace et son identifiant, qui vont tous deux au module de
 * persistance (F-003-AC1). La session naît dans un effet : rien n'est ouvert pendant le rendu, et
 * le double montage du mode strict ouvre, ferme, puis rouvre (F-003-AC33).
 */
export function usePageOuverte(
  idEspace: string | undefined,
  idPage: string | undefined,
): EtatDeLaPage {
  const pages = usePagesOuvertes();
  const [ouverte, setOuverte] = useState<Ouverte | undefined>(undefined);
  useEffect(() => {
    if (idPage === undefined) {
      return undefined;
    }
    const session = pages.ouvrir({ idEspace, idPage });
    setOuverte({ idPage, session });
    return () => {
      session.fermer();
      setOuverte(undefined);
    };
  }, [pages, idEspace, idPage]);
  // Entre le rendu qui change de page et l'effet qui ouvre la suivante, la session tenue est encore
  // celle de la page quittée : son contenu n'est jamais montré sous une autre page (F-003-AC5).
  const session = ouverte?.idPage === idPage ? ouverte?.session : undefined;
  const etat = useSyncExternalStore(
    session?.abonner ?? SANS_ABONNEMENT,
    () => session?.lireEtat() ?? CHARGEMENT_AVANT_L_OUVERTURE,
  );
  return idPage === undefined ? undefined : etat;
}
