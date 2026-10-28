// Écrans de référence de F-004 (spec, « écrans de référence »), bâtis par l'interface elle-même,
// et mesures communes des scénarios [navigateur]. Aucun test ici.
import {
  type Browser,
  type BrowserContext,
  expect,
  type Locator,
  type Page,
} from "@playwright/test";

import {
  activerActionDeRangee,
  barreLaterale,
  boutonDuMenu,
  creerPageNommee,
  lienDePage,
  menuDePage,
  nomAjouterSousPage,
  ouvrir,
  saisirTitre,
  titrePrincipal,
} from "./aides.ts";
import { HAUTEUR_DE_FENETRE } from "./captures-attendues.ts";

export const LARGEURS_DE_REFERENCE = [320, 360, 768, 1024, 1280, 1920] as const;
export const OUVRIR_LA_BARRE = "Ouvrir la barre latérale";
export const FERMER_LA_BARRE = "Fermer la barre latérale";
const NIVEAUX = 12;
const AUTRES_RACINES = 14;
const LONGUEUR_MAX = 200;
/** Forme d'UUID canonique, que nulle page ne porte. */
const PAGE_ABSENTE = "5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e";

/** Titres des douze niveaux : 200 caractères sans espace aux niveaux 1, 6 et 12, 5 au niveau 2. */
export const TITRES_DES_NIVEAUX: readonly string[] = Array.from({ length: NIVEAUX }, (_, rang) => {
  const longs: Readonly<Record<number, string>> = { 1: "M", 6: "W", 12: "m" };
  const lettre = longs[rang + 1];
  if (lettre !== undefined) {
    return lettre.repeat(LONGUEUR_MAX);
  }
  return rang === 1 ? "Notes" : `Niveau ${rang + 1}`;
});
export const TITRE_DE_200 = TITRES_DES_NIVEAUX[0] ?? "";
export const TITRE_DE_5 = TITRES_DES_NIVEAUX[1] ?? "";
export const TITRE_DU_NIVEAU_12 = TITRES_DES_NIVEAUX[NIVEAUX - 1] ?? "";

export function boutonDOuverture(page: Page): Locator {
  return page.getByRole("button", { name: OUVRIR_LA_BARRE, exact: true });
}

/** Vrai si la fenêtre est plus étroite que le seuil, d'après le jeton lu sur la racine. */
export function estEtroite(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const seuil = getComputedStyle(document.documentElement).getPropertyValue(
      "--breakpoint-etroit",
    );
    return !window.matchMedia(`(width >= ${seuil.trim()})`).matches;
  });
}

/** Fixe la largeur de la fenêtre et attend que la coquille, si elle est rendue, l'ait suivie. */
export async function largeur(page: Page, pixels: number): Promise<void> {
  await page.setViewportSize({ width: pixels, height: HAUTEUR_DE_FENETRE });
  if ((await page.getByRole("banner").count()) > 0) {
    await expect(boutonDOuverture(page)).toHaveCount((await estEtroite(page)) ? 1 : 0);
  }
}

export function tiroir(page: Page): Locator {
  return page.getByRole("dialog", { name: "Barre latérale", exact: true });
}

export function voile(page: Page): Locator {
  return page.locator("[data-voile]");
}

export function fil(page: Page): Locator {
  return page.getByRole("navigation", { name: "Fil d'Ariane", exact: true });
}

/**
 * Conteneur des deux actions de la rangée, dont l'opacité les révèle : trouvé par le bouton
 * « Ajouter une sous-page » qu'il porte, non par une classe de style.
 */
export function actionsDeRangee(page: Page, titre: string): Locator {
  return page
    .getByRole("button", { name: nomAjouterSousPage(titre), exact: true })
    .locator("xpath=..");
}

export function zoneDEtat(page: Page): Locator {
  return page.getByRole("banner").getByRole("status");
}

/**
 * Attend la fin des mouvements en cours dans la cible et sous elle. Une boîte mesurée sous une
 * transformation en cours est rendue à une fraction de pixel près : une mesure exacte attend donc
 * l'état final. Sous mouvement réduit, les durées sont nulles et rien n'est attendu.
 */
