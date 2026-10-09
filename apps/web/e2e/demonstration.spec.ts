// Page de démonstration dans Chromium : ouverture sans bruit de console et captures de référence.
// Playwright ne vide le dossier des captures qu'au début d'un lancement : celles-ci existent encore
// quand il se termine.
import { existsSync, statSync } from "node:fs";

import { expect, type Page, test } from "@playwright/test";

import { ecouterLaConsole } from "./aides.ts";
import {
  CAPTURES_ATTENDUES,
  type CaptureAttendue,
  DOSSIER_DES_CAPTURES,
  HAUTEUR_DE_FENETRE,
  nomDeCapture,
  PAGE_DE_DEMONSTRATION,
} from "./captures-attendues.ts";

const ADRESSE = "/demo.html";

interface EtatForce {
  readonly repere: string;
  readonly etat: string;
}

/** Marque dans la page chaque élément dont un spécimen demande un état forcé, et rend la liste. */
function marquerLesEtatsForces(page: Page): Promise<EtatForce[]> {
  return page.evaluate(() => {
    const forces: { repere: string; etat: string }[] = [];
    document.querySelectorAll<HTMLElement>("[data-force]").forEach((specimen, rang) => {
      (specimen.dataset["force"] ?? "").split(";").forEach((demande, indice) => {
        const [etat = "", selecteur = ""] = demande.split(":");
        const repere = `${rang}-${indice}`;
        specimen.querySelector(selecteur)?.setAttribute("data-etat-force", repere);
        forces.push({ repere, etat });
      });
    });
    return forces;
  });
}

// Survol et focus ne tiennent pas à plusieurs sur une même page : ils sont forcés par le protocole
// de Chromium (essai B4 de la conception), sans rien ajouter aux feuilles de style.
async function forcerLesEtats(page: Page): Promise<number> {
  const forces = await marquerLesEtatsForces(page);
  const session = await page.context().newCDPSession(page);
  await session.send("DOM.enable");
  await session.send("CSS.enable");
  const { root } = await session.send("DOM.getDocument");
  for (const { repere, etat } of forces) {
    const { nodeId } = await session.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: `[data-etat-force="${repere}"]`,
    });
    expect(nodeId, `élément à forcer en ${etat}`).toBeGreaterThan(0);
    await session.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [etat] });
  }
  return forces.length;
}

async function capturer(page: Page, racine: string, capture: CaptureAttendue): Promise<void> {
  await page.setViewportSize({ width: capture.largeur, height: HAUTEUR_DE_FENETRE });
  await page.goto(ADRESSE);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.locator("[data-demonstration]")).toHaveCount(1);
  expect(await forcerLesEtats(page)).toBeGreaterThan(0);
  await page.evaluate(() => document.fonts.ready);
  const debordement = await page.evaluate(() => ({
    contenu: document.documentElement.scrollWidth,
    fenetre: document.documentElement.clientWidth,
  }));
  expect(debordement.contenu, `défilement horizontal à ${capture.largeur}`).toBeLessThanOrEqual(
    debordement.fenetre,
  );
  await page.screenshot({
    path: `${racine}/${DOSSIER_DES_CAPTURES}/${nomDeCapture(capture)}`,
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });
}

test("F-004-AC50 F-004-AC51 la page de démonstration s'ouvre sans bruit de console à 360, 768 et 1280, et chaque capture attendue est produite", async ({
  page,
}, infos) => {
  const messages = ecouterLaConsole(page);
  const racine = infos.config.rootDir.replace(/[\\/]e2e$/, "");
  const demandees = CAPTURES_ATTENDUES.filter(({ ecran }) => ecran === PAGE_DE_DEMONSTRATION);
  expect(demandees.map(({ largeur }) => largeur)).toEqual([360, 768, 1280]);

  for (const capture of demandees) {
    await capturer(page, racine, capture);
  }

  expect(messages).toEqual([]);
  // Les captures de l'application sont produites et vérifiées par `captures.spec.ts`.
  for (const capture of demandees) {
    const chemin = `${racine}/${DOSSIER_DES_CAPTURES}/${nomDeCapture(capture)}`;
    expect(existsSync(chemin), `capture attendue : ${chemin}`).toBe(true);
    expect(statSync(chemin).size, `capture vide : ${chemin}`).toBeGreaterThan(0);
  }
});

test("F-004-AC22 sur la page de démonstration, l'indicateur de chargement bat, et s'arrête sous mouvement réduit", async ({
  page,
}) => {
  await page.goto(ADRESSE);
  const point = page.getByRole("status").filter({ hasText: "Chargement…" }).locator("span > span");
  await expect(point.first()).toBeVisible();
  const animation = (): Promise<string> =>
    point.first().evaluate((element) => getComputedStyle(element).animationName);
  expect(await animation()).toBe("pulsation");

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await animation()).toBe("none");
  const duree = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--duree-rapide").trim(),
  );
  expect(duree).toBe("0ms");
});
