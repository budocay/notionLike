// F-017, opérations locales et refus : création, écriture, renommage, déplacement, suppression,
// options, et l'ordre des refus (conception de F-017, « Codes d'erreur »).
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  creerDocumentTable,
  type DocumentTable,
  type IdColonne,
  ouvrirDocumentTable,
  type TableLue,
  type TypeDeColonne,
  type ValeurDeCellule,
} from "../src/index.ts";
import { GRAINE, NOMBRE_EXECUTIONS } from "./aides.ts";
import {
  compterMisesAJour,
  fixerDesIdentifiantsDisperses,
  fixerLesProchainsIdentifiants,
  identifiantFixe,
  refus,
  refusDe,
  valeursParNom,
} from "./aides-table.ts";

const ID_ABSENT = "00000000-0000-4000-8000-0000000000ff";

afterEach(() => {
  vi.restoreAllMocks();
});

function noms(table: TableLue): string[] {
  return table.colonnes.map((colonne) => colonne.nom);
}

function libelles(table: TableLue, colonne: IdColonne): string[] {
  return (
    table.colonnes.find((lue) => lue.id === colonne)?.options.map((option) => option.libelle) ?? [
      "colonne absente",
    ]
  );
}

function cellule(table: DocumentTable, ligne: string, colonne: string): ValeurDeCellule | null {
  const lue = table.lire();
  const indice = lue.colonnes.findIndex((col) => col.id === colonne);
  return lue.lignes.find((lig) => lig.id === ligne)?.cellules[indice] ?? null;
}

/** Une table de trois colonnes (texte, nombre, selection à deux options) et de deux lignes. */
function tableExemple() {
  const table = creerDocumentTable();
  const titre = table.creerColonne("Titre", "texte");
  const prix = table.creerColonne("Prix", "nombre");
  const etat = table.creerColonne("État", "selection");
  const ouvert = table.ajouterOption(etat, "Ouvert");
  const clos = table.ajouterOption(etat, "Clos");
  const l1 = table.creerLigne(new Map<IdColonne, ValeurDeCellule>([[titre, "a"]]));
  const l2 = table.creerLigne(new Map<IdColonne, ValeurDeCellule>([[titre, "b"]]));
  return { table, titre, prix, etat, ouvert, clos, l1, l2 };
}

describe("créer et ouvrir", () => {
  it("F-017-AC1 un document de table créé est un Y.Doc dont la table lue n'a ni colonne ni ligne, de version 1", () => {
    const table = creerDocumentTable();

    expect(table.doc).toBeInstanceOf(Y.Doc);
    expect(table.lire()).toEqual({ colonnes: [], lignes: [] });
    // Version 1 : rien d'inscrit, et le document est lu (une version supérieure est refusée, AC22).
    expect(table.doc.share.size).toBe(0);
    expect(Y.encodeStateAsUpdate(table.doc)).toEqual(Y.encodeStateAsUpdate(new Y.Doc()));
  });

  it("F-017-AC1 le Y.Doc créé garde son ramasse-miettes actif", () => {
    expect(creerDocumentTable().doc.gc).toBe(true);
  });

  it("F-017-AC1 ouvrirDocumentTable n'écrit rien sur un document vierge, et deux lectures rendent la même référence", () => {
    const doc = new Y.Doc();
    let table: DocumentTable | undefined;

    expect(compterMisesAJour(doc, () => (table = ouvrirDocumentTable(doc)))).toBe(0);
    expect(table?.lire()).toBe(table?.lire());
    expect(doc.share.size).toBe(0);
  });
});

