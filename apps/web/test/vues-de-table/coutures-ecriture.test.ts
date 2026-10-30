// F-036 (D-043, F-019) : coutures de l'écriture des cellules. Les appelants de `ecrireLaValeur(` et
// de `validerLeChamp(` sont énumérés et joints au test qui couvre leur comportement (écriture d'une
// valeur conforme, refus sans écriture) ; `LARGEUR_DES_ACTIONS` n'est plus exportée ni importée.
import { describe, expect, it } from "vitest";

import { lire, lireDossier } from "../aides-disque.ts";

const SOURCES = lireDossier("src");
const TESTS = lireDossier("test");
const DEFINITION = "src/vues-de-table/valider.ts";

interface Couverture {
  readonly fichier: string;
  readonly titre: string;
}

interface Appelant {
  readonly symboles: readonly string[];
  /** Le test qui prouve l'écriture d'une valeur conforme par cet appelant. */
  readonly ecriture: Couverture;
  /** Le test qui prouve le refus d'une valeur non conforme (ou d'un geste) sans écriture. */
  readonly refus: Couverture;
}

const CELLULES = "test/vues-de-table/cellules.test.tsx";
const KANBAN = "test/vues-de-table/kanban-ecran.test.tsx";
const CLAVIER = "test/vues-de-table/clavier.test.tsx";

// Une liste écrite : un fichier qui s'ajoute ou disparaît de `src/` fait échouer le test.
const APPELANTS: Readonly<Record<string, Appelant>> = {
  "src/vues-de-table/use-edition.ts": {
    symboles: ["ecrireLaValeur", "validerLeChamp"],
    ecriture: {
      fichier: CELLULES,
      titre: "F-018-AC27 F-018-AC33 la frappe d'un caractère entre en mode édition",
    },
    refus: {
      fichier: CELLULES,
      titre: "F-018-AC27 au-delà de 2 000 caractères, la validation est refusée",
    },
  },
  // Une case et une cellule vidée ne portent jamais une valeur non conforme : le refus qui les
  // concerne est celui d'un geste pendant une saisie refusée, document inchangé.
  "src/vues-de-table/actions.ts": {
    symboles: ["ecrireLaValeur"],
    ecriture: {
      fichier: CLAVIER,
      titre: "F-018-AC33 Suppr et Retour arrière vident la cellule courante",
    },
    refus: {
      fichier: CELLULES,
      titre: "F-018-AC28 F-018-AC29 la case d'une autre ligne, cliquée pendant une saisie refusée",
    },
  },
  "src/vues-de-table/kanban/use-titre-de-carte.ts": {
    symboles: ["validerLeChamp"],
    ecriture: {
      fichier: KANBAN,
      titre: "F-020-AC7 Entrée ouvre la saisie du titre ; Entrée la valide",
    },
    refus: {
      fichier: KANBAN,
      titre: "F-020-AC7 un titre refusé garde la saisie ouverte",
    },
  },
};

function appelsDe(symbole: string): string[] {
  const motif = new RegExp(String.raw`(?<![\w.#])${symbole}\(`);
  return [...SOURCES]
    .filter(([chemin, texte]) => chemin !== DEFINITION && motif.test(texte))
    .map(([chemin]) => chemin)
    .sort();
}

describe("appelants de ecrireLaValeur et validerLeChamp (F-036-AC8)", () => {
  it.each(["ecrireLaValeur", "validerLeChamp"])(
    "F-036-AC8 F-036-AC10 `%s(` n'est appelée, dans src/ hors de valider.ts, que par les fichiers de la liste ; un fichier de plus ou de moins fait échouer ce test en le nommant",
    (symbole) => {
      const attendus = Object.entries(APPELANTS)
        .filter(([, { symboles }]) => symboles.includes(symbole))
        .map(([chemin]) => chemin)
        .sort();

      expect(appelsDe(symbole)).toEqual(attendus);
    },
  );

  it("F-036-AC8 chaque appelant est joint à un test existant d'écriture conforme et à un test de refus, qui portent ces titres", () => {
    for (const [chemin, appelant] of Object.entries(APPELANTS)) {
      for (const { fichier, titre } of [appelant.ecriture, appelant.refus]) {
        const texte = TESTS.get(fichier);
        expect(texte, `${chemin} : ${fichier} absent`).toBeDefined();
        expect(texte, `${chemin} : « ${titre} » absent de ${fichier}`).toContain(titre);
      }
    }
  });
});

describe("retrait de LARGEUR_DES_ACTIONS (F-036-AC9)", () => {
  const SYMBOLE = /\bLARGEUR_DES_ACTIONS\b/;
  const GRILLE = "src/vues-de-table/grille.ts";
  const ICI = "test/vues-de-table/coutures-ecriture.test.ts";

  it("F-036-AC9 F-036-AC10 aucun fichier de src/ n'exporte `LARGEUR_DES_ACTIONS` ; seul grille.ts la référence, avec `LARGEUR_DES_ACTIONS_AVEC_MENTION`", () => {
    const exportee =
      /export\s+(?:declare\s+)?(?:const|let|var|function|class)\s+LARGEUR_DES_ACTIONS\b|export\s*\{[^}]*\bLARGEUR_DES_ACTIONS\b[^}]*\}|export\s+default\s+LARGEUR_DES_ACTIONS\b/;
    const exportees = [...SOURCES].filter(([, texte]) => exportee.test(texte)).map(([c]) => c);
    expect(exportees).toEqual([]);

    const referencees = [...SOURCES].filter(([, texte]) => SYMBOLE.test(texte)).map(([c]) => c);
    expect(referencees).toEqual([GRILLE]);
    expect(lire(GRILLE)).toContain("LARGEUR_DES_ACTIONS_AVEC_MENTION");
  });

  it("F-036-AC9 aucun fichier de src/ ni de test/ n'importe `LARGEUR_DES_ACTIONS`", () => {
    const importee = /import\b[^;]*\bLARGEUR_DES_ACTIONS\b[^;]*\bfrom\b/;
    const importeurs = [...SOURCES, ...[...TESTS].filter(([chemin]) => chemin !== ICI)]
      .filter(([, texte]) => importee.test(texte))
      .map(([chemin]) => chemin);

    expect(importeurs).toEqual([]);
  });
});
