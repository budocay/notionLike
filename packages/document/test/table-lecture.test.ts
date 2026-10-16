// F-017, lecture tolérante et reconnaissance : entrées forgées par écriture directe dans le Y.Doc
// (AC20, AC21), version inconnue (AC22), document d'espace ou étranger (AC23).
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  type CodeErreurDocument,
  type ColonneLue,
  creerDocumentTable,
  ErreurDocument,
  ouvrirDocumentTable,
  type TableLue,
  type ValeurDeCellule,
} from "../src/index.ts";
import { GRAINE, NOMBRE_EXECUTIONS } from "./aides.ts";
// Documents d'espace produits par creerDocumentEspace, par l'aide suivie de F-007 (F-002-AC31).
import { creerSuivie, fermerLesSuivies } from "./aides-corbeille.ts";
import { compterMisesAJour, dateSelonLOracle, refus, refusDe } from "./aides-table.ts";

afterEach(() => {
  vi.restoreAllMocks();
  expect(fermerLesSuivies()).toBe(0);
});

const RANG = "U";
const AUTRE_RANG = "k";

/** Champs d'une entrée forgée : chaque valeur est écrite telle quelle dans une `Y.Map`. */
type Champs = Readonly<Record<string, unknown>>;

function carte(champs: Champs): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  for (const [cle, valeur] of Object.entries(champs)) {
    map.set(cle, valeur);
  }
  return map;
}

function colonneForgee(champs: Champs, options?: Readonly<Record<string, Champs>>): Y.Map<unknown> {
  const map = carte({ nom: "c", type: "texte", rang: RANG, supprimee: false, ...champs });
  if (options !== undefined) {
    map.set("options", carteDe(options));
  }
  return map;
}

function carteDe(entrees: Readonly<Record<string, Champs>>): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  for (const [id, champs] of Object.entries(entrees)) {
    map.set(id, carte({ libelle: "o", rang: RANG, supprimee: false, ...champs }));
  }
  return map;
}

function ligneForgee(cellules: Champs, champs: Champs = {}): Y.Map<unknown> {
  const map = carte({ rang: RANG, supprimee: false, ...champs });
  map.set("cellules", carte(cellules));
  return map;
}

function codeDe(operation: () => unknown): CodeErreurDocument | "aucun" | "autre" {
  try {
    operation();
    return "aucun";
  } catch (erreur) {
    return erreur instanceof ErreurDocument ? erreur.code : "autre";
  }
}

