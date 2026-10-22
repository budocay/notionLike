// F-007-AC25 : reprise de l'énumération de F-002-AC20. Pour chaque module d'apps/web qui importe
// @notionlike/document, un document d'espace dont des entrées ont été retirées par une suppression
// définitive, enregistré par la persistance puis relu dans un document vierge (rechargement : la
// session neuve relit la base dans un `Y.Doc` neuf), donne la même lecture qu'avant, et un
// identifiant retiré y est traité comme une page introuvable.
import { type CodeErreurDocument, ErreurDocument } from "@notionlike/document";
import { act, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { estDUneVersionAdmise, lectureAdmise } from "../src/espace/garde-version.ts";
import { messageErreur } from "../src/interface/messages.ts";
import { rangeesVisibles, trouverPage } from "../src/interface/pages.ts";
import { idsDesPages, versionAdmise } from "../src/synchronisation/index.ts";
import { type CoquilleRendue, docDe, ouvrirCoquille, recharger } from "./aides-coquille.tsx";
import { lire, lister } from "./aides-disque.ts";
import { ouvrirFacade } from "./aides-facade.ts";
import { laisserIndexedDbTravailler, nomsDesBases } from "./aides-persistance.ts";

interface Identifiants {
  readonly gardee: string;
  readonly petite: string;
  readonly retiree: string;
  readonly filleRetiree: string;
}

type Arborescence = Extract<
  ReturnType<CoquilleRendue["session"]["lireEtat"]>,
  { phase: "pret" }
>["arborescence"];

function etatPret(
  coquille: CoquilleRendue,
): Extract<ReturnType<CoquilleRendue["session"]["lireEtat"]>, { phase: "pret" }> {
  const etat = coquille.session.lireEtat();
  if (etat.phase !== "pret") {
    throw new Error("L'espace n'est pas ouvert.");
  }
  return etat;
}

function arborescence(coquille: CoquilleRendue): Arborescence {
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

function codeDuRefus(operation: () => unknown): CodeErreurDocument | "autre" | undefined {
  try {
    operation();
    return undefined;
  } catch (erreur) {
    return erreur instanceof ErreurDocument ? erreur.code : "autre";
  }
}

/** Racine > Gardée > Petite ; Retirée > Fille retirée, supprimées ; Jetée reste à la corbeille. */
async function espaceAuxEntreesRetirees(): Promise<CoquilleRendue & Identifiants> {
  const coquille = await ouvrirCoquille();
  const ops = etatPret(coquille).operations;
  let ids: Identifiants = { gardee: "", petite: "", retiree: "", filleRetiree: "" };
  act(() => {
    const racine = ops.creerPage("Racine");
    const gardee = ops.creerPage("Gardée", { parent: racine });
    const petite = ops.creerPage("Petite", { parent: gardee });
    const retiree = ops.creerPage("Retirée", { parent: racine });
    const filleRetiree = ops.creerPage("Fille retirée", { parent: retiree });
    ops.mettreALaCorbeille(ops.creerPage("Jetée"));
    ops.mettreALaCorbeille(retiree);
    ops.supprimerDefinitivement(retiree);
    ids = { gardee, petite, retiree, filleRetiree };
  });
  await act(() => laisserIndexedDbTravailler());
  return { ...coquille, ...ids };
}

/** Ce que le module donne à lire, sur l'espace courant ; l'identifiant retiré y est introuvable. */
type Lecture = (coquille: CoquilleRendue, ids: Identifiants) => Promise<unknown> | unknown;

// Le module des vues de table compte pour un : on n'y entre que par son interface (`index.ts`,
// F-018-AC54), et ses fichiers ne lisent que le document d'une table. Une seule lecture l'exerce.
const MODULE_DES_VUES = "src/vues-de-table/";

function moduleDe(chemin: string): string {
  return chemin.startsWith(MODULE_DES_VUES) ? MODULE_DES_VUES : chemin;
}

// L'adresse d'une entrée retirée n'affiche aucun écran de table.
const lectureDesVues: Lecture = (_coquille, { retiree }) => {
  aller(`#/page/${retiree}`);
  expect(titrePrincipal()).toBe("Page introuvable");
  return [screen.queryByRole("grid"), screen.queryByText("Chargement de la table…")];
};

const LECTURES: Readonly<Record<string, Lecture>> = {
  "src/espace/garde-version.ts": (coquille) => {
    const facade = ouvrirFacade(docDe(coquille.session));
    return [estDUneVersionAdmise(docDe(coquille.session)), lectureAdmise(facade)];
  },
  "src/espace/session-espace.ts": (coquille, { retiree }) => {
    const { renommerPage } = etatPret(coquille).operations;
    expect(codeDuRefus(() => renommerPage(retiree, "x"))).toBe("page-introuvable");
    return arborescence(coquille);
  },
  "src/interface/Application.tsx": (_coquille, { retiree, gardee }) => {
    aller(`#/page/${retiree}`);
    const introuvable = [titrePrincipal(), document.title];
    expect(introuvable[0]).toBe("Page introuvable");
    aller(`#/page/${gardee}`);
    return [introuvable, titrePrincipal(), document.title];
  },
  "src/interface/BarreLaterale.tsx": () =>
    within(barre())
      .getAllByRole("link")
      .map((lien) => lien.textContent),
  "src/interface/EcranDeLaCorbeille.tsx": () => {
    aller("#/corbeille");
    return screen.getByRole("region", { name: "Pages de la corbeille" }).textContent;
  },
  "src/interface/FilDAriane.tsx": (_coquille, { petite, filleRetiree }) => {
    aller(`#/page/${petite}`);
    const fil = screen.getByRole("navigation", { name: "Fil d'Ariane" }).textContent;
    aller(`#/page/${filleRetiree}`);
    expect(screen.queryByRole("navigation", { name: "Fil d'Ariane" })).toBeNull();
    return fil;
  },
  "src/interface/RangeePage.tsx": () =>
    within(barre())
      .getAllByRole("button")
      .map((bouton) => bouton.getAttribute("aria-label") ?? bouton.textContent),
  "src/interface/ZonePrincipale.tsx": (_coquille, { gardee, retiree }) => {
    aller(`#/page/${gardee}`);
    const gardeeLue = titrePrincipal();
    aller(`#/page/${retiree}`);
    expect(titrePrincipal()).toBe("Page introuvable");
    return [gardeeLue, titrePrincipal()];
  },
  "src/interface/messages.ts": (coquille, { retiree }) => {
    const { mettreALaCorbeille } = etatPret(coquille).operations;
    const code = codeDuRefus(() => mettreALaCorbeille(retiree));
    expect(code).toBe("page-introuvable");
    return code === undefined || code === "autre" ? code : messageErreur(code);
  },
  "src/interface/pages.ts": (coquille, { retiree, filleRetiree }) => {
    const { racines, corbeille } = arborescence(coquille);
    expect(trouverPage([...racines, ...corbeille], retiree)).toBeUndefined();
    expect(trouverPage([...racines, ...corbeille], filleRetiree)).toBeUndefined();
    return rangeesVisibles(racines, new Set()).map(({ page, niveau }) => [page.titre, niveau]);
  },
  "src/interface/repli.ts": () =>
    within(barre())
      .getAllByRole("button", { expanded: true })
      .concat(within(barre()).queryAllByRole("button", { expanded: false }))
      .map((bouton) => [bouton.getAttribute("aria-label"), bouton.getAttribute("aria-expanded")]),
  // La session de page lit le document d'une page, pas celui de l'espace : l'adresse d'une page
  // retirée n'ouvre aucune session, donc aucune base de page.
  "src/page/session-page.ts": async (_coquille, { retiree }) => {
    aller(`#/page/${retiree}`);
    await act(() => laisserIndexedDbTravailler());
    const bases = (await nomsDesBases()).filter((nom) => nom.endsWith(`:${retiree}`));
    expect(bases).toEqual([]);
    return bases;
  },
  // F-013 : la synchronisation lit les pages dans l'état de la session ; une page retirée n'y est
  // plus, et n'est ni échangée ni rouverte.
  "src/synchronisation/pages-de-l-espace.ts": (coquille, { retiree, filleRetiree }) => {
    const ids = idsDesPages(arborescence(coquille));
    expect(ids.has(retiree)).toBe(false);
    expect(ids.has(filleRetiree)).toBe(false);
    return [...ids].sort();
  },
  // La réplique ne lit que le document d'une page : rien de ce que l'espace a retiré n'y entre.
  "src/synchronisation/miroir.ts": () => versionAdmise(new Y.Doc()),
  // F-018 : la session de table lit le document d'une table, pas celui de l'espace : l'adresse
  // d'une entrée retirée n'ouvre aucune session, donc aucune base de table.
  "src/table/session-table.ts": async (_coquille, { retiree }) => {
    aller(`#/page/${retiree}`);
    await act(() => laisserIndexedDbTravailler());
    const bases = (await nomsDesBases()).filter((nom) => nom.includes(`:table:`));
    expect(bases).toEqual([]);
    return bases;
  },
  // F-018 : l'écran de table ne paraît que pour une table de l'arborescence lue ; le module des vues
  // de table ne lit que le document d'une table.
  [MODULE_DES_VUES]: lectureDesVues,
};

function importateursDuDocument(): string[] {
  const chemins = lister("src")
    .filter((chemin) => /\.tsx?$/.test(chemin))
    .filter((chemin) => /from\s+"@notionlike\/document"/.test(lire(chemin)));
  return [...new Set(chemins.map(moduleDe))].sort();
}

describe("relecture d'un document aux entrées retirées, module par module", () => {
  it("F-007-AC25 la liste des lectures est celle des modules qui importent @notionlike/document (énumération de F-002-AC20)", () => {
    expect(Object.keys(LECTURES).sort()).toEqual(importateursDuDocument());
  });

  it.each(Object.keys(LECTURES))(
    "F-007-AC25 %s : avant et après la relecture dans un document vierge, même lecture, l'identifiant retiré introuvable",
    async (module) => {
      const lecture = LECTURES[module] as Lecture;
      const coquille = await espaceAuxEntreesRetirees();
      const ids: Identifiants = coquille;
      const avant = await lecture(coquille, ids);
      const arborescenceAvant = arborescence(coquille);
      const docAvant = docDe(coquille.session);

      const relue = await recharger(coquille);

      expect(docDe(relue.session)).not.toBe(docAvant);
      expect(arborescence(relue)).toEqual(arborescenceAvant);
      expect(await lecture(relue, ids)).toEqual(avant);
    },
  );
});
