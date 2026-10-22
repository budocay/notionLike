// Cellules de la grille (F-018-AC26 à AC32, AC38) : affichage par type, saisie à la validation
// seulement, refus qui gardent le mode édition, case cochée sans mode édition, liste de choix.
import type { DocumentTable } from "@notionlike/document";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { cellule, focus, grille, rendreLaTable, textesDesLignes } from "./aides-grille.tsx";

const SCRIPT = '<img src=x onerror="alert(1)"><script>alert(2)</script>';

// Une colonne de chaque type, deux options, une ligne vide.
function uneDeChaque(table: DocumentTable): void {
  table.creerColonne("Nom", "texte");
  table.creerColonne("Prix", "nombre");
  table.creerColonne("Fait", "case");
  table.creerColonne("Échéance", "date");
  const etat = table.creerColonne("État", "selection");
  table.ajouterOption(etat, "En cours");
  table.ajouterOption(etat, "Terminé");
  table.creerLigne();
}

/** Les éléments de la grille dans l'ordre de tabulation : un seul attendu (AC33). */
function arretsDeTabulation(): HTMLElement[] {
  return [...grille().querySelectorAll<HTMLElement>("*")].filter(({ tabIndex }) => tabIndex === 0);
}

function valeurs(table: DocumentTable): readonly unknown[] {
  return table.lire().lignes[0]?.cellules ?? [];
}

async function saisir(
  utilisateur: ReturnType<typeof rendreLaTable>["utilisateur"],
  colonne: number,
  frappe: string,
): Promise<void> {
  cellule(2, colonne).focus();
  await utilisateur.keyboard(frappe);
}

describe("affichage (F-018-AC26)", () => {
  it("F-018-AC26 chaque type s'affiche par ses règles fixes ; un texte coupé reste entier pour les technologies d'assistance", () => {
    const long = "un texte bien plus long que la largeur de sa colonne, qui sera coupé";
    rendreLaTable((table) => {
      uneDeChaque(table);
      const { colonnes } = table.lire();
      const valeursDeLaLigne: (string | number | boolean)[] = [
        long,
        1234.5,
        true,
        "2026-10-21",
        colonnes[4]?.options[1]?.id ?? "",
      ];
      table.creerLigne(new Map(colonnes.map(({ id }, rang) => [id, valeursDeLaLigne[rang] ?? ""])));
    });
    expect(textesDesLignes()).toEqual([
      ["", "", "☐", "", ""],
      [long, "1234,5", "☑", "21/10/2026", "Terminé"],
    ]);
    expect(cellule(3, 2).textContent).toBe(long);
  });
});