describe("entrées mal formées ignorées", () => {
  it.each<[string, unknown]>([
    ["pas une Y.Map", "colonne"],
    ["un objet simple", { nom: "c", type: "texte", rang: RANG, supprimee: false }],
    ["un Y.Text", new Y.Text("c")],
  ])("F-017-AC20 une colonne qui est %s est ignorée", (_cas, valeur) => {
    const table = creerDocumentTable();
    const bonne = table.creerColonne("bonne", "texte");
    table.doc.getMap("colonnes").set("mauvaise", valeur);

    expect(table.lire().colonnes.map((c) => c.id)).toEqual([bonne]);
  });

  it.each<[string, Champs]>([
    ["sans nom", { nom: undefined }],
    ["au nom numérique", { nom: 3 }],
    ["au nom de 201 unités", { nom: "n".repeat(201) }],
    ["au type inconnu", { type: "relation" }],
    ["au type absent", { type: null }],
    ["au rang absent", { rang: undefined }],
    ["au rang non admis (zéro final)", { rang: "U0" }],
    ["au rang de 1 025 unités", { rang: "U".repeat(1025) }],
    ["au drapeau non booléen", { supprimee: "non" }],
  ])("F-017-AC20 une colonne %s est ignorée, le reste de la table est exposé", (_cas, champs) => {
    const table = creerDocumentTable();
    const bonne = table.creerColonne("bonne", "texte");
    const ligne = table.creerLigne(new Map([[bonne, "v"]]));
    const forgee = colonneForgee(champs);
    if (champs.nom === undefined && "nom" in champs) forgee.delete("nom");
    table.doc.getMap("colonnes").set("mauvaise", forgee);

    expect(table.lire()).toEqual({
      colonnes: [{ id: bonne, nom: "bonne", type: "texte", options: [] }],
      lignes: [{ id: ligne, cellules: ["v"] }],
    });
  });

  it("F-017-AC20 une colonne selection sans carte d'options est ignorée ; une autre colonne en porte une sans effet", () => {
    const table = creerDocumentTable();
    table.doc.transact(() => {
      table.doc.getMap("colonnes").set("sel", colonneForgee({ type: "selection", nom: "S" }));
      table.doc
        .getMap("colonnes")
        .set("txt", colonneForgee({ nom: "T", rang: AUTRE_RANG }, { o: { libelle: "x" } }));
    });

    expect(table.lire().colonnes).toEqual([{ id: "txt", nom: "T", type: "texte", options: [] }]);
  });

  it.each<[string, Champs]>([
    ["sans libellé", { libelle: 1 }],
    ["au libellé de 101 unités", { libelle: "l".repeat(101) }],
    ["au rang non admis", { rang: "" }],
    ["au drapeau absent", { supprimee: null }],
  ])("F-017-AC20 une option %s est ignorée, les autres restent", (_cas, champs) => {
    const table = creerDocumentTable();
    table.doc
      .getMap("colonnes")
      .set(
        "sel",
        colonneForgee(
          { type: "selection", nom: "S" },
          { bonne: { libelle: "ok" }, mauvaise: champs },
        ),
      );

    expect(table.lire().colonnes[0]?.options).toEqual([{ id: "bonne", libelle: "ok" }]);
  });

  it.each<[string, () => Y.Map<unknown> | string]>([
    ["pas une Y.Map", () => "ligne"],
    ["sans carte de cellules", () => carte({ rang: RANG, supprimee: false })],
    ["aux cellules en objet simple", () => carte({ rang: RANG, supprimee: false, cellules: {} })],
    ["au rang numérique", () => ligneForgee({}, { rang: 1 })],
    ["au drapeau absent", () => ligneForgee({}, { supprimee: undefined })],
  ])("F-017-AC20 une ligne %s est ignorée, le reste de la table est exposé", (_cas, forger) => {
    const table = creerDocumentTable();
    const bonne = table.creerLigne();
    table.doc.getMap("lignes").set("mauvaise", forger());

    expect(table.lire().lignes.map((l) => l.id)).toEqual([bonne]);
  });

  it("F-017-AC20 F-017-AC17 une colonne ou une ligne ignorée se refuse comme absente", () => {
    const table = creerDocumentTable();
    const bonne = table.creerColonne("c", "texte");
    const ligne = table.creerLigne();
    table.doc.getMap("colonnes").set("ignoree", colonneForgee({ type: "inconnu" }));
    table.doc.getMap("lignes").set("ignoree", ligneForgee({}, { rang: "0" }));

    expect(refusDe(table.doc, () => table.renommerColonne("ignoree", "x"))).toEqual(
      refus("colonne-introuvable"),
    );
    expect(refusDe(table.doc, () => table.ecrireCellule("ignoree", bonne, "x"))).toEqual(
      refus("ligne-introuvable"),
    );
    expect(refusDe(table.doc, () => table.ecrireCellule(ligne, "ignoree", "x"))).toEqual(
      refus("colonne-introuvable"),
    );
  });
});

