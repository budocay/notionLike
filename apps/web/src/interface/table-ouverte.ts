// Table ouverte par l'onglet (F-018-AC12, AC13, AC16, ADR-0019), symétrique de la page ouverte :
// la session de la table sélectionnée, ouverte quand la sélection paraît et fermée quand elle change
// ou disparaît. Au plus une à la fois.
import { useEffect, useState, useSyncExternalStore } from "react";

import type { EtatSessionTable, SessionTable } from "../table/session-table.ts";
import { creerTablesOuvertes, type TablesOuvertes } from "../table/tables-ouvertes.ts";

/** État de la table sélectionnée ; `undefined` quand aucune table ne l'est. */
export type EtatDeLaTable = EtatSessionTable | undefined;

const CHARGEMENT_AVANT_L_OUVERTURE: EtatSessionTable = { phase: "chargement" };
const SANS_ABONNEMENT = (): (() => void) => () => undefined;

interface Ouverte {
  readonly idTable: string;
  readonly session: SessionTable;
}

// Les documents de table de l'onglet vivent autant que l'écran de l'espace : les fermer libère
// aussi ceux qu'une coupure faisait conserver. La suppression définitive les reçoit pour fermer ceux
// d'une table supprimée avant d'effacer sa base (F-018-AC49).
export function useTablesOuvertes(): TablesOuvertes {
  const [tables] = useState(creerTablesOuvertes);
  useEffect(() => () => tables.fermer(), [tables]);
  return tables;
}

/**
 * Ouvre la table désignée par l'espace et son identifiant, qui vont tous deux au module de
 * persistance (F-018-AC13). La session naît dans un effet : rien n'est ouvert pendant le rendu.
 */
export function useTableOuverte(
  tables: TablesOuvertes,
  idEspace: string | undefined,
  idTable: string | undefined,
): EtatDeLaTable {
  const [ouverte, setOuverte] = useState<Ouverte | undefined>(undefined);
  useEffect(() => {
    if (idTable === undefined) {
      return undefined;
    }
    const session = tables.ouvrir({ idEspace, idTable });
    setOuverte({ idTable, session });
    return () => {
      session.fermer();
      setOuverte(undefined);
    };
  }, [tables, idEspace, idTable]);
  // Entre le rendu qui change de table et l'effet qui ouvre la suivante, la session tenue est celle
  // de la table quittée : son contenu n'est jamais montré sous une autre table.
  const session = ouverte?.idTable === idTable ? ouverte?.session : undefined;
  const etat = useSyncExternalStore(
    session?.abonner ?? SANS_ABONNEMENT,
    () => session?.lireEtat() ?? CHARGEMENT_AVANT_L_OUVERTURE,
  );
  return idTable === undefined ? undefined : etat;
}
