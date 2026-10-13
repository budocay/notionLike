// Aides des tests de F-029 (rang borné). Les entrées y sont écrites à la main dans le `Y.Doc`, comme
// le ferait un client non conforme : seul ce fichier de F-029 nomme les champs du format. Le contrôle
// d'un rang admis y est réécrit, indépendant de `src/rang.ts`, pour servir d'oracle.
import { vi } from "vitest";
import * as Y from "yjs";

import type { Arborescence, IdPage, PageLue } from "../src/index.ts";

export const BORNE = 1024;
const RANG_BIEN_FORME = /^[0-9A-Za-z]*[1-9A-Za-z]$/;

export interface Entree {
  readonly titre?: string;
  readonly parent?: IdPage | null;
  readonly rang: string;
  readonly corbeille?: boolean;
}

/** Identifiant de page reproductible, dans l'ordre des numéros. */
export function id(numero: number): IdPage {
  return `00000000-0000-4000-8000-${String(numero).padStart(12, "0")}`;
}

export function estAdmis(rang: unknown, borne = BORNE): boolean {
  return typeof rang === "string" && rang.length <= borne && RANG_BIEN_FORME.test(rang);
}

/** Écrit des entrées en une transaction, champs choisis, sans passer par la façade. */
export function ecrireEntrees(doc: Y.Doc, entrees: ReadonlyMap<IdPage, Entree>): void {
  doc.transact(() => {
    for (const [
      cle,
      { titre = cle.slice(-4), parent = null, rang, corbeille = false },
    ] of entrees) {
      const champs = new Y.Map<unknown>();
      champs.set("titre", titre);
      champs.set("place", { parent, rang });
      champs.set("corbeille", corbeille);
      doc.getMap("pages").set(cle, champs);
    }
  });
}

/** Réécrit la seule place d'une entrée existante, comme une réplique non conforme. */
export function ecrirePlaceBrute(
  doc: Y.Doc,
  cle: IdPage,
  parent: IdPage | null,
  rang: string,
): void {
  const champs = doc.getMap("pages").get(cle);
  if (!(champs instanceof Y.Map)) {
    throw new Error(`aucune entrée ${cle}`);
  }
  champs.set("place", { parent, rang });
}

export interface PlaceEnregistree {
  readonly parent: unknown;
  readonly rang: unknown;
}

/** Les places enregistrées, entrées ignorées comprises. */
export function placesDuDoc(doc: Y.Doc): Map<IdPage, PlaceEnregistree> {
  const places = new Map<IdPage, PlaceEnregistree>();
  doc.getMap("pages").forEach((valeur, cle) => {
    if (valeur instanceof Y.Map) {
      places.set(cle, valeur.get("place") as PlaceEnregistree);
    }
  });
  return places;
}

/**
 * Nombre d'écritures du champ `place`, par page, pendant `operation` : chaque appel de `set` est
 * compté, y compris deux écritures d'une même page dans une transaction, que Yjs fondrait en une.
 */
export function ecrituresDePlace(doc: Y.Doc, operation: () => void): Map<IdPage, number> {
  const ecrireUnChamp = Y.Map.prototype.set;
  const appels: [unknown, Y.Map<unknown>][] = [];
  // Une `Y.Map` neuve garde ses champs à part, puis les réécrit à son intégration au document :
  // seule l'écriture dans le document est comptée.
  const espion = vi.spyOn(Y.Map.prototype, "set").mockImplementation(function (
    this: Y.Map<unknown>,
    champ: string,
    valeur: unknown,
  ) {
    if (this.doc !== null) {
      appels.push([champ, this]);
    }
    return Reflect.apply(ecrireUnChamp, this, [champ, valeur]) as never;
  });
  try {
    operation();
  } finally {
    espion.mockRestore();
  }
  const cleDe = new Map<unknown, IdPage>();
  doc.getMap("pages").forEach((valeur, cle) => cleDe.set(valeur, cle));
  const ecritures = new Map<IdPage, number>();
  for (const [champ, cible] of appels) {
    const cle = cleDe.get(cible);
    if (champ === "place" && cle !== undefined) {
      ecritures.set(cle, (ecritures.get(cle) ?? 0) + 1);
    }
  }
  return ecritures;
}

/** Mises à jour Yjs émises par `doc` pendant `operation`. */
export function misesAJourPendant(doc: Y.Doc, operation: () => void): Uint8Array[] {
  const emises: Uint8Array[] = [];
  const noter = (miseAJour: Uint8Array): void => void emises.push(miseAJour);
  doc.on("update", noter);
  try {
    operation();
  } finally {
    doc.off("update", noter);
  }
  return emises;
}

export function idsDe(pages: readonly PageLue[]): IdPage[] {
  return pages.map((page) => page.id);
}

/** Identifiants lus, arborescence puis corbeille, chaque niveau compris. */
export function identifiantsLus({ racines, corbeille }: Arborescence): IdPage[] {
  const lus: IdPage[] = [];
  const aVoir = [...racines, ...corbeille];
  for (const lue of aVoir) {
    lus.push(lue.id);
    lue.enfants.forEach((enfant) => aVoir.push(enfant));
  }
  return lus;
}

export function trouver(pages: readonly PageLue[], cherche: IdPage): PageLue | undefined {
  const aVoir = [...pages];
  for (const page of aVoir) {
    if (page.id === cherche) {
      return page;
    }
    page.enfants.forEach((enfant) => aVoir.push(enfant));
  }
  return undefined;
}

export function codeDuRefus(operation: () => unknown): unknown {
  try {
    operation();
    return "acceptée";
  } catch (erreur) {
    return (erreur as { code?: unknown }).code ?? erreur;
  }
}
