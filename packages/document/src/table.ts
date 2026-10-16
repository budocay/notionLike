// Lecture du document de table (ADR-0016), sans Yjs : types publics, limites, conformité d'une
// valeur au type de sa colonne, et passage des entrées retenues par le format à la table lue. Fichier
// pur : il n'importe rien (contrat `document-coeur-pur`).
export type IdColonne = string;
export type IdLigne = string;
export type IdOption = string;
export type TypeDeColonne = "texte" | "nombre" | "case" | "date" | "selection";
/** Valeur d'une cellule non vide ; une cellule vide se lit `null` (F-017 H12). */
export type ValeurDeCellule = string | number | boolean;

export interface OptionLue {
  readonly id: IdOption;
  readonly libelle: string;
}

export interface ColonneLue {
  readonly id: IdColonne;
  readonly nom: string;
  readonly type: TypeDeColonne;
  /** Vide hors du type `selection`. */
  readonly options: readonly OptionLue[];
}

export interface LigneLue {
  readonly id: IdLigne;
  /** Alignées sur `TableLue.colonnes` : la cellule de rang `i` est celle de la colonne `i`. */
  readonly cellules: readonly (ValeurDeCellule | null)[];
}

export interface TableLue {
  readonly colonnes: readonly ColonneLue[];
  readonly lignes: readonly LigneLue[];
}

/** Limites en unités UTF-16, comme les titres de page (F-017 H8). */
export const LONGUEUR_MAX_NOM = 200;
export const LONGUEUR_MAX_LIBELLE = 100;
export const LONGUEUR_MAX_TEXTE = 2000;

const TYPES_DE_COLONNE: ReadonlySet<string> = new Set<TypeDeColonne>([
  "texte",
  "nombre",
  "case",
  "date",
  "selection",
]);

// Entrées retenues par le format : bien formées, rang admis. Les drapeaux et les cellules brutes
// restent à filtrer ici.
export interface EntreeOption {
  readonly id: IdOption;
  readonly libelle: string;
  readonly rang: string;
  readonly supprimee: boolean;
}

export interface EntreeColonne {
  readonly id: IdColonne;
  readonly nom: string;
  readonly type: TypeDeColonne;
  readonly rang: string;
  readonly supprimee: boolean;
  readonly options: readonly EntreeOption[];
}

export interface EntreeLigne {
  readonly id: IdLigne;
  readonly rang: string;
  readonly supprimee: boolean;
  /** Valeurs enregistrées, par identifiant de colonne, telles quelles : rien n'y est encore vérifié. */
  readonly cellules: ReadonlyMap<IdColonne, unknown>;
}

/** La table lue, et les rangs de ses éléments dans l'ordre lu, pour les insertions. */
export interface EtatTable {
  readonly table: TableLue;
  readonly rangsDesColonnes: readonly string[];
  readonly rangsDesLignes: readonly string[];
  readonly rangsDesOptions: ReadonlyMap<IdColonne, readonly string[]>;
}

export function estUnTypeDeColonne(valeur: unknown): valeur is TypeDeColonne {
  return typeof valeur === "string" && TYPES_DE_COLONNE.has(valeur);
}

const DEBUT_SUBSTITUT_HAUT = 0xd800;
const DEBUT_SUBSTITUT_BAS = 0xdc00;
const FIN_SUBSTITUT_BAS = 0xdfff;
const CARACTERE_DE_REMPLACEMENT = "\ufffd";

function estUnSubstitutBas(unite: number): boolean {
  return unite >= DEBUT_SUBSTITUT_BAS && unite <= FIN_SUBSTITUT_BAS;
}

/**
 * La chaîne où chaque unité UTF-16 isolée est remplacée par U+FFFD, longueur inchangée : ce que lit
 * toute réplique qui reçoit la chaîne par l'encodage V1 de Yjs (ADR-0016, veille constat 6). La
 * réplique d'origine lit et écrit donc la même chaîne que les autres (F-017-AC21). Sans unité isolée,
 * la chaîne est rendue telle quelle. `String.prototype.toWellFormed` n'est pas dans la `lib` ES2023 du
 * paquet.
 */
export function formeNormalisee(texte: string): string {
  let normalisee = "";
  let recopiee = 0;
  for (let indice = 0; indice < texte.length; indice += 1) {
    const unite = texte.charCodeAt(indice);
    if (unite < DEBUT_SUBSTITUT_HAUT || unite > FIN_SUBSTITUT_BAS) {
      continue;
    }
    if (unite < DEBUT_SUBSTITUT_BAS && estUnSubstitutBas(texte.charCodeAt(indice + 1))) {
      indice += 1;
      continue;
    }
    normalisee += texte.slice(recopiee, indice) + CARACTERE_DE_REMPLACEMENT;
    recopiee = indice + 1;
  }
  return recopiee === 0 ? texte : normalisee + texte.slice(recopiee);
}

/** La forme normalisée d'une chaîne d'au plus `longueurMax` unités, ou `undefined`. */
function texteAdmis(valeur: unknown, longueurMax: number): string | undefined {
  // La longueur est contrôlée avant tout parcours ; la normalisation ne la change pas.
  return typeof valeur === "string" && valeur.length <= longueurMax
    ? formeNormalisee(valeur)
    : undefined;
}

export function nomAdmis(valeur: unknown): string | undefined {
  return texteAdmis(valeur, LONGUEUR_MAX_NOM);
}

export function libelleAdmis(valeur: unknown): string | undefined {
  return texteAdmis(valeur, LONGUEUR_MAX_LIBELLE);
}

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

/**
 * Jour du calendrier grégorien étendu aux dates anciennes, écrit `AAAA-MM-JJ`, du `0001-01-01` au
 * `9999-12-31` (F-017 H4, H13). Sans objet `Date` ni fuseau : la règle bissextile vaut pour toute
 * année.
 */
