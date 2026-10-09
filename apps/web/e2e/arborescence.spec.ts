// Bout en bout de F-002 dans Chromium : un contexte de navigateur neuf par test, donc un
// IndexedDB vide. Le serveur est celui que `playwright.config.ts` lance et arrête. Aucun hook ne
// lance ces scénarios (dette D-003) : `pnpm --filter @notionlike/web test:e2e`.
import { expect, type Page, test } from "@playwright/test";

import {
  activerActionDeRangee,
  arborescence,
  atteindreActionDeRangee,
  barreLaterale,
  basculerRepli,
  boutonNouvellePage,
  creerPageNommee,
  ecouterLaConsole,
  ecouterLeReseau,
  ecrituresAbouties,
  lienDePage,
  nomsDesBases,
  origineDe,
  originesEtrangeres,
  ouvrir,
  rangees,
  recharger,
  saisirTitre,
  titrePrincipal,
  titres,
} from "./aides.ts";

const UUID_CANONIQUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PREFIXE_DU_FRAGMENT_DE_PAGE = "#/page/";
const TITRE_D_ONGLET_SANS_PAGE = "notionLike";
/** Forme d'UUID canonique, que nulle page ne porte dans un espace neuf. */
const PAGE_ABSENTE = "5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e";
/** Repère reconnaissable des fragments forgés : il ne doit apparaître nulle part à l'écran. */
const REPERE = "zzforgezz";

/** Identifiant de la page au titre donné, lu dans l'adresse de son lien. */
async function idDePage(page: Page, titre: string): Promise<string> {
  const adresse = (await lienDePage(page, titre).getAttribute("href")) ?? "";
  expect(adresse.startsWith(PREFIXE_DU_FRAGMENT_DE_PAGE)).toBe(true);
  return adresse.slice(PREFIXE_DU_FRAGMENT_DE_PAGE.length);
}

/** « Page introuvable », aucune page sélectionnée, rien du fragment à l'écran ni dans l'onglet. */
async function constaterPageIntrouvable(page: Page, interdit: string): Promise<void> {
  await expect(titrePrincipal(page)).toHaveText("Page introuvable");
  await expect(barreLaterale(page).locator('[aria-current="page"]')).toHaveCount(0);
  expect(await page.title()).toBe(TITRE_D_ONGLET_SANS_PAGE);
  expect(await page.locator("body").innerText()).not.toContain(interdit);
}

test("F-002-AC23 créer une page, la renommer, lui ajouter une sous-page, recharger : même arborescence ; la mettre à la corbeille, recharger : ni elle ni sa sous-page", async ({
  page,
}) => {
  await ouvrir(page);
  await expect(page.getByRole("main")).toContainText("aucune page");

  await boutonNouvellePage(page).click();
  await saisirTitre(page, "");
  await activerActionDeRangee(page, "renommer", "Sans titre");
  await saisirTitre(page, "Projet");
  await activerActionDeRangee(page, "ajouter-une-sous-page", "Projet");
  await saisirTitre(page, "Notes");

  const avant = await arborescence(page);
  expect(avant.map(({ niveau, titre }) => [niveau, titre])).toEqual([
    ["1", "Projet"],
    ["2", "Notes"],
  ]);
  await ecrituresAbouties(page);
  await recharger(page);

  expect(await arborescence(page)).toEqual(avant);

  await activerActionDeRangee(page, "mettre-a-la-corbeille", "Projet");
  await expect(rangees(page)).toHaveCount(0);
  await ecrituresAbouties(page);
  await recharger(page);

  await expect(rangees(page)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Projet" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Notes" })).toHaveCount(0);
  await expect(page.getByRole("main")).toContainText("aucune page");
});

test("F-002-AC4 deux onglets ouverts ensemble au premier lancement : chacun crée une page, les deux les affichent après rechargement, dans le même ordre", async ({
  context,
}) => {
  const [premier, second] = await Promise.all([context.newPage(), context.newPage()]);
  await Promise.all([ouvrir(premier), ouvrir(second)]);

  await creerPageNommee(premier, "Du premier onglet");
  await creerPageNommee(second, "Du second onglet");
  expect(await titres(premier)).toEqual(["Du premier onglet"]);
  expect(await titres(second)).toEqual(["Du second onglet"]);
  await ecrituresAbouties(premier);
  await ecrituresAbouties(second);
  await Promise.all([recharger(premier), recharger(second)]);

  const vuParLePremier = await arborescence(premier);
  expect(vuParLePremier.map((rangee) => rangee.titre).sort()).toEqual([
    "Du premier onglet",
    "Du second onglet",
  ]);
  expect(await arborescence(second)).toEqual(vuParLePremier);
});

