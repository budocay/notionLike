// Barres « Filtres » et « Tris » de l'écran de table (F-019-AC1, AC6, AC7, AC12, AC23 à AC27).
import { act, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { analyserLaValeur } from "../../src/vues-de-table/valeur-de-filtre.ts";
import { colonne } from "./aides-definition.ts";
import {
  cellule,
  nomsDesEnTetes,
  rangees,
  recevoirDansLaTable,
  rendreLaTable,
} from "./aides-grille.tsx";
import {
  ajouterUnFiltre,
  ajouterUnTri,
  annonce,
  barre,
  choisir,
  CLE_DES_REGLAGES,
  filtrer,
  noms,
  remplirSixLignes,
} from "./aides-barres.tsx";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

function libellesDuChoix(nom: string): string[] {
  return within(screen.getByRole("combobox", { name: nom }))
    .getAllByRole("option")
    .map((option) => option.textContent ?? "");
}

describe("barre « Filtres » (F-019-AC1, AC6)", () => {
  it("F-019-AC1 les opérateurs proposés sont ceux du type de la colonne, et la valeur est demandée seulement quand l'opérateur en demande une", async () => {
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    await ajouterUnFiltre(utilisateur);

    expect(libellesDuChoix("Colonne du filtre sur Nom")).toEqual([
      "Nom",
      "Prix",
      "État",
      "Fait",
      "Échéance",
    ]);
    expect(libellesDuChoix("Opérateur du filtre sur Nom")).toEqual([
      "contient",
      "ne contient pas",
      "est",
      "est vide",
      "n'est pas vide",
    ]);
    await choisir(utilisateur, "Colonne du filtre sur Nom", "Prix");
    expect(libellesDuChoix("Opérateur du filtre sur Prix")).toEqual([
      "=",
      "≠",
      "<",
      "≤",
      ">",
      "≥",
      "est vide",
      "n'est pas vide",
    ]);
    await choisir(utilisateur, "Colonne du filtre sur Prix", "Fait");
    expect(libellesDuChoix("Opérateur du filtre sur Fait")).toEqual([
      "est cochée",
      "n'est pas cochée",
    ]);
    await choisir(utilisateur, "Colonne du filtre sur Fait", "Échéance");
    expect(libellesDuChoix("Opérateur du filtre sur Échéance")).toEqual([
      "est",
      "avant",
      "après",
      "est vide",
      "n'est pas vide",
    ]);
    await choisir(utilisateur, "Colonne du filtre sur Échéance", "État");
    expect(libellesDuChoix("Opérateur du filtre sur État")).toEqual([
      "est",
      "n'est pas",
      "est vide",
      "n'est pas vide",
    ]);
    expect(libellesDuChoix("Valeur du filtre sur État")).toEqual([
      "Choisir une option",
      "En cours",
      "Terminé",
    ]);

    await choisir(utilisateur, "Opérateur du filtre sur État", "est vide");
    expect(screen.queryByRole("combobox", { name: "Valeur du filtre sur État" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Valeur du filtre sur État" })).toBeNull();
  });

  it("F-019-AC1 un filtre ajouté sans valeur est inactif : toutes les lignes restent affichées", async () => {
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    await ajouterUnFiltre(utilisateur);

    expect(noms()).toHaveLength(6);
  });

  it("F-019-AC6 filtrer sur une option affiche les lignes et le compte « N lignes sur M », annoncé ; modifier, retirer et « Tout effacer » recalculent aussitôt", async () => {
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    expect(barre("Filtres").textContent).toContain("Aucun filtre · 6 lignes sur 6");

    await filtrer(utilisateur, { depart: "Nom", cible: "État" }, "est", "En cours");
    expect(noms()).toEqual(["Zèbre", "École", "Banane"]);
    expect(barre("Filtres").textContent).toContain("1 filtre · 3 lignes sur 6");
    await annonce("3 lignes sur 6");

    await choisir(utilisateur, "Valeur du filtre sur État", "Terminé");
    expect(noms()).toEqual(["abricot", "ecole", "Cerise"]);
    await annonce("3 lignes sur 6");

    await filtrer(utilisateur, { depart: "Nom", cible: "Nom" }, "contient", "ECOLE");
    expect(noms()).toEqual(["ecole"]);
    expect(barre("Filtres").textContent).toContain("2 filtres · 1 ligne sur 6");
    await annonce("1 ligne sur 6");

    await utilisateur.click(screen.getByRole("button", { name: "Retirer le filtre sur Nom" }));
    expect(noms()).toEqual(["abricot", "ecole", "Cerise"]);

    await utilisateur.click(within(barre("Filtres")).getByRole("button", { name: "Tout effacer" }));
    expect(noms()).toHaveLength(6);
    expect(barre("Filtres").textContent).toContain("Aucun filtre · 6 lignes sur 6");
    await annonce("6 lignes sur 6");
    expect(within(barre("Filtres")).queryByRole("button", { name: "Tout effacer" })).toBeNull();
  });

  it("F-019-AC1 F-019-AC3 « est vide » trouve la cellule sans valeur, « = » compare les nombres", async () => {
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    await filtrer(utilisateur, { depart: "Nom", cible: "Prix" }, "est vide");
    expect(noms()).toEqual(["Banane"]);

    await choisir(utilisateur, "Opérateur du filtre sur Prix", "=");
    await utilisateur.type(
      screen.getByRole("textbox", { name: "Valeur du filtre sur Prix" }),
      "7{Enter}",
    );
    expect(noms()).toEqual(["École", "ecole"]);
  });
});

describe("barre « Tris » (F-019-AC7)", () => {
  it("F-019-AC7 un tri ajouté prend la première colonne sans tri, croissant, en dernière place ; la colonne ne se propose plus aux autres tris", async () => {
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    await ajouterUnTri(utilisateur);
    expect(noms()).toEqual(["abricot", "Banane", "Cerise", "ecole", "École", "Zèbre"]);
    expect(
      (screen.getByRole("combobox", { name: "Sens du tri sur Nom" }) as HTMLSelectElement).value,
    ).toBe("croissant");

    await ajouterUnTri(utilisateur);
    expect(libellesDuChoix("Colonne du tri sur Prix")).toEqual([
      "Prix",
      "État",
      "Fait",
      "Échéance",
    ]);
    expect(libellesDuChoix("Colonne du tri sur Nom")).toEqual(["Nom", "État", "Fait", "Échéance"]);
    const liste = within(barre("Tris")).getByRole("list", { name: "Liste des tris" });
    expect(within(liste).getAllByRole("listitem")).toHaveLength(2);
  });

  it("F-019-AC7 changer le sens, monter, descendre et retirer un tri recalculent les lignes", async () => {
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    await ajouterUnTri(utilisateur);
    await choisir(utilisateur, "Sens du tri sur Nom", "Décroissant");
    expect(noms()).toEqual(["Zèbre", "École", "ecole", "Cerise", "Banane", "abricot"]);

    await ajouterUnTri(utilisateur);
    expect(
      screen.getByRole("button", { name: "Monter le tri sur Nom" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Descendre le tri sur Prix" }).hasAttribute("disabled"),
    ).toBe(true);

    await utilisateur.click(screen.getByRole("button", { name: "Monter le tri sur Prix" }));
    expect(noms()).toEqual(["Cerise", "Zèbre", "École", "ecole", "abricot", "Banane"]);

    await utilisateur.click(screen.getByRole("button", { name: "Descendre le tri sur Prix" }));
    expect(noms()).toEqual(["Zèbre", "École", "ecole", "Cerise", "Banane", "abricot"]);

    await utilisateur.click(screen.getByRole("button", { name: "Retirer le tri sur Prix" }));
    await utilisateur.click(screen.getByRole("button", { name: "Retirer le tri sur Nom" }));
    expect(noms()).toEqual(["Zèbre", "abricot", "École", "ecole", "Banane", "Cerise"]);
  });

  it("F-019-AC7 quand toutes les colonnes ont un tri, l'ajout est refusé avec un message", async () => {
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    for (let i = 0; i < 5; i += 1) {
      await ajouterUnTri(utilisateur);
    }
    expect(within(barre("Tris")).getAllByRole("listitem")).toHaveLength(5);
    await ajouterUnTri(utilisateur);
    expect(screen.getByRole("alert").textContent).toBe("Une table compte au plus 5 tris.");
  });
});

describe("repères de tri sur les en-têtes (F-019-AC12)", () => {
  it("F-019-AC12 chaque en-tête trié porte une marque de sens, aria-sort sur le seul tri principal", async () => {
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    await ajouterUnTri(utilisateur);
    await ajouterUnTri(utilisateur);
    await choisir(utilisateur, "Sens du tri sur Prix", "Décroissant");

    const enTetes = within(screen.getByRole("grid")).getAllByRole("columnheader");
    const nom = enTetes.find((un) => (un.textContent ?? "").startsWith("Nom"));
    const prix = enTetes.find((un) => (un.textContent ?? "").startsWith("Prix"));
    const etat = enTetes.find((un) => (un.textContent ?? "").startsWith("État"));
    expect(nom?.getAttribute("aria-sort")).toBe("ascending");
    expect(nom?.textContent).toContain("↑");
    expect(prix?.hasAttribute("aria-sort")).toBe(false);
    expect(prix?.textContent).toContain("↓");
    expect(prix?.textContent).toContain("2");
    expect(etat?.hasAttribute("aria-sort")).toBe(false);
    expect(etat?.textContent).not.toMatch(/[↑↓]/);
    expect(enTetes.filter((un) => un.hasAttribute("aria-sort"))).toHaveLength(1);

    await utilisateur.click(screen.getByRole("button", { name: "Retirer le tri sur Nom" }));
    const apres = within(screen.getByRole("grid")).getAllByRole("columnheader");
    expect(apres.filter((un) => un.hasAttribute("aria-sort"))).toHaveLength(1);
    expect(
      apres.find((un) => (un.textContent ?? "").startsWith("Prix"))?.getAttribute("aria-sort"),
    ).toBe("descending");
  });
});

describe("éléments inactifs (F-019-AC23)", () => {
  it("F-019-AC23 colonne supprimée dans l'onglet : le filtre et le tri restent, avec la mention, sans effet, et se retirent", async () => {
    const { table, utilisateur } = rendreLaTable(remplirSixLignes);
    await filtrer(utilisateur, { depart: "Nom", cible: "État" }, "est", "En cours");
    await ajouterUnTri(utilisateur);
    expect(noms()).toEqual(["Banane", "École", "Zèbre"]);

    const etat = table.lire().colonnes.find(({ nom }) => nom === "État");
    const nomDeLaColonne = table.lire().colonnes[0];
    act(() => table.supprimerColonne(etat?.id ?? ""));
    expect(noms()).toHaveLength(6);
    expect(barre("Filtres").textContent).toContain("Colonne supprimée");
    expect(
      screen.getByRole("button", { name: "Retirer le filtre sur la colonne supprimée" }),
    ).toBeTruthy();
    expect(nomDeLaColonne?.nom).toBe("Nom");

    await utilisateur.click(
      screen.getByRole("button", { name: "Retirer le filtre sur la colonne supprimée" }),
    );
    expect(barre("Filtres").textContent).not.toContain("Colonne supprimée");

    act(() => table.supprimerColonne(nomDeLaColonne?.id ?? ""));
    expect(barre("Tris").textContent).toContain("Colonne supprimée");
    await utilisateur.click(
      screen.getByRole("button", { name: "Retirer le tri sur la colonne supprimée" }),
    );
    expect(within(barre("Tris")).queryAllByRole("listitem")).toHaveLength(0);
  });

  it("F-019-AC23 option retirée par une mise à jour reçue : mention « Option supprimée », filtre sans effet", async () => {
    const { table, utilisateur } = rendreLaTable(remplirSixLignes);
    await filtrer(utilisateur, { depart: "Nom", cible: "État" }, "est", "En cours");
    expect(noms()).toHaveLength(3);

    recevoirDansLaTable(table, (replique) => {
      const etat = replique.lire().colonnes.find(({ nom }) => nom === "État");
      const option = etat?.options.find(({ libelle }) => libelle === "En cours");
      replique.retirerOption(etat?.id ?? "", option?.id ?? "");
    });
    expect(barre("Filtres").textContent).toContain("Option supprimée");
    expect(noms()).toHaveLength(6);
    expect(libellesDuChoix("Valeur du filtre sur État")).toEqual([
      "Choisir une option",
      "Option introuvable",
      "Terminé",
    ]);
    await utilisateur.click(screen.getByRole("button", { name: "Retirer le filtre sur État" }));
    expect(barre("Filtres").textContent).not.toContain("Option supprimée");
  });
});

describe("lignes de filtres voisines (F-019-AC6)", () => {
  it("F-019-AC6 deux filtres de même colonne et opérateur : retirer le premier montre la valeur du second, et le blur n'écrase rien", async () => {
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    await filtrer(utilisateur, { depart: "Nom", cible: "Nom" }, "contient", "alpha");
    await ajouterUnFiltre(utilisateur);
    const champs = (): HTMLInputElement[] =>
      screen.getAllByRole<HTMLInputElement>("textbox", { name: "Valeur du filtre sur Nom" });
    await utilisateur.type(champs()[1] as HTMLInputElement, "beta{Enter}");

    await utilisateur.click(
      screen.getAllByRole("button", { name: "Retirer le filtre sur Nom" })[0] as HTMLElement,
    );
    expect(champs()).toHaveLength(1);
    expect((champs()[0] as HTMLInputElement).value).toBe("beta");

    const avant = localStorage.getItem(CLE_DES_REGLAGES);
    await utilisateur.click(champs()[0] as HTMLInputElement);
    await utilisateur.tab();
    expect((champs()[0] as HTMLInputElement).value).toBe("beta");
    expect(localStorage.getItem(CLE_DES_REGLAGES)).toBe(avant);
  });
});

describe("valeurs refusées et limites (F-019-AC24, AC25)", () => {
  it("F-019-AC24 un nombre mal formé est refusé avec le message de la cellule, la définition reste inchangée", async () => {
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    await filtrer(utilisateur, { depart: "Nom", cible: "Prix" }, "=");
    const avant = localStorage.getItem(CLE_DES_REGLAGES);
    await utilisateur.type(
      screen.getByRole("textbox", { name: "Valeur du filtre sur Prix" }),
      "abc{Enter}",
    );

    expect(screen.getByRole("alert").textContent).toBe(
      "Saisissez un nombre, par exemple 12 ou 3,5.",
    );
    expect(localStorage.getItem(CLE_DES_REGLAGES)).toBe(avant);
    expect(noms()).toHaveLength(6);
  });

  it("F-019-AC24 une date invalide est refusée avec le message de la cellule ; valeur vide : filtre inactif", () => {
    const date = colonne("d", "date");
    expect(analyserLaValeur(date, "2026-02-30")).toEqual({
      sorte: "refus",
      message: "Saisissez une date valide.",
    });
    expect(analyserLaValeur(date, "2026-02-28")).toEqual({ sorte: "valeur", valeur: "2026-02-28" });
    expect(analyserLaValeur(date, "")).toEqual({ sorte: "valeur", valeur: undefined });
    expect(analyserLaValeur(colonne("n", "nombre"), "")).toEqual({
      sorte: "valeur",
      valeur: undefined,
    });
  });

  it("F-019-AC25 le vingt et unième filtre est refusé avec un message qui cite la limite", async () => {
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    for (let i = 0; i < 20; i += 1) {
      await ajouterUnFiltre(utilisateur);
    }
    expect(within(barre("Filtres")).getAllByRole("listitem")).toHaveLength(20);
    await ajouterUnFiltre(utilisateur);
    expect(screen.getByRole("alert").textContent).toBe("Une table compte au plus 20 filtres.");
    expect(within(barre("Filtres")).getAllByRole("listitem")).toHaveLength(20);
  });

  it("F-019-AC25 une valeur de plus de 2 000 caractères est refusée avec un message qui cite la limite", async () => {
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    await filtrer(utilisateur, { depart: "Nom", cible: "Nom" }, "contient");
    const champ = screen.getByRole("textbox", { name: "Valeur du filtre sur Nom" });
    await utilisateur.click(champ);
    await utilisateur.paste("a".repeat(2001));
    await utilisateur.keyboard("{Enter}");

    expect(screen.getByRole("alert").textContent).toBe(
      "La valeur d'un filtre compte au plus 2000 caractères.",
    );
    expect(noms()).toHaveLength(6);
  });
});

describe("balisage et noms accessibles (F-019-AC26)", () => {
  it("F-019-AC26 un nom de colonne, un libellé d'option et une valeur de filtre qui portent du balisage sont affichés comme du texte", async () => {
    const piege = '<img src="x" onerror="alert(1)">';
    const { utilisateur } = rendreLaTable((table) => {
      const texte = table.creerColonne(piege, "texte");
      const choix = table.creerColonne("Choix", "selection");
      table.ajouterOption(choix, "<script>alert(1)</script>");
      table.creerLigne(new Map([[texte, "x"]]));
    });
    await ajouterUnFiltre(utilisateur);
    await utilisateur.type(
      screen.getByRole("textbox", { name: `Valeur du filtre sur ${piege}` }),
      "<b>gras</b>{Enter}",
    );
    await ajouterUnTri(utilisateur);
    await choisir(utilisateur, `Colonne du filtre sur ${piege}`, "Choix");
    await choisir(utilisateur, "Opérateur du filtre sur Choix", "est");

    expect(libellesDuChoix("Valeur du filtre sur Choix")).toContain("<script>alert(1)</script>");
    expect(screen.getByRole("button", { name: `Retirer le tri sur ${piege}` })).toBeTruthy();
    for (const element of ["img", "script", "b"]) {
      expect(document.body.querySelector(element)).toBeNull();
    }
    expect(nomsDesEnTetes()[0]).toContain(piege);
  });
});

describe("clavier et réseau (F-019-AC27)", () => {
  it("F-019-AC27 ajouter un filtre, choisir et saisir se fait au clavier seul ; les commandes citent la colonne ; aucune requête réseau", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const socket = vi.fn();
    vi.stubGlobal("WebSocket", socket);
    const { utilisateur } = rendreLaTable(remplirSixLignes);

    within(barre("Filtres")).getByRole("button", { name: "Ajouter un filtre" }).focus();
    await utilisateur.keyboard("{Enter}");
    await utilisateur.tab();
    expect(document.activeElement).toBe(
      within(barre("Filtres")).getByRole("button", { name: "Tout effacer" }),
    );
    await utilisateur.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("combobox", { name: "Colonne du filtre sur Nom" }),
    );
    await utilisateur.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("combobox", { name: "Opérateur du filtre sur Nom" }),
    );
    await utilisateur.keyboard("{ArrowDown}");
    await utilisateur.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Valeur du filtre sur Nom" }),
    );
    await utilisateur.keyboard("ecole{Enter}");
    expect(noms()).toEqual(["École", "ecole"]);
    await utilisateur.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Retirer le filtre sur Nom" }),
    );
    await utilisateur.keyboard("{Enter}");
    expect(noms()).toHaveLength(6);

    expect(fetch).not.toHaveBeenCalled();
    expect(socket).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("F-019-AC21 F-019-AC27 ajouter, modifier et retirer filtres et tris n'écrit rien dans le document de table, octet pour octet", async () => {
    const { table, utilisateur, emises } = rendreLaTable(remplirSixLignes);
    emises.length = 0;
    const avant = Y.encodeStateAsUpdate(table.doc);

    await filtrer(utilisateur, { depart: "Nom", cible: "État" }, "est", "En cours");
    await ajouterUnTri(utilisateur);
    await choisir(utilisateur, "Sens du tri sur Nom", "Décroissant");
    await choisir(utilisateur, "Valeur du filtre sur État", "Terminé");
    await utilisateur.click(screen.getByRole("button", { name: "Retirer le tri sur Nom" }));
    await utilisateur.click(screen.getByRole("button", { name: "Retirer le filtre sur État" }));

    expect(emises).toEqual([]);
    expect(Y.encodeStateAsUpdate(table.doc)).toEqual(avant);
  });

  it("F-019-AC21 espace en lecture seule : filtres et tris restent utilisables", async () => {
    const { table, utilisateur, emises } = rendreLaTable(remplirSixLignes, {
      lectureSeule: "Espace ouvert en lecture seule.",
    });
    const avant = Y.encodeStateAsUpdate(table.doc);
    await filtrer(utilisateur, { depart: "Nom", cible: "État" }, "est", "En cours");
    await ajouterUnTri(utilisateur);

    expect(noms()).toEqual(["Banane", "École", "Zèbre"]);
    expect(emises).toEqual([]);
    expect(Y.encodeStateAsUpdate(table.doc)).toEqual(avant);
    expect(cellule(2, 2)).toBeTruthy();
    expect(rangees().length).toBeGreaterThan(1);
  });
});
