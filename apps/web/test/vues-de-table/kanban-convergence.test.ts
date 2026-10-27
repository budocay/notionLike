// Déplacements concurrents et format du document (F-020-AC9, AC17 à AC20, AC26) : deux répliques du
// document de table qui déplacent des cartes, puis convergent ; la fonction de déplacement écrit par la
// façade et rien d'autre.
import {
  type DocumentTable,
  type IdLigne,
  ouvrirDocumentTable,
  type TableLue,
} from "@notionlike/document";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { lire } from "../aides-disque.ts";
import { deplacerUneCarte } from "../../src/vues-de-table/kanban/deplacement.ts";
import {
  COMMANDES_DE_CARTE,
  destinationDeLaCommande,
} from "../../src/vues-de-table/kanban/destination.ts";
import { contexteDe, pilesDe, tableDeKanban, titresParPile } from "./aides-kanban.ts";

const ouvertes: { fermer(): void }[] = [];
afterEach(() => ouvertes.splice(0).forEach((table) => table.fermer()));

interface Replique {
  readonly table: DocumentTable;
  /** Mises à jour émises par cette réplique depuis sa création. */
  readonly emises: Uint8Array[];
}

function repliquer(origine: Y.Doc): Replique {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(origine));
  const table = ouvrirDocumentTable(doc);
  ouvertes.push(table);
  const emises: Uint8Array[] = [];
  doc.on("update", (miseAJour: Uint8Array) => emises.push(miseAJour));
  return { table, emises };
}

function recevoir(vers: Replique, depuis: Replique): void {
  depuis.emises.forEach((miseAJour) => Y.applyUpdate(vers.table.doc, miseAJour));
}

/** Base commune : six cartes sur « Sans valeur » et trois piles. */
function base() {
  const une = tableDeKanban([
    ["a", 0],
    ["b", 0],
    ["c", 1],
    ["d", 1],
    ["e", -1],
    ["f", 2],
  ]);
  ouvertes.push(une.table);
  return une;
}

function deplacer(
  replique: Replique,
  carte: IdLigne | undefined,
  option: string | null,
  precedente: IdLigne | null,
) {
  return deplacerUneCarte(contexteDe(replique.table), carte ?? "", { option, precedente });
}

function memeVue(a: Replique, b: Replique): TableLue {
  expect(a.table.lire()).toEqual(b.table.lire());
  return a.table.lire();
}

