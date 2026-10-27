// Lignes affichées sous une définition (F-019-AC15 à AC19, AC20) : fenêtre et navigation sur les
// lignes affichées, mises à jour reçues, affichage figé, déplacement d'une ligne, rechargement.
import { type DocumentTable, ErreurDocument } from "@notionlike/document";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EcranDeTable } from "../../src/vues-de-table/index.ts";
import { ESPACE_A } from "../aides-persistance.ts";
import {
  ajouterUnTri,
  annonce,
  barre,
  choisir,
  CLE_DES_REGLAGES,
  filtrer,
  noms,
  remplirSixLignes,
} from "./aides-barres.tsx";
import {
  cellule,
  focus,
  rangees,
  recevoirDansLaTable,
  rendreLaTable,
  TABLE_D_ESSAI,
} from "./aides-grille.tsx";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

const REAPPLIQUER = "Réappliquer les filtres et les tris";

function rouvrir(table: DocumentTable): void {
  cleanup();
  render(
    <EcranDeTable
      etat={{
        phase: "pret",
        table,
        enregistre: true,
        baseRelue: true,
        reessayer: () => undefined,
      }}
      idEspace={ESPACE_A}
      idTable={TABLE_D_ESSAI}
      titre="Budget"
    />,
  );
}

function ligneDe(table: DocumentTable, nom: string): string {
  return table.lire().lignes.find(({ cellules }) => cellules[0] === nom)?.id ?? "";
}

function horsFiltre(): string[] {
  return rangees()
    .slice(1)
    .filter((rangee) => within(rangee).queryByText("Hors filtre") !== null)
    .map((rangee) => rangee.textContent?.replace("Hors filtre", "") ?? "");
}

describe("lignes affichées : fenêtre et clavier (F-019-AC15)", () => {
  it("F-019-AC15 le nombre de rangées exposé et la navigation au clavier portent sur les lignes affichées", async () => {
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    await filtrer(utilisateur, { depart: "Nom", cible: "État" }, "est", "En cours");
    expect(screen.getByRole("grid").getAttribute("aria-rowcount")).toBe("4");

    cellule(2, 2).focus();
    await utilisateur.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(focus()).toBe(cellule(4, 2));
    await utilisateur.keyboard("{Control>}{Home}{/Control}");
    expect(focus()).toBe(cellule(2, 2));
    expect(rangees()).toHaveLength(4);
  });

  it("F-019-AC15 la même définition vaut pour la vue qui lit les lignes affichées : un tri change l'ordre des rangées exposées", async () => {
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    await ajouterUnTri(utilisateur);
    expect(noms()).toEqual(["abricot", "Banane", "Cerise", "ecole", "École", "Zèbre"]);
    expect(cellule(2, 2).textContent).toBe("abricot");
  });
});

describe("mise à jour reçue (F-019-AC16)", () => {
  it("F-019-AC16 une ligne qui entre dans le filtre apparaît, la cellule courante reste sur sa ligne", async () => {
    const { table, utilisateur } = rendreLaTable(remplirSixLignes);
    await filtrer(utilisateur, { depart: "Nom", cible: "État" }, "est", "En cours");
    cellule(3, 2).focus();
    expect(noms()).toEqual(["Zèbre", "École", "Banane"]);

    recevoirDansLaTable(table, (replique) => {
      const etat = replique.lire().colonnes.find(({ nom }) => nom === "État");
      const option = etat?.options.find(({ libelle }) => libelle === "En cours");
      replique.ecrireCellule(ligneDe(replique, "abricot"), etat?.id ?? "", option?.id ?? "");
    });

    expect(noms()).toEqual(["Zèbre", "abricot", "École", "Banane"]);
    expect(focus()).toBe(cellule(4, 2));
    expect(cellule(4, 2).textContent).toBe("École");
    expect(barre("Filtres").textContent).toContain("4 lignes sur 6");
    expect(
      screen.queryByRole("button", { name: "Réappliquer les filtres et les tris" }),
    ).toBeNull();
  });

  it("F-019-AC16 une ligne qui sort du filtre par une mise à jour reçue est traitée comme une ligne disparue", async () => {
    const { table, utilisateur } = rendreLaTable(remplirSixLignes);
    await filtrer(utilisateur, { depart: "Nom", cible: "État" }, "est", "En cours");
    cellule(3, 2).focus();

    recevoirDansLaTable(table, (replique) => {
      const etat = replique.lire().colonnes.find(({ nom }) => nom === "État");
      const option = etat?.options.find(({ libelle }) => libelle === "Terminé");
      replique.ecrireCellule(ligneDe(replique, "École"), etat?.id ?? "", option?.id ?? "");
    });

    expect(noms()).toEqual(["Zèbre", "Banane"]);
    expect(barre("Filtres").textContent).toContain("2 lignes sur 6");
    expect(
      screen.queryByRole("button", { name: "Réappliquer les filtres et les tris" }),
    ).toBeNull();
  });
});

