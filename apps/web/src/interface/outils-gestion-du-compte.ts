// Outils de l'écran du compte (F-027) : une action à la fois, délai imposé par un 429, lecture des
// sessions, et ce que tout échec déclenche. Aucun mot de passe ne passe par ici : il reste dans
// l'état du formulaire qui l'envoie, effacé après sa requête (F-027-AC23).
import { useCallback, useEffect, useRef, useState } from "react";

import type { Compte, ErreurDEspaces, SessionLue } from "../compte/index.ts";
import { ENVOI_BLOQUE, REQUETE_EN_COURS, texteDEchec } from "./messages-gestion-du-compte.ts";
import { codeDe, useRelectureAuRetour, useVerrou, type Verrou } from "./outils-espaces.ts";

const MS_PAR_SECONDE = 1000;

export interface Blocage {
  readonly bloque: boolean;
  /** Désactive les envois pendant ce délai (F-010-AC15, F-027-AC25). */
  readonly imposer: (secondes: number) => void;
}

function useBlocage(): Blocage {
  const [bloque, setBloque] = useState(false);
  const minuterie = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(minuterie.current), []);
  return {
    bloque,
    imposer: (secondes) => {
      clearTimeout(minuterie.current);
      setBloque(true);
      minuterie.current = setTimeout(() => setBloque(false), secondes * MS_PAR_SECONDE);
    },
  };
}

export type ListeDesSessions =
  | { readonly statut: "attente" }
  | { readonly statut: "pret"; readonly sessions: readonly SessionLue[] }
  | { readonly statut: "echec"; readonly erreur: ErreurDEspaces };

export interface Sessions {
  readonly liste: ListeDesSessions;
  readonly relire: () => void;
  readonly retirer: (idSession: string) => void;
}

/** Ce que partagent les trois parties de l'écran d'un compte connecté. */
export interface Moyens {
  readonly compte: Compte;
  readonly verrou: Verrou;
  readonly blocage: Blocage;
  /** Raison pour laquelle les envois sont désactivés, s'il y en a une (F-027-AC26). */
  readonly raison: string | undefined;
  readonly annoncer: (texte: string) => void;
  readonly sessions: Sessions;
}

export function useMoyens(compte: Compte, annoncer: (texte: string) => void): Moyens {
  const verrou = useVerrou();
  const blocage = useBlocage();
  const sessions = useSessions(compte);
  const raison = blocage.bloque ? ENVOI_BLOQUE : verrou.occupe ? REQUETE_EN_COURS : undefined;
  return { compte, verrou, blocage, raison, annoncer, sessions };
}

/**
 * Phrases d'un échec, et ses suites : un 429 suspend les envois, un 401 demande une revérification
 * de l'état du compte, qui ramène l'écran à « Connectez-vous » (F-027-AC25).
 */
export function phrasesDEchec(erreur: ErreurDEspaces, moyens: Moyens): readonly string[] {
  if (erreur.type === "trop-de-requetes") {
    moyens.blocage.imposer(erreur.delaiSecondes);
  }
  if (estNonAuthentifie(erreur)) {
    void moyens.compte.suivi.reverifier();
  }
  return texteDEchec(erreur);
}

function estNonAuthentifie(erreur: ErreurDEspaces): boolean {
  return codeDe({ ok: false, erreur }) === "non-authentifie";
}

const ATTENTE: ListeDesSessions = { statut: "attente" };

/** Sessions lues à l'ouverture de l'écran et au retour de l'onglet ; jamais conservées. */
function useSessions(compte: Compte): Sessions {
  const [liste, setListe] = useState<ListeDesSessions>(ATTENTE);
  const relire = useCallback(() => {
    void compte.gestion.listerLesSessions().then((resultat) => {
      if (!resultat.ok && estNonAuthentifie(resultat.erreur)) {
        void compte.suivi.reverifier();
      }
      setListe(
        resultat.ok
          ? { statut: "pret", sessions: resultat.valeur }
          : { statut: "echec", erreur: resultat.erreur },
      );
    });
  }, [compte]);
  useEffect(relire, [relire]);
  useRelectureAuRetour(relire);
  const retirer = (idSession: string): void =>
    setListe((avant) =>
      avant.statut === "pret"
        ? { statut: "pret", sessions: avant.sessions.filter((s) => s.idSession !== idSession) }
        : avant,
    );
  return { liste, relire, retirer };
}
