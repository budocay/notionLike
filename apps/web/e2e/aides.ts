// Aides partagées des scénarios de bout en bout : ouverture, barre latérale, fin des écritures
// IndexedDB, écoute du réseau et de la console. Aucun test ici : Playwright ne lit que `*.spec.ts`.
import { type BrowserContext, expect, type Locator, type Page } from "@playwright/test";

/** Bases qui reçoivent les mises à jour d'un document ; celle des réglages de l'appareil non. */
const PREFIXES_DES_BASES_DE_DOCUMENT = ["notionlike:espace:", "notionlike:page:"];
const MAGASIN_DES_MISES_A_JOUR = "updates";
const PROTOCOLES_RESEAU = new Set(["http:", "https:", "ws:", "wss:"]);

export function barreLaterale(page: Page): Locator {
  return page.getByRole("navigation", { name: "Pages" });
}

export function boutonNouvellePage(page: Page): Locator {
  return page.getByRole("button", { name: "Nouvelle page", exact: true });
}

/** Ouvre l'application et attend la fin de la relecture : la barre latérale est là. */
export async function ouvrir(page: Page): Promise<void> {
  await page.goto("/");
  await expect(boutonNouvellePage(page)).toBeVisible();
}

export async function recharger(page: Page): Promise<void> {
  await page.reload();
  await expect(boutonNouvellePage(page)).toBeVisible();
}

export async function creerPage(page: Page, titre: string): Promise<void> {
  await boutonNouvellePage(page).click();
  const champ = page.getByRole("textbox", { name: "Titre de la page" });
  await champ.fill(titre);
  await champ.press("Enter");
  await expect(champ).toBeHidden();
  await expect(lienDePage(page, titre)).toBeVisible();
}

export function lienDePage(page: Page, titre: string): Locator {
  return barreLaterale(page).getByRole("link", { name: titre, exact: true });
}

// Signal réel de fin d'écriture, sans délai arbitraire : la persistance lance sa transaction
// d'écriture pendant l'action même, et IndexedDB ordonne les transactions d'un même magasin, toutes
// connexions confondues ; une lecture ouverte après l'action ne se termine donc qu'une fois ces
// écritures validées. Toutes les bases de document sont attendues : celle de l'espace et celle de
// chaque page, y compris d'une page qu'on vient de quitter.
export async function ecrituresAbouties(page: Page): Promise<void> {
  await page.evaluate(
    async ({ prefixes, magasin }) => {
      const noms = (await indexedDB.databases())
        .map((base) => base.name ?? "")
        .filter((nom) => prefixes.some((prefixe) => nom.startsWith(prefixe)));
      if (noms.length === 0) {
        throw new Error("Aucune base de document dans ce navigateur.");
      }
      const attendre = (nom: string): Promise<void> =>
        new Promise<void>((resoudre, rejeter) => {
          const ouverture = indexedDB.open(nom);
          ouverture.onerror = () => rejeter(new Error(`Ouverture de la base ${nom} refusée.`));
          ouverture.onsuccess = () => {
            const base = ouverture.result;
            const lecture = base.transaction(magasin, "readonly");
            lecture.objectStore(magasin).count();
            lecture.oncomplete = () => {
              base.close();
              resoudre();
            };
            lecture.onabort = () => rejeter(new Error(`Lecture de la base ${nom} annulée.`));
          };
        });
      await Promise.all(noms.map(attendre));
    },
    { prefixes: PREFIXES_DES_BASES_DE_DOCUMENT, magasin: MAGASIN_DES_MISES_A_JOUR },
  );
}

export function origineDe(adresse: string | undefined): string {
  if (adresse === undefined) {
    throw new Error("La configuration de Playwright ne donne pas d'adresse de base.");
  }
  return new URL(adresse).origin;
}

/** Adresses de toutes les requêtes et de tous les WebSockets du contexte, depuis l'appel. */
export function ecouterLeReseau(contexte: BrowserContext, page: Page): string[] {
  const adresses: string[] = [];
  contexte.on("request", (requete) => adresses.push(requete.url()));
  page.on("websocket", (canal) => adresses.push(canal.url()));
  return adresses;
}

export function originesEtrangeres(adresses: readonly string[], origine: string): string[] {
  const hote = new URL(origine).host;
  return adresses.filter((adresse) => {
    const cible = new URL(adresse);
    return PROTOCOLES_RESEAU.has(cible.protocol) && cible.host !== hote;
  });
}

/** Erreurs et avertissements de la console, exceptions non interceptées, depuis l'appel. */
export function ecouterLaConsole(page: Page): string[] {
  const messages: string[] = [];
  page.on("pageerror", (erreur) => messages.push(`exception : ${erreur.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      messages.push(`console (${message.type()}) : ${message.text()}`);
    }
  });
  return messages;
}