describe("colonnes", () => {
  it("F-017-AC2 une colonne créée a un identifiant unique, apparaît en dernier, et ses cellules se lisent vides", () => {
    const table = creerDocumentTable();
    const l1 = table.creerLigne();
    const a = table.creerColonne("A", "texte");
    const b = table.creerColonne("B", "nombre");

    expect(a).not.toBe(b);
    expect(table.lire()).toEqual({
      colonnes: [
        { id: a, nom: "A", type: "texte", options: [] },
        { id: b, nom: "B", type: "nombre", options: [] },
      ],
      lignes: [{ id: l1, cellules: [null, null] }],
    });
  });

  it.each([0, 1, 2])(
    "F-017-AC2 une colonne créée à la position %i apparaît à cette position",
    (position) => {
      const table = creerDocumentTable();
      table.creerColonne("A", "texte");
      table.creerColonne("B", "texte");

      table.creerColonne("N", "case", position);

      const attendus = ["A", "B"];
      attendus.splice(position, 0, "N");
      expect(noms(table.lire())).toEqual(attendus);
    },
  );

  it.each<TypeDeColonne>(["texte", "nombre", "case", "date", "selection"])(
    "F-017-AC2 une colonne de type %s se crée et se lit avec son type",
    (type) => {
      const table = creerDocumentTable();
      const id = table.creerColonne("x", type);

      expect(table.lire().colonnes).toEqual([{ id, nom: "x", type, options: [] }]);
    },
  );

  it("F-017-AC2 l'identifiant rendu est celui que tire crypto.randomUUID, et la colonne est lue sous cet identifiant", () => {
    fixerLesProchainsIdentifiants(identifiantFixe(1), identifiantFixe(2));
    const table = creerDocumentTable();

    expect([table.creerColonne("A", "texte"), table.creerColonne("B", "texte")]).toEqual([
      identifiantFixe(1),
      identifiantFixe(2),
    ]);
    expect(table.lire().colonnes.map((colonne) => colonne.id)).toEqual([
      identifiantFixe(1),
      identifiantFixe(2),
    ]);
  });

  it("F-017-AC5 renommer une colonne change son nom, ni son type, ni sa position, ni ses cellules", () => {
    const { table, titre, prix, l1 } = tableExemple();
    table.ecrireCellule(l1, prix, 3);
    const avant = table.lire();

    table.renommerColonne(prix, "Montant");

    const apres = table.lire();
    expect(noms(apres)).toEqual(["Titre", "Montant", "État"]);
    expect(apres.colonnes[1]).toEqual({ ...avant.colonnes[1], nom: "Montant" });
    expect(apres.lignes).toEqual(avant.lignes);
    expect(cellule(table, l1, titre)).toBe("a");
  });

  it("F-017-AC5 renommer avec le même nom n'émet aucune mise à jour", () => {
    const { table, prix } = tableExemple();

    expect(compterMisesAJour(table.doc, () => table.renommerColonne(prix, "Prix"))).toBe(0);
  });

  it("F-017-AC6 déplacer une colonne l'expose à la position demandée, sans changer l'ordre des autres ni les cellules", () => {
    const { table, titre, etat, l1, ouvert } = tableExemple();
    table.ecrireCellule(l1, etat, ouvert);

    table.deplacerColonne(etat, 0);

    expect(noms(table.lire())).toEqual(["État", "Titre", "Prix"]);
    expect(valeursParNom(table.lire())).toEqual([
      { État: ouvert, Titre: "a", Prix: null },
      { État: null, Titre: "b", Prix: null },
    ]);
    table.deplacerColonne(etat, 2);
    expect(noms(table.lire())).toEqual(["Titre", "Prix", "État"]);
    expect(cellule(table, l1, titre)).toBe("a");
  });

  it("F-017-AC6 déplacer une colonne à sa propre position n'émet aucune mise à jour", () => {
    const { table, prix } = tableExemple();

    expect(compterMisesAJour(table.doc, () => table.deplacerColonne(prix, 1))).toBe(0);
  });

  it("F-017-AC7 supprimer une colonne la retire de la table lue avec ses cellules, sans l'effacer du document", () => {
    const { table, titre, prix, l1 } = tableExemple();
    table.ecrireCellule(l1, prix, 7);

    table.supprimerColonne(prix);

    expect(noms(table.lire())).toEqual(["Titre", "État"]);
    expect(table.lire().lignes.map((ligne) => ligne.cellules.length)).toEqual([2, 2]);
    const brut = table.doc.getMap("colonnes").toJSON() as Record<string, { supprimee: boolean }>;
    expect(brut[prix]?.supprimee).toBe(true);
    const lignes = table.doc.getMap("lignes").toJSON() as Record<
      string,
      { cellules: Record<string, unknown> }
    >;
    expect(lignes[l1]?.cellules).toEqual({ [titre]: "a", [prix]: 7 });
  });
});

