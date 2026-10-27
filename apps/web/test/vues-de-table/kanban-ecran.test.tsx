// Vue kanban rendue par l'écran de table (F-020-AC1, AC2, AC5, AC6, AC7, AC8) : les piles, les
// cartes, l'invitation sans colonne Sélection, la création d'une carte, la saisie du titre, la
// suppression, les piles longues. La table est tenue par le test ; rien n'est simulé de la vue.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DocumentTable, LigneLue, TableLue } from "@notionlike/document";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { VueKanban } from "../../src/vues-de-table/kanban/VueKanban.tsx";
import { rendreLaTable } from "./aides-grille.tsx";
import {
  annonceDeLaVue,
  carte,
  cartes,
  nomsDesPiles,
  pile,
  rendreLeKanban,
  titresDeLaPile,
} from "./aides-ecran-kanban.tsx";

const REPARTITION = [
  ["Écrire", 0],
  ["Relire", 0],
  ["Sans statut", -1],
  ["Livrer", 2],
] as const;

describe("piles et cartes (F-020-AC1, AC2)", () => {
  it("F-020-AC1 « Kanban » choisi dans le sélecteur : la pile « Sans valeur », puis une pile par option dans l'ordre, chacune avec son libellé et le nombre de ses cartes ; une pile vide reste affichée", async () => {
    const { utilisateur } = rendreLeKanban(REPARTITION, { vue: "tableau" });
    expect(screen.queryByRole("grid")).not.toBeNull();
    await utilisateur.click(screen.getByRole("button", { name: "Kanban" }));

    expect(screen.queryByRole("grid")).toBeNull();
    expect(nomsDesPiles()).toEqual([
      "Sans valeur, 1 carte",
      "À faire, 2 cartes",
      "En cours, 0 carte",
      "Fait, 1 carte",
    ]);
    expect(screen.getByRole("button", { name: "Kanban" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("F-020-AC1 le libellé d'une option vide se lit « Sans libellé »", () => {
    rendreLeKanban([], { libelles: ["", "Fait"] });
    expect(nomsDesPiles()).toEqual([
      "Sans valeur, 0 carte",
      "Sans libellé, 0 carte",
      "Fait, 0 carte",
    ]);
  });

  it("F-020-AC2 chaque ligne est une carte, une fois, dans la pile de son option, dans l'ordre des lignes ; une ligne sans titre se lit « Sans titre »", () => {
    rendreLeKanban([...REPARTITION, ["", 1]]);
    expect(titresDeLaPile("Sans valeur, 1 carte")).toEqual(["Sans statut"]);
    expect(titresDeLaPile("À faire, 2 cartes")).toEqual(["Écrire", "Relire"]);
    expect(titresDeLaPile("En cours, 1 carte")).toEqual(["Sans titre"]);
    expect(titresDeLaPile("Fait, 1 carte")).toEqual(["Livrer"]);
    expect(cartes()).toHaveLength(5);
  });

  it("F-020-AC2 une cellule qui désignait une option retirée place la carte dans « Sans valeur », reçue en cours d'affichage", () => {
    const { contenu, table } = rendreLeKanban(REPARTITION);
    expect(titresDeLaPile("Fait, 1 carte")).toEqual(["Livrer"]);
    act(() => table.retirerOption(contenu.statut, contenu.options[2] ?? ""));
    expect(nomsDesPiles()).toEqual([
      "Sans valeur, 2 cartes",
      "À faire, 2 cartes",
      "En cours, 0 carte",
    ]);
    expect(titresDeLaPile("Sans valeur, 2 cartes")).toEqual(["Sans statut", "Livrer"]);
  });
});

describe("table sans colonne Sélection (F-020-AC5)", () => {
  function sansSelection() {
    return rendreLaTable((table) => {
      table.creerLigne(new Map([[table.creerColonne("Titre", "texte"), "A"]]));
    });
  }

  it("F-020-AC5 à la place des piles : le texte d'invitation et la commande « Ajouter une colonne Sélection », sans rien créer d'elle-même", () => {
    localStorage.setItem(
      "notionlike:vue:espace-a:tableau",
      JSON.stringify({ version: 1, sections: { vue: { active: "kanban" } } }),
    );
    const { table } = rendreLeKanban([], {
      remplir: ({ table: ouverte }) =>
        ouverte.supprimerColonne(ouverte.lire().colonnes[1]?.id ?? ""),
    });
    expect(
      screen.getByText("Le kanban regroupe les lignes par une colonne Sélection."),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Ajouter une colonne Sélection" })).toBeDefined();
    expect(nomsDesPiles()).toEqual([]);
    expect(table.lire().colonnes.map(({ type }) => type)).toEqual(["texte"]);
    expect(sansSelection).toBeDefined();
  });

  it("F-020-AC5 la commande ouvre l'ajout de colonne avec le type « Sélection » choisi ; créée, les piles paraissent", async () => {
    const { table, utilisateur } = rendreLeKanban([["A", -1]], {
      remplir: ({ table: ouverte }) =>
        ouverte.supprimerColonne(ouverte.lire().colonnes[1]?.id ?? ""),
    });
    await utilisateur.click(screen.getByRole("button", { name: "Ajouter une colonne Sélection" }));
    const boite = screen.getByRole("dialog");
    expect((within(boite).getByRole("combobox") as HTMLSelectElement).value).toBe("selection");
    expect(table.lire().colonnes).toHaveLength(1);

    await utilisateur.type(within(boite).getByRole("textbox"), "Étape");
    await utilisateur.click(within(boite).getByRole("button", { name: "Créer la colonne" }));
    expect(table.lire().colonnes.map(({ type }) => type)).toEqual(["texte", "selection"]);
    expect(nomsDesPiles()).toEqual(["Sans valeur, 1 carte"]);
  });
});

describe("nouvelle carte (F-020-AC6)", () => {
  it("F-020-AC6 « Nouvelle carte » dans une pile : une ligne en dernière position, la cellule de regroupement à l'option de la pile, par une seule mise à jour ; la saisie du titre s'ouvre", async () => {
    const { table, emises, contenu, utilisateur } = rendreLeKanban(REPARTITION);
    await utilisateur.click(
      screen.getByRole("button", { name: "Nouvelle carte dans la pile En cours" }),
    );
    expect(emises).toHaveLength(1);
    const lue = table.lire();
    const derniere = lue.lignes.at(-1);
    expect(lue.lignes).toHaveLength(5);
    expect(derniere?.cellules[1]).toBe(contenu.options[1]);
    const champ = screen.getByRole("textbox", { name: "Titre de la carte Sans titre" });
    expect(document.activeElement).toBe(champ);

    await utilisateur.type(champ, "Tester{Enter}");
    expect(table.lire().lignes.at(-1)?.cellules[0]).toBe("Tester");
    expect(titresDeLaPile("En cours, 1 carte")).toEqual(["Tester"]);
    expect(document.activeElement).toBe(carte("Tester"));
  });

  it("F-020-AC6 dans « Sans valeur » : aucune valeur de regroupement", async () => {
    const { table, utilisateur } = rendreLeKanban(REPARTITION);
    await utilisateur.click(
      screen.getByRole("button", { name: "Nouvelle carte dans la pile Sans valeur" }),
    );
    expect(table.lire().lignes.at(-1)?.cellules[1] ?? null).toBeNull();
    await utilisateur.keyboard("{Escape}");
    expect(titresDeLaPile("Sans valeur, 2 cartes")).toEqual(["Sans statut", "Sans titre"]);
  });

  it("F-020-AC6 sans colonne de titre : la ligne est créée, aucune saisie ne s'ouvre, la carte a le focus", async () => {
    const { table, utilisateur } = rendreLeKanban([], {
      remplir: ({ table: ouverte, titre }) => ouverte.supprimerColonne(titre),
    });
    await utilisateur.click(
      screen.getByRole("button", { name: "Nouvelle carte dans la pile À faire" }),
    );
    expect(table.lire().lignes).toHaveLength(1);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.activeElement).toBe(cartes()[0]);
  });
});

describe("titre et suppression d'une carte (F-020-AC7)", () => {
  it("F-020-AC7 Entrée ouvre la saisie du titre ; Entrée la valide, Échap l'abandonne sans rien écrire, un titre inchangé n'écrit rien ; F2 fait de même", async () => {
    const { table, emises, utilisateur } = rendreLeKanban(REPARTITION);
    act(() => carte("Écrire").focus());
    await utilisateur.keyboard("{Enter}");
    const champ = screen.getByRole("textbox", { name: "Titre de la carte Écrire" });
    expect((champ as HTMLInputElement).value).toBe("Écrire");

    await utilisateur.keyboard("{Enter}");
    expect(emises).toHaveLength(0);
    expect(document.activeElement).toBe(carte("Écrire"));

    await utilisateur.keyboard("{F2}{Backspace}x{Escape}");
    expect(emises).toHaveLength(0);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.activeElement).toBe(carte("Écrire"));

    await utilisateur.keyboard("{F2} bis{Enter}");
    expect(table.lire().lignes[0]?.cellules[0]).toBe("Écrire bis");
    expect(emises).toHaveLength(1);
  });

  it("F-020-AC7 un titre refusé garde la saisie ouverte avec son message en français, comme une cellule texte", async () => {
    const { table, emises, utilisateur } = rendreLeKanban(REPARTITION);
    act(() => carte("Écrire").focus());
    await utilisateur.keyboard("{F2}");
    const champ = screen.getByRole("textbox", { name: "Titre de la carte Écrire" });
    fireEvent.change(champ, { target: { value: "x".repeat(10_001) } });
    await utilisateur.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: "Titre de la carte Écrire" })).toBeDefined();
    expect(screen.getByRole("alert").textContent).not.toBe("");
    expect(champ.getAttribute("aria-invalid")).toBe("true");
    expect(emises).toHaveLength(0);
    expect(table.lire().lignes[0]?.cellules[0]).toBe("Écrire");
  });

  it("F-020-AC7 sans colonne de titre : « Modifier le titre » est indisponible avec sa raison, Entrée la dit sans rien ouvrir", async () => {
    const { emises, utilisateur } = rendreLeKanban([["", 0]], {
      remplir: ({ table, titre }) => table.supprimerColonne(titre),
    });
    act(() => cartes()[0]?.focus());
    await utilisateur.keyboard("{Shift>}{F10}{/Shift}");
    const entree = screen.getByRole("menuitem", {
      name: "Modifier le titre pour la carte Sans titre",
    });
    expect((entree as HTMLButtonElement).disabled).toBe(true);
    expect(entree.textContent).toContain("Aucune colonne de titre.");
    await utilisateur.keyboard("{Escape}{Enter}");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("Aucune colonne de titre.");
    expect(emises).toHaveLength(0);
  });

  it("F-020-AC7 « Supprimer la ligne » demande la confirmation de F-018-AC25 : « Annuler » ne supprime rien et rend le focus à la carte, la confirmation supprime la ligne et porte le focus sur la carte voisine", async () => {
    const { table, utilisateur } = rendreLeKanban(REPARTITION);
    act(() => carte("Écrire").focus());
    await utilisateur.keyboard("{Shift>}{F10}{/Shift}");
    await utilisateur.click(
      screen.getByRole("menuitem", { name: "Supprimer la ligne pour la carte Écrire" }),
    );
    const boite = screen.getByRole("alertdialog");
    expect(document.activeElement).toBe(within(boite).getByRole("button", { name: "Annuler" }));
    await utilisateur.click(within(boite).getByRole("button", { name: "Annuler" }));
    expect(table.lire().lignes).toHaveLength(4);
    expect(document.activeElement).toBe(carte("Écrire"));

    await utilisateur.keyboard("{Shift>}{F10}{/Shift}");
    await utilisateur.click(
      screen.getByRole("menuitem", { name: "Supprimer la ligne pour la carte Écrire" }),
    );
    await utilisateur.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Supprimer la ligne" }),
    );
    expect(table.lire().lignes.map(({ cellules }) => cellules[0])).toEqual([
      "Relire",
      "Sans statut",
      "Livrer",
    ]);
    expect(document.activeElement).toBe(carte("Relire"));
  });
});

