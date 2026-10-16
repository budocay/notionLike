// F-028-AC30 : la mise en forme dans un navigateur réel, par des frappes réelles. Un mot en gras par
// Mod+B, un autre en italique par `*mot*`, un lien posé par Mod+K après le refus de
// `javascript:alert(1)`, un contenu riche piégé collé sans que rien ne s'exécute, puis les mêmes
// marques et le même lien relus après rechargement. Hors des hooks tant que D-003 n'est pas levée.
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

const TITRE_DE_LA_PAGE = "Mise en forme";
const CONTENU_PIEGE = [
  '<p>collé <a href="javascript:alert(1)">piège</a></p>',
  '<img src="x" onerror="alert(2)">',
].join("");

function zoneDeSaisie(page: Page): Locator {
  return page.getByRole("textbox", { name: "Contenu de la page" });
}

/** Colle un contenu riche par un événement de collage du navigateur, porteur de ses données. */
async function collerDuHtml(zone: Locator, html: string): Promise<void> {
  await zone.evaluate((racine, contenu) => {
    const donnees = new DataTransfer();
    donnees.setData("text/html", contenu);
    donnees.setData("text/plain", "collé piège");
    racine.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: donnees, bubbles: true, cancelable: true }),
    );
  }, html);
}

async function verifierLesMarques(zone: Locator): Promise<void> {
  await expect(zone.locator("strong")).toHaveText("gras");
  await expect(zone.locator("em")).toHaveText("italique");
  const lien = zone.locator("a");
  await expect(lien).toHaveCount(1);
  await expect(lien).toHaveText("lien");
  await expect(lien).toHaveAttribute("href", "https://exemple.fr/");
  await expect(lien).toHaveAttribute("rel", "noopener noreferrer");
  await expect(lien).toHaveAttribute("target", "_blank");
}

test("F-028-AC30 par des frappes réelles : gras par Mod+B, italique par *mot*, lien par Mod+K après le refus de javascript:, contenu piégé collé sans exécution, marques et lien relus après rechargement", async ({
  page,
}) => {
  const console_ = ecouterLaConsole(page);
  const dialogues: string[] = [];
  page.on("dialog", (dialogue) => {
    dialogues.push(dialogue.message());
    void dialogue.dismiss();
  });
  await ouvrir(page);
  await creerPageNommee(page, TITRE_DE_LA_PAGE);
  const zone = zoneDeSaisie(page);
  await zone.click();

  await page.keyboard.type("Une phrase en ");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type("gras");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type(" puis *italique* et un lien");
  await expect(zone.locator("strong")).toHaveText("gras");
  await expect(zone.locator("em")).toHaveText("italique");

  for (let rang = 0; rang < "lien".length; rang += 1) {
    await page.keyboard.press("Shift+ArrowLeft");
  }
  await page.keyboard.press("ControlOrMeta+k");
  const champ = page.getByRole("textbox", { name: "Adresse du lien" });
  await expect(champ).toBeFocused();
  await page.keyboard.type("javascript:alert(1)");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText("mailto");
  await expect(zone.locator("a")).toHaveCount(0);
  await champ.selectText();
  await page.keyboard.type("exemple.fr");
  await page.keyboard.press("Enter");
  await expect(zone).toBeFocused();
  await verifierLesMarques(zone);

  await page.keyboard.press("End");
  await collerDuHtml(zone, CONTENU_PIEGE);
  await expect(zone).toContainText("collé piège");
  await expect(page.locator('a[href^="javascript"], [href^="javascript"]')).toHaveCount(0);
  await expect(page.locator("img")).toHaveCount(0);
  // Le collage est écrit dans la base : tout ce qu'il pouvait déclencher a eu lieu avant.
  await ecrituresAbouties(page, PREFIXE_DES_BASES_DE_PAGE);
  expect(dialogues).toEqual([]);

  await recharger(page);
  await expect(titrePrincipal(page).first()).toHaveText(TITRE_DE_LA_PAGE);
  await verifierLesMarques(zoneDeSaisie(page));
  expect(dialogues).toEqual([]);
  expect(console_).toEqual([]);
});
