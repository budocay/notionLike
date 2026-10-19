// F-005-AC34 : le bloc code et le menu slash dans un navigateur réel, par des frappes réelles. Dans
// une page vide, `/` ouvre le menu près du curseur et entier dans la fenêtre ; `cod` puis Entrée
// donnent un bloc code ; deux lignes, dont une porte `<b>` et `# `, y sont saisies ; un langage est
// choisi au clavier ; Mod+Entrée sort ; `/tit`, Flèche bas et Entrée donnent un titre 2 ; tout est
// relu après rechargement. Par des frappes réelles aussi, la conversion d'un bloc code en paragraphe
// ou en titre (F-005-AC1, H16) : une frappe à côté de l'ancien saut de ligne ne change aucun autre
// caractère. Hors des hooks tant que D-003 n'est pas levée.
import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  creerPageNommee,
  ecouterLaConsole,
  ecrituresAbouties,
  ouvrir,
  PREFIXE_DES_BASES_DE_PAGE,
  recharger,
  titrePrincipal,
} from "./aides.ts";

const TITRE_DE_LA_PAGE = "Bloc code";
const PREMIERE_LIGNE = 'const balise = "<b>";';
const SECONDE_LIGNE = "# pas un titre";
// Distance la plus grande admise entre le bas du `/` et le haut du menu.
const PRES_DU_CURSEUR = 48;

function zoneDeSaisie(page: Page): Locator {
  return page.getByRole("textbox", { name: "Contenu de la page" });
}

function menuSlash(page: Page): Locator {
  return page.getByRole("listbox", { name: "Commandes de bloc" });
}

/** Le menu est sous le `/` (ou retourné au-dessus), près de lui, et entier dans la fenêtre. */
async function verifierLaPositionDuMenu(page: Page, zone: Locator): Promise<void> {
  const menu = await menuSlash(page).locator("..").boundingBox();
  const sequence = await zone.locator(".suggestion").boundingBox();
  const fenetre = page.viewportSize();
  expect(menu).not.toBeNull();
  expect(sequence).not.toBeNull();
  expect(fenetre).not.toBeNull();
  if (menu === null || sequence === null || fenetre === null) {
    return;
  }
  expect(menu.x).toBeGreaterThanOrEqual(0);
  expect(menu.y).toBeGreaterThanOrEqual(0);
  expect(menu.x + menu.width).toBeLessThanOrEqual(fenetre.width);
  expect(menu.y + menu.height).toBeLessThanOrEqual(fenetre.height);
  const ecart = Math.min(
    Math.abs(menu.y - (sequence.y + sequence.height)),
    Math.abs(sequence.y - (menu.y + menu.height)),
  );
  expect(ecart).toBeLessThanOrEqual(PRES_DU_CURSEUR);
  expect(Math.abs(menu.x - sequence.x)).toBeLessThanOrEqual(PRES_DU_CURSEUR);
}

async function verifierLeContenu(zone: Locator): Promise<void> {
  const code = zone.locator("pre > code");
  await expect(code).toHaveCount(1);
  await expect(code).toHaveText(`${PREMIERE_LIGNE}\n${SECONDE_LIGNE}`);
  await expect(code).toHaveAttribute("class", "language-python");
  await expect(zone.locator("pre b, pre h1, b")).toHaveCount(0);
  await expect(zone.locator("h2")).toHaveText("Un titre");
  const style = await zone
    .locator("pre")
    .evaluate((pre) => [getComputedStyle(pre).fontFamily, getComputedStyle(pre).whiteSpace]);
  expect(style[0]).toMatch(/mono|Menlo|Consolas|Courier/i);
  expect(style[1]).toMatch(/^pre/);
}

