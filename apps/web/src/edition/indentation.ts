// Indentation du bloc code au clavier (F-033-AC15 à AC19, H3) : lignes touchées, indentation d'une
// ligne, et, pour Tab, Maj+Tab et Entrée, les modifications du texte et la sélection d'arrivée,
// appliquées en une seule transaction. Le cran est de deux espaces ; seul l'appelant juge si
// l'éditeur est modifiable et si une composition est en cours (F-033-AC20).
import type { Node as NoeudProseMirror } from "@tiptap/pm/model";
import { type EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";

import { BLOC_CODE } from "./commandes-de-bloc.ts";
import { bornesLues } from "./types-de-bloc.ts";

/** Le cran d'indentation : deux espaces, pour les dix langages (H3). */
export const CRAN = "  ";
const TABULATION = "\t";
const SAUT_DE_LIGNE = "\n";
const INDENTATION = /^[ \t]*/;

/** La sélection, quand elle est entière dans un même bloc code : décalages dans son texte. */
export interface SelectionDuBlocCode {
  readonly bloc: NoeudProseMirror;
  /** Position du premier caractère du texte du bloc dans le document. */
  readonly debut: number;
  readonly ancre: number;
  readonly tete: number;
}

/**
 * La sélection lue dans un bloc code, Mod+A dans un bloc code seul et sélection du bloc entier par la
 * poignée compris (par `bornesLues`) ; `undefined` si elle n'est pas entière dans un même bloc code.
 */
export function selectionDuBlocCode(etat: EditorState): SelectionDuBlocCode | undefined {
  const lue = etat.selection;
  const { $from, $to } = bornesLues(lue);
  if ($from.parent.type.name !== BLOC_CODE || !$from.sameParent($to)) {
    return undefined;
  }
  const debut = $from.start();
  const [ancre, tete] =
    lue instanceof TextSelection ? [lue.anchor, lue.head] : [$from.pos, $to.pos];
  return { bloc: $from.parent, debut, ancre: ancre - debut, tete: tete - debut };
}

/** Une ligne du texte : décalages de son premier caractère et de sa fin, saut de ligne exclu. */
interface Ligne {
  readonly de: number;
  readonly a: number;
}

function lignesDe(texte: string): Ligne[] {
  const lignes: Ligne[] = [];
  let de = 0;
  for (const morceau of texte.split(SAUT_DE_LIGNE)) {
    lignes.push({ de, a: de + morceau.length });
    de += morceau.length + SAUT_DE_LIGNE.length;
  }
  return lignes;
}

/**
 * Les lignes touchées par la sélection `[de, a]` : celle du curseur si elle est vide ; sinon chaque
 * ligne qui contient au moins un caractère sélectionné (celle où la sélection finit à sa première
 * colonne ne l'est donc pas).
 */
export function lignesTouchees(texte: string, de: number, a: number): Ligne[] {
  const lignes = lignesDe(texte);
  if (de === a) {
    return lignes.filter((ligne) => ligne.de <= de && de <= ligne.a).slice(0, 1);
  }
  return lignes.filter((ligne) => Math.max(ligne.de, de) < Math.min(ligne.a, a));
}

/** L'indentation d'une ligne : les espaces et tabulations qui l'ouvrent. */
export function indentationDe(ligne: string): string {
  return INDENTATION.exec(ligne)?.[0] ?? "";
}

/** Une modification du texte du bloc : à ce décalage, retirer `retire` unités, insérer `insere`. */
export interface Modification {
  readonly a: number;
  readonly retire: number;
  readonly insere: string;
}

/** Tab : un cran au curseur, ou en tête de chaque ligne touchée non vide (F-033-AC15, AC16). */
export function modificationsDeTab(texte: string, de: number, a: number): Modification[] {
  if (de === a) {
    return [{ a: de, retire: 0, insere: CRAN }];
  }
  return lignesTouchees(texte, de, a)
    .filter((ligne) => ligne.a > ligne.de)
    .map((ligne) => ({ a: ligne.de, retire: 0, insere: CRAN }));
}

/**
 * Maj+Tab : en tête de chaque ligne touchée, une tabulation si elle en commence une, sinon jusqu'à
 * deux espaces (F-033-AC17) ; aucune modification si aucune ligne ne s'ouvre ainsi.
 */
export function modificationsDeMajTab(texte: string, de: number, a: number): Modification[] {
  return lignesTouchees(texte, de, a).flatMap((ligne) => {
    const contenu = texte.slice(ligne.de, ligne.a);
    const retire = contenu.startsWith(TABULATION)
      ? TABULATION.length
      : (/^ {1,2}/.exec(contenu)?.[0].length ?? 0);
    return retire === 0 ? [] : [{ a: ligne.de, retire, insere: "" }];
  });
}

/**
 * Entrée : la sélection remplacée par un saut de ligne, suivi de la part de l'indentation de la ligne
 * où commence la sélection qui précède son début (F-033-AC18).
 */
export function modificationDEntree(texte: string, de: number, a: number): Modification {
  const ligne = lignesDe(texte).find((une) => une.de <= de && de <= une.a) ?? { de: 0, a: 0 };
  const reprise = indentationDe(texte.slice(ligne.de, ligne.a)).slice(0, de - ligne.de);
  return { a: de, retire: a - de, insere: `${SAUT_DE_LIGNE}${reprise}` };
}

/**
 * Applique ces modifications au bloc lu dans une seule transaction, de la dernière à la première,
 * puis y pose la sélection : ancre et tête reportées par la transaction ; la borne de début reste
 * avant un cran inséré à sa place (il entre dans la sélection), celle de fin après.
 */
export function appliquer(
  tr: Transaction,
  lue: SelectionDuBlocCode,
  modifications: readonly Modification[],
): Transaction {
  [...modifications]
    .sort((une, autre) => autre.a - une.a)
    .forEach(({ a, retire, insere }) => {
      const position = lue.debut + a;
      if (insere === "") {
        tr.delete(position, position + retire);
      } else {
        tr.insertText(insere, position, position + retire);
      }
    });
  // Un curseur suit ce qui est inséré à sa place ; une sélection garde ses bornes comme dit.
  const cotes = lue.ancre === lue.tete ? { debut: 1, fin: 1 } : { debut: -1, fin: 1 };
  const avance = lue.ancre <= lue.tete;
  const [ancre, tete] = [lue.debut + lue.ancre, lue.debut + lue.tete];
  const nouvelleAncre = tr.mapping.map(ancre, avance ? cotes.debut : cotes.fin);
  const nouvelleTete = tr.mapping.map(tete, avance ? cotes.fin : cotes.debut);
  return tr.setSelection(TextSelection.create(tr.doc, nouvelleAncre, nouvelleTete));
}
