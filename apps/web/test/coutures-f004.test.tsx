// Couture de F-004 avec F-002 (F-004-AC52) : chaque action de F-002-AC10 reste atteinte et
// déclenchée au clavier seul, sous son nom accessible, sur écran large comme sur écran étroit, et
// appelle la même fonction du document ; les modules qui appellent ces fonctions sont énumérés
// d'après le graphe que dependency-cruiser calcule (`aides-graphe.ts`), sans analyseur d'imports.
// De même pour les appelants des deux parcours dont cette feature change la forme.
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
import { rendreApplication } from "./aides-coquille.tsx";
import { lire, lister } from "./aides-disque.ts";
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

// Les deux parcours de l'arborescence dont cette feature change la forme : `ancetresDe` rend des
// pages et non plus des identifiants, et chaque rangée de `rangeesVisibles` porte sa page mère.
const APPEL_D_UN_PARCOURS = /\b(?:ancetresDe|rangeesVisibles)\(/;

/** Modules qui appellent ces parcours, et ce que chacun lit de ce qu'ils rendent. */
const APPELANTS_DES_PARCOURS: Readonly<Record<string, RegExp>> = {
  "src/interface/BarreLaterale.tsx":
    /rangeesVisibles\(racines, ecran\.repliees\)\.map\(\(\{ page, niveau, mere \}\) =>/,
  "src/interface/FilDAriane.tsx":
    /ancetresDe\(racines, page\.id\)\.map\(\(ancetre\) => \(\{\s*titre: titreAffiche\(ancetre\.titre\),\s*adresse: adresseDePage\(ancetre\.id\),/,
  "src/interface/pages.ts":
    /export function ancetresDe\([^)]*\): readonly PageLue\[\] \{[\s\S]*export function rangeesVisibles\([^)]*\): readonly RangeeVisible\[\] \{/,
  "src/interface/repli.ts": /ancetresDe\(racines, idPageDesignee\)\.map\(\(\{ id \}\) => id\)/,
};

function appelants(
  aretes: Aretes,
  textes: (chemin: string) => string,
  appel: RegExp = APPEL_D_UNE_ACTION,
): string[] {
  return [...atteintsDepuis(aretes, POINT_D_ENTREE)]
    .filter((chemin) => chemin.startsWith("src/") && appel.test(textes(chemin)))
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

  it("F-004-AC52 d'après le même graphe, chaque module qui appelle ancetresDe ou rangeesVisibles est inscrit, atteint par ce test, et lit la forme que ces parcours rendent depuis cette feature", async () => {
    const aretes = await graphe();

    expect(appelants(aretes, lire, APPEL_D_UN_PARCOURS)).toEqual(
      Object.keys(APPELANTS_DES_PARCOURS).sort(),
    );
    const couverts = atteintsDepuis(aretes, CE_TEST);
    for (const [module, lecture] of Object.entries(APPELANTS_DES_PARCOURS)) {
      expect(couverts.has(module), `${CE_TEST} atteint ${module}`).toBe(true);
      expect(lire(module), module).toMatch(lecture);
    }
    // Aucun appelant hors de l'application : ni la page de démonstration, ni un autre module de src/.
    const horsDeLApplication = [...aretes.keys()].filter(
      (chemin) =>
        chemin.startsWith("src/") &&
        APPEL_D_UN_PARCOURS.test(lire(chemin)) &&
        !(chemin in APPELANTS_DES_PARCOURS),
    );
    expect(horsDeLApplication).toEqual([]);
  });

  it("F-004-AC53 F-004-AC52 un module de plus qui appelle un parcours, atteint depuis l'application, est vu", () => {
    const aretes = new Map([
      [POINT_D_ENTREE, ["src/interface/A.tsx", "src/interface/B.ts"]],
      ["src/demonstration/D.tsx", []],
    ]);
    const textes: Readonly<Record<string, string>> = {
      "src/interface/A.tsx": "const lignee = ancetresDe(racines, id);",
      "src/interface/B.ts": "return rangeesVisibles(racines, repliees).length;",
      "src/demonstration/D.tsx": "ancetresDe(racines, id);",
    };
    expect(appelants(aretes, (chemin) => textes[chemin] ?? "", APPEL_D_UN_PARCOURS)).toEqual([
      "src/interface/A.tsx",
      "src/interface/B.ts",
    ]);
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

describe("couture : appelants d'ancetresDe et de rangeesVisibles", () => {
  it("F-004-AC52 F-004-AC39 F-004-AC54 F-004-AC55 désignée par son adresse, une page de niveau 3 sous une racine repliée : ses ancêtres se déplient (repli.ts), le fil les cite avec l'adresse de leur rangée (FilDAriane.tsx), et chaque rangée dit son niveau et sa mère (BarreLaterale.tsx)", async () => {
    simulerLaLargeur(1280);
    const coquille = await ouvrirCoquille();
    recevoir(coquille.session, (espace) => {
      const dossier = espace.creerPage("Dossier");
      const chemise = espace.creerPage("Chemise", { parent: dossier });
      espace.creerPage("Feuille", { parent: chemise });
    });
    const adresse = lien("Feuille").getAttribute("href") ?? "";
    await coquille.utilisateur.click(bouton(nomDuRepli("Dossier")));
    expect(screen.queryByRole("link", { name: "Feuille" })).toBeNull();

    window.location.hash = adresse;

    await waitFor(() => expect(lien("Feuille").getAttribute("aria-current")).toBe("page"));
    expect(bouton(nomDuRepli("Dossier")).getAttribute("aria-expanded")).toBe("true");
    expect(bouton(nomDuRepli("Chemise")).getAttribute("aria-expanded")).toBe("true");
    const fil = within(screen.getByRole("navigation", { name: "Fil d'Ariane" }));
    expect(
      fil
        .getAllByRole("link")
        .map((ancetre) => [ancetre.textContent, ancetre.getAttribute("href")]),
    ).toEqual([
      ["Dossier", lien("Dossier").getAttribute("href")],
      ["Chemise", lien("Chemise").getAttribute("href")],
    ]);
    const description = (titre: string): string | null | undefined => {
      const cible = lien(titre).getAttribute("aria-describedby");
      return cible === null ? null : document.getElementById(cible)?.textContent;
    };
    expect(["Dossier", "Chemise", "Feuille"].map(description)).toEqual([
      null,
      "Niveau 2, sous-page de « Dossier »",
      "Niveau 3, sous-page de « Chemise »",
    ]);
    expect(
      within(screen.getByRole("navigation", { name: "Pages" }))
        .getAllByRole("listitem")
        .map((rangee) => rangee.getAttribute("aria-level")),
    ).toEqual(["1", "2", "3"]);
  });
});

// `Coquille` et `EcranPlein` remplissent ce qui les contient, sauf quand `fenetre` leur donne la
// hauteur de la fenêtre : cette propriété, absente par défaut, est le contrat de leurs appelants.
const ENVELOPPE = /<(Coquille|EcranPlein)\b([^>]*)>/g;

/** Chaque rendu d'une enveloppe dans `src/`, par fichier : « Composant » ou « Composant fenetre ». */
function rendusDesEnveloppes(fichiers: readonly string[]): Record<string, string[]> {
  return Object.fromEntries(
    fichiers
      .map((chemin) => {
        const rendus = [...lire(chemin).matchAll(ENVELOPPE)].map(([, nom = "", proprietes = ""]) =>
          /(?:^|\s)fenetre(?:\s|$)/.test(proprietes) ? `${nom} fenetre` : nom,
        );
        return [chemin, rendus] as const;
      })
      .filter(([, rendus]) => rendus.length > 0),
  );
}

describe("couture : enveloppes à la hauteur de la fenêtre", () => {
  it("F-004-AC52 F-004-AC16 les appelants de Coquille et d'EcranPlein sont énumérés : l'application demande toujours la hauteur de la fenêtre, la page de démonstration jamais (son rendu est constaté par demonstration.test.tsx)", async () => {
    const sources = lister("src").filter((chemin) => chemin.endsWith(".tsx"));
    expect(rendusDesEnveloppes(sources)).toEqual({
      "src/demonstration/PageDemonstration.tsx": [
        "Coquille",
        "Coquille",
        "EcranPlein",
        "EcranPlein",
      ],
      "src/interface/Application.tsx": [
        "EcranPlein fenetre",
        "EcranPlein fenetre",
        "EcranPlein fenetre",
        "Coquille fenetre",
      ],
    });

    // Dans l'application : l'écran de chargement, puis la coquille, à la hauteur de la fenêtre.
    rendreApplication();
    expect(screen.getByRole("status").closest("main")?.classList.contains("min-h-dvh")).toBe(true);
    await screen.findByRole("button", { name: "Nouvelle page" });
    expect(screen.getByRole("banner").closest(".h-dvh")).not.toBeNull();
  });
});
