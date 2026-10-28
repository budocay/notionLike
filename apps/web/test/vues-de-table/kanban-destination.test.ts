// Calcul de la destination et commandes au clavier (F-020-AC10, AC11, AC13, AC14) : fonctions sans
// DOM, sur une table de cas tenue en un seul endroit.
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  COMMANDES_DE_CARTE,
  type CommandeDeCarte,
  type Destination,
  destinationDeLaCommande,
  estLaPlaceActuelle,
  placeDeLaCarte,
  positionDansLaTable,
} from "../../src/vues-de-table/kanban/destination.ts";
import { actionsDeCarte } from "../../src/vues-de-table/kanban/actions-de-carte.ts";
import { deplacerUneCarte } from "../../src/vues-de-table/kanban/deplacement.ts";
import type { Pile } from "../../src/vues-de-table/kanban/piles.ts";
import { contexteDe, pilesDe, tableDeKanban, titresParPile } from "./aides-kanban.ts";

// ——— positionDansLaTable : la table de cas d'AC10 ———
// Ordre de la table : a b c d e f g ; piles : P1 = a c e, P2 = b f, P3 = d, vide = (aucune carte).
const ORDRE = ["a", "b", "c", "d", "e", "f", "g"];
const P1 = ["a", "c", "e"];
const P2 = ["b", "f"];
const P3 = ["d"];
// « Sans valeur » : la ligne « g », qu'aucune option ne porte, y est la seule carte.
const SANS_VALEUR = ["g"];

interface Cas {
  readonly nom: string;
  readonly carte: string;
  readonly pile: readonly string[];
  readonly precedente: string | null;
  /** Position finale dans l'ordre de la table, ou `undefined` : la ligne ne bouge pas. */
  readonly attendue: number | undefined;
}

const CAS: readonly Cas[] = [
  { nom: "vers le bas, même pile", carte: "a", pile: P1, precedente: "c", attendue: 2 },
  {
    nom: "vers le bas jusqu'à la dernière place",
    carte: "a",
    pile: P1,
    precedente: "e",
    attendue: 4,
  },
  { nom: "vers le haut, même pile", carte: "e", pile: P1, precedente: "a", attendue: 1 },
  { nom: "vers la première place, même pile", carte: "e", pile: P1, precedente: null, attendue: 0 },
  {
    nom: "vers la première place d'une autre pile",
    carte: "g",
    pile: P2,
    precedente: null,
    attendue: 1,
  },
  {
    nom: "vers la dernière place d'une autre pile",
    carte: "a",
    pile: P2,
    precedente: "f",
    attendue: 5,
  },
  {
    nom: "entre deux cartes d'une autre pile, lignes d'autres piles intercalées",
    carte: "g",
    pile: P2,
    precedente: "b",
    attendue: 2,
  },
  {
    nom: "vers une pile d'une seule carte, avant elle",
    carte: "g",
    pile: P3,
    precedente: null,
    attendue: 3,
  },
  {
    nom: "vers une pile d'une seule carte, après elle",
    carte: "a",
    pile: P3,
    precedente: "d",
    attendue: 3,
  },
  {
    nom: "vers « Sans valeur », après sa seule carte",
    carte: "e",
    pile: SANS_VALEUR,
    precedente: "g",
    attendue: 6,
  },
  {
    nom: "vers « Sans valeur », en tête de la pile",
    carte: "a",
    pile: SANS_VALEUR,
    precedente: null,
    attendue: 5,
  },
  {
    nom: "vers une pile vide : la ligne ne bouge pas",
    carte: "a",
    pile: [],
    precedente: null,
    attendue: undefined,
  },
  {
    nom: "sans effet : la ligne est déjà juste après sa précédente dans la table",
    carte: "b",
    pile: ["a", "b", "c"],
    precedente: "a",
    attendue: undefined,
  },
  {
    nom: "sans effet : en tête, la ligne est déjà juste avant la première de la pile",
    carte: "a",
    pile: P2,
    precedente: null,
    attendue: undefined,
  },
  {
    nom: "carte précédente absente de la pile : refusé",
    carte: "a",
    pile: P2,
    precedente: "z",
    attendue: undefined,
  },
];