export async function attendreLaFinDesMouvements(cible: Locator): Promise<void> {
  await cible.evaluate(async (element) => {
    const enCours = element
      .getAnimations({ subtree: true })
      .filter((mouvement) => mouvement.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.allSettled(enCours.map((mouvement) => mouvement.finished));
  });
}

/**
 * Sur écran étroit, ouvre le tiroir s'il est fermé ; sans effet sur écran large. Rend la main une
 * fois le tiroir immobile : son entrée, et le dépliage que ses rangées de sous-page rejouent quand
 * leur conteneur cesse d'être en `display: none`, sont finis.
 */
export async function montrerLaBarre(page: Page): Promise<void> {
  const ouverture = boutonDOuverture(page);
  if (
    (await ouverture.count()) > 0 &&
    (await ouverture.getAttribute("aria-expanded")) === "false"
  ) {
    await ouverture.click();
    await expect(tiroir(page)).toBeVisible();
    await attendreLaFinDesMouvements(tiroir(page));
  }
}

/** Referme ce qui est ouvert : liste du fil d'Ariane, menu, saisie, tiroir. */
export async function toutRefermer(page: Page): Promise<void> {
  const listeDuFil = page.getByRole("banner").locator("ul");
  for (const ouvert of [
    listeDuFil,
    page.getByRole("menu"),
    page.getByRole("textbox", { name: "Titre de la page" }),
    tiroir(page),
  ]) {
    if ((await ouvert.count()) > 0) {
      await page.keyboard.press("Escape");
      await expect(ouvert).toHaveCount(0);
    }
  }
}

/** Écran (b) : une page sélectionnée. La fenêtre doit être large pendant la construction. */
export async function construireUnePage(page: Page, titre = "Carnet de bord"): Promise<void> {
  await ouvrir(page);
  await creerPageNommee(page, titre);
  await expect(titrePrincipal(page)).toHaveText(titre);
}

/**
 * Écran (c) : douze niveaux, dont trois titres de 200 caractères sans espace, et assez de pages à
 * la racine pour que l'arborescence défile ; la page de niveau 12 est sélectionnée. La fenêtre doit
 * être large pendant la construction.
 */
export async function construireLArborescence(page: Page): Promise<void> {
  await ouvrir(page);
  await creerPageNommee(page, TITRE_DE_200);
  for (let rang = 1; rang < NIVEAUX; rang += 1) {
    await activerActionDeRangee(page, "ajouter-une-sous-page", TITRES_DES_NIVEAUX[rang - 1] ?? "");
    await saisirTitre(page, TITRES_DES_NIVEAUX[rang] ?? "");
  }
  for (let rang = 1; rang <= AUTRES_RACINES; rang += 1) {
    await creerPageNommee(page, `Carnet ${rang}`);
  }
  await lienDePage(page, TITRE_DU_NIVEAU_12).click();
  await expect(titrePrincipal(page)).toHaveText(TITRE_DU_NIVEAU_12);
  await expect(barreLaterale(page).getByRole("listitem")).toHaveCount(NIVEAUX + AUTRES_RACINES);
}

/**
 * Écran (k) : la vue calendrier d'une table de F-021 dont une ligne est datée du 15 octobre 2026, mois affiché (horloge figée)
 * et deux restent dans « Sans date ». La fenêtre doit être large pendant la construction, et la
 * table se crée par le menu de la barre latérale.
 */
export async function construireLeCalendrier(page: Page): Promise<void> {
  // Le mois affiché est celui de l'horloge : figée, il ne change pas la nuit du dernier jour du mois.
  await page.clock.setFixedTime(new Date("2026-10-08T12:00:00Z"));
  await ouvrir(page);
  await page.getByRole("button", { name: "Nouvelle table", exact: true }).click();
  await saisirTitre(page, "Agenda");
  await page.getByRole("button", { name: "Ajouter une colonne", exact: true }).first().click();
  const boite = page.getByRole("dialog", { name: "Nouvelle colonne" });
  await boite.getByRole("textbox", { name: "Nom de la colonne" }).fill("Date");
  await boite.getByRole("combobox", { name: "Type de la colonne" }).selectOption({ label: "Date" });
  await boite.getByRole("button", { name: "Créer la colonne" }).click();
  await expect(boite).toBeHidden();
  for (let rang = 0; rang < 3; rang += 1) {
    await page.getByRole("button", { name: "Nouvelle ligne", exact: true }).click();
  }
  await page
    .getByRole("group", { name: "Vue de la table" })
    .getByRole("button", { name: "Calendrier", exact: true })
    .click();
  const jour = "2026-10-15";
  const panneau = page.getByRole("region", { name: /^Sans date/ });
  await panneau.getByRole("button", { name: "Définir la date : Sans titre" }).first().click();
  const dialogue = page.getByRole("dialog");
  await dialogue.getByLabel("Date").fill(jour);
  await dialogue.getByRole("button", { name: "Valider" }).click();
  await expect(page.locator(`[role="gridcell"][data-jour="${jour}"] [data-ligne]`)).toHaveCount(1);
  await expect(panneau.locator("li")).toHaveCount(2);
}

/** Écran (d) : le menu « ⋯ » de la page courante, ouvert ; sur écran étroit, dans le tiroir. */
export async function ouvrirLeMenu(page: Page, titre: string): Promise<void> {
  await montrerLaBarre(page);
  await boutonDuMenu(page, titre).click();
  await expect(menuDePage(page, titre)).toBeVisible();
}

/** Écran (e) : le renommage sur place de la page, ouvert par F2 depuis son lien. */
export async function ouvrirLeRenommage(page: Page, titre: string): Promise<void> {
  await montrerLaBarre(page);
  await lienDePage(page, titre).focus();
  await page.keyboard.press("F2");
  await expect(page.getByRole("textbox", { name: "Titre de la page" })).toBeFocused();
}

/** Écran (g) : « Page introuvable », dans un espace qui a une page. */
export async function construirePageIntrouvable(page: Page): Promise<void> {
  await construireUnePage(page);
  await page.goto(`/#/page/${PAGE_ABSENTE}`);
  await expect(titrePrincipal(page)).toHaveText("Page introuvable");
}

/** Écran (h) : IndexedDB indisponible avant le chargement ; une page est créée en mémoire. */
export async function construireLEchecDePersistance(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true });
  });
  await construireUnePage(page);
  await expect(page.getByRole("alert")).toContainText("ne sont pas encore enregistrées");
}

