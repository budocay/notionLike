// Textes français de l'écran de table et de ses vues (F-018). Aucun code technique n'y entre ; les
// refus typés du document passent par le traducteur de l'interface (`messageErreur`, AC37). Toute
// valeur saisie y est rendue comme du texte par React (AC38).

/** Limites de `@notionlike/document`, qui ne les exporte pas : tenues par un test de couture. */
export const LONGUEUR_MAX_NOM_DE_COLONNE = 200;
export const LONGUEUR_MAX_LIBELLE = 100;
export const LONGUEUR_MAX_TEXTE = 2000;

// ── États de l'écran (AC13, AC15, AC17) ──────────────────────────────────────────────────────────
export const CHARGEMENT_DE_LA_TABLE = "Chargement de la table…";
export const TABLE_DE_VERSION_NON_PRISE_EN_CHARGE =
  "Cette table demande une version plus récente de l'application.";
export const TABLE_ILLISIBLE = "Cette table est illisible.";
export const INVITATION_SANS_COLONNE =
  "Cette table n'a encore aucune colonne. Ajoutez-en une pour commencer à la remplir.";
export const AJOUTER_UNE_COLONNE = "Ajouter une colonne";
export const NOUVELLE_LIGNE = "Nouvelle ligne";

// ── Vues (AC44) ──────────────────────────────────────────────────────────────────────────────────
export const TABLEAU = "Tableau";
export const SELECTEUR_DE_VUES = "Vue de la table";

// ── Grille (AC34) ────────────────────────────────────────────────────────────────────────────────
export function nomDeLaGrille(titre: string): string {
  return `Lignes de la table ${titre}`;
}
export const SANS_NOM = "Sans nom";
export const SANS_LIBELLE = "Sans libellé";
export const AUCUNE = "Aucune";
export const ACTIONS_DES_LIGNES = "Actions des lignes";

export function nomAffiche(nom: string): string {
  return nom.trim() === "" ? SANS_NOM : nom;
}
export function libelleAffiche(libelle: string): string {
  return libelle.trim() === "" ? SANS_LIBELLE : libelle;
}

export function placeDeLaLigne(rang: number, total: number): string {
  return `ligne ${String(rang)} sur ${String(total)}`;
}
export function nomActionsDeLaColonne(nom: string): string {
  return `Actions de la colonne ${nomAffiche(nom)}`;
}
export function nomActionsDeLaLigne(rang: number): string {
  return `Actions de la ligne ${String(rang)}`;
}
export function nomDeLaCelluleCase(nom: string, rang: number): string {
  return `${nomAffiche(nom)}, ligne ${String(rang)}`;
}
export function nomDuChamp(nom: string, rang: number): string {
  return `${nomAffiche(nom)}, ligne ${String(rang)}`;
}
export function nomDuChampDeNom(nom: string): string {
  return `Nom de la colonne ${nomAffiche(nom)}`;
}

// ── Colonnes (AC18 à AC22) ───────────────────────────────────────────────────────────────────────
export const TYPES_DE_COLONNE_AFFICHES = {
  texte: "Texte",
  nombre: "Nombre",
  case: "Case à cocher",
  date: "Date",
  selection: "Sélection",
} as const;
export const NOUVELLE_COLONNE = "Nouvelle colonne";
export const NOM_DE_LA_COLONNE = "Nom de la colonne";
export const TYPE_DE_LA_COLONNE = "Type de la colonne";
export const CREER_LA_COLONNE = "Créer la colonne";
export const ANNULER = "Annuler";
export const RENOMMER_LA_COLONNE = "Renommer la colonne";
export const DEPLACER_A_GAUCHE = "Déplacer à gauche";
export const DEPLACER_A_DROITE = "Déplacer à droite";
export const DEJA_LA_PREMIERE_COLONNE = "Déjà la première colonne.";
export const DEJA_LA_DERNIERE_COLONNE = "Déjà la dernière colonne.";
export const GERER_LES_OPTIONS = "Gérer les options";
export const REGLER_LA_LARGEUR = "Régler la largeur";
export const SUPPRIMER_LA_COLONNE = "Supprimer la colonne";
export const NOM_TROP_LONG = `Le nom d'une colonne compte au plus ${String(LONGUEUR_MAX_NOM_DE_COLONNE)} caractères.`;

