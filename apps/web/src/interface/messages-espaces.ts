// Textes français des écrans des espaces, des membres et des invitations (F-014, H12). Aucun texte
// venu du serveur n'est affiché : ni code brut, ni champ `message` de l'enveloppe (F-014-AC30). Les
// textes propres au contexte (F-014-AC8, AC12, AC17, AC20, AC24, AC28) prennent le pas sur la
// table des codes pour le code et l'action qu'ils nomment ; partout ailleurs, la table s'applique.
import type { ErreurDEspaces } from "../compte/index.ts";
import { messageDuCode } from "../compte/messages-erreur.ts";
import { NOM_D_ESPACE_MAX, QUOTAS, type Role } from "../compte/regles-espaces.ts";
import { titreEntreGuillemets } from "./messages.ts";
import {
  IDENTIFIANT_POUR_LE_SUPPORT,
  SERVEUR_INJOIGNABLE,
  tropDeTentatives,
} from "./messages-compte.ts";

export { SERVEUR_INJOIGNABLE };

export const LIBELLES_DES_ROLES: Readonly<Record<Role, string>> = {
  proprietaire: "Propriétaire",
  editeur: "Éditeur",
  lecteur: "Lecteur",
};

// Sélecteur d'espace et écran des espaces (F-014-AC1, AC2).
export const ESPACES = "Espaces";
export const TITRE_DES_ESPACES = "Espaces";
export const ESPACE_DE_CET_APPAREIL = "Espace de cet appareil";
export const ESPACE_COURANT = "Espace courant";
export const CET_APPAREIL = "Cet appareil";
export const ESPACES_DU_SERVEUR = "Espaces du serveur";
export const AUCUN_ESPACE_DU_SERVEUR = "Vous n'êtes membre d'aucun espace du serveur.";
export const CHARGEMENT_DES_ESPACES = "Chargement des espaces…";
export const CONNECTEZ_VOUS = "Connectez-vous pour voir les espaces du serveur.";
export const DEMANDE_UNE_CONNEXION = "Demande une connexion au serveur.";
export const VERIFICATION_EN_COURS = "Vérification du compte en cours.";
export const REQUETE_EN_COURS = "Requête en cours.";
export const SERVEUR_INJOIGNABLE_RAISON =
  "Serveur injoignable : relisez l'espace quand la connexion revient.";
export const RELIRE_L_ESPACE = "Relire l'espace";
export const RELIRE_LES_MEMBRES = "Relire les membres";
export const RELIRE_LES_INVITATIONS = "Relire les invitations";
export const MEMBRES_NON_LUS = "Les membres de cet espace n'ont pas pu être lus.";
export const INVITATIONS_NON_LUES = "Les invitations de cet espace n'ont pas pu être lues.";
export const NOMBRE_DE_MEMBRES_INCONNU = "Le nombre de membres de l'espace n'est pas encore connu.";
export const COLONNE_NOM = "Nom";
export const COLONNE_ROLE = "Votre rôle";
// F-032-AC5 : la commande d'ajout d'un espace du serveur à l'appareil.
export const COLONNE_ACTION = "Action";

// Plusieurs espaces sur un appareil (F-032) : sélecteur, changement d'espace et ses confirmations.
export const NOM_INCONNU_SUR_CET_APPAREIL = "Nom inconnu sur cet appareil";
export const CHANGEMENT_D_ESPACE_EN_COURS = "Changement d'espace…";
export const TITRE_DU_CHANGEMENT = "Changer d'espace ?";
export const RESTER_SUR_CET_ESPACE = "Rester sur cet espace";
export const CHANGER_D_ESPACE = "Changer d'espace";
export const CHANGER_QUAND_MEME = "Changer quand même";
export const OUVRIR_L_ESPACE_DE_CET_APPAREIL = "Ouvrir l'espace de cet appareil";

// Écran des espaces à trois parties (F-032-AC1, AC2, AC26) : au plus une mention par espace de
// l'appareil, toujours dite par un texte (AC29).
export const SUR_CET_APPAREIL = "Sur cet appareil";
export const AUCUN_AUTRE_ESPACE = "Aucun autre espace sur cet appareil.";
export const TOUS_SUR_CET_APPAREIL = "Chacun de vos espaces du serveur est déjà sur cet appareil.";
export const MENTION_LOCAL = "Sur cet appareil uniquement";
export const MENTION_PREMIERE_SYNCHRONISATION = "Première synchronisation inachevée";
export const MENTION_DETACHE = "Ne se synchronise plus avec ce compte";
export const OUVRIR_CET_ESPACE = "Ouvrir cet espace";
export const RETIRER_DE_CET_APPAREIL = "Retirer de cet appareil";
export const RETRAIT_DE_L_ESPACE_OUVERT =
  "Ouvrez un autre espace pour retirer celui-ci de cet appareil.";