/** Écran (i) : l'état de chargement, tenu par une ouverture d'IndexedDB qui ne répond pas. */
export async function construireLeChargement(page: Page): Promise<void> {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => ({}) as IDBOpenDBRequest;
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Chargement…");
}

/** Contexte tactile : sans survol, pointeur imprécis (essai B3 de la conception). */
export function contexteTactile(
  browser: Browser,
  baseURL: string | undefined,
  pixels: number,
): Promise<BrowserContext> {
  return browser.newContext({
    ...(baseURL === undefined ? {} : { baseURL }),
    hasTouch: true,
    isMobile: true,
    viewport: { width: pixels, height: HAUTEUR_DE_FENETRE },
  });
}

/** Un élément qui rogne ou fait défiler ce qui le dépasse en largeur, et ce qu'il contient. */
export interface Conteneur {
  readonly nom: string;
  /** Largeur de défilement et largeur intérieure : la première dépasse quand un contenu déborde. */
  readonly contenu: number;
  readonly largeur: number;
}

export interface Debordement {
  readonly contenu: number;
  readonly fenetre: number;
  /** `overflow-x` calculé de `html` et de `body` : `hidden` ou `clip` cacherait un débordement. */
  readonly masques: readonly string[];
  /**
   * Chaque élément rendu dont l'`overflow-x` calculé n'est pas `visible` : un débordement y est
   * rogné, ou défile, sans élargir le document. Deux sortes d'éléments en sont écartées, par leur
   * nature et non par leur nom : les textes coupés par des points de suspension, où déborder est le
   * rôle du texte, constaté à part (F-004-AC24), et les champs de saisie, qui font défiler leur
   * valeur.
   */
  readonly conteneurs: readonly Conteneur[];
}

