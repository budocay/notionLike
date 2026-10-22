// La table affichée, telle que la synchronisation la tient (F-018-AC51, ADR-0019) : son document de
// table est échangé directement, sans réplique ni miroir ; la façade refuse une version inconnue sans
// rien retirer, et ce qui est reçu reste enregistré dans la base de la table, tenue par l'écran.
import type * as Y from "yjs";

import { relierAuCanal } from "./canal.ts";
import { type ContexteDuDocument, DocumentSuivi } from "./document-suivi.ts";
import type { Environnement } from "./environnement.ts";
import { correspondance } from "./noms.ts";

export interface TableAffichee {
  readonly idTable: string;
  /** Le document de la table, entièrement relu, que la session de table tient (H14). */
  readonly doc: Y.Doc;
}

export interface CreationDeLaTable {
  readonly table: TableAffichee;
  readonly idEspace: string;
  readonly environnement: Environnement;
  readonly contexte: ContexteDuDocument;
}

export class TableSynchronisee {
  /** L'identifiant de la table : celui du document affiché. */
  readonly idDocument: string;
  readonly lie: Y.Doc;
  readonly suivi: DocumentSuivi;
  readonly #fermerLeCanal: () => void;

  private constructor(table: TableAffichee, suivi: DocumentSuivi, fermerLeCanal: () => void) {
    this.idDocument = table.idTable;
    this.lie = table.doc;
    this.suivi = suivi;
    this.#fermerLeCanal = fermerLeCanal;
  }

  /** `undefined` : l'identifiant n'a pas la forme admise, rien n'est ouvert. */
  static creer({
    table,
    idEspace,
    environnement,
    contexte,
  }: CreationDeLaTable): TableSynchronisee | undefined {
    let lien: ReturnType<typeof correspondance>;
    try {
      lien = correspondance("table", idEspace, table.idTable);
    } catch {
      return undefined;
    }
    const suivi = new DocumentSuivi(lien.nomDeDocument, table.idTable, table.doc, contexte);
    const fermerLeCanal = relierAuCanal({
      doc: table.doc,
      nomDeDocument: lien.nomDeDocument,
      environnement,
      estRecue: (origine) => suivi.estRecue(origine),
    });
    return new TableSynchronisee(table, suivi, fermerLeCanal);
  }

  /** Vrai : ce que porte le document de la table est acquitté par le serveur (F-013-AC49). */
  estAcquittee(): boolean {
    return this.suivi.estAcquis() && !this.suivi.aDesModificationsEnAttente();
  }

  fermer(): void {
    this.#fermerLeCanal();
    this.suivi.fermer();
  }
}
