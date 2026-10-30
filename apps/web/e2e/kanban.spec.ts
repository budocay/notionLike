// Bout en bout de F-020 dans Chromium (F-020-AC29, et ce que seul un navigateur réel prouve : le geste,
// le repère de dépôt, l'abandon par Échap, F-020-AC12) : une table d'une colonne « Sélection » à trois
// options et de quatre lignes ; la vue kanban ; un geste abandonné par Échap ; une carte glissée de
// « Sans valeur » vers la deuxième pile, entre deux cartes ; descendue d'une place par Alt+Maj+Flèche
// bas ; passée à la pile suivante par Alt+Maj+Flèche droite ; la vue « Tableau » relue (cellule et
// ordre des lignes) ; rechargé, la même vue kanban. Aucun hook ne lance ce scénario (dette D-003) :
// `pnpm --filter @notionlike/web test:e2e`.
import { expect, type Locator, type Page, test } from "@playwright/test";

import { barreLaterale, ecrituresAbouties, ouvrir, recharger, saisirTitre } from "./aides.ts";

const PREFIXE_DES_BASES_DE_TABLE = "notionlike:table:";

function grille(page: Page): Locator {
  return page.getByRole("grid");
}

/** La cellule de la rangée d'indice ARIA donné (1 : les en-têtes) et de la colonne donnée. */
function cellule(page: Page, rangee: number, colonne: number): Locator {
  return grille(page).locator(
    `[role="row"][aria-rowindex="${String(rangee)}"] [aria-colindex="${String(colonne)}"]`,
  );
}

async function ajouterUneColonne(page: Page, nom: string, type: string): Promise<void> {
  await page.getByRole("button", { name: "Ajouter une colonne", exact: true }).first().click();
  const boite = page.getByRole("dialog", { name: "Nouvelle colonne" });
  await boite.getByRole("textbox", { name: "Nom de la colonne" }).fill(nom);
  await boite.getByRole("combobox", { name: "Type de la colonne" }).selectOption({ label: type });
  await boite.getByRole("button", { name: "Créer la colonne" }).click();
  await expect(boite).toBeHidden();
}

function vue(page: Page, nom: "Tableau" | "Kanban"): Locator {
  return page
    .getByRole("group", { name: "Vue de la table" })
    .getByRole("button", { name: nom, exact: true });
}

function pile(page: Page, nom: string): Locator {
  return page.getByRole("group", { name: nom, exact: true });
}

function carte(page: Page, titre: string): Locator {
  return page.locator("[data-carte]").and(page.getByRole("group", { name: titre, exact: true }));
}

async function titresDeLaColonne(page: Page, colonne: number): Promise<string[]> {
  return grille(page)
    .locator(`[role="row"]:not([aria-rowindex="1"]) [aria-colindex="${String(colonne)}"]`)
    .allTextContents();
}

async function centre(element: Locator): Promise<{ x: number; y: number; haut: number }> {
  const boite = await element.boundingBox();
  if (boite === null) {
    throw new Error("L'élément n'est pas affiché.");
  }
  return { x: boite.x + boite.width / 2, y: boite.y + boite.height / 2, haut: boite.y };
}

/** Saisit la carte au centre, la porte par `steps` déplacements jusqu'au point, sans la lâcher. */
async function porterLaCarte(page: Page, depart: Locator, x: number, y: number): Promise<void> {
  const origine = await centre(depart);
  await page.mouse.move(origine.x, origine.y);
  await page.mouse.down();
  await page.mouse.move(origine.x + 12, origine.y + 4, { steps: 3 });
  await page.mouse.move(x, y, { steps: 12 });
}

