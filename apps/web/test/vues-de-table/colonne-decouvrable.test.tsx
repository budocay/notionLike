// Ajout de colonne découvrable (F-038) : diagnostic du bouton « Ajouter une colonne » (AC1) puis
// plusieurs colonnes, « + » d'en-tête, focus, annonce, lecture seule, refus et couture.
import type { DocumentTable } from "@notionlike/document";
import { cleanup, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { lire, lister } from "../aides-disque.ts";
import { cellule, focus, grille, nomsDesEnTetes, rendreLaTable } from "./aides-grille.tsx";

async function creerLaColonne(
  utilisateur: ReturnType<typeof rendreLaTable>["utilisateur"],
  declencheur: HTMLElement,
  nom: string,
): Promise<void> {
  await utilisateur.click(declencheur);
  const boite = await screen.findByRole("dialog", { name: "Nouvelle colonne" });
  if (nom !== "") {
    await utilisateur.type(within(boite).getByLabelText("Nom de la colonne"), nom);
  }
  await utilisateur.click(within(boite).getByRole("button", { name: "Créer la colonne" }));
}

describe("diagnostic : le bouton « Ajouter une colonne » d'une table de une colonne (F-038-AC1)", () => {
  it("F-038-AC1 le scénario de la capture : table sans colonne, colonne « zer » de type Texte par l'invitation, puis un bouton exposé et actif", async () => {
    const { utilisateur } = rendreLaTable();
    await creerLaColonne(
      utilisateur,
      screen.getByRole("button", { name: "Ajouter une colonne" }),
      "zer",
    );
    expect(nomsDesEnTetes()).toEqual(["zer"]);
    const boutons = screen.getAllByRole("button", { name: "Ajouter une colonne" });
    expect(boutons).toHaveLength(1);
    expect((boutons[0] as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Nouvelle ligne" })).toBeDefined();
  });

  it("F-038-AC1 trois colonnes : le bouton est exposé et actif", () => {
    rendreLaTable((table) => {
      table.creerColonne("A", "texte");
      table.creerColonne("B", "texte");
      table.creerColonne("C", "texte");
    });
    const bouton = screen.getByRole<HTMLButtonElement>("button", { name: "Ajouter une colonne" });
    expect(bouton.disabled).toBe(false);
    expect(focus()).not.toBe(bouton);
  });
});

const NOM_DU_PLUS = "Ajouter une colonne à droite";

function plus(): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>("button", { name: NOM_DU_PLUS });
}

function annonce(): string {
  return screen.getAllByRole("status")[0]?.textContent ?? "";
}

function deuxColonnes(table: DocumentTable): void {
  table.creerColonne("Nom", "texte");
  table.creerColonne("Prix", "nombre");
}

describe("autant de colonnes qu'on veut (F-038-AC3)", () => {
  it("F-038-AC3 trois colonnes A, B, C par la barre d'outils : trois en-têtes dans l'ordre, la commande reste disponible, aria-colcount exact", async () => {
    const { utilisateur } = rendreLaTable(deuxColonnes);
    await creerLaColonne(
      utilisateur,
      screen.getByRole("button", { name: "Ajouter une colonne" }),
      "A",
    );
    for (const nom of ["B", "C"]) {
      await creerLaColonne(
        utilisateur,
        screen.getByRole("button", { name: "Ajouter une colonne" }),
        nom,
      );
    }
    expect(nomsDesEnTetes()).toEqual(["Nom", "Prix", "A", "B", "C"]);
    expect(grille().getAttribute("aria-colcount")).toBe("6");
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Ajouter une colonne" }).disabled,
    ).toBe(false);
  });
});

describe("« + » d'en-tête (F-038-AC4, AC6)", () => {
  it("F-038-AC4 le « + » n'existe qu'avec au moins une colonne, de nom « Ajouter une colonne à droite », pictogramme masqué, et ouvre la boîte « Nouvelle colonne » sur Texte", async () => {
    const { utilisateur } = rendreLaTable();
    expect(screen.queryByRole("button", { name: NOM_DU_PLUS })).toBeNull();
    await utilisateur.click(screen.getByRole("button", { name: "Ajouter une colonne" }));
    await utilisateur.type(screen.getByLabelText("Nom de la colonne"), "A");
    await utilisateur.click(screen.getByRole("button", { name: "Créer la colonne" }));

    expect(plus().querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    await utilisateur.click(plus());
    const boite = await screen.findByRole("dialog", { name: "Nouvelle colonne" });
    expect(within(boite).getByRole<HTMLSelectElement>("combobox").value).toBe("texte");
  });

  it("F-038-AC6 le « + » n'est pas dans la grille, n'est pas une cellule, et se tabule juste après elle ; la flèche droite depuis le dernier en-tête ne l'atteint pas", async () => {
    const { utilisateur } = rendreLaTable(deuxColonnes);
    expect(grille().contains(plus())).toBe(false);
    expect(grille().getAttribute("aria-colcount")).toBe("3");
    expect(grille().getAttribute("aria-rowcount")).toBe("1");
    expect(within(grille()).getAllByRole("columnheader")).toHaveLength(3);

    cellule(1, 3).focus();
    await utilisateur.keyboard("{ArrowRight}");
    expect(focus()).toBe(cellule(1, 3));
    await utilisateur.tab();
    expect(focus()).toBe(plus());
  });

  it("F-038-AC6 la largeur calculée des colonnes ne compte pas le « + »", () => {
    rendreLaTable(deuxColonnes);
    const rangeeDeCorps = [...grille().querySelectorAll<HTMLElement>('[role="rowgroup"]')][1];
    const enTetes = [...grille().querySelectorAll<HTMLElement>('[role="rowgroup"]')][0];
    const somme = ["Nom", "Prix"].length * 180 + 72;
    expect(rangeeDeCorps?.style.width).toBe(`${String(somme)}px`);
    // Les en-têtes gardent une réserve : le dernier se range à gauche du « + » quand la grille défile.
    expect(Number.parseInt(enTetes?.style.width ?? "0", 10)).toBeGreaterThan(somme);
  });
});

describe("couture : les lecteurs du nombre et de la largeur des colonnes (F-038-AC6)", () => {
  const SOURCES = lister("src").filter((chemin) => /\.tsx?$/.test(chemin));
  const lecteurs = (motif: RegExp): string[] =>
    SOURCES.filter((chemin) => motif.test(lire(chemin))).sort();

  it("F-038-AC6 chaque lecteur de `nombreDeColonnes` le tient des colonnes lues, sans compter le « + »", () => {
    expect(lecteurs(/nombreDeColonnes/)).toEqual([
      "src/demonstration/PageDemonstration.tsx",
      "src/interface/composants/Table.tsx",
      "src/vues-de-table/VueTableau.tsx",
      "src/vues-de-table/use-vue-tableau.ts",
    ]);
    // Seule la grille de la table passe le nombre ; il vaut les colonnes plus la colonne d'actions.
    expect(lire("src/vues-de-table/VueTableau.tsx")).toContain(
      "nombreDeColonnes={vue.colonnes.length + 1}",
    );
    expect(lire("src/interface/composants/Table.tsx")).toContain(
      "aria-colcount={props.nombreDeColonnes}",
    );
  });

  it("F-038-AC6 chaque lecteur de `largeurDe` et de la liste des colonnes ignore le « + » : seul `Table.tsx` le connaît", () => {
    const lisentLaLargeur = lecteurs(/largeurDe\b/);
    expect(lisentLaLargeur).toEqual(
      [
        "src/vues-de-table/EcranDeTable.tsx",
        "src/vues-de-table/EnTetes.tsx",
        "src/vues-de-table/Rangees.tsx",
        "src/vues-de-table/Separateur.tsx",
        "src/vues-de-table/use-reglages.ts",
        "src/vues-de-table/use-vue-tableau.ts",
        "src/vues-de-table/VueTableau.tsx",
        "src/vues-de-table/reglages.ts",
      ].sort(),
    );
    const connaissentLePlus = SOURCES.filter((chemin) =>
      /RESERVE_DU_PLUS|AjoutDeColonne/.test(lire(chemin)),
    );
    expect(connaissentLePlus).toEqual(["src/interface/composants/Table.tsx"]);
    // La largeur de la grille reste la somme des colonnes et de la colonne d'actions.
    expect(lire("src/vues-de-table/VueTableau.tsx")).toMatch(
      /largeurDesActions\([^)]*\) \+\s+vue\.colonnes\.reduce\(\(somme, \{ id \}\) => somme \+ largeurDe\(id\), 0\)/,
    );
  });
});

describe("focus, annonce, clavier (F-038-AC7, AC8)", () => {
  it("F-038-AC7 valider depuis le « + » crée la colonne en dernier par une seule opération, focalise son en-tête et annonce « Colonne … ajoutée, position N sur M »", async () => {
    const { utilisateur, table, emises } = rendreLaTable(deuxColonnes);
    await creerLaColonne(utilisateur, plus(), "Échéance");
    expect(emises).toHaveLength(1);
    expect(table.lire().colonnes.map(({ nom }) => nom)).toEqual(["Nom", "Prix", "Échéance"]);
    expect(focus()).toBe(cellule(1, 4));
    expect(annonce()).toBe("Colonne Échéance ajoutée, position 3 sur 3.");
  });

  it("F-038-AC7 le même message depuis la barre d'outils et depuis l'invitation ; « Sans nom » si le nom est vide", async () => {
    const { utilisateur } = rendreLaTable();
    await creerLaColonne(
      utilisateur,
      screen.getByRole("button", { name: "Ajouter une colonne" }),
      "",
    );
    expect(annonce()).toBe("Colonne Sans nom ajoutée, position 1 sur 1.");
    await creerLaColonne(
      utilisateur,
      screen.getByRole("button", { name: "Ajouter une colonne" }),
      "Prix",
    );
    expect(annonce()).toBe("Colonne Prix ajoutée, position 2 sur 2.");
  });

  it("F-038-AC8 Échap et « Annuler » rendent le focus au « + » ; Entrée et Espace l'ouvrent", async () => {
    const { utilisateur, emises } = rendreLaTable(deuxColonnes);
    plus().focus();
    await utilisateur.keyboard("{Enter}");
    await screen.findByRole("dialog", { name: "Nouvelle colonne" });
    await utilisateur.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(focus()).toBe(plus());

    await utilisateur.keyboard(" ");
    await screen.findByRole("dialog", { name: "Nouvelle colonne" });
    await utilisateur.click(screen.getByRole("button", { name: "Annuler" }));
    expect(focus()).toBe(plus());
    expect(emises).toEqual([]);
  });
});

describe("lecture seule et refus (F-038-AC9, AC10)", () => {
  it("F-038-AC9 en lecture seule, le « + » est désactivé, sa raison en description accessible, aucune boîte ni écriture", async () => {
    const { utilisateur, emises } = rendreLaTable(deuxColonnes, {
      lectureSeule: "Hors connexion.",
    });
    const bouton = plus();
    expect(bouton.disabled).toBe(true);
    const description = bouton.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(description)?.textContent).toBe("Hors connexion.");
    await utilisateur.click(bouton);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(emises).toEqual([]);
  });

  it("F-038-AC10 un nom de plus de 200 caractères est refusé par le « + » comme par la barre d'outils : limite citée, boîte et texte gardés, rien d'annoncé", async () => {
    const { utilisateur, table } = rendreLaTable(deuxColonnes);
    const trop = "x".repeat(201);
    const declencheurs = [
      () => plus(),
      () => screen.getByRole("button", { name: "Ajouter une colonne" }),
    ];
    for (const declencheur of declencheurs) {
      await utilisateur.click(declencheur());
      const boite = await screen.findByRole("dialog", { name: "Nouvelle colonne" });
      const champ = within(boite).getByLabelText<HTMLInputElement>("Nom de la colonne");
      await utilisateur.click(champ);
      await utilisateur.paste(trop);
      await utilisateur.click(within(boite).getByRole("button", { name: "Créer la colonne" }));
      expect(within(boite).getByText(/au plus 200 caractères/)).toBeDefined();
      expect(champ.value).toBe(trop);
      expect(annonce()).toBe("");
      expect(table.lire().colonnes).toHaveLength(2);
      await utilisateur.click(within(boite).getByRole("button", { name: "Annuler" }));
    }
  });
});

