// Focus des barres « Filtres » et « Tris » après retrait, déplacement et changement de colonne
// (F-019-AC27), et état de la grille quand les filtres excluent toutes les lignes (F-019-AC6).
import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import {
  ajouterUnFiltre,
  ajouterUnTri,
  annonce,
  barre,
  choisir,
  filtrer,
  noms,
  remplirSixLignes,
} from "./aides-barres.tsx";
import { rendreLaTable } from "./aides-grille.tsx";

afterEach(() => localStorage.clear());

function bouton(zone: "Filtres" | "Tris", nom: string, rang = 0): HTMLElement {
  return within(barre(zone)).getAllByRole("button", { name: nom })[rang] as HTMLElement;
}

function ordreDesTris(): string[] {
  return within(barre("Tris"))
    .getAllByRole("combobox")
    .filter((un) => (un.getAttribute("aria-label") ?? "").startsWith("Colonne du tri"))
    .map((un) => (un.getAttribute("aria-label") ?? "").replace("Colonne du tri sur ", ""));
}

async function troisTris(): Promise<UserEvent> {
  const { utilisateur } = rendreLaTable(remplirSixLignes);
  for (let i = 0; i < 3; i += 1) {
    await ajouterUnTri(utilisateur);
  }
  expect(ordreDesTris()).toEqual(["Nom", "Prix", "État"]);
  return utilisateur;
}

describe("focus de la barre « Tris » (F-019-AC27)", () => {
  it("F-019-AC27 retirer un tri porte le focus sur le tri qui prend sa place, sinon sur le précédent, sinon sur « Ajouter un tri »", async () => {
    const utilisateur = await troisTris();
    await utilisateur.click(bouton("Tris", "Retirer le tri sur Prix"));
    expect(ordreDesTris()).toEqual(["Nom", "État"]);
    expect(document.activeElement).toBe(bouton("Tris", "Retirer le tri sur État"));

    await utilisateur.click(bouton("Tris", "Retirer le tri sur État"));
    expect(document.activeElement).toBe(bouton("Tris", "Retirer le tri sur Nom"));

    await utilisateur.click(bouton("Tris", "Retirer le tri sur Nom"));
    expect(document.activeElement).toBe(bouton("Tris", "Ajouter un tri"));
  });

  it("F-019-AC27 monter un tri garde le focus sur lui ; à la première place, « Monter » étant inactif, le focus va à « Descendre »", async () => {
    const utilisateur = await troisTris();
    await utilisateur.click(bouton("Tris", "Monter le tri sur État"));
    expect(ordreDesTris()).toEqual(["Nom", "État", "Prix"]);
    expect(document.activeElement).toBe(bouton("Tris", "Monter le tri sur État"));

    await utilisateur.click(bouton("Tris", "Monter le tri sur État"));
    expect(ordreDesTris()).toEqual(["État", "Nom", "Prix"]);
    expect(bouton("Tris", "Monter le tri sur État")).toHaveProperty("disabled", true);
    expect(document.activeElement).toBe(bouton("Tris", "Descendre le tri sur État"));
  });

  it("F-019-AC27 descendre un tri garde le focus sur lui ; à la dernière place, « Descendre » étant inactif, le focus va à « Monter »", async () => {
    const utilisateur = await troisTris();
    await utilisateur.click(bouton("Tris", "Descendre le tri sur Nom"));
    expect(ordreDesTris()).toEqual(["Prix", "Nom", "État"]);
    expect(document.activeElement).toBe(bouton("Tris", "Descendre le tri sur Nom"));

    await utilisateur.click(bouton("Tris", "Descendre le tri sur Nom"));
    expect(ordreDesTris()).toEqual(["Prix", "État", "Nom"]);
    expect(document.activeElement).toBe(bouton("Tris", "Monter le tri sur Nom"));
  });

  it("F-019-AC27 changer la colonne d'un tri ne remonte pas sa ligne : la liste de choix garde le focus", async () => {
    const utilisateur = await troisTris();
    const liste = screen.getByRole("combobox", { name: "Colonne du tri sur Prix" });
    liste.focus();
    await choisir(utilisateur, "Colonne du tri sur Prix", "Fait");
    expect(ordreDesTris()).toEqual(["Nom", "Fait", "État"]);
    expect(screen.getByRole("combobox", { name: "Colonne du tri sur Fait" })).toBe(liste);
    expect(document.activeElement).toBe(liste);
  });
});

describe("focus de la barre « Filtres » (F-019-AC27)", () => {
  it("F-019-AC27 retirer un filtre porte le focus sur celui qui prend sa place, sinon sur le précédent, sinon sur « Ajouter un filtre »", async () => {
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    await ajouterUnFiltre(utilisateur);
    await ajouterUnFiltre(utilisateur);
    await ajouterUnFiltre(utilisateur);
    const retirer = "Retirer le filtre sur Nom";

    await utilisateur.click(bouton("Filtres", retirer, 1));
    expect(within(barre("Filtres")).getAllByRole("listitem")).toHaveLength(2);
    expect(document.activeElement).toBe(bouton("Filtres", retirer, 1));

    await utilisateur.click(bouton("Filtres", retirer, 1));
    expect(document.activeElement).toBe(bouton("Filtres", retirer, 0));

    await utilisateur.click(bouton("Filtres", retirer, 0));
    expect(document.activeElement).toBe(bouton("Filtres", "Ajouter un filtre"));
  });

  it("F-019-AC27 « Tout effacer » porte le focus sur « Ajouter un filtre »", async () => {
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    await ajouterUnFiltre(utilisateur);
    await ajouterUnFiltre(utilisateur);
    await utilisateur.click(bouton("Filtres", "Tout effacer"));
    expect(within(barre("Filtres")).queryAllByRole("listitem")).toHaveLength(0);
    expect(document.activeElement).toBe(bouton("Filtres", "Ajouter un filtre"));
  });
});

describe("filtres qui excluent toutes les lignes (F-019-AC6)", () => {
  it("F-019-AC6 la grille dit « Aucune ligne ne correspond aux filtres. », la zone d'annonce aussi ; « Tout effacer » rend les lignes", async () => {
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    expect(screen.queryByText("Aucune ligne ne correspond aux filtres.")).toBeNull();

    await filtrer(utilisateur, { depart: "Nom", cible: "Nom" }, "contient", "zzz");
    expect(noms()).toEqual([]);
    expect(screen.getByText("Aucune ligne ne correspond aux filtres.")).toBeTruthy();
    await annonce("0 ligne sur 6. Aucune ligne ne correspond aux filtres.");

    await utilisateur.click(bouton("Filtres", "Tout effacer"));
    expect(screen.queryByText("Aucune ligne ne correspond aux filtres.")).toBeNull();
    expect(noms()).toHaveLength(6);
  });

  it("F-019-AC6 une table sans ligne ne dit pas que les filtres l'ont vidée", async () => {
    const { utilisateur } = rendreLaTable((une) => {
      une.creerColonne("Nom", "texte");
    });
    await ajouterUnFiltre(utilisateur);
    expect(screen.queryByText("Aucune ligne ne correspond aux filtres.")).toBeNull();
  });
});
