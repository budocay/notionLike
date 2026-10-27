// Toute écriture locale des vues passe par l'entonnoir `ecrire` (F-019-AC17) : il n'y a plus de
// seconde façade du document ; l'affichage figé est prévenu par la `Surveillance` que l'entonnoir
// appelle. Les constructeurs de `Moyens` et les appelants de `ecrire` sont énumérés (couture).
import { ErreurDocument } from "@notionlike/document";
import { describe, expect, it, vi } from "vitest";

import { ecrire, SANS_SURVEILLANCE, type Surveillance } from "../../src/vues-de-table/ecritures.ts";
import { lire, lister } from "../aides-disque.ts";

const MODULE = "src/vues-de-table";
const SOURCES = lister(MODULE).filter((chemin) => /\.tsx?$/.test(chemin));

function sansCommentaires(texte: string): string {
  return texte.replace(/\/\/.*$|\/\*[^]*?\*\//gm, "");
}

function surveillance(): { surveillance: Surveillance; appels: string[] } {
  const appels: string[] = [];
  return {
    appels,
    surveillance: {
      avant: () => {
        appels.push("avant");
        return () => appels.push("defaire");
      },
      creee: () => appels.push("creee"),
      deplacee: () => appels.push("deplacee"),
    },
  };
}

describe("l'entonnoir d'écriture et sa surveillance (F-019-AC17)", () => {
  it("F-019-AC17 la surveillance est prévenue avant l'opération, et l'écriture réussie n'est pas défaite", () => {
    const { surveillance: suivie, appels } = surveillance();
    const issue = ecrire(() => {
      appels.push("operation");
      return 7;
    }, suivie);
    expect(issue).toEqual({ reussie: true, valeur: 7 });
    expect(appels).toEqual(["avant", "operation"]);
  });

  it("F-019-AC17 un refus du document défait ce que la surveillance a préparé, et devient son message", () => {
    const { surveillance: suivie, appels } = surveillance();
    const issue = ecrire(() => {
      throw new ErreurDocument("valeur-non-conforme", "refus");
    }, suivie);
    expect(issue.reussie).toBe(false);
    expect(appels).toEqual(["avant", "defaire"]);
  });

  it("F-019-AC17 toute autre exception défait aussi, puis remonte", () => {
    const { surveillance: suivie, appels } = surveillance();
    expect(() =>
      ecrire(() => {
        throw new Error("défaut");
      }, suivie),
    ).toThrow("défaut");
    expect(appels).toEqual(["avant", "defaire"]);
  });

  it("F-019-AC17 sans surveillance, l'entonnoir se comporte comme avant (colonnes, options, suppression)", () => {
    expect(ecrire(() => "ok")).toEqual({ reussie: true, valeur: "ok" });
    const rien = vi.fn();
    ecrire(() => rien(), SANS_SURVEILLANCE);
    expect(rien).toHaveBeenCalledOnce();
  });
});

describe("toute écriture locale des vues passe par l'entonnoir (F-019-AC17)", () => {
  const appels = (motif: RegExp): string[] =>
    SOURCES.flatMap((chemin) =>
      [...sansCommentaires(lire(chemin)).matchAll(motif)].map(() => chemin),
    );

  it("F-019-AC17 chaque appel de ecrireCellule, creerLigne et deplacerLigne est l'opération d'un appel de ecrire", () => {
    const tous = appels(/\.(ecrireCellule|creerLigne|deplacerLigne)\(/g);
    const parLEntonnoir = appels(
      /\becrire\(\s*\(\)\s*=>\s*[\w.]+\.(ecrireCellule|creerLigne|deplacerLigne)\(/g,
    );
    expect(tous.length).toBeGreaterThan(0);
    expect(parLEntonnoir).toEqual(tous);
  });

  it("F-019-AC17 la cellule écrite et la ligne créée passent la surveillance à l'entonnoir", () => {
    const tous = appels(/\.(ecrireCellule|creerLigne)\(/g);
    const surveilles = appels(
      /\becrire\(\s*\(\)\s*=>\s*[\w.]+\.(ecrireCellule|creerLigne)\([^()]*\),\s*[\w.]+,?\s*\)/g,
    );
    expect(surveilles).toEqual(tous);
  });

  it("F-019-AC17 aucun fichier du module ne tient une seconde façade de DocumentTable", () => {
    for (const chemin of SOURCES) {
      expect(sansCommentaires(lire(chemin)), chemin).not.toMatch(
        /\bfacadeSurveillee\b|: DocumentTable \{/,
      );
    }
  });

  it("F-019-AC17 un seul fichier construit les moyens des commandes : l'état de la vue", () => {
    const constructeurs = SOURCES.filter((chemin) =>
      /(?<!readonly )\bfocaliserLInvitation:\s*\(/.test(sansCommentaires(lire(chemin))),
    );
    expect(constructeurs).toEqual([`${MODULE}/use-vue-tableau.ts`]);
    expect(sansCommentaires(lire(`${MODULE}/use-vue-tableau.ts`))).toMatch(
      /surveillance:\s*definition\.surveillance/,
    );
  });
});
