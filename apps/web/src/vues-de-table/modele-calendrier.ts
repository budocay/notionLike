// Ce que la vue calendrier lit de la table lue (F-021-AC5, AC6, AC8) pour le mois affiché : la colonne
// de date, la colonne de titre, la grille et la répartition des lignes. Rien n'y écrit.
import type { ColonneLue, IdColonne, IdLigne, LigneLue, TableLue } from "@notionlike/document";
import { useMemo } from "react";

import { grilleDuMois, type MoisAffiche } from "./jours.ts";
import { colonneDeTitre } from "./lignes-affichees.ts";
import { type ColonneDeDate, colonneDeDate, type Repartition, repartir } from "./repartition.ts";
import { libelleDeLEntree } from "./textes-calendrier.ts";

export interface ModeleDuCalendrier {
  readonly dateVisee: ColonneDeDate | undefined;
  readonly titreDeColonne: ColonneLue | undefined;
  /** Rang de la colonne de titre dans la table lue, -1 s'il n'y en a pas. */
  readonly rangDuTitre: number;
  readonly grille: readonly string[];
  readonly repartition: Repartition;
  /** Libellé d'une entrée : sa cellule de titre, ou « Sans titre ». */
  readonly libelleDe: (ligne: LigneLue) => string;
  readonly ligneDe: (id: IdLigne) => LigneLue | undefined;
  /** Le jour de la grille dont la case porte cette ligne ; `undefined` si elle n'est dans aucune. */
  readonly jourDansLaGrille: (id: IdLigne) => string | undefined;
}

export function useModeleDuCalendrier(
  lue: TableLue,
  lignes: readonly LigneLue[],
  choisie: IdColonne | undefined,
  mois: MoisAffiche,
): ModeleDuCalendrier {
  const dateVisee = colonneDeDate(lue.colonnes, choisie);
  const titreDeColonne = colonneDeTitre(lue);
  const rangDuTitre =
    titreDeColonne === undefined
      ? -1
      : lue.colonnes.findIndex(({ id }) => id === titreDeColonne.id);
  const grille = useMemo(() => grilleDuMois(mois), [mois]);
  const rangDeDate = dateVisee?.rang ?? -1;
  const repartition = useMemo(
    () => repartir(lignes, rangDeDate, grille),
    [lignes, rangDeDate, grille],
  );
  return {
    dateVisee,
    titreDeColonne,
    rangDuTitre,
    grille,
    repartition,
    libelleDe: (ligne) => {
      const valeur = rangDuTitre < 0 ? undefined : ligne.cellules[rangDuTitre];
      return libelleDeLEntree(typeof valeur === "string" ? valeur : undefined);
    },
    ligneDe: (id) => lignes.find((une) => une.id === id),
    jourDansLaGrille: (id) =>
      [...repartition.parJour].find(([, entrees]) => entrees.some((une) => une.id === id))?.[0],
  };
}
