// F-006-AC34 : le glisser-déposer dans un navigateur réel, par des gestes réels de la souris. Trois
// pages réordonnées et imbriquées dans la barre latérale, un lâcher refusé sous soi-même, puis trois
// blocs réordonnés par leur poignée et au clavier, une annulation, le tout relu après rechargement ;
// enfin un contenu riche piégé lâché dans l'éditeur sans que rien ne s'exécute, et un fichier lâché
// refusé, éditeur modifiable ou en lecture seule (F-006-AC35). Hors des hooks tant que D-003 n'est
// pas levée.
import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  arborescence,
  barreLaterale,
  creerPageNommee,
  ecouterLaConsole,
  ecrituresAbouties,
  lienDePage,
  ouvrir,
  PREFIXE_DES_BASES_DE_PAGE,
  recharger,
} from "./aides.ts";

type Hauteur = "haut" | "milieu" | "bas";
const PROPORTION: Readonly<Record<Hauteur, number>> = { haut: 0.15, milieu: 0.5, bas: 0.85 };

function rangee(page: Page, titre: string): Locator {
  return barreLaterale(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: titre, exact: true }) });
}

function reperes(page: Page): Locator {
  return barreLaterale(page).locator("[data-repere-de-depot]");
}

async function point(cible: Locator, hauteur: Hauteur): Promise<{ x: number; y: number }> {
  const boite = await cible.boundingBox();
  if (boite === null) {
    throw new Error("Élément sans boîte : il n'est pas affiché.");
  }
  return { x: boite.x + boite.width * 0.3, y: boite.y + boite.height * PROPORTION[hauteur] };
}

/** Saisit une rangée au pointeur et l'amène au-dessus d'une autre, sans lâcher. */
async function amener(page: Page, source: string, cible: string, hauteur: Hauteur): Promise<void> {
  const depart = await point(rangee(page, source), "milieu");
  await page.mouse.move(depart.x, depart.y);
  await page.mouse.down();
  await page.mouse.move(depart.x, depart.y + 10, { steps: 4 });
  const arrivee = await point(rangee(page, cible), hauteur);
  await page.mouse.move(arrivee.x, arrivee.y, { steps: 12 });
}

/** Ce que la barre latérale montre : « niveau:titre » par rangée. */
async function arbre(page: Page): Promise<string[]> {
  return (await arborescence(page)).map(({ niveau, titre }) => `${niveau ?? "?"}:${titre}`);
}

function zoneDeSaisie(page: Page): Locator {
  return page.getByRole("textbox", { name: "Contenu de la page" });
}

function blocs(zone: Locator): Promise<string[]> {
  return zone.evaluate((racine) => [...racine.children].map((bloc) => bloc.textContent ?? ""));
}

/** Survole un bloc, puis saisit sa poignée et la lâche sur le bas d'un autre bloc. */
async function glisserLeBloc(page: Page, source: Locator, cible: Locator): Promise<void> {
  await source.hover();
  const poignee = page.locator("[data-poignee-de-bloc]");
  await expect(poignee).toBeVisible();
  const prise = await point(poignee, "milieu");
  await page.mouse.move(prise.x, prise.y, { steps: 4 });
  await page.mouse.down();
  await page.mouse.move(prise.x + 5, prise.y + 5, { steps: 4 });
  const arrivee = await point(cible, "bas");
  await page.mouse.move(arrivee.x + 20, arrivee.y, { steps: 12 });
  await page.mouse.up();
}

const CONTENU_PIEGE = [
  '<p>déposé <a href="javascript:window.__f006 = 1">piège</a></p>',
  '<img src="x" onerror="window.__f006 = 2">',
  "<script>window.__f006 = 3</script>",
].join("");

/** Lâche un contenu riche sur un bloc, par un événement de dépôt du navigateur, porteur d'un vrai DataTransfer. */
async function deposerDuHtml(cible: Locator, html: string): Promise<void> {
  const { x, y } = await point(cible, "milieu");
  await cible.evaluate(
    (element, { contenu, abscisse, ordonnee }) => {
      const donnees = new DataTransfer();
      donnees.setData("text/html", contenu);
      donnees.setData("text/plain", "déposé piège");
      const options = {
        dataTransfer: donnees,
        clientX: abscisse,
        clientY: ordonnee,
        bubbles: true,
        cancelable: true,
      };
      for (const type of ["dragenter", "dragover", "drop"]) {
        element.dispatchEvent(new DragEvent(type, options));
      }
    },
    { contenu: html, abscisse: x, ordonnee: y },
  );
}

