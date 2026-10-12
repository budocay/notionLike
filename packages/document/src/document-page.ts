// Façade du document de page (F-003 H3), sur le modèle de celle du document d'espace : ouverte sur
// un `Y.Doc` fourni, elle n'écrit rien à l'ouverture et ne laisse sortir du paquet ni le nom des
// types racine ni la forme stockée de la version.
import type * as Y from "yjs";

import { ErreurDocument } from "./erreurs.ts";
import {
  estPriseEnCharge,
  estUneVersion,
  type FormeStockee,
  fragmentDuContenu,
  inscrireVersion,
  lireFormeStockee,
  typeDesVersions,
} from "./format-page.ts";

// Le paquet compile sans DOM ni types Node ; `console` existe pourtant sous l'un comme sous l'autre.
declare const console: { error(...donnees: unknown[]): void };

const SIGNALEMENT_DU_RAPPEL_DE_GARDE_FAUTIF =
  "@notionlike/document : un rappel de garde de version a levé pendant sa diffusion.";

const VERSION_D_UN_DOCUMENT_ILLISIBLE = 1;

export interface DocumentPage {
  readonly doc: Y.Doc;
  /** Seul type racine où l'éditeur écrit (F-003-AC22). */
  readonly contenu: Y.XmlFragment;
  /** La version lue ; après `fermer()`, la dernière lue avant la fermeture. */
  lireVersion(): number;
  /**
   * Inscrit une version, sans borne haute : l'appelant choisit une ligne de la table. Sans effet si
   * elle ne dépasse pas la version lue. Refus, dans l'ordre : `facade-fermee`, `version-invalide`.
   */
  eleverVersion(version: number): void;
  /**
   * Garde de version (F-003-AC29) : `rappel` est appelé au rang d'un observateur simple du type
   * de version, avant tout observateur profond, chaque fois qu'une modification de ce type laisse le
   * document non pris en charge. Rend le désabonnement. Sans effet sur une façade fermée.
   */
  garderVersion(rappel: () => void): () => void;
  /** Retire tout observateur posé par la façade ; sans effet la seconde fois. */
  fermer(): void;
}

/**
 * N'écrit rien. Lève `version-non-prise-en-charge` si la version lue dépasse la version prise en
 * charge, si la forme stockée porte autre chose que des versions entières à partir de 1, ou si un
 * type racine du format a déjà été lu sous un autre type partagé.
 */
export function ouvrirDocumentPage(doc: Y.Doc): DocumentPage {
  const versions = typeDesVersions(doc) ?? refuserLaVersion();
  const contenu = fragmentDuContenu(doc) ?? refuserLaVersion();
  let forme = lireFormeStockee(versions);
  if (!estPriseEnCharge(forme)) {
    refuserLaVersion();
  }
  let fermee = false;
  const gardes = new Set<() => void>();

  const surVersions = (): void => {
    // Yjs appelle les observateurs présents au début de l'émission : celui d'une façade qu'un autre
    // rappel vient de fermer l'est encore une fois, et ne doit ni relire ni prévenir.
    if (fermee) {
      return;
    }
    forme = lireFormeStockee(versions);
    if (!estPriseEnCharge(forme)) {
      diffuser(gardes);
    }
  };
  versions.observe(surVersions);

  return {
    doc,
    contenu,
    lireVersion: () => forme.version,
    eleverVersion: (version) => {
      // Contrôlé avant tout autre refus (F-003-AC33).
      if (fermee) {
        throw new ErreurDocument("facade-fermee", "La façade du document de page est fermée.");
      }
      elever(versions, forme, version);
    },
    garderVersion: (rappel) => {
      if (fermee) {
        return () => undefined;
      }
      const garde = (): void => rappel();
      gardes.add(garde);
      return () => void gardes.delete(garde);
    },
    fermer: () => {
      if (fermee) {
        return;
      }
      fermee = true;
      gardes.clear();
      versions.unobserve(surVersions);
    },
  };
}

/** Ne lève jamais et n'observe rien : la version lue d'un document, pris en charge ou non. */
export function lireVersionPage(doc: Y.Doc): number {
  const versions = typeDesVersions(doc);
  return versions === undefined
    ? VERSION_D_UN_DOCUMENT_ILLISIBLE
    : lireFormeStockee(versions).version;
}

function elever(versions: Y.Array<unknown>, forme: FormeStockee, version: number): void {
  if (!estUneVersion(version)) {
    throw new ErreurDocument(
      "version-invalide",
      `La version ${String(version)} n'est pas un entier supérieur ou égal à 1.`,
    );
  }
  if (version > forme.version) {
    inscrireVersion(versions, version);
  }
}

// La copie tient à l'écart les rappels inscrits pendant la diffusion ; le test d'appartenance écarte
// ceux qu'un rappel précédent vient de désabonner, et tous dès que la façade est fermée. Un rappel
// qui lève ne prive pas les suivants et ne remonte ni par l'élévation ni par `Y.applyUpdate` : son
// exception va à la console d'erreur, seul canal (F-003-AC34).
function diffuser(gardes: ReadonlySet<() => void>): void {
  for (const garde of [...gardes]) {
    if (gardes.has(garde)) {
      try {
        garde();
      } catch (exception) {
        console.error(SIGNALEMENT_DU_RAPPEL_DE_GARDE_FAUTIF, exception);
      }
    }
  }
}

function refuserLaVersion(): never {
  throw new ErreurDocument(
    "version-non-prise-en-charge",
    "La version de format du document de page n'est pas prise en charge.",
  );
}
