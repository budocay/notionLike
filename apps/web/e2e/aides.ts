// Aides partagées des scénarios de bout en bout : ouverture, barre latérale, actions de rangée, fin
// des écritures IndexedDB, écoute du réseau et de la console. Aucun test ici : Playwright ne lit
// que `*.spec.ts`.
import { CHEMINS_COMPTES } from "@notionlike/contrats";
import {
  type BrowserContext,
  type ConsoleMessage,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";

/** Base qui reçoit les mises à jour du document d'espace ; celle des réglages de l'appareil non. */
const PREFIXE_DES_BASES_D_ESPACE = "notionlike:espace:";
/** Bases des documents de page (F-003-AC1). */
export const PREFIXE_DES_BASES_DE_PAGE = "notionlike:page:";
const MAGASIN_DES_MISES_A_JOUR = "updates";
const PROTOCOLES_RESEAU = new Set(["http:", "https:", "ws:", "wss:"]);

/** Ce que la barre latérale affiche d'une page : sa profondeur, son titre, son adresse. */
export interface RangeeVisee {
  readonly niveau: string | null;
  readonly titre: string;
  readonly adresse: string;
}

export function barreLaterale(page: Page): Locator {
  return page.getByRole("navigation", { name: "Pages" });
}

export function boutonNouvellePage(page: Page): Locator {
  return page.getByRole("button", { name: "Nouvelle page", exact: true });
}

export function rangees(page: Page): Locator {
  return barreLaterale(page).getByRole("listitem");
}

export function lienDePage(page: Page, titre: string): Locator {
  return barreLaterale(page).getByRole("link", { name: titre, exact: true });
}

/** Le titre de la zone principale : celui de la page ouverte, ou « Page introuvable ». */
export function titrePrincipal(page: Page): Locator {
  return page.getByRole("main").getByRole("heading", { level: 1 });
}

/** Ouvre l'application à l'adresse donnée et attend la fin de la relecture : la barre est là. */
export async function ouvrir(page: Page, adresse = "/"): Promise<void> {
  await page.goto(adresse);
  await expect(boutonNouvellePage(page)).toBeVisible();
}

export async function recharger(page: Page): Promise<void> {
  await page.reload();
  await expect(boutonNouvellePage(page)).toBeVisible();
}

/** Niveau, titre et adresse de chaque page de la barre latérale, dans l'ordre affiché. */
export function arborescence(page: Page): Promise<RangeeVisee[]> {
  return rangees(page).evaluateAll((elements) =>
    elements.map((element) => {
      const lien = element.querySelector("a");
      return {
        niveau: element.getAttribute("aria-level"),
        titre: lien?.textContent ?? "",
        adresse: lien?.getAttribute("href") ?? "",
      };
    }),
  );
}

export async function titres(page: Page): Promise<string[]> {
  return (await arborescence(page)).map((rangee) => rangee.titre);
}

/** Valide la saisie de titre ouverte, avec le titre donné. */
export async function saisirTitre(page: Page, titre: string): Promise<void> {
  const champ = page.getByRole("textbox", { name: "Titre de la page" });
  await champ.fill(titre);
  await champ.press("Enter");
  await expect(champ).toBeHidden();
}

/** Crée une page à la racine et lui donne un titre. */
export async function creerPageNommee(page: Page, titre: string): Promise<void> {
  await boutonNouvellePage(page).click();
  await saisirTitre(page, titre);
  await expect(lienDePage(page, titre)).toBeVisible();
}

export type ActionDeRangeeVisee = "renommer" | "ajouter-une-sous-page" | "mettre-a-la-corbeille";

const ENTREE_DE_L_ACTION: Readonly<Record<ActionDeRangeeVisee, string>> = {
  renommer: "Renommer",
  "ajouter-une-sous-page": "Ajouter une sous-page",
  "mettre-a-la-corbeille": "Mettre à la corbeille",
};

export function nomDuMenu(titre: string): string {
  return `Actions de la page « ${titre} »`;
}

export function nomAjouterSousPage(titre: string): string {
  return `Ajouter une sous-page à « ${titre} »`;
}

/** Nom de la commande de repli : il ne dit plus l'état, que porte `aria-expanded` (F-004-AC56). */
export function nomDuRepli(titre: string): string {
  return `Sous-pages de « ${titre} »`;
}

/** Bouton « ⋯ » de la page au titre affiché donné. */
export function boutonDuMenu(page: Page, titre: string): Locator {
  return page.getByRole("button", { name: nomDuMenu(titre), exact: true });
}

export function menuDePage(page: Page, titre: string): Locator {
  return page.getByRole("menu", { name: nomDuMenu(titre), exact: true });
}

/**
 * Seul chemin des scénarios vers une action de rangée, le même que celui de
 * `test/aides-coquille.tsx` : la commande de la page au titre affiché donné, retrouvée par son rôle
 * et son nom accessible, jamais par sa place. Depuis F-004, « Renommer » et « Mettre à la
 * corbeille » sont des entrées du menu « ⋯ » de la rangée, que ce chemin ouvre ; « Ajouter une
 * sous-page » reste un bouton de la rangée (F-004-AC25, AC26).
 */
export async function atteindreActionDeRangee(
  page: Page,
  action: ActionDeRangeeVisee,
  titre: string,
): Promise<Locator> {
  if (action === "ajouter-une-sous-page") {
    return page.getByRole("button", { name: nomAjouterSousPage(titre), exact: true });
  }
  const menu = menuDePage(page, titre);
  if (!(await menu.isVisible())) {
    await boutonDuMenu(page, titre).click();
  }
  return menu.getByRole("menuitem", { name: ENTREE_DE_L_ACTION[action], exact: true });
}

export async function activerActionDeRangee(
  page: Page,
  action: ActionDeRangeeVisee,
  titre: string,
): Promise<void> {
  await (await atteindreActionDeRangee(page, action, titre)).click();
}

export type RepliVise = "replier" | "deplier";

/** Replie ou déplie la page au titre donné : la commande, au nom stable, doit être dans l'état inverse. */
export async function basculerRepli(page: Page, repli: RepliVise, titre: string): Promise<void> {
  const commande = page.getByRole("button", { name: nomDuRepli(titre), exact: true });
  await expect(commande).toHaveAttribute("aria-expanded", repli === "replier" ? "true" : "false");
  await commande.click();
  await expect(commande).toHaveAttribute("aria-expanded", repli === "replier" ? "false" : "true");
}

/** Noms des bases IndexedDB de l'origine, triés. */
export async function nomsDesBases(page: Page): Promise<string[]> {
  const noms = await page.evaluate(async () =>
    (await indexedDB.databases()).map((base) => base.name ?? ""),
  );
  return noms.sort();
}

// Signal réel de fin d'écriture, sans délai arbitraire : la persistance lance sa transaction
// d'écriture pendant l'action même, et IndexedDB ordonne les transactions d'un même magasin, toutes
// connexions confondues ; une lecture ouverte après l'action ne se termine donc qu'une fois ces
// écritures validées. Le scénario de F-002-AC2 prouve qu'un rechargement immédiat ne perd rien sans
// cette attente. Par défaut, les bases d'espace ; `prefixe` en désigne d'autres.
export async function ecrituresAbouties(
  page: Page,
  prefixe = PREFIXE_DES_BASES_D_ESPACE,
): Promise<void> {
  await page.evaluate(
    async ({ prefixe, magasin }) => {
      const noms = (await indexedDB.databases())
        .map((base) => base.name ?? "")
        .filter((nom) => nom.startsWith(prefixe));
      if (noms.length === 0) {
        throw new Error(`Aucune base ${prefixe}* dans ce navigateur.`);
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
    { prefixe, magasin: MAGASIN_DES_MISES_A_JOUR },
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

/** Les adresses réseau qui ne visent pas l'origine donnée. */
export function originesEtrangeres(adresses: readonly string[], origine: string): string[] {
  const hote = new URL(origine).host;
  return adresses.filter((adresse) => {
    const cible = new URL(adresse);
    return PROTOCOLES_RESEAU.has(cible.protocol) && cible.host !== hote;
  });
}

/**
 * F-010-AC26 : sans serveur, la lecture de l'état du compte (`GET /api/v1/moi`) échoue, comme la
 * spec le prévoit, et le navigateur note cet échec de chargement dans la console. Seul cet échec-là
 * est écarté : toute autre erreur, et tout autre échec de chargement, restent comptés.
 */
function estLEchecAttenduDuCompte(message: ConsoleMessage): boolean {
  const { url } = message.location();
  return (
    /^Failed to load resource\b/.test(message.text()) &&
    url !== "" &&
    new URL(url).pathname === CHEMINS_COMPTES.moi
  );
}

/** Erreurs et avertissements de la console, exceptions non interceptées, depuis l'appel. */
export function ecouterLaConsole(page: Page): string[] {
  const messages: string[] = [];
  page.on("pageerror", (erreur) => messages.push(`exception : ${erreur.message}`));
  page.on("console", (message) => {
    const type = message.type();
    if (estLEchecAttenduDuCompte(message)) {
      return;
    }
    if (
      type === "error" ||
      type === "warning" ||
      /yjs was already imported/i.test(message.text())
    ) {
      messages.push(`console (${type}) : ${message.text()}`);
    }
  });
  return messages;
}

const STATUT_TROP_DE_REQUETES = 429;
const ATTENTE_PAR_DEFAUT_S = 60;
const MARGE_MS = 1000;
const ESSAIS_SOUS_LE_PLAFOND = 3;

/**
 * Envoie un formulaire du compte (inscription, connexion) et, si le serveur répond 429, attend le
 * délai qu'il annonce puis le renvoie. Le serveur plafonne les inscriptions à 3 par minute et par
 * adresse (F-009-AC14) ; les scénarios de plusieurs fichiers en font davantage depuis 127.0.0.1.
 * Ce que chaque scénario constate ensuite reste inchangé. `envoyer` remplit et valide le formulaire.
 */
export async function envoyerSousLePlafond(
  page: Page,
  route: "inscription" | "connexion",
  envoyer: () => Promise<void>,
): Promise<void> {
  const chemin = CHEMINS_COMPTES[route];
  for (let essai = 0; essai < ESSAIS_SOUS_LE_PLAFOND; essai += 1) {
    const reponse = page.waitForResponse(
      (lue) => new URL(lue.url()).pathname === chemin && lue.request().method() === "POST",
    );
    await envoyer();
    const lue = await reponse;
    if (lue.status() !== STATUT_TROP_DE_REQUETES) {
      return;
    }
    const entetes = lue.headers();
    const annonce = Number(entetes["retry-after"] ?? entetes["x-retry-after"]);
    const attenteMs =
      (Number.isFinite(annonce) && annonce > 0 ? annonce : ATTENTE_PAR_DEFAUT_S) * 1000 + MARGE_MS;
    test.info().setTimeout(test.info().timeout + attenteMs);
    await page.waitForTimeout(attenteMs);
  }
  throw new Error(
    `${chemin} : le serveur refuse encore après ${String(ESSAIS_SOUS_LE_PLAFOND)} essais`,
  );
}