export function deplacerLaColonne(nom: string, sens: "gauche" | "droite"): string {
  return `Déplacer la colonne ${nomAffiche(nom)} à ${sens}`;
}
export function colonneDeplacee(nom: string, rang: number, total: number): string {
  return `Colonne ${nomAffiche(nom)} déplacée en position ${String(rang)} sur ${String(total)}.`;
}
export function titreDeLaSuppressionDeColonne(nom: string): string {
  return `Supprimer la colonne ${nomAffiche(nom)} ?`;
}
export const TEXTE_DE_LA_SUPPRESSION_DE_COLONNE: readonly string[] = [
  "Ses valeurs ne seront plus accessibles dans aucune ligne.",
  "Cette action ne peut pas être annulée.",
];
export function largeurDeLaColonne(nom: string): string {
  return `Largeur de la colonne ${nomAffiche(nom)}`;
}

// ── Options (AC22, AC31) ─────────────────────────────────────────────────────────────────────────
export function titreDesOptions(nom: string): string {
  return `Options de la colonne ${nomAffiche(nom)}`;
}
export const AUCUNE_OPTION = "Cette colonne n'a encore aucune option.";
export const NOUVELLE_OPTION = "Nouvelle option";
export const AJOUTER_L_OPTION = "Ajouter l'option";
export const FERMER = "Fermer";
export const LIBELLE_TROP_LONG = `Le libellé d'une option compte au plus ${String(LONGUEUR_MAX_LIBELLE)} caractères.`;
export function nomDuLibelle(libelle: string): string {
  return `Libellé de l'option ${libelleAffiche(libelle)}`;
}
export function monterLOption(libelle: string): string {
  return `Monter l'option ${libelleAffiche(libelle)}`;
}
export function descendreLOption(libelle: string): string {
  return `Descendre l'option ${libelleAffiche(libelle)}`;
}
export function retirerLOption(libelle: string): string {
  return `Retirer l'option ${libelleAffiche(libelle)}`;
}
export const MONTER = "Monter";
export const DESCENDRE = "Descendre";
export const RETIRER = "Retirer";
export function titreDuRetraitDOption(libelle: string): string {
  return `Retirer l'option ${libelleAffiche(libelle)} ?`;
}
export const TEXTE_DU_RETRAIT_D_OPTION: readonly string[] = [
  "Les cellules qui portent cette option deviendront vides.",
  "Cette action ne peut pas être annulée.",
];
export const RETIRER_L_OPTION = "Retirer l'option";
export function listeDesOptions(nom: string): string {
  return `Choix pour la colonne ${nomAffiche(nom)}`;
}

// ── Lignes (AC23 à AC25) ─────────────────────────────────────────────────────────────────────────
export const MONTER_LA_LIGNE = "Monter la ligne";
export const DESCENDRE_LA_LIGNE = "Descendre la ligne";
export const SUPPRIMER_LA_LIGNE = "Supprimer la ligne";
export const DEJA_LA_PREMIERE_LIGNE = "Déjà la première ligne.";
export const DEJA_LA_DERNIERE_LIGNE = "Déjà la dernière ligne.";
export function ligneDeplacee(rang: number, total: number): string {
  return `Ligne déplacée en position ${String(rang)} sur ${String(total)}.`;
}
export function commandeDeLigne(commande: string, rang: number): string {
  return `${commande} ${String(rang)}`;
}
export function titreDeLaSuppressionDeLigne(rang: number): string {
  return `Supprimer la ligne ${String(rang)} ?`;
}
export const TEXTE_DE_LA_SUPPRESSION_DE_LIGNE: readonly string[] = [
  "Toutes ses valeurs seront supprimées.",
  "Cette action ne peut pas être annulée.",
];

// ── Cellules (AC27 à AC31, AC36) ─────────────────────────────────────────────────────────────────
export const TEXTE_TROP_LONG = `Le texte d'une cellule compte au plus ${String(LONGUEUR_MAX_TEXTE)} caractères.`;
export const NOMBRE_INVALIDE = "Saisissez un nombre, par exemple 12 ou 3,5.";
export const DATE_INVALIDE = "Saisissez une date valide.";
export const CELLULE_SUPPRIMEE = "La cellule que vous modifiiez a été supprimée.";