/**
 * F-004-AC45 : largeurs de défilement, jamais les rectangles des éléments. Les conteneurs sont
 * trouvés par leur style calculé, non par une liste : le cadre de la coquille, la zone principale,
 * la zone de défilement de la barre latérale, le tiroir, et tout autre qui viendrait à rogner.
 */
export function debordement(page: Page): Promise<Debordement> {
  return page.evaluate(() => {
    const nomDe = (element: Element): string =>
      [
        element.tagName.toLowerCase(),
        element.getAttribute("role") ?? "",
        element.getAttribute("aria-label") ?? "",
        element.className.toString().split(" ").slice(0, 3).join("."),
      ]
        .filter((partie) => partie !== "")
        .join(" ");
    // Un élément masqué à l'écran mais lu par les technologies d'assistance (`sr-only` : 1 pixel,
    // découpé à rien) rogne son texte par construction ; il n'affiche rien et ne fait rien défiler.
    const masqueALEcran = (calcule: CSSStyleDeclaration): boolean =>
      calcule.clipPath === "inset(50%)" || calcule.clip === "rect(0px, 0px, 0px, 0px)";
    const rogne = (element: Element): boolean => {
      const calcule = getComputedStyle(element);
      const champ = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
      return (
        calcule.overflowX !== "visible" &&
        calcule.textOverflow !== "ellipsis" &&
        !champ &&
        !masqueALEcran(calcule) &&
        element.getClientRects().length > 0
      );
    };
    return {
      contenu: document.documentElement.scrollWidth,
      fenetre: document.documentElement.clientWidth,
      masques: [document.documentElement, document.body].map(
        (element) => getComputedStyle(element).overflowX,
      ),
      conteneurs: [...document.body.querySelectorAll("*")].filter(rogne).map((element) => ({
        nom: nomDe(element),
        contenu: element.scrollWidth,
        largeur: element.clientWidth,
      })),
    };
  });
}

/**
 * Ni le document ni aucun conteneur qui rogne ne porte un contenu plus large que lui. Dans la
 * coquille, le cadre et la zone principale rognent : constater le document seul n'y prouverait
 * rien, et la liste calculée doit donc les avoir trouvés.
 */
export async function constaterSansDefilementHorizontal(page: Page, ou: string): Promise<void> {
  const mesure = await debordement(page);
  expect(mesure.contenu, `défilement horizontal, ${ou}`).toBeLessThanOrEqual(mesure.fenetre);
  for (const masque of mesure.masques) {
    expect(["visible", "auto"], `overflow-x de la page, ${ou}`).toContain(masque);
  }
  expect(
    mesure.conteneurs.filter(({ contenu, largeur }) => contenu > largeur),
    `conteneurs dont le contenu déborde en largeur, ${ou}`,
  ).toEqual([]);
  if ((await page.getByRole("banner").count()) > 0) {
    const noms = mesure.conteneurs.map(({ nom }) => nom);
    expect(
      noms.filter((nom) => nom.startsWith("main")).length,
      `la zone principale rogne : elle est mesurée, ${ou} : ${noms.join(" | ")}`,
    ).toBeGreaterThanOrEqual(1);
    expect(noms.length, `conteneurs qui rognent, ${ou}`).toBeGreaterThan(1);
  }
}

/** Valeur calculée d'une propriété CSS de l'élément. */
export function style(cible: Locator, propriete: string): Promise<string> {
  return cible.evaluate(
    (element, nom) => getComputedStyle(element).getPropertyValue(nom).trim(),
    propriete,
  );
}

/** Valeur d'un jeton, lue sur la racine du document. */
export function jeton(page: Page, nom: string): Promise<string> {
  return style(page.locator(":root"), nom);
}

const MILLISECONDES_PAR_SECONDE = 1000;

/** Durée calculée (« 0.12s », « 120ms ») en millisecondes ; la plus longue d'une liste. */
export function enMillisecondes(durees: string): number {
  const valeurs = durees.split(",").map((duree) => {
    const texte = duree.trim();
    const nombre = Number.parseFloat(texte);
    return texte.endsWith("ms") ? nombre : nombre * MILLISECONDES_PAR_SECONDE;
  });
  return Math.round(Math.max(...valeurs));
}
