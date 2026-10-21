// Colonnes de la grille (F-018-AC17 à AC22) : invitation, création, renommage, déplacements,
// suppression et options, chacune par une seule opération du document de table.
import type { DocumentTable } from "@notionlike/document";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { cellule, focus, nomsDesEnTetes, rendreLaTable, textesDesLignes } from "./aides-grille.tsx";

async function ouvrirLeMenuDeColonne(
  utilisateur: ReturnType<typeof rendreLaTable>["utilisateur"],
  nom: string,
): Promise<HTMLElement> {
  await utilisateur.click(screen.getByRole("button", { name: `Actions de la colonne ${nom}` }));
  return screen.findByRole("menu", { name: `Actions de la colonne ${nom}` });
}

function deuxColonnes(table: DocumentTable): void {
  table.creerColonne("Nom", "texte");
  table.creerColonne("Prix", "nombre");
}

describe("table sans colonne ou sans ligne (F-018-AC17)", () => {
  it("F-018-AC17 sans colonne, l'invitation « Ajouter une colonne » à la place de la grille", () => {
    rendreLaTable();
    expect(screen.queryByRole("grid")).toBeNull();
    expect(screen.getByText(/aucune colonne/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Ajouter une colonne" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Nouvelle ligne" })).toBeNull();
  });

  it("F-018-AC17 des colonnes et aucune ligne : la rangée d'en-têtes et l'action « Nouvelle ligne »", () => {
    rendreLaTable(deuxColonnes);
    expect(nomsDesEnTetes()).toEqual(["Nom", "Prix"]);
    expect(textesDesLignes()).toEqual([]);
    expect(screen.getByRole("button", { name: "Nouvelle ligne" })).toBeDefined();
  });
});

