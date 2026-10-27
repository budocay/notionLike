// Validation d'une saisie de cellule ou d'un nom de colonne (F-018-AC19, AC27, AC28, AC30, AC32) :
// le texte du champ devient une écriture, ou un message de refus qui garde le mode édition. Rien
// n'est écrit quand la valeur validée est celle que la cellule ou la colonne porte déjà.
import type {
  ColonneLue,
  DocumentTable,
  IdLigne,
  LigneLue,
  ValeurDeCellule,
} from "@notionlike/document";

import { ecrire, messageDeLaDate, type Surveillance } from "./ecritures.ts";
import { type Analyse, analyserDate, analyserNombre, analyserTexte, memeValeur } from "./saisie.ts";
import {
  LONGUEUR_MAX_NOM_DE_COLONNE,
  NOM_TROP_LONG,
  NOMBRE_INVALIDE,
  TEXTE_TROP_LONG,
} from "./textes.ts";

/** `undefined` : validé (écrit, ou rien à écrire) ; sinon le message du refus. */
export type Refus = string | undefined;

function analyser(colonne: ColonneLue, texte: string): Analyse {
  switch (colonne.type) {
    case "nombre":
      return analyserNombre(texte);
    case "date":
      return analyserDate(texte);
    default:
      return analyserTexte(texte);
  }
}

const MESSAGES_DES_REFUS = {
  "texte-trop-long": TEXTE_TROP_LONG,
  "nombre-invalide": NOMBRE_INVALIDE,
} as const;

/** La cellule visée par une validation, et la valeur qu'elle porte avant. */
export interface CibleDeCellule {
  readonly ligne: IdLigne;
  readonly colonne: ColonneLue;
  readonly avant: ValeurDeCellule | null;
}

export function valeurDe(ligne: LigneLue, rangDeColonne: number): ValeurDeCellule | null {
  return ligne.cellules[rangDeColonne] ?? null;
}

/** Écrit la valeur validée, si elle diffère de celle que la cellule porte (AC32). */
export function ecrireLaValeur(
  table: DocumentTable,
  cible: CibleDeCellule,
  valeur: ValeurDeCellule | null,
  surveillance: Surveillance,
): Refus {
  if (memeValeur(cible.avant, valeur)) {
    return undefined;
  }
  const issue = ecrire(
    () => table.ecrireCellule(cible.ligne, cible.colonne.id, valeur),
    surveillance,
  );
  if (issue.reussie) {
    return undefined;
  }
  return cible.colonne.type === "date" ? messageDeLaDate(issue) : issue.message;
}

/** La saisie d'un champ de cellule (texte, nombre, date), analysée puis écrite. */
export function validerLeChamp(
  table: DocumentTable,
  cible: CibleDeCellule,
  texte: string,
  surveillance: Surveillance,
): Refus {
  const analyse = analyser(cible.colonne, texte);
  if (analyse.sorte === "refus") {
    return MESSAGES_DES_REFUS[analyse.refus];
  }
  return ecrireLaValeur(table, cible, analyse.valeur, surveillance);
}

/** Le nouveau nom d'une colonne : au plus 200 caractères, écrit s'il change (AC19). */
export function validerLeNom(table: DocumentTable, colonne: ColonneLue, texte: string): Refus {
  if (texte.length > LONGUEUR_MAX_NOM_DE_COLONNE) {
    return NOM_TROP_LONG;
  }
  if (texte === colonne.nom) {
    return undefined;
  }
  const issue = ecrire(() => table.renommerColonne(colonne.id, texte));
  return issue.reussie ? undefined : issue.message;
}
