// Ce que la vue kanban demande à son environnement (F-020) : la table et sa lecture, les lignes
// affichées, la lecture seule, et où dire un refus ou une annonce. Rien de la grille (cellule
// courante, focus de l'invitation) : la vue « Tableau » a son propre contrat (`Moyens`).
import type { DocumentTable, LigneLue, TableLue } from "@notionlike/document";

import type { Surveillance } from "../ecritures.ts";

export interface MoyensDuKanban {
  readonly table: DocumentTable;
  readonly lue: TableLue;
  readonly lignes: readonly LigneLue[];
  /** La raison qui interdit toute écriture (F-020-AC23), ou `undefined`. */
  readonly lectureSeule: string | undefined;
  /** Un tri est actif : « Monter » et « Descendre » sont indisponibles, rien ne déplace la ligne (F-020-AC16). */
  readonly triActif: boolean;
  /** L'affichage figé est prévenu de toute écriture de la vue (F-019-AC17). */
  readonly surveillance: Surveillance;
  readonly signaler: (message: string | undefined) => void;
  readonly annoncer: (texte: string) => void;
}
