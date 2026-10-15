// F-003-AC28 : l'édition d'une page dans un navigateur réel, par des frappes réelles. Titre de niveau
// 1 par « # », paragraphe, liste à puces dont le second élément est imbriqué par Tab, annulation et
// rétablissement de la dernière frappe, contenu relu après rechargement ; puis réseau coupé, paragraphe
// modifié, et modification relue après rechargement.
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

const TITRE_DE_LA_PAGE = "Carnet de bord";
const PARAGRAPHE = "Un paragraphe ordinaire.";
const AJOUT_HORS_LIGNE = " Modifié hors ligne.";

const ATTENDU = [
  "h1:Titre du contenu",
  `p:${PARAGRAPHE}`,
  "ul[li(p:Premier élément ul[li(p:Second élément)])]",
];

function zoneDeSaisie(page: Page): Locator {
  return page.getByRole("textbox", { name: "Contenu de la page" });
}

/**
 * Le contenu affiché, bloc par bloc : balise et texte d'un bloc de texte, imbrication d'une liste.
 * Rien d'autre n'est lu : l'invite d'un bloc vide n'en fait pas partie.
 */
function structure(zone: Locator): Promise<string[]> {
  return zone.evaluate((racine) => {
    const decrire = (element: Element): string => {
      const balise = element.tagName.toLowerCase();
      const enfants = [...element.children].map(decrire);
      if (balise === "ul" || balise === "ol") {
        return `${balise}[${enfants.join(" ")}]`;
      }
      if (balise === "li") {
        return `li(${enfants.join(" ")})`;
      }
      return `${balise}:${element.textContent ?? ""}`;
    };
    return [...racine.children].map(decrire);
  });
}

async function relireApresRechargement(page: Page): Promise<void> {
  await ecrituresAbouties(page, PREFIXE_DES_BASES_DE_PAGE);
  await recharger(page);
  await expect(titrePrincipal(page).first()).toHaveText(TITRE_DE_LA_PAGE);
  await expect(zoneDeSaisie(page)).toBeVisible();
}

test("F-003-AC28 par des frappes réelles : titre par « # », paragraphe, liste imbriquée par Tab, annuler puis rétablir, contenu relu après rechargement ; réseau coupé, paragraphe modifié, modification relue après rechargement", async ({
  context,
  page,
}) => {
  const console_ = ecouterLaConsole(page);
  await ouvrir(page);
  await creerPageNommee(page, TITRE_DE_LA_PAGE);
  const zone = zoneDeSaisie(page);
  await zone.click();

  await page.keyboard.type("# Titre du contenu");
  await page.keyboard.press("Enter");
  await page.keyboard.type(PARAGRAPHE);
  await page.keyboard.press("Enter");
  await page.keyboard.type("- Premier élément");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Second élément");
  await expect.poll(() => structure(zone)).toEqual(ATTENDU);

  // La dernière frappe est annulée, puis rétablie : le contenu revient exactement.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => structure(zone)).not.toEqual(ATTENDU);
  await expect(zone).not.toContainText("Second élément");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => structure(zone)).toEqual(ATTENDU);

  await relireApresRechargement(page);
  await expect.poll(() => structure(zone)).toEqual(ATTENDU);

  // Réseau coupé : la modification ne dépend que de l'appareil.
  await context.setOffline(true);
  const reseau = await page.evaluate(() =>
    fetch(window.location.href).then(
      () => "joignable",
      () => "coupé",
    ),
  );
  expect(reseau).toBe("coupé");
  await zone.getByText(PARAGRAPHE, { exact: true }).click();
  await page.keyboard.press("End");
  await page.keyboard.type(AJOUT_HORS_LIGNE);
  const modifie = ATTENDU.map((bloc) =>
    bloc === `p:${PARAGRAPHE}` ? `p:${PARAGRAPHE}${AJOUT_HORS_LIGNE}` : bloc,
  );
  await expect.poll(() => structure(zone)).toEqual(modifie);
  await ecrituresAbouties(page, PREFIXE_DES_BASES_DE_PAGE);

  // Sans service worker, l'application elle-même ne se recharge pas réseau coupé : le réseau est
  // rendu pour le seul rechargement, la modification n'a été écrite que sur l'appareil.
  await context.setOffline(false);
  await relireApresRechargement(page);
  await expect.poll(() => structure(zone)).toEqual(modifie);

  // Seul message admis : l'échec de la sonde réseau, provoqué par le test lui-même.
  expect(console_.filter((message) => !message.includes("net::ERR_INTERNET_DISCONNECTED"))).toEqual(
    [],
  );
});
