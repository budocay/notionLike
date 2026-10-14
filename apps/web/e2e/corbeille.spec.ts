// Bout en bout de F-007 dans Chromium : corbeille, restauration, suppression définitive et
// effacement des bases de page. Aucun hook ne lance ce scénario (dette D-003) :
// `pnpm --filter @notionlike/web test:e2e`.
import { expect, type Page, test } from "@playwright/test";

import {
  activerActionDeRangee,
  barreLaterale,
  creerPageNommee,
  ecrituresAbouties,
  lienDePage,
  nomsDesBases,
  ouvrir,
  PREFIXE_DES_BASES_DE_PAGE,
  recharger,
  saisirTitre,
  titres,
} from "./aides.ts";

const PREFIXE_DU_FRAGMENT_DE_PAGE = "#/page/";

async function idDePage(page: Page, titre: string): Promise<string> {
  const adresse = (await lienDePage(page, titre).getAttribute("href")) ?? "";
  return adresse.slice(PREFIXE_DU_FRAGMENT_DE_PAGE.length);
}

function entreeCorbeille(page: Page): ReturnType<Page["getByRole"]> {
  return barreLaterale(page).getByRole("button", { name: "Corbeille", exact: true });
}

function listeDeLaCorbeille(page: Page): ReturnType<Page["getByRole"]> {
  return page.getByRole("region", { name: "Pages de la corbeille" });
}

test("F-007-AC28 créer une page et une sous-page, jeter, restaurer, jeter, supprimer définitivement, recharger : ni dans la barre, ni dans la corbeille, ni base de page", async ({
  page,
}) => {
  await ouvrir(page);
  await creerPageNommee(page, "Projet");
  await activerActionDeRangee(page, "ajouter-une-sous-page", "Projet");
  await saisirTitre(page, "Tâche");
  await expect(lienDePage(page, "Tâche")).toBeVisible();
  const projet = await idDePage(page, "Projet");
  const tache = await idDePage(page, "Tâche");
  await ecrituresAbouties(page);
  await ecrituresAbouties(page, PREFIXE_DES_BASES_DE_PAGE);

  await activerActionDeRangee(page, "mettre-a-la-corbeille", "Projet");
  expect(await titres(page)).toEqual([]);
  await entreeCorbeille(page).click();
  await expect(page).toHaveURL(/#\/corbeille$/);
  await expect(listeDeLaCorbeille(page)).toContainText("Projet");
  await page.getByRole("button", { name: "Restaurer « Projet »", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Page restaurée");
  expect(await titres(page)).toEqual(["Projet", "Tâche"]);

  await activerActionDeRangee(page, "mettre-a-la-corbeille", "Projet");
  await page
    .getByRole("button", { name: "Supprimer définitivement « Projet »", exact: true })
    .click();
  const boite = page.getByRole("alertdialog");
  await expect(boite).toContainText("sa sous-page");
  await boite.getByRole("button", { name: "Supprimer définitivement « Projet »" }).click();
  await expect(listeDeLaCorbeille(page)).toHaveText("La corbeille est vide");
  await ecrituresAbouties(page);

  await recharger(page);
  expect(await titres(page)).toEqual([]);
  await expect(listeDeLaCorbeille(page)).toHaveText("La corbeille est vide");
  const bases = await nomsDesBases(page);
  expect(bases.filter((nom) => nom.endsWith(`:${projet}`) || nom.endsWith(`:${tache}`))).toEqual(
    [],
  );
});
