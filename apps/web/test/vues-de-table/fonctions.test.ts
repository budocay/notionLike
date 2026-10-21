// Fonctions sans DOM du module des vues de table (F-018-AC26, AC27, AC28, AC30, AC33, AC45, AC46),
// chacune prouvée sur une table de cas tenue en un seul endroit.
import type { ColonneLue, TableLue, ValeurDeCellule } from "@notionlike/document";
import { describe, expect, it } from "vitest";

import { lire, lister } from "../aides-disque.ts";
import {
  dateAffichee,
  estCochee,
  nombreAffiche,
  texteAffiche,
} from "../../src/vues-de-table/affichage.ts";
import { defilementPour, fenetre, indicesRendus } from "../../src/vues-de-table/fenetre.ts";
import { colonneDeTitre, lignesAffichees } from "../../src/vues-de-table/lignes-affichees.ts";
import { type Deplacement, deplacer } from "../../src/vues-de-table/navigation-grille.ts";
import {
  analyserDate,
  analyserNombre,
  analyserTexte,
  memeValeur,
} from "../../src/vues-de-table/saisie.ts";

function colonne(type: ColonneLue["type"], options: ColonneLue["options"] = []): ColonneLue {
  return { id: `c-${type}`, nom: type, type, options };
}

const SELECTION = colonne("selection", [
  { id: "o1", libelle: "En cours" },
  { id: "o2", libelle: "" },
]);

// Table de cas de l'affichage (AC26), par type : valeur enregistrée, texte affiché.
const AFFICHAGES: readonly [ColonneLue, ValeurDeCellule | null, string][] = [
  [colonne("texte"), "Bonjour", "Bonjour"],
  [colonne("texte"), "  espaces  ", "  espaces  "],
  [colonne("texte"), null, ""],
  [colonne("nombre"), 0, "0"],
  [colonne("nombre"), 3.5, "3,5"],
  [colonne("nombre"), -12, "-12"],
  [colonne("nombre"), 1234567.89, "1234567,89"],
  [colonne("nombre"), 0.1 + 0.2, "0,30000000000000004"],
  [colonne("nombre"), 1e21, "1e+21"],
  [colonne("nombre"), null, ""],
  [colonne("date"), "2026-10-21", "21/10/2026"],
  [colonne("date"), "0001-01-01", "01/01/0001"],
  [colonne("date"), null, ""],
  [SELECTION, "o1", "En cours"],
  [SELECTION, "o2", "Sans libellé"],
  [SELECTION, "absente", ""],
  [SELECTION, null, ""],
  [colonne("case"), true, ""],
];

