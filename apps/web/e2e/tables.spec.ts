// Bout en bout de F-018 dans Chromium (F-018-AC56) : créer une table, la nommer, une colonne de
// chaque type et deux options, trois lignes, une cellule de chaque type remplie au clavier, un nombre
// refusé, une ligne descendue par Alt+Maj+Flèche bas, une colonne élargie au pointeur ; rechargée,
// la même table et la même largeur ; puis corbeille, restauration, suppression définitive, et ni base
// de table ni réglages de vue après rechargement. Aucun hook ne lance ce scénario (dette D-003) :
// `pnpm --filter @notionlike/web test:e2e`.
import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  activerActionDeRangee,
  barreLaterale,
  ecrituresAbouties,
  nomsDesBases,
  ouvrir,
  recharger,
  saisirTitre,
} from "./aides.ts";

const PREFIXE_DU_FRAGMENT_DE_PAGE = "#/page/";
const PREFIXE_DES_BASES_DE_TABLE = "notionlike:table:";
const ELARGISSEMENT = 100;

function lienDeTable(page: Page, titre: string): Locator {
  return barreLaterale(page).getByRole("link", { name: `Table ${titre}`, exact: true });
}

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

async function cleDesReglages(page: Page, idTable: string): Promise<string[]> {
  return page.evaluate(
    (id) => Object.keys(localStorage).filter((cle) => cle.endsWith(`:${id}`)),
    idTable,
  );
}

test("F-018-AC56 créer, remplir au clavier, refuser un nombre, descendre une ligne, élargir au pointeur, recharger ; corbeille, restauration, suppression définitive : ni base de table ni réglages", async ({
  page,
}) => {
  await ouvrir(page);
  await page.getByRole("button", { name: "Nouvelle table", exact: true }).click();
  await saisirTitre(page, "Achats");
  await expect(lienDeTable(page, "Achats")).toBeVisible();
  const idTable = ((await lienDeTable(page, "Achats").getAttribute("href")) ?? "").slice(
    PREFIXE_DU_FRAGMENT_DE_PAGE.length,
  );

  // Une colonne de chaque type, puis deux options.
  for (const [nom, type] of [
    ["Article", "Texte"],
    ["Prix", "Nombre"],
    ["Reçu", "Case à cocher"],
    ["Échéance", "Date"],
    ["État", "Sélection"],
  ] as const) {
    await ajouterUneColonne(page, nom, type);
  }
  await page.getByRole("button", { name: "Actions de la colonne État" }).click();
  await page.getByRole("menuitem", { name: "Gérer les options de la colonne État" }).click();
  const options = page.getByRole("dialog", { name: "Options de la colonne État" });
  for (const libelle of ["En attente", "Livré"]) {
    await options.getByRole("textbox", { name: "Nouvelle option" }).fill(libelle);
    await options.getByRole("button", { name: "Ajouter l'option" }).click();
  }
  await options.getByRole("button", { name: "Fermer" }).click();

  // Trois lignes, puis une cellule de chaque type au clavier.
  for (let rang = 0; rang < 3; rang += 1) {
    await page.getByRole("button", { name: "Nouvelle ligne", exact: true }).click();
  }
  await cellule(page, 2, 2).click();
  await page.keyboard.type("Papier");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Encre");
  await page.keyboard.press("Enter");
  await cellule(page, 2, 3).click();
  await page.keyboard.type("12,5");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  // La valeur d'un champ de date se lit AAAA-MM-JJ ; sa frappe suit la langue du navigateur.
  await page.getByLabel("Échéance, ligne 1").fill("2026-10-21");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(cellule(page, 2, 3)).toHaveText("12,5");
  await expect(cellule(page, 2, 4).getByRole("checkbox")).toBeChecked();
  await expect(cellule(page, 2, 5)).toHaveText("21/10/2026");
  await expect(cellule(page, 2, 6)).toHaveText("En attente");

  // Un nombre invalide est refusé, sans rien écrire.
  await cellule(page, 3, 3).click();
  await page.keyboard.type("1e3");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Saisissez un nombre" })).toHaveText(
    "Saisissez un nombre, par exemple 12 ou 3,5.",
  );
  await page.keyboard.press("Escape");
  await expect(cellule(page, 3, 3)).toHaveText("");

  // La première ligne descend d'une place.
  await cellule(page, 2, 2).click();
  await page.keyboard.press("Alt+Shift+ArrowDown");
  expect(await textesDeLaColonne(page, 2)).toEqual(["Encre", "Papier", ""]);
  await expect(page.getByRole("status").filter({ hasText: "Ligne déplacée" })).toHaveText(
    "Ligne déplacée en position 2 sur 3.",
  );

  // La colonne Article est élargie au pointeur.
  const enTete = cellule(page, 1, 2);
  const avant = (await enTete.boundingBox())?.width ?? 0;
  const separateur = page.getByRole("separator", { name: "Largeur de la colonne Article" });
  const boite = await separateur.boundingBox();
  if (boite === null) {
    throw new Error("Le séparateur n'est pas affiché.");
  }
  await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await page.mouse.down();
  await page.mouse.move(boite.x + boite.width / 2 + ELARGISSEMENT, boite.y + boite.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(separateur).toHaveAttribute("aria-valuenow", String(180 + ELARGISSEMENT));
  expect(Math.round((await enTete.boundingBox())?.width ?? 0)).toBe(
    Math.round(avant) + ELARGISSEMENT,
  );
  await ecrituresAbouties(page);
  await ecrituresAbouties(page, PREFIXE_DES_BASES_DE_TABLE);

  // Rechargée : la même table, la même largeur.
  await recharger(page);
  await lienDeTable(page, "Achats").click();
  await expect(grille(page)).toBeVisible();
  expect(await textesDeLaColonne(page, 2)).toEqual(["Encre", "Papier", ""]);
  await expect(cellule(page, 3, 3)).toHaveText("12,5");
  await expect(cellule(page, 3, 5)).toHaveText("21/10/2026");
  await expect(cellule(page, 3, 6)).toHaveText("En attente");
  await expect(
    page.getByRole("separator", { name: "Largeur de la colonne Article" }),
  ).toHaveAttribute("aria-valuenow", String(180 + ELARGISSEMENT));
  expect(await cleDesReglages(page, idTable)).toHaveLength(1);

  // Corbeille, restauration, suppression définitive.
  await activerActionDeRangee(page, "mettre-a-la-corbeille", "Achats");
  await barreLaterale(page).getByRole("button", { name: "Corbeille", exact: true }).click();
  await page.getByRole("button", { name: "Restaurer « Achats »", exact: true }).click();
  await expect(lienDeTable(page, "Achats")).toBeVisible();
  await activerActionDeRangee(page, "mettre-a-la-corbeille", "Achats");
  await page
    .getByRole("button", { name: "Supprimer définitivement « Achats »", exact: true })
    .click();
  const alerte = page.getByRole("alertdialog");
  await alerte.getByRole("button", { name: "Supprimer définitivement « Achats »" }).click();
  await expect(page.getByRole("region", { name: "Pages de la corbeille" })).toHaveText(
    "La corbeille est vide",
  );
  await ecrituresAbouties(page);

  await recharger(page);
  expect((await nomsDesBases(page)).filter((nom) => nom.endsWith(`:${idTable}`))).toEqual([]);
  expect(await cleDesReglages(page, idTable)).toEqual([]);
});
