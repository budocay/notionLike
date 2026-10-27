// Ce que la vue kanban demande à son environnement (F-020) : la table et sa lecture, les lignes
// affichées, la lecture seule, et où dire un refus ou une annonce. Rien de la grille (cellule
// courante, focus de l'invitation) : la vue « Tableau » a son propre contrat (`Moyens`).
import type { DocumentTable, LigneLue, TableLue } from "@notionlike/document";

export interface MoyensDuKanban {
  readonly table: DocumentTable;
  readonly lue: TableLue;
  readonly lignes: readonly LigneLue[];
  /** La raison qui interdit toute écriture (F-020-AC23), ou `undefined`. */
  readonly lectureSeule: string | undefined;
  readonly signaler: (message: string | undefined) => void;
  readonly annoncer: (texte: string) => void;
}