describe("cellules non conformes lues vides", () => {
  it.each<[string, string, unknown]>([
    ["texte", "texte", 12],
    ["texte de 2 001 unités", "texte", "x".repeat(2001)],
    ["nombre NaN", "nombre", Number.NaN],
    ["nombre infini", "nombre", Number.NEGATIVE_INFINITY],
    ["nombre en chaîne", "nombre", "4"],
    ["case en nombre", "case", 1],
    ["date hors bornes", "date", "0000-01-01"],
    ["date avec heure", "date", "2024-01-01T00:00:00Z"],
    ["selection d'une option absente", "selection", "absente"],
    ["selection d'une option retirée", "selection", "retiree"],
    ["selection d'une option ignorée", "selection", "ignoree"],
    ["un tableau", "texte", ["a"]],
    ["un objet", "nombre", { valeur: 1 }],
    ["un Y.Text", "texte", new Y.Text("a")],
    ["un Uint8Array", "texte", new Uint8Array([1])],
    ["null", "case", null],
  ])("F-017-AC21 une cellule %s se lit vide, sans exception", (_cas, type, valeur) => {
    const table = creerDocumentTable();
    table.doc.transact(() => {
      table.doc.getMap("colonnes").set(
        "col",
        colonneForgee(
          { type },
          type === "selection"
            ? {
                bonne: {},
                retiree: { supprimee: true, rang: AUTRE_RANG },
                ignoree: { libelle: 0 },
              }
            : undefined,
        ),
      );
      table.doc.getMap("lignes").set("lig", ligneForgee({ col: valeur }));
    });

    expect(table.lire().lignes).toEqual([{ id: "lig", cellules: [null] }]);
  });

  it("F-017-AC21 -0 enregistré par un pair se lit 0", () => {
    const table = creerDocumentTable();
    table.doc.transact(() => {
      table.doc.getMap("colonnes").set("col", colonneForgee({ type: "nombre" }));
      table.doc.getMap("lignes").set("lig", ligneForgee({ col: -0 }));
    });

    expect(Object.is(table.lire().lignes[0]?.cellules[0], 0)).toBe(true);
  });

  it("F-017-AC21 une cellule rattachée à une colonne absente, supprimée ou ignorée n'est pas exposée", () => {
    const table = creerDocumentTable();
    table.doc.transact(() => {
      table.doc.getMap("colonnes").set("vue", colonneForgee({ nom: "vue" }));
      table.doc
        .getMap("colonnes")
        .set("supprimee", colonneForgee({ supprimee: true, rang: AUTRE_RANG }));
      table.doc.getMap("colonnes").set("ignoree", colonneForgee({ type: 7 }));
      table.doc
        .getMap("lignes")
        .set("lig", ligneForgee({ vue: "a", absente: "b", supprimee: "c", ignoree: "d" }));
    });

    expect(table.lire()).toEqual({
      colonnes: [{ id: "vue", nom: "vue", type: "texte", options: [] }],
      lignes: [{ id: "lig", cellules: ["a"] }],
    });
  });
});

// ── Chaînes à unité UTF-16 isolée (F-017-AC20, AC21) ─────────────────────────────────────────────

/** Ce que lit une réplique qui reçoit la chaîne par l'encodage V1 : oracle tiré de Yjs, pas du module. */
function recueParUneAutreReplique(texte: string): unknown {
  const origine = new Y.Doc();
  origine.getMap("essai").set("texte", texte);
  const recue = new Y.Doc();
  Y.applyUpdate(recue, Y.encodeStateAsUpdate(origine));
  return recue.getMap("essai").get("texte");
}

