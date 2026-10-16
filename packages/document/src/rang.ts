// Rang d'une page parmi ses sœurs (ADR-0002, « Rangs ») : la partie fractionnaire d'un nombre
// entre 0 et 1 exclus, écrite sur 62 chiffres. Un rang ne finit jamais par le chiffre zéro, et sa
// longueur est bornée (F-029) : une chaîne plus longue n'est pas un rang admis. Aucune fonction de ce
// module ne s'appelle elle-même : la longueur d'une borne reçue n'est pas bornée (F-029-AC4).
export type Rang = string;

export const BORNE_BASSE = "";
export const BORNE_HAUTE = null;

/** Longueur maximale d'un rang admis, en unités UTF-16 (F-029, H2). Non exportée par le paquet. */
export const LONGUEUR_MAX_RANG = 1024;

/** Signalement typé, distinct d'une chaîne : aucun rang admis n'existe entre les deux bornes. */
export const AUCUN_RANG_ADMIS: unique symbol = Symbol("aucun rang admis");
export type RangCalcule = Rang | typeof AUCUN_RANG_ADMIS;

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE = ALPHABET.length;
const ZERO = ALPHABET.charAt(0);

/** Rang admis : non vide, au plus `longueurMax` unités, alphabet sur 62 chiffres, pas de zéro final. */
export function estUnRang(valeur: string, longueurMax: number = LONGUEUR_MAX_RANG): boolean {
  // La longueur est contrôlée avant tout parcours, toute copie et toute comparaison (F-029-AC1).
  if (valeur.length === 0 || valeur.length > longueurMax || valeur.endsWith(ZERO)) {
    return false;
  }
  for (let indice = 0; indice < valeur.length; indice += 1) {
    if (!ALPHABET.includes(valeur.charAt(indice))) {
      return false;
    }
  }
  return true;
}

/**
 * Le plus court rang admis strictement compris entre `bas` et `haut`, ou `AUCUN_RANG_ADMIS`. Le
 * calcul s'arrête dès que le rang dépasserait `longueurMax` : il ne parcourt jamais une borne au-delà.
 */
export function rangEntre(
  bas: Rang,
  haut: Rang | null,
  longueurMax: number = LONGUEUR_MAX_RANG,
): RangCalcule {
  let hautSuivi = haut;
  for (let indice = 0; indice < longueurMax; indice += 1) {
    const chiffreBas = chiffreDe(bas, indice);
    const chiffreHaut = hautSuivi === BORNE_HAUTE ? BASE : chiffreDe(hautSuivi, indice);
    if (chiffreHaut !== chiffreBas) {
      const dernier = dernierChiffre(chiffreBas, chiffreHaut, hautSuivi, indice);
      if (dernier !== undefined) {
        const candidat = prefixeDe(bas, indice) + ALPHABET.charAt(dernier);
        return rangAdmisEntre(candidat, bas, haut, longueurMax);
      }
      // Plus de place à ce chiffre : le rang s'allonge, au-dessus de la suite de `bas`.
      hautSuivi = BORNE_HAUTE;
    }
  }
  return AUCUN_RANG_ADMIS;
}

/**
 * Un rang par élément, dans l'ordre : strictement croissants, strictement entre `bas` et `haut`, ou
 * `AUCUN_RANG_ADMIS` si la suite ne tient pas dans la borne.
 */
export function rangsCroissantsEntre<T>(
  bas: Rang,
  haut: Rang | null,
  elements: readonly T[],
  longueurMax: number = LONGUEUR_MAX_RANG,
): Map<T, Rang> | typeof AUCUN_RANG_ADMIS {
  const rangs = new Map<T, Rang>();
  let precedent: Rang = bas;
  for (const element of elements) {
    const calcule = rangEntre(precedent, haut, longueurMax);
    if (calcule === AUCUN_RANG_ADMIS) {
      return AUCUN_RANG_ADMIS;
    }
    precedent = calcule;
    rangs.set(element, calcule);
  }
  return rangs;
}

/**
 * `nombre` rangs admis strictement croissants, de même longueur, répartis sur tout l'intervalle
 * (réattribution élargie, F-029-AC7), ou `AUCUN_RANG_ADMIS` si la borne ne les permet pas. Les
 * rangs de `longueur` chiffres sans zéro final sont numérotés dans l'ordre : le numéro `n` s'écrit
 * `n / 61` (division entière) en base 62 sur `longueur - 1` chiffres, suivi du chiffre `n % 61 + 1`.
 */
export function rangsRepartis(
  nombre: number,
  longueurMax: number = LONGUEUR_MAX_RANG,
): readonly Rang[] | typeof AUCUN_RANG_ADMIS {
  const finals = BASE - 1;
  let longueur = 1;
  let disponibles = finals;
  while (disponibles < nombre) {
    longueur += 1;
    disponibles *= BASE;
  }
  if (longueur > longueurMax || !Number.isSafeInteger(disponibles * 2 * nombre)) {
    return AUCUN_RANG_ADMIS;
  }
  const rangs: Rang[] = [];
  for (let numero = 0; numero < nombre; numero += 1) {
    // Le pas vaut au moins 1 : les numéros choisis sont strictement croissants.
    const choisi = Math.floor(((2 * numero + 1) * disponibles) / (2 * nombre));
    const tete = ecrireEnBase(Math.floor(choisi / finals), longueur - 1);
    rangs.push(tete + ALPHABET.charAt((choisi % finals) + 1));
  }
  return rangs;
}