function mulberry32(graine: number): () => number {
  let etat = graine;
  return () => {
    etat = (etat + 0x6d2b79f5) | 0;
    let t = Math.imul(etat ^ (etat >>> 15), 1 | etat);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("déplacements concurrents (F-020-AC17)", () => {
  it("F-020-AC17 deux répliques déplacent la même carte vers deux piles, quel que soit l'ordre d'application : la carte est unique, dans la même pile partout", () => {
    const une = base();
    const ligne = une.lignes.get("a");
    const [b1, b2] = [une.options[1] ?? null, une.options[2] ?? null];
    const [a, b] = [repliquer(une.table.doc), repliquer(une.table.doc)];
    deplacer(a, ligne, b1, null);
    deplacer(b, ligne, b2, null);
    const [c, d] = [repliquer(une.table.doc), repliquer(une.table.doc)];
    recevoir(c, a);
    recevoir(c, b);
    recevoir(d, b);
    recevoir(d, a);
    recevoir(a, b);
    recevoir(b, a);

    const vue = memeVue(a, b);
    expect(c.table.lire()).toEqual(vue);
    expect(d.table.lire()).toEqual(vue);
    expect(vue.lignes.filter(({ id }) => id === ligne)).toHaveLength(1);
    expect([2, 3]).toContain(titresParPile(a.table).findIndex((titres) => titres.includes("a")));
  });

  it("F-020-AC17 suites de déplacements tirées d'une graine fixe sur deux répliques : mêmes piles après convergence, chaque ligne exactement une fois", () => {
    for (const graine of [1, 7, 42, 1234, 99_999]) {
      const hasard = mulberry32(graine);
      const une = base();
      const [a, b] = [repliquer(une.table.doc), repliquer(une.table.doc)];
      for (const replique of [a, b]) {
        for (let coup = 0; coup < 12; coup += 1) {
          const piles = pilesDe(replique.table);
          const cartes = piles.flatMap(({ cartes: les }) => les);
          const carte = cartes[Math.floor(hasard() * cartes.length)];
          const commande = COMMANDES_DE_CARTE[Math.floor(hasard() * COMMANDES_DE_CARTE.length)];
          const destination =
            carte === undefined || commande === undefined
              ? undefined
              : destinationDeLaCommande(piles, carte.id, commande);
          if (carte !== undefined && destination !== undefined) {
            expect(
              deplacerUneCarte(contexteDe(replique.table), carte.id, destination).sorte,
            ).not.toBe("refusee");
          }
        }
      }
      const [versA, versB] = [a.emises.slice(), b.emises.slice()];
      recevoir(b, { table: a.table, emises: versA });
      recevoir(a, { table: b.table, emises: versB });
      const vue = memeVue(a, b);
      expect(titresParPile(a.table)).toEqual(titresParPile(b.table));
      expect(vue.lignes.map(({ id }) => id).sort()).toEqual([...une.lignes.values()].sort());
      expect(
        pilesDe(a.table)
          .flatMap(({ cartes }) => cartes.map(({ id }) => id))
          .sort(),
        `graine ${String(graine)}`,
      ).toEqual([...une.lignes.values()].sort());
    }
  });
});

describe("pile et place, pile et cellule (F-020-AC18)", () => {
  it("F-020-AC18 une réplique change la pile pendant que l'autre change la place, ou modifie une autre cellule : même vue, la pile de la première et la modification de la seconde", () => {
    const une = base();
    const a1 = une.lignes.get("a");
    for (const modification of ["place", "titre"] as const) {
      const [a, b] = [repliquer(une.table.doc), repliquer(une.table.doc)];
      deplacer(a, a1, une.options[2] ?? null, null);
      const placeAvant = a.table.lire().lignes.findIndex(({ id }) => id === a1);
      if (modification === "place") {
        b.table.deplacerLigne(a1 ?? "", 5);
      } else {
        b.table.ecrireCellule(a1 ?? "", une.titre, "Renommée");
      }
      recevoir(b, a);
      recevoir(a, b);
      const vue = memeVue(a, b);
      const piles = pilesDe(a.table);
      expect(piles[3]?.cartes.some(({ id }) => id === a1)).toBe(true);
      if (modification === "titre") {
        expect(vue.lignes.find(({ id }) => id === a1)?.cellules[0]).toBe("Renommée");
      } else {
        // La place est celle qu'a écrite l'une des deux répliques (limite assumée, H5).
        expect([placeAvant, 5]).toContain(vue.lignes.findIndex(({ id }) => id === a1));
      }
    }
  });
});

describe("déplacement et suppression (F-020-AC19)", () => {
  it("F-020-AC19 une réplique déplace une carte pendant que l'autre supprime sa ligne : la carte est absente des deux côtés, sans exception", () => {
    const une = base();
    const a1 = une.lignes.get("a");
    const [a, b] = [repliquer(une.table.doc), repliquer(une.table.doc)];
    deplacer(a, a1, une.options[1] ?? null, null);
    b.table.supprimerLigne(a1 ?? "");
    recevoir(b, a);
    recevoir(a, b);
    memeVue(a, b);
    expect(titresParPile(a.table).flat()).not.toContain("a");
    expect(a.table.lire().lignes).toHaveLength(5);
  });

  it("F-020-AC19 une réplique déplace une carte vers une pile pendant que l'autre retire son option : la carte est dans « Sans valeur », la pile a disparu", () => {
    const une = base();
    const a1 = une.lignes.get("a");
    const [a, b] = [repliquer(une.table.doc), repliquer(une.table.doc)];
    deplacer(a, a1, une.options[2] ?? null, null);
    b.table.retirerOption(une.statut, une.options[2] ?? "");
    recevoir(b, a);
    recevoir(a, b);
    memeVue(a, b);
    const piles = titresParPile(a.table);
    expect(piles).toHaveLength(3);
    expect(piles[0]).toContain("a");
    expect(piles[0]).toContain("f");
  });
});

describe("écriture refusée (F-020-AC20)", () => {
  it("F-020-AC20 une ligne disparue après une mise à jour reçue : message en français sans code, aucune seconde écriture, table inchangée", () => {
    const une = base();
    const contexte = contexteDe(une.table);
    const a1 = une.lignes.get("a") ?? "";
    une.table.supprimerLigne(a1);
    const avant = Y.encodeStateAsUpdate(une.table.doc);
    const position = vi.spyOn(une.table, "deplacerLigne");
    const resultat = deplacerUneCarte(contexte, a1, {
      option: une.options[1] ?? null,
      precedente: null,
    });

    expect(resultat.sorte).toBe("refusee");
    expect(resultat.sorte === "refusee" ? resultat.message : "").toMatch(/n'existe plus/);
    expect(resultat.sorte === "refusee" ? resultat.message : "").not.toMatch(
      /ligne-introuvable|option-introuvable/,
    );
    expect(position).not.toHaveBeenCalled();
    expect(Y.encodeStateAsUpdate(une.table.doc)).toEqual(avant);
  });

  it("F-020-AC20 une option retirée après la lecture : l'écriture de la cellule est refusée et le déplacement de la ligne n'est pas tenté", () => {
    const une = base();
    const contexte = contexteDe(une.table);
    une.table.retirerOption(une.statut, une.options[1] ?? "");
    const position = vi.spyOn(une.table, "deplacerLigne");
    const resultat = deplacerUneCarte(contexte, une.lignes.get("e") ?? "", {
      option: une.options[1] ?? null,
      precedente: une.lignes.get("c") ?? null,
    });

    expect(resultat.sorte).toBe("refusee");
    expect(resultat.sorte === "refusee" ? resultat.message : "").toMatch(/^[A-ZÉ][^-]+\.$/);
    expect(resultat.sorte === "refusee" ? resultat.message : "").not.toMatch(
      /-introuvable|-conforme/,
    );
    expect(position).not.toHaveBeenCalled();
    expect(titresParPile(une.table).flat().sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
});

describe("une seule voie d'écriture, aucun changement de format (F-020-AC9, AC26)", () => {
  it("F-020-AC9 un déplacement écrit la cellule d'abord, puis la ligne, par la façade seule", () => {
    const une = base();
    const appels: string[] = [];
    for (const nom of [
      "ecrireCellule",
      "deplacerLigne",
      "creerLigne",
      "creerColonne",
      "ajouterOption",
    ] as const) {
      const original = une.table[nom].bind(une.table) as (...arguments_: unknown[]) => unknown;
      vi.spyOn(une.table, nom).mockImplementation((...arguments_: unknown[]) => {
        appels.push(nom);
        return original(...arguments_) as never;
      });
    }
    expect(
      deplacerUneCarte(contexteDe(une.table), une.lignes.get("f") ?? "", {
        option: une.options[0] ?? null,
        precedente: une.lignes.get("a") ?? null,
      }).sorte,
    ).toBe("deplacee");
    expect(appels).toEqual(["ecrireCellule", "deplacerLigne"]);
  });

  it("F-020-AC9 la fonction de déplacement n'appelle que ecrireCellule et deplacerLigne sur le document de table", () => {
    const source = lire("src/vues-de-table/kanban/deplacement.ts").replace(/\/\/.*$/gm, "");
    const appels = [...source.matchAll(/\btable\.([A-Za-z]+)\(/g)].map(([, nom]) => nom);
    expect([...new Set(appels)].sort()).toEqual(["deplacerLigne", "ecrireCellule"]);
  });

  it("F-020-AC26 après des déplacements, la version lue et les racines du document sont inchangées ; la table lue ne diffère que par les cellules de regroupement et l'ordre des lignes", () => {
    const une = base();
    const avant = une.table.lire();
    const racines = [...une.table.doc.share.keys()].sort();
    const versions = JSON.stringify(une.table.doc.share.get("versions")?.toJSON());
    const hasard = mulberry32(5);
    for (let coup = 0; coup < 30; coup += 1) {
      const piles = pilesDe(une.table);
      const cartes = piles.flatMap(({ cartes: les }) => les);
      const carte = cartes[Math.floor(hasard() * cartes.length)];
      const destination = destinationDeLaCommande(
        piles,
        carte?.id ?? "",
        COMMANDES_DE_CARTE[Math.floor(hasard() * COMMANDES_DE_CARTE.length)] ?? "monter",
      );
      if (carte !== undefined && destination !== undefined) {
        deplacerUneCarte(contexteDe(une.table), carte.id, destination);
      }
    }
    const apres = une.table.lire();
    expect([...une.table.doc.share.keys()].sort()).toEqual(racines);
    expect(JSON.stringify(une.table.doc.share.get("versions")?.toJSON())).toBe(versions);
    expect(apres.colonnes).toEqual(avant.colonnes);
    const sansRegroupement = (table: TableLue) =>
      table.lignes
        .map(({ id, cellules }) => [id, cellules[0]])
        .sort(([x], [y]) => String(x).localeCompare(String(y)));
    expect(sansRegroupement(apres)).toEqual(sansRegroupement(avant));
    expect(apres.lignes.map(({ id }) => id).sort()).toEqual(
      avant.lignes.map(({ id }) => id).sort(),
    );
  });
});
