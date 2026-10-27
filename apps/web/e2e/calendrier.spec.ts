// Bout en bout de F-021 dans Chromium (F-021-AC32) : une table d'une colonne « Date » et de trois
// lignes, dont une sans date ; la vue calendrier place chaque ligne dans la case de son jour et la
// troisième dans « Sans date », lui définit une date, déplace une entrée au jour suivant par
// Alt+Maj+Flèche droite, passe au mois suivant et revient, retrouve les mêmes dates dans la vue
// « Tableau », puis la même vue après rechargement. Le scénario est joué dans un contexte par fuseau :
// un fuseau en avance sur UTC (Pacific/Kiritimati, UTC+14) puis un fuseau en retard
// (Pacific/Pago_Pago, UTC-11), dont l'émulation est constatée dans la page avant le scénario.
// L'horloge de la page est figée à un instant où « aujourd'hui » n'est pas le même jour sous les deux
// fuseaux (9 octobre à Kiritimati, 8 à Pago Pago). Aucun hook ne lance ce scénario (dette D-003) :
// `pnpm --filter @notionlike/web test:e2e`.
import { expect, type Page, test } from "@playwright/test";

import { ecrituresAbouties, ouvrir, barreLaterale, recharger, saisirTitre } from "./aides.ts";

const PREFIXE_DES_BASES_DE_TABLE = "notionlike:table:";
const INSTANT = new Date("2026-10-08T12:00:00Z");

/** Fuseaux émulés et décalage attendu de `getTimezoneOffset()` en octobre 2026, en minutes. */
const FUSEAUX: readonly (readonly [string, number])[] = [
  ["Pacific/Kiritimati", -840],
  ["Pacific/Pago_Pago", 660],
];

function grille(page: Page) {
  return page.getByRole("grid");
}

function caseDuJour(page: Page, jour: string) {
  return page.locator(`[role="gridcell"][data-jour="${jour}"]`);
}

function cellule(page: Page, rangee: number, colonne: number) {
  return grille(page).locator(
    `[role="row"][aria-rowindex="${String(rangee)}"] [aria-colindex="${String(colonne)}"]`,
  );
}

async function choisirLaVue(page: Page, vue: "Tableau" | "Calendrier"): Promise<void> {
  await page
    .getByRole("group", { name: "Vue de la table" })
    .getByRole("button", { name: vue, exact: true })
    .click();
}

async function datesDuTableau(page: Page): Promise<string[]> {
  return grille(page)
    .locator('[role="row"]:not([aria-rowindex="1"]) [aria-colindex="2"]')
    .allTextContents();
}

