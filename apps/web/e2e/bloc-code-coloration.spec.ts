// F-033-AC26 : coloration et indentation du bloc code dans un navigateur réel, par des frappes
// réelles. Dans une page vide, trois accents graves, `typescript` et une espace donnent un bloc
// code ; une fonction y est saisie avec Entrée, Tab et Maj+Tab ; le texte est exact ; `function` et
// `"a"` prennent la couleur de leur jeton de rôle ; Échap puis Tab fait quitter l'éditeur ; tout est
// relu après rechargement. Puis la mesure réelle de F-033-AC23 à 360 pixels. Hors des hooks tant que
// D-003 n'est pas levée. À la main, par le dev (H12) : Entrée au clavier virtuel d'Android et d'un
// iPhone, et saisie validée par un IME japonais, en fin d'une ligne indentée.
import { expect, type Locator, type Page, test } from "@playwright/test";

import { largeur } from "./aides-ecrans.ts";
import {
  creerPageNommee,
  ecouterLaConsole,
  ecrituresAbouties,
  ouvrir,
  PREFIXE_DES_BASES_DE_PAGE,
  recharger,
  titrePrincipal,
} from "./aides.ts";

const TITRE_DE_LA_PAGE = "Coloration";
const TEXTE_ATTENDU = 'function f() {\n  return "a";\n}';
const AIDE =
  "Tab indente. Échap puis Tab : quitter l'éditeur. Entrée trois fois en fin de bloc : sortir du bloc.";

function zoneDeSaisie(page: Page): Locator {
  return page.getByRole("textbox", { name: "Contenu de la page" });
}

/** La couleur calculée qu'un élément prend de ce jeton, lue sur une sonde posée dans la page. */
function couleurDuJeton(page: Page, jeton: string): Promise<string> {
  return page.evaluate((nom) => {
    const sonde = document.createElement("span");
    sonde.style.color = `var(${nom})`;
    document.body.append(sonde);
    const couleur = getComputedStyle(sonde).color;
    sonde.remove();
    return couleur;
  }, jeton);
}

/** La couleur calculée de la portion colorée de ce texte, dans le bloc code. */
function couleurDe(zone: Locator, texte: string): Promise<string> {
  return zone
    .locator("pre > code span", { hasText: texte })
    .first()
    .evaluate((element) => getComputedStyle(element).color);
}

async function verifierLeBloc(page: Page, zone: Locator): Promise<void> {
  const code = zone.locator("pre > code");
  await expect(code).toHaveCount(1);
  expect(await code.evaluate((element) => element.textContent)).toBe(TEXTE_ATTENDU);
  await expect(code).toHaveAttribute("class", "language-typescript");
  const [motCle, chaine, courant] = await Promise.all([
    couleurDuJeton(page, "--color-texte-syntaxe-mot-cle"),
    couleurDuJeton(page, "--color-texte-syntaxe-chaine"),
    couleurDuJeton(page, "--color-texte-principal"),
  ]);
  expect(await couleurDe(zone, "function")).toBe(motCle);
  expect(await couleurDe(zone, '"a"')).toBe(chaine);
  expect(new Set([motCle, chaine, courant]).size).toBe(3);
}

test("F-033-AC26 par des frappes réelles : un bloc `typescript`, une fonction indentée par Entrée, Tab et Maj+Tab, colorée par les jetons de rôle ; Échap puis Tab quitte l'éditeur ; relu coloré après rechargement", async ({
  page,
}) => {
  const console_ = ecouterLaConsole(page);
  await ouvrir(page);
  await creerPageNommee(page, TITRE_DE_LA_PAGE);
  const zone = zoneDeSaisie(page);
  await zone.click();

  await page.keyboard.type("```typescript ");
  await expect(zone.locator("pre > code")).toHaveCount(1);
  await page.keyboard.type("function f() {");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type('return "a";');
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.type("}");
  await expect(zone).toBeFocused();
  await verifierLeBloc(page, zone);
  await expect(page.getByText(AIDE)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(zone).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(zone).not.toBeFocused();
  expect(await zone.locator("pre > code").evaluate((element) => element.textContent)).toBe(
    TEXTE_ATTENDU,
  );
  await ecrituresAbouties(page, PREFIXE_DES_BASES_DE_PAGE);

  await recharger(page);
  await expect(titrePrincipal(page).first()).toHaveText(TITRE_DE_LA_PAGE);
  await verifierLeBloc(page, zoneDeSaisie(page));
  expect(console_).toEqual([]);
});

test("F-033-AC23 F-004-AC45 à 360 pixels, dans un bloc code : l'aide est affichée sans défilement horizontal, et la barre ne couvre pas la ligne du curseur", async ({
  page,
}) => {
  await ouvrir(page);
  await creerPageNommee(page, "Aide du bloc code");
  await largeur(page, 360);
  const zone = zoneDeSaisie(page);
  await zone.click();
  await page.keyboard.type("```python ");
  await page.keyboard.type("x = 1");
  await page.keyboard.press("Enter");
  await page.keyboard.type("y = 2");

  const aide = page.getByText(AIDE);
  await expect(aide).toBeVisible();
  const designee = await zone.getAttribute("aria-describedby");
  expect(designee).not.toBeNull();
  expect(await aide.getAttribute("id")).toBe(designee);
  const mesures = await page.evaluate(() => {
    const ligne = window.getSelection()?.getRangeAt(0).getBoundingClientRect();
    const barre = document.querySelector('[role="toolbar"]')?.getBoundingClientRect();
    return {
      defilement: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ligne: ligne && { haut: ligne.top, bas: ligne.bottom },
      barre: barre && { haut: barre.top, bas: barre.bottom, droite: barre.right },
      fenetre: window.innerWidth,
    };
  });

  expect(mesures.defilement).toBeLessThanOrEqual(0);
  expect(mesures.barre).toBeDefined();
  expect(mesures.ligne).toBeDefined();
  if (mesures.barre !== undefined && mesures.ligne !== undefined) {
    const couvre = mesures.barre.haut < mesures.ligne.bas && mesures.ligne.haut < mesures.barre.bas;
    expect(couvre).toBe(false);
    expect(mesures.barre.droite).toBeLessThanOrEqual(mesures.fenetre);
  }
});
