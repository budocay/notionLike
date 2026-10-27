// Déplacement d'une carte (F-020-AC9, AC11, AC20) : la seule fonction de la vue qui écrit un
// déplacement, au pointeur comme au clavier. Elle appelle la façade du document de table : d'abord la
// cellule de regroupement si la pile change, puis le déplacement de la ligne si sa place parmi les
// lignes de la table doit changer (H2). Aucun rang, aucun ordre, aucun champ propre au kanban n'est
// écrit (H1) ; la première écriture refusée arrête la suivante.
import type { ColonneLue, DocumentTable, IdLigne, LigneLue, TableLue } from "@notionlike/document";

import { messageErreur } from "../../interface/messages.ts";
import { ecrire } from "../ecritures.ts";
import {
  type Destination,
  estLaPlaceActuelle,
  placeDeLaCarte,
  positionDansLaTable,
} from "./destination.ts";
import { optionDeLaLigne, regrouper } from "./piles.ts";

/** Ce que le déplacement lit : la table, sa lecture et les lignes affichées au moment du geste. */
export interface ContexteDeDeplacement {
  readonly table: DocumentTable;
  readonly lue: TableLue;
  readonly lignes: readonly LigneLue[];
  readonly regroupement: ColonneLue;
}

export type ResultatDeDeplacement =
  | { readonly sorte: "deplacee" | "sans-effet" }
  | { readonly sorte: "refusee"; readonly message: string };

const SANS_EFFET: ResultatDeDeplacement = { sorte: "sans-effet" };

function refusee(message: string): ResultatDeDeplacement {
  return { sorte: "refusee", message };
}

function ecrireOuRefuser(operation: () => void): ResultatDeDeplacement | undefined {
  const issue = ecrire(operation);
  return issue.reussie ? undefined : refusee(issue.message);
}

interface Plan {
  readonly changeDePile: boolean;
  /** Position finale de la ligne parmi les lignes de la table ; `undefined` : elle reste où elle est. */
  readonly position: number | undefined;
}

// Ce qu'il faut écrire pour atteindre la destination, ou le refus ou l'absence d'effet.
function planDe(
  contexte: ContexteDeDeplacement,
  carte: IdLigne,
  destination: Destination,
): Plan | ResultatDeDeplacement {
  const { lue, lignes, regroupement } = contexte;
  const piles = regrouper(lue, lignes, regroupement);
  const rang = lue.colonnes.findIndex(({ id }) => id === regroupement.id);
  const ligne = lignes.find(({ id }) => id === carte);
  const cartes = (piles.find(({ option }) => option === destination.option)?.cartes ?? []).map(
    ({ id }) => id,
  );
  if (ligne === undefined || placeDeLaCarte(piles, carte) === undefined || rang < 0) {
    return refusee(messageErreur("ligne-introuvable"));
  }
  if (destination.precedente !== null && !cartes.includes(destination.precedente)) {
    return refusee(messageErreur("position-invalide"));
  }
  if (estLaPlaceActuelle(piles, carte, destination)) {
    return SANS_EFFET;
  }
  const ordre = lue.lignes.map(({ id }) => id);
  return {
    changeDePile: optionDeLaLigne(ligne, rang, regroupement) !== destination.option,
    position: positionDansLaTable(ordre, carte, cartes, destination.precedente),
  };
}

export function deplacerUneCarte(
  contexte: ContexteDeDeplacement,
  carte: IdLigne,
  destination: Destination,
): ResultatDeDeplacement {
  const plan = planDe(contexte, carte, destination);
  if ("sorte" in plan) {
    return plan;
  }
  const { table, regroupement } = contexte;
  const { changeDePile, position } = plan;
  const refus =
    (changeDePile
      ? ecrireOuRefuser(() => table.ecrireCellule(carte, regroupement.id, destination.option))
      : undefined) ??
    (position === undefined
      ? undefined
      : ecrireOuRefuser(() => table.deplacerLigne(carte, position)));
  return refus ?? (changeDePile || position !== undefined ? { sorte: "deplacee" } : SANS_EFFET);
}
