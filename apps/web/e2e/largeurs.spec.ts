// Preuves [navigateur] des largeurs d'écran de F-004, dans Chromium : seuil lu dans le jeton
// (F-004-AC41), tiroir sur écran étroit (F-004-AC42), cibles tactiles (F-004-AC43) et actions de
// rangée sans survol (F-004-AC44). Le pointeur imprécis et l'absence de survol s'obtiennent par un
// contexte tactile (essai B3 de la conception), sans projet Playwright ajouté.
import { expect, type Locator, type Page, test } from "@playwright/test";

import { barreLaterale, lienDePage, titrePrincipal } from "./aides.ts";
import {
  actionsDeRangee,
  attendreLaFinDesMouvements,
  boutonDOuverture,
  construireLArborescence,
  construireUnePage,
  contexteTactile,
  FERMER_LA_BARRE,
  jeton,
  largeur,
  montrerLaBarre,
  OUVRIR_LA_BARRE,
  ouvrirLeMenu,
  ouvrirLeRenommage,
  style,
  tiroir,
  TITRE_DE_200,
  TITRE_DU_NIVEAU_12,
  toutRefermer,
  voile,
} from "./aides-ecrans.ts";

const CIBLE = 44;
const TABULATIONS = 12;
const PIXELS_PAR_REM = 16;
const HAUTEUR = 800;

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

/** Commandes du reste de l'application : barre du haut et zone principale, hors du tiroir. */
function commandesDuReste(page: Page): Locator {
  return page.locator("[inert]").locator("a[href], button");
}

interface EtatDeCommande {
  readonly nom: string;
  readonly deplie: string | null;
  readonly focalisee: boolean;
  /** Centre de la boîte, et s'il tombe hors de la boîte du tiroir. */
  readonly centre: { readonly x: number; readonly y: number };
  readonly horsDuTiroir: boolean;
}

/** Ce que chaque commande du reste porte : son état, le focus, et où son centre se trouve. */
function etatsDesCommandes(page: Page): Promise<EtatDeCommande[]> {
  return commandesDuReste(page).evaluateAll((commandes) => {
    const tiroir = document.querySelector('[role="dialog"]')?.getBoundingClientRect();
    return commandes.map((commande) => {
      const boite = commande.getBoundingClientRect();
      const centre = { x: boite.x + boite.width / 2, y: boite.y + boite.height / 2 };
      return {
        nom: commande.getAttribute("aria-label") ?? commande.textContent,
        deplie: commande.getAttribute("aria-expanded"),
        focalisee: document.activeElement === commande,
        centre,
        horsDuTiroir: tiroir === undefined || centre.x >= tiroir.right,
      };
    });
  });
}

/** L'effet d'aucune commande du reste ne s'est produit : ni état changé, ni focus, ni adresse. */
async function constaterSansEffet(
  page: Page,
  avant: readonly EtatDeCommande[],
  adresse: string,
): Promise<void> {
  const apres = await etatsDesCommandes(page);
  expect(apres.map(({ nom, deplie }) => ({ nom, deplie }))).toEqual(
    avant.map(({ nom, deplie }) => ({ nom, deplie })),
  );
  expect(apres.filter(({ focalisee }) => focalisee)).toEqual([]);
  expect(page.url()).toBe(adresse);
  await expect(page.getByRole("banner").locator("ul")).toHaveCount(0);
}

// La plus petite du jeton de largeur du tiroir et de la fenêtre moins une cible tactile.
async function largeurAttendueDuTiroir(page: Page, pixels: number): Promise<number> {
  const enRem = Number.parseFloat(await jeton(page, "--container-tiroir"));
  expect(enRem).toBeGreaterThan(0);
  return Math.min(enRem * PIXELS_PAR_REM, pixels - CIBLE);
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
  expect(panneau?.height).toBe(HAUTEUR);
  expect(panneau?.width).toBe(await largeurAttendueDuTiroir(page, pixels));
  expect((await voile(page).boundingBox())?.width).toBe(pixels);
  expect((await page.getByRole("main").boundingBox())?.width).toBe(pixels);
}

