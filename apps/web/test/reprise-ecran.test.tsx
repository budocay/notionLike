// Ce que l'écran dit de l'enregistrement local pendant une coupure et à la reprise (F-030-AC12 à
// AC17, AC23, AC26, AC27, AC29).
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import type { SessionEspace } from "../src/espace/session-espace.ts";
import { ouvrirPersistance } from "../src/persistance/index.ts";
import { docDe, ouvrirCoquille, rendreApplication } from "./aides-coquille.tsx";
import { ouvrirFacade } from "./aides-facade.ts";
import {
  attendreEtat,
  enregistrements,
  ESPACE_A,
  ESPACE_B,
  fermerDeForce,
  laisserIndexedDbTravailler,
  nomsDesBases,
  refuserLesOuverturesParUneException,
  retenirLesOuvertures,
  suivreLesConnexionsTenues,
} from "./aides-persistance.ts";
import {
  annulerLesProchainsAjouts,
  creerUneBase,
  decrireLaBase,
  inscrireALaPlaceDeLIdentifiant,
  instancesAyantRelu,
  instantsDesOuvertures,
  rendreLOnglet,
  simulerLHorloge,
  tenterDeQuitter,
} from "./aides-reprise.ts";

const COUPURE =
  "Stockage de l'appareil indisponible : vos modifications ne sont pas encore enregistrées. Nouvelle tentative automatique en cours.";
const JAMAIS_RELUE =
  "Ce qui était déjà enregistré sur cet appareil n'a pas pu être lu ; il réapparaîtra dès que le stockage reviendra.";
const NON_RATTACHEES =
  "Des pages enregistrées auparavant sur cet appareil n'ont pas pu être rattachées à cet espace. Elles n'ont pas été effacées.";
const REESSAYER = "Réessayer maintenant";
const ENREGISTRE = "Enregistré sur cet appareil";
const NON_ENREGISTRE = "Non enregistré sur cet appareil";
const ANNONCE = "Modifications enregistrées sur cet appareil.";
const AFFIRMATION = /Enregistré sur cet appareil|Modifications enregistrées/;
const PREFIXE = "notionlike:espace:";
const APPAREIL = "notionlike:appareil";

function zone(): HTMLElement {
  return within(screen.getByRole("banner")).getByRole("status");
}

function avertissement(): HTMLElement {
  return screen.getByRole("alert");
}

function operations(session: SessionEspace) {
  const etat = session.lireEtat();
  if (etat.phase !== "pret") {
    throw new Error("La session n'est pas prête.");
  }
  return etat.operations;
}

async function laisserFaire(): Promise<void> {
  await act(() => laisserIndexedDbTravailler());
}

/** L'attente de la tentative suivante arrive à son terme, et la tentative va au bout. */
async function tentativeSuivante(): Promise<void> {
  act(() => void vi.advanceTimersToNextTimer());
  await laisserFaire();
  await laisserFaire();
}

/** Application ouverte et enregistrée, puis coupée par la fermeture de sa connexion. */
async function ouvrirPuisCouper(): Promise<{ session: SessionEspace }> {
  const connexions = suivreLesConnexionsTenues();
  const { session } = await ouvrirCoquille();
  simulerLHorloge();
  act(() => fermerDeForce(connexions.at(-1) as IDBDatabase));
  await laisserFaire();
  vi.restoreAllMocks();
  return { session };
}

async function baseDeLEspaceLocal(): Promise<string> {
  const base = (await nomsDesBases()).find((nom) => nom.startsWith(PREFIXE));
  return base ?? "";
}

async function titresDansLaBase(): Promise<string[]> {
  const relu = new Y.Doc();
  (await enregistrements(await baseDeLEspaceLocal())).forEach((lu) =>
    Y.applyUpdate(relu, Uint8Array.from(lu)),
  );
  return ouvrirFacade(relu)
    .lire()
    .racines.map((page) => page.titre)
    .sort();
}

