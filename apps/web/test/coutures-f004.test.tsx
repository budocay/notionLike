// Couture de F-004 avec F-002 (F-004-AC52) : chaque action de F-002-AC10 reste atteinte et
// déclenchée au clavier seul, sous son nom accessible, sur écran large comme sur écran étroit, et
// appelle la même fonction du document ; les modules qui appellent ces fonctions sont énumérés
// d'après le graphe que dependency-cruiser calcule (`aides-graphe.ts`), sans analyseur d'imports.
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EtatSession } from "../src/espace/session-espace.ts";
import {
  activerActionDeRangeeAuClavier,
  type Coquille,
  nomAjouterSousPage,
  nomDuRepli,
  ouvrirCoquille,
  recevoir,
  tabulerJusqua,
} from "./aides-coquille.tsx";
import { lire } from "./aides-disque.ts";
import { type Aretes, atteintsDepuis, graphe } from "./aides-graphe.ts";
import { simulerLaLargeur } from "./aides-largeur.ts";

const CE_TEST = "test/coutures-f004.test.tsx";
const POINT_D_ENTREE = "src/interface/Application.tsx";

// Les fonctions de F-002-AC10 : celles du document, que la session expose, et celles de la barre,
// qui les enveloppent ; la sélection passe par l'adresse de la page.
const APPEL_D_UNE_ACTION =
  /\b(?:operations|actions)\.(?:creerPage|renommerPage|mettreALaCorbeille|ouvrirSaisie|validerTitre|basculerRepli)\b|\badresseDePage\(/;

/** Modules de l'application qui appellent une action de F-002, et pourquoi chacun est couvert. */
const APPELANTS: Readonly<Record<string, string>> = {
  "src/interface/Application.tsx": "appelle les opérations du document",
  "src/interface/BarreLaterale.tsx": "« Nouvelle page »",
  "src/interface/FilDAriane.tsx": "adresse des ancêtres",
  "src/interface/RangeePage.tsx": "actions de rangée, menu, repli, adresse du lien",
  "src/interface/pages.ts": "définit l'adresse d'une page",
};

function appelants(aretes: Aretes, textes: (chemin: string) => string): string[] {
  return [...atteintsDepuis(aretes, POINT_D_ENTREE)]
    .filter((chemin) => chemin.startsWith("src/") && APPEL_D_UNE_ACTION.test(textes(chemin)))
    .sort();
}

describe("couture : modules qui appellent les actions de F-002", () => {
  it("F-004-AC52 d'après le graphe de dependency-cruiser, chaque module qui appelle une action de F-002 est inscrit et atteint par ce test", async () => {
    const aretes = await graphe();
    expect(aretes.size).toBeGreaterThan(60);
    expect(aretes.has(POINT_D_ENTREE)).toBe(true);

    expect(appelants(aretes, lire)).toEqual(Object.keys(APPELANTS).sort());
    const couverts = atteintsDepuis(aretes, CE_TEST);
    for (const module of Object.keys(APPELANTS)) {
      expect(couverts.has(module), `${CE_TEST} atteint ${module}`).toBe(true);
    }
    expect(couverts.has("src/demonstration/PageDemonstration.tsx")).toBe(false);
  });

  it("F-004-AC53 F-004-AC52 un module de plus qui appelle une action, atteint depuis l'application, est vu", () => {
    const aretes = new Map([
      [POINT_D_ENTREE, ["src/interface/A.tsx", "src/interface/B.tsx"]],
      ["src/interface/A.tsx", ["src/interface/C.ts"]],
      ["src/demonstration/D.tsx", []],
    ]);
    const textes: Readonly<Record<string, string>> = {
      [POINT_D_ENTREE]: "moyens.operations.creerPage(titre);",
      "src/interface/A.tsx": "<Bouton />",
      "src/interface/B.tsx": "onClick={() => actions.mettreALaCorbeille(page)}",
      "src/interface/C.ts": "return adresseDePage(page.id);",
      "src/demonstration/D.tsx": "actions.creerPage(null);",
    };
    expect(appelants(aretes, (chemin) => textes[chemin] ?? "")).toEqual([
      POINT_D_ENTREE,
      "src/interface/B.tsx",
      "src/interface/C.ts",
    ]);
  });
});

type Operations = Extract<EtatSession, { phase: "pret" }>["operations"];

function operationsDe(coquille: Coquille): Operations {
  const etat = coquille.session.lireEtat();
  if (etat.phase !== "pret") {
    throw new Error("La session n'est pas prête.");
  }
  return etat.operations;
}

function bouton(nom: string): HTMLElement {
  return screen.getByRole("button", { name: nom });
}

function lien(titre: string): HTMLElement {
  return within(screen.getByRole("navigation", { name: "Pages" })).getByRole("link", {
    name: titre,
  });
}

function idDe(titre: string): string {
  return (lien(titre).getAttribute("href") ?? "").replace("#/page/", "");
}

afterEach(() => {
  document.documentElement.style.removeProperty("--breakpoint-etroit");
});

describe.each([
  ["écran large", 1280],
  ["écran étroit", 360],
])("couture : actions de F-002-AC10 au clavier seul, %s", (_ecran, largeur) => {
  /** Ouvre l'application ; sur écran étroit, ouvre le tiroir au clavier. */
  async function ouvrir(): Promise<Coquille> {
    simulerLaLargeur(largeur);
    const coquille = await ouvrirCoquille();
    recevoir(coquille.session, (espace) => {
      const dossier = espace.creerPage("Dossier");
      espace.creerPage("Feuille", { parent: dossier });
    });
    await ouvrirLeTiroirSIlYEnAUn(coquille);
    return coquille;
  }

  async function ouvrirLeTiroirSIlYEnAUn(coquille: Coquille): Promise<void> {
    const ouverture = screen.queryByRole("button", { name: "Ouvrir la barre latérale" });
    expect(ouverture === null).toBe(largeur >= 1024);
    if (ouverture !== null && ouverture.getAttribute("aria-expanded") === "false") {
      await tabulerJusqua(coquille.utilisateur, () => ouverture);
      await coquille.utilisateur.keyboard("{Enter}");
      expect(screen.getByRole("dialog", { name: "Barre latérale" })).toBeDefined();
    }
  }

  it("F-004-AC52 créer : « Nouvelle page » appelle creerPage à la racine", async () => {
    const coquille = await ouvrir();
    const creer = vi.spyOn(operationsDe(coquille), "creerPage");

    await tabulerJusqua(coquille.utilisateur, () => bouton("Nouvelle page"));
    await coquille.utilisateur.keyboard("{Enter}");

    expect(creer.mock.calls).toEqual([["", { parent: null }]]);
    expect(await screen.findByRole("textbox", { name: "Titre de la page" })).toBeDefined();
  });

  it("F-004-AC52 créer une sous-page : « Ajouter une sous-page à « T » » appelle creerPage sous la page", async () => {
    const coquille = await ouvrir();
    const parent = idDe("Dossier");
    const creer = vi.spyOn(operationsDe(coquille), "creerPage");

    await activerActionDeRangeeAuClavier(coquille.utilisateur, "ajouter-une-sous-page", "Dossier");

    expect(bouton(nomAjouterSousPage("Dossier")).tagName).toBe("BUTTON");
    expect(creer.mock.calls).toEqual([["", { parent }]]);
  });

  it("F-004-AC52 renommer : l'entrée « Renommer » du menu ouvre la saisie, dont la validation appelle renommerPage", async () => {
    const coquille = await ouvrir();
    const id = idDe("Feuille");
    const renommer = vi.spyOn(operationsDe(coquille), "renommerPage");

    await activerActionDeRangeeAuClavier(coquille.utilisateur, "renommer", "Feuille");
    await screen.findByRole("textbox", { name: "Titre de la page" });
    await coquille.utilisateur.keyboard("Renommée{Enter}");

    expect(renommer.mock.calls).toEqual([[id, "Renommée"]]);
    expect(await screen.findByRole("link", { name: "Renommée" })).toBeDefined();
  });

  it("F-004-AC52 mettre à la corbeille : l'entrée du menu appelle mettreALaCorbeille sur la page", async () => {
    const coquille = await ouvrir();
    const id = idDe("Dossier");
    const jeter = vi.spyOn(operationsDe(coquille), "mettreALaCorbeille");

    await activerActionDeRangeeAuClavier(coquille.utilisateur, "mettre-a-la-corbeille", "Dossier");

    expect(jeter.mock.calls).toEqual([[id]]);
    await waitFor(() => expect(screen.queryAllByRole("link")).toEqual([]));
  });

  it("F-004-AC52 replier et déplier : « Sous-pages de « T » », par Entrée puis Espace, sans toucher au document", async () => {
    const coquille = await ouvrir();
    const operations = operationsDe(coquille);
    const ecritures = [
      vi.spyOn(operations, "creerPage"),
      vi.spyOn(operations, "renommerPage"),
      vi.spyOn(operations, "mettreALaCorbeille"),
    ];
    const commande = (): HTMLElement => bouton(nomDuRepli("Dossier"));

    await tabulerJusqua(coquille.utilisateur, commande);
    await coquille.utilisateur.keyboard("{Enter}");
    expect(commande().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: "Feuille" })).toBeNull();

    await coquille.utilisateur.keyboard(" ");
    expect(commande().getAttribute("aria-expanded")).toBe("true");
    expect(lien("Feuille")).toBeDefined();
    for (const ecriture of ecritures) {
      expect(ecriture).not.toHaveBeenCalled();
    }
  });

  it("F-004-AC52 sélectionner : le lien de la rangée, par Entrée, mène à l'adresse de la page", async () => {
    const coquille = await ouvrir();
    const adresse = lien("Feuille").getAttribute("href");
    expect(adresse).toMatch(
      /^#\/page\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    await tabulerJusqua(coquille.utilisateur, () => lien("Feuille"));
    await coquille.utilisateur.keyboard("{Enter}");

    await waitFor(() => expect(window.location.hash).toBe(adresse));
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Feuille"),
    );
    expect(lien("Feuille").getAttribute("aria-current")).toBe("page");
  });
});