describe("position dans l'ordre de la table (F-020-AC10)", () => {
  it.each(CAS.map((cas) => [cas.nom, cas] as const))("F-020-AC10 %s", (_, cas) => {
    expect(positionDansLaTable(ORDRE, cas.carte, cas.pile, cas.precedente)).toBe(cas.attendue);
  });

  it("F-020-AC10 le déplacement ne change pas l'ordre relatif des autres lignes", () => {
    for (const cas of CAS) {
      const position = positionDansLaTable(ORDRE, cas.carte, cas.pile, cas.precedente);
      if (position === undefined) {
        continue;
      }
      const apres = ORDRE.filter((id) => id !== cas.carte);
      apres.splice(position, 0, cas.carte);
      expect(
        apres.filter((id) => id !== cas.carte),
        cas.nom,
      ).toEqual(ORDRE.filter((id) => id !== cas.carte));
      // La carte est juste après sa précédente, ou juste avant la première de la pile.
      const voisine = cas.precedente ?? cas.pile.filter((id) => id !== cas.carte)[0];
      const rang = apres.indexOf(voisine ?? "");
      expect(
        cas.precedente === null ? apres.indexOf(cas.carte) + 1 : apres.indexOf(cas.carte) - 1,
        cas.nom,
      ).toBe(rang);
    }
  });
});

// ——— Déplacement sur un vrai document : AC10 et AC11 de bout en bout de la fonction ———

const ouvertes: { fermer(): void }[] = [];
afterEach(() => ouvertes.splice(0).forEach((table) => table.fermer()));

// a b c d e f g ; Sans valeur : g ; À faire : a c e ; En cours : b f ; Fait : d. Une pile « Vide » sans carte.
function essai() {
  const une = tableDeKanban(
    [
      ["a", 0],
      ["b", 1],
      ["c", 0],
      ["d", 2],
      ["e", 0],
      ["f", 1],
      ["g", -1],
    ],
    ["À faire", "En cours", "Fait", "Vide"],
  );
  ouvertes.push(une.table);
  const ordre = (): string[] => une.table.lire().lignes.map((ligne) => String(ligne.cellules[0]));
  const emises: unknown[] = [];
  une.table.doc.on("update", (miseAJour: unknown) => emises.push(miseAJour));
  const deplacer = (carte: string, option: number, precedente: string | null) =>
    deplacerUneCarte(contexteDe(une.table), une.lignes.get(carte) ?? "", {
      option: option < 0 ? null : (une.options[option] ?? null),
      precedente: precedente === null ? null : (une.lignes.get(precedente) ?? null),
    });
  return { ...une, deplacer, ordre, emises };
}

describe("déplacer une carte sur le document (F-020-AC10, AC11)", () => {
  it("F-020-AC10 vers une autre pile, entre deux cartes : la cellule d'abord, la ligne ensuite, deux mises à jour, l'ordre relatif des autres préservé", () => {
    const { table, deplacer, ordre, emises } = essai();
    expect(deplacer("g", 1, "b")).toEqual({ sorte: "deplacee" });
    expect(ordre()).toEqual(["a", "b", "g", "c", "d", "e", "f"]);
    expect(titresParPile(table)).toEqual([[], ["a", "c", "e"], ["b", "g", "f"], ["d"], []]);
    expect(emises.length).toBe(2);
  });

  it("F-020-AC10 F-020-AC11 vers une pile vide, vers « Sans valeur » : seule la cellule est écrite, la ligne ne bouge pas", () => {
    const { table, deplacer, ordre, emises } = essai();
    expect(deplacer("a", 3, null)).toEqual({ sorte: "deplacee" });
    expect(emises.length).toBe(1);
    expect(deplacer("d", -1, "g")).toEqual({ sorte: "deplacee" });
    expect(ordre()).toEqual(["a", "b", "c", "e", "f", "g", "d"]);
    expect(titresParPile(table)).toEqual([["g", "d"], ["c", "e"], ["b", "f"], [], ["a"]]);
  });

  it("F-020-AC11 la destination est la place actuelle, ou ne change que la pile, ou que la place : aucune écriture superflue", () => {
    const { deplacer, emises, ordre } = essai();
    // Place actuelle : tête de pile, ou juste après sa précédente.
    expect(deplacer("a", 0, null)).toEqual({ sorte: "sans-effet" });
    expect(deplacer("c", 0, "a")).toEqual({ sorte: "sans-effet" });
    expect(deplacer("e", 0, "c")).toEqual({ sorte: "sans-effet" });
    expect(emises).toEqual([]);
    // Même pile, place différente : la ligne seule (1 mise à jour).
    expect(deplacer("a", 0, "c")).toEqual({ sorte: "deplacee" });
    expect(emises.length).toBe(1);
    expect(ordre()).toEqual(["b", "c", "a", "d", "e", "f", "g"]);
    // Autre pile, la ligne déjà à sa place dans la table : la cellule seule (1 mise à jour).
    expect(deplacer("g", 1, "f")).toEqual({ sorte: "deplacee" });
    expect(emises.length).toBe(2);
  });

  it("F-020-AC10 une carte précédente qui n'est pas dans la pile de destination est refusée sans rien écrire", () => {
    const { deplacer, emises } = essai();
    const refus = deplacer("a", 1, "c");
    expect(refus.sorte).toBe("refusee");
    expect(emises).toEqual([]);
  });
});