export const RETRAIT_EN_COURS = "Retrait en cours.";

// Ajout à l'appareil (F-032-AC5, AC6).
export const PAS_ENCORE_TELECHARGE =
  "Cet espace n'a pas encore été téléchargé sur cet appareil : connectez-vous au serveur pour l'ouvrir.";
export const AJOUT_SANS_STOCKAGE =
  "Cet espace n'a pas pu être ajouté à cet appareil : son stockage ne répond pas.";

/** Nom accessible de « Ouvrir cet espace » : il commence par le libellé visible (F-032-AC29). */
export function nomOuvrirCetEspace(nom: string): string {
  return `${OUVRIR_CET_ESPACE} : ${nom}`;
}

/** Nom accessible de « Retirer de cet appareil » (F-032-AC29). */
export function nomRetirerDeCetAppareil(nom: string): string {
  return `${RETIRER_DE_CET_APPAREIL} : ${nom}`;
}

/** Les éléments d'une rangée d'espace, dans l'ordre : rôle, mention, « Espace courant ». */
export function detailsDeLaRangee(details: readonly string[]): string {
  return details.join(" · ");
}

// Retrait de l'appareil (F-032-AC20) : la boîte cite l'espace, dit que le retrait est
// irréversible sur cet appareil, que les modifications non transmises seront perdues, et que
// l'espace reste sur le serveur pour ses membres.
export function titreDuRetraitDeLAppareil(nom: string): string {
  return `Retirer ${titreEntreGuillemets(nom)} de cet appareil ?`;
}
export function texteDuRetraitDeLAppareil(nom: string): readonly string[] {
  return [
    `${titreEntreGuillemets(nom)} et toutes ses pages seront effacés de cet appareil. Le retrait est irréversible sur cet appareil : les modifications qui n'ont pas été transmises au serveur seront perdues.`,
    "L'espace reste sur le serveur pour ses membres : un membre pourra le rouvrir ici depuis la liste des espaces.",
  ];
}
export function espaceRetireDeLAppareil(nom: string): string {
  return `${titreEntreGuillemets(nom)} a été retiré de cet appareil`;
}
/** Un effacement a échoué ou n'a pas abouti à temps (F-007-AC21) : l'espace est oublié quand même. */
export function retraitIncomplet(nom: string): string {
  return `${titreEntreGuillemets(nom)} a été retiré de cet appareil, mais une partie de son contenu n'a pas pu en être effacée.`;
}

/** Nom accessible du sélecteur d'espace (F-032-AC4). */
export function nomDuSelecteur(nom: string): string {
  return `Espaces — espace courant : ${nom}`;
}

/** Annonce d'arrivée après un changement d'espace (F-032-AC10, AC29). */
export function espaceOuvert(nom: string): string {
  return `Espace ${titreEntreGuillemets(nom)} ouvert`;
}

/** Modifications en attente que le serveur n'a pas acquittées à l'échéance (F-032-AC12). */
export function modificationsNonTransmises(nom: string): string {
  return `Des modifications de ${titreEntreGuillemets(nom)} n'ont pas encore été transmises au serveur. Elles restent sur cet appareil et partiront la prochaine fois que vous ouvrirez cet espace ici.`;
}

/** Modifications ni enregistrées sur l'appareil ni acquittées (F-032-AC13). */
export function modificationsEnregistreesNullePart(nom: string): string {
  return `Des modifications de ${titreEntreGuillemets(nom)} ne sont enregistrées nulle part pour l'instant : elles seront perdues si vous changez d'espace.`;
}

// Création (F-014-AC7, AC8, AC42).
export const NOUVEL_ESPACE = "Nouvel espace";
export const ETIQUETTE_NOM_D_ESPACE = "Nom de l'espace";
export const CREER_L_ESPACE = "Créer l'espace";
export const ANNULER = "Annuler";
export const REGLE_DU_NOM = `Le nom de l'espace est obligatoire, ne peut pas être fait que d'espaces et compte au plus ${String(NOM_D_ESPACE_MAX)} caractères.`;
export const QUOTA_D_ESPACES = `Vous possédez déjà le nombre maximal d'espaces (${String(QUOTAS.espacesPossedesParCompte)}).`;
export const CONTEXTE_NON_SECURISE_POUR_CREER =
  "La création d'un espace demande que l'application soit servie en https ou à une adresse locale de la machine (localhost, 127.0.0.1).";
