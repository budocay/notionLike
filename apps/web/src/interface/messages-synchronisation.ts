// Textes de la zone de synchronisation et de ses boîtes de dialogue (F-013). Les motifs du serveur
// ont leurs propres textes, indexés par motif et par canal, à part de la table des messages des
// codes d'enveloppe de F-010-AC16, que cette feature ne touche pas (F-013-AC30). Aucun texte ne dit
// que le serveur a enregistré ou sauvegardé quoi que ce soit : il n'affirme que la transmission
// (F-013-AC32). Pendant une coupure de la persistance, aucun ne dit que les modifications ou les
// pages sont ou restent sur cet appareil (F-013-AC48).
import type {
  CanalDUnMotif,
  CauseDErreur,
  EtatAffiche,
  MotifSynchro,
} from "../synchronisation/index.ts";
import { titreEntreGuillemets } from "./messages.ts";

export const NOM_DE_LA_ZONE_DE_SYNCHRONISATION = "Synchronisation";

/** Le titre de chaque état de la liste fermée de F-013-AC31. */
export const TITRES_DES_ETATS: Readonly<Record<EtatAffiche, string>> = {
  detache: "Cet espace ne se synchronise plus",
  erreur: "Synchronisation en erreur",
  local: "Sur cet appareil uniquement",
  pause: "Synchronisation en pause : connectez-vous",
  "hors-ligne": "Hors ligne : vos modifications restent sur cet appareil",
  connexion: "Connexion au serveur…",
  "en-cours": "Synchronisation en cours…",
  synchronise: "Synchronisé",
};

/** « Hors ligne », persistance coupée (F-013-AC48). */
export const HORS_LIGNE_SANS_STOCKAGE =
  "Hors ligne et stockage de l'appareil indisponible : vos modifications ne sont enregistrées nulle part pour l'instant.";
export const TRANSMISES = "Vos modifications ont été transmises au serveur.";
export const TRANSMISES_SANS_STOCKAGE =
  "Vos modifications ont été transmises au serveur, mais ne sont pas enregistrées sur cet appareil.";

export const REFUS_DE_CONNEXION = "Synchronisation en erreur : le serveur refuse la connexion";
export const SUGGESTION_ONGLETS =
  "Si plusieurs onglets de l'application sont ouverts, fermez ceux qui ne servent pas.";

export const DETACHE_CAUSE =
  "Cet espace ne se synchronise plus : vous n'en êtes plus membre avec ce compte, ou il a été supprimé.";
export const DETACHE_PAGES_RESTENT = "Vos pages restent sur cet appareil ;";
export const DETACHE_PLUS_PARTAGE = "ce que vous y modifiez ne sera plus partagé.";
export const DETACHE_PLUS_PARTAGE_SEUL = "Ce que vous y modifiez ne sera plus partagé.";

export const LECTURE_SEULE = "Lecture seule";
export const DROIT_DEVENU_LECTURE =
  "Vos droits sur cet espace ont changé : vous êtes en lecture seule.";
export const DROIT_DEVENU_ECRITURE =
  "Vos droits sur cet espace ont changé : vous pouvez maintenant le modifier.";
export const COPIE_DIVERGENTE =
  "Des modifications faites sur cet appareil n'ont pas été envoyées et ne le seront pas : vous êtes en lecture seule.";
export const PAGES_CONCERNEES = "Pages concernées :";
export const DOCUMENT_D_ESPACE = "l'arborescence de l'espace";

export const SYNCHRONISER_CET_ESPACE = "Synchroniser cet espace";
export const DEMANDE_UNE_CONNEXION_AU_SERVEUR = "Demande une connexion au serveur";
export const REESSAYER = "Réessayer";
export const EFFACER_LA_COPIE_LOCALE = "Effacer la copie locale";
export const ANNULER = "Annuler";

// Boîte de l'adoption (F-013-AC11 à AC14).
export const TITRE_DE_L_ADOPTION = "Synchroniser cet espace";
export const EFFET_DE_L_ADOPTION =
  "Les pages de cet appareil seront envoyées au serveur et y resteront jusqu'à la suppression de l'espace.";
export const SYNCHRONISER = "Synchroniser";
export const ADOPTION_EN_COURS = "Envoi en cours.";
export const IDENTIFIANT_DEJA_PRIS =
  "Cet espace ne peut pas être synchronisé avec ce compte : son identifiant est déjà utilisé sur le serveur. Vos pages restent sur cet appareil.";

export function espaceDejaExistant(nom: string): string {
  return `Cet espace existait déjà sur le serveur, sous le nom : ${nom}.`;
}

export function espaceSynchronise(nom: string): string {
  return `L'espace se synchronise avec le serveur, sous le nom : ${nom}.`;
}

function copieEffacee(pages: number): string {
  if (pages === 0) {
    return "La copie de cet espace sera effacée de cet appareil.";
  }
  return pages === 1
    ? "La copie de cet espace et de sa page sera effacée de cet appareil."
    : `La copie de cet espace et de ses ${String(pages)} pages sera effacée de cet appareil.`;
}

// Boîte de l'effacement (F-013-AC24) : elle cite le nombre de pages de l'espace.
export function texteDeLEffacement(pages: number): readonly string[] {
  const quoi = copieEffacee(pages);
  return [
    quoi,
    "L'effacement est irréversible sur cet appareil : les modifications qui n'ont pas été transmises au serveur seront perdues.",
  ];
}
export const EFFACEMENT_EN_COURS = "Effacement en cours.";
export const EFFACEMENT_INCOMPLET =
  "La copie locale n'a pas pu être entièrement effacée de cet appareil.";
