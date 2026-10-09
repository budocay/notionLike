// F-030-AC22 : la reprise de la persistance locale dans un navigateur réel. Le stockage est rendu
// défaillant par le test, à l'ouverture des bases ; aucun code de production n'est ajouté pour lui.
import { expect, type Page, test } from "@playwright/test";

import {
  activerActionDeRangee,
  creerPageNommee,
  ecouterLaConsole,
  lienDePage,
  nomsDesBases,
  ouvrir,
  recharger,
  saisirTitre,
} from "./aides.ts";
import { zoneDEtat } from "./aides-ecrans.ts";

const COUPURE = "Stockage de l'appareil indisponible";
const REESSAYER = "Réessayer maintenant";
const ENREGISTRE = "Enregistré sur cet appareil";
const NON_ENREGISTRE = "Non enregistré sur cet appareil";
const BASE_DE_L_APPAREIL = "notionlike:appareil";
const PREFIXE_DES_BASES_D_ESPACE = "notionlike:espace:";
const ECHEANCE_D_UNE_TENTATIVE_MS = 10_000;

// Toute ouverture de base lève tant que la panne dure. L'état de la panne est gardé pour l'onglet,
// rechargements compris : en panne à la première ouverture, jusqu'à ce que le test la lève.
async function installerLaPanne(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const ouvrir = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...arguments_) {
      if (window.name !== "stockage-retabli") {
        throw new DOMException("stockage en panne", "UnknownError");
      }
      return ouvrir.apply(this, arguments_);
    };
  });
}

async function reglerLaPanne(page: Page, enPanne: boolean): Promise<void> {
  await page.evaluate((panne) => {
    window.name = panne ? "" : "stockage-retabli";
  }, enPanne);
}

function avertissement(page: Page) {
  return page.getByRole("alert");
}

test("F-030-AC22 ouverture avec un stockage défaillant : avertissement, page créée et renommée en mémoire, stockage rétabli, avertissement retiré sans rechargement, page et titre relus après rechargement ; puis coupure, modification, et le navigateur demande confirmation avant de quitter", async ({
  page,
}) => {
  const console_ = ecouterLaConsole(page);
  await installerLaPanne(page);
  await ouvrir(page);
  await expect(avertissement(page)).toContainText(COUPURE);
  await expect(zoneDEtat(page)).toHaveText(NON_ENREGISTRE);

  await creerPageNommee(page, "Créée pendant la coupure");
  await activerActionDeRangee(page, "renommer", "Créée pendant la coupure");
  await saisirTitre(page, "Renommée pendant la coupure");
  await expect(avertissement(page)).toContainText(COUPURE);
  expect(await nomsDesBases(page)).toEqual([]);

  await reglerLaPanne(page, false);
  await page.waitForTimeout(1_000);
  await page.getByRole("button", { name: REESSAYER }).click();
  await expect(avertissement(page)).toHaveCount(0);
  await expect(zoneDEtat(page)).toContainText(ENREGISTRE);
  await expect(lienDePage(page, "Renommée pendant la coupure")).toBeVisible();

  await recharger(page);
  await expect(lienDePage(page, "Renommée pendant la coupure")).toBeVisible();
  await expect(avertissement(page)).toHaveCount(0);
  await expect(zoneDEtat(page)).toHaveText(ENREGISTRE);

  // Coupure : la base de l'espace est retirée sous l'application, dont la connexion se ferme ;
  // l'écriture suivante échoue, et le stockage reste en panne pour les tentatives.
  await reglerLaPanne(page, true);
  const [baseDeLEspace] = (await nomsDesBases(page)).filter((nom) =>
    nom.startsWith(PREFIXE_DES_BASES_D_ESPACE),
  );
  await page.evaluate(
    (nom) =>
      new Promise((resoudre) => {
        indexedDB.deleteDatabase(nom).onsuccess = resoudre;
      }),
    baseDeLEspace ?? "",
  );
  await creerPageNommee(page, "Non enregistrée");
  await expect(avertissement(page)).toContainText(COUPURE);
  await expect(zoneDEtat(page)).toHaveText(NON_ENREGISTRE);

  const demande = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const boite = await demande;
  expect(boite.type()).toBe("beforeunload");
  await boite.dismiss();
  await expect(lienDePage(page, "Non enregistrée")).toBeVisible();
  expect(console_.filter((ligne) => /Uncaught|Unhandled/i.test(ligne))).toEqual([]);
});

test("F-030-AC22 deux onglets, base de l'appareil sans son magasin et tenue ouverte par le premier : dans le second, l'avertissement dure tant que la connexion est tenue ; connexion fermée, il est retiré sans rechargement et le magasin est recréé", async ({
  context,
}) => {
  test.setTimeout(120_000);
  const premier = await context.newPage();
  await premier.goto("/demo.html");
  await premier.evaluate(
    (nom) =>
      new Promise<void>((resoudre) => {
        const demande = indexedDB.open(nom);
        demande.onsuccess = () => {
          // Tenue, et sourde à `versionchange` : un onglet d'une autre version, ou un outil.
          Object.assign(window, { connexionTenue: demande.result });
          resoudre();
        };
      }),
    BASE_DE_L_APPAREIL,
  );

  const second = await context.newPage();
  await second.goto("/");
  await expect(avertissement(second)).toContainText(COUPURE, {
    timeout: ECHEANCE_D_UNE_TENTATIVE_MS + 5_000,
  });
  await second.waitForTimeout(3_000);
  await expect(avertissement(second)).toContainText(COUPURE);
  expect(
    await premier.evaluate(() => [
      ...(window as unknown as { connexionTenue: IDBDatabase }).connexionTenue.objectStoreNames,
    ]),
  ).toEqual([]);

  await premier.evaluate(() =>
    (window as unknown as { connexionTenue: IDBDatabase }).connexionTenue.close(),
  );

  await expect(avertissement(second)).toHaveCount(0, { timeout: 60_000 });
  await expect(zoneDEtat(second)).toContainText(ENREGISTRE);
  const magasins = await second.evaluate(
    (nom) =>
      new Promise<string[]>((resoudre) => {
        const demande = indexedDB.open(nom);
        demande.onsuccess = () => {
          const noms = [...demande.result.objectStoreNames];
          demande.result.close();
          resoudre(noms);
        };
      }),
    BASE_DE_L_APPAREIL,
  );
  expect(magasins).toEqual(["reglages"]);
});
