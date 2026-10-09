import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { beforeEach, vi } from "vitest";

// Chaque test reçoit un appareil simulé vide ; `unstubGlobals` rend la globale après le test.
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  window.location.hash = "";
});

// jsdom n'a aucune mise en page : ProseMirror appelle ces quatre fonctions dès qu'une transaction
// fait défiler la vue (Entrée, Tab). Sans elles, l'erreur est levée hors du test (F-003 H12).
function aucunRectangle(): DOMRectList {
  return Object.assign([], { item: () => null }) as unknown as DOMRectList;
}
function rectangleNul(): DOMRect {
  return new DOMRect(0, 0, 0, 0);
}
Range.prototype.getClientRects = aucunRectangle;
Range.prototype.getBoundingClientRect = rectangleNul;
Element.prototype.getClientRects = aucunRectangle;
document.elementFromPoint = () => null;
