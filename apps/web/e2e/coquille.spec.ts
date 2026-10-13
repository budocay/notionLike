// Preuves [navigateur] de la coquille habillée par F-004, dans Chromium : couleurs et contour de
// focus calculés, mouvement avec puis sans réduction, rangée, repère, tête de barre, fil d'Ariane,
// zone d'état, halo, dépli des ancêtres. Chaque scénario fixe sa largeur (hauteur de 800 pixels).
import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  activerActionDeRangee,
  barreLaterale,
  basculerRepli,
  boutonNouvellePage,
  creerPageNommee,
  lienDePage,
  nomDuRepli,
  saisirTitre,
  titrePrincipal,
} from "./aides.ts";
import {
  actionsDeRangee,
  constaterSansDefilementHorizontal,
  construireLArborescence,
  construireLEchecDePersistance,
  construireUnePage,
  enMillisecondes,
  fil,
  jeton,
  largeur,
  montrerLaBarre,
  ouvrirLeMenu,
  style,
  tiroir,
  TITRE_DE_200,
  TITRE_DE_5,
  TITRE_DU_NIVEAU_12,
  toutRefermer,
  voile,
  zoneDEtat,
} from "./aides-ecrans.ts";

const LARGE = 1280;
const ETROIT = 360;
const PIXELS_PAR_REM = 16;
const HUIT_REM = 8 * PIXELS_PAR_REM;
/** 199 caractères en cinquante mots : un titre que rien n'empêche de se replier, sinon la rangée. */
const TITRE_EN_MOTS = "mot ".repeat(50).trim();

/** Couleur calculée d'un jeton de couleur, telle que le navigateur la rend. */
function couleurDuJeton(page: Page, nom: string): Promise<string> {
  return page.evaluate((jetonDeCouleur) => {
    const sonde = document.createElement("span");
    sonde.style.color = `var(${jetonDeCouleur})`;
    document.body.append(sonde);
    const couleur = getComputedStyle(sonde).color;
    sonde.remove();
    return couleur;
  }, nom);
}

/** Image de fond calculée d'un jeton de dégradé, telle que le navigateur la rend. */
function imageDuJeton(page: Page, nom: string): Promise<string> {
  return page.evaluate((jetonDeDegrade) => {
    const sonde = document.createElement("span");
    sonde.style.backgroundImage = `var(${jetonDeDegrade})`;
    document.body.append(sonde);
    const image = getComputedStyle(sonde).backgroundImage;
    sonde.remove();
    return image;
  }, nom);
}

function rangeeDe(page: Page, titre: string): Locator {
  return lienDePage(page, titre).locator("xpath=..");
}

/** Chevron de la commande de repli d'une page qui a des sous-pages : il tourne quand elle bascule. */
function chevronDe(page: Page, titre: string): Locator {
  return page.getByRole("button", { name: nomDuRepli(titre), exact: true }).locator("> span");
}

async function boite(
  cible: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const mesure = await cible.boundingBox();
  if (mesure === null) {
    throw new Error("Élément sans boîte : il n'est pas rendu.");
  }
  return mesure;
}

/** Durées calculées, en millisecondes, des mouvements que la spec nomme, à la largeur courante. */
async function dureesALEcranLarge(page: Page): Promise<Record<string, number>> {
  await ouvrirLeMenu(page, "Carnet 1");
  const durees = {
    apparition: await style(page.getByRole("main").locator("> div").first(), "animation-duration"),
    depliage: await style(rangeeDe(page, TITRE_DE_5).locator("xpath=.."), "animation-duration"),
    actions: await style(actionsDeRangee(page, "Carnet 1"), "transition-duration"),
    chevron: await style(chevronDe(page, TITRE_DE_5), "transition-duration"),
    menu: await style(page.getByRole("menu"), "animation-duration"),
    infobulle: "",
    delaiDeLInfobulle: "",
  };
  await toutRefermer(page);
  // L'infobulle du titre coupé : elle se montre au survol, hors de l'arbre d'accessibilité.
  await lienDePage(page, TITRE_DE_200).hover();
  const infobulle = rangeeDe(page, TITRE_DE_200).locator('[data-infobulle="titre"]');
  await expect(infobulle).toHaveText(TITRE_DE_200);
  durees.infobulle = await style(infobulle, "transition-duration");
  durees.delaiDeLInfobulle = await style(infobulle, "transition-delay");
  expect(await style(infobulle, "transition-property")).toBe("opacity");
  await page.mouse.move(700, 500);
  return Object.fromEntries(
    Object.entries(durees).map(([nom, duree]) => [nom, enMillisecondes(duree)]),
  );
}

