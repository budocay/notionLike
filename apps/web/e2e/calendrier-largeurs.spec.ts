// Preuves [navigateur] de F-004 pour l'écran (k), la vue calendrier de F-021, dans Chromium : cibles
// tactiles (F-004-AC43) et absence de défilement horizontal aux six largeurs de référence (F-004-AC45).
// Un fichier à part : les tests de F-004 déjà livrée restent intacts (F-021-AC30). `activables` et
// `constaterLesCibles` reprennent la mesure de `largeurs.spec.ts`.
import { expect, type Page, test } from "@playwright/test";

import {
  constaterSansDefilementHorizontal,
  construireLeCalendrier,
  contexteTactile,
  largeur,
  LARGEURS_DE_REFERENCE,
} from "./aides-ecrans.ts";

const CIBLE = 44;

interface Cible {
  readonly nom: string;
  readonly largeur: number;
  readonly hauteur: number;
}

/** Éléments activables rendus à l'écran, après la fin des animations finies (comme `largeurs.spec.ts`). */
function activables(page: Page): Promise<Cible[]> {
  return page.evaluate(async () => {
    const finies = document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.all(finies.map((animation) => animation.finished.catch(() => undefined)));
    return [...document.querySelectorAll<HTMLElement>("a[href], button, input, [role='menuitem']")]
      .filter((element) => element.closest("[inert]") === null && element.offsetParent !== null)
      .map((element) => {
        const rectangle = element.getBoundingClientRect();
        return {
          nom: `${element.tagName} ${(element.getAttribute("aria-label") ?? element.textContent).slice(0, 40)}`,
          largeur: rectangle.width,
          hauteur: rectangle.height,
        };
      });
  });
}

async function constaterLesCibles(page: Page, ecran: string, auMoins: number): Promise<void> {
  const cibles = await activables(page);
  expect(cibles.length, `éléments activables de l'écran ${ecran}`).toBeGreaterThanOrEqual(auMoins);
  const tropPetites = cibles.filter((cible) => cible.largeur < CIBLE || cible.hauteur < CIBLE);
  expect(tropPetites, `cibles de moins de ${CIBLE} pixels, écran ${ecran}`).toEqual([]);
}

test("F-004-AC43 F-021 sur l'écran (k), le calendrier, pointeur imprécis : chaque élément activable offre au moins 44 pixels à 1280 puis à 360", async ({
  browser,
  baseURL,
}) => {
  const contexte = await contexteTactile(browser, baseURL, 1280);
  const page = await contexte.newPage();
  await construireLeCalendrier(page);
  expect(await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches)).toBe(true);
  // « + » et « ⋯ » de chaque case et de l'entrée, boutons du panneau « Sans date » et de la barre.
  await constaterLesCibles(page, "(k) à 1280", 40);
  await largeur(page, 360);
  await constaterLesCibles(page, "(k) à 360", 40);
  await contexte.close();
});

test("F-004-AC45 F-021 sur l'écran (k), le calendrier, la largeur de défilement ne dépasse celle de la fenêtre à aucune des six largeurs de référence", async ({
  page,
}) => {
  await largeur(page, 1280);
  await construireLeCalendrier(page);
  for (const pixels of LARGEURS_DE_REFERENCE) {
    await largeur(page, pixels);
    await constaterSansDefilementHorizontal(page, `calendrier à ${String(pixels)}`);
  }
});
