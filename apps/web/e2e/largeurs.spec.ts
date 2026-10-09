// Preuves [navigateur] des largeurs d'écran de F-004, dans Chromium : seuil lu dans le jeton
// (F-004-AC41), tiroir sur écran étroit (F-004-AC42), cibles tactiles (F-004-AC43) et actions de
// rangée sans survol (F-004-AC44). Le pointeur imprécis et l'absence de survol s'obtiennent par un
// contexte tactile (essai B3 de la conception), sans projet Playwright ajouté.
import { expect, type Locator, type Page, test } from "@playwright/test";

import { barreLaterale, lienDePage, titrePrincipal } from "./aides.ts";
import {
  boutonDOuverture,
  construireLArborescence,
  construireUnePage,
  contexteTactile,
  FERMER_LA_BARRE,
  jeton,
  largeur,
  montrerLaBarre,
  ouvrirLeMenu,
  style,
  tiroir,
  TITRE_DU_NIVEAU_12,
  toutRefermer,
  voile,
} from "./aides-ecrans.ts";

const CIBLE = 44;
const TABULATIONS = 12;

declare global {
  interface Window {
    requetesDeLargeur?: string[];
  }
}

test("F-004-AC41 à 768 puis 1024 : la requête de largeur du code est bâtie sur le jeton lu sur la racine ; tiroir à 768, barre permanente à 1024", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const interroger = window.matchMedia.bind(window);
    window.requetesDeLargeur = [];
    window.matchMedia = (requete: string) => {
      window.requetesDeLargeur?.push(requete);
      return interroger(requete);
    };
  });
  await largeur(page, 1280);
  await construireUnePage(page);
  const seuil = await jeton(page, "--breakpoint-etroit");
  expect(seuil).toBe("51.25rem");
  const requetes = await page.evaluate(() => [...new Set(window.requetesDeLargeur)]);
  expect(requetes).toEqual([`(width >= ${seuil})`]);

  await largeur(page, 768);
  await expect(boutonDOuverture(page)).toBeVisible();
  await expect(barreLaterale(page)).toBeHidden();
  expect(
    await page.evaluate((requete) => window.matchMedia(requete).matches, requetes[0] ?? ""),
  ).toBe(false);

  await largeur(page, 1024);
  await expect(boutonDOuverture(page)).toHaveCount(0);
  await expect(barreLaterale(page)).toBeVisible();
  expect(
    await page.evaluate((requete) => window.matchMedia(requete).matches, requetes[0] ?? ""),
  ).toBe(true);
});

/** Où est le focus : dans le tiroir, sur l'interface du navigateur, ou ailleurs dans l'application. */
function lieuDuFocus(page: Page): Promise<string> {
  return page.evaluate(() => {
    const actif = document.activeElement;
    if (actif === null || actif === document.body || actif === document.documentElement) {
      return "navigateur";
    }
    return actif.closest('[role="dialog"]') === null
      ? `hors du tiroir : ${actif.tagName} ${actif.getAttribute("aria-label") ?? actif.textContent}`
      : "tiroir";
  });
}

async function constaterLeTiroirFerme(page: Page): Promise<void> {
  await expect(tiroir(page)).toHaveCount(0);
  await expect(voile(page)).toHaveCount(0);
  await expect(barreLaterale(page)).toBeHidden();
  await expect(boutonDOuverture(page)).toHaveAttribute("aria-expanded", "false");
  expect(await page.locator("[inert]").count()).toBe(0);
}

function commandeDuReste(page: Page): Locator {
  return page.getByRole("button", { name: "Afficher les pages intermédiaires" });
}

// (1) et (2) : tiroir par-dessus le contenu, voile sur le reste, focus dans le tiroir, aussitôt.
async function constaterLOuverture(page: Page, pixels: number): Promise<void> {
  await boutonDOuverture(page).click();
  await expect(page.getByRole("button", { name: FERMER_LA_BARRE })).toBeFocused();
  await expect(tiroir(page)).toBeVisible();
  await expect(tiroir(page)).toHaveAttribute("aria-modal", "true");
  await expect(voile(page)).toBeVisible();
  // L'entrée glisse : la position finale est attendue, l'usage ne l'a pas attendue.
  await expect.poll(async () => (await tiroir(page).boundingBox())?.x).toBe(0);
  const panneau = await tiroir(page).boundingBox();
  expect(panneau?.height).toBe(800);
  expect(panneau?.width ?? pixels).toBeLessThanOrEqual(pixels - CIBLE);
  expect((await voile(page).boundingBox())?.width).toBe(pixels);
  expect((await page.getByRole("main").boundingBox())?.width).toBe(pixels);
}