describe("chaînes à unité UTF-16 isolée écrites par un pair", () => {
  it.each([
    ["a\ud800b", "a\ufffdb"],
    ["\udfff", "\ufffd"],
    ["x\ud83d", "x\ufffd"],
    ["\udc00\ud800", "\ufffd\ufffd"],
    ["\ud800\ud800\udc00", "\ufffd\ud800\udc00"],
    ["😀", "😀"],
  ])(
    "F-017-AC21 l'oracle de Yjs remplace chaque unité isolée de %j par U+FFFD, longueur inchangée",
    (texte, attendue) => {
      expect(recueParUneAutreReplique(texte)).toBe(attendue);
    },
  );

  it("F-017-AC20 F-017-AC21 un nom, un libellé et un texte à unité isolée se lisent normalisés, la même table sur la réplique d'origine et sur celle qui reçoit", () => {
    const pair = new Y.Doc();
    pair.transact(() => {
      pair.getMap("colonnes").set("col", colonneForgee({ nom: "a\ud800" }));
      pair
        .getMap("colonnes")
        .set(
          "sel",
          colonneForgee(
            { nom: "\udc00", type: "selection", rang: AUTRE_RANG },
            { o: { libelle: "\udfffz" } },
          ),
        );
      pair.getMap("lignes").set("lig", ligneForgee({ col: "a\ud800b", sel: "o" }));
    });
    const autre = new Y.Doc();
    Y.applyUpdate(autre, Y.encodeStateAsUpdate(pair));
    const attendue: TableLue = {
      colonnes: [
        { id: "col", nom: "a\ufffd", type: "texte", options: [] },
        { id: "sel", nom: "\ufffd", type: "selection", options: [{ id: "o", libelle: "\ufffdz" }] },
      ],
      lignes: [{ id: "lig", cellules: ["a\ufffdb", "o"] }],
    };

    expect(ouvrirDocumentTable(pair).lire()).toEqual(attendue);
    expect(ouvrirDocumentTable(autre).lire()).toEqual(attendue);
  });

  it("F-017-AC20 F-017-AC21 les limites ne bougent pas : 200, 100 et 2 000 unités avec une unité isolée se lisent, une de plus est ignorée ou lue vide, sur les deux répliques", () => {
    const pair = new Y.Doc();
    pair.transact(() => {
      pair.getMap("colonnes").set("n200", colonneForgee({ nom: `${"n".repeat(199)}\ud800` }));
      pair
        .getMap("colonnes")
        .set("n201", colonneForgee({ nom: `${"n".repeat(200)}\ud800`, rang: AUTRE_RANG }));
      pair.getMap("colonnes").set(
        "sel",
        colonneForgee(
          { type: "selection", rang: "z" },
          {
            l100: { libelle: `${"l".repeat(99)}\udc00` },
            l101: { libelle: `${"l".repeat(100)}\udc00` },
          },
        ),
      );
      pair.getMap("lignes").set("t2000", ligneForgee({ n200: `${"t".repeat(1999)}\ud800` }));
      pair
        .getMap("lignes")
        .set("t2001", ligneForgee({ n200: `${"t".repeat(2000)}\ud800` }, { rang: AUTRE_RANG }));
    });
    const autre = new Y.Doc();
    Y.applyUpdate(autre, Y.encodeStateAsUpdate(pair));

    for (const doc of [pair, autre]) {
      const lue = ouvrirDocumentTable(doc).lire();
      expect(lue.colonnes.map((c) => c.id)).toEqual(["n200", "sel"]);
      expect(lue.colonnes[0]?.nom).toBe(`${"n".repeat(199)}\ufffd`);
      expect(lue.colonnes[1]?.options).toEqual([
        { id: "l100", libelle: `${"l".repeat(99)}\ufffd` },
      ]);
      expect(lue.lignes.map((l) => l.cellules[0])).toEqual([`${"t".repeat(1999)}\ufffd`, null]);
    }
  });
});

// ── Propriété : entrées brutes quelconques (F-017-AC20, AC21) ────────────────────────────────────

// Chaînes courtes faites d'unités UTF-16 isolées, de paires valides et de lettres : les unités isolées
// sont rares dans `fc.string({ unit: "binary" })`.
const chaineASubstituts = fc
  .array(fc.constantFrom("a", "\ud800", "\udbff", "\udc00", "\udfff", "😀"), { maxLength: 3 })
  .map((morceaux) => morceaux.join(""));

// Une chaîne courte, à unités isolées une fois sur deux quand la forge en demande.
const texteForge = (avecSubstituts: boolean): fc.Arbitrary<string> =>
  avecSubstituts
    ? fc.oneof(fc.string({ maxLength: 3 }), chaineASubstituts)
    : fc.string({ maxLength: 3 });

