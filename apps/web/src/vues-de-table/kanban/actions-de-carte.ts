// Les actions d'une carte qui écrivent dans le document de table (F-020-AC6, AC9, AC13, AC23) :
// déplacement par une commande ou par un geste, création. Toutes passent par `deplacerUneCarte`
// (déplacement) ou par une seule opération de la façade (création) ; en lecture seule, aucune n'écrit.
import type { ColonneLue, DocumentTable, IdLigne, LigneLue, TableLue } from "@notionlike/document";

import type { DepotSurUnePile } from "../../glisser/index.ts";
import { ecrire } from "../ecritures.ts";
import { deplacerUneCarte } from "./deplacement.ts";
import {
  type CommandeDeCarte,
  type Destination,
  destinationDeLaCommande,
  destinationDuDepot,
  placeApresLeDeplacement,
} from "./destination.ts";
import { DESCRIPTION_DES_COMMANDES } from "./entrees.ts";
import { carteDeLIdentifiant, pileDeLIdentifiant } from "./identifiants.ts";
import type { Pile } from "./piles.ts";
import { carteDeplacee } from "./textes.ts";
import type { LimitesDesPiles } from "./use-limites.ts";

export interface MoyensDeCarte {
  readonly table: DocumentTable;
  readonly lue: TableLue;
  readonly lignes: readonly LigneLue[];
  readonly regroupement: ColonneLue;
  readonly piles: readonly Pile[];
  readonly lectureSeule: string | undefined;
  readonly signaler: (message: string | undefined) => void;
  readonly annoncer: (texte: string) => void;
  readonly focaliser: (carte: IdLigne) => void;
  readonly limites: LimitesDesPiles;
  /** Ouvre la saisie du titre d'une carte qui vient d'être créée. */
  readonly saisirLeTitre: (carte: IdLigne) => void;
}

function deplacer(
  moyens: MoyensDeCarte,
  carte: IdLigne,
  destination: Destination,
  auClavier: boolean,
): void {
  if (moyens.lectureSeule !== undefined) {
    moyens.signaler(moyens.lectureSeule);
    return;
  }
  const { table, lue, lignes, regroupement, piles } = moyens;
  const resultat = deplacerUneCarte({ table, lue, lignes, regroupement }, carte, destination);
  moyens.signaler(resultat.sorte === "refusee" ? resultat.message : undefined);
  const place = placeApresLeDeplacement(piles, carte, destination);
  if (resultat.sorte !== "deplacee" || place === undefined) {
    return;
  }
  moyens.limites.jusqua(destination.option, place.rang);
  // Au pointeur, le module de glisser-déposer annonce le dépôt lui-même.
  if (auClavier) {
    moyens.focaliser(carte);
    moyens.annoncer(annonceDuDeplacement(piles, carte, destination, place));
  }
}

// Le libellé de la carte, sa pile et sa place, lus après un déplacement au clavier (AC15).
function annonceDuDeplacement(
  piles: readonly Pile[],
  carte: IdLigne,
  destination: Destination,
  place: { readonly rang: number; readonly total: number },
): string {
  const titre = piles.flatMap((pile) => pile.cartes).find(({ id }) => id === carte)?.titre ?? "";
  const pile = piles.find(({ option }) => option === destination.option);
  const libelle = destination.option === null ? null : (pile?.libelle ?? null);
  return carteDeplacee(titre, libelle, place.rang, place.total);
}

function commander(moyens: MoyensDeCarte, carte: IdLigne, commande: CommandeDeCarte): void {
  if (moyens.lectureSeule !== undefined) {
    moyens.signaler(moyens.lectureSeule);
    return;
  }
  const destination = destinationDeLaCommande(moyens.piles, carte, commande);
  if (destination === undefined) {
    moyens.annoncer(DESCRIPTION_DES_COMMANDES[commande].bord);
    return;
  }
  deplacer(moyens, carte, destination, true);
}

/** Une ligne en dernière position, dans la pile désignée, puis la saisie de son titre (AC6). */
function creer(moyens: MoyensDeCarte, pile: Pile): void {
  if (moyens.lectureSeule !== undefined) {
    moyens.signaler(moyens.lectureSeule);
    return;
  }
  const { table, regroupement } = moyens;
  const valeurs = pile.option === null ? undefined : new Map([[regroupement.id, pile.option]]);
  const issue = ecrire(() => table.creerLigne(valeurs));
  moyens.signaler(issue.reussie ? undefined : issue.message);
  if (issue.reussie) {
    moyens.limites.jusqua(pile.option, pile.cartes.length + 1);
    moyens.saisirLeTitre(issue.valeur);
  }
}

function deposer(moyens: MoyensDeCarte, depot: DepotSurUnePile): void {
  const carte = carteDeLIdentifiant(depot.actif);
  const pile = pileDeLIdentifiant(depot.pile);
  if (carte === undefined || pile === undefined) {
    return;
  }
  const destination = destinationDuDepot(moyens.piles, carte, {
    pile: pile.option,
    cible: depot.cible === undefined ? undefined : carteDeLIdentifiant(depot.cible),
    zone: depot.zone,
  });
  if (destination !== undefined) {
    deplacer(moyens, carte, destination, false);
  }
}

export interface ActionsDeCarte {
  readonly commander: (carte: IdLigne, commande: CommandeDeCarte) => void;
  readonly creer: (pile: Pile) => void;
  readonly deposer: (depot: DepotSurUnePile) => void;
}

export function actionsDeCarte(moyens: MoyensDeCarte): ActionsDeCarte {
  return {
    commander: (carte, commande) => commander(moyens, carte, commande),
    creer: (pile) => creer(moyens, pile),
    deposer: (depot) => deposer(moyens, depot),
  };
}
