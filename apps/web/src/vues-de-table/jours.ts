// Arithmétique des jours du calendrier (F-021-AC15, AC16, AC17, H1) : des fonctions sur des entiers
// et des chaînes `AAAA-MM-JJ`, sans DOM, sans bibliothèque et sans aucune lecture de la langue, de
// l'horloge ou du fuseau de l'appareil. Un jour du calendrier grégorien n'a ni heure ni fuseau : le
// décaler de n jours est une addition sur son numéro depuis le 1er janvier de l'an 1.

export const PREMIER_JOUR = "0001-01-01";
export const DERNIER_JOUR = "9999-12-31";
export const ANNEE_MIN = 1;
export const ANNEE_MAX = 9999;

/** Un jour décomposé : l'année de 1 à 9999, le mois de 1 à 12, le quantième de 1 à 31. */
export interface JourDecompose {
  readonly annee: number;
  readonly mois: number;
  readonly quantieme: number;
}

/** Un mois : l'année et le numéro du mois, de 1 à 12. */
export interface MoisAffiche {
  readonly annee: number;
  readonly mois: number;
}

// Constantes du calendrier grégorien, nommées une à une (aucune table de nombres).
export const JOURS_PAR_SEMAINE = 7;
const MOIS_PAR_AN = 12;
const FEVRIER = 2;
const JOURS_DE_FEVRIER = 28;
const JOURS_D_UN_MOIS_COURT = 30;
const JOURS_D_UN_MOIS_LONG = 31;
const AVRIL = 4;
const JUIN = 6;
const SEPTEMBRE = 9;
const NOVEMBRE = 11;
const JOURS_PAR_AN = 365;
const ANNEES_PAR_QUADRIENNAT = 4;
const ANNEES_PAR_SIECLE = 100;
const ANNEES_PAR_CYCLE = 400;
const SIECLES_PAR_CYCLE = 4;
const JOURS_PAR_CYCLE_DE_400_ANS = 146_097;
const JOURS_PAR_SIECLE = 36_524;
const JOURS_PAR_QUADRIENNAT = 1461;
const NUMERO_DU_DERNIER_JOUR = 3_652_058;
const FORME_D_UN_JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;
const CHIFFRES_DE_L_ANNEE = 4;
const CHIFFRES_DU_MOIS = 2;

export function estBissextile(annee: number): boolean {
  return (
    (annee % ANNEES_PAR_QUADRIENNAT === 0 && annee % ANNEES_PAR_SIECLE !== 0) ||
    annee % ANNEES_PAR_CYCLE === 0
  );
}

/** Nombre de jours du mois (28 à 31) ; `mois` de 1 à 12. */
export function joursDuMois(annee: number, mois: number): number {
  if (mois === FEVRIER) {
    return JOURS_DE_FEVRIER + (estBissextile(annee) ? 1 : 0);
  }
  const court = mois === AVRIL || mois === JUIN || mois === SEPTEMBRE || mois === NOVEMBRE;
  return court ? JOURS_D_UN_MOIS_COURT : JOURS_D_UN_MOIS_LONG;
}

/** Jours écoulés dans l'année avant le 1er du mois. */
function joursAvantLeMois(annee: number, mois: number): number {
  let somme = 0;
  for (let precedent = 1; precedent < mois; precedent += 1) {
    somme += joursDuMois(annee, precedent);
  }
  return somme;
}

function sur(chiffres: number, valeur: number): string {
  return String(valeur).padStart(chiffres, "0");
}

/** `AAAA-MM-JJ`, l'année sur quatre chiffres. */
export function ecrireLeJour({ annee, mois, quantieme }: JourDecompose): string {
  return `${sur(CHIFFRES_DE_L_ANNEE, annee)}-${sur(CHIFFRES_DU_MOIS, mois)}-${sur(CHIFFRES_DU_MOIS, quantieme)}`;
}

/** Le jour décomposé d'une chaîne `AAAA-MM-JJ` qui est un jour des bornes ; sinon `undefined`. */
export function decomposer(jour: string): JourDecompose | undefined {
  const morceaux = FORME_D_UN_JOUR.exec(jour);
  if (morceaux === null) {
    return undefined;
  }
  const [, texteAnnee, texteMois, texteQuantieme] = morceaux;
  const annee = Number(texteAnnee);
  const mois = Number(texteMois);
  const quantieme = Number(texteQuantieme);
  const admis =
    annee >= ANNEE_MIN &&
    annee <= ANNEE_MAX &&
    mois >= 1 &&
    mois <= MOIS_PAR_AN &&
    quantieme >= 1 &&
    quantieme <= joursDuMois(annee, mois);
  return admis ? { annee, mois, quantieme } : undefined;
}

/** Vrai si la chaîne est un jour des bornes. */
export function estUnJour(valeur: unknown): valeur is string {
  return typeof valeur === "string" && decomposer(valeur) !== undefined;
}

/** Le numéro d'un jour : 0 pour le 1er janvier de l'an 1. */
function numeroDe({ annee, mois, quantieme }: JourDecompose): number {
  const avant = annee - 1;
  const dansLeCycle = avant % ANNEES_PAR_CYCLE;
  const joursDesAnnees =
    JOURS_PAR_CYCLE_DE_400_ANS * Math.floor(avant / ANNEES_PAR_CYCLE) +
    JOURS_PAR_AN * dansLeCycle +
    Math.floor(dansLeCycle / ANNEES_PAR_QUADRIENNAT) -
    Math.floor(dansLeCycle / ANNEES_PAR_SIECLE);
  return joursDesAnnees + joursAvantLeMois(annee, mois) + quantieme - 1;
}