// ——— Commandes au clavier ———

const COMMANDES: readonly CommandeDeCarte[] = COMMANDES_DE_CARTE;

// Les commandes de carte de la vue, sur le document : ce que `actionsDeCarte().commander` fait.
function commanderSur(une: ReturnType<typeof essai>) {
  const focaliser = vi.fn<(carte: string) => void>();
  const annoncer = vi.fn<(texte: string) => void>();
  const signaler = vi.fn<(message: string | undefined) => void>();
  const actions = actionsDeCarte({
    ...contexteDe(une.table),
    piles: pilesDe(une.table),
    lectureSeule: undefined,
    triActif: false,
    signaler,
    annoncer,
    focaliser,
    limites: { limiteDe: () => 100, jusqua: vi.fn(), plus: vi.fn() },
    saisirLeTitre: vi.fn(),
  });
  return { commander: actions.commander, focaliser, annoncer, signaler };
}

describe("commandes de carte (F-020-AC13)", () => {
  it("F-020-AC13 pile précédente et suivante : fin de la pile voisine ; monter et descendre : une place ; indisponibles aux bouts", () => {
    const { table, lignes } = essai();
    const piles = pilesDe(table);
    const id = (nom: string) => lignes.get(nom) ?? "";
    const vers = (carte: string, commande: CommandeDeCarte): Destination | undefined =>
      destinationDeLaCommande(piles, id(carte), commande);
    const option = (rang: number) => piles[rang]?.option ?? null;

    expect(vers("a", "pile-precedente")).toEqual({ option: option(0), precedente: id("g") });
    expect(vers("a", "pile-suivante")).toEqual({ option: option(2), precedente: id("f") });
    expect(vers("g", "pile-precedente")).toBeUndefined();
    expect(vers("d", "pile-suivante")).toEqual({ option: option(4), precedente: null });
    expect(vers("c", "monter")).toEqual({ option: option(1), precedente: null });
    expect(vers("e", "monter")).toEqual({ option: option(1), precedente: id("a") });
    expect(vers("a", "monter")).toBeUndefined();
    expect(vers("a", "descendre")).toEqual({ option: option(1), precedente: id("c") });
    expect(vers("c", "descendre")).toEqual({ option: option(1), precedente: id("e") });
    expect(vers("e", "descendre")).toBeUndefined();
    expect(vers("d", "monter")).toBeUndefined();
    expect(vers("d", "descendre")).toBeUndefined();
    expect(destinationDeLaCommande(piles, "inconnue", "monter")).toBeUndefined();
  });

  it("F-020-AC13 une commande sans destination, déclenchée sur la vue, n'écrit rien, ne déplace pas le focus et dit le bord ; une commande qui en a une écrit", () => {
    const une = essai();
    const { lignes, emises } = une;
    const { commander, focaliser, annoncer, signaler } = commanderSur(une);
    const id = (nom: string) => lignes.get(nom) ?? "";

    commander(id("g"), "pile-precedente");
    commander(id("a"), "monter");
    commander(id("e"), "descendre");
    commander(id("d"), "monter");
    commander(id("d"), "descendre");
    expect(emises).toEqual([]);
    expect(focaliser).not.toHaveBeenCalled();
    expect(signaler).not.toHaveBeenCalled();
    expect(annoncer.mock.calls.map(([texte]) => texte)).toEqual([
      "Déjà dans la première pile.",
      "Déjà la première carte de la pile.",
      "Déjà la dernière carte de la pile.",
      "Déjà la première carte de la pile.",
      "Déjà la dernière carte de la pile.",
    ]);

    // Témoin : depuis la même place, une commande qui a une destination écrit et rend le focus.
    commander(id("a"), "descendre");
    expect(emises.length).toBeGreaterThan(0);
    expect(focaliser).toHaveBeenCalledWith(id("a"));
  });
});

