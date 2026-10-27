// La définition d'une table (F-019, vocabulaire) : la liste des filtres et la liste ordonnée des
// tris, sur cet appareil. Types, opérateurs admis par type et limites ; aucune lecture de la table
// ici. Les identifiants de colonne et d'option désignent les éléments (AC20).
import type { IdColonne, TypeDeColonne } from "@notionlike/document";

/** Limites de la définition (H8) : elles bornent l'enregistrement et le coût du calcul (AC25). */
export const LIMITE_DE_FILTRES = 20;
export const LIMITE_DE_TRIS = 5;
export const LIMITE_DE_VALEUR = 2000;

export const OPERATEURS_PAR_TYPE = {
  texte: ["contient", "ne-contient-pas", "est", "est-vide", "non-vide"],
  nombre: [
    "egal",
    "different",
    "inferieur",
    "inferieur-egal",
    "superieur",
    "superieur-egal",
    "est-vide",
    "non-vide",
  ],
  case: ["cochee", "non-cochee"],
  date: ["est", "avant", "apres", "est-vide", "non-vide"],
  selection: ["est", "n-est-pas", "est-vide", "non-vide"],
} as const satisfies Record<TypeDeColonne, readonly string[]>;

export type OperateurDeFiltre = (typeof OPERATEURS_PAR_TYPE)[TypeDeColonne][number];

export const TOUS_LES_OPERATEURS: ReadonlySet<string> = new Set(
  Object.values(OPERATEURS_PAR_TYPE).flat(),
);

const SANS_VALEUR: ReadonlySet<string> = new Set([
  "est-vide",
  "non-vide",
  "cochee",
  "non-cochee",
] satisfies OperateurDeFiltre[]);

/** Vrai pour un opérateur qui demande une valeur. */
export function demandeUneValeur(operateur: OperateurDeFiltre): boolean {
  return !SANS_VALEUR.has(operateur);
}

export function operateursDe(type: TypeDeColonne): readonly OperateurDeFiltre[] {
  return OPERATEURS_PAR_TYPE[type];
}

/** Valeur d'un filtre : texte, nombre, date `AAAA-MM-JJ` ou identifiant d'option. */
export type ValeurDeFiltre = string | number;

export interface Filtre {
  readonly colonne: IdColonne;
  readonly operateur: OperateurDeFiltre;
  /** Absente quand l'opérateur n'en demande pas, ou quand elle n'est pas encore saisie. */
  readonly valeur?: ValeurDeFiltre | undefined;
}

export type SensDeTri = "croissant" | "decroissant";

export interface Tri {
  readonly colonne: IdColonne;
  readonly sens: SensDeTri;
}

export interface Definition {
  readonly filtres: readonly Filtre[];
  /** Le premier tri est le tri principal. */
  readonly tris: readonly Tri[];
}

export const DEFINITION_VIDE: Definition = { filtres: [], tris: [] };

/** La liste où l'élément de ce rang est remplacé, ou retiré quand `element` est absent. */
export function remplacerA<T>(
  liste: readonly T[],
  rang: number,
  element: T | undefined,
): readonly T[] {
  return liste.flatMap((un, i) => (i === rang ? (element === undefined ? [] : [element]) : [un]));
}
