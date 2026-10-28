// Entrées du menu des actions d'une carte (F-020-AC7, AC13, AC21, AC23) : les quatre commandes de
// déplacement, la saisie du titre et la suppression de la ligne. Chacune cite le libellé de la carte
// dans son nom accessible, et se désactive avec sa raison : lecture seule, bord de la vue, absence de
// colonne de titre.
import type { EntreeDeMenu } from "../../interface/composants/MenuActions.tsx";
import { afficherTouches, cleAria, TOUCHES_DE_LA_CARTE } from "../../interface/raccourcis.ts";
import { SUPPRIMER_LA_LIGNE, TRI_ACTIF } from "../textes.ts";
import { COMMANDES_DE_CARTE, type CommandeDeCarte, reglePlaceDansLaPile } from "./destination.ts";
import {
  COMMANDE_DESCENDRE,
  COMMANDE_MONTER,
  DERNIERE_CARTE,
  DERNIERE_PILE,
  MODIFIER_LE_TITRE,
  nomDeLaCommande,
  PAS_DE_COLONNE_DE_TITRE,
  PILE_PRECEDENTE,
  PILE_SUIVANTE,
  PREMIERE_CARTE,
  PREMIERE_PILE,
} from "./textes.ts";

interface DescriptionDeCommande {
  readonly libelle: string;
  readonly bord: string;
  readonly touches: (typeof TOUCHES_DE_LA_CARTE)[
    "pilePrecedente" | "pileSuivante" | "monter" | "descendre"];
}

/** Les quatre commandes, chacune avec le texte du bord où elle n'a pas de destination (AC13). */
export const DESCRIPTION_DES_COMMANDES: Readonly<Record<CommandeDeCarte, DescriptionDeCommande>> = {
  "pile-precedente": {
    libelle: PILE_PRECEDENTE,
    bord: PREMIERE_PILE,
    touches: TOUCHES_DE_LA_CARTE.pilePrecedente,
  },
  "pile-suivante": {
    libelle: PILE_SUIVANTE,
    bord: DERNIERE_PILE,
    touches: TOUCHES_DE_LA_CARTE.pileSuivante,
  },
  monter: { libelle: COMMANDE_MONTER, bord: PREMIERE_CARTE, touches: TOUCHES_DE_LA_CARTE.monter },
  descendre: {
    libelle: COMMANDE_DESCENDRE,
    bord: DERNIERE_CARTE,
    touches: TOUCHES_DE_LA_CARTE.descendre,
  },
};

export interface CommandesDeCarte {
  readonly titre: string;
  readonly lectureSeule: string | undefined;
  /** Vrai si la commande a une destination depuis la place actuelle de la carte. */
  readonly possible: (commande: CommandeDeCarte) => boolean;
  /** Un tri est actif : « Monter » et « Descendre » disent « Tri actif » (AC16). */
  readonly triActif: boolean;
  readonly titreModifiable: boolean;
  /** Ferme le menu avant d'agir : le focus revient à la carte, sauf si l'action le porte ailleurs. */
  readonly fermer: () => void;
  readonly deplacer: (commande: CommandeDeCarte) => void;
  readonly modifierLeTitre: () => void;
  readonly supprimer: () => void;
}

// Pourquoi une commande n'a pas de destination : le tri qui fixe la place, sinon le bord atteint.
function raisonDuBord(
  commandes: CommandesDeCarte,
  commande: CommandeDeCarte,
  bord: string,
): string | undefined {
  if (commandes.possible(commande)) {
    return undefined;
  }
  return commandes.triActif && reglePlaceDansLaPile(commande) ? TRI_ACTIF : bord;
}

export function entreesDeCarte(commandes: CommandesDeCarte): EntreeDeMenu[] {
  const { titre, lectureSeule } = commandes;
  const agir = (effet: () => void) => () => {
    commandes.fermer();
    effet();
  };
  const deplacements = COMMANDES_DE_CARTE.map((commande): EntreeDeMenu => {
    const { libelle, bord, touches } = DESCRIPTION_DES_COMMANDES[commande];
    return {
      libelle,
      nom: nomDeLaCommande(libelle, titre),
      touches: afficherTouches(touches),
      raccourci: cleAria(touches),
      raison: lectureSeule ?? raisonDuBord(commandes, commande, bord),
      surActivation: agir(() => commandes.deplacer(commande)),
    };
  });
  return [
    ...deplacements,
    {
      libelle: MODIFIER_LE_TITRE,
      nom: nomDeLaCommande(MODIFIER_LE_TITRE, titre),
      raison: lectureSeule ?? (commandes.titreModifiable ? undefined : PAS_DE_COLONNE_DE_TITRE),
      surActivation: agir(commandes.modifierLeTitre),
    },
    {
      libelle: SUPPRIMER_LA_LIGNE,
      nom: nomDeLaCommande(SUPPRIMER_LA_LIGNE, titre),
      raison: lectureSeule,
      surActivation: agir(commandes.supprimer),
    },
  ];
}