describe("piles longues (F-020-AC8)", () => {
  it("F-020-AC8 une table de 5 000 lignes en quatre piles : au plus 100 cartes présentes par pile, le nombre total dans l'en-tête, 100 de plus à la demande", async () => {
    // La vue ne lit la table que par ses props (comme fenetre.test.tsx) : créer 5 000 lignes par la
    // façade prendrait près d'une minute et ne prouverait rien de la vue.
    const lue: TableLue = {
      colonnes: [
        { id: "titre", nom: "Titre", type: "texte", options: [] },
        {
          id: "statut",
          nom: "Statut",
          type: "selection",
          options: ["À faire", "En cours", "Fait"].map((libelle) => ({
            id: `o-${libelle}`,
            libelle,
          })),
        },
      ],
      lignes: Array.from({ length: 5000 }, (_, rang): LigneLue => {
        const option = [null, "o-À faire", "o-En cours", "o-Fait"][rang % 4] ?? null;
        return { id: `l${String(rang)}`, cellules: [`Ligne ${String(rang)}`, option] };
      }),
    };
    const utilisateur = userEvent.setup();
    render(
      <VueKanban
        table={{} as DocumentTable}
        lue={lue}
        lignes={lue.lignes}
        titre="Grande"
        lectureSeule={undefined}
        designation={{ idEspace: "e", idTable: "t" }}
        selecteur={null}
      />,
    );
    expect(nomsDesPiles()).toEqual([
      "Sans valeur, 1250 cartes",
      "À faire, 1250 cartes",
      "En cours, 1250 cartes",
      "Fait, 1250 cartes",
    ]);
    for (const nom of nomsDesPiles()) {
      expect(within(pile(nom)).getAllByRole("listitem")).toHaveLength(100);
      expect(within(pile(nom)).getAllByText("1250")).toHaveLength(1);
    }
    expect(cartes()).toHaveLength(400);

    // F-020-AC21 : chaque commande cite sa pile, pour que les quatre ne portent pas le même nom.
    const noms = document.querySelectorAll("button[aria-label^='Afficher 100 cartes de plus']");
    expect(new Set([...noms].map((un) => un.getAttribute("aria-label"))).size).toBe(4);
    const plus = within(pile("À faire, 1250 cartes")).getByRole("button", {
      name: "Afficher 100 cartes de plus dans la pile À faire",
    });
    await utilisateur.click(plus);
    expect(within(pile("À faire, 1250 cartes")).getAllByRole("listitem")).toHaveLength(200);
    expect(within(pile("Fait, 1250 cartes")).getAllByRole("listitem")).toHaveLength(100);
  });

  it("F-020-AC8 une pile qui tient dans la page n'offre pas la commande", () => {
    rendreLeKanban(REPARTITION);
    expect(screen.queryByRole("button", { name: /Afficher 100 cartes de plus/ })).toBeNull();
    expect(annonceDeLaVue()).toBe("");
    expect(Y.encodeStateAsUpdate).toBeDefined();
  });
});

