// Grand titre de la page, preuve [navigateur] de F-003-AC39 : à 360 et 1280, taille calculée du titre
// de la page supérieure à celle d'un « Titre 1 » saisi dans le contenu, titre de 200 caractères sans
// espace pas plus large que la colonne de lecture, « Sans titre » atténué. Les classes et les jetons
// sont contrôlés sous Vitest (`test/grand-titre.test.tsx`).
import { expect, type Locator, type Page, test } from "@playwright/test";

import { boutonDuMenu, creerPageNommee, ouvrir, saisirTitre, titrePrincipal } from "./aides.ts";
import { largeur } from "./aides-ecrans.ts";

const LARGE = 1280;
const TITRE_LONG = "m".repeat(200);

function zoneDeSaisie(page: Page): Locator {
  return page.getByRole("textbox", { name: "Contenu de la page" });
}

function taille(element: Locator): Promise<number> {
  return element.evaluate((noeud) => Number.parseFloat(getComputedStyle(noeud).fontSize));
}

function couleur(element: Locator): Promise<string> {
  return element.evaluate((noeud) => getComputedStyle(noeud).color);
}

/** Largeur du titre, celle de la colonne de lecture qui le contient (son parent), défilement de la page. */
function largeurs(titre: Locator): Promise<{ titre: number; colonne: number; defilement: number }> {
  return titre.evaluate((noeud) => ({
    titre: noeud.getBoundingClientRect().width,
    colonne: noeud.parentElement?.getBoundingClientRect().width ?? 0,
    defilement: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
}

/** Renomme la page courante par le menu de sa rangée, la barre étant permanente à cette largeur. */
async function renommer(page: Page, ancien: string, nouveau: string): Promise<void> {
  await largeur(page, LARGE);
  await boutonDuMenu(page, ancien).click();
  await page.getByRole("menuitem", { name: "Renommer" }).click();
  await saisirTitre(page, nouveau);
}

for (const pixels of [360, LARGE]) {
  test(`F-003-AC39 à ${pixels}, le titre de la page est plus grand qu'un « Titre 1 » du contenu, un titre de 200 caractères sans espace tient dans la colonne, et « Sans titre » est atténué`, async ({
    page,
  }) => {
    await largeur(page, LARGE);
    await ouvrir(page);
    await creerPageNommee(page, "Agenda");
    await zoneDeSaisie(page).click();
    await page.keyboard.type("# Grand titre du contenu");
    const titre = titrePrincipal(page).first();
    const titre1 = zoneDeSaisie(page).locator("h1");
    await expect(titre1).toHaveText("Grand titre du contenu");

    await largeur(page, pixels);
    await expect(titre).toHaveText("Agenda");
    expect(await taille(titre)).toBeGreaterThan(await taille(titre1));
    const couleurPleine = await couleur(titre);

    await renommer(page, "Agenda", TITRE_LONG);
    await largeur(page, pixels);
    await expect(titre).toHaveText(TITRE_LONG);
    const mesures = await largeurs(titre);
    expect(mesures.colonne).toBeGreaterThan(0);
    expect(mesures.titre).toBeLessThanOrEqual(mesures.colonne);
    expect(mesures.defilement).toBe(0);

    await renommer(page, TITRE_LONG, "   ");
    await largeur(page, pixels);
    await expect(titre).toHaveText("Sans titre");
    expect(await couleur(titre)).not.toBe(couleurPleine);
    expect(await taille(titre)).toBeGreaterThan(await taille(titre1));
  });
}