describe("affichage d'une cellule (F-018-AC26)", () => {
  it.each(AFFICHAGES)("F-018-AC26 %o, valeur %o : « %s »", (lue, valeur, attendu) => {
    expect(texteAffiche(lue, valeur)).toBe(attendu);
  });

  it("F-018-AC26 une case est cochée pour true seulement, non cochée pour false comme pour une cellule vide", () => {
    expect([estCochee(true), estCochee(false), estCochee(null)]).toEqual([true, false, false]);
  });

  it("F-018-AC26 nombre et date par des règles fixes : virgule décimale, JJ/MM/AAAA par découpage", () => {
    expect(nombreAffiche(-0.5)).toBe("-0,5");
    expect(dateAffichee("9999-12-31")).toBe("31/12/9999");
  });

  it("F-018-AC26 H7 le module des vues n'appelle ni Intl, ni toLocaleString, ni toLocaleDateString, ni objet date", () => {
    // Les commentaires, qui nomment ce que le module s'interdit, sont retirés avant la recherche.
    const sources = lister("src/vues-de-table").map(
      (chemin) => [chemin, lire(chemin).replace(/\/\/.*$|\/\*[^]*?\*\//gm, "")] as const,
    );
    expect(sources.length).toBeGreaterThan(5);
    for (const [chemin, texte] of sources) {
      expect(texte, chemin).not.toMatch(/\bIntl\b|toLocale\w*\(|new Date\b|Date\.(parse|UTC|now)/);
    }
  });
});

// Table de cas de l'analyse d'un nombre (AC28) : saisie, nombre écrit (null : cellule vidée), ou refus.
const NOMBRES: readonly [string, number | null | "refus"][] = [
  ["0", 0],
  ["-0", -0],
  ["007", 7],
  ["1,5", 1.5],
  ["1.5", 1.5],
  ["  42  ", 42],
  ["-3,25", -3.25],
  ["", null],
  ["   ", null],
  [",5", "refus"],
  ["5,", "refus"],
  ["1 000", "refus"],
  ["1e3", "refus"],
  ["--1", "refus"],
  ["+1", "refus"],
  ["1,5,0", "refus"],
  ["1.000,5", "refus"],
  ["Infinity", "refus"],
  ["NaN", "refus"],
  ["douze", "refus"],
  ["9".repeat(400), "refus"],
];

describe("analyse des saisies (F-018-AC27, AC28, AC30)", () => {
  it.each(NOMBRES)("F-018-AC28 « %s » donne %s", (saisie, attendu) => {
    const analyse = analyserNombre(saisie);
    if (attendu === "refus") {
      expect(analyse).toEqual({ sorte: "refus", refus: "nombre-invalide" });
    } else {
      expect(analyse).toEqual({ sorte: "valeur", valeur: attendu });
    }
  });

  it("F-018-AC28 une suite de chiffres bien formée est refusée seulement quand son nombre n'est pas fini", () => {
    expect(analyserNombre(`1${"0".repeat(300)}`)).toEqual({ sorte: "valeur", valeur: 1e300 });
    expect(analyserNombre(`1${"0".repeat(400)}`)).toEqual({
      sorte: "refus",
      refus: "nombre-invalide",
    });
  });

  it("F-018-AC27 un texte est écrit tel que saisi, sans rognage ; vidé, il vide la cellule ; au-delà de 2 000 caractères, refusé", () => {
    expect(analyserTexte("  bord  ")).toEqual({ sorte: "valeur", valeur: "  bord  " });
    expect(analyserTexte("")).toEqual({ sorte: "valeur", valeur: null });
    expect(analyserTexte("x".repeat(2000))).toEqual({ sorte: "valeur", valeur: "x".repeat(2000) });
    expect(analyserTexte("x".repeat(2001))).toEqual({ sorte: "refus", refus: "texte-trop-long" });
  });

  it("F-018-AC30 une date est la valeur du champ telle quelle, jamais un objet date ; vide, elle vide la cellule", () => {
    expect(analyserDate("2026-02-29")).toEqual({ sorte: "valeur", valeur: "2026-02-29" });
    expect(analyserDate("")).toEqual({ sorte: "valeur", valeur: null });
  });

  it("F-018-AC32 une valeur validée égale à celle de la cellule n'est pas une écriture", () => {
    expect(memeValeur(3, 3)).toBe(true);
    expect(memeValeur(null, null)).toBe(true);
    expect(memeValeur("a", "a")).toBe(true);
    expect(memeValeur(0, -0)).toBe(true);
    expect(memeValeur(null, false)).toBe(false);
    expect(memeValeur("1", 1)).toBe(false);
  });
});

describe("ce que les vues partagent (F-018-AC45)", () => {
  const TABLE: TableLue = {
    colonnes: [colonne("nombre"), colonne("texte"), { ...colonne("texte"), id: "c-2" }],
    lignes: [
      { id: "l1", cellules: [1, "a", null] },
      { id: "l2", cellules: [2, "b", null] },
    ],
  };

  it("F-018-AC45 les lignes affichées sont toutes les lignes de la table lue, dans l'ordre manuel", () => {
    expect(lignesAffichees(TABLE).map(({ id }) => id)).toEqual(["l1", "l2"]);
    expect(lignesAffichees({ colonnes: [], lignes: [] })).toEqual([]);
  });

  it("F-018-AC45 la colonne de titre est la première colonne texte, s'il y en a une", () => {
    expect(colonneDeTitre(TABLE)?.id).toBe("c-texte");
    expect(colonneDeTitre({ colonnes: [colonne("nombre")], lignes: [] })).toBeUndefined();
  });
});

// Table de cas de la fenêtre (AC46) : hauteur de rangée 32, marge de 10 rangées de chaque côté.
const FENETRES: readonly [string, Parameters<typeof fenetre>[0], { debut: number; fin: number }][] =
  [
    [
      "table vide",
      { defilement: 0, hauteurZone: 640, hauteurRangee: 32, nombre: 0 },
      { debut: 0, fin: 0 },
    ],
    [
      "table plus courte que la zone",
      { defilement: 0, hauteurZone: 640, hauteurRangee: 32, nombre: 5 },
      { debut: 0, fin: 5 },
    ],
    [
      "début",
      { defilement: 0, hauteurZone: 640, hauteurRangee: 32, nombre: 5000 },
      { debut: 0, fin: 30 },
    ],
    [
      "milieu",
      { defilement: 32 * 2500, hauteurZone: 640, hauteurRangee: 32, nombre: 5000 },
      { debut: 2490, fin: 2530 },
    ],
    [
      "milieu, rangée coupée",
      { defilement: 32 * 2500 + 16, hauteurZone: 640, hauteurRangee: 32, nombre: 5000 },
      { debut: 2490, fin: 2531 },
    ],
    [
      "fin",
      { defilement: 32 * 5000 - 640, hauteurZone: 640, hauteurRangee: 32, nombre: 5000 },
      { debut: 4970, fin: 5000 },
    ],
    [
      "zone sans hauteur (jsdom)",
      { defilement: 0, hauteurZone: 0, hauteurRangee: 32, nombre: 5000 },
      { debut: 0, fin: 11 },
    ],
    [
      "défilement au-delà de la fin",
      { defilement: 32 * 9000, hauteurZone: 640, hauteurRangee: 32, nombre: 5000 },
      { debut: 4989, fin: 5000 },
    ],
  ];

describe("fenêtre de la grille (F-018-AC46, AC47)", () => {
  it.each(FENETRES)("F-018-AC46 %s", (_cas, mesures, attendue) => {
    const calculee = fenetre(mesures);
    expect(calculee).toEqual(attendue);
    // Jamais plus que la zone visible et dix rangées de chaque côté.
    const visibles = Math.ceil(mesures.hauteurZone / mesures.hauteurRangee) + 1;
    expect(calculee.fin - calculee.debut).toBeLessThanOrEqual(visibles + 2 * 10);
  });

  it("F-018-AC47 la rangée tenue hors de la fenêtre est rendue en plus, une seule fois", () => {
    expect(indicesRendus({ debut: 3, fin: 6 }, [10, 4, -1])).toEqual([3, 4, 5, 10]);
  });

  it("F-018-AC47 le défilement qui amène une rangée dans la zone : vers le haut, vers le bas, ou aucun", () => {
    const zone = { defilement: 320, hauteurZone: 320, hauteurRangee: 32 };
    expect(defilementPour(2, zone)).toBe(64);
    expect(defilementPour(30, zone)).toBe(32 * 31 - 320);
    expect(defilementPour(12, zone)).toBeUndefined();
  });
});

// Table de cas des déplacements (AC33) dans une grille de 5 lignes et 3 colonnes, page de 2 rangées.
const DIMENSIONS = { lignes: 5, colonnes: 3, parPage: 2 };
const DEPLACEMENTS: readonly [string, [number, number], Deplacement, [number, number]][] = [
  ["Flèche haut", [3, 2], "haut", [2, 2]],
  ["Flèche haut sur les en-têtes", [0, 2], "haut", [0, 2]],
  ["Flèche bas", [3, 2], "bas", [4, 2]],
  ["Flèche bas sur la dernière ligne", [5, 2], "bas", [5, 2]],
  ["Flèche gauche", [3, 2], "gauche", [3, 1]],
  ["Flèche gauche vers la colonne des actions", [3, 1], "gauche", [3, 0]],
  ["Flèche gauche sur la colonne des actions", [3, 0], "gauche", [3, 0]],
  ["Flèche droite sur la dernière colonne", [3, 3], "droite", [3, 3]],
  ["Début", [3, 3], "debut-de-ligne", [3, 1]],
  ["Fin", [3, 0], "fin-de-ligne", [3, 3]],
  ["Mod+Début", [4, 3], "premiere-cellule", [1, 1]],
  ["Mod+Fin", [1, 0], "derniere-cellule", [5, 3]],
  ["Page précédente", [5, 2], "page-precedente", [3, 2]],
  ["Page précédente près du haut", [1, 2], "page-precedente", [1, 2]],
  ["Page précédente depuis les en-têtes", [0, 2], "page-precedente", [0, 2]],
  ["Page suivante", [1, 2], "page-suivante", [3, 2]],
  ["Page suivante près du bas", [4, 2], "page-suivante", [5, 2]],
];

describe("déplacement de la cellule courante (F-018-AC33)", () => {
  it.each(DEPLACEMENTS)(
    "F-018-AC33 %s",
    (_cas, [rang, colonne], deplacement, [versRang, versColonne]) => {
      expect(deplacer({ rang, colonne }, deplacement, DIMENSIONS)).toEqual({
        rang: versRang,
        colonne: versColonne,
      });
    },
  );

  it("F-018-AC33 sans ligne, Mod+Début et Mod+Fin restent sur la rangée d'en-têtes", () => {
    const vide = { lignes: 0, colonnes: 2, parPage: 1 };
    expect(deplacer({ rang: 0, colonne: 2 }, "premiere-cellule", vide)).toEqual({
      rang: 0,
      colonne: 1,
    });
    expect(deplacer({ rang: 0, colonne: 1 }, "derniere-cellule", vide)).toEqual({
      rang: 0,
      colonne: 2,
    });
  });
});