test("F-006-AC34 par des gestes réels de la souris : pages réordonnées et imbriquées, lâcher refusé sous soi-même, blocs réordonnés par la poignée et au clavier, annulation, rechargement, contenu piégé lâché sans exécution", async ({
  page,
}) => {
  const console_ = ecouterLaConsole(page);
  const dialogues: string[] = [];
  page.on("dialog", (dialogue) => {
    dialogues.push(dialogue.message());
    void dialogue.dismiss();
  });
  await ouvrir(page);
  for (const titre of ["Un", "Deux", "Trois"]) {
    await creerPageNommee(page, titre);
  }
  expect(await arbre(page)).toEqual(["1:Un", "1:Deux", "1:Trois"]);

  // La troisième avant la première.
  await amener(page, "Trois", "Un", "haut");
  await expect(rangee(page, "Un").locator('[data-repere-de-depot="avant"]')).toBeVisible();
  await page.mouse.up();
  await expect.poll(() => arbre(page)).toEqual(["1:Trois", "1:Un", "1:Deux"]);
  await expect(reperes(page)).toHaveCount(0);

  // La deuxième dans la première.
  await amener(page, "Deux", "Un", "milieu");
  await expect(rangee(page, "Un").locator('[data-repere-de-depot="dans"]')).toBeVisible();
  await page.mouse.up();
  await expect.poll(() => arbre(page)).toEqual(["1:Trois", "1:Un", "2:Deux"]);

  // La première dans sa sous-page : aucun repère, rien ne change.
  for (const hauteur of ["haut", "milieu", "bas"] as const) {
    await amener(page, "Un", "Deux", hauteur);
    await expect(reperes(page)).toHaveCount(0);
    await page.mouse.up();
  }
  await expect.poll(() => arbre(page)).toEqual(["1:Trois", "1:Un", "2:Deux"]);

  await recharger(page);
  expect(await arbre(page)).toEqual(["1:Trois", "1:Un", "2:Deux"]);

  // Trois blocs dans la page « Trois ».
  await lienDePage(page, "Trois").click();
  const zone = zoneDeSaisie(page);
  await zone.click();
  await page.keyboard.type("premier");
  await page.keyboard.press("Enter");
  await page.keyboard.type("deuxième");
  await page.keyboard.press("Enter");
  await page.keyboard.type("troisième");
  expect(await blocs(zone)).toEqual(["premier", "deuxième", "troisième"]);

  // Le premier, par sa poignée, après le troisième.
  await glisserLeBloc(page, zone.locator("p").nth(0), zone.locator("p").nth(2));
  await expect.poll(() => blocs(zone)).toEqual(["deuxième", "troisième", "premier"]);

  // Un bloc descendu par Alt+Maj+Flèche bas, puis l'annulation.
  await zone.getByText("deuxième").click();
  await page.keyboard.press("Alt+Shift+ArrowDown");
  await expect.poll(() => blocs(zone)).toEqual(["troisième", "deuxième", "premier"]);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => blocs(zone)).toEqual(["deuxième", "troisième", "premier"]);

  await ecrituresAbouties(page, PREFIXE_DES_BASES_DE_PAGE);
  await recharger(page);
  await expect.poll(() => blocs(zoneDeSaisie(page))).toEqual(["deuxième", "troisième", "premier"]);

  // Un contenu riche qui porte un script, lâché dans l'éditeur.
  await deposerDuHtml(zoneDeSaisie(page).locator("p").nth(1), CONTENU_PIEGE);
  await expect(zoneDeSaisie(page)).toContainText("déposé");
  await expect(page.locator('[href^="javascript"]')).toHaveCount(0);
  await expect(page.locator("main img, main script")).toHaveCount(0);
  await ecrituresAbouties(page, PREFIXE_DES_BASES_DE_PAGE);
  expect(await page.evaluate(() => Reflect.get(window, "__f006"))).toBeUndefined();
  expect(dialogues).toEqual([]);
  expect(console_).toEqual([]);
});