// Valeurs brutes de tout type ; `fraiche` construit à l'application les types partagés, qu'un Y.Doc
// n'accepte qu'une fois.
const brute = (avecSubstituts: boolean): fc.Arbitrary<() => unknown> =>
  fc.oneof(
    fc
      .oneof(
        fc.string({ maxLength: 6 }),
        avecSubstituts
          ? fc.oneof(fc.string({ unit: "binary", maxLength: 4 }), chaineASubstituts)
          : fc.string({ unit: "grapheme", maxLength: 4 }),
        fc.constantFrom(
          "texte",
          "nombre",
          "case",
          "date",
          "selection",
          "U",
          "k",
          "1",
          "0001-01-01",
        ),
        fc.constantFrom("2024-02-29", "2023-02-29", "x".repeat(2001), "n".repeat(201), "U0"),
        fc.double(),
        fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, -0, 0, 1e308),
        fc.integer(),
        fc.boolean(),
        fc.constantFrom(null, undefined),
        fc.array(fc.nat(), { maxLength: 2 }),
        fc.dictionary(fc.string({ maxLength: 2 }), fc.nat(), { maxKeys: 2, noNullPrototype: true }),
      )
      .map((valeur) => () => valeur),
    fc.constantFrom(
      () => new Y.Text("t"),
      () => new Y.Map(),
      () => new Y.Array(),
      () => new Uint8Array([1, 2]),
    ),
  );

const IDS = ["a", "b", "c", "d"];

interface Forge {
  readonly colonnes: Readonly<Record<string, Record<string, () => unknown>>>;
  readonly options: Readonly<Record<string, Record<string, Record<string, () => unknown>>>>;
  readonly lignes: Readonly<Record<string, Record<string, () => unknown>>>;
  readonly cellules: Readonly<Record<string, Record<string, () => unknown>>>;
}

// Chaque champ vaut, le plus souvent, une valeur bien formée, sinon une valeur brute.
function champ(
  bonnes: fc.Arbitrary<unknown>,
  avecSubstituts: boolean,
): fc.Arbitrary<() => unknown> {
  return fc.oneof(
    { weight: 8, arbitrary: bonnes.map((valeur) => () => valeur) },
    { weight: 1, arbitrary: brute(avecSubstituts) },
  );
}

const forge = (avecSubstituts: boolean): fc.Arbitrary<Forge> => {
  const rang = champ(fc.constantFrom("U", "k", "1", "z", "UU"), avecSubstituts);
  const supprimee = champ(
    fc.oneof({ weight: 4, arbitrary: fc.constant(false) }, fc.constant(true)),
    avecSubstituts,
  );
  // Une valeur de chaque type, dont les identifiants d'option : la conformité dépend de la colonne.
  const valeur = champ(
    fc.oneof(
      texteForge(avecSubstituts),
      fc.integer(),
      fc.boolean(),
      // Des jours valides et des presque-jours : l'oracle de date les départage.
      fc.constantFrom("2024-02-29", "0001-01-01", "2023-02-29", "1900-02-29", "0000-01-01", ...IDS),
    ),
    avecSubstituts,
  );
  const parTousLesIds = <T>(arbitraire: fc.Arbitrary<T>) =>
    fc.record(
      Object.fromEntries(IDS.map((id) => [id, arbitraire])) as Record<string, fc.Arbitrary<T>>,
    );
  const parId = <T>(arbitraire: fc.Arbitrary<T>) =>
    fc.dictionary(fc.constantFrom(...IDS), arbitraire, {
      minKeys: 1,
      maxKeys: IDS.length,
      size: "max",
    });
  return fc.record({
    colonnes: parId(
      fc.record({
        nom: champ(texteForge(avecSubstituts), avecSubstituts),
        type: champ(
          fc.constantFrom("texte", "nombre", "case", "date", "selection"),
          avecSubstituts,
        ),
        rang,
        supprimee,
      }),
    ),
    options: parId(
      parId(
        fc.record({ libelle: champ(texteForge(avecSubstituts), avecSubstituts), rang, supprimee }),
      ),
    ),
    lignes: parId(fc.record({ rang, supprimee })),
    // Pour chaque ligne possible, une valeur par colonne possible : les cellules visent des colonnes lues.
    cellules: parTousLesIds(parTousLesIds(valeur)),
  });
};