// (3) : le reste est inerte, le focus n'y atteint aucune commande.
async function constaterLInertie(page: Page): Promise<void> {
  for (const commande of [commandeDuReste(page), boutonDOuverture(page)]) {
    await commande.evaluate((element: HTMLElement) => element.focus());
    expect(await lieuDuFocus(page)).toBe("tiroir");
  }
  const inerte = await page.getByRole("banner").evaluate((barre) => barre.closest("[inert]"));
  expect(inerte).not.toBeNull();
}

// (4) : Tab et Maj+Tab ne mènent à aucun élément de l'application hors du tiroir.
async function constaterLesTabulations(page: Page): Promise<void> {
  const lieux = new Set<string>();
  for (const touche of ["Tab", "Shift+Tab"]) {
    for (let pas = 0; pas < TABULATIONS; pas += 1) {
      await page.keyboard.press(touche);
      lieux.add(await lieuDuFocus(page));
    }
  }
  expect([...lieux].filter((lieu) => lieu.startsWith("hors du tiroir"))).toEqual([]);
  expect(lieux.has("tiroir")).toBe(true);
}

// Un clic à l'endroit d'une commande du reste tombe sur le voile : il ferme le tiroir sans
// activer la commande ni changer l'adresse.
async function fermerParLeVoile(page: Page, pixels: number): Promise<void> {
  const adresse = page.url();
  const cible = await commandeDuReste(page).boundingBox();
  await page.mouse.click(pixels - 4, (cible?.y ?? 0) + (cible?.height ?? 0) / 2);
  await constaterLeTiroirFerme(page);
  await expect(commandeDuReste(page)).toHaveAttribute("aria-expanded", "false");
  expect(page.url()).toBe(adresse);
}

for (const pixels of [360, 768]) {
  test(`F-004-AC42 à ${pixels}, le tiroir : affiché par-dessus le contenu avec un voile, focus dedans, reste inerte, douze Tab puis douze Maj+Tab sans sortir, et chaque fermeture rend le focus`, async ({
    page,
  }) => {
    await largeur(page, 1280);
    await construireLArborescence(page);
    await largeur(page, pixels);
    await constaterLeTiroirFerme(page);
    expect((await page.getByRole("main").boundingBox())?.width).toBe(pixels);

    await constaterLOuverture(page, pixels);
    await constaterLInertie(page);
    await constaterLesTabulations(page);

    // Fermetures : Échap, voile, bouton ; le focus revient au bouton d'ouverture.
    await page.getByRole("button", { name: FERMER_LA_BARRE }).focus();
    await page.keyboard.press("Escape");
    await constaterLeTiroirFerme(page);
    await expect(boutonDOuverture(page)).toBeFocused();

    await boutonDOuverture(page).click();
    await fermerParLeVoile(page, pixels);
    await expect(boutonDOuverture(page)).toBeFocused();

    await boutonDOuverture(page).click();
    await page.getByRole("button", { name: FERMER_LA_BARRE }).click();
    await constaterLeTiroirFerme(page);
    await expect(boutonDOuverture(page)).toBeFocused();

    // Choisir une page ferme le tiroir et porte le focus dans la zone principale.
    await boutonDOuverture(page).click();
    await lienDePage(page, "Carnet 2").click();
    await expect(titrePrincipal(page)).toHaveText("Carnet 2");
    await constaterLeTiroirFerme(page);
    await expect(page.getByRole("main")).toBeFocused();
  });
}

test("F-004-AC42 à 1024 et 1280, la barre est permanente, sans bouton d'ouverture ni voile ; de 768 à 1024, tiroir ouvert, elle le redevient sans voile ni reste inerte", async ({
  page,
}) => {
  await largeur(page, 1280);
  await construireUnePage(page);
  for (const pixels of [1024, 1280]) {
    await largeur(page, pixels);
    await expect(barreLaterale(page)).toBeVisible();
    await expect(boutonDOuverture(page)).toHaveCount(0);
    await expect(voile(page)).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }

  await largeur(page, 768);
  await boutonDOuverture(page).click();
  await expect(tiroir(page)).toBeVisible();
  await expect(voile(page)).toBeVisible();

  await largeur(page, 1024);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(voile(page)).toHaveCount(0);
  expect(await page.locator("[inert]").count()).toBe(0);
  await expect(barreLaterale(page)).toBeVisible();
  // La barre reprend sa place à gauche de la zone principale, filet compris.
  await expect.poll(async () => (await barreLaterale(page).boundingBox())?.x).toBe(0);
  const barre = await barreLaterale(page).boundingBox();
  const zone = await page.getByRole("main").boundingBox();
  expect(zone?.x).toBe((barre?.width ?? 0) + 1);

  await largeur(page, 768);
  await expect(boutonDOuverture(page)).toHaveAttribute("aria-expanded", "false");
  await expect(barreLaterale(page)).toBeHidden();
});

