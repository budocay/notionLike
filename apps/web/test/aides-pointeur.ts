// Aides communes aux tests du geste au pointeur sous jsdom (F-020-AC12, AC25 ; veille du 2026-10-27) :
// une mise en page bouchonnée (jsdom ne calcule aucune géométrie) et les événements d'un pointeur
// primaire. Les tests du module de glisser-déposer et ceux de la vue kanban s'en servent tous.
import { act } from "@testing-library/react";

export function rectangle(gauche: number, haut: number, largeur: number, hauteur: number): DOMRect {
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

/** Pose la mise en page que décrit `miseEnPage` ; rend la fonction qui la retire. */
export function bouchonnerLaGeometrie(
  miseEnPage: (element: Element) => DOMRect | null,
): () => void {
  const originale = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return miseEnPage(this) ?? originale.call(this);
  };
  for (const propriete of ["offsetHeight", "offsetWidth"] as const) {
    Object.defineProperty(HTMLElement.prototype, propriete, {
      configurable: true,
      get(this: HTMLElement) {
        const place = miseEnPage(this);
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

/** Un événement de pointeur primaire, annulable : le capteur ignore tout autre. */
export function evenementDuPointeur(type: string, x: number, y: number): PointerEvent {
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

async function deplacerLePointeur(x: number, y: number): Promise<void> {
  await act(async () => {
    document.dispatchEvent(evenementDuPointeur("pointermove", x, y));
  });
  await attendre();
}

/** Presse l'élément, puis écarte le pointeur au point donné : le geste démarre (seuil du capteur passé). */
export async function saisirLaCarte(
  depart: Element,
  premierPoint: readonly [number, number] = [20, 80],
  presse: readonly [number, number] = [10, 80],
): Promise<void> {
  await act(async () => {
    depart.dispatchEvent(evenementDuPointeur("pointerdown", ...presse));
  });
  await deplacerLePointeur(...premierPoint);
}

/** Presse l'élément, puis déplace le pointeur par les points donnés. */
export async function glisserLaCarte(
  depart: Element,
  ...points: readonly (readonly [number, number])[]
): Promise<void> {
  await saisirLaCarte(depart);
  for (const [x, y] of points) {
    await deplacerLePointeur(x, y);
  }
}

export async function lacherLaCarte(x: number, y: number): Promise<void> {
  await act(async () => {
    document.dispatchEvent(evenementDuPointeur("pointerup", x, y));
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
