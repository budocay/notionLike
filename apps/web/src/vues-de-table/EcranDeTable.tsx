// Écran de table (F-018-AC12 à AC17, ADR-0019) : ce que la zone principale affiche sous le titre
// quand la page sélectionnée est une table. Il reçoit l'état de la session de table et ne touche au
// document que par la façade `DocumentTable` qu'elle lui donne : ni yjs, ni type partagé (AC54).
import type { DocumentTable, TableLue } from "@notionlike/document";
import { type ReactElement, useSyncExternalStore } from "react";

import { NoteDePage } from "../interface/composants/Edition.tsx";
import { Chargement } from "../interface/composants/Etats.tsx";
import type { EtatSessionTable } from "../table/session-table.ts";
import { lignesAffichees } from "./lignes-affichees.ts";
import { LARGEUR_PAR_DEFAUT } from "./reglages.ts";
import {
  CHARGEMENT_DE_LA_TABLE,
  TABLE_DE_VERSION_NON_PRISE_EN_CHARGE,
  TABLE_ILLISIBLE,
} from "./textes.ts";
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

function TableAffichee(props: ProprietesEcranDeTable & { readonly table: DocumentTable }) {
  const { table } = props;
  const lue = useSyncExternalStore(table.abonner, () => lectureDe(table));
  if (lue === undefined) {
    return <NoteDePage texte={TABLE_DE_VERSION_NON_PRISE_EN_CHARGE} />;
  }
  return (
    <VueTableau
      table={table}
      lue={lue}
      lignes={lignesAffichees(lue)}
      titre={props.titre}
      lectureSeule={props.lectureSeule}
      largeurDe={() => LARGEUR_PAR_DEFAUT}
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
