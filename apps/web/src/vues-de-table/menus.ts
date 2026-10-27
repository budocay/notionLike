// Entrées des menus d'en-tête et de ligne de la grille (F-018-AC18 à AC25, AC34) : chacune nommée
// d'après la colonne ou la place de la ligne qu'elle vise, désactivée avec sa raison quand elle est
// indisponible (première, dernière, lecture seule), déclenchable au clavier seul.
import type { ColonneLue, IdLigne } from "@notionlike/document";

import type { EntreeDeMenu } from "../interface/composants/MenuActions.tsx";
import { afficherTouches, cleAria, RACCOURCIS } from "../interface/raccourcis.ts";
import { deplacerUneColonne, deplacerUneLigne, type Moyens } from "./actions.ts";
import type { Courante } from "./courante.ts";
import type { Boite } from "./grille.ts";
import {
  commandeDeLigne,
  DEJA_LA_DERNIERE_COLONNE,
  DEJA_LA_DERNIERE_LIGNE,
  DEJA_LA_PREMIERE_COLONNE,
  DEJA_LA_PREMIERE_LIGNE,
  DEPLACER_A_DROITE,
  DEPLACER_A_GAUCHE,
  DESCENDRE_LA_LIGNE,
  deplacerLaColonne,
  GERER_LES_OPTIONS,
  MONTER_LA_LIGNE,
  nomAffiche,
  REGLER_LA_LARGEUR,
  RENOMMER_LA_COLONNE,
  SUPPRIMER_LA_COLONNE,
  SUPPRIMER_LA_LIGNE,
  TRI_ACTIF,
} from "./textes.ts";

export interface Commandes {
  readonly moyens: Moyens;
  /** Ferme le menu ; le focus revient à la cellule qui l'a ouvert, sauf si l'action le porte ailleurs. */
  readonly fermer: () => void;
  readonly renommer: (colonne: ColonneLue) => void;
  readonly ouvrirBoite: (boite: Boite) => void;
  /** Porte le focus sur le séparateur de largeur de la colonne (AC43), au clavier seul. */
  readonly reglerLaLargeur: (colonne: ColonneLue) => void;
}

function citer(commande: string, nom: string): string {
  return `${commande} ${nomAffiche(nom)}`;
}

// Déplacer à gauche ou à droite : indisponible en bout de rangée (AC20).
function entreeDeDeplacement(
  commandes: Commandes,
  colonne: ColonneLue,
  sens: -1 | 1,
  auBout: boolean,
): EntreeDeMenu {
  const gauche = sens < 0;
  const bout = gauche ? DEJA_LA_PREMIERE_COLONNE : DEJA_LA_DERNIERE_COLONNE;
  return {
    libelle: gauche ? DEPLACER_A_GAUCHE : DEPLACER_A_DROITE,
    nom: deplacerLaColonne(colonne.nom, gauche ? "gauche" : "droite"),
    raison: commandes.moyens.lectureSeule ?? (auBout ? bout : undefined),
    surActivation: () => {
      commandes.fermer();
      deplacerUneColonne(commandes.moyens, colonne, sens);
    },
  };
}

export function entreesDeColonne(
  commandes: Commandes,
  colonne: ColonneLue,
  rang: number,
  total: number,
): EntreeDeMenu[] {
  const raison = commandes.moyens.lectureSeule;
  const agir = (effet: () => void) => () => {
    commandes.fermer();
    effet();
  };
  const boite = (ouverte: Boite) => agir(() => commandes.ouvrirBoite(ouverte));
  return [
    {
      libelle: RENOMMER_LA_COLONNE,
      nom: citer(RENOMMER_LA_COLONNE, colonne.nom),
      raison,
      surActivation: agir(() => commandes.renommer(colonne)),
    },
    entreeDeDeplacement(commandes, colonne, -1, rang === 0),
    entreeDeDeplacement(commandes, colonne, 1, rang === total - 1),
    ...(colonne.type === "selection"
      ? [
          {
            libelle: GERER_LES_OPTIONS,
            nom: citer(`${GERER_LES_OPTIONS} de la colonne`, colonne.nom),
            raison,
            surActivation: boite({ sorte: "options", colonne: colonne.id }),
          },
        ]
      : []),
    // Un réglage de vue, permis en lecture seule (F-018-AC52).
    {
      libelle: REGLER_LA_LARGEUR,
      nom: citer(`${REGLER_LA_LARGEUR} de la colonne`, colonne.nom),
      surActivation: agir(() => commandes.reglerLaLargeur(colonne)),
    },
    {
      libelle: SUPPRIMER_LA_COLONNE,
      nom: citer(SUPPRIMER_LA_COLONNE, colonne.nom),
      raison,
      surActivation: boite({ sorte: "supprimer-colonne", colonne: colonne.id }),
    },
  ];
}

export function entreesDeLigne(
  commandes: Commandes,
  ligne: IdLigne,
  rang: number,
  courante: Courante,
): EntreeDeMenu[] {
  const { moyens, fermer } = commandes;
  const raison = moyens.lectureSeule;
  const total = moyens.lignes.length;
  const raisonDuTri = moyens.triActif ? TRI_ACTIF : undefined;
  const agir = (effet: () => void) => () => {
    fermer();
    effet();
  };
  return [
    {
      libelle: MONTER_LA_LIGNE,
      nom: commandeDeLigne(MONTER_LA_LIGNE, rang),
      touches: afficherTouches(RACCOURCIS.monterLaLigne),
      raccourci: cleAria(RACCOURCIS.monterLaLigne),
      raison: raison ?? raisonDuTri ?? (rang === 1 ? DEJA_LA_PREMIERE_LIGNE : undefined),
      surActivation: agir(() => deplacerUneLigne(moyens, ligne, -1, courante)),
    },
    {
      libelle: DESCENDRE_LA_LIGNE,
      nom: commandeDeLigne(DESCENDRE_LA_LIGNE, rang),
      touches: afficherTouches(RACCOURCIS.descendreLaLigne),
      raccourci: cleAria(RACCOURCIS.descendreLaLigne),
      raison: raison ?? raisonDuTri ?? (rang === total ? DEJA_LA_DERNIERE_LIGNE : undefined),
      surActivation: agir(() => deplacerUneLigne(moyens, ligne, 1, courante)),
    },
    {
      libelle: SUPPRIMER_LA_LIGNE,
      nom: commandeDeLigne(SUPPRIMER_LA_LIGNE, rang),
      raison,
      surActivation: agir(() => commandes.ouvrirBoite({ sorte: "supprimer-ligne", ligne })),
    },
  ];
}
