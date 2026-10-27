// Conformité d'une date `AAAA-MM-JJ` au calendrier grégorien étendu, du `0001-01-01` au
// `9999-12-31`, sans objet date ni fuseau (F-019-AC5, AC24). Même règle que le document de table
// (F-017-AC18) : un test de couture les compare, la façade n'exposant pas la sienne.
const FORME_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MOIS_PAR_AN = 12;
const FEVRIER = 2;
const AOUT = 8;
const JOURS_DU_MOIS_COURT = 30;
const JOURS_DE_FEVRIER = 28;
const CYCLE_BISSEXTILE = 4;
const SIECLE = 100;
const CYCLE_GREGORIEN = 400;

function estBissextile(annee: number): boolean {
  return (annee % CYCLE_BISSEXTILE === 0 && annee % SIECLE !== 0) || annee % CYCLE_GREGORIEN === 0;
}

// Janvier à juillet : les mois impairs ont 31 jours ; d'août à décembre, les mois pairs.
function joursDuMois(annee: number, mois: number): number {
  if (mois === FEVRIER) {
    return JOURS_DE_FEVRIER + (estBissextile(annee) ? 1 : 0);
  }
  return JOURS_DU_MOIS_COURT + ((mois + Math.floor(mois / AOUT)) % 2);
}

export function estUneDateDuCalendrier(valeur: string): boolean {
  const morceaux = FORME_DATE.exec(valeur);
  const [annee, mois, jour] = (morceaux?.slice(1) ?? []).map(Number);
  if (annee === undefined || mois === undefined || jour === undefined) {
    return false;
  }
  const dansLeCalendrier = mois >= 1 && mois <= MOIS_PAR_AN && annee >= 1;
  return dansLeCalendrier && jour >= 1 && jour <= joursDuMois(annee, mois);
}
