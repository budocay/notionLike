// Lignes de la grille (F-018-AC23 à AC34, AC46, AC47) : seules les rangées de la fenêtre sont dans
// le DOM, plus celles de la cellule courante et de la cellule en mode édition ; chacune placée par
// `transform` à sa hauteur. Une cellule s'affiche selon le type de sa colonne, et passe en mode
// édition sur place.
import type { ColonneLue, LigneLue } from "@notionlike/document";
import type { ReactElement } from "react";

import { BoutonIcone } from "../interface/composants/BoutonIcone.tsx";
import {
  CaseDeCellule,
  CelluleDeGrille,
  RangeeDeGrille,
  TexteDeCellule,
} from "../interface/composants/Table.tsx";
import { cleAria, RACCOURCIS } from "../interface/raccourcis.ts";
import { basculerUneCase } from "./actions.ts";
import { estCochee, texteAffiche } from "./affichage.ts";
import { ChampDEdition } from "./ChampDEdition.tsx";
import { cleDeCellule } from "./courante.ts";
import { indicesRendus } from "./fenetre.ts";
import { HAUTEUR_DE_RANGEE, LARGEUR_DES_ACTIONS } from "./grille.ts";
import { nomActionsDeLaLigne, nomDeLaCelluleCase, nomDeLaLigne, nomDuChamp } from "./textes.ts";
import type { VueTableau } from "./use-vue-tableau.ts";
import { valeurDe } from "./valider.ts";

const SUITES_D_UNE_CELLULE = {
  entree: "descendre",
  tab: "suivante",
  tabArriere: "precedente",
} as const;

/** Les combinaisons de déplacement de la ligne disponibles depuis sa cellule (AC24). */
function raccourcisDeLaLigne(rang: number, total: number): string | undefined {
  const disponibles = [
    ...(rang > 1 ? [cleAria(RACCOURCIS.monterLaLigne)] : []),
    ...(rang < total ? [cleAria(RACCOURCIS.descendreLaLigne)] : []),
  ];
  return disponibles.length === 0 ? undefined : disponibles.join(" ");
}

interface ProprietesCellule {
  readonly vue: VueTableau;
  readonly ligne: LigneLue;
  /** Place de la ligne parmi les lignes affichées, 1 pour la première. */
  readonly rang: number;
  readonly colonne: ColonneLue;
  readonly rangDeColonne: number;
}

function ContenuDeLaCellule(props: ProprietesCellule): ReactElement {
  const { vue, ligne, rang, colonne, rangDeColonne } = props;
  const valeur = valeurDe(ligne, rangDeColonne);
  const ouverte = vue.edition.edition;
  if (colonne.type === "case") {
    return (
      <CaseDeCellule
        nom={nomDeLaCelluleCase(colonne.nom, rang)}
        cochee={estCochee(valeur)}
        raison={vue.proprietes.lectureSeule}
        surBascule={() => basculerUneCase(vue.moyens, ligne, rangDeColonne)}
      />
    );
  }
  if (ouverte?.sorte === "champ" && ouverte.ligne === ligne.id && ouverte.colonne === colonne.id) {
    return (
      <ChampDEdition
        champ={vue.edition.champ}
        nom={nomDuChamp(colonne.nom, rang)}
        texte={ouverte.texte}
        date={colonne.type === "date"}
        idFaute={ouverte.erreur === undefined ? undefined : vue.idAlerte}
        changer={vue.edition.changerTexte}
        valider={vue.edition.valider}
        abandonner={() => {
          vue.courante.focaliser();
          vue.edition.abandonner();
        }}
        suites={SUITES_D_UNE_CELLULE}
      />
    );
  }
  return <TexteDeCellule texte={texteAffiche(colonne, valeur)} />;
}

