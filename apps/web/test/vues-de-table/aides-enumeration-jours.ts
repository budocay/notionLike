// Énumération de F-021-AC16, partagée : jouée par `calendrier-jours.test.ts` sous le fuseau de
// l'environnement, puis par `calendrier-fuseaux.test.ts` sous chacun des trois fuseaux (F-021-AC18).
// L'oracle `Date.UTC` n'existe que dans les tests, jamais dans les sources (F-021-AC15).
import { expect } from "vitest";

import {
  decaler,
  decomposer,
  ecrireLeJour,
  jourDeLaSemaine,
} from "../../src/vues-de-table/jours.ts";

const MS_PAR_JOUR = 86_400_000;
const DEBUT = Date.UTC(1899, 11, 25);
const FIN = Date.UTC(2101, 0, 7);

export function ecrit(annee: number, mois: number, quantieme: number): string {
  return `${String(annee).padStart(4, "0")}-${String(mois).padStart(2, "0")}-${String(quantieme).padStart(2, "0")}`;
}

export interface JourOracle {
  readonly texte: string;
  readonly semaine: number;
}

/** Chaque jour de 1899-12-25 à 2101-01-07 selon `Date.UTC`, semaine comptée depuis le lundi. */
export function oracle(): JourOracle[] {
  const jours: JourOracle[] = [];
  for (let instant = DEBUT; instant <= FIN; instant += MS_PAR_JOUR) {
    const date = new Date(instant);
    jours.push({
      texte: ecrit(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()),
      semaine: (date.getUTCDay() + 6) % 7,
    });
  }
  return jours;
}

/** Les écarts d'un jour avec l'oracle : réécriture, jour de semaine, pas d'un rang, lendemain, veille. */
function ecartsDuJour(jours: readonly JourOracle[], rang: number): string[] {
  const { texte, semaine } = jours[rang] ?? { texte: "", semaine: 0 };
  const decompose = decomposer(texte);
  const constats: readonly (readonly [string, boolean])[] = [
    ["réécriture", (decompose && ecrireLeJour(decompose)) === texte],
    ["jour de semaine", jourDeLaSemaine(texte) === semaine],
    // Le jour de la semaine avance d'un rang à chaque jour.
    ["pas d'un rang", rang === 0 || semaine === ((jours[rang - 1]?.semaine ?? 0) + 1) % 7],
    ["lendemain", decaler(texte, 1) === (jours[rang + 1]?.texte ?? "2101-01-08")],
    ["veille", decaler(texte, -1) === (jours[rang - 1]?.texte ?? "1899-12-24")],
  ];
  return constats.filter(([, bon]) => !bon).map(([nom]) => `${texte} : ${nom}`);
}

/**
 * Chaque jour de l'oracle se décompose, se réécrit, avance le jour de semaine d'un rang, et a pour
 * veille et lendemain ceux de l'oracle. Les écarts sont recueillis puis constatés d'un seul coup :
 * 73 428 jours par fuseau, une assertion par jour serait trop lente sous trois fuseaux.
 */
export function verifierLEnumeration(jours: readonly JourOracle[]): void {
  expect(jours.length).toBe(73_428);
  const ecarts = jours.flatMap((_, rang) => ecartsDuJour(jours, rang));
  expect(ecarts.slice(0, 10)).toEqual([]);
}
