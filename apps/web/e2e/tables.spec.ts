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

// F-038 : l'ajout de colonne est découvrable. Les mesures se prennent dans le navigateur : la boîte,
// la fenêtre et le recouvrement ne se voient pas sous jsdom.
const LARGEURS_DE_FENETRE = [1280, 360] as const;
const HAUTEUR_DE_FENETRE = 800;

async function creerUneTableVide(page: Page, titre: string): Promise<void> {
  await ouvrir(page);
  await page.getByRole("button", { name: "Nouvelle table", exact: true }).click();
  await saisirTitre(page, titre);
  await expect(lienDeTable(page, titre)).toBeVisible();
}

interface MesureDuBouton {
  readonly nombre: number;
  readonly desactive: boolean;
  readonly largeur: number;
  readonly hauteur: number;
  readonly dansLaFenetre: boolean;
  readonly libre: boolean;
}

/** Boîte, fenêtre et recouvrement du bouton de nom exact donné (le premier, s'il y en a plusieurs). */
async function mesurerLeBouton(page: Page, nom: string): Promise<MesureDuBouton> {
  const boutons = page.getByRole("button", { name: nom, exact: true });
  const nombre = await boutons.count();
  if (nombre === 0) {
    return {
      nombre,
      desactive: true,
      largeur: 0,
      hauteur: 0,
      dansLaFenetre: false,
      libre: false,
    };
  }
  return boutons.first().evaluate((element, total) => {
    const boite = element.getBoundingClientRect();
    const centre = document.elementFromPoint(
      boite.left + boite.width / 2,
      boite.top + boite.height / 2,
    );
    return {
      nombre: total,
      desactive: (element as HTMLButtonElement).disabled,
      largeur: boite.width,
      hauteur: boite.height,
      dansLaFenetre:
        boite.left >= 0 &&
        boite.top >= 0 &&
        boite.right <= window.innerWidth &&
        boite.bottom <= window.innerHeight,
      libre: centre !== null && element.contains(centre),
    };
  }, nombre);
}

test("F-038-AC1 la table sans colonne, puis la colonne « zer » : le bouton « Ajouter une colonne » est exposé, actif, de boîte non nulle, dans la fenêtre et non recouvert, à 1280 et à 360", async ({
  page,
}) => {
  await creerUneTableVide(page, "Sans titre");
  await ajouterUneColonne(page, "zer", "Texte");
  await expect(cellule(page, 1, 2)).toHaveText(/zer/);
  for (const largeur of LARGEURS_DE_FENETRE) {
    await page.setViewportSize({ width: largeur, height: HAUTEUR_DE_FENETRE });
    const bouton = page.getByRole("button", { name: "Ajouter une colonne", exact: true }).first();
    await bouton.scrollIntoViewIfNeeded();
    const mesure = await mesurerLeBouton(page, "Ajouter une colonne");
    // Un message par mesure : le résultat de chaque mesure est consigné dans la traçabilité.
    expect(mesure.nombre, `${String(largeur)} px : bouton exposé`).toBeGreaterThan(0);
    expect(mesure.desactive, `${String(largeur)} px : non désactivé`).toBe(false);
    expect(
      mesure.largeur > 0 && mesure.hauteur > 0,
      `${String(largeur)} px : boîte non nulle`,
    ).toBe(true);
    expect(mesure.dansLaFenetre, `${String(largeur)} px : dans la fenêtre`).toBe(true);
    expect(mesure.libre, `${String(largeur)} px : non recouvert`).toBe(true);
  }
});

const NOM_DU_PLUS = "Ajouter une colonne à droite";

/** Table de `nombre` colonnes, bâtie sur grand écran (la barre latérale s'y voit), puis mise à la largeur. */
async function creerUneTableDeColonnes(
  page: Page,
  nombre: number,
  largeur: number = LARGEURS_DE_FENETRE[0],
): Promise<void> {
  await creerUneTableVide(page, "Large");
  for (let rang = 1; rang <= nombre; rang += 1) {
    await ajouterUneColonne(page, `C${String(rang)}`, "Texte");
  }
  await expect(grille(page)).toHaveAttribute("aria-colcount", String(nombre + 1));
  await page.setViewportSize({ width: largeur, height: HAUTEUR_DE_FENETRE });
}

/** Fait défiler la zone de la grille à son extrémité droite (ou à gauche), dans sa propre zone. */
async function defilerLaGrille(page: Page, finale: boolean): Promise<void> {
  await grille(page)
    .locator("> div")
    .evaluate((zone, aDroite) => {
      zone.scrollLeft = aDroite ? zone.scrollWidth : 0;
    }, finale);
}

interface PositionDuPlus {
  readonly plus: { x: number; y: number; width: number; height: number };
  readonly dernier: { x: number; y: number; width: number; height: number };
  readonly fenetre: { largeur: number; hauteur: number };
  readonly page: { contenu: number };
}

async function positionDuPlus(page: Page): Promise<PositionDuPlus> {
  const plus = await page.getByRole("button", { name: NOM_DU_PLUS, exact: true }).boundingBox();
  const dernier = await grille(page).getByRole("columnheader").last().boundingBox();
  if (plus === null || dernier === null) {
    throw new Error("Le « + » ou le dernier en-tête n'est pas affiché.");
  }
  return {
    plus,
    dernier,
    fenetre: await page.evaluate(() => ({
      largeur: window.innerWidth,
      hauteur: window.innerHeight,
    })),
    page: await page.evaluate(() => ({ contenu: document.documentElement.scrollWidth })),
  };
}

