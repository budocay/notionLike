// Plusieurs espaces sur un appareil dans Chromium, contre la pile de F-031 (F-032-AC34, H12) : deux
// comptes dans deux contextes de navigateur. Le premier adopte l'espace de son appareil sous le nom
// « Alpha » et y invite le second, qui l'ouvre à côté de l'espace de son appareil, passe de l'un à
// l'autre, en ligne et réseau coupé, le voit passer en lecture seule, en est retiré, puis le retire
// de son appareil. À chaque étape, l'arborescence affichée est celle de l'espace ouvert, et d'aucun
// autre. Ignoré quand le serveur est absent, comme les scénarios de F-013 et F-014 (D-003).
import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  boutonNouvellePage,
  creerPageNommee,
  ecrituresAbouties,
  envoyerSousLePlafond,
  lienDePage,
  nomsDesBases,
  ouvrir,
  PREFIXE_DES_BASES_DE_PAGE,
  recharger,
  titrePrincipal,
  titres,
} from "./aides.ts";

const MOI = "/api/v1/moi";
const MOT_DE_PASSE = "un mot de passe assez long";
const ZONE = "Synchronisation";
const ALPHA = "Alpha";
const ESPACE_DE_CET_APPAREIL = "Espace de cet appareil";
const SUR_CET_APPAREIL = "Sur cet appareil";
const PREFIXE_DES_BASES_D_ESPACE = "notionlike:espace:";
const PREMIERE_SYNCHRONISATION =
  "Première synchronisation de cet espace sur cet appareil : des pages peuvent encore manquer.";
const SYNCHRONISE = "Synchronisé";
const NOM_DU_SECOND = "Second Bout en bout";
const PAGE_D_ALPHA = "Notes d'Alpha";
const PAGE_DE_L_APPAREIL = "Carnet du second";
const FRAPPE_DU_PREMIER = "Écrit par le premier.";
const FRAPPE_DU_SECOND = " Écrit par le second dans Alpha.";
const FRAPPE_DE_L_APPAREIL = "Écrit dans l'espace de l'appareil du second.";
const SYNCHRONISATION_MS = 60_000;
/** Le serveur revérifie le rôle de chaque connexion toutes les 60 secondes (F-013 H7). */
const DROITS_MS = 75_000;

async function serveurPresent(page: Page): Promise<boolean> {
  const reponse = await page.request.get(MOI, { failOnStatusCode: false });
  return reponse.status() === 401 || reponse.status() === 200;
}

async function remplir(page: Page, nom: string, courriel: string): Promise<void> {
  await page.getByLabel("Nom", { exact: false }).fill(nom);
  await page.getByLabel("Courriel", { exact: false }).fill(courriel);
  await page.getByLabel("Mot de passe", { exact: false }).fill(MOT_DE_PASSE);
}

/** Inscription depuis la zone du compte. */
async function inscrire(page: Page, nom: string, courriel: string): Promise<void> {
  const compte = page.getByRole("region", { name: "Compte" });
  await compte.getByRole("link", { name: "Créer un compte" }).click();
  await envoyerSousLePlafond(page, "inscription", async () => {
    await remplir(page, nom, courriel);
    await page.getByRole("button", { name: "Créer le compte" }).click();
  });
  await expect(compte.getByRole("status")).toHaveText(`Connecté : ${nom}`);
}

function etat(page: Page): Locator {
  return page.getByRole("region", { name: ZONE, exact: true }).getByRole("status");
}

function saisie(page: Page): Locator {
  return page.getByRole("textbox", { name: "Contenu de la page" });
}

/** Le sélecteur d'espace qui affiche l'espace ouvert donné (F-032-AC4). */
function selecteur(page: Page, nom: string): Locator {
  return page.getByRole("link", { name: `Espaces — espace courant : ${nom}`, exact: true });
}

function partie(page: Page, titre: string): Locator {
  return page.getByRole("region", { name: titre, exact: true });
}

/** La rangée d'un espace dans une partie de l'écran des espaces. */
function rangee(page: Page, titre: string, nom: string): Locator {
  return partie(page, titre).getByRole("listitem").filter({ hasText: nom });
}

/** Ouvre l'écran des espaces par le sélecteur, quel que soit l'espace ouvert. */
async function allerAuxEspaces(page: Page): Promise<void> {
  await page.getByRole("link", { name: /^Espaces — espace courant : / }).click();
  await expect(titrePrincipal(page)).toHaveText("Espaces");
}

/** L'arborescence affichée est exactement celle-ci : aucune page d'un autre espace (F-032-AC34). */
async function constaterLesPages(page: Page, attendus: readonly string[]): Promise<void> {
  await expect.poll(() => titres(page), { timeout: SYNCHRONISATION_MS }).toEqual(attendus);
}