interface Cible {
  readonly nom: string;
  readonly largeur: number;
  readonly hauteur: number;
}

/** Éléments activables rendus à l'écran, avec la taille de leur zone d'activation. */
function activables(page: Page): Promise<Cible[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("a[href], button, input, [role='menuitem']")]
      .filter((element) => element.closest("[inert]") === null && element.offsetParent !== null)
      .map((element) => {
        const rectangle = element.getBoundingClientRect();
        return {
          nom: `${element.tagName} ${(element.getAttribute("aria-label") ?? element.textContent).slice(0, 40)}`,
          largeur: rectangle.width,
          hauteur: rectangle.height,
        };
      }),
  );
}

async function constaterLesCibles(page: Page, ecran: string, auMoins: number): Promise<void> {
  const cibles = await activables(page);
  expect(cibles.length, `éléments activables de l'écran ${ecran}`).toBeGreaterThanOrEqual(auMoins);
  const tropPetites = cibles.filter((cible) => cible.largeur < CIBLE || cible.hauteur < CIBLE);
  expect(tropPetites, `cibles de moins de ${CIBLE} pixels, écran ${ecran}`).toEqual([]);
}

test("F-004-AC43 à 360, pointeur imprécis : chaque élément activable des écrans (b), (c), (d) et (j) offre au moins 44 pixels de large et de haut", async ({
  browser,
  baseURL,
}) => {
  const contexte = await contexteTactile(browser, baseURL, 1280);
  const page = await contexte.newPage();
  await construireLArborescence(page);
  expect(await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches)).toBe(true);
  // Pointeur imprécis sur écran large : les cibles ne sont pas compactes non plus.
  await constaterLesCibles(page, "(c) à 1280", 60);

  await largeur(page, 360);
  await constaterLesCibles(page, "(c)", 3);
  await montrerLaBarre(page);
  await constaterLesCibles(page, "(j)", 60);
  await ouvrirLeMenu(page, TITRE_DU_NIVEAU_12);
  await expect(page.getByRole("menuitem")).toHaveCount(3);
  await constaterLesCibles(page, "(d)", 63);
  await toutRefermer(page);
  await montrerLaBarre(page);
  await lienDePage(page, "Carnet 1").click();
  await expect(titrePrincipal(page)).toHaveText("Carnet 1");
  await constaterLesCibles(page, "(b)", 1);
  await contexte.close();
});

function opaciteDesActions(page: Page, titre: string): Promise<string> {
  const actions: Locator = lienDePage(page, titre)
    .locator("xpath=..")
    .locator(".actions-de-rangee");
  return style(actions, "opacity");
}

test("F-004-AC44 à 360, les actions de rangée sont visibles au repos, le titre restant sur une ligne", async ({
  page,
}) => {
  await largeur(page, 1280);
  await construireLArborescence(page);
  await largeur(page, 360);
  await montrerLaBarre(page);
  await page.mouse.move(350, 790);

  for (const titre of ["Carnet 1", "Carnet 2", TITRE_DU_NIVEAU_12]) {
    expect(await opaciteDesActions(page, titre)).toBe("1");
    expect(await style(lienDePage(page, titre), "white-space")).toBe("nowrap");
  }
});

test("F-004-AC44 à 1280 sans survol possible (hover: none), les actions de rangée sont visibles au repos", async ({
  browser,
  baseURL,
}) => {
  const contexte = await contexteTactile(browser, baseURL, 1280);
  const page = await contexte.newPage();
  await construireUnePage(page, "Sans survol");
  expect(await page.evaluate(() => window.matchMedia("(hover: none)").matches)).toBe(true);
  expect(await page.evaluate(() => window.innerWidth)).toBe(1280);
  await expect(boutonDOuverture(page)).toHaveCount(0);

  expect(await opaciteDesActions(page, "Sans survol")).toBe("1");
  await contexte.close();
});
