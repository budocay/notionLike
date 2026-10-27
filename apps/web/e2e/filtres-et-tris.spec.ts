// Bout en bout de F-019 dans Chromium (F-019-AC30) : dans une table de six lignes, filtrer la colonne
// de sélection sur une option, constater les lignes et le compte, trier par une colonne texte puis par
// une colonne nombre, sortir une ligne du filtre par une modification, constater qu'elle reste
// affichée avec « Hors filtre », réappliquer, constater qu'elle a disparu, recharger et retrouver la
// même définition et les mêmes lignes. Aucun hook ne lance ce scénario (dette D-003) :
// `pnpm --filter @notionlike/web test:e2e`.
import { expect, type Locator, type Page, test } from "@playwright/test";

import { barreLaterale, ecrituresAbouties, ouvrir, recharger, saisirTitre } from "./aides.ts";

const COLONNE_RAYON = 2;
const COLONNE_QUANTITE = 3;
const COLONNE_ETAT = 4;
const PREMIERE_LIGNE = 2;

const LIGNES = [
  ["Fruits", "5", "Livré"],
  ["Légumes", "3", "À faire"],
  ["Fruits", "8", "Livré"],
  ["Bière", "3", "Livré"],
  ["Fruits", "1", "À faire"],
  ["Légumes", "9", "Livré"],
] as const;

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

async function textesDeLaColonne(page: Page, colonne: number): Promise<string[]> {
  return grille(page)
    .locator(`[role="row"]:not([aria-rowindex="1"]) [aria-colindex="${String(colonne)}"]`)
    .allTextContents();
}

async function choisirUneOption(page: Page, rangee: number, libelle: string): Promise<void> {
  await cellule(page, rangee, COLONNE_ETAT).click();
  await page.keyboard.press("Enter");
  await page
    .getByRole("listbox", { name: "Choix pour la colonne État" })
    .getByRole("option", { name: libelle, exact: true })
    .click();
}

test("F-019-AC30 filtrer sur une option, trier par un texte puis un nombre, ligne sortie du filtre gardée « Hors filtre », réappliquer, recharger", async ({
  page,
}) => {
  await ouvrir(page);
  await page.getByRole("button", { name: "Nouvelle table", exact: true }).click();
  await saisirTitre(page, "Commandes");
  await expect(
    barreLaterale(page).getByRole("link", { name: "Table Commandes", exact: true }),
  ).toBeVisible();

  await ajouterUneColonne(page, "Rayon", "Texte");
  await ajouterUneColonne(page, "Quantité", "Nombre");
  await ajouterUneColonne(page, "État", "Sélection");
  await page.getByRole("button", { name: "Actions de la colonne État" }).click();
  await page.getByRole("menuitem", { name: "Gérer les options de la colonne État" }).click();
  const options = page.getByRole("dialog", { name: "Options de la colonne État" });
  for (const libelle of ["À faire", "Livré"]) {
    await options.getByRole("textbox", { name: "Nouvelle option" }).fill(libelle);
    await options.getByRole("button", { name: "Ajouter l'option" }).click();
  }
  await options.getByRole("button", { name: "Fermer" }).click();

  // Six lignes : un texte, un nombre et une option chacune.
  for (let rang = 0; rang < LIGNES.length; rang += 1) {
    await page.getByRole("button", { name: "Nouvelle ligne", exact: true }).click();
  }
  await cellule(page, PREMIERE_LIGNE, COLONNE_RAYON).click();
  for (const [rayon] of LIGNES) {
    await page.keyboard.type(rayon);
    await page.keyboard.press("Enter");
  }
  await cellule(page, PREMIERE_LIGNE, COLONNE_QUANTITE).click();
  for (const [, quantite] of LIGNES) {
    await page.keyboard.type(quantite);
    await page.keyboard.press("Enter");
  }
  for (const [rang, [, , etat]] of LIGNES.entries()) {
    await choisirUneOption(page, PREMIERE_LIGNE + rang, etat);
  }
  expect(await textesDeLaColonne(page, COLONNE_ETAT)).toEqual(LIGNES.map(([, , etat]) => etat));

  // Un filtre sur la colonne de sélection : quatre lignes sur six.
  const filtres = page.getByRole("region", { name: "Filtres", exact: true });
  const tris = page.getByRole("region", { name: "Tris", exact: true });
  await filtres.getByRole("button", { name: "Ajouter un filtre", exact: true }).click();
  await filtres
    .getByRole("combobox", { name: "Colonne du filtre sur Rayon" })
    .selectOption({ label: "État" });
  await filtres
    .getByRole("combobox", { name: "Valeur du filtre sur État" })
    .selectOption({ label: "Livré" });
  await expect(filtres).toContainText("4 lignes sur 6");
  expect(await textesDeLaColonne(page, COLONNE_RAYON)).toEqual([
    "Fruits",
    "Fruits",
    "Bière",
    "Légumes",
  ]);

  // Un tri par le texte (les accents ne comptent pas), puis par le nombre.
  await tris.getByRole("button", { name: "Ajouter un tri", exact: true }).click();
  await tris.getByRole("button", { name: "Ajouter un tri", exact: true }).click();
  expect(await textesDeLaColonne(page, COLONNE_RAYON)).toEqual([
    "Bière",
    "Fruits",
    "Fruits",
    "Légumes",
  ]);
  expect(await textesDeLaColonne(page, COLONNE_QUANTITE)).toEqual(["3", "5", "8", "9"]);

  // La dernière ligne affichée sort du filtre : elle reste, marquée « Hors filtre ».
  await choisirUneOption(page, PREMIERE_LIGNE + 3, "À faire");
  await expect(cellule(page, PREMIERE_LIGNE + 3, COLONNE_ETAT)).toHaveText("À faire");
  await expect(grille(page).getByText("Hors filtre", { exact: true })).toHaveCount(1);
  expect(await textesDeLaColonne(page, COLONNE_RAYON)).toEqual([
    "Bière",
    "Fruits",
    "Fruits",
    "Légumes",
  ]);

  // Réappliquer : la ligne disparaît.
  await filtres
    .getByRole("button", { name: "Réappliquer les filtres et les tris", exact: true })
    .click();
  await expect(grille(page).getByText("Hors filtre", { exact: true })).toHaveCount(0);
  await expect(filtres).toContainText("3 lignes sur 6");
  expect(await textesDeLaColonne(page, COLONNE_RAYON)).toEqual(["Bière", "Fruits", "Fruits"]);
  await ecrituresAbouties(page);

  // Rechargée : la même définition, les mêmes lignes.
  await recharger(page);
  await barreLaterale(page).getByRole("link", { name: "Table Commandes", exact: true }).click();
  await expect(grille(page)).toBeVisible();
  await expect(filtres).toContainText("1 filtre");
  await expect(filtres).toContainText("3 lignes sur 6");
  await expect(tris).toContainText("2 tris");
  expect(await textesDeLaColonne(page, COLONNE_RAYON)).toEqual(["Bière", "Fruits", "Fruits"]);
  expect(await textesDeLaColonne(page, COLONNE_QUANTITE)).toEqual(["3", "5", "8"]);
});