async function dureesALEcranEtroit(page: Page): Promise<Record<string, number>> {
  await montrerLaBarre(page);
  const durees = {
    tiroir: enMillisecondes(await style(tiroir(page), "transition-duration")),
    voile: enMillisecondes(await style(voile(page), "transition-duration")),
  };
  await toutRefermer(page);
  return durees;
}

test("F-004-AC22 F-004-AC49 à 1280, sans émulation : fond de la page et contour de focus aux jetons, durées de l'apparition, du dépliage, des actions de rangée, du chevron de repli, du menu et de l'infobulle égales à leurs jetons ; à 360, celles du tiroir et du voile", async ({
  page,
}) => {
  await largeur(page, LARGE);
  await construireLArborescence(page);

  expect(await style(page.locator(":root"), "background-color")).toBe(
    await couleurDuJeton(page, "--color-surface-application"),
  );
  expect(await style(page.locator(":root"), "color-scheme")).toBe("dark");
  // Depuis F-003, la zone principale porte l'éditeur : la navigation part d'un point de la barre.
  await barreLaterale(page).click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("Tab");
  const commande = page.locator(":focus");
  await expect(commande).toHaveCount(1);
  expect(await barreLaterale(page).locator(":focus").count()).toBe(1);
  expect(await style(commande, "outline-color")).toBe(
    await couleurDuJeton(page, "--color-repere-focus"),
  );
  expect(await style(commande, "outline-style")).toBe("solid");
  expect(await style(commande, "outline-width")).toBe(await jeton(page, "--epaisseur-contour"));

  const rapide = enMillisecondes(await jeton(page, "--duree-rapide"));
  const moyenne = enMillisecondes(await jeton(page, "--duree-moyenne"));
  const lente = enMillisecondes(await jeton(page, "--duree-lente"));
  expect([rapide, moyenne, lente].every((duree) => duree > 0)).toBe(true);
  expect(new Set([rapide, moyenne, lente]).size).toBe(3);
  expect(await style(chevronDe(page, TITRE_DE_5), "transition-property")).toBe("transform");
  expect(await style(page.getByRole("main").locator("> div").first(), "animation-name")).toBe(
    "apparition",
  );
  expect(await style(rangeeDe(page, TITRE_DE_5).locator("xpath=.."), "animation-name")).toBe(
    "depliage",
  );
  expect(await style(actionsDeRangee(page, "Carnet 1"), "transition-property")).toBe("opacity");
  expect(await dureesALEcranLarge(page)).toEqual({
    apparition: moyenne,
    depliage: rapide,
    actions: rapide,
    chevron: rapide,
    menu: rapide,
    infobulle: rapide,
    delaiDeLInfobulle: lente,
  });
  await largeur(page, ETROIT);
  expect(await dureesALEcranEtroit(page)).toEqual({ tiroir: moyenne, voile: moyenne });
});

test("F-004-AC22 F-004-AC49 mouvement réduit émulé : à 1280, la durée de l'apparition, du dépliage, des actions de rangée, du chevron de repli, du menu et de l'infobulle est nulle ; à 360, celle du tiroir et du voile ; rien n'attend une animation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await largeur(page, LARGE);
  await construireLArborescence(page);

  expect(await jeton(page, "--duree-rapide")).toBe("0ms");
  expect(await jeton(page, "--duree-moyenne")).toBe("0ms");
  expect(await dureesALEcranLarge(page)).toEqual({
    apparition: 0,
    depliage: 0,
    actions: 0,
    chevron: 0,
    menu: 0,
    infobulle: 0,
    delaiDeLInfobulle: 0,
  });
  await largeur(page, ETROIT);
  expect(await dureesALEcranEtroit(page)).toEqual({ tiroir: 0, voile: 0 });
  await montrerLaBarre(page);
  await expect(tiroir(page)).toBeVisible();
  expect(await style(tiroir(page), "opacity")).toBe("1");
});