function appliquerForge(doc: Y.Doc, { colonnes, options, lignes, cellules }: Forge): void {
  const evaluer = (champs: Record<string, () => unknown>) =>
    Object.fromEntries(Object.entries(champs).map(([cle, fraiche]) => [cle, fraiche()]));
  doc.transact(() => {
    for (const [id, champs] of Object.entries(colonnes)) {
      const map = carte(evaluer(champs));
      const siennes = options[id];
      if (siennes !== undefined) {
        const carteOptions = new Y.Map<unknown>();
        for (const [option, champsOption] of Object.entries(siennes)) {
          carteOptions.set(option, carte(evaluer(champsOption)));
        }
        map.set("options", carteOptions);
      }
      doc.getMap("colonnes").set(id, map);
    }
    for (const [id, champs] of Object.entries(lignes)) {
      const map = carte(evaluer(champs));
      map.set("cellules", carte(evaluer(cellules[id] ?? {})));
      doc.getMap("lignes").set(id, map);
    }
  });
}

const BIEN_FORMEE = (texte: string): boolean => {
  try {
    encodeURIComponent(texte);
    return true;
  } catch {
    return false;
  }
};

// Oracle indépendant du module : chaque valeur exposée est conforme au type de sa colonne.
function conformeAuType(colonne: ColonneLue, valeur: ValeurDeCellule): boolean {
  return {
    texte: typeof valeur === "string" && valeur.length <= 2000 && BIEN_FORMEE(valeur),
    nombre: typeof valeur === "number" && Number.isFinite(valeur) && !Object.is(valeur, -0),
    case: typeof valeur === "boolean",
    date: typeof valeur === "string" && dateSelonLOracle(valeur),
    selection: colonne.options.some((option) => option.id === valeur),
  }[colonne.type];
}

function verifierConformite(lue: TableLue): void {
  lue.colonnes.forEach((colonne, indice) => {
    expect(colonne.nom.length).toBeLessThanOrEqual(200);
    expect(BIEN_FORMEE(colonne.nom)).toBe(true);
    expect(["texte", "nombre", "case", "date", "selection"]).toContain(colonne.type);
    for (const option of colonne.options) {
      expect(option.libelle.length).toBeLessThanOrEqual(100);
      expect(BIEN_FORMEE(option.libelle)).toBe(true);
    }
    for (const ligne of lue.lignes) {
      expect(ligne.cellules).toHaveLength(lue.colonnes.length);
      const valeur = ligne.cellules[indice] ?? null;
      if (valeur !== null) {
        expect(conformeAuType(colonne, valeur), `${colonne.type} ${String(valeur)}`).toBe(true);
      }
    }
  });
}

describe("entrées brutes quelconques", () => {
  it("F-017-AC20 F-017-AC21 pour toute forge, lire() ne lève jamais, toute valeur exposée est conforme, et deux répliques qui la reçoivent dans des ordres différents lisent la même table", () => {
    fc.assert(
      fc.property(forge(true), forge(true), (premiere, seconde) => {
        const [x, y] = [new Y.Doc(), new Y.Doc()];
        appliquerForge(x, premiere);
        appliquerForge(y, seconde);
        const [ux, uy] = [Y.encodeStateAsUpdate(x), Y.encodeStateAsUpdate(y)];
        const [r1, r2] = [new Y.Doc(), new Y.Doc()];
        Y.applyUpdate(r1, ux);
        Y.applyUpdate(r1, uy);
        Y.applyUpdate(r2, uy);
        Y.applyUpdate(r2, ux);

        for (const doc of [x, y, r1, r2]) {
          expect(() => ouvrirDocumentTable(doc).lire()).not.toThrow();
          verifierConformite(ouvrirDocumentTable(doc).lire());
        }
        expect(ouvrirDocumentTable(r1).lire()).toEqual(ouvrirDocumentTable(r2).lire());
      }),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS },
    );
  });

  it.each([false, true])(
    "F-017-AC21 F-017-AC10 unités UTF-16 isolées tirées : %s ; la réplique qui forge et celle qui reçoit lisent la même table",
    (avecSubstituts) => {
      fc.assert(
        fc.property(forge(avecSubstituts), (forgee) => {
          const pair = new Y.Doc();
          appliquerForge(pair, forgee);
          const recue = new Y.Doc();
          Y.applyUpdate(recue, Y.encodeStateAsUpdate(pair));

          expect(ouvrirDocumentTable(recue).lire()).toEqual(ouvrirDocumentTable(pair).lire());
        }),
        { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS },
      );
    },
  );
});

