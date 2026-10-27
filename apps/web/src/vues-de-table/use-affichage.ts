// Les lignes affichées d'une table et l'affichage figé (F-019-AC13 à AC18, H6). La liste est
// recalculée seulement quand la table lue, la définition ou l'état figé change, jamais au défilement
// (AC28). La première modification faite depuis l'onglet (cellule écrite, ligne créée), sous un
// filtre ou un tri actif, fige la liste : elle ne change plus que par suppression et par création
// locale, jusqu'à « Réappliquer », un changement de définition, un changement de vue ou une
// réouverture de la table. Les écritures de l'onglet sont reconnues à la façade que ce hook rend aux
// vues : une mise à jour reçue n'y passe pas.
import type { DocumentTable, IdLigne, LigneLue, TableLue } from "@notionlike/document";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Definition } from "./definition.ts";
import {
  aUnElementActif,
  deplacerDansLaListe,
  identifiantALaPosition,
  lignesAffichees,
  lignesFigees,
  lignesHorsFiltre,
} from "./lignes-affichees.ts";

const TABLE_VIDE: TableLue = { colonnes: [], lignes: [] };
const AUCUNE_LIGNE: ReadonlySet<IdLigne> = new Set();

export interface Affichage {
  readonly lignes: readonly LigneLue[];
  /** Les lignes affichées qui ne satisfont plus les filtres : seulement quand l'affichage est figé. */
  readonly horsFiltre: ReadonlySet<IdLigne>;
  readonly fige: boolean;
  readonly reappliquer: () => void;
  /** La façade du document que les vues écrivent : ses écritures figent l'affichage. */
  readonly table: DocumentTable;
}

interface Dernier {
  readonly lecture: TableLue;
  readonly definition: Definition;
  readonly ids: readonly IdLigne[];
  readonly gele: readonly IdLigne[] | undefined;
}

export function useAffichage(
  table: DocumentTable,
  lue: TableLue | undefined,
  definition: Definition,
  vue: string,
): Affichage {
  const lecture = lue ?? TABLE_VIDE;
  const [gele, setGele] = useState<readonly IdLigne[] | undefined>(undefined);
  const [suivi, setSuivi] = useState({ definition, vue });
  // Une définition modifiée ou une vue changée rend l'affichage au calcul (AC18).
  let geleActuel = gele;
  if (suivi.definition !== definition || suivi.vue !== vue) {
    setSuivi({ definition, vue });
    setGele(undefined);
    geleActuel = undefined;
  }
  const lignes = useMemo(
    () =>
      geleActuel === undefined
        ? lignesAffichees(lecture, definition)
        : lignesFigees(lecture, geleActuel),
    [lecture, definition, geleActuel],
  );
  const horsFiltre = useMemo(
    () => (geleActuel === undefined ? AUCUNE_LIGNE : lignesHorsFiltre(lecture, definition, lignes)),
    [lecture, definition, geleActuel, lignes],
  );
  const dernier = useRef<Dernier>({ lecture, definition, ids: [], gele: geleActuel });
  useLayoutEffect(() => {
    dernier.current = { lecture, definition, ids: lignes.map(({ id }) => id), gele: geleActuel };
  });
  const surveillee = useMemo(() => facadeSurveillee(table, dernier, setGele), [table]);
  return {
    lignes,
    horsFiltre,
    fige: geleActuel !== undefined,
    reappliquer: () => setGele(undefined),
    table: surveillee,
  };
}

// Fige la liste avant une écriture de l'onglet si un élément de la définition a un effet ; rend de
// quoi défaire ce gel si l'écriture est refusée.
function facadeSurveillee(
  table: DocumentTable,
  dernier: { readonly current: Dernier },
  setGele: (
    modifier: (avant: readonly IdLigne[] | undefined) => readonly IdLigne[] | undefined,
  ) => void,
): DocumentTable {
  const figer = (): (() => void) => {
    const { lecture, definition, ids, gele } = dernier.current;
    if (gele !== undefined || !aUnElementActif(lecture, definition)) {
      return () => undefined;
    }
    setGele((avant) => avant ?? ids);
    return () => setGele(() => undefined);
  };
  const ecrire = <T>(operation: () => T): T => {
    const defaire = figer();
    try {
      return operation();
    } catch (erreur) {
      defaire();
      throw erreur;
    }
  };
  return {
    ...table,
    ecrireCellule: (ligne, colonne, valeur) =>
      ecrire(() => table.ecrireCellule(ligne, colonne, valeur)),
    creerLigne: (valeurs, position) => {
      const creee = ecrire(() => table.creerLigne(valeurs, position));
      // Une ligne créée dans l'onglet s'affiche en dernière place (AC17).
      setGele((avant) => (avant === undefined ? avant : [...avant, creee]));
      return creee;
    },
    // Sans `ecrire` : AC17 ne vise que la cellule écrite et la ligne créée, pas le déplacement.
    deplacerLigne: (ligne, position) => {
      const voisine = identifiantALaPosition(dernier.current.lecture, position);
      table.deplacerLigne(ligne, position);
      // Sous un affichage figé, la ligne prend la place de sa voisine dans la liste figée (AC19).
      if (voisine !== undefined) {
        setGele((avant) => avant && deplacerDansLaListe(avant, ligne, voisine));
      }
    },
  };
}
