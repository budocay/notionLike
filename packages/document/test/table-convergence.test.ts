// F-017, convergence entre répliques : suites quelconques (propriétés), cellules d'une même ligne,
// même cellule, créations simultanées, suppressions concurrentes, options retirées, état encodé.
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  creerDocumentTable,
  type IdColonne,
  ouvrirDocumentTable,
  type TableLue,
  type ValeurDeCellule,
} from "../src/index.ts";
import { GRAINE, NOMBRE_EXECUTIONS } from "./aides.ts";
import {
  appliquer,
  type Commande,
  creerRepliqueDeTable,
  echanger,
  fixerDesIdentifiantsDisperses,
  livrer,
  nonRecues,
  observateur,
  type RepliqueDeTable,
  suiteDeCommandes,
  valeursParNom,
} from "./aides-table.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Deux répliques qui partent de la même table : deux colonnes, une selection à deux options, une ligne. */
function deuxRepliques() {
  const a = creerRepliqueDeTable(1);
  const b = creerRepliqueDeTable(2);
  const texte = a.table.creerColonne("T", "texte");
  const nombre = a.table.creerColonne("N", "nombre");
  const choix = a.table.creerColonne("S", "selection");
  const rouge = a.table.ajouterOption(choix, "rouge");
  const vert = a.table.ajouterOption(choix, "vert");
  const ligne = a.table.creerLigne();
  echanger([a, b]);
  return { a, b, texte, nombre, choix, rouge, vert, ligne };
}

function memeTablePartout(repliques: readonly RepliqueDeTable[]): TableLue {
  const [premiere, ...autres] = repliques.map((replique) => replique.table.lire());
  for (const lue of autres) {
    expect(lue).toEqual(premiere);
  }
  return premiere ?? { colonnes: [], lignes: [] };
}

// Une étape d'un scénario : une réplique applique des commandes, ou reçoit ce qu'une autre a émis.
type Etape =
  | { readonly sorte: "operer"; readonly replique: number; readonly commandes: Commande[] }
  | { readonly sorte: "livrer"; readonly de: number; readonly a: number };

const etape = (repliques: number): fc.Arbitrary<Etape> =>
  fc.oneof(
    {
      weight: 3,
      arbitrary: fc.record({
        sorte: fc.constant("operer" as const),
        replique: fc.nat({ max: repliques - 1 }),
        commandes: suiteDeCommandes(2, 6),
      }),
    },
    {
      weight: 1,
      arbitrary: fc.record({
        sorte: fc.constant("livrer" as const),
        de: fc.nat({ max: repliques - 1 }),
        a: fc.nat({ max: repliques - 1 }),
      }),
    },
  );

function jouer(repliques: readonly RepliqueDeTable[], etapes: readonly Etape[]): void {
  for (const pas of etapes) {
    if (pas.sorte === "operer") {
      const replique = repliques[pas.replique];
      pas.commandes.forEach((c) => replique && appliquer(replique.table, c));
    } else {
      const [de, a] = [repliques[pas.de], repliques[pas.a]];
      if (de && a && de !== a) nonRecues(a, de).forEach((miseAJour) => livrer(a, miseAJour));
    }
  }
}

// Livraison finale dans un ordre tiré : chaque mise à jour en attente, toutes émettrices confondues,
// arrive selon les clés de tri données, y compris avant celles dont elle dépend.
function livrerDansLOrdre(repliques: readonly RepliqueDeTable[], cles: readonly number[]): void {
  let numero = 0;
  for (const destinataire of repliques) {
    const enAttente = repliques
      .filter((emettrice) => emettrice !== destinataire)
      .flatMap((emettrice) => nonRecues(destinataire, emettrice))
      .map((miseAJour) => ({ miseAJour, cle: cles[numero++ % Math.max(cles.length, 1)] ?? 0 }));
    enAttente
      .sort((x, y) => x.cle - y.cle)
      .forEach(({ miseAJour }) => livrer(destinataire, miseAJour));
  }
}