describe("écran : jamais « enregistré » sans la preuve d'écriture", () => {
  it("F-030-AC26 (1) F-030-AC29 (1) ouverture de l'application dont l'écriture de l'état complet est annulée : la session n'est jamais dite enregistrée, la zone d'état ne dit jamais « Enregistré sur cet appareil », l'avertissement est affiché", async () => {
    annulerLesProchainsAjouts(1);
    const { session } = rendreApplication();
    const dites: boolean[] = [];
    const affirmations: boolean[] = [];
    session.abonner(() => {
      const etat = session.lireEtat();
      if (etat.phase === "pret") {
        dites.push(etat.enregistre);
      }
    });
    const observateur = new MutationObserver(() =>
      affirmations.push(AFFIRMATION.test(document.body.textContent)),
    );
    observateur.observe(document.body, { childList: true, subtree: true, characterData: true });

    await waitFor(() => expect(avertissement().textContent).toContain(COUPURE));
    await laisserFaire();
    observateur.disconnect();

    expect(new Set(dites)).toEqual(new Set([false]));
    expect(affirmations.length).toBeGreaterThan(0);
    expect(affirmations).not.toContain(true);
    expect(zone().textContent).toBe(NON_ENREGISTRE);
  });

  it("F-030-AC29 (2) ouverture réussie : pendant la relecture seul le chargement est affiché, puis la zone dit « Enregistré sur cet appareil » avec un repère non textuel, sans avertissement ni annonce de reprise, et n'est pas réécrite quand une page est créée", async () => {
    const { session } = rendreApplication();
    expect(screen.getAllByRole("status").map((etat) => etat.textContent)).toEqual(["Chargement…"]);
    expect(document.body.textContent).not.toMatch(AFFIRMATION);

    await screen.findByRole("button", { name: "Nouvelle page" });

    expect(zone().textContent).toBe(ENREGISTRE);
    const repere = zone().querySelector("span");
    expect(repere?.getAttribute("aria-hidden")).toBe("true");
    expect(repere?.textContent).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
    const reecritures = vi.fn();
    const observateur = new MutationObserver(reecritures);
    observateur.observe(zone(), { childList: true, subtree: true, characterData: true });
    act(() => void operations(session).creerPage("Écrite"));
    await laisserFaire();
    expect(observateur.takeRecords()).toEqual([]);
    observateur.disconnect();
    expect(reecritures).not.toHaveBeenCalled();
  });
});

