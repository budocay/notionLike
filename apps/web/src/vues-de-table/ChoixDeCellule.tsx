// Liste des choix d'une cellule `selection` (F-018-AC31) : « Aucune », puis les options de la
// colonne dans leur ordre, l'option courante marquée ; « Gérer les options » quand la colonne n'en a
// pas. Flèches pour parcourir, Entrée ou un clic pour choisir, Échap pour abandonner.
import type { ColonneLue, LigneLue } from "@notionlike/document";
import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactElement,
  useEffect,
  useId,
  useRef,
} from "react";

import {
  type ChoixDeListe,
  ListeDeChoix,
  SurfaceFlottante,
} from "../interface/composants/Table.tsx";
import { estLaFrappe, TOUCHES_DE_L_EDITION } from "../interface/raccourcis.ts";
import { cleDeCellule } from "./courante.ts";
import { ancreDe } from "./menu-de-grille.ts";
import { AUCUNE, GERER_LES_OPTIONS, libelleAffiche, listeDesOptions } from "./textes.ts";
import type { VueTableau } from "./use-vue-tableau.ts";
import { valeurDe } from "./valider.ts";

const GERER = "gerer";

function choixDe(colonne: ColonneLue, ligne: LigneLue, rangDeColonne: number): ChoixDeListe[] {
  const valeur = valeurDe(ligne, rangDeColonne);
  return [
    { cle: "aucune", libelle: AUCUNE, courant: valeur === null },
    ...colonne.options.map((option) => ({
      cle: option.id,
      libelle: libelleAffiche(option.libelle),
      courant: option.id === valeur,
    })),
    ...(colonne.options.length === 0
      ? [{ cle: GERER, libelle: GERER_LES_OPTIONS, courant: false }]
      : []),
  ];
}

// Flèches : parcourir, en boucle ; Entrée : choisir l'active ; Échap : abandonner sans écrire.
function toucheDeLaListe(
  evenement: KeyboardEvent<HTMLDivElement>,
  effets: {
    readonly parcourir: (pas: number) => void;
    readonly choisir: () => void;
    readonly abandonner: () => void;
  },
): void {
  evenement.stopPropagation();
  const pas = estLaFrappe(evenement, TOUCHES_DE_L_EDITION.choixSuivant)
    ? 1
    : estLaFrappe(evenement, TOUCHES_DE_L_EDITION.choixPrecedent)
      ? -1
      : 0;
  if (pas !== 0) {
    evenement.preventDefault();
    effets.parcourir(pas);
  } else if (estLaFrappe(evenement, TOUCHES_DE_L_EDITION.validerEtDescendre)) {
    evenement.preventDefault();
    effets.choisir();
  } else if (estLaFrappe(evenement, TOUCHES_DE_L_EDITION.abandonner)) {
    evenement.preventDefault();
    effets.abandonner();
  }
}

function Liste(props: {
  readonly vue: VueTableau;
  readonly colonne: ColonneLue;
  readonly choix: readonly ChoixDeListe[];
  readonly active: number;
}): ReactElement {
  const { vue, colonne, choix, active } = props;
  const id = useId();
  const liste = useRef<HTMLDivElement>(null);
  useEffect(() => liste.current?.focus(), []);
  const choisir = (rang: number): void => {
    if (choix[rang]?.cle === GERER) {
      vue.edition.abandonner();
      vue.ouvrirBoite({ sorte: "options", colonne: colonne.id });
      return;
    }
    vue.edition.choisir(rang);
  };
  const abandonner = (): void => {
    vue.courante.focaliser();
    vue.edition.abandonner();
  };
  const surTouche = (evenement: KeyboardEvent<HTMLDivElement>): void =>
    toucheDeLaListe(evenement, {
      parcourir: (pas) => vue.edition.changerActive((active + pas + choix.length) % choix.length),
      choisir: () => choisir(active),
      abandonner,
    });
  return (
    <ListeDeChoix
      id={id}
      nom={listeDesOptions(colonne.nom)}
      choix={choix}
      active={active}
      refListe={liste}
      surTouche={surTouche}
      surChoix={choisir}
      surSortie={(evenement: FocusEvent<HTMLDivElement>) => {
        const vers = evenement.relatedTarget;
        if (!(vers instanceof Node) || !evenement.currentTarget.contains(vers)) {
          vue.edition.abandonner();
        }
      }}
    />
  );
}

/** La liste de la cellule en mode édition, posée sous elle au-dessus de la zone défilante. */
export function ChoixDeCellule({ vue }: { readonly vue: VueTableau }): ReactElement | null {
  const ouverte = vue.edition.edition;
  if (ouverte?.sorte !== "choix") {
    return null;
  }
  const ligne = vue.proprietes.lignes.find(({ id }) => id === ouverte.ligne);
  const rangDeColonne = vue.colonnes.findIndex(({ id }) => id === ouverte.colonne);
  const colonne = vue.colonnes[rangDeColonne];
  const cellule = vue.courante.elementDe(cleDeCellule(ouverte.ligne, ouverte.colonne));
  if (ligne === undefined || colonne === undefined || cellule === undefined) {
    return null;
  }
  const ancre = ancreDe(cellule, vue.cadre.current);
  const choix = choixDe(colonne, ligne, rangDeColonne);
  return (
    <SurfaceFlottante x={ancre.x} y={ancre.y} largeur={ancre.largeur} hauteur={ancre.hauteur}>
      <Liste
        vue={vue}
        colonne={colonne}
        choix={choix}
        active={Math.min(ouverte.active, choix.length - 1)}
      />
    </SurfaceFlottante>
  );
}
