// Le calcul des lignes affichées n'est refait que si la table lue ou la définition change, pas au
// défilement ni à la navigation (F-019-AC28).
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as calcul from "../../src/vues-de-table/lignes-affichees.ts";
import { ajouterUnTri, filtrer, remplirSixLignes } from "./aides-barres.tsx";
import { cellule, rangees, rendreLaTable } from "./aides-grille.tsx";

vi.mock("../../src/vues-de-table/lignes-affichees.ts", async (originale) => {
  const module = await originale<typeof import("../../src/vues-de-table/lignes-affichees.ts")>();
  return { ...module, lignesAffichees: vi.fn(module.lignesAffichees) };
});

const HAUTEUR_DE_LA_ZONE = 640;
const defilements = new WeakMap<Element, number>();

// jsdom n'a pas de mise en page (F-006 H11) : la zone défilante a une hauteur et un défilement
// bouchonnés, comme dans `fenetre.test.tsx`, pour que la fenêtre des rangées bouge vraiment.
beforeEach(() => {
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
});

afterEach(() => {
  localStorage.clear();
  Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
  Reflect.deleteProperty(Element.prototype, "scrollTop");
});

/** L'indice ARIA de la première rangée de donnée rendue : il change quand la fenêtre bouge. */
function premiereRangeeRendue(): number {
  return Number(rangees()[1]?.getAttribute("aria-rowindex"));
}

describe("recalcul des lignes affichées (F-019-AC28)", () => {
  it("F-019-AC28 le défilement et la navigation au clavier d'une grande table ne rappellent pas le calcul ; un changement de définition ou de table le rappelle", async () => {
    const { table, utilisateur } = rendreLaTable((une) => {
      remplirSixLignes(une);
      const nom = une.lire().colonnes[0]?.id ?? "";
      for (let rang = 0; rang < 300; rang += 1) {
        une.creerLigne(new Map([[nom, `Ligne ${String(rang)}`]]));
      }
    });
    await filtrer(utilisateur, { depart: "Nom", cible: "Nom" }, "contient", "ligne");
    await ajouterUnTri(utilisateur);
    const espion = vi.mocked(calcul.lignesAffichees);
    const avant = espion.mock.calls.length;
    expect(avant).toBeGreaterThan(0);

    const zone = screen.getByRole("grid").firstElementChild as HTMLElement;
    const debut = premiereRangeeRendue();
    let precedente = debut;
    for (const decalage of [1500, 4000]) {
      defilements.set(zone, decalage);
      fireEvent.scroll(zone);
      // La fenêtre a bougé : sans cela, ne pas rappeler le calcul ne prouverait rien.
      expect(premiereRangeeRendue()).toBeGreaterThan(precedente);
      precedente = premiereRangeeRendue();
    }
    defilements.set(zone, 0);
    fireEvent.scroll(zone);
    expect(premiereRangeeRendue()).toBe(debut);
    cellule(2, 2).focus();
    await utilisateur.keyboard("{PageDown}{PageDown}{Control>}{End}{/Control}{PageUp}{ArrowDown}");
    expect(espion.mock.calls.length).toBe(avant);

    await ajouterUnTri(utilisateur);
    expect(espion.mock.calls.length).toBeGreaterThan(avant);
    const apresDefinition = espion.mock.calls.length;
    // La table lue change : le calcul est rappelé, et les lignes rendues reflètent la valeur écrite.
    const ligne = table.lire().lignes[0]?.id ?? "";
    act(() => table.ecrireCellule(ligne, table.lire().colonnes[0]?.id ?? "", "Ligne écrite"));
    expect(espion.mock.calls.length).toBeGreaterThan(apresDefinition);
    expect(screen.getAllByText("Ligne écrite").length).toBeGreaterThan(0);
    // F-035-AC5 : délai explicite déclaré sur le test (option A), mêmes données et assertions (F-035-AC6).
    // F-035-AC7 : dix exécutions sous charge et marge au délai consignées en rapport ; F-035-AC11 : dettes D-042 et D-045 résorbées (traçabilité).
  }, 30_000);
});