test("F-002-AC19 aucune requête vers une autre origine, et toutes les actions de la barre latérale fonctionnent réseau coupé", async ({
  context,
  page,
  baseURL,
}) => {
  const origine = origineDe(baseURL);
  const adresses = ecouterLeReseau(context, page);
  await ouvrir(page);
  expect(adresses.length).toBeGreaterThan(0);

  await context.setOffline(true);
  const reponse = await page.evaluate(() =>
    fetch(window.location.href).then(
      () => "joignable",
      () => "coupé",
    ),
  );
  expect(reponse).toBe("coupé");

  await creerPageNommee(page, "Hors ligne");
  await activerActionDeRangee(page, "renommer", "Hors ligne");
  await saisirTitre(page, "Renommée hors ligne");
  await activerActionDeRangee(page, "ajouter-une-sous-page", "Renommée hors ligne");
  await saisirTitre(page, "Sous-page hors ligne");
  expect(await titres(page)).toEqual(["Renommée hors ligne", "Sous-page hors ligne"]);

  await basculerRepli(page, "replier", "Renommée hors ligne");
  expect(await titres(page)).toEqual(["Renommée hors ligne"]);
  await basculerRepli(page, "deplier", "Renommée hors ligne");
  expect(await titres(page)).toEqual(["Renommée hors ligne", "Sous-page hors ligne"]);

  await lienDePage(page, "Renommée hors ligne").click();
  await expect(titrePrincipal(page)).toHaveText("Renommée hors ligne");

  await activerActionDeRangee(page, "mettre-a-la-corbeille", "Sous-page hors ligne");
  expect(await titres(page)).toEqual(["Renommée hors ligne"]);
  await activerActionDeRangee(page, "mettre-a-la-corbeille", "Renommée hors ligne");
  await expect(rangees(page)).toHaveCount(0);

  expect(originesEtrangeres(adresses, origine)).toEqual([]);
});

test("F-002-AC21 F-002-AC19 console du navigateur : ni double import de Yjs, ni erreur, ni avertissement, ni exception, rechargement et page introuvable compris", async ({
  page,
}) => {
  const messages = ecouterLaConsole(page);
  await ouvrir(page);

  await creerPageNommee(page, "Racine");
  await activerActionDeRangee(page, "ajouter-une-sous-page", "Racine");
  await saisirTitre(page, "Feuille");
  await lienDePage(page, "Feuille").click();
  await expect(titrePrincipal(page)).toHaveText("Feuille");
  await ecrituresAbouties(page);
  await recharger(page);
  expect(await titres(page)).toEqual(["Racine", "Feuille"]);
  await expect(titrePrincipal(page)).toHaveText("Feuille");
  await activerActionDeRangee(page, "mettre-a-la-corbeille", "Racine");
  await expect(rangees(page)).toHaveCount(0);
  // F-002-AC7 : la page sélectionnée part avec son ancêtre, l'écran revient à l'accueil.
  await expect(titrePrincipal(page)).toHaveText(TITRE_D_ONGLET_SANS_PAGE);
  await page.goto(`/${PREFIXE_DU_FRAGMENT_DE_PAGE}${PAGE_ABSENTE}`);
  await expect(titrePrincipal(page)).toHaveText("Page introuvable");

  expect(messages).toEqual([]);
});

