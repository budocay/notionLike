// Textes français de la vue kanban (F-020). Aucun code technique n'y entre ; les refus typés du
// document passent par le traducteur de l'interface (`messageErreur`, F-018-AC37). Toute valeur
// (titre de carte, libellé d'option, nom de colonne) y est insérée comme du texte (F-020-AC22).
import { libelleAffiche, nomAffiche } from "../textes.ts";

export const KANBAN = "Kanban";
export const SANS_VALEUR = "Sans valeur";
export const SANS_TITRE = "Sans titre";
export const REGROUPER_PAR = "Regrouper par";
export const PILES_DU_KANBAN = "Piles du kanban";
export const INVITATION_SANS_SELECTION = "Le kanban regroupe les lignes par une colonne Sélection.";
export const AJOUTER_UNE_COLONNE_SELECTION = "Ajouter une colonne Sélection";
export const NOUVELLE_CARTE = "Nouvelle carte";
export const PILE_PRECEDENTE = "Pile précédente";
export const PILE_SUIVANTE = "Pile suivante";
export const MODIFIER_LE_TITRE = "Modifier le titre";
export const PAS_DE_COLONNE_DE_TITRE = "Aucune colonne de titre.";
export const PREMIERE_PILE = "Déjà dans la première pile.";
export const DERNIERE_PILE = "Déjà dans la dernière pile.";
export const PREMIERE_CARTE = "Déjà la première carte de la pile.";
export const DERNIERE_CARTE = "Déjà la dernière carte de la pile.";
export const PAS_DE_LIGNES = "Aucune carte à afficher.";
/** Nombre de cartes présentées par pile, puis ajoutées par la commande qui en montre davantage (AC8). */
export const CARTES_PAR_PAGE = 100;
export const AFFICHER_PLUS = `Afficher ${String(CARTES_PAR_PAGE)} cartes de plus`;

export function libelleDePile(libelle: string | null): string {
  return libelle === null ? SANS_VALEUR : libelleAffiche(libelle);
}

export function titreDeCarte(titre: string): string {
  return titre.trim() === "" ? SANS_TITRE : titre;
}

function cartes(nombre: number): string {
  return `${String(nombre)} ${nombre > 1 ? "cartes" : "carte"}`;
}

export function nomDeLaPile(libelle: string | null, nombre: number): string {
  return `${libelleDePile(libelle)}, ${cartes(nombre)}`;
}

export function nomDeLaVue(titre: string, colonne: string): string {
  return `Kanban de la table ${titre}, regroupé par ${nomAffiche(colonne)}`;
}

export function nouvelleCarteDans(libelle: string | null): string {
  return `${NOUVELLE_CARTE} dans la pile ${libelleDePile(libelle)}`;
}

export function nomDeLaCommande(commande: string, titre: string): string {
  return `${commande} pour la carte ${titreDeCarte(titre)}`;
}

export function nomDesActions(titre: string): string {
  return `Actions de la carte ${titreDeCarte(titre)}`;
}

export function nomDuChampDeTitre(titre: string): string {
  return `Titre de la carte ${titreDeCarte(titre)}`;
}

export function titreDeLaSuppression(titre: string): string {
  return `Supprimer la ligne de la carte ${titreDeCarte(titre)} ?`;
}

export function carteDeplacee(titre: string, libelle: string | null, rang: number, total: number) {
  return `${titreDeCarte(titre)}, pile ${libelleDePile(libelle)}, ${String(rang)} sur ${String(total)}.`;
}

export const COMMANDE_MONTER = "Monter";
export const COMMANDE_DESCENDRE = "Descendre";

/** Texte lu à la saisie d'une carte au pointeur : ce qu'elle permet, au clavier comme à la souris. */
export function instructionsDuKanban(touches: {
  readonly piles: string;
  readonly places: string;
  readonly menu: string;
}): string {
  return `Pour déplacer une carte au clavier, ${touches.piles} la change de pile, ${touches.places} la monte ou la descend ; ${touches.menu} ouvre le menu de ses actions. À la souris, faites glisser la carte, Échap abandonne le geste.`;
}

export function carteSaisie(titre: string, libelle: string | null, rang: number, total: number) {
  return `${carteDeplacee(titre, libelle, rang, total)} Carte saisie.`;
}

export function carteAuDessus(
  titre: string,
  libelle: string | null,
  voisine: string,
  avant: boolean,
) {
  return `${titreDeCarte(titre)} : ${avant ? "avant" : "après"} la carte ${titreDeCarte(voisine)}, pile ${libelleDePile(libelle)}.`;
}

export function carteDansLaPile(titre: string, libelle: string | null) {
  return `${titreDeCarte(titre)} : dans la pile ${libelleDePile(libelle)}.`;
}

export function carteDeposee(titre: string, libelle: string | null) {
  return `${titreDeCarte(titre)} déposée dans la pile ${libelleDePile(libelle)}.`;
}

export function carteRelachee(titre: string) {
  return `${titreDeCarte(titre)} relâchée hors d'une pile : déplacement abandonné.`;
}

export function deplacementAbandonne(titre: string) {
  return `Déplacement de la carte ${titreDeCarte(titre)} abandonné.`;
}
