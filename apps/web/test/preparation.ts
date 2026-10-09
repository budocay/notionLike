import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, vi } from "vitest";

import { fermerLesFacades } from "./aides-facade.ts";

// Chaque test reçoit un appareil simulé vide ; `unstubGlobals` rend la globale après le test.
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  window.location.hash = "";
});

// F-002-AC31 : toute façade ouverte par un test est fermée, et la preuve est le nombre d'écouteurs
// de chaque `Y.Doc` revenu à sa valeur de départ, pas l'appel de `fermer()`.
afterEach(() => {
  vi.useRealTimers();
  expect(fermerLesFacades()).toBe(0);
});
