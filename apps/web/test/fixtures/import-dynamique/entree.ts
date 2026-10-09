// Donnée de test de `aides-graphe.ts` : un module qui n'en atteint un autre que par un import
// dynamique. Le graphe doit le voir (F-004-AC50, F-004-AC53).
export function charger(): Promise<unknown> {
  return import("./atteint.ts");
}