describe("affichage figé (F-019-AC17, AC18)", () => {
  async function figee() {
    const rendue = rendreLaTable(remplirSixLignes);
    await filtrer(rendue.utilisateur, { depart: "Nom", cible: "Prix" }, "=", "7");
    expect(noms()).toEqual(["École", "ecole"]);
    cellule(2, 3).focus();
    await rendue.utilisateur.keyboard("8{Enter}");
    return rendue;
  }

  it("F-019-AC17 F-019-AC18 la ligne modifiée qui sort du filtre reste, à sa place, marquée « Hors filtre » ; « Réappliquer » est annoncée puis la retire", async () => {
    const { table, utilisateur } = await figee();

    expect(table.lire().lignes[2]?.cellules[1]).toBe(8);
    expect(noms()).toEqual(["École", "ecole"]);
    expect(horsFiltre()).toHaveLength(1);
    const marque = within(rangees()[1] as HTMLElement).getByText("Hors filtre");
    // AC18 : un texte à l'écran, pas seulement pour les lecteurs d'écran, et cité par la cellule.
    expect(marque.closest(".sr-only")).toBeNull();
    expect(marque.className).not.toContain("sr-only");
    expect(marque.closest('[role="rowheader"]')?.getAttribute("aria-describedby")).toBe(marque.id);
    await annonce(
      "Les lignes affichées ne sont plus recalculées. Activez « Réappliquer les filtres et les tris » pour les recalculer.",
    );

    await utilisateur.click(
      within(barre("Filtres")).getByRole("button", { name: "Réappliquer les filtres et les tris" }),
    );
    expect(noms()).toEqual(["ecole"]);
    expect(horsFiltre()).toEqual([]);
    expect(
      screen.queryByRole("button", { name: "Réappliquer les filtres et les tris" }),
    ).toBeNull();
  });

  it("F-019-AC17 une ligne créée dans l'onglet s'affiche en dernière place même hors filtre ; une ligne créée ailleurs n'apparaît pas ; une ligne supprimée, ici ou ailleurs, disparaît", async () => {
    const { table, utilisateur } = await figee();

    await utilisateur.click(screen.getByRole("button", { name: "Nouvelle ligne" }));
    expect(noms()).toEqual(["École", "ecole", ""]);
    expect(horsFiltre()).toHaveLength(2);

    recevoirDansLaTable(table, (replique) => {
      const prix = replique.lire().colonnes.find(({ nom }) => nom === "Prix");
      replique.creerLigne(new Map([[prix?.id ?? "", 7]]));
    });
    expect(noms()).toEqual(["École", "ecole", ""]);

    recevoirDansLaTable(table, (replique) => replique.supprimerLigne(ligneDe(replique, "ecole")));
    expect(noms()).toEqual(["École", ""]);

    act(() => table.supprimerLigne(ligneDe(table, "École")));
    expect(noms()).toEqual([""]);
  });

  it("F-019-AC18 modifier la définition rend l'affichage recalculé", async () => {
    const { utilisateur } = await figee();
    expect(horsFiltre()).toHaveLength(1);

    await ajouterUnTri(utilisateur);
    await choisir(utilisateur, "Sens du tri sur Nom", "Décroissant");
    expect(noms()).toEqual(["ecole"]);
    expect(horsFiltre()).toEqual([]);
    expect(
      screen.queryByRole("button", { name: "Réappliquer les filtres et les tris" }),
    ).toBeNull();
  });

  it("F-019-AC18 rouvrir la table rend l'affichage recalculé, la définition étant retrouvée", async () => {
    const { table } = await figee();
    expect(horsFiltre()).toHaveLength(1);

    rouvrir(table);
    expect(noms()).toEqual(["ecole"]);
    expect(horsFiltre()).toEqual([]);
    expect(
      screen.queryByRole("button", { name: "Réappliquer les filtres et les tris" }),
    ).toBeNull();
  });

  it("F-019-AC17 une écriture refusée par le document sous un filtre actif ne fige rien : les lignes restent recalculées", async () => {
    const { table, utilisateur } = rendreLaTable(remplirSixLignes);
    await filtrer(utilisateur, { depart: "Nom", cible: "Prix" }, "=", "7");
    vi.spyOn(table, "ecrireCellule").mockImplementation(() => {
      throw new ErreurDocument("valeur-non-conforme", "refus");
    });
    cellule(2, 3).focus();
    await utilisateur.keyboard("8{Enter}");

    expect(table.lire().lignes[2]?.cellules[1]).toBe(7);
    expect(screen.queryByRole("button", { name: REAPPLIQUER })).toBeNull();
    expect(horsFiltre()).toEqual([]);
    // Pas figé : une ligne reçue qui satisfait le filtre apparaît aussitôt.
    recevoirDansLaTable(table, (replique) => {
      const prix = replique.lire().colonnes.find(({ nom }) => nom === "Prix");
      replique.creerLigne(new Map([[prix?.id ?? "", 7]]));
    });
    expect(noms()).toEqual(["École", "ecole", ""]);
  });

  it.each([
    ["vider une cellule (Suppr)", 3, "{Delete}"],
    ["cocher une case (Espace)", 5, " "],
  ])(
    "F-019-AC17 %s depuis l'onglet fige l'affichage sous un filtre actif",
    async (_geste, colonne, touches) => {
      const { utilisateur } = rendreLaTable(remplirSixLignes);
      await filtrer(utilisateur, { depart: "Nom", cible: "Nom" }, "contient", "ecole");
      cellule(2, colonne).focus();
      await utilisateur.keyboard(touches);
      expect(screen.getByRole("button", { name: REAPPLIQUER })).toBeTruthy();
    },
  );

  it("F-019-AC27 activer « Réappliquer » démonte le bouton : le focus va à « Ajouter un filtre »", async () => {
    const { utilisateur } = await figee();
    const reappliquer = within(barre("Filtres")).getByRole("button", { name: REAPPLIQUER });
    reappliquer.focus();
    await utilisateur.keyboard("{Enter}");

    expect(screen.queryByRole("button", { name: REAPPLIQUER })).toBeNull();
    expect(document.activeElement).toBe(
      within(barre("Filtres")).getByRole("button", { name: "Ajouter un filtre" }),
    );
  });

  it("F-019-AC18 la colonne des actions garde sa largeur de F-018 (72 px) et ne s'élargit à 144 px que pour la mention « Hors filtre »", async () => {
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    expect(cellule(1, 1).style.width).toBe("72px");
    await filtrer(utilisateur, { depart: "Nom", cible: "Prix" }, "=", "7");
    expect(cellule(1, 1).style.width).toBe("72px");
    expect(cellule(2, 1).style.width).toBe("72px");
    const colonnes = 5 * 180;
    expect(rangees()[1]?.style.width).toBe(`${String(72 + colonnes)}px`);

    cellule(2, 3).focus();
    await utilisateur.keyboard("8{Enter}");
    expect(horsFiltre()).toHaveLength(1);
    expect(cellule(1, 1).style.width).toBe("144px");
    expect(cellule(2, 1).style.width).toBe("144px");
    expect(cellule(3, 1).style.width).toBe("144px");
    expect(rangees()[1]?.style.width).toBe(`${String(144 + colonnes)}px`);

    await utilisateur.click(within(barre("Filtres")).getByRole("button", { name: REAPPLIQUER }));
    expect(cellule(1, 1).style.width).toBe("72px");
  });

  it("F-019-AC17 sans filtre ni tri actif, une modification ne fige rien", async () => {
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    cellule(2, 3).focus();
    await utilisateur.keyboard("8{Enter}");
    expect(
      screen.queryByRole("button", { name: "Réappliquer les filtres et les tris" }),
    ).toBeNull();
  });
});