test("F-038-AC3 trois colonnes A, B, C par la barre d'outils : trois en-têtes dans l'ordre, la commande reste disponible, aria-colcount exact", async ({
  page,
}) => {
  await creerUneTableVide(page, "Trois");
  for (const nom of ["A", "B", "C"]) {
    await ajouterUneColonne(page, nom, "Texte");
    await expect(
      page.getByRole("button", { name: "Ajouter une colonne", exact: true }).first(),
    ).toBeEnabled();
  }
  await expect(grille(page).getByRole("columnheader")).toHaveText(["", /^A/, /^B/, /^C/]);
  await expect(grille(page)).toHaveAttribute("aria-colcount", "4");
});

for (const colonnes of [3, 12]) {
  for (const largeur of LARGEURS_DE_FENETRE) {
    test(`F-038-AC4 F-038-AC11 « + » après le dernier en-tête, dans la fenêtre, aligné sur la rangée, sans défilement de la page : ${String(colonnes)} colonnes à ${String(largeur)} px`, async ({
      page,
    }) => {
      await creerUneTableDeColonnes(page, colonnes, largeur);
      const nom = page.getByRole("button", { name: NOM_DU_PLUS, exact: true });
      await expect(nom).toBeVisible();
      for (const finale of [false, true]) {
        await defilerLaGrille(page, finale);
        const mesure = await positionDuPlus(page);
        const { plus, dernier, fenetre } = mesure;
        expect(plus.x, "dans la fenêtre, à gauche").toBeGreaterThanOrEqual(0);
        expect(plus.x + plus.width, "dans la fenêtre, à droite").toBeLessThanOrEqual(
          fenetre.largeur,
        );
        // Même axe vertical que la rangée d'en-têtes, à 1 pixel près.
        expect(
          Math.abs(plus.y + plus.height / 2 - (dernier.y + dernier.height / 2)),
        ).toBeLessThanOrEqual(1);
        if (finale) {
          // Fin de défilement : le dernier en-tête est entier, à gauche du « + ».
          expect(dernier.x + dernier.width).toBeLessThanOrEqual(plus.x + 1);
        }
        expect(mesure.page.contenu, "la page ne défile pas en largeur").toBeLessThanOrEqual(
          fenetre.largeur,
        );
      }
      if (colonnes === 3 && largeur === 1280) {
        await defilerLaGrille(page, false);
        const { plus, dernier } = await positionDuPlus(page);
        // Juste après la dernière colonne.
        expect(plus.x - (dernier.x + dernier.width)).toBeGreaterThanOrEqual(-1);
        expect(plus.x - (dernier.x + dernier.width)).toBeLessThanOrEqual(2);
      }
    });
  }
}

test("F-038-AC5 le « + » mesure au moins 44 pixels à 360 avec un pointeur imprécis, et au moins 24 de large sinon", async ({
  browser,
  baseURL,
  page,
}) => {
  await creerUneTableDeColonnes(page, 2);
  const compact = await page.getByRole("button", { name: NOM_DU_PLUS, exact: true }).boundingBox();
  expect(compact?.width ?? 0).toBeGreaterThanOrEqual(24);
  expect(compact?.height ?? 0).toBeLessThanOrEqual(32);

  const contexte = await browser.newContext({
    ...(baseURL === undefined ? {} : { baseURL }),
    hasTouch: true,
    isMobile: true,
    viewport: { width: LARGEURS_DE_FENETRE[0], height: HAUTEUR_DE_FENETRE },
  });
  const tactile = await contexte.newPage();
  await creerUneTableDeColonnes(tactile, 2, 360);
  expect(await tactile.evaluate(() => window.matchMedia("(pointer: coarse)").matches)).toBe(true);
  const grand = await tactile.getByRole("button", { name: NOM_DU_PLUS, exact: true }).boundingBox();
  expect(grand?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(grand?.height ?? 0).toBeGreaterThanOrEqual(44);
  await contexte.close();
});

test("F-038-AC7 F-038-AC8 avec 12 colonnes, la 13e ajoutée par le « + » est focalisée, entièrement visible, annoncée ; Échap rend le focus au « + » ; le « + » se tabule juste après la grille", async ({
  page,
}) => {
  await creerUneTableDeColonnes(page, 12, 360);
  const plus = page.getByRole("button", { name: NOM_DU_PLUS, exact: true });

  await plus.click();
  const boite = page.getByRole("dialog", { name: "Nouvelle colonne" });
  await page.keyboard.press("Escape");
  await expect(boite).toBeHidden();
  await expect(plus).toBeFocused();

  await plus.click();
  await boite.getByRole("textbox", { name: "Nom de la colonne" }).fill("Dernière");
  await boite.getByRole("button", { name: "Créer la colonne" }).click();
  const enTete = cellule(page, 1, 14);
  await expect(enTete).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: "Colonne Dernière ajoutée" })).toHaveText(
    "Colonne Dernière ajoutée, position 13 sur 13.",
  );
  const { plus: boitePlus, dernier, fenetre } = await positionDuPlus(page);
  expect(dernier.x).toBeGreaterThanOrEqual(0);
  expect(dernier.x + dernier.width, "entièrement visible, à gauche du « + »").toBeLessThanOrEqual(
    Math.min(fenetre.largeur, boitePlus.x + 1),
  );

  await page.keyboard.press("Tab");
  await expect(plus).toBeFocused();
});
