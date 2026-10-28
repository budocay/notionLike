// Cibles tactiles et largeur du calendrier, tenues par les classes (F-004-AC43, AC45 pour F-021) :
// la cible de 44 pixels est la valeur par défaut de chaque commande, la cible compacte n'arrive qu'à
// partir du seuil étroit et au pointeur fin, et sous le seuil les semaines s'empilent. La mesure
// dans un navigateur est faite par `e2e/calendrier-largeurs.spec.ts` (écran de référence du calendrier).
import { describe, expect, it } from "vitest";

import { lire } from "../aides-disque.ts";
import { CONTRASTE_TEXTE, couples } from "../aides-jetons.ts";

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

describe("contrastes du calendrier (F-021-AC31, F-004-AC7)", () => {
  const toutes = couples(lire("src/styles/jetons.css"), "texte");
  const classes = Object.values(CALENDRIER).flatMap(jetons);
  const textes = [
    ...new Set(classes.flatMap((jeton) => /^text-texte-([\w-]+)$/.exec(jeton)?.[1] ?? [])),
  ];
  const fonds = [
    ...new Set(classes.flatMap((jeton) => /^bg-surface-([\w-]+)$/.exec(jeton)?.[1] ?? [])),
  ];

  it("F-021-AC31 le calendrier n'emploie que des textes et des fonds de jetons, dont les paires relevées existent", () => {
    expect(textes).toEqual(expect.arrayContaining(["principal", "secondaire", "discret"]));
    expect(fonds).toEqual(expect.arrayContaining(["relief", "retrait", "active"]));
  });

  it.each([
    ["discret", "retrait"],
    ["principal", "active"],
    ["secondaire", "active"],
    ["secondaire", "relief"],
    ["principal", "relief"],
    ["principal", "retrait"],
  ])(
    "F-021-AC31 F-004-AC7 texte-%s sur surface-%s tient 4,5 pour 1 (paire de F-004-AC7)",
    (texte, fond) => {
      const paire = toutes.find(
        ({ premier, surface }) =>
          premier === `--color-texte-${texte}` && surface === `--color-surface-${fond}`,
      );
      expect(paire).toBeDefined();
      expect(paire?.rapport ?? 0).toBeGreaterThanOrEqual(CONTRASTE_TEXTE);
    },
  );

  it("F-021-AC31 chaque texte employé tient 4,5 pour 1 sur chaque fond employé", () => {
    for (const texte of textes) {
      for (const fond of fonds) {
        const rapport =
          toutes.find(
            ({ premier, surface }) =>
              premier === `--color-texte-${texte}` && surface === `--color-surface-${fond}`,
          )?.rapport ?? 0;
        expect(rapport, `texte-${texte} sur surface-${fond}`).toBeGreaterThanOrEqual(
          CONTRASTE_TEXTE,
        );
      }
    }
  });
});