for (const pixels of [ETROIT, 768, LARGE]) {
  test(`F-004-AC24 à ${pixels}, la rangée au titre de 200 caractères a la hauteur de celle au titre de 5 caractères, sur une seule ligne`, async ({
    page,
  }) => {
    await largeur(page, LARGE);
    await construireLArborescence(page);
    // Un titre long fait de mots : sans coupure, lui se replierait sur plusieurs lignes.
    await creerPageNommee(page, TITRE_EN_MOTS);
    await largeur(page, pixels);
    await montrerLaBarre(page);

    const longue = await boite(rangeeDe(page, TITRE_DE_200));
    const courte = await boite(rangeeDe(page, TITRE_DE_5));
    expect(longue.height).toBe(courte.height);
    expect(longue.height).toBeGreaterThan(0);
    expect((await boite(rangeeDe(page, TITRE_EN_MOTS))).height).toBe(courte.height);
    for (const titre of [TITRE_DE_200, TITRE_EN_MOTS]) {
      const lien = lienDePage(page, titre);
      expect(
        await Promise.all(
          ["white-space", "text-overflow", "overflow-x"].map((propriete) => style(lien, propriete)),
        ),
      ).toEqual(["nowrap", "ellipsis", "hidden"]);
      const coupe = await lien.evaluate((element) => element.scrollWidth > element.clientWidth);
      expect(coupe, `le titre « ${titre.slice(0, 12)}… » est coupé`).toBe(true);
    }
    const hauteurs = await barreLaterale(page)
      .locator("li > div")
      .evaluateAll((rangees) => [...new Set(rangees.map((rangee) => rangee.clientHeight))]);
    expect(hauteurs).toEqual([longue.height]);
    await expect(lienDePage(page, TITRE_DE_200)).toHaveAccessibleName(TITRE_DE_200);
    if (pixels >= LARGE) {
      expect((await boite(lienDePage(page, TITRE_DE_200))).width).toBeGreaterThanOrEqual(HUIT_REM);
      expect((await boite(lienDePage(page, "Carnet 1"))).width).toBeGreaterThanOrEqual(HUIT_REM);
    }
  });
}

test("F-004-AC25 à 1280, les actions de rangée ont une opacité nulle au repos, non nulle au survol puis au focus clavier, sans que le titre bouge", async ({
  page,
}) => {
  await largeur(page, LARGE);
  await construireLArborescence(page);
  const titre = lienDePage(page, "Carnet 3");
  const actions = actionsDeRangee(page, "Carnet 3");
  const opacite = (): Promise<string> => style(actions, "opacity");

  await page.mouse.move(700, 500);
  await expect.poll(opacite).toBe("0");
  const auRepos = await boite(titre);
  await expect(actions.getByRole("button")).toHaveCount(2);

  await rangeeDe(page, "Carnet 3").hover();
  await expect.poll(opacite).toBe("1");
  expect(await boite(titre)).toEqual(auRepos);

  await page.mouse.move(700, 500);
  await expect.poll(opacite).toBe("0");
  await lienDePage(page, "Carnet 2").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(titre).toBeFocused();
  await expect.poll(opacite).toBe("1");
  expect(await boite(titre)).toEqual(auRepos);
});

