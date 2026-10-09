// Écrans de référence de l'application dans Chromium : aucun défilement horizontal aux six largeurs
// de référence (F-004-AC45), et capture de chacun aux largeurs de capture (F-004-AC51). Un contexte
// neuf par écran ; ce fichier vient avant `demonstration.spec.ts`, qui capture la page de
// démonstration, et chacun vérifie les captures qui lui reviennent.
import { existsSync, statSync } from "node:fs";

import { expect, type Page, test } from "@playwright/test";

import { barreLaterale, lienDePage, ouvrir, titrePrincipal } from "./aides.ts";
import {
  constaterSansDefilementHorizontal,
  construireLArborescence,
  construireLeChargement,
  construireLEchecDePersistance,
  construirePageIntrouvable,
  construireUnePage,
  fil,
  largeur,
  LARGEURS_DE_REFERENCE,
  montrerLaBarre,
  ouvrirLeMenu,
  ouvrirLeRenommage,
  style,
  tiroir,
  TITRE_DE_200,
  TITRE_DU_NIVEAU_12,
  toutRefermer,
  zoneDEtat,
} from "./aides-ecrans.ts";
import {
  CAPTURES_ATTENDUES,
  DOSSIER_DES_CAPTURES,
  ECRANS_DE_REFERENCE,
  largeursDe,
  type LettreDEcran,
  nomDeCapture,
  PAGE_DE_DEMONSTRATION,
} from "./captures-attendues.ts";

const LARGEUR_DE_CONSTRUCTION = 1280;
const TITRE = "Carnet de bord";

interface Ecran {
  readonly description: string;
  /** Bâtit l'écran, fenêtre large. */
  readonly construire: (page: Page) => Promise<void>;
  /** Rétablit, à la largeur courante, ce que l'écran montre d'ouvert ; rend faux s'il n'existe pas. */
  readonly etablir?: (page: Page) => Promise<boolean>;
}

const ECRANS: Readonly<Record<LettreDEcran, Ecran>> = {
  a: { description: "aucune page, l'accueil", construire: (page) => ouvrir(page) },
  b: { description: "une page sélectionnée", construire: (page) => construireUnePage(page, TITRE) },
  c: {
    description: "arborescence de 12 niveaux, titres de 200 caractères sans espace",
    construire: construireLArborescence,
  },
  d: {
    description: "le menu « ⋯ » ouvert",
    construire: (page) => construireUnePage(page, TITRE),
    etablir: async (page) => {
      await ouvrirLeMenu(page, TITRE);
      return true;
    },
  },
  e: {
    description: "le renommage sur place",
    construire: (page) => construireUnePage(page, TITRE),
    etablir: async (page) => {
      await ouvrirLeRenommage(page, TITRE);
      return true;
    },
  },
  g: { description: "« Page introuvable »", construire: construirePageIntrouvable },
  h: {
    description: "l'avertissement de persistance, la zone d'état en échec",
    construire: construireLEchecDePersistance,
  },
  i: { description: "l'état de chargement", construire: construireLeChargement },
  j: {
    description: "le tiroir ouvert, sur écran étroit",
    construire: construireLArborescence,
    etablir: async (page) => {
      await montrerLaBarre(page);
      return (await tiroir(page).count()) > 0;
    },
  },
};

function cheminDe(racine: string, ecran: string, pixels: number): string {
  return `${racine}/${DOSSIER_DES_CAPTURES}/${nomDeCapture({ ecran, largeur: pixels })}`;
}

// Dans la zone principale, le titre de 200 caractères sans espace est entier et non rogné : il se
// replie sur plusieurs lignes, son texte tient dans sa boîte et dans la zone, rien ne le coupe. Le
// texte est mesuré par une plage, qui voit les caractères là où la boîte de l'élément ne les voit
// pas.
async function constaterLeTitreDeLaZone(page: Page, ou: string): Promise<void> {
  await expect(titrePrincipal(page)).toHaveText(TITRE_DU_NIVEAU_12);
  const mesure = await titrePrincipal(page).evaluate((titre) => {
    const texte = document.createRange();
    texte.selectNodeContents(titre);
    const lettres = texte.getBoundingClientRect();
    const zone = (titre.closest("main") ?? titre).getBoundingClientRect();
    const calcule = getComputedStyle(titre);
    return {
      deborde: titre.scrollWidth - titre.clientWidth,
      horsDeLaZone: Math.max(zone.left - lettres.left, lettres.right - zone.right),
      rognage: [calcule.overflowX, calcule.textOverflow, calcule.whiteSpace],
      lignes: Math.round(lettres.height / Number.parseFloat(calcule.lineHeight)),
    };
  });
  expect(
    mesure.deborde,
    `le titre de la zone principale déborde de sa boîte, ${ou}`,
  ).toBeLessThanOrEqual(0);
  expect(mesure.horsDeLaZone, `le titre sort de la zone principale, ${ou}`).toBeLessThanOrEqual(0);
  expect(mesure.rognage, `le titre de la zone principale est rogné, ${ou}`).toEqual([
    "visible",
    "clip",
    "normal",
  ]);
  expect(mesure.lignes, `le titre de 200 caractères se replie, ${ou}`).toBeGreaterThan(1);
}