// ——— Équivalence (F-020-AC14) ———

interface Cible {
  readonly pile: number;
  /** Nombre de cartes qui précèdent la carte déplacée dans la pile (carte déplacée exclue). */
  readonly rang: number;
}

/** L'effet d'une destination sur les piles, pour la seule carte déplacée. */
function appliquer(
  piles: readonly Pile[],
  carte: string,
  destination: Destination,
): readonly Pile[] {
  const sans = piles.map((pile) => ({
    ...pile,
    cartes: pile.cartes.filter(({ id }) => id !== carte),
  }));
  const origine = piles.flatMap((pile) => pile.cartes).find(({ id }) => id === carte);
  return sans.map((pile) => {
    if (pile.option !== destination.option || origine === undefined) {
      return pile;
    }
    const apres =
      destination.precedente === null
        ? 0
        : pile.cartes.findIndex(({ id }) => id === destination.precedente) + 1;
    return {
      ...pile,
      cartes: [...pile.cartes.slice(0, apres), origine, ...pile.cartes.slice(apres)],
    };
  });
}

function cle(piles: readonly Pile[], carte: string): string {
  const place = placeDeLaCarte(piles, carte);
  const pile = piles[place?.pile ?? -1];
  return `${String(place?.pile)}:${(
    pile?.cartes
      .filter(({ id }) => id !== carte)
      .slice(0, place?.rang)
      .map(({ id }) => id) ?? []
  ).join(",")}`;
}

describe("équivalence entre le geste et les commandes (F-020-AC14)", () => {
  it("F-020-AC14 sur trois piles et sept cartes, chaque destination d'AC10 de chaque carte est atteinte par une suite des quatre commandes", () => {
    const { table, lignes } = essai();
    const depart = pilesDe(table);
    let verifiees = 0;
    for (const [carte, idCarte] of lignes) {
      // Toutes les destinations : chaque pile, chaque place parmi ses autres cartes.
      const attendues = new Map<string, Cible>();
      for (const [pile, { cartes }] of depart.entries()) {
        const autres = cartes.filter(({ id }) => id !== idCarte);
        for (let rang = 0; rang <= autres.length; rang += 1) {
          attendues.set(
            `${String(pile)}:${autres
              .slice(0, rang)
              .map(({ id }) => id)
              .join(",")}`,
            { pile, rang },
          );
        }
      }
      // Parcours en largeur des états atteints par les commandes.
      const atteints = new Set<string>([cle(depart, idCarte)]);
      let frontiere: (readonly Pile[])[] = [depart];
      while (frontiere.length > 0) {
        const suivante: (readonly Pile[])[] = [];
        for (const piles of frontiere) {
          for (const commande of COMMANDES) {
            const destination = destinationDeLaCommande(piles, idCarte, commande);
            if (destination === undefined) {
              continue;
            }
            const apres = appliquer(piles, idCarte, destination);
            if (!atteints.has(cle(apres, idCarte))) {
              atteints.add(cle(apres, idCarte));
              suivante.push(apres);
            }
          }
        }
        frontiere = suivante;
      }
      for (const destination of attendues.keys()) {
        expect(atteints.has(destination), `${carte} → ${destination}`).toBe(true);
        verifiees += 1;
      }
    }
    expect(verifiees).toBeGreaterThanOrEqual(7 * 7);
  });

  it("F-020-AC11 estLaPlaceActuelle reconnaît la place que la carte occupe, et elle seule", () => {
    const { table, lignes } = essai();
    const piles = pilesDe(table);
    const c = lignes.get("c") ?? "";
    expect(
      estLaPlaceActuelle(piles, c, {
        option: piles[1]?.option ?? null,
        precedente: lignes.get("a") ?? null,
      }),
    ).toBe(true);
    expect(
      estLaPlaceActuelle(piles, c, { option: piles[1]?.option ?? null, precedente: null }),
    ).toBe(false);
    expect(
      estLaPlaceActuelle(piles, c, {
        option: piles[2]?.option ?? null,
        precedente: lignes.get("a") ?? null,
      }),
    ).toBe(false);
    expect(estLaPlaceActuelle(piles, "inconnue", { option: null, precedente: null })).toBe(false);
  });
});
