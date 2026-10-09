// Bout en bout de F-003 dans Chromium : frappes réelles dans l'éditeur de page, un contexte de
// navigateur neuf par test, donc un IndexedDB vide.
import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  creerPage,
  ecouterLaConsole,
  ecouterLeReseau,
  ecrituresAbouties,
  lienDePage,
  origineDe,
  originesEtrangeres,
  ouvrir,
  recharger,
} from "./aides.ts";

// L'historique d'annulation regroupe les frappes séparées de moins de 500 ms : une pause plus
// longue, comme celle d'une personne qui s'arrête d'écrire, isole la frappe suivante.
const PAUSE_ENTRE_DEUX_GROUPES_MS = 700;

function zoneDeSaisie(page: Page): Locator {
  return page.getByRole("textbox", { name: "Contenu de la page" });
}

/** Les blocs affichés : une ligne par bloc, en retrait de deux espaces par niveau de liste. */
function blocs(page: Page): Promise<string[]> {
  return zoneDeSaisie(page).evaluate((racine) => {
    const lignes: string[] = [];
    const decrire = (element: Element, retrait: string): void => {
      const balise = element.tagName.toLowerCase();
      if (balise === "ul" || balise === "ol" || balise === "li") {
        lignes.push(`${retrait}${balise}`);
        [...element.children].forEach((enfant) => decrire(enfant, `${retrait}  `));
      } else {
        lignes.push(`${retrait}${balise} ${element.textContent}`);
      }
    };
    [...racine.children].forEach((enfant) => decrire(enfant, ""));
    return lignes;
  });
}

async function attendreLesBlocs(page: Page, attendus: readonly string[]): Promise<void> {
  await expect.poll(() => blocs(page)).toEqual(attendus);
}

/** Ouvre la page par la barre latérale et place le curseur dans son éditeur. */
async function ouvrirLaPage(page: Page, titre: string): Promise<void> {
  await lienDePage(page, titre).click();
  await expect(page.getByRole("heading", { level: 1, name: titre, exact: true })).toBeVisible();
  await expect(zoneDeSaisie(page)).toBeVisible();
}

async function creerEtOuvrir(page: Page, titre: string): Promise<void> {
  await creerPage(page, titre);
  await ouvrirLaPage(page, titre);
  await zoneDeSaisie(page).click();
}

async function taper(page: Page, lignes: readonly string[]): Promise<void> {
  for (const [rang, ligne] of lignes.entries()) {
    if (rang > 0) {
      await page.keyboard.press("Enter");
    }
    await page.keyboard.type(ligne);
  }
}

const CONTENU_DU_CARNET = [
  "h1 Titre du carnet",
  "p Un premier paragraphe.",
  "ul",
  "  li",
  "    p Premier",
  "    ul",
  "      li",
  "        p Second",
  "ol",
  "  li",
  "    p Un",
  "  li",
  "    p Deux",
  "h2 Sous-titre",
  "p Dernier paragraphe",
];