test("F-020-AC29 F-020-AC12 la vue kanban : abandon par Échap, glisser entre deux cartes, Alt+Maj+Flèche bas puis droite, vue « Tableau » relue, même vue après rechargement", async ({
  page,
}) => {
  await ouvrir(page);
  await page.getByRole("button", { name: "Nouvelle table", exact: true }).click();
  await saisirTitre(page, "Suivi");

  // Une colonne de titre, une colonne « Sélection » à trois options, quatre lignes.
  await ajouterUneColonne(page, "Titre", "Texte");
  await ajouterUneColonne(page, "Statut", "Sélection");
  await page.getByRole("button", { name: "Actions de la colonne Statut" }).click();
  await page.getByRole("menuitem", { name: "Gérer les options de la colonne Statut" }).click();
  const options = page.getByRole("dialog", { name: "Options de la colonne Statut" });
  for (const libelle of ["À faire", "En cours", "Fait"]) {
    await options.getByRole("textbox", { name: "Nouvelle option" }).fill(libelle);
    await options.getByRole("button", { name: "Ajouter l'option" }).click();
  }
  await options.getByRole("button", { name: "Fermer" }).click();
  for (let rang = 0; rang < 4; rang += 1) {
    await page.getByRole("button", { name: "Nouvelle ligne", exact: true }).click();
  }
  await cellule(page, 2, 2).click();
  for (const titre of ["Alpha", "Bravo", "Charlie", "Delta"]) {
    await page.keyboard.type(titre);
    await page.keyboard.press("Enter");
  }
  // Alpha et Bravo sont « À faire » : Entrée ouvre le choix, une flèche bas et Entrée prennent la première option.
  for (const rangee of [2, 3]) {
    await cellule(page, rangee, 3).click();
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
  }
  await expect(cellule(page, 3, 3)).toHaveText("À faire");
  await ecrituresAbouties(page, PREFIXE_DES_BASES_DE_TABLE);

  // La vue kanban : « Sans valeur » puis les trois options.
  await vue(page, "Kanban").click();
  await expect(grille(page)).toBeHidden();
  await expect(pile(page, "Sans valeur, 2 cartes")).toBeVisible();
  await expect(pile(page, "À faire, 2 cartes")).toBeVisible();
  await expect(pile(page, "En cours, 0 carte")).toBeVisible();
  await expect(pile(page, "Fait, 0 carte")).toBeVisible();

  // Échap abandonne le geste : rien n'est modifié.
  const enCours = await centre(pile(page, "En cours, 0 carte"));
  await porterLaCarte(page, carte(page, "Delta"), enCours.x, enCours.y);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(pile(page, "En cours, 0 carte")).toBeVisible();
  await expect(pile(page, "Sans valeur, 2 cartes")).toBeVisible();

  // Delta glisse de « Sans valeur » vers « À faire », entre Alpha et Bravo.
  const bravo = await centre(carte(page, "Bravo"));
  await porterLaCarte(page, carte(page, "Delta"), bravo.x, bravo.haut + 2);
  await page.mouse.up();
  await expect(pile(page, "À faire, 3 cartes")).toBeVisible();
  await expect(pile(page, "À faire, 3 cartes").locator("[data-carte]")).toHaveText([
    "Alpha",
    "Delta",
    "Bravo",
  ]);

  // Alt+Maj+Flèche bas : une place plus bas dans la pile ; Alt+Maj+Flèche droite : pile suivante.
  await carte(page, "Delta").focus();
  await page.keyboard.press("Alt+Shift+ArrowDown");
  await expect(pile(page, "À faire, 3 cartes").locator("[data-carte]")).toHaveText([
    "Alpha",
    "Bravo",
    "Delta",
  ]);
  await expect(carte(page, "Delta")).toBeFocused();
  await page.keyboard.press("Alt+Shift+ArrowRight");
  await expect(pile(page, "En cours, 1 carte").locator("[data-carte]")).toHaveText(["Delta"]);
  await expect(carte(page, "Delta")).toBeFocused();
  await ecrituresAbouties(page, PREFIXE_DES_BASES_DE_TABLE);

  // La vue « Tableau » : la cellule de Delta et l'ordre des lignes.
  await vue(page, "Tableau").click();
  expect(await titresDeLaColonne(page, 2)).toEqual(["Alpha", "Bravo", "Delta", "Charlie"]);
  await expect(cellule(page, 4, 3)).toHaveText("En cours");

  // Rechargé : la même vue kanban.
  await vue(page, "Kanban").click();
  await recharger(page);
  await barreLaterale(page).getByRole("link", { name: "Table Suivi", exact: true }).click();
  await expect(pile(page, "En cours, 1 carte")).toBeVisible();
  await expect(pile(page, "En cours, 1 carte").locator("[data-carte]")).toHaveText(["Delta"]);
  await expect(pile(page, "À faire, 2 cartes").locator("[data-carte]")).toHaveText([
    "Alpha",
    "Bravo",
  ]);
  await expect(pile(page, "Sans valeur, 1 carte").locator("[data-carte]")).toHaveText(["Charlie"]);
});