describe("appelants de la commande d'ajout (F-038-AC12)", () => {
  const SOURCES = lister("src").filter((chemin) => /\.tsx?$/.test(chemin));
  const APPELANTS = new Map([
    ["src/vues-de-table/VueTableau.tsx", 3],
    // Le type de la boîte, et l'aiguillage qui la rend.
    ["src/vues-de-table/grille.ts", 0],
    ["src/vues-de-table/Boites.tsx", 0],
    ["src/vues-de-table/kanban/VueKanban.tsx", 0],
  ]);

  it("F-038-AC12 la boîte « Nouvelle colonne » n'est ouverte que par les appelants connus : l'invitation, la barre d'outils, le « + » (VueTableau) et le kanban (BoiteNouvelleColonne)", () => {
    const ouvreLaBoite = SOURCES.filter((chemin) =>
      lire(chemin).includes('sorte: "nouvelle-colonne"'),
    );
    const montreLaBoite = SOURCES.filter((chemin) => /<BoiteNouvelleColonne\b/.test(lire(chemin)));
    expect([...new Set([...ouvreLaBoite, ...montreLaBoite])].sort()).toEqual(
      [...APPELANTS.keys()].sort(),
    );
    const sorte = lire("src/vues-de-table/VueTableau.tsx").match(
      /ouvrirBoite\(\{ sorte: "nouvelle-colonne" \}\)/g,
    );
    expect(sorte).toHaveLength(APPELANTS.get("src/vues-de-table/VueTableau.tsx") ?? -1);
    // Les signatures de la commande et de son écriture : inchangées.
    expect(lire("src/vues-de-table/actions.ts")).toContain(
      "export function ajouterUneColonne(\n  moyens: Moyens,\n  nom: string,\n  type: TypeDeColonne,\n): string | undefined {",
    );
    expect(lire("src/vues-de-table/kanban/VueKanban.tsx")).toContain('typeInitial="selection"');
  });

  it("F-038-AC12 chaque appelant de la table ouvre la boîte « Nouvelle colonne », sur Texte", async () => {
    const { utilisateur } = rendreLaTable(deuxColonnes);
    for (const declencheur of [
      plus,
      () => screen.getByRole("button", { name: "Ajouter une colonne" }),
    ]) {
      await utilisateur.click(declencheur());
      const boite = await screen.findByRole("dialog", { name: "Nouvelle colonne" });
      expect(within(boite).getByRole<HTMLSelectElement>("combobox").value).toBe("texte");
      await utilisateur.keyboard("{Escape}");
    }
    cleanup();
    const vide = rendreLaTable();
    await vide.utilisateur.click(screen.getByRole("button", { name: "Ajouter une colonne" }));
    expect(await screen.findByRole("dialog", { name: "Nouvelle colonne" })).toBeDefined();
  });
});