// Le titre de 200 caractères reste lisible : coupé par des points de suspension dans sa rangée et
// dans le fil d'Ariane, entier dans son nom accessible et dans la zone principale.
async function constaterLeTitreLong(page: Page, ou: string): Promise<void> {
  await constaterLeTitreDeLaZone(page, ou);
  await expect(fil(page).locator('[aria-current="page"]')).toHaveText(TITRE_DU_NIVEAU_12);
  expect(await style(fil(page).locator('[aria-current="page"]'), "text-overflow")).toBe("ellipsis");
  await montrerLaBarre(page);
  const rangee = lienDePage(page, TITRE_DE_200);
  await expect(rangee).toHaveText(TITRE_DE_200);
  await expect(rangee).toHaveAccessibleName(TITRE_DE_200);
  expect(await style(rangee, "text-overflow")).toBe("ellipsis");
  expect(await style(rangee, "white-space")).toBe("nowrap");
  const mesure = await rangee.evaluate((lien) => [lien.scrollWidth, lien.clientWidth]);
  expect(mesure[0], "le titre long est coupé dans sa rangée").toBeGreaterThan(mesure[1] ?? 0);
  await toutRefermer(page);
}

for (const [lettre, ecran] of Object.entries(ECRANS) as [LettreDEcran, Ecran][]) {
  test(`F-004-AC45 F-004-AC51 écran (${lettre}), ${ecran.description} : aucun défilement horizontal de 320 à 1920, et capture à chaque largeur qui lui revient`, async ({
    page,
  }, infos) => {
    const racine = infos.config.rootDir.replace(/[\\/]e2e$/, "");
    await largeur(page, LARGEUR_DE_CONSTRUCTION);
    await ecran.construire(page);
    const captures: number[] = [];

    for (const pixels of LARGEURS_DE_REFERENCE) {
      await toutRefermer(page);
      await largeur(page, pixels);
      const existe = (await ecran.etablir?.(page)) ?? true;
      if (!existe) {
        expect(pixels, `écran (${lettre}) sans objet à cette largeur`).toBeGreaterThanOrEqual(1024);
        continue;
      }
      await constaterSansDefilementHorizontal(page, `écran (${lettre}) à ${pixels}`);
      if (largeursDe(lettre).includes(pixels)) {
        await page.screenshot({
          path: cheminDe(racine, ECRANS_DE_REFERENCE[lettre], pixels),
          fullPage: true,
          animations: "disabled",
          caret: "hide",
        });
        captures.push(pixels);
      }
      if (lettre === "c") {
        await constaterLeTitreLong(page, `écran (c) à ${pixels}`);
        await constaterSansDefilementHorizontal(page, `écran (c), barre montrée, à ${pixels}`);
      }
    }

    expect(captures).toEqual([...largeursDe(lettre)]);
  });
}

test("F-004-AC45 la zone d'état en échec et l'arborescence de 12 niveaux ne débordent pas ensemble, de 320 à 1920", async ({
  page,
}) => {
  await largeur(page, LARGEUR_DE_CONSTRUCTION);
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true });
  });
  await construireLArborescence(page);

  for (const pixels of LARGEURS_DE_REFERENCE) {
    await toutRefermer(page);
    await largeur(page, pixels);
    await expect(zoneDEtat(page)).toHaveText("Non enregistré sur cet appareil");
    await constaterSansDefilementHorizontal(page, `échec et arborescence à ${pixels}`);
    await montrerLaBarre(page);
    await expect(barreLaterale(page)).toBeVisible();
    await constaterSansDefilementHorizontal(page, `échec, barre montrée, à ${pixels}`);
  }
});

test("F-004-AC51 chaque capture attendue de l'application existe et n'est pas vide", ({
  browserName,
}, infos) => {
  expect(browserName).toBe("chromium");
  const racine = infos.config.rootDir.replace(/[\\/]e2e$/, "");
  const attendues = CAPTURES_ATTENDUES.filter(({ ecran }) => ecran !== PAGE_DE_DEMONSTRATION);
  expect(attendues).toHaveLength(26);

  for (const capture of attendues) {
    const chemin = cheminDe(racine, capture.ecran, capture.largeur);
    expect(existsSync(chemin), `capture attendue : ${chemin}`).toBe(true);
    expect(statSync(chemin).size, `capture vide : ${chemin}`).toBeGreaterThan(0);
  }
});
