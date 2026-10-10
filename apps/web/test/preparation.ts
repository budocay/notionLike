import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, vi } from "vitest";

import { fermerLesFacades } from "./aides-facade.ts";

// Minuteries réelles armées pendant le test. Depuis F-030, une persistance coupée que le test ne
// ferme pas garde armée l'attente de sa tentative suivante : laissée là, elle ouvrirait une base
// sur l'appareil simulé d'un test suivant.
const minuteries = new Set<ReturnType<typeof setTimeout>>();
const desarmer = globalThis.clearTimeout;

// Chaque test reçoit un appareil simulé vide ; `unstubGlobals` rend les globales après le test.
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const armer = globalThis.setTimeout;
  vi.stubGlobal("setTimeout", (...arguments_: Parameters<typeof setTimeout>) => {
    const minuterie = armer(...arguments_);
    minuteries.add(minuterie);
    return minuterie;
  });
  window.location.hash = "";
});

/** Désarme toute minuterie réelle armée depuis le début du test. */
export function desarmerLesMinuteries(): void {
  minuteries.forEach((minuterie) => desarmer(minuterie));
  minuteries.clear();
}

// Aucune minuterie d'un test ne lui survit.
afterEach(desarmerLesMinuteries);

// F-002-AC31 : toute façade ouverte par un test est fermée, et la preuve est le nombre d'écouteurs
// de chaque `Y.Doc` revenu à sa valeur de départ, pas l'appel de `fermer()`.
afterEach(() => {
  vi.useRealTimers();
  expect(fermerLesFacades()).toBe(0);
});