describe("déplacer une ligne sous une définition (F-019-AC19)", () => {
  it("F-019-AC19 sous un tri actif, « Monter » et « Descendre » sont indisponibles avec la raison « Tri actif », le raccourci n'écrit rien", async () => {
    const { utilisateur, emises } = rendreLaTable(remplirSixLignes);
    await ajouterUnTri(utilisateur);
    emises.length = 0;

    await utilisateur.click(screen.getByRole("button", { name: "Actions de la ligne 2" }));
    const menu = await screen.findByRole("menu", { name: "Actions de la ligne 2" });
    for (const nom of ["Monter la ligne 2", "Descendre la ligne 2"]) {
      const entree = within(menu).getByRole("menuitem", { name: nom });
      expect(entree.hasAttribute("disabled")).toBe(true);
      expect(entree.getAttribute("aria-describedby")).not.toBeNull();
    }
    expect(within(menu).getAllByText("Tri actif").length).toBeGreaterThan(0);
    await utilisateur.keyboard("{Escape}");

    cellule(3, 2).focus();
    await utilisateur.keyboard("{Alt>}{Shift>}{ArrowUp}{/Shift}{/Alt}");
    expect(screen.getByRole("status").textContent).toBe("Tri actif");
    expect(emises).toEqual([]);
  });

  it("F-019-AC19 sous des filtres seuls, la ligne passe avant la ligne affichée qui la précède, en une seule opération, dans l'ordre manuel de la table", async () => {
    const { table, utilisateur, emises } = rendreLaTable(remplirSixLignes);
    await filtrer(utilisateur, { depart: "Nom", cible: "État" }, "est", "Terminé");
    expect(noms()).toEqual(["abricot", "ecole", "Cerise"]);
    emises.length = 0;

    cellule(4, 2).focus();
    await utilisateur.keyboard("{Alt>}{Shift>}{ArrowUp}{/Shift}{/Alt}");

    expect(emises).toHaveLength(1);
    expect(table.lire().lignes.map(({ cellules }) => cellules[0])).toEqual([
      "Zèbre",
      "abricot",
      "École",
      "Cerise",
      "ecole",
      "Banane",
    ]);
    expect(noms()).toEqual(["abricot", "Cerise", "ecole"]);
    expect(focus()).toBe(cellule(3, 2));
  });

  it("F-019-AC19 sous des filtres seuls, « Descendre » place la ligne juste après la ligne affichée qui la suit", async () => {
    const { table, utilisateur, emises } = rendreLaTable(remplirSixLignes);
    await filtrer(utilisateur, { depart: "Nom", cible: "État" }, "est", "Terminé");
    emises.length = 0;

    cellule(2, 2).focus();
    await utilisateur.keyboard("{Alt>}{Shift>}{ArrowDown}{/Shift}{/Alt}");

    expect(emises).toHaveLength(1);
    expect(table.lire().lignes.map(({ cellules }) => cellules[0])).toEqual([
      "Zèbre",
      "École",
      "ecole",
      "abricot",
      "Banane",
      "Cerise",
    ]);
  });
});