describe("lignes affichées données à la vue (F-020-AC16, AC27)", () => {
  // Préparation seulement : prouve que la vue garde l'ordre des lignes reçues. Le cas « Tri actif »
  // (AC16 complet) viendra à la fusion avec F-019, quand un tri existera.
  it("F-020-AC16 (préparation) F-020-AC27 F-019 n'étant pas livrée, la vue présente exactement les lignes qu'elle reçoit, dans leur ordre : un sous-ensemble réordonné (filtre, tri) donne les cartes et leur place", () => {
    const lue: TableLue = {
      colonnes: [
        { id: "titre", nom: "Titre", type: "texte", options: [] },
        {
          id: "statut",
          nom: "Statut",
          type: "selection",
          options: [{ id: "o1", libelle: "À faire" }],
        },
      ],
      lignes: ["a", "b", "c", "d"].map((titre): LigneLue => ({
        id: titre,
        cellules: [titre, "o1"],
      })),
    };
    const affichees = [lue.lignes[3], lue.lignes[1], lue.lignes[0]].filter(
      (ligne): ligne is LigneLue => ligne !== undefined,
    );
    render(
      <VueKanban
        table={{} as DocumentTable}
        lue={lue}
        lignes={affichees}
        titre="Filtrée"
        lectureSeule={undefined}
        designation={{ idEspace: "e", idTable: "t" }}
        selecteur={null}
      />,
    );
    expect(nomsDesPiles()).toEqual(["Sans valeur, 0 carte", "À faire, 3 cartes"]);
    expect(titresDeLaPile("À faire, 3 cartes")).toEqual(["d", "b", "a"]);
  });
});