describe("ajouter une colonne (F-018-AC18)", () => {
  it("F-018-AC18 la boîte demande un nom et un type parmi les cinq, Texte par défaut ; la colonne est créée en dernier par une seule opération et son en-tête reçoit le focus", async () => {
    const { table, utilisateur, emises } = rendreLaTable(deuxColonnes);
    await utilisateur.click(screen.getByRole("button", { name: "Ajouter une colonne" }));
    const boite = await screen.findByRole("dialog", { name: "Nouvelle colonne" });
    const type = within(boite).getByRole<HTMLSelectElement>("combobox", {
      name: "Type de la colonne",
    });
    expect(type.value).toBe("texte");
    expect([...type.options].map((option) => option.textContent)).toEqual([
      "Texte",
      "Nombre",
      "Case à cocher",
      "Date",
      "Sélection",
    ]);
    expect(focus()).toBe(within(boite).getByLabelText("Nom de la colonne"));

    await utilisateur.type(focus() as HTMLElement, "Échéance");
    await utilisateur.selectOptions(type, "date");
    await utilisateur.click(within(boite).getByRole("button", { name: "Créer la colonne" }));

    expect(emises).toHaveLength(1);
    expect(table.lire().colonnes.map(({ nom, type: genre }) => [nom, genre])).toEqual([
      ["Nom", "texte"],
      ["Prix", "nombre"],
      ["Échéance", "date"],
    ]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(focus()).toBe(cellule(1, 4));
  });

  it("F-018-AC18 depuis l'invitation, Annuler ou Échap ne créent rien et rendent le focus", async () => {
    const { utilisateur, emises } = rendreLaTable();
    const inviter = screen.getByRole("button", { name: "Ajouter une colonne" });
    await utilisateur.click(inviter);
    await utilisateur.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(focus()).toBe(inviter);
    await utilisateur.click(inviter);
    await utilisateur.click(screen.getByRole("button", { name: "Annuler" }));
    expect(focus()).toBe(inviter);
    expect(emises).toEqual([]);
  });

  it("F-018-AC18 F-017 H3 aucune commande ne change le type d'une colonne existante", async () => {
    const { utilisateur } = rendreLaTable(deuxColonnes);
    const menu = await ouvrirLeMenuDeColonne(utilisateur, "Nom");
    const libelles = within(menu)
      .getAllByRole("menuitem")
      .map((entree) => entree.firstChild?.textContent);
    expect(libelles).toEqual([
      "Renommer la colonne",
      "Déplacer à gauche",
      "Déplacer à droite",
      "Supprimer la colonne",
    ]);
    expect(libelles.join(" ")).not.toMatch(/type/i);
  });
});

describe("renommer une colonne (F-018-AC19)", () => {
  it("F-018-AC19 validé par Entrée, le nouveau nom s'affiche ; Échap garde l'ancien ; vide, « Sans nom »", async () => {
    const { table, utilisateur } = rendreLaTable(deuxColonnes);
    const menu = await ouvrirLeMenuDeColonne(utilisateur, "Nom");
    await utilisateur.click(
      within(menu).getByRole("menuitem", { name: "Renommer la colonne Nom" }),
    );
    const champ = screen.getByRole("textbox", { name: "Nom de la colonne Nom" });
    await utilisateur.clear(champ);
    await utilisateur.type(champ, "Article{Enter}");
    expect(nomsDesEnTetes()).toEqual(["Article", "Prix"]);

    await utilisateur.click(
      within(await ouvrirLeMenuDeColonne(utilisateur, "Article")).getByRole("menuitem", {
        name: "Renommer la colonne Article",
      }),
    );
    await utilisateur.keyboard("{Backspace}{Backspace}{Escape}");
    expect(nomsDesEnTetes()).toEqual(["Article", "Prix"]);
    expect(focus()).toBe(cellule(1, 2));

    await utilisateur.click(
      within(await ouvrirLeMenuDeColonne(utilisateur, "Article")).getByRole("menuitem", {
        name: "Renommer la colonne Article",
      }),
    );
    await utilisateur.clear(screen.getByRole("textbox", { name: "Nom de la colonne Article" }));
    await utilisateur.tab();
    expect(nomsDesEnTetes()).toEqual(["Sans nom", "Prix"]);
    expect(table.lire().colonnes[0]?.nom).toBe("");
  });

  it("F-018-AC19 au-delà de 200 caractères, la saisie est refusée, le message cite la limite et le texte saisi reste", async () => {
    const { table, utilisateur, emises } = rendreLaTable(deuxColonnes);
    await utilisateur.click(
      within(await ouvrirLeMenuDeColonne(utilisateur, "Nom")).getByRole("menuitem", {
        name: "Renommer la colonne Nom",
      }),
    );
    const champ = screen.getByRole<HTMLInputElement>("textbox", { name: "Nom de la colonne Nom" });
    await utilisateur.clear(champ);
    await utilisateur.click(champ);
    await utilisateur.paste("n".repeat(201));
    await utilisateur.keyboard("{Enter}");

    expect(screen.getByRole("alert").textContent).toContain("200");
    expect(champ.value).toHaveLength(201);
    expect(champ.getAttribute("aria-invalid")).toBe("true");
    expect(table.lire().colonnes[0]?.nom).toBe("Nom");
    expect(emises).toEqual([]);
  });
});

describe("déplacer une colonne (F-018-AC20)", () => {
  it("F-018-AC20 « Déplacer à droite » déplace d'une place par une seule opération, garde le focus sur l'en-tête et annonce la place", async () => {
    const { table, utilisateur, emises } = rendreLaTable(deuxColonnes);
    const menu = await ouvrirLeMenuDeColonne(utilisateur, "Nom");
    await utilisateur.click(
      within(menu).getByRole("menuitem", { name: "Déplacer la colonne Nom à droite" }),
    );

    expect(emises).toHaveLength(1);
    expect(table.lire().colonnes.map(({ nom }) => nom)).toEqual(["Prix", "Nom"]);
    expect(focus()).toBe(cellule(1, 3));
    expect(focus()?.textContent).toContain("Nom");
    expect(screen.getByRole("status").textContent).toBe(
      "Colonne Nom déplacée en position 2 sur 2.",
    );
  });

  it("F-018-AC20 la première ne va pas à gauche, la dernière pas à droite : commandes indisponibles, aucune mise à jour", async () => {
    const { utilisateur, emises } = rendreLaTable(deuxColonnes);
    const premier = await ouvrirLeMenuDeColonne(utilisateur, "Nom");
    const gauche = within(premier).getByRole("menuitem", {
      name: "Déplacer la colonne Nom à gauche",
    });
    expect(gauche.hasAttribute("disabled")).toBe(true);
    expect(gauche.textContent).toContain("Déjà la première colonne.");
    await utilisateur.keyboard("{Escape}");
    const dernier = await ouvrirLeMenuDeColonne(utilisateur, "Prix");
    expect(
      within(dernier)
        .getByRole("menuitem", { name: "Déplacer la colonne Prix à droite" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(emises).toEqual([]);
  });

  it("F-018-AC20 F-018-AC34 au clavier seul : Entrée sur l'en-tête ouvre son menu, Échap le ferme et rend le focus à l'en-tête", async () => {
    const { table, utilisateur } = rendreLaTable(deuxColonnes);
    cellule(1, 2).focus();
    await utilisateur.keyboard("{Enter}");
    const menu = await screen.findByRole("menu", { name: "Actions de la colonne Nom" });
    expect(focus()).toBe(within(menu).getAllByRole("menuitem")[0]);
    await utilisateur.keyboard("{Escape}");
    expect(focus()).toBe(cellule(1, 2));
    // « Déplacer à gauche », indisponible pour la première colonne, est sautée par les flèches.
    await utilisateur.keyboard("{Enter}{ArrowDown}{Enter}");
    expect(table.lire().colonnes.map(({ nom }) => nom)).toEqual(["Prix", "Nom"]);
  });
});

describe("supprimer une colonne (F-018-AC21)", () => {
  it("F-018-AC21 la confirmation est une alerte qui cite la colonne et dit l'irréversible, focus sur Annuler ; Annuler ne modifie rien et rend le focus à l'origine", async () => {
    const { utilisateur, emises } = rendreLaTable(deuxColonnes);
    cellule(1, 2).focus();
    const menu = await ouvrirLeMenuDeColonne(utilisateur, "Nom");
    await utilisateur.click(
      within(menu).getByRole("menuitem", { name: "Supprimer la colonne Nom" }),
    );

    const alerte = await screen.findByRole("alertdialog", { name: "Supprimer la colonne Nom ?" });
    expect(alerte.textContent).toMatch(/valeurs ne seront plus accessibles/);
    expect(alerte.textContent).toMatch(/ne peut pas être annulée/);
    expect(focus()).toBe(within(alerte).getByRole("button", { name: "Annuler" }));
    await utilisateur.click(within(alerte).getByRole("button", { name: "Annuler" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(emises).toEqual([]);
    expect(focus()?.getAttribute("role")).toBe("columnheader");
  });

  it("F-018-AC21 confirmée, la colonne est supprimée par une seule opération et le focus va à l'en-tête voisin, puis à l'invitation", async () => {
    const { table, utilisateur, emises } = rendreLaTable(deuxColonnes);
    for (const [nom, attendu] of [
      ["Nom", ["Prix"]],
      ["Prix", []],
    ] as const) {
      const menu = await ouvrirLeMenuDeColonne(utilisateur, nom);
      await utilisateur.click(
        within(menu).getByRole("menuitem", { name: `Supprimer la colonne ${nom}` }),
      );
      await utilisateur.click(screen.getByRole("button", { name: "Supprimer la colonne" }));
      expect(table.lire().colonnes.map((colonne) => colonne.nom)).toEqual(attendu);
    }
    expect(emises).toHaveLength(2);
    expect(focus()).toBe(screen.getByRole("button", { name: "Ajouter une colonne" }));
  });
});

describe("options d'une colonne « Sélection » (F-018-AC22)", () => {
  function avecSelection(table: DocumentTable): void {
    const etat = table.creerColonne("État", "selection");
    table.ajouterOption(etat, "En cours");
    table.ajouterOption(etat, "Terminé");
  }

  async function ouvrirLesOptions(utilisateur: ReturnType<typeof rendreLaTable>["utilisateur"]) {
    const menu = await ouvrirLeMenuDeColonne(utilisateur, "État");
    await utilisateur.click(
      within(menu).getByRole("menuitem", { name: "Gérer les options de la colonne État" }),
    );
    return screen.findByRole("dialog", { name: "Options de la colonne État" });
  }

  it("F-018-AC22 ajouter, renommer, monter, descendre : une opération chacune", async () => {
    const { table, utilisateur, emises } = rendreLaTable(avecSelection);
    const panneau = await ouvrirLesOptions(utilisateur);

    await utilisateur.type(
      within(panneau).getByRole("textbox", { name: "Nouvelle option" }),
      "Bloqué",
    );
    await utilisateur.click(within(panneau).getByRole("button", { name: "Ajouter l'option" }));
    const libelle = within(panneau).getByRole("textbox", { name: "Libellé de l'option Terminé" });
    await utilisateur.clear(libelle);
    await utilisateur.type(libelle, "Fini{Enter}");
    await utilisateur.click(
      within(panneau).getByRole("button", { name: "Monter l'option Bloqué" }),
    );
    await utilisateur.click(
      within(panneau).getByRole("button", { name: "Descendre l'option En cours" }),
    );

    expect(table.lire().colonnes[0]?.options.map(({ libelle: texte }) => texte)).toEqual([
      "Bloqué",
      "En cours",
      "Fini",
    ]);
    expect(emises).toHaveLength(4);
    for (const nom of ["Monter l'option Bloqué", "Descendre l'option Fini"]) {
      expect(within(panneau).getByRole("button", { name: nom }).hasAttribute("disabled")).toBe(
        true,
      );
    }
  });

  it("F-018-AC22 le retrait est confirmé : les cellules qui portent l'option deviendront vides ; Annuler ne retire rien", async () => {
    const { table, utilisateur } = rendreLaTable(avecSelection);
    const etat = table.lire().colonnes[0];
    table.creerLigne(new Map([[etat?.id ?? "", etat?.options[0]?.id ?? ""]]));
    let panneau = await ouvrirLesOptions(utilisateur);
    await utilisateur.click(
      within(panneau).getByRole("button", { name: "Retirer l'option En cours" }),
    );
    const alerte = await screen.findByRole("alertdialog", { name: "Retirer l'option En cours ?" });
    expect(alerte.textContent).toMatch(/deviendront vides/);
    await utilisateur.click(within(alerte).getByRole("button", { name: "Annuler" }));
    panneau = await screen.findByRole("dialog", { name: "Options de la colonne État" });
    await utilisateur.click(
      within(panneau).getByRole("button", { name: "Retirer l'option En cours" }),
    );
    await utilisateur.click(screen.getByRole("button", { name: "Retirer l'option" }));

    expect(table.lire().colonnes[0]?.options.map(({ libelle }) => libelle)).toEqual(["Terminé"]);
    expect(table.lire().lignes[0]?.cellules).toEqual([null]);
    expect(textesDesLignes()).toEqual([[""]]);
  });

  it("F-018-AC22 un libellé vide s'affiche « Sans libellé » ; au-delà de 100 caractères, il est refusé et le message cite la limite", async () => {
    const { table, utilisateur } = rendreLaTable(avecSelection);
    const panneau = await ouvrirLesOptions(utilisateur);
    const champ = within(panneau).getByRole("textbox", { name: "Nouvelle option" });
    await utilisateur.click(champ);
    await utilisateur.paste("x".repeat(101));
    await utilisateur.click(within(panneau).getByRole("button", { name: "Ajouter l'option" }));
    expect(within(panneau).getByRole("alert").textContent).toContain("100");
    expect(table.lire().colonnes[0]?.options).toHaveLength(2);

    await utilisateur.clear(champ);
    await utilisateur.click(within(panneau).getByRole("button", { name: "Ajouter l'option" }));
    expect(
      within(panneau).getByRole("textbox", { name: "Libellé de l'option Sans libellé" }),
    ).toBeDefined();
  });
});
