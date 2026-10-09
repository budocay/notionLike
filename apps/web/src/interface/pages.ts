// Parcours purs de l'arborescence lue. Ils sont itératifs : la profondeur reçue n'est pas bornée.
import type { IdPage, PageLue } from "@notionlike/document";

interface Etape {
  readonly page: PageLue;
  readonly ancetres: readonly IdPage[];
}

function trouverEtape(pages: readonly PageLue[], id: IdPage): Etape | undefined {
  const aVoir: Etape[] = pages.map((page) => ({ page, ancetres: [] }));
  for (const etape of aVoir) {
    if (etape.page.id === id) {
      return etape;
    }
    const ancetres = [...etape.ancetres, etape.page.id];
    etape.page.enfants.forEach((page) => aVoir.push({ page, ancetres }));
  }
  return undefined;
}

export function trouverPage(pages: readonly PageLue[], id: IdPage): PageLue | undefined {
  return trouverEtape(pages, id)?.page;
}

/** Ancêtres de la page, de la racine vers elle ; vide si la page est absente ou à la racine. */
export function ancetresDe(pages: readonly PageLue[], id: IdPage): readonly IdPage[] {
  return trouverEtape(pages, id)?.ancetres ?? [];
}

/** Vrai si `id` est la page elle-même ou l'une de ses descendantes. */
export function estDansLaDescendance(page: PageLue, id: IdPage): boolean {
  return trouverEtape([page], id) !== undefined;
}

/** Une page affichée dans la barre latérale ; `niveau` vaut 1 à la racine. */
export interface RangeeVisible {
  readonly page: PageLue;
  readonly niveau: number;
}

/** Pages à afficher, dans l'ordre de l'arbre ; les sous-pages d'une page repliée sont omises. */
export function rangeesVisibles(
  racines: readonly PageLue[],
  repliees: ReadonlySet<IdPage>,
): readonly RangeeVisible[] {
  const visibles: RangeeVisible[] = [];
  const aVoir: RangeeVisible[] = [];
  const empiler = (pages: readonly PageLue[], niveau: number): void => {
    for (let indice = pages.length - 1; indice >= 0; indice -= 1) {
      const page = pages[indice];
      if (page !== undefined) {
        aVoir.push({ page, niveau });
      }
    }
  };
  empiler(racines, 1);
  for (let rangee = aVoir.pop(); rangee !== undefined; rangee = aVoir.pop()) {
    visibles.push(rangee);
    if (!repliees.has(rangee.page.id)) {
      empiler(rangee.page.enfants, rangee.niveau + 1);
    }
  }
  return visibles;
}