// ── Reconnaissance (F-017-AC22, AC23) ─────────────────────────────────────────────────────────────

const OPERATIONS_D_ECRITURE: readonly [
  string,
  (table: ReturnType<typeof ouvrirDocumentTable>) => unknown,
][] = [
  ["creerColonne", (t) => t.creerColonne("x", "texte")],
  ["renommerColonne", (t) => t.renommerColonne("c", "x")],
  ["deplacerColonne", (t) => t.deplacerColonne("c", 0)],
  ["supprimerColonne", (t) => t.supprimerColonne("c")],
  ["ajouterOption", (t) => t.ajouterOption("c", "x")],
  ["renommerOption", (t) => t.renommerOption("c", "o", "x")],
  ["deplacerOption", (t) => t.deplacerOption("c", "o", 0)],
  ["retirerOption", (t) => t.retirerOption("c", "o")],
  ["creerLigne", (t) => t.creerLigne()],
  ["deplacerLigne", (t) => t.deplacerLigne("l", 0)],
  ["supprimerLigne", (t) => t.supprimerLigne("l")],
  ["ecrireCellule", (t) => t.ecrireCellule("l", "c", "x")],
];

function versionInscrite(doc: Y.Doc, ...versions: unknown[]): void {
  doc.getArray<unknown>("versions").push(versions);
}