export const RECHARGER = "Recharger l'application";
export const EFFACEMENT_DANS_UN_AUTRE_ONGLET =
  "La copie locale de cet espace est effacée dans un autre onglet : l'application va se recharger.";

type Texte = (cite: string, stockageDisponible: boolean) => string;

const TEXTES_DES_ERREURS: Readonly<Record<CauseDErreur, Texte>> = {
  "trop-volumineux": (cite, stockage) =>
    `Les modifications faites hors ligne sur ${cite} sont trop volumineuses pour être envoyées.${stockage ? " Elles restent sur cet appareil." : ""}`,
  "document-trop-grand": (cite, stockage) =>
    `${cite} a atteint la taille maximale d'une page${stockage ? " : vos dernières modifications restent sur cet appareil." : "."}`,
  "quota-atteint": (cite) =>
    `Cet espace a atteint son nombre maximal de documents : ${cite} n'est pas envoyé.`,
  "version-refusee": (_, stockage) =>
    `Le serveur n'accepte pas la version de cet espace${stockage ? " : vos modifications restent sur cet appareil" : ""}. Mettez l'application à jour, puis réessayez.`,
  "acces-refuse": (cite) => `Le serveur refuse l'accès à ${cite} : vérification en cours.`,
  "erreur-interne": (cite) => `Le serveur n'a pas pu ouvrir ${cite} : nouvel essai en cours.`,
  "motif-inconnu": (cite) => `Le serveur refuse ${cite} : ce document n'est pas envoyé.`,
};

/** Le texte d'un document en erreur, selon que le stockage de l'appareil tient ou non (AC48). */
export function texteDUneErreur(
  cause: CauseDErreur,
  titre: string,
  stockageDisponible: boolean,
): string {
  return TEXTES_DES_ERREURS[cause](titreEntreGuillemets(titre), stockageDisponible);
}

type Canal = CanalDUnMotif["canal"];

/**
 * Ce que la zone de synchronisation affiche quand un motif l'atteint (F-013-AC30) :
 * - `cause` : le document touché est en erreur, avec le texte de cette cause, que le module de
 *   synchronisation tire du même motif (`causeDuMotif`) ;
 * - `etat` : l'état de la liste fermée que le motif fait afficher ; `erreur` est le refus de
 *   connexion, qu'un navigateur ne lit jamais et qui se dit sans cause (F-013-AC19) ;
 * - `droit` : le changement de droit, dans le sens où il a eu lieu (F-013-AC26).
 */
export type EffetDUnMotif =
  | { readonly cause: CauseDErreur }
  | { readonly etat: "pause" | "connexion" | "erreur" }
  | { readonly droit: true };

type Droit = "lecture" | "ecriture";

/** Le message français d'un couple (motif, canal), tel que la zone l'affiche. */
export function texteDUnMotif(
  effet: EffetDUnMotif,
  titre: string,
  stockageDisponible: boolean,
  droit: Droit,
): string {
  if ("cause" in effet) {
    return texteDUneErreur(effet.cause, titre, stockageDisponible);
  }
  if ("droit" in effet) {
    return droit === "lecture" ? DROIT_DEVENU_LECTURE : DROIT_DEVENU_ECRITURE;
  }
  return effet.etat === "erreur" ? REFUS_DE_CONNEXION : TITRES_DES_ETATS[effet.etat];
}

const REFUS: EffetDUnMotif = { etat: "erreur" };
const PAUSE: EffetDUnMotif = { etat: "pause" };
const RECONNEXION: EffetDUnMotif = { etat: "connexion" };

/**
 * L'effet de chaque couple (motif, canal) publié (F-013-AC30), indexé par motif et par canal, à
 * part de la table des messages des codes d'enveloppe de F-010-AC16.
 */
export const MESSAGES_DES_MOTIFS: Readonly<
  Record<MotifSynchro, Readonly<Partial<Record<Canal, EffetDUnMotif>>>>
> = {
  "non-authentifie": { "refus-de-connexion": PAUSE, "fermeture-de-connexion": PAUSE },
  "origine-refusee": { "refus-de-connexion": REFUS },
  "acces-refuse": {
    "refus-d-ouverture": { cause: "acces-refuse" },
    "fermeture-d-ouverture": { cause: "acces-refuse" },
  },
  "droits-modifies": { "fermeture-d-ouverture": { droit: true } },
  "nom-de-document-invalide": { "refus-d-ouverture": { cause: "motif-inconnu" } },
  "document-trop-grand": { "fermeture-d-ouverture": { cause: "document-trop-grand" } },
  "quota-atteint": {
    "refus-de-connexion": REFUS,
    "refus-d-ouverture": { cause: "quota-atteint" },
    "fermeture-d-ouverture": { cause: "quota-atteint" },
  },
  "trop-de-requetes": { "fermeture-de-connexion": RECONNEXION },
  "message-trop-grand": { "fermeture-sans-raison": { cause: "trop-volumineux" } },
  "erreur-interne": {
    "refus-de-connexion": REFUS,
    "refus-d-ouverture": { cause: "erreur-interne" },
    "fermeture-d-ouverture": { cause: "erreur-interne" },
    "fermeture-de-connexion": RECONNEXION,
  },
  "version-refusee": { "fermeture-d-ouverture": { cause: "version-refusee" } },
};