function CelluleDeDonnee(props: ProprietesCellule): ReactElement {
  const { vue, ligne, rang, colonne, rangDeColonne } = props;
  const place = { rang, colonne: rangDeColonne + 1 };
  const { place: courante } = vue.courante;
  return (
    <CelluleDeGrille
      role="gridcell"
      indiceDeColonne={rangDeColonne + 2}
      largeur={vue.proprietes.largeurDe(colonne.id)}
      courante={courante.rang === place.rang && courante.colonne === place.colonne}
      refCellule={vue.courante.refCellule(cleDeCellule(ligne.id, colonne.id))}
      surFocus={() => vue.courante.devenirCourante(place)}
      surDoubleClic={() => vue.edition.commencer(place)}
      raccourcis={raccourcisDeLaLigne(rang, vue.proprietes.lignes.length)}
    >
      <ContenuDeLaCellule {...props} />
    </CelluleDeGrille>
  );
}

function CelluleDActions(props: {
  readonly vue: VueTableau;
  readonly ligne: LigneLue;
  readonly rang: number;
}): ReactElement {
  const { vue, ligne, rang } = props;
  const cle = cleDeCellule(ligne.id, null);
  const place = { rang, colonne: 0 };
  const { place: courante } = vue.courante;
  const ouvert = vue.menu.ouvert?.cible;
  return (
    <CelluleDeGrille
      role="rowheader"
      indiceDeColonne={1}
      largeur={LARGEUR_DES_ACTIONS}
      courante={courante.rang === rang && courante.colonne === 0}
      refCellule={vue.courante.refCellule(cle)}
      surFocus={() => vue.courante.devenirCourante(place)}
      nom={nomDeLaLigne(rang)}
      sorte="actions"
      raccourcis={raccourcisDeLaLigne(rang, vue.proprietes.lignes.length)}
    >
      <TexteDeCellule texte={String(rang)} />
      <BoutonIcone
        nom={nomActionsDeLaLigne(rang)}
        pictogramme="points"
        lieu="rangee"
        tabIndex={-1}
        aria-haspopup="menu"
        aria-expanded={ouvert?.sorte === "ligne" && ouvert.ligne === ligne.id}
        onClick={(evenement) => {
          // Une saisie refusée reste ouverte : le menu ne s'ouvre pas par-dessus.
          if (vue.edition.garderLeFocus(evenement.currentTarget)) {
            return;
          }
          const element = vue.courante.elementDe(cle);
          vue.courante.devenirCourante(place);
          if (element !== undefined) {
            vue.menu.ouvrir({ sorte: "ligne", ligne: ligne.id }, element, vue.cadre.current);
          }
        }}
      />
    </CelluleDeGrille>
  );
}

function LigneDeLaGrille(props: {
  readonly vue: VueTableau;
  readonly ligne: LigneLue;
  readonly indice: number;
  readonly largeur: number;
}): ReactElement {
  const { vue, ligne, indice } = props;
  return (
    <RangeeDeGrille
      indice={indice + 2}
      decalage={indice * HAUTEUR_DE_RANGEE}
      hauteur={HAUTEUR_DE_RANGEE}
      largeur={props.largeur}
    >
      <CelluleDActions vue={vue} ligne={ligne} rang={indice + 1} />
      {vue.colonnes.map((colonne, rangDeColonne) => (
        <CelluleDeDonnee
          key={colonne.id}
          vue={vue}
          ligne={ligne}
          rang={indice + 1}
          colonne={colonne}
          rangDeColonne={rangDeColonne}
        />
      ))}
    </RangeeDeGrille>
  );
}

/** Indices des lignes que la grille garde rendues hors de la fenêtre : courante, en mode édition. */
function tenues(vue: VueTableau): number[] {
  const ouverte = vue.edition.edition;
  const enEdition =
    ouverte === undefined || ouverte.sorte === "nom"
      ? -1
      : vue.proprietes.lignes.findIndex(({ id }) => id === ouverte.ligne);
  return [vue.courante.place.rang - 1, enEdition];
}

export function RangeesDeLaGrille(props: {
  readonly vue: VueTableau;
  readonly largeur: number;
}): ReactElement {
  const { vue } = props;
  const { lignes } = vue.proprietes;
  return (
    <>
      {indicesRendus(vue.fenetre.courante, tenues(vue)).map((indice) => {
        const ligne = lignes[indice];
        return ligne === undefined ? null : (
          <LigneDeLaGrille
            key={ligne.id}
            vue={vue}
            ligne={ligne}
            indice={indice}
            largeur={props.largeur}
          />
        );
      })}
    </>
  );
}
