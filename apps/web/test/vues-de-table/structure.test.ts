// Structure du module des vues de table (F-018-AC37, AC39, AC45, AC54, AC55) : interface réduite à
// l'écran de table, aucun accès aux types partagés ni bibliothèque interdite, géométrie seule en
// ligne, limites du document tenues par une couture, lignes affichées par une seule fonction.
import { creerDocumentTable, ErreurDocument } from "@notionlike/document";
import { afterEach, describe, expect, it } from "vitest";

import { lireJetons } from "../../src/styles/lecture-jetons.ts";
import { HAUTEUR_DE_RANGEE } from "../../src/vues-de-table/grille.ts";
import * as interfaceDuModule from "../../src/vues-de-table/index.ts";
import {
  LONGUEUR_MAX_LIBELLE,
  LONGUEUR_MAX_NOM_DE_COLONNE,
  LONGUEUR_MAX_TEXTE,
} from "../../src/vues-de-table/textes.ts";
import { VUES } from "../../src/vues-de-table/vues.ts";
import { lire, lister } from "../aides-disque.ts";

const MODULE = "src/vues-de-table";
const COMPOSANTS_DE_TABLE = "src/interface/composants/Table.tsx";

function sansCommentaires(texte: string): string {
  return texte.replace(/\/\/.*$|\/\*[^]*?\*\//gm, "");
}

function sourcesDuModule(): [string, string][] {
  return lister(MODULE).map((chemin) => [chemin, sansCommentaires(lire(chemin))]);
}

function importsDe(texte: string): string[] {
  return [...texte.matchAll(/from\s+"([^"]+)"/g)].map(([, source = ""]) => source);
}

const ouvertes: { fermer(): void }[] = [];
afterEach(() => {
  ouvertes.splice(0).forEach((table) => table.fermer());
});

describe("confinement du module des vues de table (F-018-AC54)", () => {
  it("F-018-AC54 l'interface du module n'expose que l'écran de table, aucun type de bibliothèque", () => {
    expect(Object.keys(interfaceDuModule)).toEqual(["EcranDeTable"]);
    expect(lire(`${MODULE}/index.ts`)).not.toMatch(/@tanstack|yjs/);
  });

  it("F-018-AC54 le module n'importe ni yjs, ni bibliothèque de table, de défilement virtuel, de dates ou de glisser-déposer, et ne lit aucun type partagé", () => {
    const sources = sourcesDuModule();
    expect(sources.length).toBeGreaterThan(10);
    for (const [chemin, texte] of sources) {
      for (const source of importsDe(texte)) {
        expect(source, chemin).not.toMatch(
          /^(yjs|y-indexeddb|@tanstack\/|@dnd-kit\/|date-fns|dayjs|luxon|moment|react-window|react-virtual)/,
        );
        expect(
          source.startsWith(".") || ["react", "@notionlike/document"].includes(source),
          `${chemin} : ${source}`,
        ).toBe(true);
      }
      expect(texte, chemin).not.toMatch(/\.(getMap|getArray|getText|getXmlFragment|transact)\(/);
    }
  });
});

describe("styles de l'écran de table (F-018-AC55)", () => {
  it("F-018-AC55 les seuls styles en ligne sont ceux de géométrie : width, height, transform", () => {
    const proprietes = new Set<string>();
    for (const chemin of [COMPOSANTS_DE_TABLE, ...lister(MODULE)]) {
      for (const [, bloc = ""] of lire(chemin).matchAll(/style=\{\{([^]*?)\}\}/g)) {
        for (const [, nom = ""] of bloc.matchAll(/(\w+)\s*:/g)) {
          proprietes.add(nom);
        }
      }
    }
    expect([...proprietes].sort()).toEqual(["height", "transform", "width"]);
  });

  it("F-018-AC55 le module des vues n'écrit aucune classe ni animation : il rend les composants de présentation", () => {
    for (const [chemin, texte] of sourcesDuModule()) {
      expect(texte, chemin).not.toMatch(/className|animation|transition|@keyframes/);
    }
  });
});

describe("aucune requête réseau (F-018-AC39)", () => {
  it("F-018-AC39 ni le module des vues, ni la session de table, ni les réglages de vue ne nomment une API de réseau", () => {
    const fichiers = [
      ...lister(MODULE),
      ...lister("src/table"),
      "src/persistance/reglages-de-vue.ts",
      COMPOSANTS_DE_TABLE,
    ];
    for (const chemin of fichiers) {
      expect(sansCommentaires(lire(chemin)), chemin).not.toMatch(
        /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/,
      );
    }
  });
});

describe("ce que les vues partagent (F-018-AC45)", () => {
  it("F-018-AC45 chaque vue de la liste reçoit les lignes calculées ; seul lignes-affichees.ts lit les lignes de la table lue pour les afficher", () => {
    expect(VUES.map(({ id }) => id)).toEqual(["tableau", "calendrier"]);
    const ecran = sansCommentaires(lire(`${MODULE}/EcranDeTable.tsx`));
    // F-019-AC13 : la fonction reçoit aussi la définition ; l'appel est dans `use-affichage.ts`.
    expect(ecran).toMatch(/lignes=\{affichage\.lignes\}/);
    expect(sansCommentaires(lire(`${MODULE}/use-affichage.ts`))).toMatch(
      /lignesAffichees\(lecture, definition\)/,
    );
    const lecteurs = sourcesDuModule()
      .filter(([, texte]) => /\b(lue|table)\.lignes\b/.test(texte))
      .map(([chemin]) => chemin);
    // Les commandes de ligne situent la ligne dans l'ordre manuel, que la façade attend pour un
    // déplacement : ce n'est pas un affichage.
    expect(lecteurs).toEqual([`${MODULE}/actions.ts`, `${MODULE}/lignes-affichees.ts`]);
    expect(sansCommentaires(lire(`${MODULE}/actions.ts`)).match(/\blue\.lignes\b/g)).toHaveLength(
      1,
    );
  });
});

describe("limites du document (F-018-AC19, AC22, AC27)", () => {
  it("F-018-AC19 F-018-AC22 F-018-AC27 les limites que le module cite sont celles que la façade du document de table applique", () => {
    const table = creerDocumentTable();
    ouvertes.push(table);
    const refus = (operation: () => unknown): string | undefined => {
      try {
        operation();
        return undefined;
      } catch (erreur) {
        return erreur instanceof ErreurDocument ? erreur.code : "autre";
      }
    };
    const colonne = table.creerColonne("n".repeat(LONGUEUR_MAX_NOM_DE_COLONNE), "selection");
    expect(
      refus(() => table.creerColonne("n".repeat(LONGUEUR_MAX_NOM_DE_COLONNE + 1), "texte")),
    ).toBe("nom-non-admis");
    table.ajouterOption(colonne, "l".repeat(LONGUEUR_MAX_LIBELLE));
    expect(refus(() => table.ajouterOption(colonne, "l".repeat(LONGUEUR_MAX_LIBELLE + 1)))).toBe(
      "libelle-non-admis",
    );
    const texte = table.creerColonne("Texte", "texte");
    const ligne = table.creerLigne();
    table.ecrireCellule(ligne, texte, "t".repeat(LONGUEUR_MAX_TEXTE));
    expect(refus(() => table.ecrireCellule(ligne, texte, "t".repeat(LONGUEUR_MAX_TEXTE + 1)))).toBe(
      "valeur-non-conforme",
    );
  });
});

// La fenêtre place chaque rangée à `HAUTEUR_DE_RANGEE` pixels (`transform`), les classes de la
// grille s'appuient sur le jeton `--spacing-rangee` : les deux ne doivent pas diverger. L'application
// ne change pas la taille de la police racine, 1rem vaut donc 16 pixels.
describe("géométrie de la grille et jetons (F-018-AC46)", () => {
  it("F-018-AC46 HAUTEUR_DE_RANGEE vaut le jeton --spacing-rangee, converti à 16 pixels par rem", () => {
    const jeton = lireJetons(lire("src/styles/jetons.css")).theme.find(
      ({ nom }) => nom === "--spacing-rangee",
    );
    const rem = /^(\d+(?:\.\d+)?)rem$/.exec(jeton?.valeur ?? "")?.[1];

    expect(rem, jeton?.valeur).toBeDefined();
    expect(HAUTEUR_DE_RANGEE).toBe(Number(rem) * 16);
    for (const feuille of ["src/styles/entree.css", "src/styles/jetons.css"]) {
      expect(lire(feuille), feuille).not.toMatch(/(?:^|[\s{;])(?:html|:root)\s*\{[^}]*font-size/);
    }
  });
});
