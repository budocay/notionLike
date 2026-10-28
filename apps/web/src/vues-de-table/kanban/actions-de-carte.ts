// Les actions d'une carte qui écrivent dans le document de table (F-020-AC6, AC9, AC13, AC23) :
// déplacement par une commande ou par un geste, création. Toutes passent par `deplacerUneCarte`
// (déplacement) ou par une seule opération de la façade (création) ; en lecture seule, aucune n'écrit.
import type { ColonneLue, IdLigne } from "@notionlike/document";

import type { DepotSurUnePile } from "../../glisser/index.ts";
import { ecrire } from "../ecritures.ts";
import { TRI_ACTIF } from "../textes.ts";
import { deplacerUneCarte } from "./deplacement.ts";
import {
  type CommandeDeCarte,
  type Destination,
  destinationDeLaCommande,
  destinationDuDepot,
  placeApresLeDeplacement,
  reglePlaceDansLaPile,
} from "./destination.ts";
import { DESCRIPTION_DES_COMMANDES } from "./entrees.ts";
import { carteDeLIdentifiant, pileDeLIdentifiant } from "./identifiants.ts";
import type { MoyensDuKanban } from "./moyens.ts";
import type { Pile } from "./piles.ts";
import { carteDeplacee, carteDeposee } from "./textes.ts";
import type { LimitesDesPiles } from "./use-limites.ts";

export interface MoyensDeCarte extends MoyensDuKanban {
  readonly regroupement: ColonneLue;
  readonly piles: readonly Pile[];
  readonly focaliser: (carte: IdLigne) => void;
  readonly limites: LimitesDesPiles;
  /** Ouvre la saisie du titre d'une carte qui vient d'être créée. */
  readonly saisirLeTitre: (carte: IdLigne) => void;
}

// En lecture seule aucune action n'écrit : elle dit la raison et s'arrête (AC23).
function refuseeEnLectureSeule(moyens: MoyensDeCarte): boolean {
  if (moyens.lectureSeule === undefined) {
    return false;
  }
  moyens.signaler(moyens.lectureSeule);
  return true;
}

function deplacer(
  moyens: MoyensDeCarte,
  carte: IdLigne,
  destination: Destination,
  auClavier: boolean,
): void {
  if (refuseeEnLectureSeule(moyens)) {
    return;
  }
  const { table, lue, lignes, regroupement, piles, surveillance, triActif } = moyens;
  const resultat = deplacerUneCarte(
    { table, lue, lignes, regroupement, surveillance, triActif },
    carte,
    destination,
  );
  moyens.signaler(resultat.sorte === "refusee" ? resultat.message : undefined);
  const place = placeApresLeDeplacement(piles, carte, destination);
  if (resultat.sorte !== "deplacee" || place === undefined) {
    return;
  }
  // Sous un tri, la place dans la pile est celle du tri : la carte est présentée jusqu'au bout de la pile.
  moyens.limites.jusqua(destination.option, triActif ? place.total : place.rang);
  // Au pointeur, le module de glisser-déposer annonce le dépôt lui-même.
  if (auClavier) {
    moyens.focaliser(carte);
    moyens.annoncer(annonceDuDeplacement(piles, carte, destination, triActif ? undefined : place));
  }
}

// Le libellé de la carte, sa pile et sa place, lus après un déplacement au clavier (AC15).
function annonceDuDeplacement(
  piles: readonly Pile[],
  carte: IdLigne,
  destination: Destination,
  place: { readonly rang: number; readonly total: number } | undefined,
): string {
  const titre = piles.flatMap((pile) => pile.cartes).find(({ id }) => id === carte)?.titre ?? "";
  const pile = piles.find(({ option }) => option === destination.option);
  const libelle = destination.option === null ? null : (pile?.libelle ?? null);
  return place === undefined
    ? carteDeposee(titre, libelle)
    : carteDeplacee(titre, libelle, place.rang, place.total);
}

function commander(moyens: MoyensDeCarte, carte: IdLigne, commande: CommandeDeCarte): void {
  if (refuseeEnLectureSeule(moyens)) {
    return;
  }
  const destination = destinationDeLaCommande(moyens.piles, carte, commande, moyens.triActif);
  if (destination === undefined) {
    const sousTri = moyens.triActif && reglePlaceDansLaPile(commande);
    moyens.annoncer(sousTri ? TRI_ACTIF : DESCRIPTION_DES_COMMANDES[commande].bord);
    return;
  }
  deplacer(moyens, carte, destination, true);
}

/** Une ligne en dernière position, dans la pile désignée, puis la saisie de son titre (AC6). */
function creer(moyens: MoyensDeCarte, pile: Pile): void {
  if (refuseeEnLectureSeule(moyens)) {
    return;
  }
  const { table, regroupement, surveillance } = moyens;
  const valeurs = pile.option === null ? undefined : new Map([[regroupement.id, pile.option]]);
  const issue = ecrire(() => table.creerLigne(valeurs), surveillance);
  moyens.signaler(issue.reussie ? undefined : issue.message);
  if (issue.reussie) {
    surveillance.creee(issue.valeur);
    moyens.limites.jusqua(pile.option, pile.cartes.length + 1);
    moyens.saisirLeTitre(issue.valeur);
  }
}

/** Présente 100 cartes de plus ; le focus passe à la première des cartes qui paraissent (AC8, AC15). */
function afficherPlus(moyens: MoyensDeCarte, pile: Pile): void {
  const premiere = pile.cartes[moyens.limites.limiteDe(pile)];
  moyens.limites.plus(pile.option);
  if (premiere !== undefined) {
    moyens.focaliser(premiere.id);
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
    // Sous un tri, un seul repère par pile : la carte est posée en fin de pile (AC16).
    cible:
      depot.cible === undefined || moyens.triActif ? undefined : carteDeLIdentifiant(depot.cible),
    zone: moyens.triActif ? undefined : depot.zone,
  });
  if (destination !== undefined) {
    deplacer(moyens, carte, destination, false);
  }
}

/** Supprime la ligne de la carte ; vrai si elle l'est (sinon le refus est signalé, AC20). */
export function supprimerUneCarte(
  moyens: Pick<MoyensDuKanban, "table" | "lectureSeule" | "surveillance" | "signaler">,
  carte: IdLigne,
): boolean {
  if (moyens.lectureSeule !== undefined) {
    return false;
  }
  const issue = ecrire(() => moyens.table.supprimerLigne(carte), moyens.surveillance);
  moyens.signaler(issue.reussie ? undefined : issue.message);
  return issue.reussie;
}

export interface ActionsDeCarte {
  readonly commander: (carte: IdLigne, commande: CommandeDeCarte) => void;
  readonly creer: (pile: Pile) => void;
  readonly afficherPlus: (pile: Pile) => void;
  readonly deposer: (depot: DepotSurUnePile) => void;
}

export function actionsDeCarte(moyens: MoyensDeCarte): ActionsDeCarte {
  return {
    commander: (carte, commande) => commander(moyens, carte, commande),
    creer: (pile) => creer(moyens, pile),
    afficherPlus: (pile) => afficherPlus(moyens, pile),
    deposer: (depot) => deposer(moyens, depot),
  };
}