describe("convergence de suites quelconques", () => {
  it.each([2, 3])(
    "F-017-AC10 %i répliques, opérations sans se voir, échanges partiels, livraison finale dans un ordre tiré : même table partout, égale à celle d'un observateur qui reçoit tout",
    (nombre) => {
      fixerDesIdentifiantsDisperses();
      let client = 1;
      fc.assert(
        fc.property(
          fc.array(etape(nombre), { minLength: 2, maxLength: 10, size: "max" }),
          fc.array(fc.integer(), { minLength: 1, maxLength: 40 }),
          (etapes, cles) => {
            const repliques = Array.from({ length: nombre }, () => creerRepliqueDeTable(client++));
            jouer(repliques, etapes);

            livrerDansLOrdre(repliques, cles);

            const lue = memeTablePartout(repliques);
            expect(observateur(repliques, client++)).toEqual(lue);
            expect(observateur([...repliques].reverse(), client++)).toEqual(lue);
          },
        ),
        { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS },
      );
    },
  );
});

describe("écritures concurrentes", () => {
  it("F-017-AC11 deux répliques écrivent chacune une cellule différente de la même ligne : les deux valeurs restent", () => {
    const { a, b, texte, nombre, ligne } = deuxRepliques();

    a.table.ecrireCellule(ligne, texte, "de A");
    b.table.ecrireCellule(ligne, nombre, 42);
    echanger([a, b]);

    expect(valeursParNom(memeTablePartout([a, b]))).toEqual([{ T: "de A", N: 42, S: null }]);
  });

  it("F-017-AC11 sur une ligne créée par une réplique et reçue par l'autre avant toute écriture, aucune cellule n'est perdue", () => {
    const { a, b, texte, nombre, choix, vert } = deuxRepliques();
    const ligne = b.table.creerLigne();
    echanger([a, b]);

    a.table.ecrireCellule(ligne, texte, "x");
    b.table.ecrireCellule(ligne, nombre, 1);
    b.table.ecrireCellule(ligne, choix, vert);
    echanger([a, b]);

    expect(valeursParNom(memeTablePartout([a, b]))[1]).toEqual({ T: "x", N: 1, S: vert });
  });

  it.each<[string, ValeurDeCellule | null, ValeurDeCellule | null]>([
    ["deux textes", "de A", "de B"],
    ["un texte et un vidage", "de A", null],
    ["un vidage et un texte", null, "de B"],
  ])(
    "F-017-AC12 même cellule, %s : la même valeur sur les deux, égale à l'une des deux, dans les deux ordres de livraison",
    (_cas, deA, deB) => {
      const { a, b, texte, ligne } = deuxRepliques();
      a.table.ecrireCellule(ligne, texte, "avant");
      echanger([a, b]);

      a.table.ecrireCellule(ligne, texte, deA);
      b.table.ecrireCellule(ligne, texte, deB);
      const tardive = creerRepliqueDeTable(9);
      [...b.emises, ...a.emises].forEach((miseAJour) => livrer(tardive, miseAJour));
      echanger([a, b]);

      const lue = memeTablePartout([a, b, tardive]);
      expect([deA, deB]).toContain(lue.lignes[0]?.cellules[0]);
    },
  );

  it("F-017-AC12 même nom de colonne et même libellé d'option renommés des deux côtés : une seule valeur partout, l'une des deux", () => {
    const { a, b, texte, choix, rouge } = deuxRepliques();

    a.table.renommerColonne(texte, "A");
    b.table.renommerColonne(texte, "B");
    a.table.renommerOption(choix, rouge, "ra");
    b.table.renommerOption(choix, rouge, "rb");
    echanger([a, b]);

    const lue = memeTablePartout([a, b]);
    expect(["A", "B"]).toContain(lue.colonnes[0]?.nom);
    expect(["ra", "rb"]).toContain(lue.colonnes[2]?.options[0]?.libelle);
  });

  it("F-017-AC13 deux répliques créent chacune une ligne et une colonne à la même position : toutes conservées, même ordre partout", () => {
    const { a, b, ligne } = deuxRepliques();

    const deA = a.table.creerLigne(undefined, 0);
    const deB = b.table.creerLigne(undefined, 0);
    const colA = a.table.creerColonne("ca", "texte", 1);
    const colB = b.table.creerColonne("cb", "case", 1);
    echanger([a, b]);

    const lue = memeTablePartout([a, b]);
    expect(lue.lignes.map((l) => l.id).sort()).toEqual([deA, deB, ligne].sort());
    expect(lue.lignes[2]?.id).toBe(ligne);
    expect(lue.colonnes.map((c) => c.nom)).toEqual(
      expect.arrayContaining(["T", "N", "S", "ca", "cb"]),
    );
    expect(new Set(lue.colonnes.slice(1, 3).map((c) => c.id))).toEqual(new Set([colA, colB]));
  });

  it("F-017-AC13 pour toute position tirée et tout nombre de créations par réplique, toutes les lignes créées sont conservées, dans le même ordre partout", () => {
    fixerDesIdentifiantsDisperses();
    let client = 100;
    fc.assert(
      fc.property(
        fc.nat({ max: 4 }),
        fc.nat({ max: 3 }),
        fc.array(fc.nat({ max: 3 }), { minLength: 2, maxLength: 3 }),
        fc.boolean(),
        (existantes, position, creations, surLesColonnes) => {
          const repliques = creations.map(() => creerRepliqueDeTable(client++));
          const [source] = repliques;
          for (let i = 0; i < existantes; i += 1) {
            if (surLesColonnes) source?.table.creerColonne(`c${i}`, "texte");
            else source?.table.creerLigne();
          }
          echanger(repliques);
          const crees = repliques.flatMap((replique, r) =>
            Array.from({ length: (creations[r] ?? 0) + 1 }, () =>
              surLesColonnes
                ? replique.table.creerColonne("n", "nombre", Math.min(position, existantes))
                : replique.table.creerLigne(undefined, Math.min(position, existantes)),
            ),
          );

          echanger(repliques);

          const lue = memeTablePartout(repliques);
          const ids = (surLesColonnes ? lue.colonnes : lue.lignes).map((e) => e.id);
          expect(ids).toHaveLength(existantes + crees.length);
          expect(ids).toEqual(expect.arrayContaining(crees));
        },
      ),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS },
    );
  });
});

