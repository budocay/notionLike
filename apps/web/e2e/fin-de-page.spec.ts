// F-040-AC12 : sortie du bloc code et zone de fin de page dans un navigateur réel (Chromium).
// Contexte souris : dans une page vide, trois accents graves, `json` et une espace ; `{ test }` puis
// Entrée trois fois donnent un paragraphe sous le bloc, où `suite` est saisi ; un second bloc code
// en dernier, un clic dans la zone dessous donne un paragraphe où `fin` est saisi. Contexte tactile :
// même chose avec `tap`. Rechargement : la page porte exactement ces blocs. Hors des hooks tant que
// D-003 n'est pas levée. À la main, par le dev (H5) : le clavier virtuel sur un appareil tactile réel.
import { expect, type Locator, type Page, test } from "@playwright/test";

import { contexteTactile } from "./aides-ecrans.ts";
import { creerPageNommee, ecouterLaConsole, ouvrir, recharger } from "./aides.ts";

const LARGEUR_TACTILE = 390;

function zoneDeSaisie(page: Page): Locator {
  return page.getByRole("textbox", { name: "Contenu de la page" });
}

async function paragrapheSousLeBloc(page: Page, zone: Locator, texte: string): Promise<void> {
  await page.keyboard.type("```json ");
  await page.keyboard.type("{ test }");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(zone.locator("pre")).toHaveCount(1);
  await page.keyboard.type(texte);
  await expect(zone.locator("p").first()).toHaveText(texte);
}

async function lesBlocs(zone: Locator): Promise<{ codes: string[]; paragraphes: string[] }> {
  return {
    codes: await zone.locator("pre > code").allTextContents(),
    paragraphes: await zone.locator("p").allTextContents(),
  };
}

async function scenario(page: Page, geste: (zoneDeFin: Locator) => Promise<void>): Promise<void> {
  const console_ = ecouterLaConsole(page);
  await ouvrir(page);
  await creerPageNommee(page, "Fin de page");
  const zone = zoneDeSaisie(page);
  await zone.click();
  await paragrapheSousLeBloc(page, zone, "suite");

  await page.keyboard.press("Enter");
  await page.keyboard.type("```json ");
  await page.keyboard.type("x");
  await expect(zone.locator("pre")).toHaveCount(2);
  const zoneDeFin = page.locator("[data-fin-de-page]");
  await geste(zoneDeFin);
  await page.keyboard.type("fin");

  const attendu = { codes: ["{ test }", "x"], paragraphes: ["suite", "fin"] };
  expect(await lesBlocs(zone)).toEqual(attendu);
  await recharger(page);
  expect(await lesBlocs(zoneDeSaisie(page))).toEqual(attendu);
  expect(console_).toEqual([]);
}

test("F-040-AC12 souris : Entrée trois fois sort du bloc code, un clic sous le dernier bloc crée un paragraphe, la page relue porte exactement ces blocs", async ({
  page,
}) => {
  await scenario(page, (zoneDeFin) => zoneDeFin.click());
});

test("F-040-AC12 tactile : le même scénario, la zone sous le dernier bloc touchée par `tap`", async ({
  browser,
  baseURL,
}) => {
  const contexte = await contexteTactile(browser, baseURL, LARGEUR_TACTILE);
  const page = await contexte.newPage();
  await scenario(page, (zoneDeFin) => zoneDeFin.tap());
  await contexte.close();
});
