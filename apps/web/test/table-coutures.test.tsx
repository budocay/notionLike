// F-018-AC9 : couture du format du document d'espace. Reprise de l'énumération de F-002-AC20 : pour
// chaque module d'apps/web qui importe @notionlike/document et lit l'arborescence ou la corbeille,
// un document d'espace qui porte des tables, enregistré par la persistance puis relu dans un document
// vierge (rechargement), donne la même lecture, types compris. Les autres importateurs sont nommés
// avec ce qu'ils lisent à la place. Puis les modules qui tirent d'un identifiant de page un nom de
// base : aucun n'ouvre un document de page pour une table, ni un document de table pour une page.
import { act, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { estDUneVersionAdmise, lectureAdmise } from "../src/espace/garde-version.ts";
import { rangeesVisibles, trouverPage } from "../src/interface/pages.ts";
import { idsDesPages } from "../src/synchronisation/index.ts";
import { type CoquilleRendue, docDe, ouvrirCoquille, recharger } from "./aides-coquille.tsx";
import { lire, lister } from "./aides-disque.ts";
import { atteintsDepuis, graphe } from "./aides-graphe.ts";
import { ouvrirFacade } from "./aides-facade.ts";
import { laisserIndexedDbTravailler, nomsDesBases } from "./aides-persistance.ts";

interface Identifiants {
  readonly table: string;
  readonly sousTable: string;
  readonly page: string;
}

function etatPret(coquille: CoquilleRendue) {
  const etat = coquille.session.lireEtat();
  if (etat.phase !== "pret") {
    throw new Error("L'espace n'est pas ouvert.");
  }
  return etat;
}

function arborescence(coquille: CoquilleRendue) {
  return etatPret(coquille).arborescence;
}

function aller(fragment: string): void {
  act(() => {
    window.location.hash = fragment;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

function barre(): HTMLElement {
  return screen.getByRole("navigation", { name: "Pages" });
}

function titrePrincipal(): string {
  return within(screen.getByRole("main")).getByRole("heading", { level: 1 }).textContent;
}

/** Budget (table) ; Projets > Suivi (table) ; Archive (table) à la corbeille. */
async function espaceAvecDesTables(): Promise<CoquilleRendue & Identifiants> {
  const coquille = await ouvrirCoquille();
  const ops = etatPret(coquille).operations;
  let ids: Identifiants = { table: "", sousTable: "", page: "" };
  act(() => {
    const table = ops.creerTable("Budget");
    const page = ops.creerPage("Projets");
    const sousTable = ops.creerTable("Suivi", { parent: page });
    ops.mettreALaCorbeille(ops.creerTable("Archive"));
    ids = { table, sousTable, page };
  });
  await act(() => laisserIndexedDbTravailler());
  return { ...coquille, ...ids };
}

type Lecture = (coquille: CoquilleRendue, ids: Identifiants) => Promise<unknown> | unknown;

// Chaque importateur qui lit l'arborescence ou la corbeille, et ce qu'il en donne à lire.
const LECTEURS_DE_L_ARBORESCENCE: Readonly<Record<string, Lecture>> = {
  "src/espace/garde-version.ts": (coquille) => {
    const facade = ouvrirFacade(docDe(coquille.session));
    return [estDUneVersionAdmise(docDe(coquille.session)), lectureAdmise(facade)];
  },
  "src/espace/session-espace.ts": (coquille) => arborescence(coquille),
  "src/interface/Application.tsx": (_coquille, { table }) => {
    aller(`#/page/${table}`);
    return [titrePrincipal(), document.title];
  },
  "src/interface/BarreLaterale.tsx": () =>
    within(barre())
      .getAllByRole("link")
      .map((lien) => lien.textContent),
  "src/interface/EcranDeLaCorbeille.tsx": () => {
    aller("#/corbeille");
    return screen.getByRole("region", { name: "Pages de la corbeille" }).textContent;
  },
  "src/interface/FilDAriane.tsx": (_coquille, { sousTable }) => {
    aller(`#/page/${sousTable}`);
    return screen.getByRole("navigation", { name: "Fil d'Ariane" }).textContent;
  },
  "src/interface/RangeePage.tsx": () =>
    within(barre())
      .getAllByRole("button")
      .map((bouton) => bouton.getAttribute("aria-label") ?? bouton.textContent),
  "src/interface/ZonePrincipale.tsx": async (_coquille, { sousTable }) => {
    aller(`#/page/${sousTable}`);
    await screen.findByText(/aucune colonne/);
    return titrePrincipal();
  },
  "src/interface/pages.ts": (coquille, { sousTable }) => {
    const { racines } = arborescence(coquille);
    return [
      trouverPage(racines, sousTable),
      rangeesVisibles(racines, new Set()).map(({ page, niveau }) => [
        page.titre,
        page.type,
        niveau,
      ]),
    ];
  },
  "src/interface/repli.ts": () =>
    within(barre())
      .queryAllByRole("button", { expanded: true })
      .map((bouton) => bouton.getAttribute("aria-label")),
  "src/synchronisation/pages-de-l-espace.ts": (coquille) =>
    [...idsDesPages(arborescence(coquille))].sort(),
};

// Le module des vues de table compte pour un : on n'y entre que par son interface (`index.ts`,
// F-018-AC54), et ses fichiers ne lisent que le document d'une table.
const MODULE_DES_VUES = "src/vues-de-table/";

function moduleDe(chemin: string): string {
  return chemin.startsWith(MODULE_DES_VUES) ? MODULE_DES_VUES : chemin;
}

// Les importateurs qui ne lisent ni l'arborescence ni la corbeille, et ce qu'ils lisent à la place.
const AUTRES_IMPORTATEURS: Readonly<Record<string, string>> = {
  "src/interface/messages.ts": "traduit les codes d'erreur",
  "src/page/session-page.ts": "lit le document d'une page",
  "src/synchronisation/miroir.ts": "lit la version d'un document de page",
  "src/table/session-table.ts": "lit le document d'une table",
  [MODULE_DES_VUES]: "lit la table par la façade du document de table",
};

function importateursDuDocument(): string[] {
  const chemins = lister("src")
    .filter((chemin) => /\.tsx?$/.test(chemin))
    .filter((chemin) => /from\s+"@notionlike\/document"/.test(lire(chemin)));
  return [...new Set(chemins.map(moduleDe))].sort();
}

describe("couture du format du document d'espace (F-018-AC9)", () => {
  it("F-018-AC9 chaque importateur de @notionlike/document est inscrit : lecteur de l'arborescence, ou nommé avec ce qu'il lit", () => {
    expect(
      [...Object.keys(LECTEURS_DE_L_ARBORESCENCE), ...Object.keys(AUTRES_IMPORTATEURS)].sort(),
    ).toEqual(importateursDuDocument());
  });

  it.each(Object.keys(LECTEURS_DE_L_ARBORESCENCE))(
    "F-018-AC9 %s : un espace qui porte des tables, enregistré puis relu dans un document vierge, donne la même lecture, types compris",
    async (module) => {
      const lecture = LECTEURS_DE_L_ARBORESCENCE[module] as Lecture;
      const coquille = await espaceAvecDesTables();
      const avant = await lecture(coquille, coquille);
      const arborescenceAvant = arborescence(coquille);
      const docAvant = docDe(coquille.session);

      const relue = await recharger(coquille);

      expect(docDe(relue.session)).not.toBe(docAvant);
      expect(arborescence(relue)).toEqual(arborescenceAvant);
      expect(
        [...arborescenceAvant.racines, ...arborescenceAvant.corbeille].map(({ type }) => type),
      ).toEqual(["table", undefined, "table"]);
      expect(await lecture(relue, coquille)).toEqual(avant);
    },
  );
});

describe("noms de base tirés d'un identifiant de page (F-018-AC9)", () => {
  it("F-018-AC9 l'éditeur de F-003 n'ouvre ni base ni document de page pour une table, l'écran de table aucune base de table pour une page", async () => {
    const coquille = await espaceAvecDesTables();
    for (const id of [coquille.table, coquille.sousTable]) {
      aller(`#/page/${id}`);
      await screen.findByText(/aucune colonne/);
    }
    aller(`#/page/${coquille.page}`);
    await screen.findByRole("textbox", { name: "Contenu de la page" });
    await act(() => laisserIndexedDbTravailler());

    const bases = await nomsDesBases();
    expect(
      bases.filter((nom) => nom.includes(":page:")).map((nom) => nom.split(":").at(-1)),
    ).toEqual([coquille.page]);
    expect(
      bases
        .filter((nom) => nom.includes(":table:"))
        .map((nom) => nom.split(":").at(-1))
        .sort(),
    ).toEqual([coquille.table, coquille.sousTable].sort());
  });
});

// Les modules d'apps/web qui tirent d'un identifiant un nom de base ou un nom de document, chacun
// avec ce qu'il nomme et le cas qui l'exerce sur une table et une page : le fichier de ce cas
// l'atteint par ses imports (graphe de dependency-cruiser, comme F-002-AC20), et le cas constate les
// bases ou les documents nommés, jamais un document de page pour une table.
const EDITEUR_ET_ECRAN_DE_TABLE = {
  test: "test/table-coutures.test.tsx",
  cas: "F-018-AC9 l'éditeur de F-003 n'ouvre ni base ni document de page pour une table, l'écran de table aucune base de table pour une page",
};
const PASSE_DE_FOND = {
  test: "test/synchronisation/tables.test.ts",
  cas: "F-018-AC51 F-018-AC9 une table créée et remplie hors ligne se lit identique sur un second appareil après la passe de fond, sans qu'il l'ait affichée ; aucun document de page n'existe pour elle",
};
const TABLE_AFFICHEE = {
  test: "test/synchronisation/tables.test.ts",
  cas: "F-018-AC51 la table affichée est échangée sur son document, sans réplique : ce qui y est écrit atteint le serveur et l'autre appareil, et le document est dit acquitté",
};
const NOMMEURS_DE_DOCUMENTS: Readonly<
  Record<string, { readonly regle: string; readonly test: string; readonly cas: string }>
> = {
  "src/page/pages-ouvertes.ts": {
    regle: "document de page, ouvert par l'éditeur pour une page seulement (F-003)",
    ...EDITEUR_ET_ECRAN_DE_TABLE,
  },
  "src/table/tables-ouvertes.ts": {
    regle: "document de table, ouvert par l'écran de table pour une table seulement",
    ...EDITEUR_ET_ECRAN_DE_TABLE,
  },
  "src/synchronisation/noms.ts": {
    regle: "correspondance d'un type donné par l'appelant",
    ...PASSE_DE_FOND,
  },
  "src/synchronisation/page-affichee.ts": {
    regle:
      "document de page de la page affichée par l'éditeur, jamais pris pour une table affichée",
    ...TABLE_AFFICHEE,
  },
  "src/synchronisation/table-affichee.ts": {
    regle: "document de table de la table affichée",
    ...TABLE_AFFICHEE,
  },
  "src/synchronisation/passe-de-fond.ts": {
    regle: "le type lu de chaque identifiant (typeDe)",
    ...PASSE_DE_FOND,
  },
  "src/synchronisation/synchronisation.ts": {
    regle:
      "le type lu de chaque identifiant, donné à la passe de fond et aux documents suspects d'une fermeture 1009",
    ...PASSE_DE_FOND,
  },
  "src/synchronisation/stockage.ts": {
    regle:
      "effacement des deux bases d'un identifiant retiré, dont le type n'est plus lisible (H11)",
    test: "test/synchronisation/tables.test.ts",
    cas: "F-018-AC53 une table supprimée définitivement sur un appareil : l'autre n'a plus, après sa reconnexion, ni sa base de table ni de base de page",
  },
};

describe("modules qui nomment un document d'après un identifiant (F-018-AC9)", () => {
  it("F-018-AC9 la liste des modules qui tirent d'un identifiant un nom de base ou de document est exacte, et chacun est atteint par le fichier du cas qui l'exerce", async () => {
    const nommeurs = lister("src")
      .filter((chemin) => /\.tsx?$/.test(chemin) && !chemin.startsWith("src/persistance/"))
      .filter((chemin) =>
        /correspondance\(|ouvrirPersistance\(|effacerBaseDePage\(|effacerBaseDeDocument\(|ouvrirLaBase\(/.test(
          lire(chemin),
        ),
      );
    expect(nommeurs).toEqual(Object.keys(NOMMEURS_DE_DOCUMENTS).sort());
    const aretes = await graphe();
    for (const [module, { test, cas }] of Object.entries(NOMMEURS_DE_DOCUMENTS)) {
      expect(lire(test), `${test} : ${cas}`).toContain(`it("${cas}"`);
      expect(atteintsDepuis(aretes, test).has(module), `${test} atteint ${module}`).toBe(true);
    }
    expect(lire("src/synchronisation/passe-de-fond.ts")).toMatch(
      /correspondance\(this\.#options\.typeDe\(idPage\)/,
    );
    expect(lire("src/synchronisation/page-affichee.ts")).toMatch(/correspondance\("page"/);
    expect(lire("src/synchronisation/table-affichee.ts")).toMatch(/correspondance\("table"/);
  });
});