function etatEncode(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

describe("version du document de table", () => {
  it.each<[string, unknown[]]>([
    ["2", [2]],
    ["1 puis 3", [1, 3]],
    ["1,5", [1.5]],
    ["une chaîne", ["2"]],
    ["0", [0]],
  ])(
    "F-017-AC22 une version inscrite %s : lecture et toute écriture refusées par version-non-prise-en-charge, document inchangé",
    (_cas, versions) => {
      const doc = new Y.Doc();
      const table = ouvrirDocumentTable(doc);
      table.creerColonne("c", "texte");
      versionInscrite(doc, ...versions);
      const avant = etatEncode(doc);

      expect(codeDe(() => table.lire())).toBe("version-non-prise-en-charge");
      expect(codeDe(() => ouvrirDocumentTable(doc).lire())).toBe("version-non-prise-en-charge");
      for (const [nom, operation] of OPERATIONS_D_ECRITURE) {
        expect(
          refusDe(doc, () => operation(table)),
          nom,
        ).toEqual(refus("version-non-prise-en-charge"));
      }
      expect(etatEncode(doc)).toEqual(avant);
    },
  );

  it("F-017-AC22 la version 1 inscrite est prise en charge, comme une liste vide", () => {
    const doc = new Y.Doc();
    versionInscrite(doc, 1, 1);

    expect(ouvrirDocumentTable(doc).lire()).toEqual({ colonnes: [], lignes: [] });
  });

  it("F-017-AC22 une version supérieure reçue après l'ouverture fait refuser la lecture, et l'abonné en est notifié une fois", () => {
    const table = creerDocumentTable();
    table.creerColonne("c", "texte");
    let notifications = 0;
    table.abonner(() => (notifications += 1));
    const pair = new Y.Doc();
    Y.applyUpdate(pair, etatEncode(table.doc));
    versionInscrite(pair, 2);

    Y.applyUpdate(table.doc, etatEncode(pair));

    expect(codeDe(() => table.lire())).toBe("version-non-prise-en-charge");
    expect(notifications).toBe(1);
  });
});

describe("document qui n'est pas une table", () => {
  it("F-017-AC23 un document produit par creerDocumentEspace : lecture et toute écriture refusées par pas-un-document-de-table, sans rien y écrire", () => {
    const espace = creerSuivie();
    espace.creerPage("p");
    const avant = etatEncode(espace.doc);
    const racines = [...espace.doc.share.keys()].sort();
    let table: ReturnType<typeof ouvrirDocumentTable> | undefined;

    expect(compterMisesAJour(espace.doc, () => (table = ouvrirDocumentTable(espace.doc)))).toBe(0);
    expect(codeDe(() => table?.lire())).toBe("pas-un-document-de-table");
    for (const [nom, operation] of OPERATIONS_D_ECRITURE) {
      expect(
        refusDe(espace.doc, () => table && operation(table)),
        nom,
      ).toEqual(refus("pas-un-document-de-table"));
    }
    expect(etatEncode(espace.doc)).toEqual(avant);
    expect([...espace.doc.share.keys()].sort()).toEqual(racines);
    table?.fermer();
  });

  it("F-017-AC23 un document d'espace reçu par mise à jour, même vidé de ses pages, est refusé", () => {
    const espace = creerSuivie();
    const page = espace.creerPage("p");
    espace.mettreALaCorbeille(page);
    espace.supprimerDefinitivement(page);
    const recu = new Y.Doc();
    Y.applyUpdate(recu, etatEncode(espace.doc));

    expect(codeDe(() => ouvrirDocumentTable(recu).lire())).toBe("pas-un-document-de-table");
  });

  it("F-017-AC23 un document de page (son fragment de contenu), ou un type racine étranger, est refusé", () => {
    const page = new Y.Doc();
    page.getXmlFragment("contenu");
    const etranger = new Y.Doc();
    etranger.getMap("autre").set("x", 1);

    expect(codeDe(() => ouvrirDocumentTable(page).lire())).toBe("pas-un-document-de-table");
    expect(codeDe(() => ouvrirDocumentTable(etranger).lire())).toBe("pas-un-document-de-table");
  });

  it.each<[string, (doc: Y.Doc) => void]>([
    ["colonnes en Y.Array", (doc) => void doc.getArray("colonnes")],
    ["lignes en Y.Text", (doc) => void doc.getText("lignes")],
    ["versions en Y.Map", (doc) => void doc.getMap("versions")],
  ])(
    "F-017-AC23 une racine du format déjà définie sous une autre nature (%s) vaut pas-un-document-de-table",
    (_cas, definir) => {
      const doc = new Y.Doc();
      definir(doc);

      expect(codeDe(() => ouvrirDocumentTable(doc).lire())).toBe("pas-un-document-de-table");
      expect(refusDe(doc, () => ouvrirDocumentTable(doc).creerLigne())).toEqual(
        refus("pas-un-document-de-table"),
      );
    },
  );

  it("F-017-AC23 F-017-AC22 la version est contrôlée avant la liste blanche", () => {
    const doc = new Y.Doc();
    doc.getMap("pages");
    versionInscrite(doc, 2);

    expect(codeDe(() => ouvrirDocumentTable(doc).lire())).toBe("version-non-prise-en-charge");
  });

  it("F-017-AC23 un Y.Doc vierge, en attente de son contenu, s'ouvre et se lit comme une table vide, puis lit la table reçue", () => {
    const vierge = new Y.Doc();
    const table = ouvrirDocumentTable(vierge);
    expect(table.lire()).toEqual({ colonnes: [], lignes: [] });

    const source = creerDocumentTable();
    const colonne = source.creerColonne("c", "date");
    source.creerLigne(new Map([[colonne, "2024-02-29"]]));
    Y.applyUpdate(vierge, etatEncode(source.doc));

    expect(table.lire()).toEqual(source.lire());
  });

  it("F-017-AC23 un état vierge appliqué laisse le document lisible comme table", () => {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, etatEncode(new Y.Doc()));

    expect(ouvrirDocumentTable(doc).lire()).toEqual({ colonnes: [], lignes: [] });
  });

  it("F-017-AC23 une écriture refusée sur un document d'espace n'y crée aucun type racine, et le refus persiste", () => {
    const espace = creerSuivie();
    const table = ouvrirDocumentTable(espace.doc);

    expect(codeDe(() => table.creerColonne("c", "texte"))).toBe("pas-un-document-de-table");
    expect(espace.doc.share.has("colonnes")).toBe(false);
    expect(codeDe(() => table.lire())).toBe("pas-un-document-de-table");
    table.fermer();
  });
});