/** Tape tout le contenu du carnet, bloc après bloc, par le clavier et la barre de blocs. */
async function ecrireLeCarnet(page: Page): Promise<void> {
  await taper(page, ["# Titre du carnet", "Un premier paragraphe.", "- Premier", "Second"]);
  await page.keyboard.press("Tab");
  // Entrée dans un élément vide le fait sortir d'un niveau : trois fois pour quitter la liste.
  await taper(page, ["", "", "", "1. Un", "Deux", "", ""]);
  await page.getByRole("button", { name: "Titre 2", exact: true }).click();
  await expect(page.getByRole("button", { name: "Titre 2", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await taper(page, ["Sous-titre", "Dernier paragraphe"]);
}

test("F-003-AC28 créer une page, titre par « # », paragraphes, listes imbriquée et numérotée, barre de blocs, annuler et rétablir, changer de page, recharger, modifier réseau coupé : tout est relu", async ({
  context,
  page,
  baseURL,
}) => {
  const origine = origineDe(baseURL);
  const adresses = ecouterLeReseau(context, page);
  const console = ecouterLaConsole(page);
  await ouvrir(page);

  await creerEtOuvrir(page, "Carnet");
  await ecrireLeCarnet(page);
  await attendreLesBlocs(page, CONTENU_DU_CARNET);

  // Annuler puis rétablir la dernière frappe.
  await page.waitForTimeout(PAUSE_ENTRE_DEUX_GROUPES_MS);
  await page.keyboard.type("!");
  const avecLaFrappe = [...CONTENU_DU_CARNET.slice(0, -1), "p Dernier paragraphe!"];
  await attendreLesBlocs(page, avecLaFrappe);
  await page.keyboard.press("ControlOrMeta+z");
  await attendreLesBlocs(page, CONTENU_DU_CARNET);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await attendreLesBlocs(page, avecLaFrappe);

  // Une seconde page a son propre contenu ; revenir à la première rend le sien.
  await creerEtOuvrir(page, "Autre");
  await attendreLesBlocs(page, ["p "]);
  await page.keyboard.type("Contenu de l'autre page");
  await ouvrirLaPage(page, "Carnet");
  await attendreLesBlocs(page, avecLaFrappe);

  await ecrituresAbouties(page);
  await recharger(page);
  await attendreLesBlocs(page, avecLaFrappe);
  await ouvrirLaPage(page, "Autre");
  await attendreLesBlocs(page, ["p Contenu de l'autre page"]);
  await ouvrirLaPage(page, "Carnet");
  await attendreLesBlocs(page, avecLaFrappe);

  // Réseau coupé : la modification s'applique et s'enregistre. Le rechargement lui-même demande
  // le réseau tant que l'application n'est pas servie hors ligne : il est rétabli juste avant.
  await context.setOffline(true);
  await zoneDeSaisie(page).getByText("Un premier paragraphe.", { exact: true }).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Modifié hors ligne.");
  const modifie = avecLaFrappe.with(1, "p Un premier paragraphe. Modifié hors ligne.");
  await attendreLesBlocs(page, modifie);
  await ecrituresAbouties(page);
  await context.setOffline(false);
  await recharger(page);
  await attendreLesBlocs(page, modifie);

  expect(console).toEqual([]);
  expect(originesEtrangeres(adresses, origine)).toEqual([]);
});

// Sans attendre `ecrituresAbouties` : ce que seul un vrai navigateur prouve. La persistance valide
// chaque écriture par `commit()` dès qu'elle la pose ; la dernière frappe doit donc survivre à un
// rechargement lancé aussitôt après elle.
test("F-003-AC28 du texte tapé puis un rechargement immédiat, sans attendre la fin de l'écriture : le texte est relu", async ({
  page,
}) => {
  await ouvrir(page);
  await creerEtOuvrir(page, "Brouillon");

  await page.keyboard.type("Écrit juste avant de recharger");
  await recharger(page);

  await attendreLesBlocs(page, ["p Écrit juste avant de recharger"]);
});

test("F-003-AC28 sous macOS, Cmd+Z annule et Cmd+Maj+Z rétablit la dernière frappe", async ({
  page,
}) => {
  await ouvrir(page);
  const plateforme = await page.evaluate(() => navigator.platform);
  test.skip(!plateforme.startsWith("Mac"), "Raccourcis propres à macOS.");
  await creerEtOuvrir(page, "Raccourcis");

  await page.keyboard.type("abc");
  await page.waitForTimeout(PAUSE_ENTRE_DEUX_GROUPES_MS);
  await page.keyboard.type("d");
  await attendreLesBlocs(page, ["p abcd"]);

  await page.keyboard.press("Meta+z");
  await attendreLesBlocs(page, ["p abc"]);
  await page.keyboard.press("Meta+Shift+z");
  await attendreLesBlocs(page, ["p abcd"]);
});
