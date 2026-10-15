// Synchronisation dans Chromium, à travers le relais de Vite, contre la pile de F-008 (F-013-AC41,
// AC43). Ignoré quand le serveur est absent, comme les autres scénarios qui le demandent.
import { CHEMIN_SYNCHRO, CHEMINS_ESPACES } from "@notionlike/contrats";
import { expect, type Page, test } from "@playwright/test";

import { creerPageNommee, envoyerSousLePlafond, lienDePage, ouvrir } from "./aides.ts";

const MOI = "/api/v1/moi";
const MOT_DE_PASSE = "un mot de passe assez long";
const ZONE = "Synchronisation";

async function serveurPresent(page: Page): Promise<boolean> {
  const reponse = await page.request.get(MOI, { failOnStatusCode: false });
  return reponse.status() === 401 || reponse.status() === 200;
}

async function inscrire(page: Page, courriel: string): Promise<void> {
  const compte = page.getByRole("region", { name: "Compte" });
  await compte.getByRole("link", { name: "Créer un compte" }).click();
  await envoyerSousLePlafond(page, "inscription", async () => {
    await page.getByLabel("Nom", { exact: false }).fill("Synchro Bout en bout");
    await page.getByLabel("Courriel", { exact: false }).fill(courriel);
    await page.getByLabel("Mot de passe", { exact: false }).fill(MOT_DE_PASSE);
    await page.getByRole("button", { name: "Créer le compte" }).click();
  });
  await expect(compte.getByRole("status")).toContainText("Connecté");
}

async function connecter(page: Page, courriel: string): Promise<void> {
  const compte = page.getByRole("region", { name: "Compte" });
  await compte.getByRole("link", { name: "Se connecter" }).click();
  await envoyerSousLePlafond(page, "connexion", async () => {
    await page.getByLabel("Courriel", { exact: false }).fill(courriel);
    await page.getByLabel("Mot de passe", { exact: false }).fill(MOT_DE_PASSE);
    await page.getByRole("button", { name: "Se connecter" }).click();
  });
  await expect(compte.getByRole("status")).toContainText("Connecté");
}

function etat(page: Page) {
  return page.getByRole("region", { name: ZONE }).getByRole("status");
}

function saisie(page: Page) {
  return page.getByRole("textbox", { name: "Contenu de la page" });
}

// ---------------------------------------------------------------------------------------------
// F-013-AC41 : ce que le script d'une page lit, à travers le relais, de chaque canal de F-012 H8.

interface Lu {
  readonly ouverture?: string;
  readonly fermetureDOuverture?: string;
  readonly code?: number;
  readonly raison?: string;
  readonly erreur?: boolean;
}

/**
 * Ouvre une WebSocket sur le point de synchronisation, joue `scenario` (des messages encodés dans
 * le protocole de la bibliothèque) et rend ce que le script en lit. Exécuté dans la page.
 */