// (3) : le reste est inerte. Chaque commande du reste reçoit un appel à son `focus()` : elle ne
// prend pas le focus, qui reste dans le tiroir, et rien de ce qu'elle porte ne change.
async function constaterLInertie(page: Page): Promise<void> {
  const adresse = page.url();
  const avant = await etatsDesCommandes(page);
  expect(avant.map(({ nom }) => nom)).toEqual([
    OUVRIR_LA_BARRE,
    TITRE_DE_200,
    "Afficher les pages intermédiaires",
  ]);
  for (const commande of await commandesDuReste(page).all()) {
    await commande.evaluate((element: HTMLElement) => element.focus());
    await expect(commande).not.toBeFocused();
    expect(await lieuDuFocus(page)).toBe("tiroir");
  }
  await constaterSansEffet(page, avant, adresse);
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

interface PointDeClic {
  readonly x: number;
  readonly y: number;
  /** Rang, parmi les commandes du reste, de celle que le clic vise ; absent s'il vise le voile. */
  readonly rang: number | undefined;
}

// Le centre de la boîte d'une commande du reste que le tiroir ne couvre pas. Le bouton d'ouverture
// n'est pas visé : la fermeture lui rend le focus, quel que soit le clic. Quand aucune commande n'a
// son centre hors du tiroir (elles sont à gauche de la barre du haut, sous lui), le scénario le
// note, et le point est sur le voile, à leur hauteur.
async function pointHorsDuTiroir(
  page: Page,
  pixels: number,
  commandes: readonly EtatDeCommande[],
): Promise<PointDeClic> {
  const panneau = await tiroir(page).boundingBox();
  const bord = (panneau?.x ?? 0) + (panneau?.width ?? pixels);
  const rang = commandes.findIndex(
    ({ nom, horsDuTiroir }) => horsDuTiroir && nom !== OUVRIR_LA_BARRE,
  );
  const visee = commandes[rang];
  if (visee !== undefined) {
    return { ...visee.centre, rang };
  }
  test.info().annotations.push({
    type: "F-004-AC42",
    description: `à ${pixels}, aucune commande du reste n'a son centre hors du tiroir (bord à ${bord}, centres à ${commandes.map(({ centre }) => centre.x).join(", ")}) : le clic vise le voile`,
  });
  return { x: (bord + pixels) / 2, y: commandes[0]?.centre.y ?? 0, rang: undefined };
}

// Clic au centre de la boîte d'une commande du reste, en un point que le tiroir ne couvre pas : il
// ne l'active pas, ne lui donne pas le focus et ne change pas l'adresse ; reçu par le voile, il
// ferme le tiroir. Sans commande à viser, il ne prouve que la fermeture par le voile, l'inertie
// restant prouvée par les appels à `focus()` de `constaterLInertie`.
async function fermerParUnClicHorsDuTiroir(page: Page, pixels: number): Promise<void> {
  const adresse = page.url();
  // L'entrée du tiroir glisse : sa boîte n'est comparée à celles des commandes qu'une fois en place.
  await expect.poll(async () => (await tiroir(page).boundingBox())?.x).toBe(0);
  const avant = await etatsDesCommandes(page);
  const point = await pointHorsDuTiroir(page, pixels, avant);

  await page.mouse.click(point.x, point.y);

  await constaterLeTiroirFerme(page);
  // Fermé, le reste n'est plus inerte : ses commandes y sont dans l'état d'avant le clic, sauf le
  // bouton d'ouverture, dont `aria-expanded` suit le tiroir.
  const commandes = page.getByRole("banner").locator("a[href], button");
  const apres = await commandes.evaluateAll((elements) =>
    elements.map((element) => ({
      nom: element.getAttribute("aria-label") ?? element.textContent,
      deplie: element.getAttribute("aria-expanded"),
    })),
  );
  expect(apres).toEqual(
    avant.map(({ nom, deplie }) => ({ nom, deplie: nom === OUVRIR_LA_BARRE ? "false" : deplie })),
  );
  if (point.rang !== undefined) {
    await expect(commandes.nth(point.rang)).not.toBeFocused();
  }
  await expect(page.getByRole("banner").locator("ul")).toHaveCount(0);
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
    await fermerParUnClicHorsDuTiroir(page, pixels);
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

    // De même par Entrée sur le lien d'une rangée, au clavier seul.
    await boutonDOuverture(page).click();
    await lienDePage(page, "Carnet 3").focus();
    await page.keyboard.press("Enter");
    await expect(titrePrincipal(page)).toHaveText("Carnet 3");
    await constaterLeTiroirFerme(page);
    await expect(page.getByRole("main")).toBeFocused();
  });
}

for (const pixels of [360, 768]) {
  test(`F-004-AC42 à ${pixels}, Échap ferme le tiroir où que soit le focus : dans une saisie ou un menu il ne ferme que ceux-ci, puis, le focus tombé sur body après un clic dans une zone vide du tiroir, il ferme le tiroir et rend le focus au bouton d'ouverture`, async ({
    page,
  }) => {
    await largeur(page, 1280);
    await construireUnePage(page, "Carnet de bord");
    await largeur(page, pixels);
    await montrerLaBarre(page);

    await ouvrirLeRenommage(page, "Carnet de bord");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("textbox", { name: "Titre de la page" })).toHaveCount(0);
    await expect(tiroir(page)).toBeVisible();
    await ouvrirLeMenu(page, "Carnet de bord");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(tiroir(page)).toBeVisible();

    // Une zone vide du tiroir : sous la seule rangée de l'arborescence, rien ne prend le focus. Depuis
    // F-007, le pied porte l'entrée « Corbeille » en bas du tiroir : le point est pris à mi-hauteur.
    await attendreLaFinDesMouvements(tiroir(page));
    const panneau = await tiroir(page).boundingBox();
    const point = { x: (panneau?.width ?? 0) / 2, y: HAUTEUR / 2 };
    const vise = await page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return {
        dansLeTiroir: element?.closest('[role="dialog"]') !== null,
        activable: element?.closest("a, button, input, [tabindex]") !== null,
      };
    }, point);
    expect(vise).toEqual({ dansLeTiroir: true, activable: false });
    await page.mouse.click(point.x, point.y);
    expect(await lieuDuFocus(page)).toBe("navigateur");
    await expect(tiroir(page)).toBeVisible();

    await page.keyboard.press("Escape");

    await constaterLeTiroirFerme(page);
    await expect(boutonDOuverture(page)).toBeFocused();
  });
}

