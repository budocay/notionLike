// Textes français de la zone et des écrans de compte (F-010). Aucun texte venu du serveur n'est
// affiché : ni code brut, ni champ `message` (F-010-AC18, H6).
import type { ErreurDeCompte } from "../compte/client-auth.ts";
import { messageDuCode } from "../compte/messages-erreur.ts";
import type { Faute } from "../compte/validation.ts";

export const NOM_DE_LA_ZONE_DE_COMPTE = "Compte";
export const SE_CONNECTER = "Se connecter";
export const CREER_UN_COMPTE = "Créer un compte";
export const SE_DECONNECTER = "Se déconnecter";
export const REESSAYER = "Réessayer";
export const REESSAYER_LA_DECONNEXION = "Réessayer la déconnexion";
export const RETOUR_A_L_APPLICATION = "Retour à l'application";

export const VERIFICATION_DU_COMPTE = "Vérification du compte…";
export const COMPTE_INDISPONIBLE = "Compte indisponible hors connexion";
export const NON_CONNECTE = "Non connecté.";
export const CONNECTE_EN_TANT_QUE = "Connecté :";
export const VOS_PAGES_RESTENT = "Vos pages restent sur cet appareil.";
export const DECONNEXION_EN_COURS = "Déconnexion en cours…";
export const DECONNEXION_CONFIRMEE = "Vous êtes déconnecté.";
export const DECONNEXION_NON_CONFIRMEE = "La déconnexion n'est pas confirmée.";
export const DECONNEXION_DEMANDE_LE_SERVEUR =
  "La déconnexion demande une connexion au serveur, injoignable pour l'instant.";

export const TITRE_CONNEXION = "Se connecter";
export const TITRE_INSCRIPTION = "Créer un compte";
export const ENVOI_CONNEXION = "Se connecter";
export const ENVOI_INSCRIPTION = "Créer le compte";
export const CONNEXION_EN_COURS = "Connexion en cours…";
export const INSCRIPTION_EN_COURS = "Création du compte en cours…";
export const PAS_ENCORE_DE_COMPTE = "Pas encore de compte ?";
export const DEJA_UN_COMPTE = "Déjà un compte ?";
export const ETIQUETTE_NOM = "Nom";
export const ETIQUETTE_COURRIEL = "Courriel";
export const ETIQUETTE_MOT_DE_PASSE = "Mot de passe";
export const MARQUE_OBLIGATOIRE = "(obligatoire)";

export const COMPTE_EXISTANT = "Un compte existe déjà avec ce courriel.";
export const IDENTIFIANTS_INVALIDES = "Courriel ou mot de passe incorrect.";
export const ECHEC_GENERIQUE = "L'opération a échoué. Réessayez.";
export const SERVEUR_INJOIGNABLE =
  "Serveur injoignable. Vos pages restent disponibles sur cet appareil.";
export const IDENTIFIANT_POUR_LE_SUPPORT = "Identifiant à communiquer au support :";

/** Codes de l'enveloppe dont l'identifiant de requête est montré, pour le support (F-010-AC16). */
const CODES_AVEC_IDENTIFIANT = new Set(["erreur-interne", "base-indisponible"]);

export function tropDeTentatives(secondes: number): string {
  return `Trop de tentatives. Réessayez dans ${String(secondes)} secondes.`;
}

/** Texte d'un échec d'envoi, et l'identifiant de requête à montrer quand il y en a un. */
export function texteDeLErreur(erreur: ErreurDeCompte): {
  readonly texte: string;
  readonly idRequete?: string;
} {
  switch (erreur.type) {
    case "compte-existant":
      return { texte: COMPTE_EXISTANT };
    case "identifiants-invalides":
      return { texte: IDENTIFIANTS_INVALIDES };
    case "trop-de-tentatives":
      return { texte: tropDeTentatives(erreur.delaiSecondes) };
    case "enveloppe":
      return CODES_AVEC_IDENTIFIANT.has(erreur.code)
        ? { texte: messageDuCode(erreur.code), idRequete: erreur.idRequete }
        : { texte: messageDuCode(erreur.code) };
    case "hors-ligne":
      return { texte: SERVEUR_INJOIGNABLE };
    case "generique":
      return { texte: ECHEC_GENERIQUE };
  }
}

const NOMS_DES_CHAMPS = { nom: "Le nom", courriel: "Le courriel", motDePasse: "Le mot de passe" };

/** Message sous un champ refusé : il cite la règle, bornes lues dans le schéma (F-010-AC9). */
export function texteDeLaFaute(champ: keyof typeof NOMS_DES_CHAMPS, faute: Faute): string {
  switch (faute.regle) {
    case "obligatoire":
      return `${NOMS_DES_CHAMPS[champ]} est obligatoire et ne peut pas être fait que d'espaces.`;
    case "format":
      return "Saisissez une adresse courriel valide, de la forme nom@exemple.fr.";
    case "trop-long":
      return `${NOMS_DES_CHAMPS[champ]} compte au plus ${String(faute.borne)} caractères.`;
    case "trop-court":
      return `${NOMS_DES_CHAMPS[champ]} compte au moins ${String(faute.borne)} caractères.`;
  }
}