function lireDansLaPage(
  page: Page,
  scenario: "nom-invalide" | "message-trop-grand" | "debit" | "rien" | "espace",
  nom = "",
): Promise<Lu> {
  return page.evaluate(
    async ({ chemin, scenario, nom }) => {
      const varUint = (n: number, sortie: number[]): void => {
        let reste = n;
        while (reste > 127) {
          sortie.push((reste & 127) | 128);
          reste = Math.floor(reste / 128);
        }
        sortie.push(reste);
      };
      const varString = (texte: string, sortie: number[]): void => {
        const octets = new TextEncoder().encode(texte);
        varUint(octets.length, sortie);
        sortie.push(...octets);
      };
      const authentification = (document: string): Uint8Array<ArrayBuffer> => {
        const sortie: number[] = [];
        varString(document, sortie);
        varUint(2, sortie);
        varUint(0, sortie);
        varString("notionlike", sortie);
        return new Uint8Array(sortie);
      };
      const lire = (octets: Uint8Array): { type: number; sous: number; texte: string } => {
        let position = 0;
        const entier = (): number => {
          let valeur = 0;
          let facteur = 1;
          for (;;) {
            const octet = octets[position] ?? 0;
            position += 1;
            valeur += (octet & 127) * facteur;
            if (octet < 128) {
              return valeur;
            }
            facteur *= 128;
          }
        };
        const chaine = (): string => {
          const longueur = entier();
          const texte = new TextDecoder().decode(octets.subarray(position, position + longueur));
          position += longueur;
          return texte;
        };
        chaine();
        const type = entier();
        if (type === 7) {
          return { type, sous: 0, texte: chaine() };
        }
        if (type === 2) {
          const sous = entier();
          return { type, sous, texte: sous === 1 ? chaine() : "" };
        }
        return { type, sous: 0, texte: "" };
      };
      const schema = window.location.protocol === "https:" ? "wss:" : "ws:";
      const prise = new WebSocket(`${schema}//${window.location.host}${chemin}`);
      prise.binaryType = "arraybuffer";
      return new Promise<Lu>((resoudre) => {
        const lu: { -readonly [Cle in keyof Lu]: Lu[Cle] } = {};
        const fin = setTimeout(() => {
          prise.close();
          resoudre(lu);
        }, 15_000);
        prise.onerror = () => {
          lu.erreur = true;
        };
        prise.onclose = (evenement) => {
          clearTimeout(fin);
          resoudre({ ...lu, code: evenement.code, raison: evenement.reason });
        };
        prise.onmessage = (evenement) => {
          const message = lire(new Uint8Array(evenement.data as ArrayBuffer));
          if (message.type === 2 && message.sous === 1) {
            lu.ouverture = message.texte;
            if (scenario === "nom-invalide") {
              clearTimeout(fin);
              prise.close();
              resoudre(lu);
            }
          } else if (message.type === 7) {
            lu.fermetureDOuverture = message.texte;
            clearTimeout(fin);
            prise.close();
            resoudre(lu);
          }
        };
        prise.onopen = () => {
          if (scenario === "nom-invalide") {
            prise.send(authentification("page:pas-un-identifiant"));
          } else if (scenario === "message-trop-grand") {
            prise.send(new Uint8Array(5_242_880 + 1024));
          } else if (scenario === "debit") {
            for (let rang = 0; rang < 700; rang += 1) {
              prise.send(authentification("page:pas-un-identifiant"));
            }
          } else if (scenario === "espace") {
            prise.send(authentification(nom));
          }
        };
      });
    },
    { chemin: CHEMIN_SYNCHRO, scenario, nom },
  );
}

test("F-013-AC41 à travers le relais de Vite, le script lit la raison d'un refus et d'une fermeture d'ouverture, le code et la raison d'une fermeture 1008, le code 1009 ; un refus de connexion n'expose ni statut ni corps", async ({
  browser,
}) => {
  const contexte = await browser.newContext();
  const page = await contexte.newPage();
  test.skip(!(await serveurPresent(page)), "serveur de F-008 absent (pile Docker Compose)");
  await ouvrir(page);

  // Sans session : la demande de passage est refusée (401), le script ne voit qu'une fermeture.
  const refus = await lireDansLaPage(page, "rien");
  expect(refus).toEqual({ erreur: true, code: 1006, raison: "" });

  await inscrire(page, `synchro-${Date.now().toString(36)}@exemple.fr`);
  expect((await lireDansLaPage(page, "nom-invalide")).ouverture).toBe("nom-de-document-invalide");
  expect(await lireDansLaPage(page, "message-trop-grand")).toMatchObject({ code: 1009 });
  expect(await lireDansLaPage(page, "debit")).toMatchObject({
    code: 1008,
    raison: "trop-de-requetes",
  });

  // Fermeture d'une ouverture : l'espace est supprimé pendant qu'elle est acquise.
  const idEspace = crypto.randomUUID();
  const creation = await page.request.post(CHEMINS_ESPACES.espaces, {
    data: { idEspace, nom: "Éphémère" },
  });
  expect(creation.status()).toBe(201);
  const lecture = lireDansLaPage(page, "espace", `espace:${idEspace}`);
  await page.waitForTimeout(1000);
  await page.request.delete(CHEMINS_ESPACES.espace.replace(":idEspace", idEspace));
  expect((await lecture).fermetureDOuverture).toBe("acces-refuse");
  // Le code 1001 (arrêt du serveur) suppose d'arrêter la pile pendant le test : il est éprouvé
  // contre le serveur réel sous Node (F-013-AC20), non dans ce scénario.
  await contexte.close();
});