for (const [fuseau, decalage] of FUSEAUX) {
  test.describe(`fuseau ${fuseau}`, () => {
    test.use({ timezoneId: fuseau });

    test(`F-021-AC32 placer, définir une date, déplacer au jour suivant, changer de mois, retrouver le tableau et recharger sous ${fuseau}`, async ({
      page,
    }) => {
      await page.clock.setFixedTime(INSTANT);
      await ouvrir(page);

      // Le fuseau émulé est celui du scénario : sans cela, la comparaison ne prouverait rien.
      const emule = await page.evaluate(() => ({
        zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        decalage: new Date(2026, 9, 8, 12).getTimezoneOffset(),
      }));
      expect(emule).toEqual({ zone: fuseau, decalage });

      // Une table d'une colonne « Date » et de trois lignes.
      await page.getByRole("button", { name: "Nouvelle table", exact: true }).click();
      await saisirTitre(page, "Agenda");
      await page.getByRole("button", { name: "Ajouter une colonne", exact: true }).first().click();
      const boite = page.getByRole("dialog", { name: "Nouvelle colonne" });
      await boite.getByRole("textbox", { name: "Nom de la colonne" }).fill("Date");
      await boite
        .getByRole("combobox", { name: "Type de la colonne" })
        .selectOption({ label: "Date" });
      await boite.getByRole("button", { name: "Créer la colonne" }).click();
      await expect(boite).toBeHidden();
      for (let rang = 0; rang < 3; rang += 1) {
        await page.getByRole("button", { name: "Nouvelle ligne", exact: true }).click();
      }
      for (const [rang, jour] of [
        [1, "2026-10-14"],
        [2, "2026-10-20"],
      ] as const) {
        await cellule(page, rang + 1, 2).click();
        await page.keyboard.press("Enter");
        await page.getByLabel(`Date, ligne ${String(rang)}`).fill(jour);
        await page.keyboard.press("Enter");
      }
      expect(await datesDuTableau(page)).toEqual(["14/10/2026", "20/10/2026", ""]);

      // La vue calendrier : chaque ligne dans la case de son jour, la troisième dans « Sans date ».
      await choisirLaVue(page, "Calendrier");
      await expect(page.getByRole("heading", { name: "octobre 2026" })).toBeVisible();
      await expect(
        caseDuJour(page, "2026-10-14").getByRole("group", { name: "Sans titre" }),
      ).toHaveCount(1);
      await expect(
        caseDuJour(page, "2026-10-20").getByRole("group", { name: "Sans titre" }),
      ).toHaveCount(1);
      const panneau = page.getByRole("region", { name: /^Sans date/ });
      await expect(panneau.locator("li")).toHaveCount(1);

      // Définir une date à la troisième.
      await panneau.getByRole("button", { name: "Définir la date : Sans titre" }).click();
      const dialogue = page.getByRole("dialog");
      await dialogue.getByLabel("Date").fill("2026-10-22");
      await dialogue.getByRole("button", { name: "Valider" }).click();
      await expect(
        caseDuJour(page, "2026-10-22").getByRole("group", { name: "Sans titre" }),
      ).toHaveCount(1);
      await expect(panneau.locator("li")).toHaveCount(0);

      // Déplacer l'entrée du 14 au jour suivant, au clavier.
      await caseDuJour(page, "2026-10-14").getByRole("group", { name: "Sans titre" }).focus();
      await page.keyboard.press("Alt+Shift+ArrowRight");
      await expect(
        caseDuJour(page, "2026-10-15").getByRole("group", { name: "Sans titre" }),
      ).toHaveCount(1);
      await expect(
        caseDuJour(page, "2026-10-14").getByRole("group", { name: "Sans titre" }),
      ).toHaveCount(0);
      await expect(page.getByRole("status").filter({ hasText: "déplacée" })).toHaveText(
        "Sans titre, déplacée au jeudi 15 octobre 2026.",
      );

      // Le mois suivant, puis le retour.
      await page.getByRole("button", { name: "Mois suivant", exact: true }).click();
      await expect(page.getByRole("heading", { name: "novembre 2026" })).toBeVisible();
      await page.getByRole("button", { name: "Mois précédent", exact: true }).click();
      await expect(page.getByRole("heading", { name: "octobre 2026" })).toBeVisible();
      await expect(
        caseDuJour(page, "2026-10-15").getByRole("group", { name: "Sans titre" }),
      ).toHaveCount(1);

      // La vue « Tableau » : les mêmes dates, jour pour jour.
      await choisirLaVue(page, "Tableau");
      await expect(grille(page)).toBeVisible();
      expect(await datesDuTableau(page)).toEqual(["15/10/2026", "20/10/2026", "22/10/2026"]);

      // Rechargée : la même vue.
      await ecrituresAbouties(page);
      await ecrituresAbouties(page, PREFIXE_DES_BASES_DE_TABLE);
      await recharger(page);
      await barreLaterale(page).getByRole("link", { name: "Table Agenda", exact: true }).click();
      await expect(grille(page)).toBeVisible();
      expect(await datesDuTableau(page)).toEqual(["15/10/2026", "20/10/2026", "22/10/2026"]);
      await choisirLaVue(page, "Calendrier");
      for (const jour of ["2026-10-15", "2026-10-20", "2026-10-22"]) {
        await expect(caseDuJour(page, jour).getByRole("group", { name: "Sans titre" })).toHaveCount(
          1,
        );
      }
    });
  });
}
