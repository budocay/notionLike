// Les commandes que la vue calendrier offre à ses composants (F-021-AC2, AC9 à AC14, AC20) : celles du
// mois affiché, des écritures, de la saisie, des boîtes, du menu et du clavier de la grille.
import type { IdColonne, IdLigne, LigneLue, TypeDeColonne } from "@notionlike/document";
import type { KeyboardEvent, RefObject } from "react";

import {
  type ActionDeCase,
  actionDeLaCase,
  type ActionDEntree,
  actionDeLEntree,
} from "./clavier-calendrier.ts";
import type { PasDeJours } from "./ecritures-du-calendrier.ts";
import { decomposer, moisPrecedent, moisSuivant } from "./jours.ts";
import type { ModeleDuCalendrier } from "./modele-calendrier.ts";
import type { EcrituresDuCalendrier } from "./use-ecritures-calendrier.ts";
import type { MenuDuCalendrier } from "./use-menu-calendrier.ts";
import { moisDAujourdhui, type NavigationDuCalendrier } from "./use-navigation-du-calendrier.ts";
import type { Saisie } from "./use-saisie-du-titre.ts";
import type { SuiviDuFocus } from "./use-suivi-du-focus.ts";
import { titreDuMois } from "./textes-calendrier.ts";

export type BoiteDuCalendrier =
  | { readonly sorte: "nouvelle-colonne" }
  | { readonly sorte: "date"; readonly ligne: IdLigne }
  | { readonly sorte: "supprimer"; readonly ligne: IdLigne };

export interface CommandesDuCalendrier {
  readonly moisPrecedent: () => void;
  readonly moisSuivant: () => void;
  readonly aujourdhui: () => void;
  readonly choisirLaColonne: (colonne: IdColonne) => void;
  readonly deplacer: (ligne: LigneLue, pas: PasDeJours) => void;
  /** Écrit le jour (ou le retire avec `null`) ; rend le refus du document. */
  readonly fixerLaDate: (ligne: LigneLue, jour: string | null) => string | undefined;
  readonly retirerLaDate: (ligne: LigneLue) => void;
  readonly nouvelleLigne: (jour: string) => void;
  readonly supprimer: (ligne: LigneLue) => void;
  readonly ajouterUneColonne: (nom: string, type: TypeDeColonne) => string | undefined;
  readonly deplier: (jour: string) => void;
  readonly plusDeLignes: () => void;
  readonly ouvrirLaSaisie: (ligne: LigneLue) => void;
  readonly changerLaSaisie: (texte: string) => void;
  readonly validerLaSaisie: (suite: string) => boolean;
  readonly abandonnerLaSaisie: () => void;
  readonly ouvrirUneBoite: (boite: BoiteDuCalendrier) => void;
  /** Ferme la boîte ; avec une ligne, le focus lui revient. */
  readonly fermerLaBoite: (ligne?: IdLigne) => void;
  readonly ouvrirLeMenu: (declencheur: HTMLElement) => void;
  readonly surTouche: (evenement: KeyboardEvent<HTMLElement>) => void;
}

interface Parties {
  readonly modele: ModeleDuCalendrier;
  readonly navigation: NavigationDuCalendrier;
  readonly saisie: Saisie;
  readonly suivi: SuiviDuFocus;
  readonly menu: MenuDuCalendrier;
  readonly ecritures: EcrituresDuCalendrier;
  readonly cadre: RefObject<HTMLDivElement | null>;
  readonly choisirLaColonne: (colonne: IdColonne) => void;
  readonly ouvrirUneBoite: (boite: BoiteDuCalendrier | undefined) => void;
  readonly annoncer: (texte: string) => void;
}

/**
 * Porte le focus sur ce jour, en affichant son mois s'il n'est pas dans la grille ou si `mois` le
 * demande (Page précédente et suivante changent toujours de mois, AC20).
 */
function allerAuJour(parties: Parties, jour: string | undefined, mois = false): void {
  const decompose = jour === undefined ? undefined : decomposer(jour);
  if (jour === undefined || decompose === undefined) {
    return;
  }
  const { navigation, modele, suivi, annoncer } = parties;
  if (mois || !modele.grille.includes(jour)) {
    navigation.montrerLeMois({ annee: decompose.annee, mois: decompose.mois });
    annoncer(titreDuMois(decompose));
  }
  navigation.choisirLeJour(jour);
  suivi.suivre({ sorte: "case", jour });
}

// Le menu s'ancre sur l'entrée qui porte le déclencheur, sinon sur sa case.
function ouvrirLeMenu({ menu, cadre }: Parties, declencheur: HTMLElement): void {
  const entree = declencheur.closest<HTMLElement>("[data-ligne]");
  const element = entree ?? declencheur.closest<HTMLElement>("[data-jour]");
  const jour = element?.closest<HTMLElement>("[data-jour]")?.dataset.jour;
  if (element === null || jour === undefined) {
    return;
  }
  const ligne = entree?.dataset.ligne;
  menu.ouvrir(
    ligne === undefined ? { sorte: "case", jour } : { sorte: "entree", ligne, jour },
    element,
    cadre.current,
  );
}

