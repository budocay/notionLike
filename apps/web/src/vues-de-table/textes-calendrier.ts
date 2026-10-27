// Textes français de la vue calendrier (F-021). Les noms de mois et de jours viennent de deux listes
// fixes, jamais de la langue de l'appareil (AC21) ; aucun code technique n'entre dans un message.
// Toute valeur de la table (libellé d'entrée, nom de colonne) est rendue comme du texte (AC27).
import { decomposer, jourDeLaSemaine, type MoisAffiche } from "./jours.ts";

export const CALENDRIER = "Calendrier";

export const NOMS_DES_MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

export const NOMS_DES_JOURS = [
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
] as const;

/** Abréviation d'un mois pour une case hors du mois affiché. */
const MOIS_ABREGES = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
] as const;

export const SANS_TITRE = "Sans titre";

export const MOIS_PRECEDENT = "Mois précédent";
export const MOIS_SUIVANT = "Mois suivant";
export const AUJOURD_HUI = "Aujourd'hui";
export const PLACER_SELON = "Placer selon";
export const LIMITE_DU_CALENDRIER = "Limite du calendrier.";

export const CALENDRIER_SANS_COLONNE_DE_DATE =
  "Le calendrier place les lignes selon une colonne Date.";
export const AJOUTER_UNE_COLONNE_DATE = "Ajouter une colonne Date";

export const NOUVELLE_LIGNE_DU_JOUR = "Nouvelle ligne";
export const MODIFIER_LE_TITRE = "Modifier le titre";
export const PAS_DE_COLONNE_DE_TITRE = "Aucune colonne de titre.";
export const JOUR_PRECEDENT = "Jour précédent";
export const JOUR_SUIVANT = "Jour suivant";
export const SEMAINE_PRECEDENTE = "Semaine précédente";
export const SEMAINE_SUIVANTE = "Semaine suivante";
export const CHANGER_LA_DATE = "Changer la date";
export const DEFINIR_LA_DATE = "Définir la date";
export const RETIRER_LA_DATE = "Retirer la date";
export const HORS_DES_BORNES = "Hors des bornes du calendrier.";
export const SUPPRIMER_L_ENTREE = "Supprimer la ligne";
export const ACTIONS_DE_L_ENTREE = "Actions";
export const ACTIONS_DE_LA_CASE = "Actions de la case";
export const VALIDER = "Valider";
export const DATE_DE_LA_LIGNE = "Date";

export const PANNEAU_SANS_DATE = "Sans date";
export const AFFICHER_PLUS_DE_LIGNES = "Afficher 100 lignes de plus";
export const PANNEAU_VIDE = "Toutes les lignes ont une date.";

export function titreDuMois({ annee, mois }: MoisAffiche): string {
  return `${NOMS_DES_MOIS[mois - 1] ?? ""} ${String(annee)}`;
}

/** « jeudi 8 octobre 2026 », ou le texte tel quel s'il n'est pas un jour. */
export function jourEnToutesLettres(jour: string): string {
  const decompose = decomposer(jour);
  const rang = jourDeLaSemaine(jour);
  if (decompose === undefined || rang === undefined) {
    return jour;
  }
  const premier = decompose.quantieme === 1 ? "1er" : String(decompose.quantieme);
  return `${NOMS_DES_JOURS[rang] ?? ""} ${premier} ${NOMS_DES_MOIS[decompose.mois - 1] ?? ""} ${String(decompose.annee)}`;
}

/** Le numéro d'une case, suivi de l'abréviation du mois pour un jour hors du mois affiché. */
export function numeroDeCase(jour: string, horsDuMois: boolean): string {
  const decompose = decomposer(jour);
  if (decompose === undefined) {
    return jour;
  }
  const numero = String(decompose.quantieme);
  return horsDuMois ? `${numero} ${MOIS_ABREGES[decompose.mois - 1] ?? ""}` : numero;
}

export function libelleDeLEntree(titre: string | undefined): string {
  return titre === undefined || titre.trim() === "" ? SANS_TITRE : titre;
}

export function nomDeLaCase(jour: string, entrees: number): string {
  const jourLettres = jourEnToutesLettres(jour);
  if (entrees === 0) {
    return `${jourLettres}, aucune entrée`;
  }
  return `${jourLettres}, ${String(entrees)} ${entrees === 1 ? "entrée" : "entrées"}`;
}

export function autresEntrees(nombre: number): string {
  return `${String(nombre)} ${nombre === 1 ? "autre" : "autres"}`;
}

export function nomDesAutres(nombre: number, jour: string): string {
  return `${autresEntrees(nombre)} le ${jourEnToutesLettres(jour)}`;
}

export function nomDeLEntree(libelle: string): string {
  return libelle;
}

export function commandeSurLEntree(commande: string, libelle: string): string {
  return `${commande} : ${libelle}`;
}

export function nomNouvelleLigne(jour: string): string {
  return `${NOUVELLE_LIGNE_DU_JOUR} le ${jourEnToutesLettres(jour)}`;
}

export function nomDuMenuDeLEntree(libelle: string): string {
  return `Actions de l'entrée ${libelle}`;
}

export function nomDuMenuDeLaCase(jour: string): string {
  return `${ACTIONS_DE_LA_CASE} ${jourEnToutesLettres(jour)}`;
}

export function nomDuTitreDeLEntree(libelle: string): string {
  return `Titre de l'entrée ${libelle}`;
}

export function nomDeLaGrilleDuCalendrier(titre: string, mois: MoisAffiche): string {
  return `Calendrier de la table ${titre}, ${titreDuMois(mois)}`;
}

export function titreDuPanneau(nombre: number): string {
  return `${PANNEAU_SANS_DATE} (${String(nombre)})`;
}

export function annonceDeplacee(libelle: string, jour: string): string {
  return `${libelle}, déplacée au ${jourEnToutesLettres(jour)}.`;
}

export function annonceSansDate(libelle: string): string {
  return `${libelle}, sans date.`;
}

export function nomDuChampDeDate(libelle: string): string {
  return `${DATE_DE_LA_LIGNE} de l'entrée ${libelle}`;
}

export function titreDeLaBoiteDeDate(libelle: string): string {
  return `${CHANGER_LA_DATE} : ${libelle}`;
}
