// État de synchronisation que le module expose (F-013-AC31, AC32) : aucun type du fournisseur. Un
// état affiché et un seul, le premier dont la condition est vraie, dans une liste fermée.
import type { Droit } from "./stockage.ts";

export type StatutDuCompte = "connecte" | "deconnecte" | "inconnu";

export type Rattachement = "local" | "adopte";

/** Liste fermée des états affichés, dans l'ordre où leur condition est examinée (AC31). */
export const ETATS_AFFICHES = [
  "detache",
  "erreur",
  "local",
  "pause",
  "hors-ligne",
  "connexion",
  "en-cours",
  "synchronise",
] as const;

export type EtatAffiche = (typeof ETATS_AFFICHES)[number];

/**
 * Pourquoi un document n'est pas transmis : `trop-volumineux` (AC28), un motif bloquant du serveur
 * (AC29, AC30, AC47), ou une ouverture en erreur que le module rouvrira (AC22, AC30).
 */
export type CauseDErreur =
  | "trop-volumineux"
  | "document-trop-grand"
  | "quota-atteint"
  | "version-refusee"
  | "motif-inconnu"
  | "acces-refuse"
  | "erreur-interne";

export interface DocumentEnErreur {
  /** `undefined` : le document d'espace. */
  readonly idPage: string | undefined;
  readonly cause: CauseDErreur;
  /** Vrai : « Réessayer » est proposé pour ce document (AC29, AC47). */
  readonly reessayable: boolean;
}

export interface EtatDeSynchronisation {
  readonly affiche: EtatAffiche;
  readonly rattachement: Rattachement;
  /** Faux tant que le registre n'a pas été lu : l'adoption n'est pas proposée (AC4). */
  readonly registreLu: boolean;
  readonly droit: Droit;
  readonly compte: StatutDuCompte;
  /** Vrai : la dernière tentative a échoué alors que le compte est connecté (AC19). */
  readonly refusDeConnexion: boolean;
  readonly detache: boolean;
  readonly documentsEnErreur: readonly DocumentEnErreur[];
  /** Pages (et `undefined` pour le document d'espace) en copie divergente (AC27). */
  readonly divergentes: readonly (string | undefined)[];
  /** Le droit a changé pendant la session : l'annonce de F-013-AC26. */
  readonly droitChange: Droit | undefined;
}

export interface Constat {
  readonly rattachement: Rattachement;
  readonly compte: StatutDuCompte;
  readonly connexion: "absente" | "tentative" | "etablie";
  readonly refusDeConnexion: boolean;
  readonly detache: boolean;
  readonly enErreur: boolean;
  /** Ouvertures du document d'espace et de la page affichée acquises. */
  readonly ouverturesAcquises: boolean;
  readonly modificationsEnAttente: boolean;
  readonly passeAchevee: boolean;
}

/** Le premier état de la liste fermée dont la condition est vraie (AC31, AC32). */
export function etatAffiche(constat: Constat): EtatAffiche {
  if (constat.detache) {
    return "detache";
  }
  if (constat.enErreur || (constat.refusDeConnexion && constat.compte === "connecte")) {
    return "erreur";
  }
  if (constat.rattachement === "local") {
    return "local";
  }
  if (constat.compte === "deconnecte") {
    return "pause";
  }
  return etatDeLaConnexion(constat);
}

function etatDeLaConnexion(constat: Constat): EtatAffiche {
  switch (constat.connexion) {
    case "absente":
      return "hors-ligne";
    case "tentative":
      return "connexion";
    case "etablie":
      return constat.ouverturesAcquises && !constat.modificationsEnAttente && constat.passeAchevee
        ? "synchronise"
        : "en-cours";
  }
}