describe("déplacer une ligne sous un affichage figé (F-019-AC19)", () => {
  it("F-019-AC19 la ligne déplacée prend la place de la ligne affichée voisine dans la liste figée", async () => {
    const rendue = rendreLaTable(remplirSixLignes);
    await filtrer(rendue.utilisateur, { depart: "Nom", cible: "Prix" }, "=", "7");
    cellule(2, 3).focus();
    await rendue.utilisateur.keyboard("8{Enter}");
    expect(noms()).toEqual(["École", "ecole"]);

    cellule(3, 2).focus();
    await rendue.utilisateur.keyboard("{Alt>}{Shift>}{ArrowUp}{/Shift}{/Alt}");
    expect(noms()).toEqual(["ecole", "École"]);
    expect(screen.getByRole("button", { name: REAPPLIQUER })).toBeTruthy();
  });
});

describe("rechargement (F-019-AC20)", () => {
  it("F-019-AC20 la définition est retrouvée et appliquée à la réouverture, dans la section filtres-tris", async () => {
    const { table, utilisateur } = rendreLaTable(remplirSixLignes);
    await filtrer(utilisateur, { depart: "Nom", cible: "État" }, "est", "En cours");
    await ajouterUnTri(utilisateur);
    await choisir(utilisateur, "Sens du tri sur Nom", "Décroissant");

    const lu = JSON.parse(localStorage.getItem(CLE_DES_REGLAGES) ?? "null") as {
      sections: Record<string, unknown>;
    };
    expect(Object.keys(lu.sections)).toEqual(["filtres-tris"]);

    rouvrir(table);
    expect(noms()).toEqual(["Zèbre", "École", "Banane"]);
    expect(barre("Filtres").textContent).toContain("1 filtre · 3 lignes sur 6");
    expect(barre("Tris").textContent).toContain("1 tri");
  });

  it("F-019-AC20 une section enregistrée mal formée est lue vide, sans exception", () => {
    localStorage.setItem(
      CLE_DES_REGLAGES,
      JSON.stringify({ version: 1, sections: { "filtres-tris": { filtres: "x", tris: 3 } } }),
    );
    rendreLaTable(remplirSixLignes);

    expect(noms()).toHaveLength(6);
    expect(barre("Filtres").textContent).toContain("Aucun filtre · 6 lignes sur 6");
  });
});