/** Le jour de ce numéro ; le numéro est dans les bornes. */
function jourDuNumero(numero: number): JourDecompose {
  const cycles = Math.floor(numero / JOURS_PAR_CYCLE_DE_400_ANS);
  let reste = numero - cycles * JOURS_PAR_CYCLE_DE_400_ANS;
  const siecles = Math.min(Math.floor(reste / JOURS_PAR_SIECLE), SIECLES_PAR_CYCLE - 1);
  reste -= siecles * JOURS_PAR_SIECLE;
  const quadriennats = Math.floor(reste / JOURS_PAR_QUADRIENNAT);
  reste -= quadriennats * JOURS_PAR_QUADRIENNAT;
  const annees = Math.min(Math.floor(reste / JOURS_PAR_AN), ANNEES_PAR_QUADRIENNAT - 1);
  reste -= annees * JOURS_PAR_AN;
  const annee =
    cycles * ANNEES_PAR_CYCLE +
    siecles * ANNEES_PAR_SIECLE +
    quadriennats * ANNEES_PAR_QUADRIENNAT +
    annees +
    1;
  let mois = 1;
  while (mois < MOIS_PAR_AN && reste >= joursDuMois(annee, mois)) {
    reste -= joursDuMois(annee, mois);
    mois += 1;
  }
  return { annee, mois, quantieme: reste + 1 };
}

/** Le jour décalé de `nombre` jours (négatif : avant) ; `undefined` s'il sort des bornes. */
export function decaler(jour: string, nombre: number): string | undefined {
  const decompose = decomposer(jour);
  if (decompose === undefined) {
    return undefined;
  }
  const numero = numeroDe(decompose) + nombre;
  return numero < 0 || numero > NUMERO_DU_DERNIER_JOUR
    ? undefined
    : ecrireLeJour(jourDuNumero(numero));
}

/** Rang du jour dans la semaine : 0 le lundi, 6 le dimanche (le 1er janvier de l'an 1 est un lundi). */
export function jourDeLaSemaine(jour: string): number | undefined {
  const decompose = decomposer(jour);
  return decompose === undefined ? undefined : numeroDe(decompose) % JOURS_PAR_SEMAINE;
}

/** Le mois qui contient ce jour. */
export function moisDuJour(jour: string): MoisAffiche | undefined {
  const decompose = decomposer(jour);
  return decompose === undefined ? undefined : { annee: decompose.annee, mois: decompose.mois };
}

/** Le mois d'avant, ou `undefined` pour janvier de l'an 1. */
export function moisPrecedent({ annee, mois }: MoisAffiche): MoisAffiche | undefined {
  if (mois > 1) {
    return { annee, mois: mois - 1 };
  }
  return annee > ANNEE_MIN ? { annee: annee - 1, mois: MOIS_PAR_AN } : undefined;
}

/** Le mois d'après, ou `undefined` pour décembre 9999. */
export function moisSuivant({ annee, mois }: MoisAffiche): MoisAffiche | undefined {
  if (mois < MOIS_PAR_AN) {
    return { annee, mois: mois + 1 };
  }
  return annee < ANNEE_MAX ? { annee: annee + 1, mois: 1 } : undefined;
}

/**
 * La grille du mois : les semaines entières, du lundi au dimanche, qui le recouvrent, un jour par
 * case (28 à 42). Aux deux bornes du calendrier, les jours qui en sortiraient ne sont pas présentés :
 * la dernière semaine de décembre 9999 s'arrête au 31.
 */
export function grilleDuMois({ annee, mois }: MoisAffiche): readonly string[] {
  const numeroDuPremier = numeroDe({ annee, mois, quantieme: 1 });
  const rangDuPremier = numeroDuPremier % JOURS_PAR_SEMAINE;
  const total = joursDuMois(annee, mois);
  const cases = Math.ceil((rangDuPremier + total) / JOURS_PAR_SEMAINE) * JOURS_PAR_SEMAINE;
  const grille: string[] = [];
  for (let rang = 0; rang < cases; rang += 1) {
    const numero = numeroDuPremier - rangDuPremier + rang;
    if (numero >= 0 && numero <= NUMERO_DU_DERNIER_JOUR) {
      grille.push(ecrireLeJour(jourDuNumero(numero)));
    }
  }
  return grille;
}

/** Le lundi de la semaine du jour ; `undefined` si ce n'est pas un jour. */
export function lundiDeLaSemaine(jour: string): string | undefined {
  const rang = jourDeLaSemaine(jour);
  return rang === undefined ? undefined : decaler(jour, -rang);
}

/** Le dimanche de la semaine du jour (ou le 31 décembre 9999). */
export function dimancheDeLaSemaine(jour: string): string | undefined {
  const rang = jourDeLaSemaine(jour);
  if (rang === undefined) {
    return undefined;
  }
  return decaler(jour, JOURS_PAR_SEMAINE - 1 - rang) ?? DERNIER_JOUR;
}

/**
 * Le même quantième `delta` mois plus loin, ramené au dernier jour du mois s'il n'existe pas ;
 * `undefined` hors des bornes.
 */
export function memeQuantiemeAilleurs(jour: string, delta: -1 | 1): string | undefined {
  const decompose = decomposer(jour);
  if (decompose === undefined) {
    return undefined;
  }
  const autre = delta < 0 ? moisPrecedent(decompose) : moisSuivant(decompose);
  if (autre === undefined) {
    return undefined;
  }
  return ecrireLeJour({
    ...autre,
    quantieme: Math.min(decompose.quantieme, joursDuMois(autre.annee, autre.mois)),
  });
}