describe("lignes et cellules", () => {
  it("F-017-AC3 une ligne créée sans valeurs apparaît en dernier, toutes cellules vides, avec un identifiant unique", () => {
    const { table, l1, l2 } = tableExemple();

    const l3 = table.creerLigne();

    expect(new Set([l1, l2, l3]).size).toBe(3);
    expect(table.lire().lignes.map((ligne) => ligne.id)).toEqual([l1, l2, l3]);
    expect(table.lire().lignes[2]?.cellules).toEqual([null, null, null]);
  });

  it("F-017-AC3 une ligne créée avec des valeurs à une position les porte, les autres cellules vides", () => {
    const { table, titre, prix, etat, clos, l1, l2 } = tableExemple();

    const l3 = table.creerLigne(
      new Map<IdColonne, ValeurDeCellule | null>([
        [prix, 0],
        [etat, clos],
        [titre, null],
      ]),
      1,
    );

    expect(table.lire().lignes.map((ligne) => ligne.id)).toEqual([l1, l3, l2]);
    expect(table.lire().lignes[1]?.cellules).toEqual([null, 0, clos]);
  });

  it.each<[TypeDeColonne, ValeurDeCellule]>([
    ["texte", "bonjour"],
    ["texte", ""],
    ["nombre", 0],
    ["nombre", -12.5],
    ["nombre", Number.MAX_VALUE],
    ["case", false],
    ["case", true],
    ["date", "2024-02-29"],
  ])(
    "F-017-AC4 F-017-AC18 une valeur conforme (%s, %j) s'écrit et se lit telle quelle, sans changer les autres cellules",
    (type, valeur) => {
      const { table, titre, l1, l2 } = tableExemple();
      const colonne = table.creerColonne("c", type);
      const avant = table.lire();

      table.ecrireCellule(l2, colonne, valeur);

      expect(cellule(table, l2, colonne)).toBe(valeur);
      expect(cellule(table, l1, colonne)).toBeNull();
      expect(table.lire().lignes[0]).toEqual(avant.lignes[0]);
      expect(cellule(table, l2, titre)).toBe("b");
    },
  );

  it("F-017-AC4 une option de la colonne s'écrit dans une cellule selection, et null vide la cellule", () => {
    const { table, etat, ouvert, l1 } = tableExemple();

    table.ecrireCellule(l1, etat, ouvert);
    expect(cellule(table, l1, etat)).toBe(ouvert);

    table.ecrireCellule(l1, etat, null);
    expect(cellule(table, l1, etat)).toBeNull();
    const lignes = table.doc.getMap("lignes").toJSON() as Record<
      string,
      { cellules: Record<string, unknown> }
    >;
    expect(Object.keys(lignes[l1]?.cellules ?? {})).not.toContain(etat);
  });

  it("F-017-AC4 F-017 H12 une cellule vide se lit null, distincte du texte vide, de 0 et de false", () => {
    const table = creerDocumentTable();
    const texte = table.creerColonne("t", "texte");
    const nombre = table.creerColonne("n", "nombre");
    const caseACocher = table.creerColonne("c", "case");
    const vide = table.creerLigne();
    const pleine = table.creerLigne(
      new Map<IdColonne, ValeurDeCellule>([
        [texte, ""],
        [nombre, 0],
        [caseACocher, false],
      ]),
    );

    expect(cellule(table, vide, texte)).toBeNull();
    expect(table.lire().lignes.find((ligne) => ligne.id === pleine)?.cellules).toEqual([
      "",
      0,
      false,
    ]);
  });

  it("F-017-AC4 -0 s'écrit 0, et réécrire la même valeur n'émet aucune mise à jour", () => {
    const { table, prix, l1 } = tableExemple();

    table.ecrireCellule(l1, prix, -0);

    expect(Object.is(cellule(table, l1, prix), 0)).toBe(true);
    expect(compterMisesAJour(table.doc, () => table.ecrireCellule(l1, prix, 0))).toBe(0);
    expect(compterMisesAJour(table.doc, () => table.ecrireCellule(l1, prix, -0))).toBe(0);
  });

  it("F-017-AC6 déplacer une ligne l'expose à la position demandée sans changer ni l'ordre des autres ni les cellules", () => {
    const { table, l1, l2 } = tableExemple();
    const l3 = table.creerLigne();
    const avant = table.lire().lignes;

    table.deplacerLigne(l3, 0);

    expect(table.lire().lignes.map((ligne) => ligne.id)).toEqual([l3, l1, l2]);
    expect([...table.lire().lignes].sort((a, b) => (a.id < b.id ? -1 : 1))).toEqual(
      [...avant].sort((a, b) => (a.id < b.id ? -1 : 1)),
    );
  });

  it("F-017-AC6 pour toute table et tout déplacement tiré, l'ordre relatif des autres et toutes les cellules sont inchangés", () => {
    fixerDesIdentifiantsDisperses();
    fc.assert(
      fc.property(
        fc.nat({ max: 8 }),
        fc.nat({ max: 5 }),
        fc.nat(),
        fc.nat(),
        fc.boolean(),
        (nombreDeLignes, nombreDeColonnes, choix, destination, surLesColonnes) => {
          const table = creerDocumentTable();
          for (let i = 0; i <= nombreDeColonnes; i += 1) table.creerColonne(`c${i}`, "nombre");
          const colonnes = table.lire().colonnes;
          for (let i = 0; i <= nombreDeLignes; i += 1) {
            table.creerLigne(new Map(colonnes.map((colonne, j) => [colonne.id, i * 10 + j])));
          }
          const avant = table.lire();
          const elements = surLesColonnes ? avant.colonnes : avant.lignes;
          const deplace = elements[choix % elements.length]?.id ?? "";
          const position = destination % elements.length;

          if (surLesColonnes) table.deplacerColonne(deplace, position);
          else table.deplacerLigne(deplace, position);

          const apres = table.lire();
          const ids = (surLesColonnes ? apres.colonnes : apres.lignes).map((e) => e.id);
          const autres = (liste: readonly string[]) => liste.filter((id) => id !== deplace);
          expect(ids[position]).toBe(deplace);
          expect(autres(ids)).toEqual(autres(elements.map((e) => e.id)));
          // Chaque cellule garde sa valeur : relue par ligne et par colonne.
          const parCle = (lue: TableLue) =>
            new Map(
              lue.lignes.flatMap((ligne) =>
                lue.colonnes.map((colonne, j) => [`${ligne.id}/${colonne.id}`, ligne.cellules[j]]),
              ),
            );
          expect(parCle(apres)).toEqual(parCle(avant));
        },
      ),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS },
    );
  });

  it("F-017-AC7 supprimer une ligne la retire de la table lue sans l'effacer du document", () => {
    const { table, l1, l2 } = tableExemple();

    table.supprimerLigne(l1);

    expect(table.lire().lignes.map((ligne) => ligne.id)).toEqual([l2]);
    const lignes = table.doc.getMap("lignes").toJSON() as Record<string, { supprimee: boolean }>;
    expect(lignes[l1]?.supprimee).toBe(true);
  });
});