test("F-005-AC34 par des frappes réelles : `/` ouvre le menu près du curseur, `cod` et Entrée donnent un bloc code, deux lignes et un langage, Mod+Entrée, `/tit`, Flèche bas et Entrée donnent un titre, tout relu après rechargement", async ({
  page,
}) => {
  const console_ = ecouterLaConsole(page);
  await ouvrir(page);
  await creerPageNommee(page, TITRE_DE_LA_PAGE);
  const zone = zoneDeSaisie(page);
  await zone.click();

  await page.keyboard.type("/");
  await expect(menuSlash(page)).toBeVisible();
  await expect(menuSlash(page).getByRole("option")).toHaveCount(7);
  await verifierLaPositionDuMenu(page, zone);
  await page.keyboard.type("cod");
  await expect(menuSlash(page).getByRole("option")).toHaveText(["Bloc code"]);
  await page.keyboard.press("Enter");
  await expect(menuSlash(page)).toBeHidden();
  await expect(zone.locator("pre > code")).toHaveCount(1);

  await page.keyboard.type(PREMIERE_LIGNE);
  await page.keyboard.press("Enter");
  await page.keyboard.type(SECONDE_LIGNE);
  await expect(zone.locator("pre > code")).toHaveText(`${PREMIERE_LIGNE}\n${SECONDE_LIGNE}`);

  // Le sélecteur suit les sept commandes de type de bloc dans la barre (F-005-AC6).
  await page.keyboard.press("Alt+F10");
  for (let pas = 0; pas < 7; pas += 1) {
    await page.keyboard.press("ArrowRight");
  }
  const selecteur = page.getByRole("combobox", { name: "Langage du bloc code" });
  await expect(selecteur).toBeFocused();
  await page.keyboard.type("py");
  await expect(selecteur).toHaveValue("python");
  await page.keyboard.press("Escape");
  await expect(zone).toBeFocused();
  await expect(zone.locator("pre > code")).toHaveAttribute("class", "language-python");

  await page.keyboard.press("ControlOrMeta+Enter");
  await page.keyboard.type("/tit");
  await expect(menuSlash(page).getByRole("option")).toHaveText(["Titre 1", "Titre 2", "Titre 3"]);
  await page.keyboard.press("ArrowDown");
  await expect(menuSlash(page).getByRole("option", { name: "Titre 2" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Enter");
  await expect(menuSlash(page)).toBeHidden();
  await page.keyboard.type("Un titre");
  await verifierLeContenu(zone);
  await ecrituresAbouties(page, PREFIXE_DES_BASES_DE_PAGE);

  await recharger(page);
  await expect(titrePrincipal(page).first()).toHaveText(TITRE_DE_LA_PAGE);
  await verifierLeContenu(zoneDeSaisie(page));
  expect(console_).toEqual([]);
});

/** Tape un bloc code « aaa », « bbb » par la règle de saisie, puis lui donne ce type par la barre. */
async function convertirUnBlocCode(page: Page, pas: number): Promise<void> {
  await page.keyboard.type("``` aaa");
  await page.keyboard.press("Enter");
  await page.keyboard.type("bbb");
  await page.keyboard.press("Alt+F10");
  for (let rang = 0; rang < pas; rang += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await page.keyboard.press("Enter");
  await page.keyboard.press("Home");
  for (let rang = 0; rang < "aaa ".length; rang += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await page.keyboard.type("X");
}

/** Le texte exact de chaque élément, sans la normalisation des espaces de Playwright. */
async function textesExacts(zone: Locator, selecteur: string): Promise<string[]> {
  return zone.locator(selecteur).evaluateAll((elements) => elements.map((un) => un.textContent));
}

test("F-005-AC1 par des frappes réelles : un bloc code « aaa », « bbb » mis en « Paragraphe », un autre en « Titre 1 » ; « X » tapé juste après l'espace donne « aaa Xbbb », relu après rechargement", async ({
  page,
}) => {
  const console_ = ecouterLaConsole(page);
  await ouvrir(page);
  await creerPageNommee(page, "Conversion");
  const zone = zoneDeSaisie(page);
  await zone.click();

  await convertirUnBlocCode(page, 0);
  await expect(zone.locator("pre")).toHaveCount(0);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await convertirUnBlocCode(page, 1);

  expect(await textesExacts(zone, "p, h1")).toEqual(["aaa Xbbb", "aaa Xbbb"]);
  await expect(zone.locator("h1")).toHaveCount(1);
  await expect(zone.locator("pre, br")).toHaveCount(0);
  await ecrituresAbouties(page, PREFIXE_DES_BASES_DE_PAGE);

  await recharger(page);
  await expect(titrePrincipal(page).first()).toHaveText("Conversion");
  expect(await textesExacts(zoneDeSaisie(page), "p, h1")).toEqual(["aaa Xbbb", "aaa Xbbb"]);
  expect(console_).toEqual([]);
});
