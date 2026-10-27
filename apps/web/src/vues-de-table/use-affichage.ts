// Les lignes affichées d'une table et l'affichage figé (F-019-AC13 à AC18, H6). La liste est
// recalculée seulement quand la table lue, la définition ou l'état figé change, jamais au défilement
// (AC28). La première modification faite depuis l'onglet (cellule écrite, ligne créée), sous un
// filtre ou un tri actif, fige la liste : elle ne change plus que par suppression et par création
// locale, jusqu'à « Réappliquer », un changement de définition, un changement de vue ou une
// réouverture de la table. Les écritures de l'onglet sont signalées par la `Surveillance` que
// l'entonnoir `ecrire` appelle : une mise à jour reçue n'y passe pas. Les transitions sont dans
// `etatFigeApres` (fonction pure) ; ce hook ne tient que l'état React.
import type { IdLigne, LigneLue, TableLue } from "@notionlike/document";
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { Definition } from "./definition.ts";
import type { Surveillance } from "./ecritures.ts";
import {
  aUnElementActif,
  type EtatFige,
  etatFigeApres,
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
  /** Ce que les vues passent à `ecrire` pour que leurs écritures figent l'affichage. */
  readonly surveillance: Surveillance;
}

interface Dernier {
  readonly lecture: TableLue;
  readonly definition: Definition;
  readonly ids: readonly IdLigne[];
  readonly figees: EtatFige;
}

export function useAffichage(
  lue: TableLue | undefined,
  definition: Definition,
  vue: string,
): Affichage {
  const lecture = lue ?? TABLE_VIDE;
  const [figees, setFigees] = useState<EtatFige>(undefined);
  const [suivi, setSuivi] = useState({ definition, vue });
  // Une définition modifiée ou une vue changée rend l'affichage au calcul (AC18).
  let figeesActuelles = figees;
  if (suivi.definition !== definition || suivi.vue !== vue) {
    setSuivi({ definition, vue });
    setFigees((avant) => etatFigeApres(avant, { sorte: "recalcul" }));
    figeesActuelles = etatFigeApres(figees, { sorte: "recalcul" });
  }
  const lignes = useMemo(
    () =>
      figeesActuelles === undefined
        ? lignesAffichees(lecture, definition)
        : lignesFigees(lecture, figeesActuelles),
    [lecture, definition, figeesActuelles],
  );
  const horsFiltre = useMemo(
    () =>
      figeesActuelles === undefined ? AUCUNE_LIGNE : lignesHorsFiltre(lecture, definition, lignes),
    [lecture, definition, figeesActuelles, lignes],
  );
  const dernier = useRef<Dernier>({ lecture, definition, ids: [], figees: figeesActuelles });
  useLayoutEffect(() => {
    dernier.current = {
      lecture,
      definition,
      ids: lignes.map(({ id }) => id),
      figees: figeesActuelles,
    };
  });
  const surveillance = useMemo(() => surveillanceDe(dernier, setFigees), []);
  return {
    lignes,
    horsFiltre,
    fige: figeesActuelles !== undefined,
    reappliquer: () => setFigees((avant) => etatFigeApres(avant, { sorte: "recalcul" })),
    surveillance,
  };
}

function surveillanceDe(
  dernier: RefObject<Dernier>,
  setFigees: Dispatch<SetStateAction<EtatFige>>,
): Surveillance {
  return {
    avant: () => {
      const { lecture, definition, ids, figees } = dernier.current;
      setFigees((avant) =>
        etatFigeApres(avant, {
          sorte: "ecriture",
          ids,
          actif: aUnElementActif(lecture, definition),
        }),
      );
      return () => setFigees((avant) => etatFigeApres(avant, { sorte: "refusee", avant: figees }));
    },
    creee: (ligne) => setFigees((avant) => etatFigeApres(avant, { sorte: "creee", ligne })),
    deplacee: (ligne, voisine) =>
      setFigees((avant) => etatFigeApres(avant, { sorte: "deplacee", ligne, voisine })),
  };
}
