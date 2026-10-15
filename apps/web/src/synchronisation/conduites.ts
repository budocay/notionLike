// Conduite du module pour chaque couple (motif, canal) que publie `packages/contrats` (F-013-AC30,
// F-012-AC27). La table est fermée : un couple publié sans conduite fait échouer le test de couture,
// et un motif absent de la liste publiée est traité comme `nom-de-document-invalide`.
import { type CanalDUnMotif, MOTIFS_SYNCHRO, type MotifSynchro } from "@notionlike/contrats";

export type Canal = CanalDUnMotif["canal"];

/**
 * - `revoir-le-compte` : revérifier l'état du compte et s'y régler (F-013-AC19, AC21) ;
 * - `reprendre` : se reconnecter selon les délais de F-013-AC20 ;
 * - `ralentir` : attendre 10 secondes au moins, puis la passe au quart du débit (AC21) ;
 * - `prudence` : reconnexion par le module, documents rouverts un à un (AC28) ;
 * - `rouvrir-aussitot` : rouvrir le document une fois, sans délai (AC26) ;
 * - `verifier-l-espace` : interroger l'espace une fois avant de conclure (AC22) ;
 * - `rouvrir-avec-delai` : rouvrir le document selon les délais de AC20 (AC30) ;
 * - `bloquer` : envoi bloqué, sans réouverture sans un geste (AC29, AC30, AC47).
 */
export type Conduite =
  | "revoir-le-compte"
  | "reprendre"
  | "ralentir"
  | "prudence"
  | "rouvrir-aussitot"
  | "verifier-l-espace"
  | "rouvrir-avec-delai"
  | "bloquer";

type Conduites = Readonly<Partial<Record<Canal, Conduite>>>;

const OUVERTURE_BLOQUEE: Conduites = {
  "refus-d-ouverture": "bloquer",
  "fermeture-d-ouverture": "bloquer",
};

export const CONDUITES: Readonly<Record<MotifSynchro, Conduites>> = {
  // Un refus de connexion n'est jamais lisible par un navigateur : l'état du compte décide (AC19).
  "non-authentifie": {
    "refus-de-connexion": "revoir-le-compte",
    "fermeture-de-connexion": "revoir-le-compte",
  },
  "origine-refusee": { "refus-de-connexion": "revoir-le-compte" },
  "acces-refuse": {
    "refus-d-ouverture": "verifier-l-espace",
    "fermeture-d-ouverture": "verifier-l-espace",
  },
  "droits-modifies": { "fermeture-d-ouverture": "rouvrir-aussitot" },
  "nom-de-document-invalide": { "refus-d-ouverture": "bloquer" },
  "document-trop-grand": { "fermeture-d-ouverture": "bloquer" },
  "quota-atteint": { "refus-de-connexion": "revoir-le-compte", ...OUVERTURE_BLOQUEE },
  "trop-de-requetes": { "fermeture-de-connexion": "ralentir" },
  "message-trop-grand": { "fermeture-sans-raison": "prudence" },
  "erreur-interne": {
    "refus-de-connexion": "revoir-le-compte",
    "refus-d-ouverture": "rouvrir-avec-delai",
    "fermeture-d-ouverture": "rouvrir-avec-delai",
    "fermeture-de-connexion": "reprendre",
  },
  "version-refusee": { "fermeture-d-ouverture": "bloquer" },
};

const MOTIF_DE_REPLI: MotifSynchro = "nom-de-document-invalide";
const CODE_MESSAGE_TROP_GRAND = 1009;

/** Le motif publié que porte cette raison ; une raison inconnue se lit comme le motif de repli. */
export function motifDe(raison: string): MotifSynchro {
  return (MOTIFS_SYNCHRO as readonly string[]).includes(raison)
    ? (raison as MotifSynchro)
    : MOTIF_DE_REPLI;
}

/** Conduite d'une ouverture refusée ou fermée par le serveur, d'après sa raison (F-012 H8). */
export function conduiteDOuverture(raison: string, refus: boolean): Conduite {
  const canal: Canal = refus ? "refus-d-ouverture" : "fermeture-d-ouverture";
  return CONDUITES[motifDe(raison)][canal] ?? "bloquer";
}

/** Conduite d'une connexion fermée par le serveur : la raison décide, jamais le code (AC21). */
export function conduiteDeConnexion(code: number, raison: string): Conduite {
  if (raison === "" && code === CODE_MESSAGE_TROP_GRAND) {
    return "prudence";
  }
  if (!(MOTIFS_SYNCHRO as readonly string[]).includes(raison)) {
    return "reprendre";
  }
  return CONDUITES[raison as MotifSynchro]["fermeture-de-connexion"] ?? "reprendre";
}
