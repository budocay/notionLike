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
  readonly figees: readonly IdLigne[] | undefined;
}

export function useAffichage(
  table: DocumentTable,
  lue: TableLue | undefined,
  definition: Definition,
  vue: string,
): Affichage {
  const lecture = lue ?? TABLE_VIDE;
  const [figees, setFigees] = useState<readonly IdLigne[] | undefined>(undefined);
  const [suivi, setSuivi] = useState({ definition, vue });
  // Une définition modifiée ou une vue changée rend l'affichage au calcul (AC18).
  let figeesActuelles = figees;
  if (suivi.definition !== definition || suivi.vue !== vue) {
    setSuivi({ definition, vue });
    setFigees(undefined);
    figeesActuelles = undefined;
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
  const surveillee = useMemo(() => facadeSurveillee(table, dernier, setFigees), [table]);
  return {
    lignes,
    horsFiltre,
    fige: figeesActuelles !== undefined,
    reappliquer: () => setFigees(undefined),
    table: surveillee,
  };
}

/**
 * Ce que la façade surveillée fait de chaque membre de `DocumentTable` : `interceptee` (elle fige
 * l'affichage ou suit la liste figée, puis appelle la façade de la session) ou `transmise` (appel
 * direct). Typée sur toutes les clés : un membre ajouté à `DocumentTable` doit y être classé.
 */
export const CLASSEMENT_DE_LA_FACADE: Readonly<
  Record<keyof DocumentTable, "interceptee" | "transmise">
> = {
  doc: "transmise",
  lire: "transmise",
  abonner: "transmise",
  creerColonne: "transmise",
  renommerColonne: "transmise",
  deplacerColonne: "transmise",
  supprimerColonne: "transmise",
  ajouterOption: "transmise",
  renommerOption: "transmise",
  deplacerOption: "transmise",
  retirerOption: "transmise",
  creerLigne: "interceptee",
  deplacerLigne: "interceptee",
  supprimerLigne: "transmise",
  ecrireCellule: "interceptee",
  fermer: "transmise",
};

type Interceptees = "creerLigne" | "deplacerLigne" | "ecrireCellule";

// Chaque membre transmis de `DocumentTable` est repris à la main : la façade ne dépend ni de la forme
// de l'objet de la session ni de son prototype, et un membre ajouté à l'interface ne compile pas.
function transmises(table: DocumentTable): Omit<DocumentTable, Interceptees> {
  return {
    doc: table.doc,
    lire: () => table.lire(),
    abonner: (rappel) => table.abonner(rappel),
    creerColonne: (...parametres) => table.creerColonne(...parametres),
    renommerColonne: (...parametres) => table.renommerColonne(...parametres),
    deplacerColonne: (...parametres) => table.deplacerColonne(...parametres),
    supprimerColonne: (colonne) => table.supprimerColonne(colonne),
    ajouterOption: (...parametres) => table.ajouterOption(...parametres),
    renommerOption: (...parametres) => table.renommerOption(...parametres),
    deplacerOption: (...parametres) => table.deplacerOption(...parametres),
    retirerOption: (...parametres) => table.retirerOption(...parametres),
    supprimerLigne: (ligne) => table.supprimerLigne(ligne),
    fermer: () => table.fermer(),
  };
}

// Fige la liste avant une écriture de l'onglet si un élément de la définition a un effet ; rend de
// quoi défaire cet affichage figé si l'écriture est refusée.
export function facadeSurveillee(
  table: DocumentTable,
  dernier: { readonly current: Dernier },
  setFigees: (
    modifier: (avant: readonly IdLigne[] | undefined) => readonly IdLigne[] | undefined,
  ) => void,
): DocumentTable {
  const figer = (): (() => void) => {
    const { lecture, definition, ids, figees } = dernier.current;
    if (figees !== undefined || !aUnElementActif(lecture, definition)) {
      return () => undefined;
    }
    setFigees((avant) => avant ?? ids);
    return () => setFigees(() => undefined);
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
    ...transmises(table),
    ecrireCellule: (ligne, colonne, valeur) =>
      ecrire(() => table.ecrireCellule(ligne, colonne, valeur)),
    creerLigne: (valeurs, position) => {
      const creee = ecrire(() => table.creerLigne(valeurs, position));
      // Une ligne créée dans l'onglet s'affiche en dernière place (AC17).
      setFigees((avant) => (avant === undefined ? avant : [...avant, creee]));
      return creee;
    },
    // Sans `ecrire` : AC17 ne vise que la cellule écrite et la ligne créée, pas le déplacement.
    deplacerLigne: (ligne, position) => {
      const voisine = identifiantALaPosition(dernier.current.lecture, position);
      table.deplacerLigne(ligne, position);
      // Sous un affichage figé, la ligne prend la place de sa voisine dans la liste figée (AC19).
      if (voisine !== undefined) {
        setFigees((avant) => avant && deplacerDansLaListe(avant, ligne, voisine));
      }
    },
  };
}
