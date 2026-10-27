// Cibles tactiles et largeur du calendrier, tenues par les classes (F-004-AC43, AC45 pour F-021) :
// la cible de 44 pixels est la valeur par défaut de chaque commande, la cible compacte n'arrive qu'à
// partir du seuil étroit et au pointeur fin, et sous le seuil les semaines s'empilent. La mesure
// dans un navigateur est faite par `e2e/largeurs.spec.ts` (écran de référence du calendrier).
import { describe, expect, it } from "vitest";

import { CALENDRIER } from "../../src/interface/composants/calendrier.classes.ts";
import { ESPACES } from "../../src/interface/composants/compte.classes.ts";

const jetons = (classes: string): string[] => classes.split(/\s+/);

describe("cibles du calendrier (F-004-AC43)", () => {
  it.each([
    ["commande de case (« + », « ⋯ », « N autres »)", CALENDRIER.commande],
    ["entrée d'une case", CALENDRIER.entree],
  ])(
    "F-004-AC43 %s : 44 pixels par défaut, compacte seulement à etroit:pointer-fine:",
    (_, classes) => {
      const liste = jetons(classes);
      expect(liste).toContain("min-h-cible");
      expect(liste).toContain("min-w-cible");
      expect(liste).toContain("etroit:pointer-fine:min-h-rangee");
      expect(liste).toContain("etroit:pointer-fine:min-w-rangee");
      // Aucune cible compacte sans sa variante.
      expect(liste).not.toContain("min-h-rangee");
      expect(liste).not.toContain("min-w-rangee");
    },
  );

  it("F-004-AC43 les boutons du panneau « Sans date » sont ceux des espaces, de 44 pixels par défaut", () => {
    expect(jetons(ESPACES.bouton)).toContain("min-h-cible");
    expect(jetons(ESPACES.bouton)).toContain("etroit:pointer-fine:min-h-rangee");
  });
});

describe("aucun défilement horizontal du calendrier (F-004-AC45)", () => {
  it("F-004-AC45 sous le seuil étroit, les semaines s'empilent et les cases peuvent rétrécir ; la rangée de sept cases n'arrive qu'au seuil", () => {
    expect(jetons(CALENDRIER.semaine)).toEqual(
      expect.arrayContaining(["flex-col", "etroit:flex-row"]),
    );
    expect(jetons(CALENDRIER.enTetes)).toEqual(expect.arrayContaining(["hidden", "etroit:flex"]));
    expect(jetons(CALENDRIER.case)).toContain("min-w-nul");
    expect(jetons(CALENDRIER.cadre)).toContain("min-w-nul");
  });
});
