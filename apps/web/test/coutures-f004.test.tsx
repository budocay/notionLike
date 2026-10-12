// Couture de F-004 avec F-002 (F-004-AC52) : chaque action de F-002-AC10 reste atteinte et
// déclenchée au clavier seul, sous son nom accessible, sur écran large comme sur écran étroit, et
// appelle la même fonction du document ; les modules qui appellent ces fonctions sont énumérés
// d'après le graphe que dependency-cruiser calcule (`aides-graphe.ts`), sans analyseur d'imports.
// De même pour les appelants des deux parcours dont cette feature change la forme.
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EtatSession } from "../src/espace/session-espace.ts";
import {
  activerActionDeRangeeAuClavier,
  type CoquilleRendue,
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

interface Inscription {
  readonly aretes: Aretes;
  readonly textes: (chemin: string) => string;
  readonly appel: RegExp;
  /** Modules inscrits ; pour un parcours, ce que chacun doit lire de ce qu'il rend. */
  readonly inscrits: Readonly<Record<string, RegExp | string>>;
  /** Vrai si nul module de `src/`, même hors de l'application, ne peut appeler sans être inscrit. */
  readonly partout?: boolean;
}

/**
 * F-004-AC52 : un module appelant qui n'est pas inscrit, un module inscrit qui n'appelle plus, qui
 * n'est pas atteint par ce test, ou qui ne lit pas la forme attendue, est nommé.
 */
function fautesDInscription(inscription: Inscription): string[] {
  const { aretes, textes, appel, inscrits, partout = false } = inscription;
  const vus = appelants(aretes, textes, appel);
  const couverts = atteintsDepuis(aretes, CE_TEST);
  const ailleurs = [...aretes.keys()].filter(
    (chemin) => partout && chemin.startsWith("src/") && !vus.includes(chemin),
  );
  return [
    ...[...vus, ...ailleurs.filter((chemin) => appel.test(textes(chemin)))]
      .filter((chemin) => !(chemin in inscrits))
      .map((chemin) => `${chemin} : appelle sans être inscrit`),
    ...Object.entries(inscrits).flatMap(([chemin, forme]) => [
      ...(vus.includes(chemin) ? [] : [`${chemin} : inscrit, mais n'appelle plus`]),
      ...(couverts.has(chemin) ? [] : [`${chemin} : n'est pas atteint par ${CE_TEST}`]),
      ...(typeof forme === "string" || forme.test(textes(chemin))
        ? []
        : [`${chemin} : ne lit pas la forme que le parcours rend`]),
    ]),
  ];
}

describe("couture : modules qui appellent les actions de F-002", () => {
  it("F-004-AC52 d'après le graphe de dependency-cruiser, chaque module qui appelle une action de F-002 est inscrit et atteint par ce test", async () => {
    const aretes = await graphe();
    expect(aretes.size).toBeGreaterThan(60);
    expect(aretes.has(POINT_D_ENTREE)).toBe(true);

    expect(appelants(aretes, lire)).toEqual(Object.keys(APPELANTS).sort());
    expect(
      fautesDInscription({ aretes, textes: lire, appel: APPEL_D_UNE_ACTION, inscrits: APPELANTS }),
    ).toEqual([]);
    expect(atteintsDepuis(aretes, CE_TEST).has("src/demonstration/PageDemonstration.tsx")).toBe(
      false,
    );
  });

  it("F-004-AC52 d'après le même graphe, chaque module qui appelle ancetresDe ou rangeesVisibles est inscrit, atteint par ce test, et lit la forme que ces parcours rendent depuis cette feature ; aucun appelant hors de l'application", async () => {
    const aretes = await graphe();

    expect(appelants(aretes, lire, APPEL_D_UN_PARCOURS)).toEqual(
      Object.keys(APPELANTS_DES_PARCOURS).sort(),
    );
    expect(
      fautesDInscription({
        aretes,
        textes: lire,
        appel: APPEL_D_UN_PARCOURS,
        inscrits: APPELANTS_DES_PARCOURS,
        partout: true,
      }),
    ).toEqual([]);
  });

  it("F-004-AC53 F-004-AC52 un appelant non inscrit, un inscrit qui n'appelle plus, que ce test n'atteint pas ou qui ne lit pas la forme rendue, et un appelant hors de l'application sont nommés", () => {
    const aretes: Aretes = new Map([
      [CE_TEST, [POINT_D_ENTREE]],
      [POINT_D_ENTREE, ["src/interface/A.tsx", "src/interface/B.ts"]],
      ["src/interface/A.tsx", []],
      ["src/interface/B.ts", []],
      ["src/demonstration/D.tsx", []],
    ]);
    const sources: Record<string, string> = {
      "src/interface/A.tsx": "ancetresDe(racines, id).map(({ id }) => id);",
      "src/interface/B.ts": "rangeesVisibles(racines, repliees).map(({ mere }) => mere);",
    };
    const inscrits = { "src/interface/A.tsx": /\(\{ id \}\)/, "src/interface/B.ts": /\{ mere \}/ };
    const fautes = (
      modifie: Record<string, string>,
      graphe: Aretes = aretes,
      liste: Readonly<Record<string, RegExp>> = inscrits,
    ): string[] =>
      fautesDInscription({
        aretes: graphe,
        textes: (chemin) => ({ ...sources, ...modifie })[chemin] ?? "",
        appel: APPEL_D_UN_PARCOURS,
        inscrits: liste,
        partout: true,
      });
    expect(fautes({})).toEqual([]);
    expect(fautes({ [POINT_D_ENTREE]: "ancetresDe(racines, id);" })).toEqual([
      `${POINT_D_ENTREE} : appelle sans être inscrit`,
    ]);
    expect(fautes({ "src/interface/B.ts": "return [];" })).toEqual([
      "src/interface/B.ts : inscrit, mais n'appelle plus",
      "src/interface/B.ts : ne lit pas la forme que le parcours rend",
    ]);
    expect(fautes({ "src/interface/A.tsx": "ancetresDe(racines, id).includes(id);" })).toEqual([
      "src/interface/A.tsx : ne lit pas la forme que le parcours rend",
    ]);
    expect(fautes({}, new Map([...aretes, [CE_TEST, []]]))).toEqual([
      `src/interface/A.tsx : n'est pas atteint par ${CE_TEST}`,
      `src/interface/B.ts : n'est pas atteint par ${CE_TEST}`,
    ]);
    expect(fautes({ "src/demonstration/D.tsx": "rangeesVisibles(racines, vide);" })).toEqual([
      "src/demonstration/D.tsx : appelle sans être inscrit",
    ]);
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

function operationsDe(coquille: CoquilleRendue): Operations {
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
  async function ouvrir(): Promise<CoquilleRendue> {
    simulerLaLargeur(largeur);
    const coquille = await ouvrirCoquille();
    recevoir(coquille.session, (espace) => {
      const dossier = espace.creerPage("Dossier");
      espace.creerPage("Feuille", { parent: dossier });
    });
    await ouvrirLeTiroirSIlYEnAUn(coquille);
    return coquille;
  }

  async function ouvrirLeTiroirSIlYEnAUn(coquille: CoquilleRendue): Promise<void> {
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

/** Chaque rendu d'une enveloppe, par fichier : « Composant » ou « Composant fenetre ». */
function rendusDesEnveloppes(fichiers: ReadonlyMap<string, string>): Record<string, string[]> {
  return Object.fromEntries(
    [...fichiers]
      .map(([chemin, texte]) => {
        const rendus = [...texte.matchAll(ENVELOPPE)].map(([, nom = "", proprietes = ""]) =>
          /(?:^|\s)fenetre(?:\s|$)/.test(proprietes) ? `${nom} fenetre` : nom,
        );
        return [chemin, rendus] as const;
      })
      .filter(([, rendus]) => rendus.length > 0),
  );
}

/** L'application demande toujours la hauteur de la fenêtre, la page de démonstration jamais. */
function fautesDEnveloppes(fichiers: ReadonlyMap<string, string>): string[] {
  return Object.entries(rendusDesEnveloppes(fichiers)).flatMap(([chemin, rendus]) => {
    const apercu = chemin.startsWith("src/demonstration/");
    return rendus
      .filter((rendu) => rendu.endsWith(" fenetre") === apercu)
      .map((rendu) =>
        apercu
          ? `${chemin} : « ${rendu} » prend la hauteur de la fenêtre dans un aperçu`
          : `${chemin} : « ${rendu} » sans la hauteur de la fenêtre dans l'application`,
      );
  });
}

describe("couture : enveloppes à la hauteur de la fenêtre", () => {
  it("F-004-AC52 F-004-AC16 les appelants de Coquille et d'EcranPlein sont énumérés : l'application demande toujours la hauteur de la fenêtre, la page de démonstration jamais (son rendu est constaté par demonstration.test.tsx)", async () => {
    const sources = new Map(
      lister("src")
        .filter((chemin) => chemin.endsWith(".tsx"))
        .map((chemin) => [chemin, lire(chemin)]),
    );
    expect(rendusDesEnveloppes(sources)).toEqual({
      "src/demonstration/PageDemonstration.tsx": [
        "Coquille",
        "Coquille",
        "EcranPlein",
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
    expect(fautesDEnveloppes(sources)).toEqual([]);

    // Dans l'application : l'écran de chargement, puis la coquille, à la hauteur de la fenêtre.
    rendreApplication();
    expect(screen.getByRole("status").closest("main")?.classList.contains("min-h-dvh")).toBe(true);
    await screen.findByRole("button", { name: "Nouvelle page" });
    expect(screen.getByRole("banner").closest(".h-dvh")).not.toBeNull();
  });

  it("F-004-AC53 F-004-AC52 un écran de l'application rendu sans la hauteur de la fenêtre, ou un aperçu de la démonstration qui la prend, est nommé", () => {
    const conforme = new Map([
      ["src/interface/Application.tsx", "<EcranPlein fenetre>\n<Coquille fenetre tiroir={t}>"],
      ["src/demonstration/Page.tsx", "<Coquille tiroir={t}>\n<EcranPlein>"],
      ["src/interface/composants/Coquille.tsx", "export function Coquille() {}"],
    ]);
    expect(fautesDEnveloppes(conforme)).toEqual([]);
    expect(
      fautesDEnveloppes(new Map([...conforme, ["src/interface/Autre.tsx", "<EcranPlein>"]])),
    ).toEqual([
      "src/interface/Autre.tsx : « EcranPlein » sans la hauteur de la fenêtre dans l'application",
    ]);
    expect(
      fautesDEnveloppes(
        new Map([...conforme, ["src/demonstration/Page.tsx", "<Coquille fenetre tiroir={t}>"]]),
      ),
    ).toEqual([
      "src/demonstration/Page.tsx : « Coquille fenetre » prend la hauteur de la fenêtre dans un aperçu",
    ]);
  });
});

// Échap ne passe plus par un rappel de la coquille (`surTouche`, retiré de `Tiroir` et de
// `TiroirDeCoquille`) : `useTiroir` l'écoute lui-même sur le document tant que le tiroir est ouvert.
// Le contrat des appelants change donc : ils n'ont plus rien à brancher, et ne doivent plus le faire.
const APPELANTS_DE_USE_TIROIR = ["src/interface/Application.tsx"];
const LARGEUR_ETROITE = 360;

/** Appelants de `useTiroir` hors de la liste, et restes d'un gestionnaire de frappe de la coquille. */
function fautesDEcouteDEchap(fichiers: ReadonlyMap<string, string>): string[] {
  const appelants = [...fichiers]
    .filter(
      ([chemin, texte]) => chemin !== "src/interface/tiroir.ts" && /\buseTiroir\(/.test(texte),
    )
    .map(([chemin]) => chemin);
  return [
    ...appelants
      .filter((chemin) => !APPELANTS_DE_USE_TIROIR.includes(chemin))
      .map((chemin) => `${chemin} : appelle useTiroir sans être inscrit`),
    ...APPELANTS_DE_USE_TIROIR.filter((chemin) => !appelants.includes(chemin)).map(
      (chemin) => `${chemin} : inscrit, mais n'appelle plus useTiroir`,
    ),
    ...[...fichiers]
      .filter(([, texte]) => /tiroir\.surTouche|surTouche: tiroir/.test(texte))
      .map(
        ([chemin]) => `${chemin} : branche un gestionnaire de frappe du tiroir, qui n'existe plus`,
      ),
    ...(/onKeyDown/.test(fichiers.get("src/interface/composants/Coquille.tsx") ?? "")
      ? ["src/interface/composants/Coquille.tsx : la coquille écoute de nouveau les frappes"]
      : []),
    ...(/document\.addEventListener\("keydown"/.test(fichiers.get("src/interface/tiroir.ts") ?? "")
      ? []
      : ["src/interface/tiroir.ts : n'écoute plus les frappes sur le document"]),
  ];
}

describe("couture : Échap du tiroir, écouté par useTiroir et non par la coquille", () => {
  it("F-004-AC42 F-004-AC52 les appelants de useTiroir sont énumérés, aucun ne branche de gestionnaire de frappe, et Échap ferme le tiroir de l'application quel que soit l'élément qui a le focus", async () => {
    const sources = new Map(
      lister("src")
        .filter((chemin) => /\.tsx?$/.test(chemin))
        .map((chemin) => [chemin, lire(chemin)]),
    );
    expect(fautesDEcouteDEchap(sources)).toEqual([]);

    simulerLaLargeur(LARGEUR_ETROITE);
    const { utilisateur } = await ouvrirCoquille();
    const ouverture = screen.getByRole("button", { name: "Ouvrir la barre latérale" });
    for (const focus of [
      (): HTMLElement => screen.getByRole("button", { name: "Fermer la barre latérale" }),
      (): HTMLElement => screen.getByRole("button", { name: "Nouvelle page" }),
      (): HTMLElement => document.body,
    ]) {
      await utilisateur.click(ouverture);
      expect(screen.getByRole("dialog", { name: "Barre latérale" })).toBeDefined();
      const cible = focus();
      act(() =>
        cible === document.body ? (document.activeElement as HTMLElement).blur() : cible.focus(),
      );
      expect(document.activeElement).toBe(cible);
      fireEvent.keyDown(cible, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(ouverture);
    }
  });

  it("F-004-AC53 F-004-AC52 un second appelant de useTiroir, un appelant qui branche encore un gestionnaire de frappe, une coquille qui écoute les frappes et un tiroir qui n'écoute plus le document sont nommés", () => {
    const conforme = new Map([
      [
        "src/interface/tiroir.ts",
        'export function useTiroir() {}\ndocument.addEventListener("keydown", surTouche);',
      ],
      ["src/interface/Application.tsx", "const tiroir = useTiroir();\nsurClic: tiroir.surClic,"],
      ["src/interface/composants/Coquille.tsx", "onClick={tiroir.surClic}"],
    ]);
    expect(fautesDEcouteDEchap(conforme)).toEqual([]);
    const avec = (chemin: string, texte: string): string[] =>
      fautesDEcouteDEchap(new Map([...conforme, [chemin, texte]]));
    expect(avec("src/interface/Autre.tsx", "const tiroir = useTiroir();")).toEqual([
      "src/interface/Autre.tsx : appelle useTiroir sans être inscrit",
    ]);
    expect(
      avec(
        "src/interface/Application.tsx",
        "const tiroir = useTiroir();\nsurTouche: tiroir.surTouche,",
      ),
    ).toEqual([
      "src/interface/Application.tsx : branche un gestionnaire de frappe du tiroir, qui n'existe plus",
    ]);
    expect(avec("src/interface/Application.tsx", "<Coquille />")).toEqual([
      "src/interface/Application.tsx : inscrit, mais n'appelle plus useTiroir",
    ]);
    expect(avec("src/interface/composants/Coquille.tsx", "onKeyDown={surTouche}")).toEqual([
      "src/interface/composants/Coquille.tsx : la coquille écoute de nouveau les frappes",
    ]);
    expect(avec("src/interface/tiroir.ts", "export function useTiroir() {}")).toEqual([
      "src/interface/tiroir.ts : n'écoute plus les frappes sur le document",
    ]);
  });
});