for (const pixels of [ETROIT, LARGE]) {
  test(`F-004-AC28 F-004-AC30 à ${pixels}, la page courante porte un repère peint, et la tête de la barre reste dans la fenêtre quand l'arborescence défile`, async ({
    page,
  }) => {
    await largeur(page, LARGE);
    await construireLArborescence(page);
    await largeur(page, pixels);
    await montrerLaBarre(page);

    // Le repère est trouvé par ce qu'il peint, non par sa classe : dans l'arborescence, un seul
    // élément a une image de fond, celle du dégradé d'accent, et il est dans la rangée courante.
    const peints = await barreLaterale(page)
      .locator("ul *")
      .evaluateAll((elements) =>
        elements
          .filter((element) => getComputedStyle(element).backgroundImage !== "none")
          .map((element) => {
            const mesure = element.getBoundingClientRect();
            return {
              image: getComputedStyle(element).backgroundImage,
              largeur: mesure.width,
              hauteur: mesure.height,
              decoratif: element.getAttribute("aria-hidden"),
              titre: element.closest("li")?.querySelector('a[aria-current="page"]')?.textContent,
            };
          }),
      );
    expect(peints).toHaveLength(1);
    const repere = peints[0];
    expect(repere?.largeur).toBeGreaterThan(0);
    expect(repere?.hauteur).toBeGreaterThan(0);
    expect(repere?.image).toBe(await imageDuJeton(page, "--degrade-accent"));
    expect(repere?.decoratif).toBe("true");
    expect(repere?.titre).toBe(TITRE_DU_NIVEAU_12);
    await expect(barreLaterale(page).locator('[aria-current="page"]')).toHaveCount(1);

    const defilement = barreLaterale(page).locator("ul").locator("xpath=..");
    const avant = await boite(boutonNouvellePage(page));
    const course = await defilement.evaluate((zone) => {
      zone.scrollTop = zone.scrollHeight;
      return [zone.scrollTop, zone.scrollHeight - zone.clientHeight];
    });
    expect(course[0]).toBeGreaterThan(0);
    expect(course[0]).toBe(course[1]);
    expect(await boite(boutonNouvellePage(page))).toEqual(avant);
    expect(avant.y).toBeGreaterThanOrEqual(0);
    await expect(boutonNouvellePage(page)).toBeInViewport({ ratio: 1 });
    // Pas de pied avant F-007 : la barre finit par l'arborescence, dont le bas reste dans la fenêtre.
    const zone = await boite(defilement);
    expect(zone.y + zone.height).toBeLessThanOrEqual(800);
    expect(await barreLaterale(page).evaluate((barre) => barre.lastElementChild?.tagName)).toBe(
      "DIV",
    );
    await expect(lienDePage(page, "Carnet 14")).toBeInViewport();
  });
}

for (const pixels of [320, LARGE]) {
  test(`F-004-AC39 à ${pixels}, page de niveau 12 : le fil tient sur une ligne dans la barre du haut, la racine et la page courante y sont visibles, et la commande ouvre la liste des ancêtres repliés`, async ({
    page,
  }) => {
    await largeur(page, LARGE);
    await construireLArborescence(page);
    await largeur(page, pixels);

    const barreDuHaut = await boite(page.getByRole("banner"));
    const ligne = await boite(fil(page));
    expect(ligne.height).toBeLessThanOrEqual(barreDuHaut.height);
    expect(ligne.x).toBeGreaterThanOrEqual(barreDuHaut.x);
    expect(ligne.x + ligne.width).toBeLessThanOrEqual(barreDuHaut.x + barreDuHaut.width);
    // Une seule ligne : les éléments du fil sont centrés sur la même horizontale, dans la barre.
    const milieux = await fil(page)
      .locator("ol > li")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const rectangle = element.getBoundingClientRect();
          return Math.round(rectangle.top + rectangle.height / 2);
        }),
      );
    expect(milieux).toHaveLength(3);
    expect(new Set(milieux).size).toBe(1);
    expect(milieux[0]).toBe(Math.round(barreDuHaut.y + barreDuHaut.height / 2));
    expect(await style(fil(page).locator('[aria-current="page"]'), "white-space")).toBe("nowrap");

    const racine = fil(page).getByRole("link", { name: TITRE_DE_200, exact: true });
    const courante = fil(page).locator('[aria-current="page"]');
    await expect(racine).toBeInViewport();
    await expect(courante).toBeInViewport();
    await expect(courante).toHaveText(TITRE_DU_NIVEAU_12);
    for (const element of [racine, courante]) {
      const mesure = await boite(element);
      expect(mesure.width).toBeGreaterThanOrEqual(44);
      expect(mesure.x + mesure.width).toBeLessThanOrEqual(barreDuHaut.x + barreDuHaut.width);
    }

    const commande = fil(page).getByRole("button", { name: "Afficher les pages intermédiaires" });
    await commande.click();
    await expect(commande).toHaveAttribute("aria-expanded", "true");
    const intermediaires = fil(page).locator("ul").getByRole("link");
    await expect(intermediaires).toHaveCount(10);
    await expect(intermediaires.first()).toBeInViewport();
    await expect(intermediaires.first()).toHaveText(TITRE_DE_5);
    await constaterSansDefilementHorizontal(page, `liste des ancêtres ouverte à ${pixels}`);

    await intermediaires.first().click();
    await expect(titrePrincipal(page)).toHaveText(TITRE_DE_5);
    await expect(fil(page).locator('[aria-current="page"]')).toHaveText(TITRE_DE_5);
  });
}

