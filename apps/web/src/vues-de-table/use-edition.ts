// Mode édition de la grille (F-018-AC19, AC27 à AC33, AC36) : une saisie n'est écrite qu'à sa
// validation (Entrée, Tab, sortie du champ), jamais à la frappe (H16) ; Échap abandonne sans rien
// écrire ; un refus garde le mode édition et le texte saisi.
import type { ColonneLue, DocumentTable, LigneLue } from "@notionlike/document";
import { useRef, useState } from "react";

import { texteDEdition } from "./affichage.ts";
import type { Edition, Suite } from "./grille.ts";
import type { Position } from "./navigation-grille.ts";
import {
  type CibleDeCellule,
  ecrireLaValeur,
  validerLeChamp,
  validerLeNom,
  valeurDe,
} from "./valider.ts";

export interface EditionDeLaGrille {
  readonly edition: Edition | undefined;
  /** Entre en mode édition sur la cellule à cette place ; `texte` remplace son contenu (AC33). */
  readonly commencer: (place: Position, texte?: string) => void;
  /** Ouvre la saisie du nom de cette colonne (AC19). */
  readonly renommer: (colonne: ColonneLue) => void;
  readonly changerTexte: (texte: string) => void;
  readonly changerActive: (active: number) => void;
  /** Valide la saisie ouverte ; vrai si le mode édition est quitté. */
  readonly valider: (suite: Suite) => boolean;
  /** Choisit le rang donné dans la liste de choix ouverte : 0 pour « Aucune ». */
  readonly choisir: (rang: number) => void;
  readonly abandonner: () => void;
}

interface Options {
  readonly table: DocumentTable;
  readonly lignes: readonly LigneLue[];
  readonly colonnes: readonly ColonneLue[];
  /** Raison de la lecture seule : aucun mode édition n'est ouvert (F-018-AC52). */
  readonly lectureSeule: string | undefined;
  /** Après une validation : la cellule courante suit la suite demandée. */
  readonly apres: (suite: Suite) => void;
}

function editionDeLaCellule(
  ligne: LigneLue,
  colonne: ColonneLue,
  rangDeColonne: number,
  texte: string | undefined,
): Edition | undefined {
  const valeur = valeurDe(ligne, rangDeColonne);
  if (colonne.type === "case") {
    return undefined;
  }
  if (colonne.type === "selection") {
    const active = colonne.options.findIndex((option) => option.id === valeur) + 1;
    return { sorte: "choix", ligne: ligne.id, colonne: colonne.id, active };
  }
  const initial = texte ?? texteDEdition(colonne, valeur);
  return {
    sorte: "champ",
    ligne: ligne.id,
    colonne: colonne.id,
    texte: initial,
    erreur: undefined,
  };
}

export function useEdition(options: Options): EditionDeLaGrille {
  const [edition, setEdition] = useState<Edition | undefined>(undefined);
  // La dernière édition, lue par une validation qui suit une autre dans le même événement (Entrée
  // puis la sortie du champ qui disparaît) : la seconde ne trouve plus rien à valider.
  const tenue = useRef<Edition | undefined>(undefined);
  const poser = (suivante: Edition | undefined): void => {
    tenue.current = suivante;
    setEdition(suivante);
  };
  const cible = (
    ouverte: Extract<Edition, { sorte: "champ" | "choix" }>,
  ): CibleDeCellule | undefined => {
    const ligne = options.lignes.find(({ id }) => id === ouverte.ligne);
    const rang = options.colonnes.findIndex(({ id }) => id === ouverte.colonne);
    const colonne = options.colonnes[rang];
    return ligne === undefined || colonne === undefined
      ? undefined
      : { ligne: ligne.id, colonne, avant: valeurDe(ligne, rang) };
  };
  return {
    edition,
    commencer: (place, texte) => {
      const ligne = options.lignes[place.rang - 1];
      const colonne = options.colonnes[place.colonne - 1];
      if (options.lectureSeule === undefined && ligne !== undefined && colonne !== undefined) {
        poser(editionDeLaCellule(ligne, colonne, place.colonne - 1, texte));
      }
    },
    renommer: (colonne) => {
      if (options.lectureSeule === undefined) {
        poser({ sorte: "nom", colonne: colonne.id, texte: colonne.nom, erreur: undefined });
      }
    },
    changerTexte: (texte) => {
      const ouverte = tenue.current;
      if (ouverte !== undefined && ouverte.sorte !== "choix") {
        poser({ ...ouverte, texte, erreur: undefined });
      }
    },
    changerActive: (active) => {
      const ouverte = tenue.current;
      if (ouverte?.sorte === "choix") {
        poser({ ...ouverte, active });
      }
    },
    valider: (suite) => valider(tenue.current, { options, poser, cible }, suite),
    choisir: (rang) => choisir(tenue.current, { options, poser, cible }, rang),
    abandonner: () => poser(undefined),
  };
}

interface Moyens {
  readonly options: Options;
  readonly poser: (suivante: Edition | undefined) => void;
  readonly cible: (
    ouverte: Extract<Edition, { sorte: "champ" | "choix" }>,
  ) => CibleDeCellule | undefined;
}

function valider(ouverte: Edition | undefined, moyens: Moyens, suite: Suite): boolean {
  if (ouverte === undefined || ouverte.sorte === "choix") {
    return ouverte === undefined;
  }
  let refus: string | undefined;
  if (ouverte.sorte === "nom") {
    const colonne = moyens.options.colonnes.find(({ id }) => id === ouverte.colonne);
    refus =
      colonne === undefined
        ? undefined
        : validerLeNom(moyens.options.table, colonne, ouverte.texte);
  } else {
    const cible = moyens.cible(ouverte);
    refus =
      cible === undefined ? undefined : validerLeChamp(moyens.options.table, cible, ouverte.texte);
  }
  if (refus !== undefined) {
    moyens.poser({ ...ouverte, erreur: refus });
    return false;
  }
  moyens.poser(undefined);
  moyens.options.apres(suite);
  return true;
}

function choisir(ouverte: Edition | undefined, moyens: Moyens, rang: number): void {
  if (ouverte?.sorte !== "choix") {
    return;
  }
  const cible = moyens.cible(ouverte);
  moyens.poser(undefined);
  if (cible !== undefined) {
    const option = rang === 0 ? undefined : cible.colonne.options[rang - 1];
    ecrireLaValeur(moyens.options.table, cible, option?.id ?? null);
  }
  moyens.options.apres("rester");
}
