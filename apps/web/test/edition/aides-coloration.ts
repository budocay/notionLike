// Aides des tests de la coloration du bloc code (F-033) : lecture des classes de rôle posées dans
// l'éditeur monté, et blocs code écrits ou relus par `yjs` seul. Aucun type de la bibliothèque
// d'édition ni de la bibliothèque de coloration n'est nommé ici (F-003-AC27, F-033-AC25).
import * as Y from "yjs";

import { CLASSES_DE_ROLE, type RoleSyntaxique } from "../../src/interface/composants/Edition.tsx";
import { fragmentBrut } from "../aides-facade-page.ts";
import { zoneDeSaisie } from "./aides-edition.tsx";

export const CLASSES_DE_ROLE_ADMISES: readonly string[] = Object.values(CLASSES_DE_ROLE);

/** Le rôle que porte cette classe ; `undefined` pour toute autre classe. */
export function roleDeLaClasse(classe: string | null): RoleSyntaxique | undefined {
  return (Object.keys(CLASSES_DE_ROLE) as RoleSyntaxique[]).find(
    (role) => CLASSES_DE_ROLE[role] === classe,
  );
}

/** Les éléments `code` des blocs code de l'éditeur, dans l'ordre du document. */
export function elementsCode(): HTMLElement[] {
  return [...zoneDeSaisie().querySelectorAll<HTMLElement>("pre > code")];
}

/**
 * Chaque élément coloré sous cet élément `code` : son texte et son rôle, dans l'ordre. Le saut de
 * ligne de fin que ProseMirror pose après un texte qui finit par un saut de ligne n'en est pas un.
 */
export function portionsColorees(code: Element): [string, RoleSyntaxique | string][] {
  return [...code.querySelectorAll("[class]:not(br.ProseMirror-trailingBreak)")].map((element) => {
    const classe = element.getAttribute("class");
    return [element.textContent, roleDeLaClasse(classe) ?? `classe hors liste : ${classe}`];
  });
}

/** Toutes les classes portées par un descendant de cet élément `code`. */
export function classesSous(code: Element): string[] {
  return [...code.querySelectorAll("[class]")].flatMap((element) => [...element.classList]);
}

/** Le texte de chaque bloc code du fragment, lu par `yjs` seul. */
export function textesDesBlocsCode(doc: Y.Doc): string[] {
  const textes: string[] = [];
  const visiter = (element: unknown): void => {
    if (element instanceof Y.XmlElement) {
      if (element.nodeName === "codeBlock") {
        textes.push(
          element
            .toArray()
            .map((enfant) => (enfant instanceof Y.XmlText ? enfant.toString() : ""))
            .join(""),
        );
        return;
      }
      element.toArray().forEach(visiter);
    }
  };
  fragmentBrut(doc).toArray().forEach(visiter);
  return textes;
}

/** Les blocs code d'un fragment, dans l'ordre : de quoi les modifier par `yjs` seul. */
export function blocsCodeDuFragment(fragment: Y.XmlFragment): Y.XmlElement[] {
  const trouves: Y.XmlElement[] = [];
  const visiter = (element: unknown): void => {
    if (element instanceof Y.XmlElement) {
      if (element.nodeName === "codeBlock") {
        trouves.push(element);
        return;
      }
      element.toArray().forEach(visiter);
    }
  };
  fragment.toArray().forEach(visiter);
  return trouves;
}

/** Le texte d'un bloc code écrit par `yjs`, à modifier ; créé s'il est vide. */
export function texteDuBloc(bloc: Y.XmlElement): Y.XmlText {
  const premier = bloc.get(0);
  if (premier instanceof Y.XmlText) {
    return premier;
  }
  const texte = new Y.XmlText();
  bloc.insert(0, [texte]);
  return texte;
}