// F-004-AC48 : le halo est le premier enfant, décoratif, de la tête de la zone principale. Il est
// peint par son jeton, immobile, et un clic le traverse : sur le titre, puis en un point du halo que
// rien d'autre ne couvre, où le clic atteint la tête de zone placée dessous, jamais le halo.
async function constaterLeHalo(page: Page): Promise<void> {
  const halo = page.getByRole("main").locator("[aria-hidden='true']").first();
  expect(await style(halo, "background-image")).toBe(await imageDuJeton(page, "--degrade-halo"));
  expect(await style(halo, "pointer-events")).toBe("none");
  expect(await style(halo, "animation-name")).toBe("none");
  expect(enMillisecondes(await style(halo, "transition-duration"))).toBe(0);
  expect(await style(halo, "position")).toBe("absolute");
  const surface = await boite(halo);
  const titre = await boite(titrePrincipal(page));
  const surLeTitre = { x: titre.x + 10, y: titre.y + titre.height / 2 };
  const aCote = { x: surface.x + surface.width - 4, y: surface.y + 4 };
  for (const point of [surLeTitre, aCote]) {
    expect(point.x).toBeGreaterThan(surface.x);
    expect(point.x).toBeLessThan(surface.x + surface.width);
    expect(point.y).toBeGreaterThan(surface.y);
    expect(point.y).toBeLessThan(surface.y + surface.height);
  }
  await page.getByRole("main").evaluate((zone) => {
    zone.addEventListener("click", ({ target }) => {
      const cible = target instanceof Element ? target : zone;
      const nature = cible.matches("h1")
        ? "titre"
        : (cible.getAttribute("aria-hidden") ?? "dessous");
      zone.setAttribute("data-clics", `${zone.getAttribute("data-clics") ?? ""}${nature} `);
    });
  });
  await page.mouse.click(surLeTitre.x, surLeTitre.y);
  await page.mouse.click(aCote.x, aCote.y);
  await expect(page.getByRole("main")).toHaveAttribute("data-clics", "titre dessous ");
}