/**
 * Change d'espace depuis l'écran des espaces (F-032-AC10). Quitter un espace `adopte` dont des
 * modifications n'ont pas été acquittées, ou dont la connexion n'est pas établie, montre la boîte
 * de F-032-AC12 : elle est confirmée par « Changer d'espace ».
 */
async function changerDEspace(page: Page, titreDeLaPartie: string, nom: string): Promise<void> {
  await allerAuxEspaces(page);
  await partie(page, titreDeLaPartie)
    .getByRole("button", { name: `Ouvrir cet espace : ${nom}`, exact: true })
    .click();
  const boite = page.getByRole("alertdialog", { name: "Changer d'espace ?", exact: true });
  const arrivee = selecteur(page, nom);
  await expect(boite.or(arrivee).first()).toBeVisible({ timeout: 10_000 });
  if (await boite.isVisible()) {
    await boite.getByRole("button", { name: "Changer d'espace", exact: true }).click();
  }
  await expect(arrivee).toBeVisible();
  await expect(boite).toHaveCount(0);
}

/** Identifiant de l'espace d'après le nom de sa base de document d'espace (F-002 H3). */
async function espacesDesBases(page: Page): Promise<string[]> {
  return (await nomsDesBases(page))
    .filter((nom) => nom.startsWith(PREFIXE_DES_BASES_D_ESPACE))
    .map((nom) => nom.slice(PREFIXE_DES_BASES_D_ESPACE.length));
}

/** Bases du contexte dont le nom porte l'identifiant donné. */
async function basesDe(page: Page, idEspace: string): Promise<string[]> {
  return (await nomsDesBases(page)).filter((nom) => nom.includes(idEspace));
}

interface Fenetre {
  phrasesVues?: string[][];
}

/**
 * Relève chaque état de la zone de synchronisation, phrase par phrase, dès l'appel et sans délai :
 * la première synchronisation d'un petit espace peut s'achever avant qu'une attente la voie.
 */
async function suivreLaZone(page: Page): Promise<void> {
  await page.evaluate((nomDeLaZone) => {
    const vues: string[][] = [];
    (window as Fenetre).phrasesVues = vues;
    const relever = (): void => {
      const zone = document.querySelector(`section[aria-label="${nomDeLaZone}"] [role="status"]`);
      const phrases =
        zone === null ? [] : [...zone.querySelectorAll("p")].map((p) => p.textContent);
      if (JSON.stringify(phrases) !== JSON.stringify(vues.at(-1))) {
        vues.push(phrases);
      }
    };
    relever();
    new MutationObserver(relever).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }, ZONE);
}

async function phrasesVues(page: Page): Promise<string[][]> {
  return page.evaluate(() => (window as Fenetre).phrasesVues ?? []);
}