describe("suppressions concurrentes", () => {
  it.each<[string, (e: ReturnType<typeof deuxRepliques>) => void]>([
    [
      "écrit dans l'une de ses cellules",
      ({ b, texte, ligne }) => b.table.ecrireCellule(ligne, texte, "x"),
    ],
    ["la déplace", ({ b, ligne }) => b.table.deplacerLigne(ligne, 0)],
  ])(
    "F-017-AC14 une réplique supprime une ligne pendant que l'autre %s : supprimée partout, sans exception",
    (_cas, concurrente) => {
      const exemple = deuxRepliques();
      const { a, b, ligne } = exemple;
      b.table.creerLigne();
      echanger([a, b]);

      a.table.supprimerLigne(ligne);
      concurrente(exemple);
      expect(() => echanger([a, b])).not.toThrow();

      const lue = memeTablePartout([a, b]);
      expect(lue.lignes.map((l) => l.id)).not.toContain(ligne);
      expect(lue.lignes).toHaveLength(1);
    },
  );

  it.each<[string, (e: ReturnType<typeof deuxRepliques>) => void]>([
    [
      "écrit dans l'une de ses cellules",
      ({ b, nombre, ligne }) => b.table.ecrireCellule(ligne, nombre, 5),
    ],
    ["la renomme", ({ b, nombre }) => b.table.renommerColonne(nombre, "Renommée")],
    ["la déplace", ({ b, nombre }) => b.table.deplacerColonne(nombre, 0)],
  ])(
    "F-017-AC14 une réplique supprime une colonne pendant que l'autre %s : supprimée partout, sans exception",
    (_cas, concurrente) => {
      const exemple = deuxRepliques();
      const { a, b, nombre } = exemple;

      a.table.supprimerColonne(nombre);
      concurrente(exemple);
      expect(() => echanger([a, b])).not.toThrow();

      const lue = memeTablePartout([a, b]);
      expect(lue.colonnes.map((c) => c.id)).not.toContain(nombre);
      expect(lue.colonnes.map((c) => c.nom)).toEqual(["T", "S"]);
      expect(lue.lignes[0]?.cellules).toHaveLength(2);
    },
  );

  it("F-017-AC15 une réplique retire une option pendant que l'autre l'affecte à une cellule : option absente et cellule vide partout", () => {
    const { a, b, choix, rouge, vert, ligne } = deuxRepliques();

    a.table.retirerOption(choix, rouge);
    b.table.ecrireCellule(ligne, choix, rouge);
    echanger([a, b]);

    const lue = memeTablePartout([a, b]);
    expect(lue.colonnes[2]?.options).toEqual([{ id: vert, libelle: "vert" }]);
    expect(lue.lignes[0]?.cellules[2]).toBeNull();
  });

  it("F-017-AC15 une option retirée pendant qu'une ligne est créée avec elle : cellule vide partout", () => {
    const { a, b, choix, rouge } = deuxRepliques();

    a.table.retirerOption(choix, rouge);
    const ligne = b.table.creerLigne(new Map<IdColonne, ValeurDeCellule>([[choix, rouge]]));
    echanger([a, b]);

    const lue = memeTablePartout([a, b]);
    expect(lue.lignes.find((l) => l.id === ligne)?.cellules[2]).toBeNull();
  });
});