for (const pixels of [ETROIT, LARGE]) {
  test(`F-004-AC40 F-004-AC48 F-030-AC29 à ${pixels}, écran (b) : la zone d'état dit « Enregistré sur cet appareil » avec son repère, rien d'autre ne dit « enregistré », le halo est peint en tête de zone et un clic le traverse jusqu'au titre`, async ({
    page,
  }) => {
    await largeur(page, LARGE);
    await construireUnePage(page);
    await largeur(page, pixels);

    await expect(zoneDEtat(page)).toHaveCount(1);
    await expect(zoneDEtat(page)).toHaveText("Enregistré sur cet appareil");
    expect(await zoneDEtat(page).evaluate((zone) => zone.childElementCount)).toBe(1);
    expect((await boite(zoneDEtat(page).locator("span"))).width).toBeGreaterThan(0);
    expect((await page.locator("body").innerText()).match(/nregistr/g)).toHaveLength(1);
    await expect(page.getByRole("alert")).toHaveCount(0);

    await constaterLeHalo(page);
  });

  test(`F-004-AC40 à ${pixels}, écran (h), IndexedDB indisponible avant le chargement : la zone d'état dit l'échec sur une ligne dans la barre du haut, l'avertissement de F-002 est visible`, async ({
    page,
  }) => {
    await largeur(page, LARGE);
    await construireLEchecDePersistance(page);
    await largeur(page, pixels);

    await expect(zoneDEtat(page)).toHaveText("Non enregistré sur cet appareil");
    await expect(zoneDEtat(page)).toBeInViewport({ ratio: 1 });
    const zone = await boite(zoneDEtat(page));
    const barreDuHaut = await boite(page.getByRole("banner"));
    expect(zone.height).toBeLessThan(barreDuHaut.height);
    expect(zone.x + zone.width).toBeLessThanOrEqual(barreDuHaut.x + barreDuHaut.width);
    expect(await style(zoneDEtat(page), "white-space")).toBe("nowrap");
    const repere = await boite(zoneDEtat(page).locator("span"));
    expect(repere.width).toBeGreaterThan(0);
    await expect(page.getByRole("alert")).toBeInViewport();
    await expect(page.getByRole("alert")).toContainText(
      "Stockage de l'appareil indisponible : vos modifications ne sont pas encore enregistrées.",
    );
    expect(await page.locator("body").innerText()).not.toMatch(
      /Enregistré|Modifications enregistrées/,
    );
  });
}

for (const pixels of [LARGE, ETROIT]) {
  test(`F-004-AC54 à ${pixels}, naviguer par le fragment puis par le bouton précédent vers une page de niveau 3 cachée sous sa racine repliée : sa rangée est courante, ses deux ancêtres dépliés, le fil les liste`, async ({
    page,
  }) => {
    await largeur(page, LARGE);
    await construireUnePage(page, "Racine");
    await activerActionDeRangee(page, "ajouter-une-sous-page", "Racine");
    await saisirTitre(page, "Fille");
    await activerActionDeRangee(page, "ajouter-une-sous-page", "Fille");
    await saisirTitre(page, "Petite-fille");
    const adresse = (await lienDePage(page, "Petite-fille").getAttribute("href")) ?? "";
    await creerPageNommee(page, "Autre");
    await largeur(page, pixels);

    const constater = async (): Promise<void> => {
      await expect(titrePrincipal(page)).toHaveText("Petite-fille");
      await expect(fil(page).getByRole("link")).toHaveText(
        pixels >= LARGE ? ["Racine", "Fille"] : ["Racine"],
      );
      await expect(fil(page).locator('[aria-current="page"]')).toHaveText("Petite-fille");
      await montrerLaBarre(page);
      await expect(lienDePage(page, "Petite-fille")).toBeVisible();
      await expect(lienDePage(page, "Petite-fille")).toHaveAttribute("aria-current", "page");
      for (const ancetre of ["Racine", "Fille"]) {
        await expect(
          page.getByRole("button", { name: nomDuRepli(ancetre), exact: true }),
        ).toHaveAttribute("aria-expanded", "true");
      }
    };
    const choisirAutreEtReplier = async (): Promise<void> => {
      await montrerLaBarre(page);
      await lienDePage(page, "Autre").click();
      await expect(titrePrincipal(page)).toHaveText("Autre");
      await montrerLaBarre(page);
      await basculerRepli(page, "replier", "Racine");
      await expect(lienDePage(page, "Petite-fille")).toHaveCount(0);
      await toutRefermer(page);
    };

    await choisirAutreEtReplier();
    await page.evaluate((fragment) => {
      window.location.hash = fragment;
    }, adresse);
    await constater();

    await choisirAutreEtReplier();
    await page.goBack();
    await constater();
  });
}