test("F-004-AC42 à 320, le tiroir est moins large que son jeton : il laisse une cible de voile, qui le ferme", async ({
  page,
}) => {
  const pixels = 320;
  await largeur(page, 1280);
  await construireUnePage(page);
  await largeur(page, pixels);

  await constaterLOuverture(page, pixels);
  const panneau = await tiroir(page).boundingBox();
  expect(panneau?.width).toBe(pixels - CIBLE);
  expect(panneau?.width).toBeLessThan(
    Number.parseFloat(await jeton(page, "--container-tiroir")) * PIXELS_PAR_REM,
  );
  const bande = { x: pixels - CIBLE / 2, y: HAUTEUR / 2 };
  expect(
    await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.hasAttribute("data-voile"),
      bande,
    ),
  ).toBe(true);
  await page.mouse.click(bande.x, bande.y);
  await constaterLeTiroirFerme(page);
  await expect(boutonDOuverture(page)).toBeFocused();
});

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

/**
 * Éléments activables rendus à l'écran, avec la taille de leur zone d'activation. La mesure attend
 * la fin des animations finies : prise pendant l'apparition d'une liste, sa transformation rend une
 * hauteur de 43,99998 pixels pour une cible de 44 (relevé le 2026-10-09, une fois sur trois).
 */
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

/** Écran (e) : la saisie de renommage est ouverte ; son champ est une cible comme les autres. */
async function constaterLeChampDeRenommage(
  page: Page,
  ecran: string,
  auMoins: number,
): Promise<void> {
  await ouvrirLeRenommage(page, TITRE_DU_NIVEAU_12);
  const champ = await page.getByRole("textbox", { name: "Titre de la page" }).boundingBox();
  expect(champ?.height, `hauteur du champ de renommage, écran ${ecran}`).toBeGreaterThanOrEqual(
    CIBLE,
  );
  await constaterLesCibles(page, ecran, auMoins);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox", { name: "Titre de la page" })).toHaveCount(0);
}

test("F-004-AC43 à 360, pointeur imprécis : chaque élément activable des écrans (b), (c), (d), (e) et (j) offre au moins 44 pixels de large et de haut", async ({
  browser,
  baseURL,
}) => {
  const contexte = await contexteTactile(browser, baseURL, 1280);
  const page = await contexte.newPage();
  await construireLArborescence(page);
  expect(await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches)).toBe(true);
  // Pointeur imprécis sur écran large : les cibles ne sont pas compactes non plus.
  await constaterLesCibles(page, "(c) à 1280", 60);
  await constaterLeChampDeRenommage(page, "(e) à 1280", 60);

  await largeur(page, 360);
  await constaterLesCibles(page, "(c)", 3);
  // Les éléments du fil d'Ariane, liste des pages intermédiaires ouverte.
  await page.getByRole("button", { name: "Afficher les pages intermédiaires" }).click();
  await expect(page.getByRole("banner").locator("ul").getByRole("link")).toHaveCount(10);
  await constaterLesCibles(page, "(c), liste des pages intermédiaires ouverte", 13);
  await toutRefermer(page);
  await montrerLaBarre(page);
  await constaterLesCibles(page, "(j)", 60);
  await ouvrirLeMenu(page, TITRE_DU_NIVEAU_12);
  await expect(page.getByRole("menuitem")).toHaveCount(3);
  await constaterLesCibles(page, "(d)", 63);
  await toutRefermer(page);
  await montrerLaBarre(page);
  await constaterLeChampDeRenommage(page, "(e)", 60);
  await toutRefermer(page);
  await montrerLaBarre(page);
  await lienDePage(page, "Carnet 1").click();
  await expect(titrePrincipal(page)).toHaveText("Carnet 1");
  await constaterLesCibles(page, "(b)", 1);
  await contexte.close();
});

function opaciteDesActions(page: Page, titre: string): Promise<string> {
  return style(actionsDeRangee(page, titre), "opacity");
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
