import type * as Y from "yjs";

import { ErreurDocument } from "./erreurs.ts";
import {
  estUneVersion,
  fragmentDuContenu,
  inscrireVersion,
  lireFormeStockee,
  observerVersions,
  VERSION_PAGE_PRISE_EN_CHARGE,
} from "./format-page.ts";

export interface DocumentPage {
  readonly doc: Y.Doc;
  readonly contenu: Y.XmlFragment;
  /**
   * `rappel` est appelé dans l'observateur simple du type de version, à chaque modification
   * qui laisse le document non pris en charge. Rend le désabonnement.
   */
  garderVersion(rappel: () => void): () => void;
}

/**
 * N'écrit rien. Lève ErreurDocument("version-non-prise-en-charge") si la version lue dépasse la
 * version prise en charge, si la forme stockée porte autre chose que des entiers >= 1, ou si un
 * type racine du format a déjà été lu avec un autre constructeur.
 */
export function ouvrirDocumentPage(doc: Y.Doc): DocumentPage {
  if (!estDeVersionPriseEnCharge(doc)) {
    refuserLaVersion();
  }
  const contenu = fragmentDuContenu(doc) ?? refuserLaVersion();
  return {
    doc,
    contenu,
    garderVersion: (rappel) =>
      observerVersions(doc, () => {
        if (!estDeVersionPriseEnCharge(doc)) {
          rappel();
        }
      }),
  };
}

/** Ne lève jamais : la plus haute version entière >= 1 inscrite, 1 s'il n'y en a aucune. */
export function lireVersionPage(doc: Y.Doc): number {
  return lireFormeStockee(doc).version;
}

/**
 * Sans effet si version <= version lue. Lève ErreurDocument("version-invalide") si `version`
 * n'est pas un entier >= 1. Non bornée par la version prise en charge.
 */
export function eleverVersionPage(doc: Y.Doc, version: number): void {
  if (!estUneVersion(version)) {
    throw new ErreurDocument(
      "version-invalide",
      `La version ${String(version)} n'est pas un entier supérieur ou égal à 1.`,
    );
  }
  if (version > lireVersionPage(doc) && !inscrireVersion(doc, version)) {
    refuserLaVersion();
  }
}

function estDeVersionPriseEnCharge(doc: Y.Doc): boolean {
  const { version, admise } = lireFormeStockee(doc);
  return admise && version <= VERSION_PAGE_PRISE_EN_CHARGE;
}

function refuserLaVersion(): never {
  throw new ErreurDocument(
    "version-non-prise-en-charge",
    "La version de format du document de page n'est pas prise en charge.",
  );
}
