// Fuseaux extrêmes de F-021-AC18 et changement de fuseau en cours de test. Sous le pool `forks` (celui
// du projet), `process.env.TZ` posé en cours de test est pris en compte par V8 ; l'effet est vérifié
// avant toute comparaison, puis le fuseau d'origine est rendu.
import { afterEach, expect } from "vitest";

// Décalage attendu de `getTimezoneOffset()` un jour de mars 2026, en minutes.
export const FUSEAUX: readonly (readonly [string, number])[] = [
  ["Pacific/Kiritimati", -840],
  ["UTC", 0],
  ["Pacific/Pago_Pago", 660],
  ["Europe/Paris", -120],
];

/** À appeler au niveau du fichier de test : rend le fuseau d'origine après chaque test. */
export function rendreLeFuseau(): void {
  const origine = process.env.TZ;
  afterEach(() => {
    if (origine === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = origine;
    }
  });
}

export function sous<T>(fuseau: string, decalage: number, calcul: () => T): T {
  process.env.TZ = fuseau;
  // Sans effet constaté, la comparaison ne prouverait rien : on s'arrête ici.
  expect(new Date(2026, 2, 29, 12).getTimezoneOffset(), `fuseau ${fuseau} appliqué`).toBe(decalage);
  return calcul();
}
