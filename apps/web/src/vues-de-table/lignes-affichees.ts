// Ce que les vues partagent (F-018-AC45) : les lignes affichées et la colonne de titre, calculées
// sans DOM ni bibliothèque depuis la table lue et la définition de filtres et de tris (F-019-AC13).
// Toute vue reçoit les lignes par la première, jamais `table.lignes`.
import type { ColonneLue, IdLigne, LigneLue, TableLue } from "@notionlike/document";

import { DEFINITION_VIDE, type Definition } from "./definition.ts";
import { compilerLesFiltres, satisfaitLesFiltres } from "./filtres.ts";
import { comparerLesLignes, compilerLesTris, ranger } from "./tris.ts";

/**
 * Les lignes de la table lue qui satisfont tous les filtres actifs, rangées par les tris actifs,
 * les égalités départagées par l'ordre manuel (AC2, AC10). Une définition vide ou faite des seuls
 * éléments inactifs rend exactement la table lue, dans l'ordre manuel (AC13).
 */
export function lignesAffichees(
  table: TableLue,
  definition: Definition = DEFINITION_VIDE,
): readonly LigneLue[] {
  const filtres = compilerLesFiltres(table, definition.filtres);
  const tris = compilerLesTris(table, definition.tris);
  if (filtres.length === 0 && tris.length === 0) {
    return table.lignes;
  }
  const retenues = table.lignes
    .map((ligne, ordre) => ({ ligne, ordre }))
    .filter(({ ligne }) => satisfaitLesFiltres(ligne, filtres))
    .map(({ ligne, ordre }) => ranger(ligne, ordre, tris));
  if (tris.length > 0) {
    retenues.sort(comparerLesLignes(tris));
  }
  return retenues.map(({ ligne }) => ligne);
}

/** Vrai si au moins un filtre ou un tri de la définition a un effet sur cette table lue (AC17). */
export function aUnElementActif(table: TableLue, definition: Definition): boolean {
  return (
    compilerLesFiltres(table, definition.filtres).length > 0 ||
    compilerLesTris(table, definition.tris).length > 0
  );
}

/** Les lignes de la table lue qui ne satisfont plus les filtres actifs, parmi `ids` (AC18). */
export function lignesHorsFiltre(
  table: TableLue,
  definition: Definition,
  affichees: readonly LigneLue[],
): ReadonlySet<IdLigne> {
  const filtres = compilerLesFiltres(table, definition.filtres);
  return new Set(
    filtres.length === 0
      ? []
      : affichees.filter((ligne) => !satisfaitLesFiltres(ligne, filtres)).map(({ id }) => id),
  );
}

/**
 * Les lignes d'un affichage figé (AC17) : les lignes de `ids` encore dans la table lue, dans leur
 * ordre, avec leur contenu du moment ; celles que la table ne porte plus ont disparu.
 */
export function lignesFigees(table: TableLue, ids: readonly IdLigne[]): readonly LigneLue[] {
  const presentes = new Map(table.lignes.map((ligne) => [ligne.id, ligne]));
  return ids.flatMap((id) => {
    const ligne = presentes.get(id);
    return ligne === undefined ? [] : [ligne];
  });
}

/** La première colonne de type `texte` dans l'ordre des colonnes, s'il y en a une. */
export function colonneDeTitre(table: TableLue): ColonneLue | undefined {
  return table.colonnes.find((colonne) => colonne.type === "texte");
}

/** Le nombre de lignes de la table lue, masquées par un filtre ou non. */
export function nombreDeLignes(table: TableLue): number {
  return table.lignes.length;
}

/** L'identifiant de la ligne qui occupe aujourd'hui cette position de l'ordre manuel. */
export function identifiantALaPosition(table: TableLue, position: number): IdLigne | undefined {
  return table.lignes[position]?.id;
}

/** `ids` où `ligne` prend la place qu'occupe `voisine`, comme le document place une ligne déplacée. */
export function deplacerDansLaListe(
  ids: readonly IdLigne[],
  ligne: IdLigne,
  voisine: IdLigne,
): readonly IdLigne[] {
  const destination = ids.indexOf(voisine);
  if (destination < 0 || !ids.includes(ligne)) {
    return ids;
  }
  const sans = ids.filter((id) => id !== ligne);
  return [...sans.slice(0, destination), ligne, ...sans.slice(destination)];
}
