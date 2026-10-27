// Filtres d'une définition (F-019-AC1 à AC5, AC23, AC24) : l'état d'un filtre dans la table lue
// (actif, ou inactif avec sa mention), et le test qu'une cellule le satisfait. Sans DOM, sans
// langue ni fuseau de l'appareil (AC11) : textes par clé de comparaison, nombres par valeur, dates
// par l'ordre de leurs chaînes.
import type { ColonneLue, LigneLue, TableLue, ValeurDeCellule } from "@notionlike/document";

import { cleDeComparaison } from "./cle-de-comparaison.ts";
import { estUneDateDuCalendrier } from "./date-du-calendrier.ts";
import {
  demandeUneValeur,
  type Filtre,
  LIMITE_DE_VALEUR,
  type OperateurDeFiltre,
  operateursDe,
  type ValeurDeFiltre,
} from "./definition.ts";

type Cellule = ValeurDeCellule | null;
export type MentionDInactif = "colonne-supprimee" | "option-supprimee";

/** Un filtre actif connaît sa colonne et le rang de celle-ci dans la table lue. */
export type EtatDuFiltre =
  | { readonly actif: true; readonly colonne: ColonneLue; readonly rang: number }
  | { readonly actif: false; readonly mention: MentionDInactif | undefined };

function estUnTexteSaisi(valeur: ValeurDeFiltre | undefined): valeur is string {
  return typeof valeur === "string" && valeur !== "";
}

/** Vrai si la valeur est de la forme que l'opérateur attend pour ce type de colonne (AC24). */
export function valeurConformeAuType(colonne: ColonneLue, valeur: ValeurDeFiltre | undefined) {
  switch (colonne.type) {
    case "texte":
      return estUnTexteSaisi(valeur) && valeur.length <= LIMITE_DE_VALEUR;
    case "nombre":
      return typeof valeur === "number" && Number.isFinite(valeur);
    case "date":
      return typeof valeur === "string" && estUneDateDuCalendrier(valeur);
    case "selection":
      return estUnTexteSaisi(valeur);
    case "case":
      return false;
  }
}

/**
 * L'état du filtre dans la table lue : inactif quand sa colonne a disparu (« Colonne supprimée »),
 * quand son option a été retirée (« Option supprimée »), quand l'opérateur n'est pas de son type, ou
 * quand sa valeur manque ou n'est pas conforme (AC2, AC23, AC24).
 */
export function etatDuFiltre(table: Pick<TableLue, "colonnes">, filtre: Filtre): EtatDuFiltre {
  const rang = table.colonnes.findIndex(({ id }) => id === filtre.colonne);
  const colonne = table.colonnes[rang];
  if (colonne === undefined) {
    return { actif: false, mention: "colonne-supprimee" };
  }
  if (!operateursDe(colonne.type).some((operateur) => operateur === filtre.operateur)) {
    return { actif: false, mention: undefined };
  }
  if (!demandeUneValeur(filtre.operateur)) {
    return { actif: true, colonne, rang };
  }
  if (!valeurConformeAuType(colonne, filtre.valeur)) {
    return { actif: false, mention: undefined };
  }
  if (colonne.type === "selection" && !colonne.options.some(({ id }) => id === filtre.valeur)) {
    return { actif: false, mention: "option-supprimee" };
  }
  return { actif: true, colonne, rang };
}

/** Une cellule sans valeur : vide, ou texte vide pour une colonne `texte` (H3), ou option retirée. */
export function estSansValeur(colonne: ColonneLue, cellule: Cellule): boolean {
  if (cellule === null) {
    return true;
  }
  if (colonne.type === "texte") {
    return cellule === "";
  }
  if (colonne.type === "selection") {
    return !colonne.options.some(({ id }) => id === cellule);
  }
  return false;
}

type Test = (cellule: Cellule) => boolean;

function testsDuTexte(operateur: OperateurDeFiltre, valeur: string): Test {
  const cle = cleDeComparaison(valeur);
  const cleDe = (cellule: Cellule): string => cleDeComparaison(String(cellule));
  switch (operateur) {
    case "contient":
      return (cellule) => cleDe(cellule).includes(cle);
    case "ne-contient-pas":
      return (cellule) => !cleDe(cellule).includes(cle);
    default:
      return (cellule) => cleDe(cellule) === cle;
  }
}

function testDeLOrdre(operateur: OperateurDeFiltre, valeur: string | number): Test {
  const comparer = (cellule: Cellule): number => {
    if (typeof cellule === "number" && typeof valeur === "number") {
      return cellule - valeur;
    }
    return String(cellule) < String(valeur) ? -1 : String(cellule) > String(valeur) ? 1 : 0;
  };
  switch (operateur) {
    case "egal":
    case "est":
      return (cellule) => comparer(cellule) === 0;
    case "inferieur":
    case "avant":
      return (cellule) => comparer(cellule) < 0;
    case "inferieur-egal":
      return (cellule) => comparer(cellule) <= 0;
    case "superieur":
    case "apres":
      return (cellule) => comparer(cellule) > 0;
    default:
      return (cellule) => comparer(cellule) >= 0;
  }
}

/**
 * Le test d'un filtre actif sur la cellule d'une ligne. Les cellules sans valeur satisfont « est
 * vide », « ne contient pas », « n'est pas », « ≠ » et « n'est pas cochée », et aucun autre
 * opérateur (AC3).
 */
function testDeLaCellule(colonne: ColonneLue, filtre: Filtre): Test {
  const { operateur, valeur } = filtre;
  switch (operateur) {
    case "est-vide":
      return (cellule) => estSansValeur(colonne, cellule);
    case "non-vide":
      return (cellule) => !estSansValeur(colonne, cellule);
    case "cochee":
      return (cellule) => cellule === true;
    case "non-cochee":
      return (cellule) => cellule !== true;
    default:
  }
  if (valeur === undefined) {
    return () => true;
  }
  const negation =
    operateur === "ne-contient-pas" || operateur === "different" || operateur === "n-est-pas";
  const test = testSurLaValeur(colonne, operateur, valeur);
  return (cellule) => (estSansValeur(colonne, cellule) ? negation : test(cellule));
}

function testSurLaValeur(
  colonne: ColonneLue,
  operateur: OperateurDeFiltre,
  valeur: ValeurDeFiltre,
): Test {
  if (colonne.type === "texte") {
    return testsDuTexte(operateur, String(valeur));
  }
  if (operateur === "different" || operateur === "n-est-pas") {
    const egal = testDeLOrdre("egal", valeur);
    return (cellule) => !egal(cellule);
  }
  return testDeLOrdre(operateur, valeur);
}

export interface FiltreCompile {
  readonly rang: number;
  readonly test: Test;
}

/** Les filtres actifs de la définition, prêts à tester une ligne ; les inactifs sont sautés (AC2). */
export function compilerLesFiltres(
  table: Pick<TableLue, "colonnes">,
  filtres: readonly Filtre[],
): FiltreCompile[] {
  const compiles: FiltreCompile[] = [];
  for (const filtre of filtres) {
    const etat = etatDuFiltre(table, filtre);
    if (etat.actif) {
      compiles.push({ rang: etat.rang, test: testDeLaCellule(etat.colonne, filtre) });
    }
  }
  return compiles;
}

export function satisfaitLesFiltres(ligne: LigneLue, filtres: readonly FiltreCompile[]): boolean {
  return filtres.every(({ rang, test }) => test(ligne.cellules[rang] ?? null));
}
