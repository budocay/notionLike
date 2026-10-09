// Bout en bout de F-002 dans Chromium : un contexte de navigateur neuf par test, donc un
// IndexedDB vide. Le serveur est celui que `playwright.config.ts` lance et arrête.
import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";

const PREFIXE_BASE_ESPACE = "notionlike:espace:";
const MAGASIN_DES_MISES_A_JOUR = "updates";
const PROTOCOLES_RESEAU = new Set(["http:", "https:", "ws:", "wss:"]);

interface Rangee {
  readonly niveau: string | null;
  readonly titre: string;
  readonly adresse: string;
}

function barreLaterale(page: Page): Locator {
  return page.getByRole("navigation", { name: "Pages" });
}

function boutonNouvellePage(page: Page): Locator {
  return page.getByRole("button", { name: "Nouvelle page", exact: true });
}

/** Ouvre l'application et attend la fin de la relecture : la barre latérale est là. */
async function ouvrir(page: Page): Promise<void> {
  await page.goto("/");
  await expect(boutonNouvellePage(page)).toBeVisible();
}

async function recharger(page: Page): Promise<void> {
  await page.reload();
  await expect(boutonNouvellePage(page)).toBeVisible();
}

/** Ce que la barre latérale affiche : niveau, titre et adresse de chaque page, dans l'ordre. */
function arborescence(page: Page): Promise<Rangee[]> {
  return barreLaterale(page)
    .getByRole("listitem")
    .evaluateAll((rangees) =>
      rangees.map((rangee) => {
        const lien = rangee.querySelector("a");
        return {
          niveau: rangee.getAttribute("aria-level"),
          titre: lien?.textContent ?? "",
          adresse: lien?.getAttribute("href") ?? "",
        };
      }),
    );
}

async function titres(page: Page): Promise<string[]> {
  return (await arborescence(page)).map((rangee) => rangee.titre);
}

async function saisirTitre(page: Page, titre: string): Promise<void> {
  const champ = page.getByRole("textbox", { name: "Titre de la page" });
  await champ.fill(titre);
  await champ.press("Enter");
  await expect(champ).toBeHidden();
}

async function creerPage(page: Page, titre: string): Promise<void> {
  await boutonNouvellePage(page).click();
  await saisirTitre(page, titre);
  await expect(barreLaterale(page).getByRole("link", { name: titre, exact: true })).toBeVisible();
}

async function action(page: Page, nom: string): Promise<void> {
  await page.getByRole("button", { name: nom, exact: true }).click();
}

// Signal réel de fin d'écriture, sans délai arbitraire : la persistance lance sa transaction
// d'écriture pendant l'action même, et IndexedDB ordonne les transactions d'un même magasin ; une
// lecture ouverte après l'action ne se termine donc qu'une fois ces écritures validées. Le dernier
// scénario du fichier prouve qu'un rechargement immédiat ne perd rien sans cette attente.
async function ecrituresAbouties(page: Page): Promise<void> {
  await page.evaluate(
    async ({ prefixe, magasin }) => {
      const bases = await indexedDB.databases();
      const nom = bases.map((base) => base.name ?? "").find((n) => n.startsWith(prefixe));
      if (nom === undefined) {
        throw new Error("Aucune base d'espace dans ce navigateur.");
      }
      await new Promise<void>((resoudre, rejeter) => {
        const ouverture = indexedDB.open(nom);
        ouverture.onerror = () => rejeter(new Error("Ouverture de la base refusée."));
        ouverture.onsuccess = () => {
          const base = ouverture.result;
          const lecture = base.transaction(magasin, "readonly");
          lecture.objectStore(magasin).count();
          lecture.oncomplete = () => {
            base.close();
            resoudre();
          };
          lecture.onabort = () => rejeter(new Error("Lecture de la base annulée."));
        };
      });
    },
    { prefixe: PREFIXE_BASE_ESPACE, magasin: MAGASIN_DES_MISES_A_JOUR },
  );
}

function origineDe(adresse: string | undefined): string {
  if (adresse === undefined) {
    throw new Error("La configuration de Playwright ne donne pas d'adresse de base.");
  }
  return new URL(adresse).origin;
}

/** Adresses de toutes les requêtes et de tous les WebSockets du contexte, depuis l'appel. */
function ecouterLeReseau(contexte: BrowserContext, page: Page): string[] {
  const adresses: string[] = [];
  contexte.on("request", (requete) => adresses.push(requete.url()));
  page.on("websocket", (canal) => adresses.push(canal.url()));
  return adresses;
}

function originesEtrangeres(adresses: readonly string[], origine: string): string[] {
  const hote = new URL(origine).host;
  return adresses.filter((adresse) => {
    const cible = new URL(adresse);
    return PROTOCOLES_RESEAU.has(cible.protocol) && cible.host !== hote;
  });
}

