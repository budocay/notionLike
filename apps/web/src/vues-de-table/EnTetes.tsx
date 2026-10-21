// Rangée d'en-têtes de la grille (F-018-AC19, AC20, AC22, AC34) : la cellule d'angle de la colonne
// des actions, puis un en-tête par colonne, son nom sur une ligne, sa commande « ⋯ » et, en mode
// édition, le champ de son nom.
import type { ColonneLue } from "@notionlike/document";
import type { ReactElement } from "react";

import { BoutonIcone } from "../interface/composants/BoutonIcone.tsx";
import { CelluleDeGrille, RangeeDEnTetes, TexteDeCellule } from "../interface/composants/Table.tsx";
import { ChampDEdition } from "./ChampDEdition.tsx";
import { cleDeCellule } from "./courante.ts";
import { HAUTEUR_DE_RANGEE, LARGEUR_DES_ACTIONS } from "./grille.ts";
import {
  ACTIONS_DES_LIGNES,
  nomActionsDeLaColonne,
  nomAffiche,
  nomDuChampDeNom,
} from "./textes.ts";
import type { VueTableau } from "./use-vue-tableau.ts";

const SUITES_DU_NOM = { entree: "rester", tab: "rester", tabArriere: "rester" } as const;

function NomEnSaisie({ vue, colonne }: { readonly vue: VueTableau; readonly colonne: ColonneLue }) {
  const ouverte = vue.edition.edition;
  if (ouverte?.sorte !== "nom" || ouverte.colonne !== colonne.id) {
    return null;
  }
  return (
    <ChampDEdition
      nom={nomDuChampDeNom(colonne.nom)}
      texte={ouverte.texte}
      date={false}
      idFaute={ouverte.erreur === undefined ? undefined : vue.idAlerte}
      changer={vue.edition.changerTexte}
      valider={vue.edition.valider}
      abandonner={() => {
        vue.courante.focaliser();
        vue.edition.abandonner();
      }}
      suites={SUITES_DU_NOM}
    />
  );
}

function EnTeteDeColonne(props: {
  readonly vue: VueTableau;
  readonly colonne: ColonneLue;
  readonly rang: number;
}): ReactElement {
  const { vue, colonne, rang } = props;
  const cle = cleDeCellule(null, colonne.id);
  const place = { rang: 0, colonne: rang + 1 };
  const { place: courante } = vue.courante;
  const ouvert = vue.menu.ouvert?.cible;
  const enSaisie =
    vue.edition.edition?.sorte === "nom" && vue.edition.edition.colonne === colonne.id;
  return (
    <CelluleDeGrille
      role="columnheader"
      indiceDeColonne={rang + 2}
      largeur={vue.proprietes.largeurDe(colonne.id)}
      courante={courante.rang === 0 && courante.colonne === rang + 1}
      refCellule={vue.courante.refCellule(cle)}
      surFocus={() => vue.courante.devenirCourante(place)}
    >
      {enSaisie ? (
        <NomEnSaisie vue={vue} colonne={colonne} />
      ) : (
        <>
          <TexteDeCellule texte={nomAffiche(colonne.nom)} />
          <BoutonIcone
            nom={nomActionsDeLaColonne(colonne.nom)}
            pictogramme="points"
            lieu="rangee"
            tabIndex={-1}
            aria-haspopup="menu"
            aria-expanded={ouvert?.sorte === "colonne" && ouvert.colonne === colonne.id}
            onClick={() => {
              const element = vue.courante.elementDe(cle);
              vue.courante.devenirCourante(place);
              if (element !== undefined) {
                vue.menu.ouvrir(
                  { sorte: "colonne", colonne: colonne.id },
                  element,
                  vue.cadre.current,
                );
              }
            }}
          />
        </>
      )}
    </CelluleDeGrille>
  );
}

export function RangeeDesEnTetes({ vue }: { readonly vue: VueTableau }): ReactElement {
  const { place } = vue.courante;
  return (
    <RangeeDEnTetes hauteur={HAUTEUR_DE_RANGEE}>
      <CelluleDeGrille
        role="columnheader"
        indiceDeColonne={1}
        largeur={LARGEUR_DES_ACTIONS}
        courante={place.rang === 0 && place.colonne === 0}
        refCellule={vue.courante.refCellule(cleDeCellule(null, null))}
        surFocus={() => vue.courante.devenirCourante({ rang: 0, colonne: 0 })}
        nom={ACTIONS_DES_LIGNES}
        sorte="actions"
      />
      {vue.colonnes.map((colonne, rang) => (
        <EnTeteDeColonne key={colonne.id} vue={vue} colonne={colonne} rang={rang} />
      ))}
    </RangeeDEnTetes>
  );
}
