// Aides des tests de l'écran de la vue kanban (F-020) : la table d'essai rendue par l'écran de table,
// la vue « Kanban » enregistrée comme vue active de l'appareil, les piles et les cartes lues par
// leurs rôles, et une mise en page bouchonnée pour le geste au pointeur (veille du 2026-10-27).
import { act, screen, within } from "@testing-library/react";
import { afterEach } from "vitest";

import { ESPACE_A } from "../aides-persistance.ts";
import { cleDesReglages } from "../aides-table.ts";
import { remplirLaTableDeKanban, type TableDeKanban } from "./aides-kanban.ts";
import { rendreLaTable, TABLE_D_ESSAI, type TableRendue } from "./aides-grille.tsx";

export const CLE_DES_REGLAGES = cleDesReglages({ idEspace: ESPACE_A, idTable: TABLE_D_ESSAI });
afterEach(() => localStorage.clear());

export type KanbanRendu = TableRendue & { readonly contenu: TableDeKanban };

/** Rend la table d'essai du kanban, vue « Kanban » active. */
export function rendreLeKanban(
  repartition: readonly (readonly [string, number])[] = [],
  options: {
    readonly lectureSeule?: string;
    readonly libelles?: readonly string[];
    readonly remplir?: (contenu: TableDeKanban) => void;
    readonly vue?: string;
  } = {},
): KanbanRendu {
  localStorage.setItem(
    CLE_DES_REGLAGES,
    JSON.stringify({ version: 1, sections: { vue: { active: options.vue ?? "kanban" } } }),
  );
  let contenu: TableDeKanban | undefined;
  const rendu = rendreLaTable(
    (table) => {
      contenu = remplirLaTableDeKanban(table, repartition, options.libelles);
      options.remplir?.(contenu);
    },
    options.lectureSeule === undefined ? {} : { lectureSeule: options.lectureSeule },
  );
  if (contenu === undefined) {
    throw new Error("La table d'essai n'a pas été remplie.");
  }
  return { ...rendu, contenu };
}

/** La pile de ce nom accessible (« En cours, 2 cartes »). */
export function pile(nom: string | RegExp): HTMLElement {
  return screen.getByRole("group", { name: nom });
}

/** Les titres des cartes d'une pile, dans l'ordre. */
export function titresDeLaPile(nom: string | RegExp): string[] {
  return within(pile(nom))
    .queryAllByRole("listitem")
    .map((carte) => carte.querySelector("[data-carte] > span")?.textContent ?? "");
}

/** Les noms accessibles de toutes les piles, dans l'ordre. */
export function nomsDesPiles(): string[] {
  return [...document.querySelectorAll("section[role='group']")].map(
    (une) => une.getAttribute("aria-label") ?? "",
  );
}

/** La carte de ce titre : l'élément qui reçoit le focus. */
export function carte(titre: string): HTMLElement {
  const trouvee = [...document.querySelectorAll<HTMLElement>("[data-carte]")].find(
    (une) => une.getAttribute("aria-label") === titre,
  );
  if (trouvee === undefined) {
    throw new Error(`Aucune carte « ${titre} ».`);
  }
  return trouvee;
}

export function cartes(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("[data-carte]")];
}

export function annonceDeLaVue(): string {
  return screen.getAllByRole("status")[0]?.textContent ?? "";
}

// ——— Mise en page bouchonnée : piles de 180 de large espacées de 200, cartes de 40 de haut espacées de 44 ———

function rectangle(gauche: number, haut: number, largeur: number, hauteur: number): DOMRect {
  return {
    left: gauche,
    top: haut,
    width: largeur,
    height: hauteur,
    right: gauche + largeur,
    bottom: haut + hauteur,
    x: gauche,
    y: haut,
    toJSON: () => ({}),
  } as DOMRect;
}

function rectangleDeLaMiseEnPage(element: Element): DOMRect | null {
  if (element.tagName === "SECTION") {
    const rang = [...document.querySelectorAll("section")].indexOf(element as HTMLElement);
    return rectangle(rang * 200, 0, 180, 600);
  }
  const pileDeLaCarte = element.tagName === "LI" ? element.closest("section") : null;
  if (pileDeLaCarte === null) {
    return null;
  }
  const rangDeLaPile = [...document.querySelectorAll("section")].indexOf(pileDeLaCarte);
  const rangDeLaCarte = [...pileDeLaCarte.querySelectorAll("li")].indexOf(element as HTMLLIElement);
  return rectangle(rangDeLaPile * 200, 30 + rangDeLaCarte * 44, 180, 40);
}

/** Pose la mise en page bouchonnée ; rend la fonction qui la retire. */
export function bouchonnerLaMiseEnPage(): () => void {
  const originale = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return rectangleDeLaMiseEnPage(this) ?? originale.call(this);
  };
  for (const propriete of ["offsetHeight", "offsetWidth"] as const) {
    Object.defineProperty(HTMLElement.prototype, propriete, {
      configurable: true,
      get(this: HTMLElement) {
        const place = rectangleDeLaMiseEnPage(this);
        return place === null ? 0 : propriete === "offsetHeight" ? place.height : place.width;
      },
    });
  }
  return () => {
    Element.prototype.getBoundingClientRect = originale;
    for (const propriete of ["offsetHeight", "offsetWidth"] as const) {
      Reflect.deleteProperty(HTMLElement.prototype, propriete);
    }
  };
}

function evenement(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
    pointerId: 1,
    isPrimary: true,
  });
}

const attendre = () => act(() => new Promise<void>((suite) => setTimeout(suite, 40)));

/** Presse la carte, puis la déplace par les points donnés (le premier écart passe le seuil du capteur). */
export async function glisserLaCarte(
  depart: Element,
  ...points: readonly (readonly [number, number])[]
): Promise<void> {
  await act(async () => {
    depart.dispatchEvent(evenement("pointerdown", 10, 80));
  });
  for (const [x, y] of [[20, 80] as const, ...points]) {
    await act(async () => {
      document.dispatchEvent(evenement("pointermove", x, y));
    });
    await attendre();
  }
}

export async function lacherLaCarte(x: number, y: number): Promise<void> {
  await act(async () => {
    document.dispatchEvent(evenement("pointerup", x, y));
  });
  await attendre();
}

export async function abandonnerLeGeste(): Promise<void> {
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
    );
  });
  await attendre();
}