/** Erreurs de la console et exceptions non interceptées de la page, depuis l'appel. */
function ecouterLesErreurs(page: Page): string[] {
  const erreurs: string[] = [];
  page.on("pageerror", (erreur) => erreurs.push(`exception : ${erreur.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" || /yjs was already imported/i.test(message.text())) {
      erreurs.push(`console (${message.type()}) : ${message.text()}`);
    }
  });
  return erreurs;
}

test("F-002-AC23 créer, renommer, ajouter une sous-page, recharger, mettre à la corbeille, recharger", async ({
  page,
}) => {
  await ouvrir(page);
  await expect(page.getByRole("main")).toContainText("aucune page");

  await boutonNouvellePage(page).click();
  await saisirTitre(page, "");
  await action(page, "Renommer « Sans titre »");
  await saisirTitre(page, "Projet");
  await action(page, "Ajouter une sous-page à « Projet »");
  await saisirTitre(page, "Notes");

  const avant = await arborescence(page);
  expect(avant.map(({ niveau, titre }) => [niveau, titre])).toEqual([
    ["1", "Projet"],
    ["2", "Notes"],
  ]);
  await ecrituresAbouties(page);
  await recharger(page);

  expect(await arborescence(page)).toEqual(avant);

  await action(page, "Mettre « Projet » à la corbeille");
  await expect(barreLaterale(page).getByRole("listitem")).toHaveCount(0);
  await ecrituresAbouties(page);
  await recharger(page);

  await expect(barreLaterale(page).getByRole("listitem")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Projet" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Notes" })).toHaveCount(0);
  await expect(page.getByRole("main")).toContainText("aucune page");
});

test("F-002-AC4 deux onglets ouverts ensemble au premier lancement : chacun crée une page, les deux les affichent après rechargement, dans le même ordre", async ({
  context,
}) => {
  const [premier, second] = await Promise.all([context.newPage(), context.newPage()]);
  await Promise.all([ouvrir(premier), ouvrir(second)]);

  await creerPage(premier, "Du premier onglet");
  await creerPage(second, "Du second onglet");
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

  await creerPage(page, "Hors ligne");
  await action(page, "Renommer « Hors ligne »");
  await saisirTitre(page, "Renommée hors ligne");
  await action(page, "Ajouter une sous-page à « Renommée hors ligne »");
  await saisirTitre(page, "Sous-page hors ligne");
  expect(await titres(page)).toEqual(["Renommée hors ligne", "Sous-page hors ligne"]);

  await action(page, "Replier « Renommée hors ligne »");
  expect(await titres(page)).toEqual(["Renommée hors ligne"]);
  await action(page, "Déplier « Renommée hors ligne »");
  expect(await titres(page)).toEqual(["Renommée hors ligne", "Sous-page hors ligne"]);

  await barreLaterale(page).getByRole("link", { name: "Renommée hors ligne", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Renommée hors ligne");

  await action(page, "Mettre « Sous-page hors ligne » à la corbeille");
  expect(await titres(page)).toEqual(["Renommée hors ligne"]);
  await action(page, "Mettre « Renommée hors ligne » à la corbeille");
  await expect(barreLaterale(page).getByRole("listitem")).toHaveCount(0);

  expect(originesEtrangeres(adresses, origine)).toEqual([]);
});

test("F-002-AC21 F-002-AC19 console du navigateur : ni double import de Yjs, ni erreur, ni exception, rechargement compris", async ({
  page,
}) => {
  const erreurs = ecouterLesErreurs(page);
  await ouvrir(page);

  await creerPage(page, "Racine");
  await action(page, "Ajouter une sous-page à « Racine »");
  await saisirTitre(page, "Feuille");
  await ecrituresAbouties(page);
  await recharger(page);
  expect(await titres(page)).toEqual(["Racine", "Feuille"]);
  await action(page, "Mettre « Racine » à la corbeille");
  await expect(barreLaterale(page).getByRole("listitem")).toHaveCount(0);

  expect(erreurs).toEqual([]);
});

// Sans attendre `ecrituresAbouties` : la persistance valide chaque écriture par `commit()` dès
// qu'elle la pose. Avant cela, le titre était perdu une fois sur quatre (53 pertes sur 210 essais
// dans Chromium, le 2026-10-08).
test("F-002-AC2 un titre validé puis un rechargement immédiat, sans attendre la fin de l'écriture : le titre est relu", async ({
  page,
}) => {
  await ouvrir(page);

  await boutonNouvellePage(page).click();
  const champ = page.getByRole("textbox", { name: "Titre de la page" });
  await champ.fill("Écrit juste avant");
  await champ.press("Enter");
  await recharger(page);

  expect(await titres(page)).toEqual(["Écrit juste avant"]);
});