test("F-032-AC34 deux comptes : adopter « Alpha », inviter en éditeur, l'ouvrir à côté de l'espace de l'appareil, passer de l'un à l'autre en ligne, au rechargement et réseau coupé, lecture seule, retrait du membre puis de l'appareil ; aucune page d'un espace ne s'affiche dans l'autre", async ({
  browser,
}) => {
  const contexteDuPremier = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const premier = await contexteDuPremier.newPage();
  test.skip(!(await serveurPresent(premier)), "serveur de F-008 absent (pile Docker Compose)");
  test.setTimeout(420_000);
  const suffixe = Date.now().toString(36);

  // Le premier écrit une page dans l'espace de son appareil, puis l'adopte sous le nom « Alpha ».
  await ouvrir(premier);
  await creerPageNommee(premier, PAGE_D_ALPHA);
  await saisie(premier).click();
  await premier.keyboard.type(FRAPPE_DU_PREMIER);
  await inscrire(premier, "Premier Bout en bout", `premier-${suffixe}@exemple.fr`);
  await expect(etat(premier)).toContainText("Sur cet appareil uniquement");
  await premier
    .getByRole("region", { name: ZONE, exact: true })
    .getByRole("button", { name: "Synchroniser cet espace" })
    .click();
  await premier.getByLabel("Nom de l'espace", { exact: false }).fill(ALPHA);
  await premier.getByRole("button", { name: "Synchroniser", exact: true }).click();
  await expect(etat(premier)).toContainText(SYNCHRONISE, { timeout: SYNCHRONISATION_MS });
  const espacesDuPremier = await espacesDesBases(premier);
  expect(espacesDuPremier).toHaveLength(1);
  const idAlpha = espacesDuPremier[0] ?? "";
  await constaterLesPages(premier, [PAGE_D_ALPHA]);

  // Il crée un lien d'invitation « Éditeur » depuis l'écran d'« Alpha », et le copie.
  await allerAuxEspaces(premier);
  await partie(premier, ESPACE_DE_CET_APPAREIL)
    .getByRole("link", { name: `Ouvrir l'espace ${ALPHA}`, exact: true })
    .click();
  await expect(titrePrincipal(premier)).toHaveText(ALPHA);
  await premier.getByRole("combobox", { name: "Rôle donné par le lien" }).selectOption("editeur");
  await premier.getByRole("button", { name: /^Créer un lien d'invitation/ }).click();
  const boiteDuLien = premier.getByRole("dialog", { name: "Lien d'invitation" });
  await boiteDuLien.getByRole("button", { name: "Copier le lien" }).click();
  await expect(boiteDuLien.getByText("Lien copié")).toBeVisible();
  const lien = await premier.evaluate(() => navigator.clipboard.readText());
  expect(lien).toMatch(/\/#\/invitation\/[A-Za-z0-9_-]{43}$/);
  await premier.keyboard.press("Escape");
  await lienDePage(premier, PAGE_D_ALPHA).click();
  await expect(saisie(premier)).toContainText(FRAPPE_DU_PREMIER);

  // Le second, sur un contexte neuf, accepte l'invitation : l'espace n'est pas encore ouvert.
  const contexteDuSecond = await browser.newContext();
  const second = await contexteDuSecond.newPage();
  await ouvrir(second);
  await constaterLesPages(second, []);
  await second.goto(lien);
  await expect(titrePrincipal(second)).toHaveText("Invitation");
  await second.getByRole("button", { name: "Créer un compte" }).click();
  await envoyerSousLePlafond(second, "inscription", async () => {
    await remplir(second, NOM_DU_SECOND, `second-${suffixe}@exemple.fr`);
    await second.getByRole("button", { name: "Créer le compte" }).click();
  });
  await expect(second).toHaveURL(/#\/invitation$/);
  await second.getByRole("button", { name: "Rejoindre l'espace" }).click();
  await expect(
    second.getByText(`Vous avez rejoint « ${ALPHA} » en tant que Éditeur.`),
  ).toBeVisible();
  await expect(selecteur(second, ESPACE_DE_CET_APPAREIL)).toBeVisible();
  await constaterLesPages(second, []);

  // « Ouvrir cet espace » : la mention de première synchronisation, puis la page du premier et
  // « Synchronisé », la mention ayant disparu.
  await suivreLaZone(second);
  await second.getByRole("button", { name: `Ouvrir cet espace : ${ALPHA}`, exact: true }).click();
  await expect(selecteur(second, ALPHA)).toBeVisible({ timeout: 10_000 });
  await constaterLesPages(second, [PAGE_D_ALPHA]);
  await expect(etat(second)).toContainText(SYNCHRONISE, { timeout: SYNCHRONISATION_MS });
  await expect(etat(second)).not.toContainText(PREMIERE_SYNCHRONISATION);
  const vues = await phrasesVues(second);
  const premiereMention = vues.findIndex((phrases) => phrases.includes(PREMIERE_SYNCHRONISATION));
  const premierSynchronise = vues.findIndex((phrases) => phrases.includes(SYNCHRONISE));
  expect(premiereMention, `états de la zone : ${JSON.stringify(vues)}`).toBeGreaterThanOrEqual(0);
  expect(premiereMention).toBeLessThan(premierSynchronise);
  expect(vues[premierSynchronise]).not.toContain(PREMIERE_SYNCHRONISATION);

  // Le second écrit dans « Alpha » ; le premier lit sa frappe.
  await lienDePage(second, PAGE_D_ALPHA).click();
  await expect(saisie(second)).toContainText(FRAPPE_DU_PREMIER, { timeout: SYNCHRONISATION_MS });
  await saisie(second).click();
  await second.keyboard.press("End");
  await second.keyboard.type(FRAPPE_DU_SECOND);
  await expect(saisie(premier)).toContainText(FRAPPE_DU_SECOND.trim(), {
    timeout: SYNCHRONISATION_MS,
  });

  // Il revient à l'espace de son appareil, y écrit, recharge : l'espace de l'appareil est rouvert.
  await changerDEspace(second, ESPACE_DE_CET_APPAREIL, ESPACE_DE_CET_APPAREIL);
  await constaterLesPages(second, []);
  await creerPageNommee(second, PAGE_DE_L_APPAREIL);
  await saisie(second).click();
  await second.keyboard.type(FRAPPE_DE_L_APPAREIL);
  await constaterLesPages(second, [PAGE_DE_L_APPAREIL]);
  await ecrituresAbouties(second);
  await ecrituresAbouties(second, PREFIXE_DES_BASES_DE_PAGE);
  await recharger(second);
  await expect(selecteur(second, ESPACE_DE_CET_APPAREIL)).toBeVisible();
  await constaterLesPages(second, [PAGE_DE_L_APPAREIL]);
  await lienDePage(second, PAGE_DE_L_APPAREIL).click();
  await expect(saisie(second)).toContainText(FRAPPE_DE_L_APPAREIL);
  await constaterLesPages(premier, [PAGE_D_ALPHA]);
  const espacesDuSecond = await espacesDesBases(second);
  expect(espacesDuSecond).toContain(idAlpha);
  expect(espacesDuSecond).toHaveLength(2);
  const idDeLAppareil = espacesDuSecond.find((id) => id !== idAlpha) ?? "";

  // Réseau coupé, il repasse sur « Alpha », ouvert depuis ses bases : sa page, « Hors ligne ».
  await contexteDuSecond.setOffline(true);
  await changerDEspace(second, SUR_CET_APPAREIL, ALPHA);
  await constaterLesPages(second, [PAGE_D_ALPHA]);
  await expect(etat(second)).toContainText("Hors ligne", { timeout: SYNCHRONISATION_MS });
  await lienDePage(second, PAGE_D_ALPHA).click();
  await expect(saisie(second)).toContainText(FRAPPE_DU_PREMIER);
  await expect(saisie(second)).toContainText(FRAPPE_DU_SECOND.trim());

  // Réseau rétabli, le premier le passe « Lecteur » : le second est en lecture seule.
  await contexteDuSecond.setOffline(false);
  await expect(etat(second)).toContainText(SYNCHRONISE, { timeout: SYNCHRONISATION_MS });
  await allerAuxEspaces(premier);
  await partie(premier, ESPACE_DE_CET_APPAREIL)
    .getByRole("link", { name: `Ouvrir l'espace ${ALPHA}`, exact: true })
    .click();
  await expect(titrePrincipal(premier)).toHaveText(ALPHA);
  await premier.getByRole("combobox", { name: `Rôle de ${NOM_DU_SECOND}` }).selectOption("lecteur");
  await expect(premier.getByText(`Rôle de ${NOM_DU_SECOND} : Lecteur`)).toBeVisible();
  await expect(etat(second)).toContainText("Lecture seule", { timeout: DROITS_MS });
  await expect(boutonNouvellePage(second)).toBeDisabled();
  await expect(saisie(second)).toHaveAttribute("contenteditable", "false");
  await constaterLesPages(second, [PAGE_D_ALPHA]);

  // Le premier le retire de l'espace ; après relecture de la liste, le second lit la mention.
  await premier
    .getByRole("button", { name: `Retirer ${NOM_DU_SECOND} de l'espace`, exact: true })
    .click();
  await premier
    .getByRole("alertdialog")
    .getByRole("button", { name: `Retirer ${NOM_DU_SECOND} de l'espace`, exact: true })
    .click();
  await expect(premier.getByText(`${NOM_DU_SECOND} a été retiré de l'espace`)).toBeVisible();
  await allerAuxEspaces(second);
  await expect(rangee(second, SUR_CET_APPAREIL, ALPHA)).toContainText(
    "Ne se synchronise plus avec ce compte",
  );

  // Il revient à l'espace de son appareil et retire « Alpha » de l'appareil.
  await changerDEspace(second, ESPACE_DE_CET_APPAREIL, ESPACE_DE_CET_APPAREIL);
  await constaterLesPages(second, [PAGE_DE_L_APPAREIL]);
  const basesDeLAppareil = await basesDe(second, idDeLAppareil);
  expect(basesDeLAppareil).toContain(`${PREFIXE_DES_BASES_D_ESPACE}${idDeLAppareil}`);
  expect(basesDeLAppareil.length).toBeGreaterThanOrEqual(2);
  expect(await basesDe(second, idAlpha)).not.toEqual([]);
  await allerAuxEspaces(second);
  await partie(second, SUR_CET_APPAREIL)
    .getByRole("button", { name: `Retirer de cet appareil : ${ALPHA}`, exact: true })
    .click();
  const retrait = second.getByRole("alertdialog", {
    name: `Retirer « ${ALPHA} » de cet appareil ?`,
    exact: true,
  });
  await retrait
    .getByRole("button", { name: `Retirer de cet appareil : ${ALPHA}`, exact: true })
    .click();
  await expect(second.getByText(`« ${ALPHA} » a été retiré de cet appareil`)).toBeAttached();
  await expect(retrait).toHaveCount(0);
  await expect(rangee(second, SUR_CET_APPAREIL, ALPHA)).toHaveCount(0);

  // Plus aucune base d'« Alpha » dans son contexte ; celles de l'espace de son appareil, intactes.
  await expect.poll(() => basesDe(second, idAlpha)).toEqual([]);
  expect(await basesDe(second, idDeLAppareil)).toEqual(basesDeLAppareil);
  await constaterLesPages(second, [PAGE_DE_L_APPAREIL]);
  await constaterLesPages(premier, [PAGE_D_ALPHA]);
  await contexteDuPremier.close();
  await contexteDuSecond.close();
});
