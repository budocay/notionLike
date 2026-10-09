// Aides des tests de la page affichée dans la coquille. L'éditeur est atteint par l'élément de
// saisie, sans rien importer de la bibliothèque d'édition (F-003-AC27).
import { ouvrirDocumentPage } from "@notionlike/document";
import { act, screen, waitFor } from "@testing-library/react";
import { expect, vi } from "vitest";
import * as Y from "yjs";

import { ouvrirPersistance } from "../src/persistance/index.ts";
import { nomsDesBases } from "./aides-coquille.tsx";

const PREFIXE_BASE_ESPACE = "notionlike:espace:";
const PREFIXE_BASE_PAGE = "notionlike:page:";

/** Ce que les tests pilotent de l'éditeur monté : des commandes, jamais ses types. */
interface EditeurPilote {
  readonly isDestroyed: boolean;
  readonly commands: {
    insertContent(contenu: string): boolean;
    focus(position?: "start" | "end"): boolean;
  };
}

export function zoneDeSaisie(): Promise<HTMLElement> {
  return screen.findByRole("textbox", { name: "Contenu de la page" });
}

export function zoneDeSaisiePresente(): HTMLElement | null {
  return screen.queryByRole("textbox", { name: "Contenu de la page" });
}

export async function editeurAffiche(): Promise<EditeurPilote> {
  const zone = (await zoneDeSaisie()) as HTMLElement & { editor?: EditeurPilote };
  if (zone.editor === undefined) {
    throw new Error("La zone de saisie ne porte aucun éditeur.");
  }
  return zone.editor;
}

/** Insère un texte brut à l'endroit du curseur de l'éditeur affiché. */
export async function ecrire(texte: string): Promise<void> {
  const editeur = await editeurAffiche();
  act(() => void editeur.commands.insertContent(texte));
}

export async function idEspaceLocal(): Promise<string> {
  const base = (await nomsDesBases()).find((nom) => nom.startsWith(PREFIXE_BASE_ESPACE));
  if (base === undefined) {
    throw new Error("Aucune base d'espace sur l'appareil simulé.");
  }
  return base.slice(PREFIXE_BASE_ESPACE.length);
}

export async function basesDePage(): Promise<string[]> {
  return (await nomsDesBases()).filter((nom) => nom.startsWith(PREFIXE_BASE_PAGE));
}

/** Identifiant de la page que l'adresse désigne. */
export function idPageCourante(): string {
  return decodeURIComponent(window.location.hash.replace(/^#\/page\//, ""));
}

/** Contenu lu d'une page, relu depuis IndexedDB dans un document vierge. */
export async function contenuEnregistre(idEspace: string, idPage: string): Promise<string> {
  const doc = new Y.Doc();
  const persistance = ouvrirPersistance(doc, { type: "page", idEspace, idPage });
  await waitFor(() => expect(persistance.etat()).toBe("active"));
  persistance.fermer();
  return ouvrirDocumentPage(doc).contenu.toString();
}

/** Enregistre un document de page préparé par le test, par le module de persistance lui-même. */
export async function enregistrerPage(
  idEspace: string,
  idPage: string,
  preparer: (doc: Y.Doc) => void,
): Promise<Y.Doc> {
  const doc = new Y.Doc();
  preparer(doc);
  const persistance = ouvrirPersistance(doc, { type: "page", idEspace, idPage });
  await waitFor(() => expect(persistance.etat()).toBe("active"));
  persistance.fermer();
  return doc;
}

type Gestionnaire = ((evenement: Event) => void) | null;

interface DemandeRetenue {
  onsuccess: Gestionnaire;
  onerror: Gestionnaire;
  onupgradeneeded: Gestionnaire;
  onblocked: Gestionnaire;
  readonly result: unknown;
  readonly transaction: unknown;
  readonly error: unknown;
}

/**
 * Les ouvertures d'une base de page restent sans réponse jusqu'à `repondre()` ; celles de
 * l'appareil et de l'espace passent. Sans `repondre()`, la relecture de la page ne finit jamais.
 */
export function retenirLesBasesDePage(): { repondre(): void } {
  const ouvrir = indexedDB.open.bind(indexedDB);
  const reponses: (() => void)[] = [];
  let retenir = true;
  vi.spyOn(indexedDB, "open").mockImplementation((nom, version) => {
    if (!retenir || !nom.startsWith(PREFIXE_BASE_PAGE)) {
      return ouvrir(nom, version);
    }
    let reelle: IDBOpenDBRequest | undefined;
    const retenue: DemandeRetenue = {
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      onblocked: null,
      get result() {
        return reelle?.result;
      },
      get transaction() {
        return reelle?.transaction;
      },
      get error() {
        return reelle?.error;
      },
    };
    reponses.push(() => {
      reelle = ouvrir(nom, version);
      reelle.onsuccess = (evenement) => retenue.onsuccess?.(evenement);
      reelle.onerror = (evenement) => retenue.onerror?.(evenement);
      reelle.onupgradeneeded = (evenement) => retenue.onupgradeneeded?.(evenement);
    });
    return retenue as unknown as IDBOpenDBRequest;
  });
  return {
    repondre: () => {
      retenir = false;
      reponses.splice(0).forEach((repondre) => repondre());
    },
  };
}

/** Toute ouverture d'une base de page lève : la page ne vit qu'en mémoire. */
export function refuserLesBasesDePage(): void {
  const ouvrir = indexedDB.open.bind(indexedDB);
  vi.spyOn(indexedDB, "open").mockImplementation((nom, version) => {
    if (nom.startsWith(PREFIXE_BASE_PAGE)) {
      throw new DOMException("refus", "SecurityError");
    }
    return ouvrir(nom, version);
  });
}