export function estUneDate(valeur: string): boolean {
  const morceaux = FORME_DATE.exec(valeur);
  if (morceaux === null) {
    return false;
  }
  const [annee, mois, jour] = morceaux.slice(1).map(Number);
  if (annee === undefined || mois === undefined || jour === undefined) {
    return false;
  }
  return (
    annee >= 1 && mois >= 1 && mois <= MOIS_PAR_AN && jour >= 1 && jour <= joursDuMois(annee, mois)
  );
}

/** La valeur exposée, ou `null` si elle n'est pas conforme : un contrôle par type de colonne. */
type Controle = (valeur: unknown, options: ReadonlySet<IdOption>) => ValeurDeCellule | null;

// Un contrôle par type, sans valeur par défaut : un type ajouté sans contrôle ne compile pas.
const CONFORMITE: Readonly<Record<TypeDeColonne, Controle>> = {
  texte: (valeur) => texteAdmis(valeur, LONGUEUR_MAX_TEXTE) ?? null,
  // `-0` se lit `0`.
  nombre: (valeur) => (typeof valeur === "number" && Number.isFinite(valeur) ? valeur + 0 : null),
  case: (valeur) => (typeof valeur === "boolean" ? valeur : null),
  date: (valeur) => (typeof valeur === "string" && estUneDate(valeur) ? valeur : null),
  selection: (valeur, options) =>
    typeof valeur === "string" && options.has(valeur) ? valeur : null,
};

/**
 * La valeur exposée d'une cellule, ou `null` si elle n'est pas conforme au type de sa colonne
 * (F-017-AC18, AC21). `options` : les options lues de la colonne. `-0` se lit `0` ; un texte se lit
 * sous sa forme normalisée.
 */
export function valeurConforme(
  type: TypeDeColonne,
  valeur: unknown,
  options: ReadonlySet<IdOption>,
): ValeurDeCellule | null {
  return CONFORMITE[type](valeur, options);
}

interface AvecRang {
  readonly id: string;
  readonly rang: string;
  readonly supprimee: boolean;
}

// Ordre lu : le rang, puis l'identifiant, comparés par unités de code (ADR-0002, F-017 H9).
function parRangPuisIdentifiant(a: AvecRang, b: AvecRang): number {
  if (a.rang !== b.rang) {
    return a.rang < b.rang ? -1 : 1;
  }
  return a.id < b.id ? -1 : Number(a.id > b.id);
}

function retenues<T extends AvecRang>(entrees: readonly T[]): T[] {
  return entrees.filter((entree) => !entree.supprimee).sort(parRangPuisIdentifiant);
}

function colonneLue(entree: EntreeColonne, options: readonly EntreeOption[]): ColonneLue {
  return {
    id: entree.id,
    nom: entree.nom,
    type: entree.type,
    options: options.map(({ id, libelle }) => ({ id, libelle })),
  };
}

/** Des entrées retenues par le format à la table lue : drapeaux, ordre, cellules conformes. */
export function lireEtatTable(
  colonnes: readonly EntreeColonne[],
  lignes: readonly EntreeLigne[],
): EtatTable {
  const colonnesRetenues = retenues(colonnes);
  const rangsDesOptions = new Map<IdColonne, readonly string[]>();
  const colonnesLues = colonnesRetenues.map((entree) => {
    const options = entree.type === "selection" ? retenues(entree.options) : [];
    rangsDesOptions.set(
      entree.id,
      options.map((option) => option.rang),
    );
    return colonneLue(entree, options);
  });
  const optionsLues = colonnesLues.map(
    (colonne) => new Set(colonne.options.map((option) => option.id)),
  );
  const lignesRetenues = retenues(lignes);
  const lignesLues = lignesRetenues.map((ligne) => ({
    id: ligne.id,
    cellules: colonnesLues.map((colonne, indice) =>
      valeurConforme(
        colonne.type,
        ligne.cellules.get(colonne.id),
        optionsLues[indice] ?? new Set(),
      ),
    ),
  }));
  return {
    table: { colonnes: colonnesLues, lignes: lignesLues },
    rangsDesColonnes: colonnesRetenues.map((colonne) => colonne.rang),
    rangsDesLignes: lignesRetenues.map((ligne) => ligne.rang),
    rangsDesOptions,
  };
}

function memesOptions(a: readonly OptionLue[], b: readonly OptionLue[]): boolean {
  return (
    a.length === b.length &&
    a.every((option, indice) => {
      const autre = b[indice];
      return autre !== undefined && option.id === autre.id && option.libelle === autre.libelle;
    })
  );
}

function memeColonne(a: ColonneLue, b: ColonneLue | undefined): boolean {
  return (
    b !== undefined &&
    a.id === b.id &&
    a.nom === b.nom &&
    a.type === b.type &&
    memesOptions(a.options, b.options)
  );
}

function memeLigne(a: LigneLue, b: LigneLue | undefined): boolean {
  return (
    b !== undefined &&
    a.id === b.id &&
    a.cellules.length === b.cellules.length &&
    a.cellules.every((valeur, indice) => valeur === b.cellules[indice])
  );
}

/** Égalité profonde de deux tables lues (F-017-AC9 : aucune notification sans changement). */
export function memeTable(a: TableLue, b: TableLue): boolean {
  return (
    a.colonnes.length === b.colonnes.length &&
    a.lignes.length === b.lignes.length &&
    a.colonnes.every((colonne, indice) => memeColonne(colonne, b.colonnes[indice])) &&
    a.lignes.every((ligne, indice) => memeLigne(ligne, b.lignes[indice]))
  );
}
