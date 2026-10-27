// Aides des tests de la vue kanban (F-020) : une table d'essai à colonne de titre et colonne de
// regroupement, la lecture qu'en fait la vue (colonne, lignes affichées, piles) et le contexte que
// reçoit la fonction de déplacement.
import {
  creerDocumentTable,
  type ColonneLue,
  type DocumentTable,
  type IdColonne,
  type IdLigne,
  type IdOption,
  type TableLue,
} from "@notionlike/document";

import { lignesAffichees } from "../../src/vues-de-table/lignes-affichees.ts";
import type { ContexteDeDeplacement } from "../../src/vues-de-table/kanban/deplacement.ts";
import {
  colonneDeRegroupement,
  type Pile,
  regrouper,
} from "../../src/vues-de-table/kanban/piles.ts";

export interface TableDeKanban {
  readonly table: DocumentTable;
  readonly titre: IdColonne;
  readonly statut: IdColonne;
  /** Options dans l'ordre : « À faire », « En cours », « Fait ». */
  readonly options: readonly IdOption[];
  /** Lignes créées dans l'ordre, nommées par leur titre. */
  readonly lignes: ReadonlyMap<string, IdLigne>;
}

/** `repartition` : titre de chaque ligne, dans l'ordre de la table, et l'indice de son option (-1 : aucune). */
export function tableDeKanban(
  repartition: readonly (readonly [string, number])[],
  libelles: readonly string[] = ["À faire", "En cours", "Fait"],
): TableDeKanban {
  return remplirLaTableDeKanban(creerDocumentTable(), repartition, libelles);
}

/** Remplit une table vierge, pour la rendre ensuite par l'écran de table. */
export function remplirLaTableDeKanban(
  table: DocumentTable,
  repartition: readonly (readonly [string, number])[],
  libelles: readonly string[] = ["À faire", "En cours", "Fait"],
): TableDeKanban {
  const titre = table.creerColonne("Titre", "texte");
  const statut = table.creerColonne("Statut", "selection");
  const options = libelles.map((libelle) => table.ajouterOption(statut, libelle));
  const lignes = new Map<string, IdLigne>();
  for (const [nom, rang] of repartition) {
    const valeurs = new Map<IdColonne, string>([[titre, nom]]);
    const option = options[rang];
    if (option !== undefined) {
      valeurs.set(statut, option);
    }
    lignes.set(nom, table.creerLigne(valeurs));
  }
  return { table, titre, statut, options, lignes };
}

export function regroupementDe(lue: TableLue): ColonneLue {
  const colonne = colonneDeRegroupement(lue, undefined);
  if (colonne === undefined) {
    throw new Error("La table d'essai n'a pas de colonne de sélection.");
  }
  return colonne;
}

export function contexteDe(table: DocumentTable): ContexteDeDeplacement {
  const lue = table.lire();
  return { table, lue, lignes: lignesAffichees(lue), regroupement: regroupementDe(lue) };
}

export function pilesDe(table: DocumentTable): readonly Pile[] {
  const { lue, lignes, regroupement } = contexteDe(table);
  return regrouper(lue, lignes, regroupement);
}

/** Les titres des cartes de chaque pile, dans l'ordre : « Sans valeur » d'abord. */
export function titresParPile(table: DocumentTable): string[][] {
  return pilesDe(table).map(({ cartes }) => cartes.map(({ titre }) => titre));
}

/**
 * Un document de table qui lève au moindre appel : une vue qui l'écrirait ou le lirait sans action de
 * l'utilisateur échoue au lieu de passer inaperçue (la vue ne lit que ses propriétés `lue` et `lignes`).
 */
export function tableInterdite(): DocumentTable {
  return new Proxy({} as DocumentTable, {
    get: (_cible, nom) => {
      throw new Error(`Appel inattendu de table.${String(nom)} par la vue.`);
    },
  });
}