/** Rang de l'élément inséré, et nouveaux rangs des éléments réattribués, par indice dans `rangs`. */
export interface InsertionDeRang {
  readonly rang: Rang;
  readonly reattribues: ReadonlyMap<number, Rang>;
}

/**
 * Insertion d'un élément à `position` parmi des éléments lus dans l'ordre, de rangs `rangs` (ADR-0002,
 * « Rangs », F-029). Entre deux éléments de même rang, aucun rang n'existe : ceux de ce rang qui
 * suivent la position sont réattribués, jusqu'au premier d'un rang supérieur. Si la borne ne laisse
 * aucun rang admis à la position, la réattribution s'élargit à tous les éléments (F-029-AC7). Rend
 * `AUCUN_RANG_ADMIS` si même celle-ci ne tient pas dans la borne : à l'appelant d'en faire un refus.
 */
export function insertionParmi(
  rangs: readonly Rang[],
  position: number,
  longueurMax: number = LONGUEUR_MAX_RANG,
): InsertionDeRang | typeof AUCUN_RANG_ADMIS {
  const fin = finDesRangsEgauxAuPrecedent(rangs, position);
  const haut = rangs[fin] ?? BORNE_HAUTE;
  const rang = rangEntre(rangs[position - 1] ?? BORNE_BASSE, haut, longueurMax);
  if (rang !== AUCUN_RANG_ADMIS) {
    const indices = Array.from({ length: fin - position }, (_, decalage) => position + decalage);
    const reattribues = rangsCroissantsEntre(rang, haut, indices, longueurMax);
    if (reattribues !== AUCUN_RANG_ADMIS) {
      return { rang, reattribues };
    }
  }
  return insertionElargie(rangs, position, longueurMax);
}

// Réattribution élargie (F-029-AC7) : tous les éléments, l'inséré compris, reçoivent des rangs courts
// répartis dans l'ordre demandé. Seuls ceux dont le rang change sont rendus.
function insertionElargie(
  rangs: readonly Rang[],
  position: number,
  longueurMax: number,
): InsertionDeRang | typeof AUCUN_RANG_ADMIS {
  const repartis = rangsRepartis(rangs.length + 1, longueurMax);
  const rang = repartis === AUCUN_RANG_ADMIS ? undefined : repartis[position];
  if (repartis === AUCUN_RANG_ADMIS || rang === undefined) {
    return AUCUN_RANG_ADMIS;
  }
  const reattribues = new Map<number, Rang>();
  rangs.forEach((ancien, indice) => {
    const nouveau = repartis[indice < position ? indice : indice + 1];
    if (nouveau !== undefined && nouveau !== ancien) {
      reattribues.set(indice, nouveau);
    }
  });
  return { rang, reattribues };
}

function finDesRangsEgauxAuPrecedent(rangs: readonly Rang[], position: number): number {
  const precedent = rangs[position - 1];
  let fin = position;
  while (precedent !== undefined && rangs[fin] === precedent) {
    fin += 1;
  }
  return fin;
}

// Chiffre final du rang à la position `indice`, si un chiffre y suffit entre les deux bornes.
function dernierChiffre(
  chiffreBas: number,
  chiffreHaut: number,
  haut: Rang | null,
  indice: number,
): number | undefined {
  if (chiffreHaut - chiffreBas > 1) {
    return Math.floor((chiffreBas + chiffreHaut) / 2);
  }
  if (haut !== BORNE_HAUTE && haut.length > indice + 1) {
    return chiffreHaut;
  }
  return undefined;
}

// Le candidat est vérifié avant d'être rendu : des bornes non ordonnées ou mal formées donnent le
// signalement, jamais une chaîne hors de l'intervalle ou non admise (F-029-AC5).
function rangAdmisEntre(
  candidat: Rang,
  bas: Rang,
  haut: Rang | null,
  longueurMax: number,
): RangCalcule {
  const entre = bas < candidat && (haut === BORNE_HAUTE || candidat < haut);
  return entre && estUnRang(candidat, longueurMax) ? candidat : AUCUN_RANG_ADMIS;
}

// Les `longueur` premiers chiffres de `rang`, complétés par des zéros.
function prefixeDe(rang: Rang, longueur: number): string {
  return rang.length >= longueur
    ? rang.slice(0, longueur)
    : rang + ZERO.repeat(longueur - rang.length);
}

function ecrireEnBase(valeur: number, longueur: number): string {
  let ecrit = "";
  let reste = valeur;
  for (let position = 0; position < longueur; position += 1) {
    ecrit = ALPHABET.charAt(reste % BASE) + ecrit;
    reste = Math.floor(reste / BASE);
  }
  return ecrit;
}

// Un rang épuisé se prolonge par des zéros, comme une partie fractionnaire. Un caractère hors de
// l'alphabet vaut -1 : le candidat qui en hérite est écarté par `rangAdmisEntre`.
function chiffreDe(rang: Rang, indice: number): number {
  return indice >= rang.length ? 0 : ALPHABET.indexOf(rang.charAt(indice));
}