describe("état encodé", () => {
  it("F-017-AC16 l'état complet encodé en V1 et appliqué à un Y.Doc vierge se lit comme l'original", () => {
    const { a, texte, nombre, choix, vert, ligne } = deuxRepliques();
    a.table.ecrireCellule(ligne, texte, "é😀\u0000");
    a.table.ecrireCellule(ligne, nombre, 5e-324);
    a.table.ecrireCellule(ligne, choix, vert);
    a.table.creerColonne("D", "date", 0);
    a.table.supprimerLigne(a.table.creerLigne());

    const vierge = new Y.Doc();
    Y.applyUpdate(vierge, Y.encodeStateAsUpdate(a.table.doc));

    expect(ouvrirDocumentTable(vierge).lire()).toEqual(a.table.lire());
  });

  it("F-017-AC16 F-017-AC21 un texte, un nom ou un libellé à unité UTF-16 isolée est écrit normalisé : l'état encodé se relit identique", () => {
    const table = creerDocumentTable();
    const texte = table.creerColonne("T", "texte");
    const choix = table.creerColonne("S", "selection");
    const ligne = table.creerLigne();

    table.ecrireCellule(ligne, texte, "a\ud800b");
    table.renommerColonne(texte, "\udc00");
    table.ajouterOption(choix, "x\ud83d");

    const vierge = new Y.Doc();
    Y.applyUpdate(vierge, Y.encodeStateAsUpdate(table.doc));
    expect(ouvrirDocumentTable(vierge).lire()).toEqual(table.lire());
    expect(table.lire().lignes[0]?.cellules[0]).toBe("a\ufffdb");
    expect(table.lire().colonnes.map((c) => c.nom)).toEqual(["\ufffd", "S"]);
    expect(table.lire().colonnes[1]?.options.map((o) => o.libelle)).toEqual(["x\ufffd"]);
  });

  it("F-017-AC16 F-017-AC21 pour tout texte tiré, unités isolées comprises, écrit par la façade comme nom, libellé et cellule : l'état encodé rend la même table, et la valeur lue est celle que Yjs transmet", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 8 }), (tire) => {
        const table = creerDocumentTable();
        const colonne = table.creerColonne(tire, "texte");
        const choix = table.creerColonne("S", "selection");
        table.ajouterOption(choix, tire);
        table.creerLigne(new Map([[colonne, tire]]));
        // Oracle tiré de Yjs, indépendant du module : la chaîne reçue par une autre réplique.
        const temoin = new Y.Doc();
        temoin.getMap("essai").set("t", tire);
        const transmis = new Y.Doc();
        Y.applyUpdate(transmis, Y.encodeStateAsUpdate(temoin));
        const attendu = transmis.getMap("essai").get("t");

        const vierge = new Y.Doc();
        Y.applyUpdate(vierge, Y.encodeStateAsUpdate(table.doc));
        expect(ouvrirDocumentTable(vierge).lire()).toEqual(table.lire());
        expect(table.lire().colonnes[0]?.nom).toBe(attendu);
        expect(table.lire().colonnes[1]?.options[0]?.libelle).toBe(attendu);
        expect(table.lire().lignes[0]?.cellules[0]).toBe(attendu);
      }),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS },
    );
  });

  it("F-017-AC16 pour toute suite d'opérations tirée, l'état encodé appliqué à un Y.Doc vierge rend la même table", () => {
    fixerDesIdentifiantsDisperses();
    fc.assert(
      fc.property(suiteDeCommandes(5, 40), (commandes) => {
        const table = creerDocumentTable();
        commandes.forEach((c) => appliquer(table, c));

        const vierge = new Y.Doc();
        Y.applyUpdate(vierge, Y.encodeStateAsUpdate(table.doc));

        expect(ouvrirDocumentTable(vierge).lire()).toEqual(table.lire());
      }),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS },
    );
  });
});