export const ECHEC_GENERIQUE = "L'opération a échoué. Réessayez.";

// Écran d'un espace (F-014-AC9 à AC16).
export const RETOUR_AUX_ESPACES = "Retour aux espaces";
export const VOTRE_ROLE = "Votre rôle :";
export const CHARGEMENT_DE_L_ESPACE = "Chargement de l'espace…";
export const MEMBRES = "Membres";
export const CHARGEMENT_DES_MEMBRES = "Chargement des membres…";
export const CHARGEMENT_DES_INVITATIONS = "Chargement des invitations…";
export const INVITATIONS = "Invitations en attente";
export const COLONNE_COURRIEL = "Courriel";
export const COLONNE_ROLE_DU_MEMBRE = "Rôle";
export const COLONNE_ACTIONS = "Actions";
export const COLONNE_CREEE_LE = "Créée le";
export const COLONNE_EXPIRE_LE = "Expire le";
export const VOUS = "(vous)";
export const AUCUNE_INVITATION = "Aucune invitation en attente.";
export const LIEN_AFFICHE_A_LA_CREATION =
  "Le lien d'une invitation n'est affiché qu'à sa création.";
export const ESPACE_SUPPRIME = "Espace supprimé";
export const ESPACE_QUITTE = "Vous avez quitté l'espace";
export const DERNIER_PROPRIETAIRE_QUITTE =
  "Vous êtes le dernier propriétaire : nommez un autre propriétaire ou supprimez l'espace.";
export const DERNIER_PROPRIETAIRE_ROLE = "Un espace garde toujours au moins un propriétaire.";
export const PLUS_LE_DROIT = "Vous n'avez plus le droit de faire cela dans cet espace.";
export const PLUS_ACCESSIBLE = "Cet espace n'est plus accessible avec ce compte.";
export const INVITATION_REVOQUEE = "Invitation révoquée : son lien ne fonctionne plus";
export const INVITATION_PLUS_EN_ATTENTE = "Cette invitation n'était plus en attente.";
export const QUOTA_D_INVITATIONS = `Cet espace a déjà le nombre maximal d'invitations en attente (${String(QUOTAS.invitationsEnAttenteParEspace)}) : révoquez-en une.`;
export const RENOMMER = "Renommer";
export const VALIDER_LE_NOM = "Enregistrer le nom";
export const SUPPRIMER_CET_ESPACE = "Supprimer cet espace";
export const SUPPRIMER_DEFINITIVEMENT = "Supprimer définitivement";
export const QUITTER_CET_ESPACE = "Quitter cet espace";
export const QUITTER = "Quitter";
export const RETIRER = "Retirer";
export const REVOQUER = "Révoquer";
export const CREER_UN_LIEN = "Créer un lien d'invitation";
export const ROLE_DE_L_INVITATION = "Rôle donné par le lien";
export const COPIER_LE_LIEN = "Copier le lien";
export const LIEN_COPIE = "Lien copié";
export const COPIEZ_A_LA_MAIN = "Copiez le lien à la main";
export const LIEN_D_INVITATION = "Lien d'invitation";
export const LIEN_NE_SERA_PLUS_AFFICHE = "Ce lien ne sera plus affiché.";
export const FERMER = "Fermer";

// Écran d'invitation (F-014-AC21 à AC25).
export const TITRE_INVITATION = "Invitation";
export const REJOINDRE_L_ESPACE = "Rejoindre l'espace";
export const IGNORER = "Ignorer";
export const VOIR_CET_ESPACE = "Voir cet espace";
export const VOIR_LES_ESPACES = "Voir les espaces";
export const IL_FAUT_UN_COMPTE =
  "Pour accepter cette invitation, il faut un compte. Connectez-vous ou créez-en un : vous reviendrez ici.";
export const ACCEPTATION_DEMANDE_LE_SERVEUR =
  "L'acceptation d'une invitation demande une connexion au serveur, injoignable pour l'instant.";
export const REESSAYER = "Réessayer";
export const INVITATION_INVALIDE =
  "Ce lien d'invitation n'est pas valide, a déjà servi ou a expiré. Demandez-en un nouveau au propriétaire de l'espace.";
export const DEJA_MEMBRE = "Vous êtes déjà membre de cet espace.";
export const ESPACE_COMPLET = "Cet espace a atteint son nombre maximal de membres.";
export const ROUVREZ_LE_LIEN =
  "Aucune invitation n'est ouverte dans cet onglet. Rouvrez le lien d'invitation que vous avez reçu.";
export const ACCEPTATION_EN_COURS = "Acceptation en cours…";

