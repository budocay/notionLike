// Seul fichier de test d'apps/web qui nomme les types partagés et la clé de version du format de
// `@notionlike/document` (F-002-AC22). Ce que la façade n'écrit jamais y est écrit à la main, comme
// le ferait une réplique plus récente ou forgée : une version que l'application ne connaît pas, une
// entrée de page sous une clé choisie. `coutures.test.ts` tient cette exclusivité et vérifie que
// ces noms sont ceux du paquet.
import * as Y from "yjs";

export const NOMS_DU_FORMAT = { meta: "meta", version: "version", pages: "pages" } as const;

export const VERSION_PRISE_EN_CHARGE = 1;
export const VERSION_NON_PRISE_EN_CHARGE = 2;

export function ecrireLaVersion(doc: Y.Doc, version: number): void {
  doc.getMap(NOMS_DU_FORMAT.meta).set(NOMS_DU_FORMAT.version, version);
}

/** Une entrée de page sans aucun champ, sous une clé qui n'est pas un identifiant de page. */
export function ecrireUneEntreeDePage(doc: Y.Doc, cle: string): void {
  doc.getMap(NOMS_DU_FORMAT.pages).set(cle, new Y.Map());
}

/** Range l'entrée d'une page sous une autre clé, ce qu'aucune opération de la façade ne fait. */
export function changerLaCleDUnePage(doc: Y.Doc, id: string, cleForgee: string): void {
  const pages = doc.getMap<Y.Map<unknown>>(NOMS_DU_FORMAT.pages);
  const entree = pages.get(id);
  if (entree === undefined) {
    throw new Error(`Aucune entrée de page sous la clé ${id}.`);
  }
  pages.set(cleForgee, entree.clone());
  pages.delete(id);
}
