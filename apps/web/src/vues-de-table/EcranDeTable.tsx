// Écran de table (F-018-AC12 à AC17, ADR-0019) : ce que la zone principale affiche sous le titre
// quand la page sélectionnée est une table. Il reçoit l'état de la session de table et ne touche au
// document que par la façade `DocumentTable` qu'elle lui donne : ni yjs, ni type partagé (AC54).
import type { DocumentTable, TableLue } from "@notionlike/document";
import { type ReactElement, useSyncExternalStore } from "react";

import { NoteDePage } from "../interface/composants/Edition.tsx";
import { Chargement } from "../interface/composants/Etats.tsx";
import { SelecteurDeVues } from "../interface/composants/Table.tsx";
import type { EtatSessionTable } from "../table/session-table.ts";
import { nombreDeLignes } from "./lignes-affichees.ts";
import {
  CHARGEMENT_DE_LA_TABLE,
  SELECTEUR_DE_VUES,
  TABLE_DE_VERSION_NON_PRISE_EN_CHARGE,
  TABLE_ILLISIBLE,
} from "./textes.ts";
import { VueKanban } from "./kanban/VueKanban.tsx";
import { compilerLesTris, triDeLaColonne } from "./tris.ts";
import { useAffichage } from "./use-affichage.ts";
import { useReglages } from "./use-reglages.ts";
import { avecSelecteur, VUE_CALENDRIER_ID, VUE_KANBAN, VUES } from "./vues.ts";
import { VueCalendrier } from "./VueCalendrier.tsx";
import { VueTableau } from "./VueTableau.tsx";

export interface ProprietesEcranDeTable {
  readonly etat: EtatSessionTable;
  /** Espace et table : ils désignent les réglages de vue de l'appareil (AC40). */
  readonly idEspace: string | undefined;
  readonly idTable: string;
  /** Titre affiché de la table : il nomme la grille. */
  readonly titre: string;
  /** Raison qui désactive toute action qui écrit dans le document de table (F-018-AC52). */
  readonly lectureSeule?: string | undefined;
}

/** La table lue, ou `undefined` si la façade refuse désormais le document. */
function lectureDe(table: DocumentTable): TableLue | undefined {
  try {
    return table.lire();
  } catch {
    return undefined;
  }
}

type Reglages = ReturnType<typeof useReglages>;

// F-018-AC44 : la vue enregistrée absente de la liste est lue « Tableau », la première.
function selecteurDe(reglages: Reglages): ReactElement | undefined {
  return avecSelecteur() ? (
    <SelecteurDeVues
      nom={SELECTEUR_DE_VUES}
      vues={VUES}
      active={reglages.vueActive}
      surChoix={reglages.choisirLaVue}
    />
  ) : undefined;
}

function TableAffichee(props: ProprietesEcranDeTable & { readonly table: DocumentTable }) {
  const { table } = props;
  const lue = useSyncExternalStore(table.abonner, () => lectureDe(table));
  const reglages = useReglages(props, lue?.colonnes.map(({ id }) => id) ?? []);
  const { definition } = reglages;
  const affichage = useAffichage(lue, definition, reglages.vueActive);
  if (lue === undefined) {
    return <NoteDePage texte={TABLE_DE_VERSION_NON_PRISE_EN_CHARGE} />;
  }
  const selecteur = selecteurDe(reglages);
  if (reglages.vueActive === VUE_CALENDRIER_ID) {
    return (
      <VueCalendrier
        table={table}
        lue={lue}
        lignes={affichage.lignes}
        titre={props.titre}
        lectureSeule={props.lectureSeule}
        surveillance={affichage.surveillance}
        idEspace={props.idEspace}
        idTable={props.idTable}
        selecteur={selecteur}
      />
    );
  }
  if (reglages.vueActive === VUE_KANBAN) {
    return (
      <VueKanban
        table={table}
        lue={lue}
        lignes={affichage.lignes}
        titre={props.titre}
        lectureSeule={props.lectureSeule}
        designation={props}
        selecteur={selecteur}
        surveillance={affichage.surveillance}
        triActif={compilerLesTris(lue, definition.tris).length > 0}
      />
    );
  }
  // F-018-AC44 : la vue enregistrée absente de la liste est lue « Tableau ».
  return (
    <TableauAffiche
      {...props}
      lue={lue}
      reglages={reglages}
      affichage={affichage}
      selecteur={selecteur}
    />
  );
}

interface ProprietesTableauAffiche extends ProprietesEcranDeTable {
  readonly table: DocumentTable;
  readonly lue: TableLue;
  readonly reglages: ReturnType<typeof useReglages>;
  readonly affichage: ReturnType<typeof useAffichage>;
  readonly selecteur: ReactElement | undefined;
}

/** La vue Tableau : la définition de vue, les tris compilés et les largeurs de colonnes. */
function TableauAffiche(props: ProprietesTableauAffiche) {
  const { table, lue, reglages, affichage, selecteur } = props;
  const { definition } = reglages;
  const tris = compilerLesTris(lue, definition.tris);
  return (
    <VueTableau
      table={table}
      lue={lue}
      lignes={affichage.lignes}
      definition={{
        definition,
        changer: reglages.changerLaDefinition,
        total: nombreDeLignes(lue),
        fige: affichage.fige,
        reappliquer: affichage.reappliquer,
        horsFiltre: affichage.horsFiltre,
        triActif: tris.length > 0,
        triDe: (colonne) => triDeLaColonne(tris, colonne),
        surveillance: affichage.surveillance,
      }}
      titre={props.titre}
      lectureSeule={props.lectureSeule}
      largeurDe={reglages.largeurDe}
      reglerLargeur={reglages.reglerLargeur}
      selecteur={selecteur}
    />
  );
}

export function EcranDeTable(props: ProprietesEcranDeTable): ReactElement | null {
  const { etat } = props;
  switch (etat.phase) {
    case "introuvable":
      return null;
    case "chargement":
      return <Chargement texte={CHARGEMENT_DE_LA_TABLE} />;
    case "version-non-prise-en-charge":
      return <NoteDePage texte={TABLE_DE_VERSION_NON_PRISE_EN_CHARGE} />;
    case "illisible":
      return <NoteDePage texte={TABLE_ILLISIBLE} />;
    case "pret":
      return <TableAffichee {...props} table={etat.table} />;
  }
}