describe("avertissement pendant la coupure", () => {
  it("F-030-AC12 F-030-AC13 coupure dès l'ouverture : l'avertissement dit la coupure, ajoute que l'enregistré n'a pas pu être lu, reste le même élément d'une tentative à l'autre sans être réécrit, et « Réessayer maintenant », atteint et activé au clavier seul, lance une tentative", async () => {
    simulerLHorloge();
    vi.setSystemTime(0);
    refuserLesOuverturesParUneException();
    const instants = instantsDesOuvertures();
    rendreApplication();
    await laisserFaire();
    const alerte = avertissement();
    expect(alerte.textContent).toBe(`${COUPURE}${JAMAIS_RELUE}${REESSAYER}`);
    expect(zone().textContent).toBe(NON_ENREGISTRE);
    expect(document.body.textContent).not.toMatch(AFFIRMATION);
    const reecritures = vi.fn();
    const observateur = new MutationObserver(reecritures);
    observateur.observe(alerte, { childList: true, subtree: true, characterData: true });

    // Un observateur livre son rappel dans une micro-tâche : les mutations en attente sont
    // relevées ici de façon synchrone, sans quoi une alerte réécrite passerait inaperçue.
    act(() => void vi.advanceTimersByTime(6_000));
    expect(instants).toEqual([0, 2_000, 6_000]);
    expect(avertissement()).toBe(alerte);
    expect(observateur.takeRecords()).toEqual([]);
    expect(reecritures).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(1_500));
    fireEvent.click(screen.getByRole("button", { name: REESSAYER }));

    expect(instants).toEqual([0, 2_000, 6_000, 7_500]);
    expect(avertissement()).toBe(alerte);
    expect(observateur.takeRecords()).toEqual([]);
    expect(reecritures).not.toHaveBeenCalled();
    // Cet observateur voit une réécriture de l'alerte quand il y en a une.
    alerte.querySelector("p")?.append(" ");
    expect(observateur.takeRecords()).toHaveLength(1);
    observateur.disconnect();
  });

  it("F-030-AC12 « Réessayer maintenant » est atteint par la tabulation et activé par Entrée, au clavier seul : une tentative est lancée, le focus reste sur le bouton", async () => {
    refuserLesOuverturesParUneException();
    const { utilisateur } = await ouvrirCoquille();
    const instants = instantsDesOuvertures();
    // Pas plus d'une tentative par seconde : celle de l'ouverture vient d'avoir lieu.
    await new Promise((resoudre) => setTimeout(resoudre, 1_050));
    const bouton = screen.getByRole("button", { name: REESSAYER });

    for (let pas = 0; pas < 20 && document.activeElement !== bouton; pas += 1) {
      await utilisateur.tab();
    }
    expect(document.activeElement).toBe(bouton);
    const avant = instants.length;
    await utilisateur.keyboard("{Enter}");

    expect(instants.length).toBe(avant + 1);
    expect(document.activeElement).toBe(bouton);
  });

  it("F-030-AC13 coupure survenue après une relecture réussie : l'avertissement ne dit pas que l'enregistré n'a pas pu être lu", async () => {
    await ouvrirPuisCouper();

    expect(avertissement().textContent).toBe(`${COUPURE}${REESSAYER}`);
    expect(zone().textContent).toBe(NON_ENREGISTRE);
  });

  it("F-030-AC13 une tentative qui relit la base puis échoue à y écrire laisse la coupure, mais la base a été relue : la phrase sur ce qui n'a pas pu être lu est retirée, le reste de l'avertissement demeure", async () => {
    const premiere = await ouvrirCoquille();
    await laisserIndexedDbTravailler();
    premiere.session.fermer();
    document.body.replaceChildren();
    simulerLHorloge();
    refuserLesOuverturesParUneException();
    rendreApplication();
    await laisserFaire();
    vi.restoreAllMocks();
    expect(avertissement().textContent).toBe(`${COUPURE}${JAMAIS_RELUE}${REESSAYER}`);

    annulerLesProchainsAjouts(1);
    await tentativeSuivante();

    expect(avertissement().textContent).toBe(`${COUPURE}${REESSAYER}`);
    expect(zone().textContent).toBe(NON_ENREGISTRE);
  });

  it("F-030-AC23 identifiant d'espace illisible et plusieurs bases d'espace : l'application enregistre sous le candidat et dit, dans une alerte, que des pages n'ont pas pu être rattachées ; rien de tel sinon", async () => {
    await inscrireALaPlaceDeLIdentifiant(null);
    for (const idEspace of [ESPACE_A, ESPACE_B]) {
      const persistance = ouvrirPersistance(new Y.Doc(), { type: "espace", idEspace });
      await attendreEtat(persistance, "active");
      persistance.fermer();
    }

    await ouvrirCoquille();

    expect(avertissement().textContent).toBe(NON_RATTACHEES);
    expect(screen.queryByRole("button", { name: REESSAYER })).toBeNull();
    expect(zone().textContent).toBe(ENREGISTRE);
  });
});