describe("saisie d'un texte (F-018-AC27, AC32, AC33)", () => {
  it("F-018-AC27 F-018-AC33 la frappe d'un caractère entre en mode édition et remplace le contenu ; Entrée écrit tel que saisi, sans rognage, par une seule opération, et descend", async () => {
    const { table, utilisateur, emises } = rendreLaTable(uneDeChaque);
    await saisir(utilisateur, 2, " Bon jour {Enter}");
    expect(valeurs(table)[0]).toBe(" Bon jour ");
    expect(emises).toHaveLength(1);

    await saisir(utilisateur, 2, "{Enter}");
    const champ = screen.getByRole<HTMLInputElement>("textbox", { name: "Nom, ligne 1" });
    expect(champ.value).toBe(" Bon jour ");
    await utilisateur.clear(champ);
    await utilisateur.keyboard("{Enter}");
    expect(valeurs(table)[0]).toBeNull();
  });

  it("F-018-AC27 au-delà de 2 000 caractères, la validation est refusée : message qui cite la limite, mode édition et texte gardés, aucune mise à jour", async () => {
    const { table, utilisateur, emises } = rendreLaTable(uneDeChaque);
    await saisir(utilisateur, 2, "{F2}");
    const champ = screen.getByRole<HTMLInputElement>("textbox", { name: "Nom, ligne 1" });
    await utilisateur.paste("t".repeat(2001));
    await utilisateur.keyboard("{Enter}");

    expect(screen.getByRole("alert").textContent).toContain("2000");
    expect(champ.isConnected).toBe(true);
    expect(champ.value).toHaveLength(2001);
    expect(champ.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
    expect(valeurs(table)[0]).toBeNull();
    expect(emises).toEqual([]);
  });

  it("F-018-AC32 H16 rien n'est écrit à la frappe ; Échap quitte sans rien écrire et garde la cellule courante ; une valeur inchangée n'émet rien", async () => {
    const { table, utilisateur, emises } = rendreLaTable(uneDeChaque);
    await saisir(utilisateur, 2, "abc");
    expect(emises).toEqual([]);
    await utilisateur.keyboard("{Escape}");
    expect(valeurs(table)[0]).toBeNull();
    expect(focus()).toBe(cellule(2, 2));

    await saisir(utilisateur, 2, "x{Tab}");
    expect(emises).toHaveLength(1);
    expect(focus()).toBe(cellule(2, 3));
    await saisir(utilisateur, 2, "{Enter}{Enter}");
    expect(emises).toHaveLength(1);
  });

  it("F-018-AC33 F-018-AC32 pendant une composition (IME), Entrée et Tab ne valident pas : le champ reste ouvert, rien n'est écrit", async () => {
    const { table, utilisateur, emises } = rendreLaTable(uneDeChaque);
    await saisir(utilisateur, 2, "ni");
    const champ = screen.getByRole<HTMLInputElement>("textbox", { name: "Nom, ligne 1" });
    fireEvent.keyDown(champ, { key: "Enter", isComposing: true });
    fireEvent.keyDown(champ, { key: "Tab", isComposing: true });
    expect(champ.isConnected).toBe(true);
    expect(focus()).toBe(champ);
    expect(emises).toEqual([]);
    await utilisateur.keyboard("{Enter}");
    expect(valeurs(table)[0]).toBe("ni");
  });

  it("F-018-AC32 la sortie du champ valide, sans reprendre le focus", async () => {
    const { table, utilisateur } = rendreLaTable(uneDeChaque);
    await saisir(utilisateur, 2, "sortie");
    await utilisateur.click(screen.getByRole("button", { name: "Nouvelle ligne" }));
    expect(valeurs(table)[0]).toBe("sortie");
  });
});

describe("saisie d'un nombre (F-018-AC28)", () => {
  it.each([
    ["3,5", 3.5],
    ["  -12  ", -12],
    ["0.25", 0.25],
  ])("F-018-AC28 « %s » écrit %d", async (saisie, attendu) => {
    const { table, utilisateur } = rendreLaTable(uneDeChaque);
    await saisir(utilisateur, 3, "{F2}");
    await utilisateur.keyboard(`${saisie}{Enter}`);
    expect(valeurs(table)[1]).toBe(attendu);
    expect(textesDesLignes()[0]?.[1]).toBe(String(attendu).replace(".", ","));
  });

  it("F-018-AC28 une autre forme est refusée : « Saisissez un nombre, par exemple 12 ou 3,5. », mode édition et texte gardés, aucune mise à jour", async () => {
    const { table, utilisateur, emises } = rendreLaTable(uneDeChaque);
    await saisir(utilisateur, 3, "1e3{Enter}");
    const champ = screen.getByRole<HTMLInputElement>("textbox", { name: "Prix, ligne 1" });
    expect(screen.getByRole("alert").textContent).toBe(
      "Saisissez un nombre, par exemple 12 ou 3,5.",
    );
    expect(champ.value).toBe("1e3");
    expect(valeurs(table)[1]).toBeNull();
    expect(emises).toEqual([]);
  });

  it("F-018-AC28 F-018-AC33 une saisie refusée à la sortie du champ (clic sur une autre cellule) garde le mode édition : le focus revient au champ, texte gardé, la grille reste un seul arrêt de tabulation ; Échap rend la cellule, d'où les flèches repartent", async () => {
    const { table, utilisateur, emises } = rendreLaTable(uneDeChaque);
    await saisir(utilisateur, 3, "1e3");
    const champ = screen.getByRole<HTMLInputElement>("textbox", { name: "Prix, ligne 1" });
    await utilisateur.click(cellule(2, 2));

    expect(screen.getByRole("alert").textContent).toBe(
      "Saisissez un nombre, par exemple 12 ou 3,5.",
    );
    expect(focus()).toBe(champ);
    expect(champ.value).toBe("1e3");
    expect(arretsDeTabulation()).toEqual([cellule(2, 3)]);
    expect(emises).toEqual([]);

    // Le focus revenu dans la grille par la tabulation va lui aussi au champ.
    await utilisateur.click(document.body);
    expect(focus()).toBe(document.body);
    expect(champ.isConnected).toBe(true);
    cellule(2, 3).focus();
    expect(focus()).toBe(champ);

    await utilisateur.keyboard("{Escape}");
    expect(focus()).toBe(cellule(2, 3));
    await utilisateur.keyboard("{ArrowLeft}");
    expect(focus()).toBe(cellule(2, 2));
    expect(arretsDeTabulation()).toEqual([cellule(2, 2)]);
    expect(valeurs(table)[1]).toBeNull();
  });

  it("F-018-AC28 F-018-AC20 la commande « ⋯ » d'une ligne, cliquée pendant une saisie refusée, n'ouvre pas son menu : le focus reste au champ", async () => {
    const { utilisateur } = rendreLaTable(uneDeChaque);
    await saisir(utilisateur, 3, "1e3");
    const champ = screen.getByRole<HTMLInputElement>("textbox", { name: "Prix, ligne 1" });
    await utilisateur.click(screen.getByRole("button", { name: "Actions de la ligne 1" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(focus()).toBe(champ);
    expect(champ.value).toBe("1e3");
  });

  it("F-018-AC28 F-018-AC33 un double clic dans le champ ouvert ne relance pas le mode édition : le texte saisi est gardé", async () => {
    const { utilisateur } = rendreLaTable(uneDeChaque);
    await saisir(utilisateur, 3, "1e3{Enter}");
    const champ = screen.getByRole<HTMLInputElement>("textbox", { name: "Prix, ligne 1" });
    await utilisateur.dblClick(champ);
    expect(champ.isConnected).toBe(true);
    expect(champ.value).toBe("1e3");
  });
});

describe("case à cocher (F-018-AC29)", () => {
  it("F-018-AC29 Espace sur la cellule ou un clic sur la case écrit true puis false, sans mode édition", async () => {
    const { table, utilisateur, emises } = rendreLaTable(uneDeChaque);
    await saisir(utilisateur, 4, " ");
    expect(valeurs(table)[2]).toBe(true);
    expect(screen.queryByRole("textbox")).toBeNull();
    await utilisateur.click(screen.getByRole("checkbox", { name: "Fait, ligne 1" }));
    expect(valeurs(table)[2]).toBe(false);
    expect(emises).toHaveLength(2);
  });

  it("F-018-AC29 F-018-AC33 un clic sur la case rend sa cellule courante : le focus est sur la cellule, les flèches en partent", async () => {
    const { table, utilisateur } = rendreLaTable(uneDeChaque);
    cellule(2, 2).focus();
    await utilisateur.click(screen.getByRole("checkbox", { name: "Fait, ligne 1" }));

    expect(valeurs(table)[2]).toBe(true);
    expect(focus()).toBe(cellule(2, 4));
    expect(cellule(2, 4).tabIndex).toBe(0);
    expect(cellule(2, 2).tabIndex).toBe(-1);
    await utilisateur.keyboard("{ArrowRight}");
    expect(focus()).toBe(cellule(2, 5));
  });
});

describe("saisie d'une date (F-018-AC30)", () => {
  it("F-018-AC30 un champ de date borné écrit la valeur AAAA-MM-JJ telle quelle ; vidé, il vide la cellule", async () => {
    const { table, utilisateur } = rendreLaTable(uneDeChaque);
    await saisir(utilisateur, 5, "{Enter}");
    const champ = screen.getByLabelText<HTMLInputElement>("Échéance, ligne 1");
    expect([champ.type, champ.min, champ.max]).toEqual(["date", "0001-01-01", "9999-12-31"]);
    fireEvent.change(champ, { target: { value: "2026-02-28" } });
    expect(valeurs(table)[3]).toBeNull();
    await utilisateur.keyboard("{Enter}");
    expect(valeurs(table)[3]).toBe("2026-02-28");
    expect(textesDesLignes()[0]?.[3]).toBe("28/02/2026");

    await saisir(utilisateur, 5, "{Enter}");
    fireEvent.change(screen.getByLabelText("Échéance, ligne 1"), { target: { value: "" } });
    await utilisateur.keyboard("{Enter}");
    expect(valeurs(table)[3]).toBeNull();
  });

  it("F-018-AC30 H16 une date que le document refuse (année hors bornes) : « Saisissez une date valide. », aucune mise à jour", async () => {
    const { table, utilisateur, emises } = rendreLaTable(uneDeChaque);
    await saisir(utilisateur, 5, "{Enter}");
    const champ = screen.getByLabelText<HTMLInputElement>("Échéance, ligne 1");
    // jsdom assainit une valeur hors de la forme ; la valeur lue est forcée comme le ferait une année
    // de cinq chiffres frappée dans Chromium.
    Object.defineProperty(champ, "value", { configurable: true, get: () => "20260-01-01" });
    fireEvent.change(champ);
    await utilisateur.keyboard("{Enter}");
    expect(screen.getByRole("alert").textContent).toBe("Saisissez une date valide.");
    expect(valeurs(table)[3]).toBeNull();
    expect(emises).toEqual([]);
  });
});

describe("sélection (F-018-AC31)", () => {
  it("F-018-AC31 la liste présente « Aucune » puis les options dans leur ordre, la courante marquée ; un choix écrit son identifiant, « Aucune » vide la cellule", async () => {
    const { table, utilisateur } = rendreLaTable(uneDeChaque);
    await saisir(utilisateur, 6, "{Enter}");
    let liste = screen.getByRole("listbox", { name: "Choix pour la colonne État" });
    expect(
      within(liste)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Aucune", "En cours", "Terminé"]);
    expect(
      within(liste).getByRole("option", { name: "Aucune" }).getAttribute("aria-selected"),
    ).toBe("true");
    await utilisateur.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    const termine = table.lire().colonnes[4]?.options[1]?.id;
    expect(valeurs(table)[4]).toBe(termine);
    expect(textesDesLignes()[0]?.[4]).toBe("Terminé");

    await saisir(utilisateur, 6, "{Enter}");
    liste = screen.getByRole("listbox", { name: "Choix pour la colonne État" });
    expect(
      within(liste).getByRole("option", { name: "Terminé" }).getAttribute("aria-selected"),
    ).toBe("true");
    await utilisateur.click(within(liste).getByRole("option", { name: "Aucune" }));
    expect(valeurs(table)[4]).toBeNull();
  });

  it("F-018-AC31 une seule option est sélectionnée, l'active, qui suit les flèches ; la valeur courante est marquée à part", async () => {
    const { utilisateur } = rendreLaTable(uneDeChaque);
    await saisir(utilisateur, 6, "{Enter}{ArrowDown}{ArrowDown}{Enter}");
    await saisir(utilisateur, 6, "{Enter}{ArrowUp}");
    const liste = screen.getByRole("listbox", { name: "Choix pour la colonne État" });
    const options = within(liste).getAllByRole("option");
    const marquees = (attribut: string) =>
      options.filter((option) => option.getAttribute(attribut) === "true");
    expect(marquees("aria-selected").map(({ textContent }) => textContent)).toEqual(["En cours"]);
    expect(marquees("aria-selected")[0]?.id).toBe(liste.getAttribute("aria-activedescendant"));
    expect(marquees("aria-current").map(({ textContent }) => textContent)).toEqual(["Terminé"]);
  });

  it("F-018-AC31 une colonne sans option propose « Gérer les options », qui ouvre le panneau", async () => {
    const { utilisateur } = rendreLaTable((table) => {
      table.creerColonne("Étiquette", "selection");
      table.creerLigne();
    });
    await saisir(utilisateur, 2, "{Enter}");
    const liste = screen.getByRole("listbox", { name: "Choix pour la colonne Étiquette" });
    await utilisateur.click(within(liste).getByRole("option", { name: "Gérer les options" }));
    expect(
      await screen.findByRole("dialog", { name: "Options de la colonne Étiquette" }),
    ).toBeDefined();
  });

  it("F-018-AC31 F-018-AC32 Échap ferme la liste sans rien écrire", async () => {
    const { utilisateur, emises } = rendreLaTable(uneDeChaque);
    await saisir(utilisateur, 6, "{Enter}{ArrowDown}{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(emises).toEqual([]);
    expect(focus()).toBe(cellule(2, 6));
  });
});

describe("balisage dans les données (F-018-AC38)", () => {
  it("F-018-AC38 un nom de colonne, un libellé et un texte qui portent du balisage s'affichent comme du texte, dans la grille, les noms accessibles et les confirmations", async () => {
    const { utilisateur } = rendreLaTable((table) => {
      const colonne = table.creerColonne(SCRIPT, "selection");
      const option = table.ajouterOption(colonne, SCRIPT);
      const texte = table.creerColonne("Texte", "texte");
      table.creerLigne(
        new Map([
          [colonne, option],
          [texte, SCRIPT],
        ]),
      );
    });
    expect(document.querySelector("img, script")).toBeNull();
    expect(textesDesLignes()).toEqual([[SCRIPT, SCRIPT]]);
    expect(
      screen.getByRole("columnheader", { name: new RegExp(SCRIPT.slice(0, 8)) }).textContent,
    ).toContain(SCRIPT);
    await utilisateur.click(
      screen.getByRole("button", { name: `Actions de la colonne ${SCRIPT}` }),
    );
    await utilisateur.click(
      screen.getByRole("menuitem", { name: `Supprimer la colonne ${SCRIPT}` }),
    );
    const alerte = await screen.findByRole("alertdialog");
    expect(alerte.textContent).toContain(SCRIPT);
    expect(document.querySelector("img, script")).toBeNull();
  });
});