describe("options", () => {
  it("F-017-AC8 ajouter des options, à la fin ou à une position, les expose dans l'ordre demandé", () => {
    const { table, etat } = tableExemple();

    table.ajouterOption(etat, "En cours", 1);
    table.ajouterOption(etat, "");

    expect(libelles(table.lire(), etat)).toEqual(["Ouvert", "En cours", "Clos", ""]);
  });

  it("F-017-AC8 renommer et déplacer une option met à jour la liste, dans l'ordre demandé", () => {
    const { table, etat, ouvert, clos, l1 } = tableExemple();
    table.ecrireCellule(l1, etat, ouvert);

    table.renommerOption(etat, ouvert, "À faire");
    table.deplacerOption(etat, clos, 0);

    expect(table.lire().colonnes[2]?.options).toEqual([
      { id: clos, libelle: "Clos" },
      { id: ouvert, libelle: "À faire" },
    ]);
    expect(cellule(table, l1, etat)).toBe(ouvert);
    expect(compterMisesAJour(table.doc, () => table.renommerOption(etat, ouvert, "À faire"))).toBe(
      0,
    );
    expect(compterMisesAJour(table.doc, () => table.deplacerOption(etat, clos, 0))).toBe(0);
  });

  it("F-017-AC8 retirer une option la retire de la liste, et les cellules qui la portaient se lisent vides", () => {
    const { table, etat, ouvert, clos, l1, l2 } = tableExemple();
    table.ecrireCellule(l1, etat, ouvert);
    table.ecrireCellule(l2, etat, clos);

    table.retirerOption(etat, ouvert);

    expect(libelles(table.lire(), etat)).toEqual(["Clos"]);
    expect(cellule(table, l1, etat)).toBeNull();
    expect(cellule(table, l2, etat)).toBe(clos);
  });
});

