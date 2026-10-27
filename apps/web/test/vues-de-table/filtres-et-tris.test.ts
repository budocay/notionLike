// Filtres, tris et lignes affichées (F-019-AC2 à AC5, AC8 à AC11, AC13, AC28) : fonctions sans DOM
// éprouvées sur des tables de cas.
import { creerDocumentTable } from "@notionlike/document";
import { describe, expect, it } from "vitest";

import { cleDeComparaison } from "../../src/vues-de-table/cle-de-comparaison.ts";
import { estUneDateDuCalendrier } from "../../src/vues-de-table/date-du-calendrier.ts";
import {
  DEFINITION_VIDE,
  type Filtre,
  OPERATEURS_PAR_TYPE,
} from "../../src/vues-de-table/definition.ts";
import { etatDuFiltre } from "../../src/vues-de-table/filtres.ts";
import { aUnElementActif, lignesAffichees } from "../../src/vues-de-table/lignes-affichees.ts";
import { lire } from "../aides-disque.ts";
import {
  colonne,
  definition,
  ids,
  LISTE_TEMOIN,
  ORDRE_CROISSANT_TEMOIN,
  table,
} from "./aides-definition.ts";

const TEXTES = table(
  [colonne("t", "texte")],
  [["École"], ["ecole"], ["Zèbre"], [""], [null], ["a b"], ["ab"]],
);

function filtrerLeTexte(operateur: Filtre["operateur"], valeur?: string): string[] {
  return ids(lignesAffichees(TEXTES, definition([{ colonne: "t", operateur, valeur }])));
}

describe("filtres sur un texte (F-019-AC4)", () => {
  it("F-019-AC4 la casse et les accents ne comptent pas : « ecole » trouve « École »", () => {
    expect(filtrerLeTexte("contient", "ecole")).toEqual(["l0", "l1"]);
    expect(filtrerLeTexte("contient", "ÉCOLE")).toEqual(["l0", "l1"]);
    expect(filtrerLeTexte("est", "ecOLE")).toEqual(["l0", "l1"]);
    expect(filtrerLeTexte("est", "ecol")).toEqual([]);
  });

  it("F-019-AC4 aucun espace n'est retiré", () => {
    expect(filtrerLeTexte("contient", "a b")).toEqual(["l5"]);
    expect(filtrerLeTexte("contient", "ab")).toEqual(["l6"]);
    expect(filtrerLeTexte("est", " ecole")).toEqual([]);
  });

  it("F-019-AC3 une cellule sans valeur satisfait « ne contient pas » et « est vide », aucun autre opérateur", () => {
    expect(filtrerLeTexte("ne-contient-pas", "ecole")).toEqual(["l2", "l3", "l4", "l5", "l6"]);
    expect(filtrerLeTexte("est-vide")).toEqual(["l3", "l4"]);
    expect(filtrerLeTexte("non-vide")).toEqual(["l0", "l1", "l2", "l5", "l6"]);
    expect(filtrerLeTexte("contient", "z")).toEqual(["l2"]);
    expect(filtrerLeTexte("est", "")).toEqual(ids(TEXTES.lignes));
  });
});

describe("valeur lue du stockage (F-019-AC24)", () => {
  it("F-019-AC24 une valeur vide sur une colonne de sélection laisse le filtre inactif, sans mention", () => {
    const t = table([colonne("s", "selection", ["a"])], [["a"]]);
    expect(etatDuFiltre(t, { colonne: "s", operateur: "est", valeur: "" })).toEqual({
      actif: false,
      mention: undefined,
    });
    expect(etatDuFiltre(t, { colonne: "s", operateur: "est", valeur: "z" })).toEqual({
      actif: false,
      mention: "option-supprimee",
    });
  });
});

