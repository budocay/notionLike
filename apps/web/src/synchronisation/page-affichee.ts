// La page affichée, telle que la synchronisation la tient (F-013-AC17, AC34, AC36) : sa réplique,
// que le fournisseur et le canal entre onglets modifient, reliée au document que l'éditeur lie par
// le miroir de la seconde barrière (H8).
import type * as Y from "yjs";

import { ouvrirLaBase, type Persistance } from "./stockage.ts";
import { relierAuCanal } from "./canal.ts";
import { type ContexteDuDocument, DocumentSuivi } from "./document-suivi.ts";
import type { Environnement } from "./environnement.ts";
import { creerMiroir, type Miroir } from "./miroir.ts";
import { correspondance } from "./noms.ts";

export interface PageAffichee {
  readonly idPage: string;
  /** Le document de page que l'éditeur lie, entièrement relu (H14). */
  readonly doc: Y.Doc;
  /** Détruit l'éditeur et sa liaison : une version non prise en charge est arrivée (AC34). */
  readonly refuserLaVersion: () => void;
}

export interface CreationDeLaPage {
  readonly page: PageAffichee;
  readonly idEspace: string;
  readonly environnement: Environnement;
  readonly contexte: ContexteDuDocument;
}

export class PageSynchronisee {
  readonly idPage: string;
  readonly lie: Y.Doc;
  readonly suivi: DocumentSuivi;
  readonly #miroir: Miroir;
  readonly #fermerLeCanal: () => void;
  #persistance: Persistance | undefined;

  private constructor(
    page: PageAffichee,
    miroir: Miroir,
    suivi: DocumentSuivi,
    fermerLeCanal: () => void,
  ) {
    this.idPage = page.idPage;
    this.lie = page.doc;
    this.#miroir = miroir;
    this.suivi = suivi;
    this.#fermerLeCanal = fermerLeCanal;
  }

  /** `undefined` : l'identifiant n'a pas la forme admise, rien n'est ouvert. */
  static creer({
    page,
    idEspace,
    environnement,
    contexte,
  }: CreationDeLaPage): PageSynchronisee | undefined {
    let lien: ReturnType<typeof correspondance>;
    try {
      lien = correspondance("page", idEspace, page.idPage);
    } catch {
      return undefined;
    }
    const tenue: { creee?: PageSynchronisee } = {};
    // Version refusée : l'éditeur est détruit, puis la réplique est enregistrée telle quelle dans la
    // base de la page, sans jamais être modifiée par l'onglet, et continue de recevoir (AC34).
    const miroir = creerMiroir(page.doc, () => {
      page.refuserLaVersion();
      tenue.creee?.enregistrerTelQuel(lien.designation);
    });
    const suivi = new DocumentSuivi(lien.nomDeDocument, page.idPage, miroir.replique, contexte);
    const fermerLeCanal = relierAuCanal({
      doc: miroir.replique,
      nomDeDocument: lien.nomDeDocument,
      environnement,
      estRecue: (origine) => suivi.estRecue(origine),
    });
    tenue.creee = new PageSynchronisee(page, miroir, suivi, fermerLeCanal);
    return tenue.creee;
  }

  /**
   * Vrai : ce que porte le document lié est acquitté par le serveur (F-013-AC49) ; jamais pour une
   * version refusée, dont la réplique ne reçoit plus rien du document lié.
   */
  estAcquittee(): boolean {
    return (
      !this.#miroir.estRefuse() &&
      this.suivi.estAcquis() &&
      !this.suivi.aDesModificationsEnAttente()
    );
  }

  enregistrerTelQuel(designation: ReturnType<typeof correspondance>["designation"]): void {
    this.#persistance ??= ouvrirLaBase(this.#miroir.replique, designation);
  }

  fermer(): void {
    this.#fermerLeCanal();
    this.suivi.fermer();
    this.#persistance?.fermer();
    this.#miroir.fermer();
  }
}