// Sans attendre `ecrituresAbouties` : la persistance valide chaque écriture par `commit()` dès
// qu'elle la pose. Avant cela, le titre était perdu une fois sur quatre (53 pertes sur 210 essais
// dans Chromium, le 2026-10-08).
test("F-002-AC2 des pages créées puis un rechargement immédiat, sans attendre la fin de l'écriture : la même arborescence est relue d'IndexedDB, sans la page mise à la corbeille", async ({
  page,
}) => {
  await ouvrir(page);

  await creerPageNommee(page, "Gardée");
  await activerActionDeRangee(page, "ajouter-une-sous-page", "Gardée");
  await saisirTitre(page, "Sous-page gardée");
  await creerPageNommee(page, "Jetée");
  await activerActionDeRangee(page, "mettre-a-la-corbeille", "Jetée");
  await expect(lienDePage(page, "Jetée")).toHaveCount(0);
  const avantLaDerniere = await arborescence(page);
  await boutonNouvellePage(page).click();
  const champ = page.getByRole("textbox", { name: "Titre de la page" });
  await champ.fill("Écrite juste avant");
  await champ.press("Enter");
  await recharger(page);

  const relue = await arborescence(page);
  expect(relue.map(({ niveau, titre }) => [niveau, titre])).toEqual([
    ["1", "Gardée"],
    ["2", "Sous-page gardée"],
    ["1", "Écrite juste avant"],
  ]);
  expect(relue.slice(0, avantLaDerniere.length)).toEqual(avantLaDerniere);
  const bases = await nomsDesBases(page);
  expect(bases).toHaveLength(2);
  expect(bases[0]).toBe("notionlike:appareil");
  expect(bases[1]).toMatch(/^notionlike:espace:[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
});

test("F-002-AC27 F-002-AC13 l'adresse d'une page porte un UUID canonique ; un fragment forgé ou une page absente donne « Page introuvable », sans rien en afficher, et la barre latérale reste utilisable", async ({
  page,
}) => {
  await ouvrir(page);
  await creerPageNommee(page, "Vraie page");
  const id = await idDePage(page, "Vraie page");
  expect(id).toMatch(UUID_CANONIQUE);
  await lienDePage(page, "Vraie page").click();
  await expect(titrePrincipal(page)).toHaveText("Vraie page");
  await ecrituresAbouties(page);

  // Changement de fragment dans l'onglet ouvert, puis ouverture directe à l'adresse forgée.
  const forges = [
    id.toUpperCase(),
    `${id}${REPERE}`,
    `${id}/${REPERE}`,
    REPERE,
    `${REPERE}<b>${REPERE}</b>`,
    REPERE.repeat(1_000),
  ];
  for (const forge of forges) {
    const interdit = forge === id.toUpperCase() ? forge : REPERE;
    await page.goto(`/${PREFIXE_DU_FRAGMENT_DE_PAGE}${forge}`);
    await constaterPageIntrouvable(page, interdit);
    await recharger(page);
    await constaterPageIntrouvable(page, interdit);
    await page.goto(`/${PREFIXE_DU_FRAGMENT_DE_PAGE}${id}`);
    await expect(titrePrincipal(page)).toHaveText("Vraie page");
  }

  await page.goto(`/${PREFIXE_DU_FRAGMENT_DE_PAGE}${PAGE_ABSENTE}`);
  await constaterPageIntrouvable(page, PAGE_ABSENTE);

  await creerPageNommee(page, "Créée depuis page introuvable");
  expect(await titres(page)).toEqual(["Vraie page", "Créée depuis page introuvable"]);
  expect(await nomsDesBases(page)).toHaveLength(2);
});

test("F-002-AC10 un titre sans caractère visible, saisi au clavier puis validé, donne un lien et des commandes nommés « Sans titre » dans Chromium ; le titre enregistré reste celui saisi, rechargement compris", async ({
  page,
}) => {
  await ouvrir(page);
  await creerPageNommee(page, "Agenda");
  const champ = page.getByRole("textbox", { name: "Titre de la page" });

  for (const saisi of ["   ", "\u200B\u2060\uFEFF"]) {
    await page.getByRole("button", { name: /^Actions de la page « /u }).click();
    await page.getByRole("menuitem", { name: "Renommer", exact: true }).click();
    await champ.fill("");
    await page.keyboard.type(saisi);
    await page.keyboard.press("Enter");

    await expect(lienDePage(page, "Sans titre")).toBeVisible();
    await expect(lienDePage(page, "Sans titre")).toHaveAttribute("aria-current", "page");
    await expect(await atteindreActionDeRangee(page, "renommer", "Sans titre")).toBeVisible();
    await expect(
      await atteindreActionDeRangee(page, "ajouter-une-sous-page", "Sans titre"),
    ).toBeVisible();
    await expect(
      await atteindreActionDeRangee(page, "mettre-a-la-corbeille", "Sans titre"),
    ).toBeVisible();
    await expect(titrePrincipal(page)).toHaveText("Sans titre");
    await expect(page).toHaveTitle("Sans titre · notionLike");

    await ecrituresAbouties(page);
    await recharger(page);
    await expect(lienDePage(page, "Sans titre")).toBeVisible();
    await expect(page).toHaveTitle("Sans titre · notionLike");
    await activerActionDeRangee(page, "renommer", "Sans titre");
    await expect(champ).toHaveValue(saisi);
    await champ.press("Escape");
    await expect(lienDePage(page, "Sans titre")).toBeVisible();
  }
});