describe("reprise à l'écran", () => {
  it("F-030-AC6 F-030-AC14 F-030-AC26 (2) F-030-AC29 (3) une tentative dont l'écriture de l'état complet échoue alors que `synced` est émis laisse l'avertissement et « Non enregistré », sans annonce, et une modification faite ensuite n'ajoute rien à la base ; la suivante retire l'avertissement, la zone dit « Enregistré sur cet appareil » et annonce une fois « Modifications enregistrées sur cet appareil. », sans déplacer le focus, et la base relue lit comme la mémoire", async () => {
    const { session } = await ouvrirPuisCouper();
    act(() => void operations(session).creerPage("Pendant la coupure"));
    const nouvellePage = screen.getByRole("button", { name: "Nouvelle page" });
    nouvellePage.focus();
    const alerte = avertissement();
    const instances = instancesAyantRelu(docDe(session));

    annulerLesProchainsAjouts(1);
    await tentativeSuivante();
    vi.restoreAllMocks();
    expect(instances.map((instance) => instance.synced)).toEqual([true]);
    expect(session.lireEtat()).toMatchObject({ phase: "pret", enregistre: false });
    expect(avertissement()).toBe(alerte);
    expect(zone().textContent).toBe(NON_ENREGISTRE);
    expect(document.body.textContent).not.toMatch(AFFIRMATION);
    const avantLaSuivante = await enregistrements(await baseDeLEspaceLocal());
    act(() => void operations(session).creerPage("Après la tentative en échec"));
    await laisserFaire();
    expect(await enregistrements(await baseDeLEspaceLocal())).toEqual(avantLaSuivante);
    expect(await titresDansLaBase()).toEqual([]);

    await tentativeSuivante();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(zone().textContent).toBe(`${ENREGISTRE} ${ANNONCE}`);
    expect(document.body.textContent?.split(ANNONCE)).toHaveLength(2);
    expect(document.activeElement).toBe(nouvellePage);
    expect(await titresDansLaBase()).toEqual(["Après la tentative en échec", "Pendant la coupure"]);
    expect(await titresDansLaBase()).toEqual(
      ouvrirFacade(docDe(session))
        .lire()
        .racines.map((page) => page.titre)
        .sort(),
    );

    // L'annonce n'est pas refaite à la modification suivante.
    const reecritures = vi.fn();
    const observateur = new MutationObserver(reecritures);
    observateur.observe(zone(), { childList: true, subtree: true, characterData: true });
    act(() => void operations(session).creerPage("Après la reprise"));
    await laisserFaire();
    expect(observateur.takeRecords()).toEqual([]);
    observateur.disconnect();
    expect(reecritures).not.toHaveBeenCalled();
  });

  it("F-030-AC24 base de l'appareil sans son magasin et montée de version refusée : la coupure est dite par l'avertissement, avec « Réessayer maintenant » ; la tentative suivante répare, l'avertissement et son action sont retirés", async () => {
    await creerUneBase(APPAREIL, []);
    simulerLHorloge();
    const ouvrir = indexedDB.open.bind(indexedDB);
    vi.spyOn(indexedDB, "open").mockImplementation((nom, version) => {
      if (version !== undefined) {
        throw new DOMException("refus", "UnknownError");
      }
      return ouvrir(nom, version);
    });
    const { session } = rendreApplication();
    await laisserFaire();

    expect(session.lireEtat()).toMatchObject({ phase: "pret", enregistre: false });
    expect(avertissement().textContent).toBe(`${COUPURE}${JAMAIS_RELUE}${REESSAYER}`);
    expect(screen.queryByRole("button", { name: REESSAYER })).not.toBeNull();
    expect(zone().textContent).toBe(NON_ENREGISTRE);
    expect((await decrireLaBase(APPAREIL)).magasins).toEqual({});

    vi.restoreAllMocks();
    await tentativeSuivante();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: REESSAYER })).toBeNull();
    expect(zone().textContent).toContain(ENREGISTRE);
    expect(await decrireLaBase(APPAREIL)).toMatchObject({
      version: 2,
      magasins: { reglages: { cleAutomatique: false } },
    });
  });

  it("F-030-AC14 la reprise demandée par « Réessayer maintenant » retire le bouton qui avait le focus : le focus passe à la zone principale, il n'est pas perdu", async () => {
    await ouvrirPuisCouper();
    act(() => void vi.advanceTimersByTime(1_000));
    const bouton = screen.getByRole("button", { name: REESSAYER });
    bouton.focus();

    fireEvent.click(bouton);
    await laisserFaire();
    await laisserFaire();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("main"));
  });

  it("F-030-AC5 état relu ancêtre de l'état en mémoire : pendant la reprise, la barre latérale affichée ne subit aucune mutation, et l'arborescence publiée par la session est la même", async () => {
    const { session } = await ouvrirPuisCouper();
    act(() => void operations(session).creerPage("Créée pendant la coupure"));
    const barre = screen.getByRole("navigation", { name: "Pages" });
    const avant = barre.innerHTML;
    const etatAvant = session.lireEtat();
    const mutations: MutationRecord[] = [];
    const observateur = new MutationObserver((lot) => void mutations.push(...lot));
    observateur.observe(barre, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });

    await tentativeSuivante();
    mutations.push(...observateur.takeRecords());
    observateur.disconnect();

    expect(zone().textContent).toContain(ENREGISTRE);
    expect(mutations).toEqual([]);
    expect(barre.innerHTML).toBe(avant);
    expect(avant).toContain("Créée pendant la coupure");
    expect(session.lireEtat()).toMatchObject({
      arborescence: (etatAvant as { arborescence: unknown }).arborescence,
    });
    // L'observateur voit une mutation de cette barre quand il y en a une.
    const temoin = new MutationObserver(() => undefined);
    temoin.observe(barre, { subtree: true, childList: true });
    act(() => void operations(session).creerPage("Après la reprise"));
    expect(temoin.takeRecords().length).toBeGreaterThan(0);
    temoin.disconnect();
  });

  it("F-030-AC15 la reprise ajoute à l'écran les pages relues de la base, sans rechargement ni état de chargement, sans fermer la saisie de titre en cours ni perdre son texte, en gardant la page sélectionnée", async () => {
    const premiere = await ouvrirCoquille();
    act(() => void operations(premiere.session).creerPage("Dans la base"));
    await laisserIndexedDbTravailler();
    premiere.session.fermer();
    document.body.replaceChildren();
    refuserLesOuverturesParUneException();
    const { utilisateur } = await ouvrirCoquille();
    vi.restoreAllMocks();
    expect(screen.queryByRole("alert")).not.toBeNull();
    await utilisateur.click(screen.getByRole("button", { name: "Nouvelle page" }));
    const champ = screen.getByRole("textbox", { name: "Titre de la page" });
    await utilisateur.type(champ, "Titre en cours");
    const adresse = window.location.hash;
    const chargements = vi.fn();
    const observateur = new MutationObserver(() => {
      if (document.body.textContent.includes("Chargement…")) {
        chargements();
      }
    });
    observateur.observe(document.body, { childList: true, subtree: true });

    // La tentative automatique vient deux secondes après l'échec de l'ouverture, à l'horloge réelle.
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull(), { timeout: 4_000 });
    observateur.disconnect();

    expect(screen.queryByRole("link", { name: "Dans la base" })).not.toBeNull();
    expect(chargements).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Titre de la page" })).toBe(champ);
    expect((champ as HTMLInputElement).value).toBe("Titre en cours");
    expect(document.activeElement).toBe(champ);
    expect(window.location.hash).toBe(adresse);
  });

  it("F-030-AC15 une adresse qui désignait une page présente dans la seule base affiche « Page introuvable » pendant la coupure, puis la page, sélectionnée, ses ancêtres dépliés, à la reprise", async () => {
    const premiere = await ouvrirCoquille();
    const ops = operations(premiere.session);
    let fille = "";
    act(() => {
      const mere = ops.creerPage("Mère");
      fille = ops.creerPage("Fille", { parent: mere });
    });
    await laisserIndexedDbTravailler();
    premiere.session.fermer();
    document.body.replaceChildren();
    simulerLHorloge();
    refuserLesOuverturesParUneException();
    window.location.hash = `#/page/${fille}`;
    rendreApplication();
    await laisserFaire();
    vi.restoreAllMocks();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Page introuvable");

    await tentativeSuivante();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Fille");
    const barre = within(screen.getByRole("navigation", { name: "Pages" }));
    expect(barre.getByRole("link", { name: "Fille" }).getAttribute("aria-current")).toBe("page");
    expect(barre.queryByRole("link", { name: "Mère" })).not.toBeNull();
  });

  it("F-030-AC17 pendant une tentative qui ne répond pas, créer et renommer une page n'attend rien ; ces modifications sont dans la base après la reprise", async () => {
    const { session } = await ouvrirPuisCouper();
    const retenues = retenirLesOuvertures();
    act(() => void vi.advanceTimersToNextTimer());
    await laisserFaire();
    expect(screen.queryByRole("alert")).not.toBeNull();

    act(() => {
      const page = operations(session).creerPage("Créée pendant la tentative");
      operations(session).renommerPage(page, "Renommée pendant la tentative");
    });
    expect(screen.queryByRole("link", { name: "Renommée pendant la tentative" })).not.toBeNull();

    retenues.cesser();
    act(() => retenues.repondre());
    await laisserFaire();
    await laisserFaire();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(await titresDansLaBase()).toEqual(["Renommée pendant la tentative"]);
  });
});

