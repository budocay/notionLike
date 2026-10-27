// Vue « Kanban » (F-020-AC1 à AC8) : une pile par option d'une colonne Sélection, les lignes en
// cartes, le déplacement au pointeur et au clavier. Les lignes viennent de la fonction des lignes
// affichées (F-018-AC45) ; le document n'est écrit que par la façade `DocumentTable`.
import type {
  ColonneLue,
  DocumentTable,
  LigneLue,
  TableLue,
  TypeDeColonne,
} from "@notionlike/document";
import { type ReactElement, type ReactNode, useRef, useState } from "react";

import { Bouton, Choix } from "../../interface/composants/Espaces.tsx";
import { PlateauDeKanban } from "../../interface/composants/Kanban.tsx";
import { MenuActions } from "../../interface/composants/MenuActions.tsx";
import {
  EcranDeTableCadre,
  InvitationDeTable,
  SurfaceFlottante,
} from "../../interface/composants/Table.tsx";
import { creerUneColonne } from "../actions.ts";
import { BoiteNouvelleColonne, Confirmation } from "../Boites.tsx";
import { nomAffiche, SUPPRIMER_LA_LIGNE, TEXTE_DE_LA_SUPPRESSION_DE_LIGNE } from "../textes.ts";
import { surToucheDuKanban } from "./clavier-kanban.ts";
import { entreesDeCarte } from "./entrees.ts";
import { PilesDuKanban } from "./PilesDuKanban.tsx";
import {
  AJOUTER_UNE_COLONNE_SELECTION,
  INVITATION_SANS_SELECTION,
  nomDeLaVue,
  nomDesActions,
  REGROUPER_PAR,
  titreDeLaSuppression,
} from "./textes.ts";
import { type Regroupement, useRegroupement } from "./use-regroupement.ts";
import { useVueKanban, type VueKanban as Vue } from "./use-vue-kanban.ts";

export interface ProprietesVueKanban {
  readonly table: DocumentTable;
  readonly lue: TableLue;
  readonly lignes: readonly LigneLue[];
  readonly titre: string;
  readonly lectureSeule: string | undefined;
  /** Espace et table : ils désignent les réglages de vue de l'appareil (F-020-AC4). */
  readonly designation: { readonly idEspace: string | undefined; readonly idTable: string };
  readonly selecteur: ReactNode;
}

function OutilsDuKanban(props: {
  readonly selecteur: ReactNode;
  readonly regroupement: Regroupement;
}): ReactElement {
  const { choix, colonne, choisir } = props.regroupement;
  return (
    <>
      {props.selecteur}
      {choix.length >= 2 && (
        <Choix
          nom={REGROUPER_PAR}
          valeur={colonne?.id ?? ""}
          options={choix.map(({ id, nom }) => ({
            valeur: id,
            libelle: `${REGROUPER_PAR} ${nomAffiche(nom)}`,
          }))}
          surChoix={choisir}
        />
      )}
    </>
  );
}

function MenuDeCarte({ vue }: { readonly vue: Vue }): ReactElement | null {
  const ouvert = vue.menu.ouvert;
  if (ouvert?.cible.sorte !== "ligne") {
    return null;
  }
  const { ligne } = ouvert.cible;
  const carte = vue.piles.flatMap((pile) => pile.cartes).find(({ id }) => id === ligne);
  if (carte === undefined) {
    return null;
  }
  const { ancre } = ouvert;
  return (
    <SurfaceFlottante x={ancre.x} y={ancre.y} largeur={ancre.largeur} hauteur={ancre.hauteur}>
      <MenuActions
        ref={vue.menu.surface}
        nom={nomDesActions(carte.titre)}
        entrees={entreesDeCarte(vue.commandesDe(ligne, carte.titre))}
      />
    </SurfaceFlottante>
  );
}

function SuppressionDeCarte({ vue }: { readonly vue: Vue }): ReactElement | null {
  const ligne = vue.suppression.carte;
  const carte = vue.piles.flatMap((pile) => pile.cartes).find(({ id }) => id === ligne);
  if (carte === undefined) {
    return null;
  }
  return (
    <Confirmation
      titre={titreDeLaSuppression(carte.titre)}
      phrases={TEXTE_DE_LA_SUPPRESSION_DE_LIGNE}
      confirmer={SUPPRIMER_LA_LIGNE}
      fermer={() => vue.suppression.fermer(true)}
      surConfirmation={vue.confirmerLaSuppression}
    />
  );
}

function TableauDeKanban(
  props: ProprietesVueKanban & {
    readonly regroupement: Regroupement;
    /** La colonne de regroupement, déjà résolue : le plateau n'est rendu que s'il y en a une. */
    readonly colonne: ColonneLue;
  },
): ReactElement {
  const { colonne } = props;
  const vue = useVueKanban({
    table: props.table,
    lue: props.lue,
    lignes: props.lignes,
    regroupement: colonne,
    lectureSeule: props.lectureSeule,
  });
  return (
    <EcranDeTableCadre
      outils={<OutilsDuKanban selecteur={props.selecteur} regroupement={props.regroupement} />}
      annonce={vue.annonce}
      alerte={vue.alerte}
      idAlerte={vue.idAlerte}
    >
      <PlateauDeKanban
        nom={nomDeLaVue(props.titre, colonne.nom)}
        refCadre={vue.cadre}
        surTouche={(evenement) => surToucheDuKanban(vue, evenement)}
        flottante={<MenuDeCarte vue={vue} />}
      >
        <PilesDuKanban vue={vue} />
      </PlateauDeKanban>
      <SuppressionDeCarte vue={vue} />
    </EcranDeTableCadre>
  );
}

// Le message du refus de la création, ou `undefined` si la colonne est créée.
function refusDeLaColonne(
  moyens: Pick<ProprietesVueKanban, "table" | "lectureSeule">,
  nom: string,
  type: TypeDeColonne,
): string | undefined {
  const creee = creerUneColonne(moyens, nom, type);
  return "refus" in creee ? creee.refus : undefined;
}

// Sans colonne Sélection, la vue invite à en ajouter une et n'en crée aucune d'elle-même (AC5).
function SansColonneDeSelection(props: ProprietesVueKanban): ReactElement {
  const [ouverte, setOuverte] = useState(false);
  const origine = useRef<HTMLButtonElement>(null);
  return (
    <EcranDeTableCadre outils={props.selecteur} annonce="">
      <InvitationDeTable texte={INVITATION_SANS_SELECTION}>
        <Bouton
          refBouton={origine}
          libelle={AJOUTER_UNE_COLONNE_SELECTION}
          raison={props.lectureSeule}
          surActivation={() => setOuverte(true)}
        />
      </InvitationDeTable>
      {ouverte && (
        <BoiteNouvelleColonne
          ajouter={(nom, type) => refusDeLaColonne(props, nom, type)}
          typeInitial="selection"
          fermerLaBoite={(rendre) => {
            setOuverte(false);
            if (rendre) {
              queueMicrotask(() => origine.current?.focus());
            }
          }}
        />
      )}
    </EcranDeTableCadre>
  );
}

export function VueKanban(props: ProprietesVueKanban): ReactElement {
  const regroupement = useRegroupement(props.designation, props.lue);
  const { colonne } = regroupement;
  return colonne === undefined ? (
    <SansColonneDeSelection {...props} />
  ) : (
    <TableauDeKanban {...props} regroupement={regroupement} colonne={colonne} />
  );
}
