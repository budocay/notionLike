// Session de page (ADR-0009), sur le modèle de la session d'espace : un document Yjs par page,
// sa persistance et sa façade. Ni React, ni bibliothèque d'édition.
import {
  type DocumentPage,
  ErreurDocument,
  type IdPage,
  ouvrirDocumentPage,
} from "@notionlike/document";
import * as Y from "yjs";

import { ouvrirPersistance } from "../persistance/index.ts";

export type EtatSessionPage =
  | { readonly phase: "chargement" }
  | { readonly phase: "version-non-prise-en-charge" }
  | {
      readonly phase: "pret";
      readonly page: Pick<DocumentPage, "contenu" | "garderVersion">;
      /** Faux : la page ne vit qu'en mémoire, l'avertissement est affiché. */
      readonly enregistre: boolean;
    };

export interface SessionPage {
  lireEtat(): EtatSessionPage;
  abonner(rappel: () => void): () => void;
  /** Ferme la persistance sans rien effacer ; la session ne publie plus rien ensuite. */
  fermer(): void;
  /** Reçoit les mises à jour. */
  readonly doc: Y.Doc;
}

const CHARGEMENT: EtatSessionPage = { phase: "chargement" };
const VERSION_NON_PRISE_EN_CHARGE: EtatSessionPage = { phase: "version-non-prise-en-charge" };

export function ouvrirSessionPage(idEspace: string, idPage: IdPage): SessionPage {
  const doc = new Y.Doc();
  const persistance = ouvrirPersistance(doc, { type: "page", idEspace, idPage });
  let etat: EtatSessionPage = CHARGEMENT;
  let page: DocumentPage | undefined;
  let cesserDeGarder: (() => void) | undefined;
  let fermee = false;
  const abonnes = new Set<() => void>();

  const publier = (suivant: EtatSessionPage): void => {
    etat = suivant;
    [...abonnes].forEach((notifier) => notifier());
  };

  // Définitif : plus rien n'est lu ni écrit dans la base de cette page (F-003-AC19, AC29).
  const refuserLaVersion = (): void => {
    publier(VERSION_NON_PRISE_EN_CHARGE);
    persistance.fermer();
  };

  const surPersistance = (): void => {
    if (fermee || etat === VERSION_NON_PRISE_EN_CHARGE || persistance.etat() === "relecture") {
      return;
    }
    if (page === undefined) {
      // La version se lit sur le document entièrement relu, avant tout éditeur (F-003-AC19).
      page = ouvertureAdmise(doc);
      if (page === undefined) {
        refuserLaVersion();
        return;
      }
      cesserDeGarder = page.garderVersion(refuserLaVersion);
    }
    const enregistre = persistance.etat() === "active";
    if (etat.phase !== "pret" || etat.enregistre !== enregistre) {
      publier({ phase: "pret", page, enregistre });
    }
  };

  const cesserDeSuivre = persistance.abonner(surPersistance);
  surPersistance();

  return {
    lireEtat: () => etat,
    abonner: (rappel) => {
      const notifier = (): void => rappel();
      abonnes.add(notifier);
      return () => void abonnes.delete(notifier);
    },
    fermer: () => {
      fermee = true;
      cesserDeSuivre();
      cesserDeGarder?.();
      persistance.fermer();
    },
    doc,
  };
}

// `undefined` : la façade refuse la version du document.
function ouvertureAdmise(doc: Y.Doc): DocumentPage | undefined {
  try {
    return ouvrirDocumentPage(doc);
  } catch (erreur) {
    if (erreur instanceof ErreurDocument && erreur.code === "version-non-prise-en-charge") {
      return undefined;
    }
    throw erreur;
  }
}