test("F-006-AC12 F-006-AC18 au clavier, dans un navigateur réel : une page déplacée garde le focus sur son lien, et Alt+Maj+Flèche haut n'étend pas la sélection dans l'éditeur", async ({
  page,
}) => {
  await ouvrir(page);
  for (const titre of ["Un", "Deux"]) {
    await creerPageNommee(page, titre);
  }

  await lienDePage(page, "Deux").focus();
  await page.keyboard.press("Alt+Shift+ArrowUp");
  await expect.poll(() => arbre(page)).toEqual(["1:Deux", "1:Un"]);
  await expect(lienDePage(page, "Deux")).toBeFocused();
  await expect(barreLaterale(page).getByRole("status").filter({ hasText: "déplacée" })).toHaveText(
    "« Deux » déplacée à la racine, position 1 sur 2.",
  );
  // Redescendue, c'est sa rangée que la liste déplace dans le DOM : le focus lui est rendu.
  await page.keyboard.press("Alt+Shift+ArrowDown");
  await expect.poll(() => arbre(page)).toEqual(["1:Un", "1:Deux"]);
  await expect(lienDePage(page, "Deux")).toBeFocused();

  await lienDePage(page, "Un").click();
  const zone = zoneDeSaisie(page);
  await zone.click();
  await page.keyboard.type("haut");
  await page.keyboard.press("Enter");
  await page.keyboard.type("bas");
  await page.keyboard.press("Alt+Shift+ArrowUp");
  await expect.poll(() => blocs(zone)).toEqual(["bas", "haut"]);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
  await page.keyboard.type("!");
  await expect.poll(() => blocs(zone)).toEqual(["bas!", "haut"]);
});

/**
 * Lâche un fichier sur un bloc, seul ou avec du texte, par les trois événements du navigateur
 * porteurs d'un vrai DataTransfer ; rend, pour chacun, si son action par défaut a été empêchée.
 */
async function deposerUnFichier(cible: Locator, avecDuTexte: boolean): Promise<boolean[]> {
  const { x, y } = await point(cible, "milieu");
  return cible.evaluate(
    (element, { texte, abscisse, ordonnee }) => {
      const donnees = new DataTransfer();
      donnees.items.add(
        new File(["<p>contenu du fichier</p>"], "image.png", { type: "text/html" }),
      );
      if (texte) {
        donnees.setData("text/plain", "texte joint au fichier");
      }
      return ["dragenter", "dragover", "drop"].map((type) => {
        const geste = new DragEvent(type, {
          dataTransfer: donnees,
          clientX: abscisse,
          clientY: ordonnee,
          bubbles: true,
          cancelable: true,
        });
        element.dispatchEvent(geste);
        return geste.defaultPrevented;
      });
    },
    { texte: avecDuTexte, abscisse: x, ordonnee: y },
  );
}

/**
 * Rend l'éditeur non modifiable comme l'application le fait sans droit d'écriture (F-013-AC25) : la
 * lecture seule réelle vient du serveur, absent de ce scénario.
 */
async function passerEnLectureSeule(zone: Locator): Promise<void> {
  await zone.evaluate((element) => {
    const editeur = Reflect.get(element, "editor") as { setEditable(modifiable: boolean): void };
    editeur.setEditable(false);
  });
  await expect(zone).toHaveAttribute("contenteditable", "false");
}

test("F-006-AC35 F-013-AC25 dans un navigateur réel, un fichier lâché, seul puis avec du texte, sur l'éditeur modifiable puis en lecture seule : action par défaut empêchée à chaque geste, rien d'ouvert ni d'inscrit", async ({
  page,
}) => {
  const console_ = ecouterLaConsole(page);
  await ouvrir(page);
  await creerPageNommee(page, "Fichiers");
  const zone = zoneDeSaisie(page);
  await zone.click();
  await page.keyboard.type("un");
  await page.keyboard.press("Enter");
  await page.keyboard.type("deux");
  await expect.poll(() => blocs(zone)).toEqual(["un", "deux"]);
  const adresse = page.url();

  for (const lectureSeule of [false, true]) {
    if (lectureSeule) {
      await passerEnLectureSeule(zone);
    }
    for (const avecDuTexte of [false, true]) {
      expect(await deposerUnFichier(zone.locator("p").nth(1), avecDuTexte)).toEqual([
        true,
        true,
        true,
      ]);
      expect(await blocs(zone)).toEqual(["un", "deux"]);
      expect(page.url()).toBe(adresse);
    }
  }
  await expect(zone).not.toContainText(/image\.png|contenu du fichier|texte joint/);
  expect(console_).toEqual([]);
});