// ---------------------------------------------------------------------------------------------
// F-013-AC43 : deux contextes du même compte, une coupure, deux onglets.

async function poserLEspace(page: Page, idEspace: string): Promise<void> {
  await page.evaluate(async (id) => {
    const base = await new Promise<IDBDatabase>((resoudre, rejeter) => {
      const demande = indexedDB.open("notionlike:appareil");
      demande.onsuccess = () => resoudre(demande.result);
      demande.onerror = () => rejeter(demande.error ?? new Error("base de l'appareil"));
    });
    await new Promise<void>((resoudre, rejeter) => {
      const transaction = base.transaction("reglages", "readwrite");
      const magasin = transaction.objectStore("reglages");
      magasin.put(id, "espace-local");
      magasin.put({ rattachement: "adopte", droit: "ecriture" }, `registre:${id}`);
      transaction.oncomplete = () => resoudre();
      transaction.onerror = () => rejeter(transaction.error ?? new Error("réglages"));
    });
    base.close();
  }, idEspace);
  await page.reload();
}

test("F-013-AC43 écrire hors synchronisation, adopter, lire sur un second contexte, se couper et converger, puis voir une frappe d'un autre onglet sans réseau", async ({
  browser,
}) => {
  const premier = await browser.newContext();
  const a = await premier.newPage();
  test.skip(!(await serveurPresent(a)), "serveur de F-008 absent (pile Docker Compose)");
  const courriel = `synchro-${Date.now().toString(36)}@exemple.fr`;

  await ouvrir(a);
  await creerPageNommee(a, "Notes partagées");
  await saisie(a).click();
  await a.keyboard.type("Avant l'adoption.");
  await inscrire(a, courriel);
  await expect(etat(a)).toContainText("Sur cet appareil uniquement");
  await a
    .getByRole("region", { name: ZONE })
    .getByRole("button", { name: "Synchroniser cet espace" })
    .click();
  await a.getByLabel("Nom de l'espace", { exact: false }).fill("Bout en bout");
  await a.getByRole("button", { name: "Synchroniser", exact: true }).click();
  await expect(etat(a)).toContainText("Synchronisé", { timeout: 30_000 });
  const idEspace = await a.evaluate(() =>
    indexedDB
      .databases()
      .then((bases) =>
        (bases.find(({ name }) => name?.startsWith("notionlike:espace:"))?.name ?? "").slice(
          "notionlike:espace:".length,
        ),
      ),
  );

  const second = await browser.newContext();
  const b = await second.newPage();
  await ouvrir(b);
  await connecter(b, courriel);
  await poserLEspace(b, idEspace);
  await expect(lienDePage(b, "Notes partagées")).toBeVisible({ timeout: 30_000 });
  await lienDePage(b, "Notes partagées").click();
  await expect(saisie(b)).toContainText("Avant l'adoption.", { timeout: 30_000 });

  await premier.setOffline(true);
  await expect(etat(a)).toContainText("Hors ligne", { timeout: 30_000 });
  await saisie(a).click();
  await a.keyboard.press("End");
  await a.keyboard.type(" Écrit hors ligne.");
  await saisie(b).click();
  await b.keyboard.press("End");
  await b.keyboard.type(" Écrit en ligne.");
  await premier.setOffline(false);
  await expect(etat(a)).toContainText("Synchronisé", { timeout: 60_000 });
  await expect(etat(b)).toContainText("Synchronisé", { timeout: 60_000 });
  await expect(saisie(a)).toHaveText(await saisie(b).innerText());
  await expect(saisie(a)).toContainText("Écrit hors ligne.");
  await expect(saisie(a)).toContainText("Écrit en ligne.");

  const autreOnglet = await premier.newPage();
  await ouvrir(autreOnglet, a.url());
  await premier.setOffline(true);
  await saisie(a).click();
  await a.keyboard.press("End");
  await a.keyboard.type(" Vu dans l'autre onglet.");
  await expect(saisie(autreOnglet)).toContainText("Vu dans l'autre onglet.", { timeout: 5000 });
  await premier.close();
  await second.close();
});