function traiter(evenement: KeyboardEvent<HTMLElement>, effet: () => void): void {
  evenement.preventDefault();
  evenement.stopPropagation();
  effet();
}

function surToucheDeLaCase(
  parties: Parties,
  evenement: KeyboardEvent<HTMLElement>,
  element: HTMLElement,
  jour: string,
): void {
  const action: ActionDeCase | undefined = actionDeLaCase(evenement, jour);
  if (action?.sorte === "jour") {
    traiter(evenement, () => allerAuJour(parties, action.jour));
  } else if (action?.sorte === "mois") {
    traiter(evenement, () => allerAuJour(parties, action.jour, true));
  } else if (action?.sorte === "entrer") {
    traiter(evenement, () => element.querySelector<HTMLElement>("[data-ligne]")?.focus());
  } else if (action?.sorte === "menu") {
    traiter(evenement, () => ouvrirLeMenu(parties, element));
  }
}

// L'entrée voisine dans la case ; avant la première, la case elle-même. Au-delà de la dernière, rien.
function allerALEntreeVoisine(element: HTMLElement, sens: -1 | 1): void {
  const laCase = element.closest<HTMLElement>("[data-jour]");
  const entrees = [...(laCase?.querySelectorAll<HTMLElement>("[data-ligne]") ?? [])];
  const voisine = entrees[entrees.indexOf(element) + sens];
  (voisine ?? (sens < 0 ? laCase : null))?.focus();
}

/** L'effet d'une action sur une entrée. */
function effetDeLEntree(
  parties: Parties,
  element: HTMLElement,
  ligne: LigneLue,
  action: ActionDEntree,
): () => void {
  switch (action.sorte) {
    case "deplacer":
      return () => parties.ecritures.deplacer(ligne, action.pas);
    case "voisine":
      return () => allerALEntreeVoisine(element, action.sens);
    case "titre":
      return () => parties.saisie.ouvrir(ligne);
    // Directement : la case contient l'entrée qui a le focus, le suivi la croirait déjà focalisée.
    case "case":
      return () => element.closest<HTMLElement>("[data-jour]")?.focus();
    case "menu":
      return () => ouvrirLeMenu(parties, element);
  }
}

function surToucheDeLEntree(
  parties: Parties,
  evenement: KeyboardEvent<HTMLElement>,
  element: HTMLElement,
  ligne: LigneLue,
): void {
  const action = actionDeLEntree(evenement);
  if (action !== undefined) {
    traiter(evenement, effetDeLEntree(parties, element, ligne, action));
  }
}

function surTouche(parties: Parties, evenement: KeyboardEvent<HTMLElement>): void {
  const element = evenement.target;
  if (!(element instanceof HTMLElement)) {
    return;
  }
  const { jour, ligne } = element.dataset;
  if (element.getAttribute("role") === "gridcell" && jour !== undefined) {
    surToucheDeLaCase(parties, evenement, element, jour);
    return;
  }
  const entree = ligne === undefined ? undefined : parties.modele.ligneDe(ligne);
  if (entree !== undefined) {
    surToucheDeLEntree(parties, evenement, element, entree);
  }
}

export function commandesDuCalendrier(parties: Parties): CommandesDuCalendrier {
  const { navigation, saisie, suivi, ecritures, modele } = parties;
  const { mois } = navigation;
  return {
    moisPrecedent: () => navigation.afficherLeMois(moisPrecedent(mois)),
    moisSuivant: () => navigation.afficherLeMois(moisSuivant(mois)),
    aujourdhui: () => navigation.afficherLeMois(moisDAujourdhui()),
    choisirLaColonne: parties.choisirLaColonne,
    ...ecritures,
    deplier: navigation.deplier,
    plusDeLignes: () => navigation.elargirLePanneauJusqua(navigation.limiteDuPanneau),
    ouvrirLaSaisie: saisie.ouvrir,
    changerLaSaisie: saisie.changer,
    validerLaSaisie: saisie.valider,
    abandonnerLaSaisie: saisie.abandonner,
    ouvrirUneBoite: parties.ouvrirUneBoite,
    fermerLaBoite: (ligne) => {
      parties.ouvrirUneBoite(undefined);
      const jour = ligne === undefined ? undefined : modele.jourDansLaGrille(ligne);
      if (ligne !== undefined) {
        suivi.suivre(
          jour === undefined ? { sorte: "panneau", ligne } : { sorte: "entree", ligne, jour },
        );
      }
    },
    ouvrirLeMenu: (declencheur) => ouvrirLeMenu(parties, declencheur),
    surTouche: (evenement) => surTouche(parties, evenement),
  };
}