describe("onglet quitté ou masqué pendant une coupure", () => {
  function ecouteursDe(type: string): () => number {
    const poses = new Set<unknown>();
    const ajouter = window.addEventListener.bind(window);
    const retirer = window.removeEventListener.bind(window);
    vi.spyOn(window, "addEventListener").mockImplementation((...arguments_) => {
      if (arguments_[0] === type) {
        poses.add(arguments_[1]);
      }
      ajouter(...(arguments_ as Parameters<typeof ajouter>));
    });
    vi.spyOn(window, "removeEventListener").mockImplementation((...arguments_) => {
      if (arguments_[0] === type) {
        poses.delete(arguments_[1]);
      }
      retirer(...(arguments_ as Parameters<typeof retirer>));
    });
    return () => poses.size;
  }

  it("F-030-AC16 l'écouteur `beforeunload` n'est inscrit que tant qu'une modification n'est pas enregistrée : absent avant la coupure et pendant une coupure sans modification, présent après une modification, il annule l'événement ; absent après la reprise", async () => {
    const inscrits = ecouteursDe("beforeunload");
    const connexions = suivreLesConnexionsTenues();
    const { session } = await ouvrirCoquille();
    expect(inscrits()).toBe(0);
    simulerLHorloge();
    act(() => fermerDeForce(connexions.at(-1) as IDBDatabase));
    await laisserFaire();
    expect(screen.queryByRole("alert")).not.toBeNull();
    expect(inscrits()).toBe(0);
    expect(tenterDeQuitter().defaultPrevented).toBe(false);

    act(() => void operations(session).creerPage("Pendant la coupure"));
    expect(inscrits()).toBe(1);
    const depart = tenterDeQuitter();
    expect(depart.defaultPrevented).toBe(true);
    expect(depart.valeurDeRetour).toBe(true);

    await tentativeSuivante();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(inscrits()).toBe(0);
    expect(tenterDeQuitter().defaultPrevented).toBe(false);
  });

  it("F-030-AC11 F-030-AC16 une session fermée pendant une coupure avec modification retire l'écouteur `beforeunload`", async () => {
    const { session } = await ouvrirPuisCouper();
    // Posé après la coupure, qui rend les fonctions espionnées : posé avant, il ne compterait rien.
    const inscrits = ecouteursDe("beforeunload");
    act(() => void operations(session).creerPage("Pendant la coupure"));
    expect(inscrits()).toBe(1);
    expect(tenterDeQuitter().defaultPrevented).toBe(true);

    act(() => session.fermer());

    expect(inscrits()).toBe(0);
    expect(tenterDeQuitter().defaultPrevented).toBe(false);
  });

  it.each([
    ["l'onglet passe à l'état masqué", (): void => rendreLOnglet("hidden")],
    ["l'onglet reçoit `pagehide`", (): void => void window.dispatchEvent(new Event("pagehide"))],
  ])(
    "F-030-AC27 %s pendant une coupure : une tentative est demandée aussitôt s'il y a une modification non enregistrée, aucune sans modification, aucune après la fermeture",
    async (_cas, quitter) => {
      const { session } = await ouvrirPuisCouper();
      const instants = instantsDesOuvertures();
      act(() => void vi.advanceTimersByTime(1_000));

      quitter();
      expect(instants).toEqual([]);

      act(() => void operations(session).creerPage("Pendant la coupure"));
      quitter();
      expect(instants).toHaveLength(1);
      expect(document.body.textContent).not.toMatch(AFFIRMATION);

      act(() => session.fermer());
      const avant = instants.length;
      act(() => void vi.advanceTimersByTime(5_000));
      quitter();
      expect(instants).toHaveLength(avant);
    },
  );
});