export function invitationRecue(nomDuCompte: string): string {
  return `Vous avez reçu une invitation à rejoindre un espace. En l'acceptant, vous devenez membre de cet espace avec le compte ${nomDuCompte} ; son nom et votre rôle vous seront indiqués après l'acceptation. Vous pourrez le quitter à tout moment.`;
}

export function libelleDuRole(role: Role): string {
  return LIBELLES_DES_ROLES[role];
}

/** Libellé suivi du rôle, pour l'annonce d'un changement (F-014-AC14). */
export function roleChange(nom: string, role: Role): string {
  return `Rôle de ${nom} : ${libelleDuRole(role)}`;
}

export function membreRetire(nom: string): string {
  return `${nom} a été retiré de l'espace`;
}

export function avertissementDuLien(role: Role): string {
  return `Quiconque obtient ce lien entre dans l'espace en tant que ${libelleDuRole(role)}, jusqu'à son expiration ou sa révocation. Transmettez-le par un canal sûr.`;
}

export function expireLe(date: string): string {
  return `Expire le ${date}.`;
}

// Noms accessibles qui citent l'espace, le membre ou l'invitation visés (F-014-AC36).
export function nomOuvrirEspace(nom: string): string {
  return `Ouvrir l'espace ${nom}`;
}
export function nomRoleDuMembre(nom: string): string {
  return `Rôle de ${nom}`;
}
export function nomRetirer(nom: string): string {
  return `Retirer ${nom} de l'espace`;
}
export function nomRevoquer(role: Role, creeLe: string): string {
  return `Révoquer l'invitation ${libelleDuRole(role)} créée le ${creeLe}`;
}
export function nomRenommer(nom: string): string {
  return `Renommer l'espace ${nom}`;
}
// Le nom accessible commence par le libellé visible (WCAG 2.5.3, « label in name »).
export function nomSupprimer(nom: string): string {
  return `Supprimer cet espace : ${nom}`;
}
export function nomQuitter(nom: string): string {
  return `Quitter cet espace : ${nom}`;
}
export function nomCreerUnLien(nom: string): string {
  return `Créer un lien d'invitation pour l'espace ${nom}`;
}

// Boîtes de confirmation (F-014-AC10, AC12, AC15).
export function titreSuppression(nom: string): string {
  return `Supprimer l'espace ${nom} ?`;
}
export function texteSuppression(nombreDeMembres: number): readonly string[] {
  const membres = nombreDeMembres === 1 ? "1 membre" : `${String(nombreDeMembres)} membres`;
  return [
    `Cet espace compte ${membres}. La suppression est irréversible : elle retire l'espace et toutes ses pages du serveur, pour tous ses membres.`,
    "Les invitations en attente cessent de fonctionner.",
    "Les copies déjà présentes sur les appareils des membres y restent.",
  ];
}
export function etiquetteConfirmation(nom: string): string {
  return `Saisissez le nom exact de l'espace pour confirmer : ${nom}`;
}
export function titreDepart(nom: string): string {
  return `Quitter l'espace ${nom} ?`;
}
export const TEXTE_DEPART =
  "Vous n'y aurez plus accès, et il vous faudra une nouvelle invitation pour y revenir.";
export function titreRetrait(nom: string): string {
  return `Retirer ${nom} de l'espace ?`;
}
export const AVERTISSEMENT_RETRAIT =
  "Un retrait ne reprend pas ce qui a déjà été lu : les pages que cette personne a ouvertes restent sur ses appareils. Elle ne recevra plus rien et ne pourra plus rien envoyer.";

const CODES_AVEC_IDENTIFIANT = new Set(["erreur-interne", "base-indisponible"]);

/** Texte d'un échec, d'après la table des codes, et l'identifiant à montrer au support. */
export function texteDEchec(erreur: ErreurDEspaces): readonly string[] {
  switch (erreur.type) {
    case "enveloppe":
      return CODES_AVEC_IDENTIFIANT.has(erreur.code)
        ? [messageDuCode(erreur.code), `${IDENTIFIANT_POUR_LE_SUPPORT} ${erreur.idRequete}`]
        : [messageDuCode(erreur.code)];
    case "trop-de-requetes":
      return [tropDeTentatives(erreur.delaiSecondes)];
    case "hors-ligne":
      return [SERVEUR_INJOIGNABLE];
    case "generique":
      return [ECHEC_GENERIQUE];
  }
}

/** Date et heure en français, dans le fuseau de l'appareil (F-014-AC16, H12). */
export function dateFrancaise(instant: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(
    new Date(instant),
  );
}
