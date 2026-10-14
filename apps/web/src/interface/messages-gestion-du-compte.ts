// Textes français de l'écran du compte, `#/compte` (F-027). Aucun texte venu du serveur n'est
// affiché tel quel, hors des valeurs du compte et des sessions, rendues comme du texte
// (F-027-AC25) : ni code brut, ni champ `message` de l'enveloppe. Les échecs passent par la table
// des codes (F-010-AC16), où F-027 inscrit ses deux messages.
import type { Faute } from "../compte/validation.ts";
import { dateFrancaise } from "./messages-espaces.ts";

export { texteDEchec } from "./messages-espaces.ts";

export const TITRE_DU_COMPTE = "Mon compte";

// États du compte (F-027-AC21).
export const CONNECTEZ_VOUS_POUR_GERER = "Connectez-vous pour gérer votre compte.";

// Nom (F-027-AC1, AC24).
export const PARTIE_NOM = "Nom";
export const ETIQUETTE_NOM_DU_COMPTE = "Nom affiché";
export const ENREGISTRER_LE_NOM = "Enregistrer le nom";
export const NOM_MODIFIE = "Nom modifié.";

// Mot de passe (F-027-AC4, AC23, AC24).
export const PARTIE_MOT_DE_PASSE = "Mot de passe";
export const ETIQUETTE_MOT_DE_PASSE_ACTUEL = "Mot de passe actuel";
export const ETIQUETTE_NOUVEAU_MOT_DE_PASSE = "Nouveau mot de passe";
export const CHANGER_LE_MOT_DE_PASSE = "Changer le mot de passe";
export const EFFET_DU_CHANGEMENT =
  "Changer le mot de passe ferme toutes vos autres sessions ; celle de cet appareil reste ouverte.";
export const MOT_DE_PASSE_MODIFIE = "Mot de passe modifié. Vos autres sessions ont été fermées.";

// Sessions (F-027-AC22, AC24, AC25).
export const PARTIE_SESSIONS = "Sessions";
export const SESSIONS_OUVERTES = "Sessions ouvertes";
export const DONNEES_DES_SESSIONS =
  "L'adresse IP et le navigateur de chaque session sont enregistrés par le serveur jusqu'à la fermeture ou l'expiration de la session.";
export const EFFET_D_UNE_FERMETURE =
  "Fermer une session coupe l'accès de cet appareil au serveur ; les pages qu'il a déjà enregistrées y restent.";
export const CHARGEMENT_DES_SESSIONS = "Chargement des sessions…";
export const AUCUNE_SESSION = "Aucune session ouverte.";
export const COLONNE_OUVERTE_LE = "Ouverte le";
export const COLONNE_DERNIERE_ACTIVITE = "Dernière activité";
export const COLONNE_ADRESSE_IP = "Adresse IP";
export const COLONNE_NAVIGATEUR = "Navigateur";
export const COLONNE_SESSION = "Session";
export const CET_APPAREIL = "Cet appareil";
export const NON_ENREGISTRE = "Non enregistré";
export const FERMER_CETTE_SESSION = "Fermer cette session";
export const FERMER_LA_SESSION = "Fermer la session";
export const FERMER_LES_AUTRES = "Fermer toutes les autres sessions";
export const AUCUNE_AUTRE_SESSION = "Aucune autre session n'est ouverte.";
export const SESSION_FERMEE = "Session fermée.";
export const SESSION_DEJA_FERMEE = "Cette session était déjà fermée. La liste a été relue.";
export const RELIRE_LES_SESSIONS = "Relire les sessions";
export const SESSIONS_NON_LUES = "Les sessions n'ont pas pu être lues.";

export const ANNULER = "Annuler";
export const REQUETE_EN_COURS = "Requête en cours.";
export const ENVOI_BLOQUE = "Envoi suspendu après trop de tentatives.";

/** Nom accessible d'une fermeture : le libellé visible, puis la date de la session visée. */
export function nomFermerLaSession(creeLe: string): string {
  return `${FERMER_CETTE_SESSION} ouverte le ${dateFrancaise(creeLe)}`;
}

export function titreFermerLaSession(creeLe: string): string {
  return `Fermer la session ouverte le ${dateFrancaise(creeLe)}`;
}

export function sessionsFermees(nombre: number): string {
  return nombre <= 1 ? `${String(nombre)} session fermée.` : `${String(nombre)} sessions fermées.`;
}

export { dateFrancaise };

const NOMS_DES_CHAMPS = {
  nom: "Le nom",
  motDePasseActuel: "Le mot de passe actuel",
  nouveauMotDePasse: "Le nouveau mot de passe",
} as const;

/** Message sous un champ refusé : il cite la règle, bornes lues dans le schéma (F-027-AC23). */
export function texteDeLaFauteDeGestion(champ: keyof typeof NOMS_DES_CHAMPS, faute: Faute): string {
  const nom = NOMS_DES_CHAMPS[champ];
  switch (faute.regle) {
    case "obligatoire":
    case "format":
      return champ === "nom"
        ? `${nom} est obligatoire et ne peut pas être fait que d'espaces.`
        : `${nom} est obligatoire.`;
    case "trop-long":
      return `${nom} compte au plus ${String(faute.borne)} caractères.`;
    case "trop-court":
      return `${nom} compte au moins ${String(faute.borne)} caractères.`;
  }
}
