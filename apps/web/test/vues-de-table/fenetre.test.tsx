// Grandes tables (F-018-AC46, AC47) : une table de 5 000 lignes et 30 colonnes, mise en page
// bouchonnée dans ce fichier (jsdom n'en a pas, F-006 H11) : la grille ne tient dans le DOM que les
// rangées de la fenêtre, au début, au milieu et à la fin du défilement ; la cellule courante et celle
// en mode édition ne sont jamais perdues.
import type { DocumentTable, LigneLue, TableLue } from "@notionlike/document";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { VueTableau } from "../../src/vues-de-table/VueTableau.tsx";

const HAUTEUR_DE_LA_ZONE = 640;
const HAUTEUR_DE_RANGEE = 32;
const LIGNES = 5000;
const COLONNES = 30;
// Rangées visibles sous la rangée d'en-têtes collée, et marge de dix de chaque côté.
const VISIBLES = (HAUTEUR_DE_LA_ZONE - HAUTEUR_DE_RANGEE) / HAUTEUR_DE_RANGEE;
const FENETRE_MAX = VISIBLES + 1 + 2 * 10;

const TABLE: TableLue = {
  colonnes: Array.from({ length: COLONNES }, (_, rang) => ({
    id: `c${String(rang)}`,
    nom: `Colonne ${String(rang)}`,
    type: "texte" as const,
    options: [],
  })),
  lignes: Array.from({ length: LIGNES }, (_, rang): LigneLue => ({
    id: `l${String(rang)}`,
    cellules: Array.from(
      { length: COLONNES },
      (_, colonne) => `${String(rang)}:${String(colonne)}`,
    ),
  })),
};

// La vue ne lit la table que par ses props ; la façade n'est appelée qu'à l'écriture.
const ecritures: string[] = [];
const FACADE = {
  ecrireCellule: (ligne: string, colonne: string, valeur: unknown) => {
    ecritures.push(`${ligne}/${colonne}=${String(valeur)}`);
  },
} as unknown as DocumentTable;

const defilements = new WeakMap<Element, number>();
let restaurer: () => void = () => undefined;

beforeEach(() => {
  ecritures.splice(0);
  const hauteur = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  const defilement = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => HAUTEUR_DE_LA_ZONE,
  });
  Object.defineProperty(Element.prototype, "scrollTop", {
    configurable: true,
    get(this: Element) {
      return defilements.get(this) ?? 0;
    },
    set(this: Element, valeur: number) {
      defilements.set(this, valeur);
    },
  });
  restaurer = () => {
    if (hauteur !== undefined) {
      Object.defineProperty(HTMLElement.prototype, "clientHeight", hauteur);
    }
    if (defilement !== undefined) {
      Object.defineProperty(Element.prototype, "scrollTop", defilement);
    }
  };
});
afterEach(() => {
  cleanup();
  restaurer();
});

function rendre() {
  render(
    <VueTableau
      table={FACADE}
      lue={TABLE}
      lignes={TABLE.lignes}
      titre="Grande"
      largeurDe={() => 180}
      reglerLargeur={() => undefined}
    />,
  );
  return userEvent.setup();
}

function zone(): HTMLElement {
  const grille = screen.getByRole("grid");
  return grille.firstElementChild as HTMLElement;
}

function lignesPresentes(): number[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((rangee) => Number(rangee.getAttribute("aria-rowindex")) - 2);
}

function defiler(vers: number): void {
  defilements.set(zone(), vers);
  act(() => void fireEvent.scroll(zone()));
}

describe("fenêtre d'une table de 5 000 lignes et 30 colonnes (F-018-AC46)", () => {
  it("F-018-AC46 au début, au milieu et à la fin du défilement, les rangées présentes ne dépassent pas la fenêtre, toutes de même hauteur", () => {
    rendre();
    const releves: Record<string, number[]> = {};
    releves.debut = lignesPresentes();
    defiler(HAUTEUR_DE_RANGEE * 2500);
    releves.milieu = lignesPresentes();
    // Le défilement le plus bas qu'un navigateur admet : le contenu moins la zone.
    defiler(HAUTEUR_DE_RANGEE * (LIGNES + 1) - HAUTEUR_DE_LA_ZONE);
    releves.fin = lignesPresentes();

    for (const [moment, lignes] of Object.entries(releves)) {
      expect(lignes.length, moment).toBeLessThanOrEqual(FENETRE_MAX);
      expect(lignes.length, moment).toBeGreaterThan(VISIBLES);
    }
    expect(releves.debut?.[0]).toBe(0);
    expect(releves.milieu).toContain(2500);
    expect(releves.fin?.at(-1)).toBe(LIGNES - 1);
    expect(screen.getByRole("grid").getAttribute("aria-rowcount")).toBe(String(LIGNES + 1));
    expect(screen.getByRole("grid").getAttribute("aria-colcount")).toBe(String(COLONNES + 1));
    const rangees = screen.getAllByRole("row").slice(1);
    expect(new Set(rangees.map((rangee) => rangee.style.height))).toEqual(new Set(["32px"]));
    expect(rangees[0]?.querySelectorAll('[role="gridcell"]')).toHaveLength(COLONNES);
  });
});

describe("cellule courante hors de la fenêtre (F-018-AC47)", () => {
  it("F-018-AC47 Mod+Fin mène à la dernière ligne : la grille défile pour l'amener et lui donne le focus", async () => {
    const utilisateur = rendre();
    const premiere = screen.getAllByRole("gridcell")[0] as HTMLElement;
    premiere.focus();
    await utilisateur.keyboard("{Control>}{End}{/Control}");

    expect(zone().scrollTop).toBe(
      HAUTEUR_DE_RANGEE * LIGNES - (HAUTEUR_DE_LA_ZONE - HAUTEUR_DE_RANGEE),
    );
    expect(document.activeElement?.textContent).toBe(
      `${String(LIGNES - 1)}:${String(COLONNES - 1)}`,
    );
    expect(lignesPresentes()).toContain(LIGNES - 1);
  });

  it("F-018-AC47 la rangée d'une cellule en mode édition reste présente quand le défilement l'éloigne ; la saisie en cours n'est pas perdue", async () => {
    const utilisateur = rendre();
    (screen.getAllByRole("gridcell")[0] as HTMLElement).focus();
    await utilisateur.keyboard("{F2} en cours");
    defiler(HAUTEUR_DE_RANGEE * 3000);

    expect(lignesPresentes()).toContain(0);
    expect(lignesPresentes().length).toBeLessThanOrEqual(FENETRE_MAX + 1);
    const champ = screen.getByRole<HTMLInputElement>("textbox", { name: "Colonne 0, ligne 1" });
    expect(champ.value).toBe("0:0 en cours");
    await utilisateur.keyboard("{Enter}");
    expect(ecritures).toEqual(["l0/c0=0:0 en cours"]);
    // F-035-AC5 : délai explicite déclaré sur le test (option A), mêmes données et assertions (F-035-AC6).
    // F-035-AC7 : dix exécutions sous charge et marge au délai consignées en rapport ; F-035-AC11 : dettes D-042 et D-045 résorbées (traçabilité).
  }, 30_000);

  it("F-018-AC47 la cellule courante, sans mode édition, n'est pas perdue quand sa rangée sort de la fenêtre", async () => {
    const utilisateur = rendre();
    const premiere = screen.getAllByRole("gridcell")[0] as HTMLElement;
    premiere.focus();
    defiler(HAUTEUR_DE_RANGEE * 4000);
    expect(lignesPresentes()).toContain(0);
    expect(document.activeElement).toBe(premiere);
    await utilisateur.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("1:0");
  });
});
