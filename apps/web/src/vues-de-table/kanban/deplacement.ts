// Déplacement d'une carte (F-020-AC9, AC11, AC20) : la seule fonction de la vue qui écrit un
// déplacement, au pointeur comme au clavier. Elle appelle la façade du document de table : d'abord la
// cellule de regroupement si la pile change, puis le déplacement de la ligne si sa place parmi les
// lignes de la table doit changer (H2). Aucun rang, aucun ordre, aucun champ propre au kanban n'est
// écrit (H1) ; la première écriture refusée arrête la suivante.
import type {
  ColonneLue,
  DocumentTable,
  IdLigne,
  IdOption,
  LigneLue,
  TableLue,
} from "@notionlike/document";

import { messageErreur } from "../../interface/messages.ts";
import { ecrire, type Issue, type Surveillance } from "../ecritures.ts";
import {
  type Destination,
  estLaPlaceActuelle,
  placeDeLaCarte,
  positionDansLaTable,
} from "./destination.ts";
import { optionDeLaLigne, type Pile, regrouper } from "./piles.ts";

/** Ce que le déplacement lit : la table, sa lecture et les lignes affichées au moment du geste. */
export interface ContexteDeDeplacement {
  readonly table: DocumentTable;
  readonly lue: TableLue;
  readonly lignes: readonly LigneLue[];
  readonly regroupement: ColonneLue;
  /** L'affichage figé est prévenu des écritures du déplacement (F-019-AC17). */
  readonly surveillance: Surveillance;
}

export type ResultatDeDeplacement =
  | { readonly sorte: "deplacee" | "sans-effet" }
  | { readonly sorte: "refusee"; readonly message: string };

const SANS_EFFET: ResultatDeDeplacement = { sorte: "sans-effet" };

function refusee(message: string): ResultatDeDeplacement {
  return { sorte: "refusee", message };
}

function refusDe(issue: Issue<unknown>): ResultatDeDeplacement | undefined {
  return issue.reussie ? undefined : refusee(issue.message);
}

interface Plan {
  readonly sorte: "plan";
  readonly changeDePile: boolean;
  /** Position finale de la ligne parmi les lignes de la table ; `undefined` : elle reste où elle est. */
  readonly position: number | undefined;
}

/** L'issue d'une planification : un plan à écrire, ou déjà le résultat (refus, absence d'effet). */
type ResultatOuPlan = Plan | ResultatDeDeplacement;

// La ligne à déplacer, ou le refus (ligne ou carte précédente disparue) ou l'absence d'effet.
function ligneOuIssue(
  contexte: ContexteDeDeplacement,
  piles: readonly Pile[],
  carte: IdLigne,
  destination: Destination,
): LigneLue | ResultatDeDeplacement {
  const { lue, lignes, regroupement } = contexte;
  const ligne = lignes.find(({ id }) => id === carte);
  const rang = lue.colonnes.findIndex(({ id }) => id === regroupement.id);
  if (ligne === undefined || placeDeLaCarte(piles, carte) === undefined || rang < 0) {
    return refusee(messageErreur("ligne-introuvable"));
  }
  const { precedente } = destination;
  if (precedente !== null && !cartesDeLaPile(piles, destination).includes(precedente)) {
    return refusee(messageErreur("position-invalide"));
  }
  return estLaPlaceActuelle(piles, carte, destination) ? SANS_EFFET : ligne;
}

function cartesDeLaPile(piles: readonly Pile[], destination: Destination): readonly IdLigne[] {
  const pile = piles.find(({ option }) => option === destination.option);
  return (pile?.cartes ?? []).map(({ id }) => id);
}

// Ce qu'il faut écrire pour atteindre la destination, ou le refus ou l'absence d'effet.
function planDe(
  contexte: ContexteDeDeplacement,
  carte: IdLigne,
  destination: Destination,
): ResultatOuPlan {
  const { lue, lignes, regroupement } = contexte;
  const piles = regrouper(lue, lignes, regroupement);
  const ligne = ligneOuIssue(contexte, piles, carte, destination);
  if ("sorte" in ligne) {
    return ligne;
  }
  const rang = lue.colonnes.findIndex(({ id }) => id === regroupement.id);
  const ordre = lue.lignes.map(({ id }) => id);
  return {
    sorte: "plan",
    changeDePile: optionDeLaLigne(ligne, rang, regroupement) !== destination.option,
    position: positionDansLaTable(
      ordre,
      carte,
      cartesDeLaPile(piles, destination),
      destination.precedente,
    ),
  };
}

// Les écritures du plan, la cellule d'abord ; la première refusée arrête la suivante (AC20).
function ecrireLePlan(
  contexte: ContexteDeDeplacement,
  carte: IdLigne,
  option: IdOption | null,
  plan: Plan,
): ResultatDeDeplacement | undefined {
  const { table, regroupement, surveillance } = contexte;
  const { changeDePile, position } = plan;
  const cellule = changeDePile
    ? refusDe(ecrire(() => table.ecrireCellule(carte, regroupement.id, option), surveillance))
    : undefined;
  if (cellule !== undefined || position === undefined) {
    return cellule;
  }
  return refusDe(ecrire(() => table.deplacerLigne(carte, position), surveillance));
}

export function deplacerUneCarte(
  contexte: ContexteDeDeplacement,
  carte: IdLigne,
  destination: Destination,
): ResultatDeDeplacement {
  const plan = planDe(contexte, carte, destination);
  if (plan.sorte !== "plan") {
    return plan;
  }
  const refus = ecrireLePlan(contexte, carte, destination.option, plan);
  if (refus !== undefined) {
    return refus;
  }
  return plan.changeDePile || plan.position !== undefined ? { sorte: "deplacee" } : SANS_EFFET;
}