describe("refus et limites", () => {
  it.each<[string, (e: ReturnType<typeof tableExemple>) => unknown]>([
    ["renommer une colonne absente", ({ table }) => table.renommerColonne(ID_ABSENT, "x")],
    ["déplacer une colonne absente", ({ table }) => table.deplacerColonne(ID_ABSENT, 0)],
    ["supprimer une colonne absente", ({ table }) => table.supprimerColonne(ID_ABSENT)],
    [
      "ajouter une option à une colonne absente",
      ({ table }) => table.ajouterOption(ID_ABSENT, "x"),
    ],
    [
      "créer une ligne avec une valeur pour une colonne absente",
      ({ table }) => table.creerLigne(new Map([[ID_ABSENT, "x"]])),
    ],
    ["écrire dans une colonne absente", ({ table, l1 }) => table.ecrireCellule(l1, ID_ABSENT, "x")],
  ])("F-017-AC17 %s : colonne-introuvable, aucune mise à jour", (_cas, operation) => {
    const exemple = tableExemple();

    expect(refusDe(exemple.table.doc, () => operation(exemple))).toEqual(
      refus("colonne-introuvable"),
    );
  });

  it.each<[string, (e: ReturnType<typeof tableExemple>) => unknown]>([
    ["déplacer une ligne absente", ({ table }) => table.deplacerLigne(ID_ABSENT, 0)],
    ["supprimer une ligne absente", ({ table }) => table.supprimerLigne(ID_ABSENT)],
    [
      "écrire dans une ligne absente",
      ({ table, titre }) => table.ecrireCellule(ID_ABSENT, titre, "x"),
    ],
  ])("F-017-AC17 %s : ligne-introuvable, aucune mise à jour", (_cas, operation) => {
    const exemple = tableExemple();

    expect(refusDe(exemple.table.doc, () => operation(exemple))).toEqual(
      refus("ligne-introuvable"),
    );
  });

  it.each<[string, (e: ReturnType<typeof tableExemple>) => unknown]>([
    [
      "renommer une option absente",
      ({ table, etat }) => table.renommerOption(etat, ID_ABSENT, "x"),
    ],
    ["déplacer une option absente", ({ table, etat }) => table.deplacerOption(etat, ID_ABSENT, 0)],
    ["retirer une option absente", ({ table, etat }) => table.retirerOption(etat, ID_ABSENT)],
  ])("F-017-AC17 %s : option-introuvable, aucune mise à jour", (_cas, operation) => {
    const exemple = tableExemple();

    expect(refusDe(exemple.table.doc, () => operation(exemple))).toEqual(
      refus("option-introuvable"),
    );
  });

  it("F-017-AC17 une colonne, une ligne ou une option supprimée est refusée comme absente", () => {
    const { table, prix, etat, ouvert, l1, l2 } = tableExemple();
    table.supprimerColonne(prix);
    table.supprimerLigne(l1);
    table.retirerOption(etat, ouvert);

    expect(refusDe(table.doc, () => table.renommerColonne(prix, "x"))).toEqual(
      refus("colonne-introuvable"),
    );
    expect(refusDe(table.doc, () => table.ecrireCellule(l2, prix, 1))).toEqual(
      refus("colonne-introuvable"),
    );
    expect(refusDe(table.doc, () => table.supprimerColonne(prix))).toEqual(
      refus("colonne-introuvable"),
    );
    expect(refusDe(table.doc, () => table.ecrireCellule(l1, etat, null))).toEqual(
      refus("ligne-introuvable"),
    );
    expect(refusDe(table.doc, () => table.supprimerLigne(l1))).toEqual(refus("ligne-introuvable"));
    expect(refusDe(table.doc, () => table.retirerOption(etat, ouvert))).toEqual(
      refus("option-introuvable"),
    );
    expect(refusDe(table.doc, () => table.ecrireCellule(l2, etat, ouvert))).toEqual(
      refus("valeur-non-conforme"),
    );
  });

  it("F-017-AC17 une opération d'option sur une colonne qui n'est pas selection est refusée par colonne-sans-options", () => {
    const { table, titre, ouvert } = tableExemple();

    for (const operation of [
      () => table.ajouterOption(titre, "x"),
      () => table.renommerOption(titre, ouvert, "x"),
      () => table.deplacerOption(titre, ouvert, 0),
      () => table.retirerOption(titre, ouvert),
    ]) {
      expect(refusDe(table.doc, operation)).toEqual(refus("colonne-sans-options"));
    }
  });

  it.each<[TypeDeColonne, unknown]>([
    ["texte", "x".repeat(2001)],
    ["texte", "a\ud800b"],
    ["texte", 1],
    ["nombre", Number.NaN],
    ["nombre", Number.POSITIVE_INFINITY],
    ["nombre", Number.NEGATIVE_INFINITY],
    ["nombre", "1"],
    ["case", 0],
    ["case", "vrai"],
    ["date", 20240101],
    ["selection", ID_ABSENT],
    ["selection", true],
  ])(
    "F-017-AC18 une valeur non conforme (%s, %j) est refusée par valeur-non-conforme, sans mise à jour",
    (type, valeur) => {
      const { table, l1 } = tableExemple();
      const colonne = table.creerColonne("c", type);

      expect(
        refusDe(table.doc, () => table.ecrireCellule(l1, colonne, valeur as ValeurDeCellule)),
      ).toEqual(refus("valeur-non-conforme"));
      expect(
        refusDe(table.doc, () => table.creerLigne(new Map([[colonne, valeur as ValeurDeCellule]]))),
      ).toEqual(refus("valeur-non-conforme"));
    },
  );

  it("F-017-AC18 un texte de 2 000 unités UTF-16 est accepté, une paire de substitution valide aussi", () => {
    const { table, titre, l1 } = tableExemple();

    table.ecrireCellule(l1, titre, "é".repeat(2000));
    expect(cellule(table, l1, titre)).toBe("é".repeat(2000));
    table.ecrireCellule(l1, titre, "😀".repeat(1000));
    expect(cellule(table, l1, titre)).toBe("😀".repeat(1000));
  });

  it("F-017-AC18 l'identifiant d'une option d'une autre colonne n'est pas une valeur conforme", () => {
    const { table, ouvert, l1 } = tableExemple();
    const autre = table.creerColonne("Autre", "selection");

    expect(refusDe(table.doc, () => table.ecrireCellule(l1, autre, ouvert))).toEqual(
      refus("valeur-non-conforme"),
    );
  });

  it("F-017-AC19 un nom de colonne de 200 unités et un nom vide sont acceptés, 201 refusé par nom-non-admis", () => {
    const { table, prix } = tableExemple();

    expect(table.lire().colonnes).toHaveLength(3);
    table.creerColonne("", "texte");
    table.creerColonne("n".repeat(200), "texte");
    expect(refusDe(table.doc, () => table.creerColonne("n".repeat(201), "texte"))).toEqual(
      refus("nom-non-admis"),
    );
    expect(refusDe(table.doc, () => table.renommerColonne(prix, "n".repeat(201)))).toEqual(
      refus("nom-non-admis"),
    );
    expect(refusDe(table.doc, () => table.renommerColonne(prix, "a\udc00"))).toEqual(
      refus("nom-non-admis"),
    );
    expect(noms(table.lire())).toEqual(["Titre", "Prix", "État", "", "n".repeat(200)]);
  });

  it("F-017-AC19 un libellé d'option de 100 unités et un libellé vide sont acceptés, 101 refusé par libelle-non-admis", () => {
    const { table, etat, ouvert } = tableExemple();

    table.ajouterOption(etat, "");
    table.ajouterOption(etat, "l".repeat(100));
    expect(refusDe(table.doc, () => table.ajouterOption(etat, "l".repeat(101)))).toEqual(
      refus("libelle-non-admis"),
    );
    expect(refusDe(table.doc, () => table.renommerOption(etat, ouvert, "l".repeat(101)))).toEqual(
      refus("libelle-non-admis"),
    );
    expect(refusDe(table.doc, () => table.ajouterOption(etat, "\ud800"))).toEqual(
      refus("libelle-non-admis"),
    );
    expect(libelles(table.lire(), etat)).toEqual(["Ouvert", "Clos", "", "l".repeat(100)]);
  });

  it.each(["", "Texte", "multiple", "relation", "date-heure", undefined])(
    "F-017-AC19 le type %j n'est pas l'un des cinq : type-de-colonne-inconnu",
    (type) => {
      const table = creerDocumentTable();

      expect(refusDe(table.doc, () => table.creerColonne("x", type as TypeDeColonne))).toEqual(
        refus("type-de-colonne-inconnu"),
      );
    },
  );

  it.each([-1, 4, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "1" as unknown as number])(
    "F-017-AC19 la position %j est refusée par position-invalide, à la création comme au déplacement",
    (position) => {
      const { table, titre, etat, ouvert, l1 } = tableExemple();

      for (const operation of [
        () => table.creerColonne("x", "texte", position),
        () => table.creerLigne(undefined, position),
        () => table.ajouterOption(etat, "x", position),
        () => table.deplacerColonne(titre, position),
        () => table.deplacerLigne(l1, position),
        () => table.deplacerOption(etat, ouvert, position),
      ]) {
        expect(refusDe(table.doc, operation)).toEqual(refus("position-invalide"));
      }
    },
  );

  it("F-017-AC19 les bornes : la position vaut au plus le nombre d'éléments de destination, l'élément déplacé exclu", () => {
    const { table, titre, l1 } = tableExemple();

    expect(refusDe(table.doc, () => table.deplacerColonne(titre, 3))).toEqual(
      refus("position-invalide"),
    );
    expect(refusDe(table.doc, () => table.deplacerLigne(l1, 2))).toEqual(
      refus("position-invalide"),
    );
    expect(refusDe(table.doc, () => table.creerColonne("x", "texte", 3)).code).toBe("aucun");
    expect(refusDe(table.doc, () => table.creerLigne(undefined, 2)).code).toBe("aucun");
    expect(refusDe(table.doc, () => table.deplacerColonne(titre, 3)).code).toBe("aucun");
  });

  it("F-017-AC19 position manquante au déplacement : refusée, jamais lue comme « en dernier »", () => {
    const { table, titre } = tableExemple();

    expect(
      refusDe(table.doc, () => table.deplacerColonne(titre, undefined as unknown as number)),
    ).toEqual(refus("position-invalide"));
  });

  it("F-017-AC17 F-017-AC18 F-017-AC19 ordre des refus : arguments, puis cibles, puis valeur, puis position", () => {
    const { table, titre, etat, l1 } = tableExemple();

    // Type avant nom ; nom avant cible.
    expect(
      refusDe(table.doc, () => table.creerColonne("n".repeat(201), "x" as TypeDeColonne)).code,
    ).toBe("type-de-colonne-inconnu");
    expect(refusDe(table.doc, () => table.renommerColonne(ID_ABSENT, "n".repeat(201))).code).toBe(
      "nom-non-admis",
    );
    expect(refusDe(table.doc, () => table.ajouterOption(ID_ABSENT, "l".repeat(101))).code).toBe(
      "libelle-non-admis",
    );
    // Ligne avant colonne ; colonne avant valeur ; colonne-sans-options avant option ; option avant position.
    expect(
      refusDe(table.doc, () => table.ecrireCellule(ID_ABSENT, ID_ABSENT, Number.NaN)).code,
    ).toBe("ligne-introuvable");
    expect(refusDe(table.doc, () => table.ecrireCellule(l1, ID_ABSENT, Number.NaN)).code).toBe(
      "colonne-introuvable",
    );
    expect(refusDe(table.doc, () => table.deplacerOption(titre, ID_ABSENT, -1)).code).toBe(
      "colonne-sans-options",
    );
    expect(refusDe(table.doc, () => table.deplacerOption(etat, ID_ABSENT, -1)).code).toBe(
      "option-introuvable",
    );
    // Toutes les colonnes des valeurs initiales avant toute valeur ; valeur avant position.
    expect(
      refusDe(table.doc, () =>
        table.creerLigne(
          new Map<IdColonne, ValeurDeCellule>([
            [titre, 1],
            [ID_ABSENT, "x"],
          ]),
        ),
      ).code,
    ).toBe("colonne-introuvable");
    expect(
      refusDe(table.doc, () => table.creerLigne(new Map([[titre, 1 as ValeurDeCellule]]), -1)).code,
    ).toBe("valeur-non-conforme");
  });
});
