// Ce que les écrans des espaces savent de l'appareil (F-032-AC1, AC2, AC5, AC20) : le magasin de
// l'appareil et l'espace ouvert de l'onglet, offerts par l'écran de l'espace ouvert. Absents quand
// l'application n'a pas de pilote (tests d'avant F-032) : les écrans sont alors ceux de F-014.
import { createContext, useContext, useSyncExternalStore } from "react";

import type { EspaceDeLAppareil, EtatDeLAppareil, MagasinDeLAppareil } from "../espace/appareil.ts";
import { type CibleDeSession, memeCible } from "../espace/espace-ouvert.ts";

export interface AppareilDesEcrans {
  readonly magasin: MagasinDeLAppareil;
  /** L'espace ouvert de l'onglet. */
  readonly ouvert: CibleDeSession;
}

export const ContexteDeLAppareil = createContext<AppareilDesEcrans | undefined>(undefined);

export interface AppareilLu extends AppareilDesEcrans {
  /** Ce que le magasin a lu en dernier, tenu à jour entre les onglets (F-032-AC22). */
  readonly etat: EtatDeLAppareil;
}

const SANS_ABONNEMENT = (): (() => void) => () => undefined;

/** L'appareil lu ; `undefined` sans pilote. */
export function useAppareilDesEcrans(): AppareilLu | undefined {
  const appareil = useContext(ContexteDeLAppareil);
  const etat = useSyncExternalStore(appareil?.magasin.abonner ?? SANS_ABONNEMENT, () =>
    appareil?.magasin.lireEtat(),
  );
  return appareil === undefined || etat === undefined ? undefined : { ...appareil, etat };
}

/** La cible qui ouvre cet espace s'il est un espace de l'appareil ; sinon `undefined`. */
export function cibleSurLAppareil(
  etat: EtatDeLAppareil,
  idEspace: string,
): CibleDeSession | undefined {
  if (etat.espaceDeLAppareil?.idEspace === idEspace) {
    return { sorte: "appareil" };
  }
  return etat.autres.some((espace) => espace.idEspace === idEspace)
    ? { sorte: "ajoute", idEspace }
    : undefined;
}

/** Vrai si cette cible est l'espace ouvert de l'onglet. */
export function estOuvert(appareil: AppareilDesEcrans, cible: CibleDeSession): boolean {
  return memeCible(appareil.ouvert, cible);
}

/** L'espace de l'appareil que cette cible désigne, tel que le magasin l'a lu. */
export function espaceDeLaCible(
  etat: EtatDeLAppareil,
  cible: CibleDeSession,
): EspaceDeLAppareil | undefined {
  return cible.sorte === "appareil"
    ? etat.espaceDeLAppareil
    : etat.autres.find((espace) => espace.idEspace === cible.idEspace);
}