describe("filtres par type, cellules sans valeur (F-019-AC3, AC5)", () => {
  const colonnes = [
    colonne("n", "nombre"),
    colonne("c", "case"),
    colonne("d", "date"),
    colonne("s", "selection", ["a", "b"]),
  ];
  const t = table(colonnes, [
    [1, true, "2026-02-28", "a"],
    [-0, false, "2026-03-01", "b"],
    [0, null, null, null],
    [null, true, "2026-01-31", "a"],
    [12, false, "2024-02-29", "b"],
  ]);
  const avec = (filtre: Filtre) => ids(lignesAffichees(t, definition([filtre])));

  it.each<[Filtre, string[]]>([
    [{ colonne: "n", operateur: "egal", valeur: 0 }, ["l1", "l2"]],
    [{ colonne: "n", operateur: "different", valeur: 0 }, ["l0", "l3", "l4"]],
    [{ colonne: "n", operateur: "inferieur", valeur: 1 }, ["l1", "l2"]],
    [{ colonne: "n", operateur: "inferieur-egal", valeur: 1 }, ["l0", "l1", "l2"]],
    [{ colonne: "n", operateur: "superieur", valeur: 1 }, ["l4"]],
    [{ colonne: "n", operateur: "superieur-egal", valeur: 1 }, ["l0", "l4"]],
    [{ colonne: "n", operateur: "est-vide" }, ["l3"]],
    [{ colonne: "n", operateur: "non-vide" }, ["l0", "l1", "l2", "l4"]],
    [{ colonne: "c", operateur: "cochee" }, ["l0", "l3"]],
    [{ colonne: "c", operateur: "non-cochee" }, ["l1", "l2", "l4"]],
    [{ colonne: "d", operateur: "est", valeur: "2026-03-01" }, ["l1"]],
    [{ colonne: "d", operateur: "avant", valeur: "2026-03-01" }, ["l0", "l3", "l4"]],
    [{ colonne: "d", operateur: "apres", valeur: "2026-02-28" }, ["l1"]],
    [{ colonne: "d", operateur: "est-vide" }, ["l2"]],
    [{ colonne: "d", operateur: "non-vide" }, ["l0", "l1", "l3", "l4"]],
    [{ colonne: "s", operateur: "est", valeur: "a" }, ["l0", "l3"]],
    [{ colonne: "s", operateur: "n-est-pas", valeur: "a" }, ["l1", "l2", "l4"]],
    [{ colonne: "s", operateur: "est-vide" }, ["l2"]],
    [{ colonne: "s", operateur: "non-vide" }, ["l0", "l1", "l3", "l4"]],
  ])("F-019-AC3 F-019-AC5 %j", (filtre, attendues) => {
    expect(avec(filtre)).toEqual(attendues);
  });

  it("F-019-AC5 « avant » et « après » sont stricts et ne lisent pas l'horloge", () => {
    expect(avec({ colonne: "d", operateur: "avant", valeur: "2024-02-29" })).toEqual([]);
    expect(avec({ colonne: "d", operateur: "apres", valeur: "2026-03-01" })).toEqual([]);
    const source = ["filtres.ts", "tris.ts", "lignes-affichees.ts"]
      .map((fichier) => lire(`src/vues-de-table/${fichier}`))
      .join("\n");
    expect(source).not.toMatch(/\bnew Date\b|Date\.now|\bDate\(/);
  });

  it("F-019-AC2 plusieurs filtres se combinent par « et » ; un élément inactif est satisfait par toutes les lignes", () => {
    const filtres: Filtre[] = [
      { colonne: "c", operateur: "cochee" },
      { colonne: "s", operateur: "est", valeur: "a" },
      { colonne: "absente", operateur: "est", valeur: "x" },
      { colonne: "n", operateur: "egal" },
      { colonne: "s", operateur: "est", valeur: "retiree" },
    ];
    expect(ids(lignesAffichees(t, definition(filtres)))).toEqual(["l0", "l3"]);
    expect(ids(lignesAffichees(t, definition(filtres.slice(2))))).toEqual(ids(t.lignes));
  });
});

describe("tris (F-019-AC8, AC9, AC10)", () => {
  const colonnes = [
    colonne("n", "nombre"),
    colonne("c", "case"),
    colonne("d", "date"),
    colonne("s", "selection", ["z", "a", "m"]),
  ];
  const t = table(colonnes, [
    [5, true, "2026-02-01", "a"],
    [null, false, null, null],
    [-1, null, "2025-12-31", "z"],
    [5, false, "2026-02-01", "m"],
    [0, true, "2026-01-01", "z"],
  ]);
  const trier = (colonneTriee: string, sens: "croissant" | "decroissant") =>
    ids(lignesAffichees(t, definition([], [{ colonne: colonneTriee, sens }])));

  it("F-019-AC8 F-019-AC9 chaque type a son ordre, les cellules sans valeur sont après toutes les autres dans les deux sens", () => {
    expect(trier("n", "croissant")).toEqual(["l2", "l4", "l0", "l3", "l1"]);
    expect(trier("n", "decroissant")).toEqual(["l0", "l3", "l4", "l2", "l1"]);
    expect(trier("c", "croissant")).toEqual(["l1", "l3", "l0", "l4", "l2"]);
    expect(trier("c", "decroissant")).toEqual(["l0", "l4", "l1", "l3", "l2"]);
    expect(trier("d", "croissant")).toEqual(["l2", "l4", "l0", "l3", "l1"]);
    expect(trier("d", "decroissant")).toEqual(["l0", "l3", "l4", "l2", "l1"]);
    // Par la place de l'option (z, a, m), non par son libellé.
    expect(trier("s", "croissant")).toEqual(["l2", "l4", "l0", "l3", "l1"]);
    expect(trier("s", "decroissant")).toEqual(["l3", "l0", "l2", "l4", "l1"]);
  });

  it("F-019-AC10 une égalité passe au tri suivant, puis à l'ordre manuel ; un élément inactif est sauté", () => {
    const tris = [
      { colonne: "n", sens: "decroissant" },
      { colonne: "absente", sens: "croissant" },
      { colonne: "d", sens: "croissant" },
    ] as const;
    expect(ids(lignesAffichees(t, definition([], tris)))).toEqual(["l0", "l3", "l4", "l2", "l1"]);
    const egales = [
      { colonne: "d", sens: "decroissant" },
      { colonne: "c", sens: "croissant" },
    ] as const;
    // l0 et l3 ont la même date : la case les départage (décochée avant cochée) ; l1 sans date en dernier.
    expect(ids(lignesAffichees(t, definition([], egales)))).toEqual(["l3", "l0", "l4", "l2", "l1"]);
    const totalement = table([colonne("x", "nombre")], [[1], [1], [1]]);
    const tri = [{ colonne: "x", sens: "decroissant" }] as const;
    expect(ids(lignesAffichees(totalement, definition([], tri)))).toEqual(["l0", "l1", "l2"]);
  });

  it("F-019-AC8 le sens décroissant inverse l'ordre sur la liste témoin, les cellules sans valeur restent derrière", () => {
    const temoin = table(
      [colonne("t", "texte")],
      LISTE_TEMOIN.map((valeur) => [valeur]),
    );
    const rendu = (sens: "croissant" | "decroissant") =>
      lignesAffichees(temoin, definition([], [{ colonne: "t", sens }])).map(
        (ligne) => ligne.cellules[0],
      );
    expect(rendu("croissant")).toEqual(ORDRE_CROISSANT_TEMOIN);
    const valeurs = ORDRE_CROISSANT_TEMOIN.slice(0, -2);
    expect(rendu("decroissant")).toEqual([...valeurs.toReversed(), "", null]);
  });
});

describe("indépendance à la langue de l'appareil (F-019-AC11)", () => {
  it("F-019-AC11 la clé de comparaison retire les seuls signes U+0300 à U+036F, avec veille du 2026-10-27", () => {
    // Choix de la clé : MEMORY/VEILLE.md, section du 2026-10-27 (NFD, U+0300 à U+036F seulement, puis
    // toLowerCase ; \p{M} et \p{Diacritic} écartés exprès, ils videraient « ^ », « ¨ » et « क्षि »).
    expect(cleDeComparaison("İstanbul")).toBe("istanbul");
    expect(cleDeComparaison("École")).toBe("ecole");
    // `^` et `¨` ne sont pas des signes combinants : la clé n'en est pas vidée.
    expect(cleDeComparaison("^")).toBe("^");
    expect(cleDeComparaison("¨")).toBe("¨");
    // Les voyelles combinantes des écritures indiennes restent : des mots distincts restent distincts.
    expect(cleDeComparaison("क्षि")).toBe("क्षि");
    expect(cleDeComparaison("क्षि")).not.toBe(cleDeComparaison("कष"));
    expect(cleDeComparaison("œuf")).toBe("œuf");
    expect(cleDeComparaison("ß")).toBe("ß");
  });

  it("F-019-AC11 aucune source du calcul n'appelle Intl, localeCompare, toLocale… ni ne lit la langue ou le fuseau", () => {
    const fichiers = [
      "cle-de-comparaison.ts",
      "date-du-calendrier.ts",
      "definition.ts",
      "filtres.ts",
      "tris.ts",
      "lignes-affichees.ts",
      "positions.ts",
    ];
    for (const fichier of fichiers) {
      const texte = lire(`src/vues-de-table/${fichier}`).replace(/\/\/.*$|\/\*[^]*?\*\//gm, "");
      expect(texte, fichier).not.toMatch(
        /\bIntl\b|localeCompare|toLocale\w*|\bnavigator\b|getTimezoneOffset|\blanguages?\b|\bnew Date\b/,
      );
    }
  });
});

describe("lignes affichées sans élément actif (F-019-AC13)", () => {
  const t = table([colonne("n", "nombre")], [[2], [1]]);

  it("F-019-AC13 une définition vide, ou faite des seuls éléments inactifs, rend la table lue telle quelle", () => {
    expect(lignesAffichees(t)).toBe(t.lignes);
    expect(lignesAffichees(t, DEFINITION_VIDE)).toBe(t.lignes);
    const inactive = definition(
      [
        { colonne: "absente", operateur: "est-vide" },
        { colonne: "n", operateur: "egal" },
        { colonne: "n", operateur: "cochee" },
        { colonne: "n", operateur: "egal", valeur: Number.NaN },
      ],
      [{ colonne: "absente", sens: "croissant" }],
    );
    expect(lignesAffichees(t, inactive)).toBe(t.lignes);
    expect(aUnElementActif(t, inactive)).toBe(false);
    expect(aUnElementActif(t, definition([{ colonne: "n", operateur: "est-vide" }]))).toBe(true);
  });

  it("F-019-AC1 chaque type n'admet que ses opérateurs", () => {
    expect(OPERATEURS_PAR_TYPE.texte).toEqual([
      "contient",
      "ne-contient-pas",
      "est",
      "est-vide",
      "non-vide",
    ]);
    expect(OPERATEURS_PAR_TYPE.nombre).toHaveLength(8);
    expect(OPERATEURS_PAR_TYPE.case).toEqual(["cochee", "non-cochee"]);
    expect(OPERATEURS_PAR_TYPE.date).toEqual(["est", "avant", "apres", "est-vide", "non-vide"]);
    expect(OPERATEURS_PAR_TYPE.selection).toEqual(["est", "n-est-pas", "est-vide", "non-vide"]);
  });
});

describe("grande table (F-019-AC28)", () => {
  it("F-019-AC28 5 000 lignes sous trois filtres et deux tris : le résultat égale celui d'un calcul de référence", () => {
    const options = ["a", "b", "c", "d"];
    const mots = ["Éclair", "eclair", "Zèbre", "abricot", "Ecole", "école", "œuf", ""];
    const lignes = Array.from({ length: 5000 }, (_, i) => [
      mots[(i * 7) % mots.length] ?? "",
      (i * 31) % 17 === 0 ? null : (i * 13) % 50,
      options[(i * 3) % 4] ?? null,
      `2026-0${String(1 + (i % 9))}-1${String(i % 10)}`,
    ]);
    const t = table(
      [
        colonne("t", "texte"),
        colonne("n", "nombre"),
        colonne("s", "selection", options),
        colonne("d", "date"),
      ],
      lignes,
    );
    const filtres: Filtre[] = [
      { colonne: "t", operateur: "ne-contient-pas", valeur: "ZEBRE" },
      { colonne: "n", operateur: "superieur-egal", valeur: 10 },
      { colonne: "s", operateur: "n-est-pas", valeur: "d" },
    ];
    const tris = [
      { colonne: "t", sens: "decroissant" },
      { colonne: "n", sens: "croissant" },
    ] as const;

    // Référence : filtrage ligne à ligne, tri à bulles, sans réutiliser le code du projet.
    const bas = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const retenues = t.lignes.filter((ligne) => {
      const [texte, nombre, option] = ligne.cellules;
      const sansZebre = !bas(String(texte)).includes("zebre");
      const assez = typeof nombre === "number" && nombre >= 10;
      return sansZebre && assez && option !== "d";
    });
    const avant = (a: (typeof retenues)[number], b: (typeof retenues)[number]): boolean => {
      const [ta, na] = a.cellules;
      const [tb, nb] = b.cellules;
      const sansA = ta === "" || ta === null;
      const sansB = tb === "" || tb === null;
      if (sansA !== sansB) {
        return sansB;
      }
      if (!sansA && !sansB) {
        const cleA = bas(String(ta));
        const cleB = bas(String(tb));
        if (cleA !== cleB) {
          return cleA > cleB;
        }
        if (ta !== tb) {
          return String(ta) > String(tb);
        }
      }
      if (na !== nb) {
        return Number(na) < Number(nb);
      }
      return t.lignes.indexOf(a) < t.lignes.indexOf(b);
    };
    const reference = [...retenues];
    for (let i = 0; i < reference.length; i += 1) {
      for (let j = 0; j + 1 < reference.length - i; j += 1) {
        const [x, y] = [reference[j], reference[j + 1]];
        if (x !== undefined && y !== undefined && !avant(x, y)) {
          reference[j] = y;
          reference[j + 1] = x;
        }
      }
    }

    expect(retenues.length).toBeGreaterThan(300);
    expect(ids(lignesAffichees(t, definition(filtres, tris)))).toEqual(ids(reference));
  });
});

describe("couture avec le document de table (F-019-AC24)", () => {
  it("F-019-AC24 la date d'un filtre est jugée comme le document juge celle d'une cellule", () => {
    const document = creerDocumentTable();
    const date = document.creerColonne("Date", "date");
    const ligne = document.creerLigne();
    const dates = [
      "2024-02-29",
      "2023-02-29",
      "1900-02-29",
      "2000-02-29",
      "0001-01-01",
      "0000-12-31",
      "9999-12-31",
      "2026-13-01",
      "2026-00-10",
      "2026-04-31",
      "2026-4-3",
      "2026-08-31",
      "2026-09-31",
      "",
      "abc",
    ];
    for (const valeur of dates) {
      let accepte = true;
      try {
        document.ecrireCellule(ligne, date, valeur);
      } catch {
        accepte = false;
      }
      expect(estUneDateDuCalendrier(valeur), valeur).toBe(accepte && valeur !== "");
    }
    document.fermer();
  });
});
