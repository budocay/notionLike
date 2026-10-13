// Compte dans Chromium (F-010 H8). Contre le serveur réel de F-008 et F-009 (pile Docker Compose,
// relayée par Vite) : inscription, déconnexion, connexion, mauvais mot de passe, cookie `HttpOnly`,
// stockage inspecté ; ignoré quand le serveur est absent. Sans serveur : l'état reste inconnu et
// l'espace local reste entier (F-010-AC26).
import { expect, type Page, test } from "@playwright/test";

import { boutonNouvellePage, ouvrir } from "./aides.ts";

const MOI = "/api/v1/moi";
const MOT_DE_PASSE = "un mot de passe assez long";

async function serveurPresent(page: Page): Promise<boolean> {
  const reponse = await page.request.get(MOI, { failOnStatusCode: false });
  return reponse.status() === 401 || reponse.status() === 200;
}

function zoneDeCompte(page: Page) {
  return page.getByRole("region", { name: "Compte" });
}

test("F-010-AC26 F-010-AC2 sans serveur : la coquille s'ouvre, le compte est indisponible, une page se crée", async ({
  page,
}) => {
  test.skip(await serveurPresent(page), "un serveur répond : ce scénario vise son absence");
  await ouvrir(page);

  await expect(zoneDeCompte(page).getByRole("status")).toHaveText(
    "Compte indisponible hors connexion",
  );
  await expect(zoneDeCompte(page).getByRole("button", { name: "Réessayer" })).toBeVisible();
  await boutonNouvellePage(page).click();
  await page.keyboard.type("Hors ligne");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("link", { name: "Hors ligne" })).toBeVisible();
});

test("F-010-AC7 F-010-AC8 F-010-AC12 F-010-AC14 F-010-AC19 contre le serveur réel : inscription, déconnexion, mauvais mot de passe, connexion ; cookie HttpOnly, rien du compte dans le stockage", async ({
  page,
  context,
}) => {
  test.skip(!(await serveurPresent(page)), "serveur de F-008 absent (pile Docker Compose)");
  const courriel = `e2e-${Date.now().toString(36)}@exemple.fr`;
  await ouvrir(page);
  const zone = zoneDeCompte(page);

  await zone.getByRole("link", { name: "Créer un compte" }).click();
  await page.getByLabel("Nom", { exact: false }).fill("Essai Bout en bout");
  await page.getByLabel("Courriel", { exact: false }).fill(courriel);
  await page.getByLabel("Mot de passe", { exact: false }).fill(MOT_DE_PASSE);
  await page.getByRole("button", { name: "Créer le compte" }).click();
  await expect(zone.getByRole("status")).toHaveText("Connecté : Essai Bout en bout");
  const cookies = await context.cookies();
  expect(cookies.length).toBeGreaterThan(0);
  expect(cookies.every(({ httpOnly }) => httpOnly)).toBe(true);
  expect(await page.evaluate(() => document.cookie)).toBe("");

  await zone.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(zone.getByRole("status")).toContainText("Vous êtes déconnecté.");

  await zone.getByRole("link", { name: "Se connecter" }).click();
  await page.getByLabel("Courriel", { exact: false }).fill(courriel);
  await page.getByLabel("Mot de passe", { exact: false }).fill(`${MOT_DE_PASSE} faux`);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("alert")).toHaveText("Courriel ou mot de passe incorrect.");
  await page.getByLabel("Mot de passe", { exact: false }).fill(MOT_DE_PASSE);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(zone.getByRole("status")).toHaveText("Connecté : Essai Bout en bout");

  const stockage = await page.evaluate(async () => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    bases: (await indexedDB.databases()).map(({ name }) => name ?? ""),
  }));
  expect(stockage.local).toEqual([]);
  expect(stockage.session).toEqual([]);
  expect(stockage.bases.every((nom) => nom.startsWith("notionlike:"))).toBe(true);
});
