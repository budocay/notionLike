// Ce que l'écran de l'espace montre de la synchronisation (F-013-AC1, AC10 à AC14, AC23 à AC29,
// AC31, AC32, AC47 à AC49). Le module est le vrai pour F-013-AC1 ; ailleurs, une synchronisation
// simulée, qui expose la seule interface du module, pose l'état que chaque écran doit rendre.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import * as Y from "yjs";

import { Application } from "../src/interface/Application.tsx";
import { serveurDesEspaces, sourceDuCompte } from "../src/interface/branchement-synchronisation.ts";
import {
  NOM_DE_LA_BARRE_DE_BLOCS,
  nomActionsDeLaPage,
  nomAjouterSousPage,
  nomRestaurer,
  nomSupprimer,
  TITRE_DE_LA_PAGE,
} from "../src/interface/messages.ts";
import { ENTREE_CORBEILLE } from "../src/interface/messages-corbeille.ts";
import { SERVEUR_INJOIGNABLE } from "../src/interface/messages-compte.ts";
import { QUOTA_D_ESPACES, REGLE_DU_NOM } from "../src/interface/messages-espaces.ts";
import {
  ANNULER,
  COPIE_DIVERGENTE,
  DEMANDE_UNE_CONNEXION_AU_SERVEUR,
  DETACHE_CAUSE,
  DROIT_DEVENU_ECRITURE,
  DROIT_DEVENU_LECTURE,
  type EffetDUnMotif,
  EFFACEMENT_INCOMPLET,
  EFFACER_LA_COPIE_LOCALE,
  EFFET_DE_L_ADOPTION,
  espaceDejaExistant,
  espaceSynchronise,
  HORS_LIGNE_SANS_STOCKAGE,
  IDENTIFIANT_DEJA_PRIS,
  LECTURE_SEULE,
  MESSAGES_DES_MOTIFS,
  NOM_DE_LA_ZONE_DE_SYNCHRONISATION,
  PAGES_CONCERNEES,
  RECHARGER,
  REESSAYER,
  REFUS_DE_CONNEXION,
  SYNCHRONISER,
  SYNCHRONISER_CET_ESPACE,
  texteDeLEffacement,
  texteDUneErreur,
  texteDUnMotif,
  TITRES_DES_ETATS,
  TRANSMISES,
  TRANSMISES_SANS_STOCKAGE,
} from "../src/interface/messages-synchronisation.ts";
import type {
  EspaceASynchroniser,
  FabriqueDeSynchronisation,
} from "../src/interface/synchronisation-ouverte.ts";
import { ZoneDeSynchronisation } from "../src/interface/ZoneDeSynchronisation.tsx";
import {
  type CauseDErreur,
  demarrerSynchronisation,
  type Environnement,
  type EtatAffiche,
  ETATS_AFFICHES,
  type EtatDeSynchronisation,
  type IssueDAdoption,
  type IssueDeLEffacement,
  type PageAffichee,
  type Synchronisation,
  type TableAffichee,
} from "../src/synchronisation/index.ts";
import { compteSimule, jamais, moi200, ROUTES, serveurSimule } from "./aides-compte.tsx";
import { boutonNouvellePage, fermerLOnglet } from "./aides-coquille.tsx";
import { demarrerSession } from "./aides-facade.ts";
import {
  fermerDeForce,
  laisserIndexedDbTravailler,
  nomsDesBases,
  suivreLesConnexionsTenues,
} from "./aides-persistance.ts";
import { ouvrirUnePage, poserLeRattachement } from "./aides-page.tsx";
import { simulerLHorloge, tenterDeQuitter } from "./aides-reprise.ts";
import { attendreLaZoneDeSaisie } from "./edition/aides-edition.tsx";

type SessionEspace = ReturnType<typeof demarrerSession>;
type OperationsDeLEspace = Extract<
  ReturnType<SessionEspace["lireEtat"]>,
  { readonly phase: "pret" }
>["operations"];

// ---------------------------------------------------------------------------------------------
// Une synchronisation simulée : l'interface du module, un état posé par le test.

const ETAT_LOCAL: EtatDeSynchronisation = {
  affiche: "local",
  rattachement: "local",
  registreLu: true,
  droit: "ecriture",
  compte: "connecte",
  refusDeConnexion: false,
  detache: false,
  documentsEnErreur: [],
  divergentes: [],
  droitChange: undefined,
};

interface Simulee {
  readonly fabrique: FabriqueDeSynchronisation;
  poser(partiel: Partial<EtatDeSynchronisation>): void;
  /** Les documents que le serveur a acquittés. */
  readonly acquittes: Set<Y.Doc>;
  reponseDAdoption: () => Promise<IssueDAdoption>;
  reponseDEffacement: () => Promise<IssueDeLEffacement>;
  readonly adoptions: string[];
  readonly documentsReessayes: (string | undefined)[];
  readonly pages: (PageAffichee | undefined)[];
  /** F-018 : les tables affichées. */
  readonly tables: TableAffichee[];
  /** `aucun` : F-018, les appels qui ne laissent aucun document affiché. */
  readonly compteurs: { reessais: number; effacements: number; aucun: number };
  espace(): EspaceASynchroniser | undefined;
}

function synchronisationSimulee(initial: Partial<EtatDeSynchronisation> = {}): Simulee {
  let etat: EtatDeSynchronisation = { ...ETAT_LOCAL, ...initial };
  const abonnes = new Set<() => void>();
  let dernier: EspaceASynchroniser | undefined;
  const simulee: Simulee = {
    acquittes: new Set(),
    reponseDAdoption: () =>
      Promise.resolve({ sorte: "adopte", nom: "Équipe", rejouee: false, droit: "ecriture" }),
    reponseDEffacement: () => Promise.resolve("echec"),
    adoptions: [],
    documentsReessayes: [],
    pages: [],
    tables: [],
    compteurs: { reessais: 0, effacements: 0, aucun: 0 },
    espace: () => dernier,
    poser: (partiel) => {
      etat = { ...etat, ...partiel };
      abonnes.forEach((rappel) => rappel());
    },
    // StrictMode démarre, ferme puis redémarre : chaque démarrage rend la même interface.
    fabrique: (espace): Synchronisation => {
      dernier = espace;
      return {
        lireEtat: () => etat,
        abonner: (rappel) => {
          abonnes.add(rappel);
          return () => abonnes.delete(rappel);
        },
        afficherPage: (page) => simulee.pages.push(page),
        // F-018 : la table affichée.
        afficherTable: (table) => simulee.tables.push(table),
        afficherAucun: () => {
          simulee.compteurs.aucun += 1;
        },
        adopter: (nom) => {
          simulee.adoptions.push(nom);
          return simulee.reponseDAdoption();
        },
        reessayer: () => {
          simulee.compteurs.reessais += 1;
        },
        reessayerLeDocument: (idPage) => simulee.documentsReessayes.push(idPage),
        effacerLaCopieLocale: () => {
          simulee.compteurs.effacements += 1;
          return simulee.reponseDEffacement();
        },
        toutEstAcquitte: () => simulee.acquittes.size > 0,
        estAcquitte: (doc) => simulee.acquittes.has(doc),
        fermer: () => undefined,
      };
    },
  };
  return simulee;
}

type Compte = ReturnType<typeof compteSimule>;

function rendre(
  session: SessionEspace,
  synchronisation: (compte: Compte) => FabriqueDeSynchronisation,
  moi: () => Response | Promise<Response> = () => moi200(),
): void {
  const compte = compteSimule(serveurSimule({ [ROUTES.moi]: moi }));
  render(
    <StrictMode>
      <Application session={session} compte={compte} synchronisation={synchronisation(compte)} />
    </StrictMode>,
  );
}

async function ouvrirAvec(simulee: Simulee): Promise<{ session: SessionEspace }> {
  const session = demarrerSession();
  rendre(session, () => simulee.fabrique);
  await boutonNouvellePage();
  await screen.findByRole("region", { name: NOM_DE_LA_ZONE_DE_SYNCHRONISATION });
  return { session };
}

function zone(): HTMLElement {
  return screen.getByRole("region", { name: NOM_DE_LA_ZONE_DE_SYNCHRONISATION });
}

function phrasesDeLaZone(): string[] {
  return [...within(zone()).getByRole("status").querySelectorAll("p")].map(
    ({ textContent }) => textContent,
  );
}

function descriptionDe(element: HTMLElement): string {
  const id = element.getAttribute("aria-describedby") ?? "";
  return id === "" ? "" : (document.getElementById(id)?.textContent ?? "");
}

function creerPage(session: SessionEspace, titre: string): string {
  const etat = session.lireEtat();
  if (etat.phase !== "pret") {
    throw new Error("La session n'est pas prête.");
  }
  let id = "";
  act(() => {
    id = etat.operations.creerPage(titre);
  });
  return id;
}

function poser(simulee: Simulee, partiel: Partial<EtatDeSynchronisation>): void {
  act(() => simulee.poser(partiel));
}

// ---------------------------------------------------------------------------------------------

/** Une WebSocket qui ne s'établit jamais : ni ouverture, ni erreur, ni fermeture. */
function priseMuette(): { readonly constructeur: Environnement["WebSocket"]; nombre(): number } {
  let nombre = 0;
  class PriseMuette extends EventTarget {
    readonly url: string;
    readyState = 0;
    binaryType = "arraybuffer";
    onopen = null;
    onmessage = null;
    onclose = null;
    onerror = null;
    constructor(adresse: string) {
      super();
      this.url = adresse;
      nombre += 1;
    }
    send(): void {
      return undefined;
    }
    close(): void {
      return undefined;
    }
  }
  return {
    constructeur: PriseMuette as unknown as Environnement["WebSocket"],
    nombre: () => nombre,
  };
}

describe("F-013-AC1 rien n'attend le serveur", () => {
  it.each([
    ["la requête moi ne répond jamais", "jamais", 0],
    ["le compte est connecté et la WebSocket ne s'établit jamais", "connecte", 1],
  ] as const)(
    "F-013-AC1 espace adopté, %s : l'arborescence et l'éditeur de la page sélectionnée s'affichent dès leur relecture locale",
    async (_, moi, tentatives) => {
      const premiere = await ouvrirUnePage("Écrite avant");
      await poserLeRattachement(premiere.idEspace, { rattachement: "adopte", droit: "ecriture" });
      fermerLOnglet(premiere);
      const prise = priseMuette();

      const session = demarrerSession();
      rendre(
        session,
        (compte) => (espace) =>
          demarrerSynchronisation({
            ...espace,
            environnement: {
              WebSocket: prise.constructeur,
              adresse: "ws://localhost/synchro",
              horloge: {
                maintenant: () => Date.now(),
                programmer: (rappel, delaiMs) => {
                  const minuterie = setTimeout(rappel, delaiMs);
                  return () => clearTimeout(minuterie);
                },
              },
              alea: () => 0.5,
              ecouter: () => () => undefined,
              ouvrirUnCanal: () => ({
                postMessage: () => undefined,
                close: () => undefined,
                onmessage: null,
              }),
            },
            compte: sourceDuCompte(compte.suivi),
            serveur: serveurDesEspaces(compte.espaces),
          }),
        moi === "jamais" ? jamais : () => moi200(),
      );

      expect(await screen.findByRole("link", { name: "Écrite avant" })).toBeDefined();
      expect(await attendreLaZoneDeSaisie()).toBeDefined();
      await waitFor(() => expect(prise.nombre()).toBeGreaterThanOrEqual(tentatives));
      expect(phrasesDeLaZone()[0]).toBe(
        moi === "jamais" ? TITRES_DES_ETATS["hors-ligne"] : TITRES_DES_ETATS.connexion,
      );
    },
  );
});

describe("F-013-AC10 F-013-AC11 adoption proposée, jamais imposée", () => {
  it("F-013-AC10 compte connecté, espace local : « Sur cet appareil uniquement » et « Synchroniser cet espace », rien n'est adopté sans elle ; hors ligne, l'action est désactivée avec sa raison ; compte déconnecté ou registre non lu, elle n'est pas proposée", async () => {
    const simulee = synchronisationSimulee();
    await ouvrirAvec(simulee);

    expect(phrasesDeLaZone()).toEqual([TITRES_DES_ETATS.local]);
    expect(
      within(zone())
        .getByRole("button", { name: SYNCHRONISER_CET_ESPACE })
        .hasAttribute("disabled"),
    ).toBe(false);
    expect(simulee.adoptions).toEqual([]);

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    const desactivee = within(zone()).getByRole("button", { name: SYNCHRONISER_CET_ESPACE });
    expect(desactivee.hasAttribute("disabled")).toBe(true);
    expect(descriptionDe(desactivee)).toBe(DEMANDE_UNE_CONNEXION_AU_SERVEUR);

    poser(simulee, { compte: "deconnecte" });
    expect(within(zone()).queryByRole("button", { name: SYNCHRONISER_CET_ESPACE })).toBeNull();
    poser(simulee, { compte: "connecte", registreLu: false });
    expect(within(zone()).queryByRole("button", { name: SYNCHRONISER_CET_ESPACE })).toBeNull();
    expect(simulee.adoptions).toEqual([]);
  });

  it("F-013-AC11 la boîte demande le nom (vide, focus dessus), dit l'effet de l'adoption ; annulée, elle n'envoie rien et rend le focus à l'action ; un nom non conforme n'envoie rien et cite la règle", async () => {
    const simulee = synchronisationSimulee();
    await ouvrirAvec(simulee);
    const utilisateur = userEvent.setup();
    const action = within(zone()).getByRole("button", { name: SYNCHRONISER_CET_ESPACE });

    await utilisateur.click(action);
    const boite = screen.getByRole("dialog", { name: SYNCHRONISER_CET_ESPACE });
    const champ = within(boite).getByRole("textbox");
    expect((champ as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(champ);
    expect(boite.textContent).toContain(EFFET_DE_L_ADOPTION);
    await utilisateur.click(within(boite).getByRole("button", { name: ANNULER }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(action));

    await utilisateur.click(action);
    const seconde = screen.getByRole("dialog", { name: SYNCHRONISER_CET_ESPACE });
    await utilisateur.type(within(seconde).getByRole("textbox"), "   ");
    await utilisateur.click(within(seconde).getByRole("button", { name: SYNCHRONISER }));
    expect(seconde.textContent).toContain(REGLE_DU_NOM);
    await utilisateur.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(simulee.adoptions).toEqual([]);
  });

  it.each<[string, IssueDAdoption, string]>([
    [
      "adopté",
      { sorte: "adopte", nom: "Équipe", rejouee: false, droit: "ecriture" },
      espaceSynchronise("Équipe"),
    ],
    [
      "création rejouée",
      { sorte: "adopte", nom: "Déjà là", rejouee: true, droit: "ecriture" },
      espaceDejaExistant("Déjà là"),
    ],
  ])(
    "F-013-AC12 F-013-AC13 confirmée une seule fois (%s) : une adoption, la boîte se ferme et la zone l'annonce",
    async (_, issue, annonce) => {
      const simulee = synchronisationSimulee();
      let liberer = (): void => undefined;
      simulee.reponseDAdoption = () =>
        new Promise((resoudre) => {
          liberer = () => resoudre(issue);
        });
      await ouvrirAvec(simulee);
      const utilisateur = userEvent.setup();
      await utilisateur.click(
        within(zone()).getByRole("button", { name: SYNCHRONISER_CET_ESPACE }),
      );
      const boite = screen.getByRole("dialog");
      await utilisateur.type(within(boite).getByRole("textbox"), "Équipe");
      await utilisateur.keyboard("{Enter}");
      await utilisateur.keyboard("{Enter}");
      fireEvent.submit(within(boite).getByRole("button", { name: SYNCHRONISER }));

      expect(simulee.adoptions).toEqual(["Équipe"]);
      act(() => liberer());
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(phrasesDeLaZone()).toContain(annonce);
    },
  );

  it.each<[string, IssueDAdoption, string]>([
    ["identifiant pris", { sorte: "identifiant-pris" }, IDENTIFIANT_DEJA_PRIS],
    [
      "serveur injoignable",
      { sorte: "echec", erreur: { type: "hors-ligne" } },
      SERVEUR_INJOIGNABLE,
    ],
    [
      "quota atteint",
      { sorte: "echec", erreur: { type: "enveloppe", code: "quota-atteint" } },
      QUOTA_D_ESPACES,
    ],
  ])(
    "F-013-AC13 F-013-AC14 échec (%s) : la boîte reste ouverte avec son message, le nom saisi est gardé et un nouvel essai est possible",
    async (_, issue, message) => {
      const simulee = synchronisationSimulee();
      simulee.reponseDAdoption = () => Promise.resolve(issue);
      await ouvrirAvec(simulee);
      const utilisateur = userEvent.setup();
      await utilisateur.click(
        within(zone()).getByRole("button", { name: SYNCHRONISER_CET_ESPACE }),
      );
      const boite = screen.getByRole("dialog");
      await utilisateur.type(within(boite).getByRole("textbox"), "Équipe");
      await utilisateur.click(within(boite).getByRole("button", { name: SYNCHRONISER }));

      await waitFor(() => expect(within(boite).getByRole("alert").textContent).toBe(message));
      expect((within(boite).getByRole("textbox") as HTMLInputElement).value).toBe("Équipe");
      await utilisateur.click(within(boite).getByRole("button", { name: SYNCHRONISER }));
      await waitFor(() => expect(simulee.adoptions).toEqual(["Équipe", "Équipe"]));
      expect(phrasesDeLaZone()).toEqual([TITRES_DES_ETATS.local]);
    },
  );
});

describe("F-013-AC23 F-013-AC24 espace détaché, effacement de la copie locale", () => {
  it("F-013-AC23 détaché : la cause, « Réessayer » rejoue la vérification, « Effacer la copie locale » est proposé", async () => {
    const simulee = synchronisationSimulee({
      affiche: "detache",
      rattachement: "adopte",
      detache: true,
    });
    await ouvrirAvec(simulee);

    expect(phrasesDeLaZone()[0]).toContain(DETACHE_CAUSE);
    await userEvent.setup().click(within(zone()).getByRole("button", { name: REESSAYER }));
    expect(simulee.compteurs.reessais).toBe(1);
    expect(within(zone()).getByRole("button", { name: EFFACER_LA_COPIE_LOCALE })).toBeDefined();
  });

  it("F-013-AC24 la confirmation est une alerte qui cite le nombre de pages, dit l'irréversible, focus sur « Annuler » ; annulée, rien n'est effacé ; confirmée, l'onglet ferme ses documents puis efface ; un échec est signalé", async () => {
    const simulee = synchronisationSimulee({
      affiche: "detache",
      rattachement: "adopte",
      detache: true,
    });
    const { session } = await ouvrirAvec(simulee);
    creerPage(session, "Une");
    creerPage(session, "Deux");
    const utilisateur = userEvent.setup();
    const action = within(zone()).getByRole("button", { name: EFFACER_LA_COPIE_LOCALE });

    await utilisateur.click(action);
    const alerte = screen.getByRole("alertdialog", { name: EFFACER_LA_COPIE_LOCALE });
    expect(descriptionDe(alerte)).toBe(texteDeLEffacement(2).join(""));
    expect(document.activeElement).toBe(within(alerte).getByRole("button", { name: ANNULER }));
    await utilisateur.keyboard("{Enter}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(action));
    expect(simulee.compteurs.effacements).toBe(0);

    await utilisateur.click(action);
    const confirmation = screen.getByRole("alertdialog");
    await utilisateur.click(
      within(confirmation).getByRole("button", { name: EFFACER_LA_COPIE_LOCALE }),
    );
    expect(simulee.compteurs.effacements).toBe(1);
    expect(session.lireEtat().phase).toBe("pret");
    await waitFor(() =>
      expect(within(confirmation).getByRole("alert").textContent).toBe(EFFACEMENT_INCOMPLET),
    );
    expect(within(confirmation).getByRole("button", { name: RECHARGER })).toBeDefined();
  });
});

describe("F-013-AC25 à AC29, AC47 droits, copie divergente et documents en erreur", () => {
  it("F-013-AC25 F-013-AC26 en lecture seule, l'état le dit, la création est désactivée avec sa raison, l'éditeur ne modifie rien ; le changement de droit est annoncé", async () => {
    const simulee = synchronisationSimulee();
    const { session } = await ouvrirAvec(simulee);
    const utilisateur = userEvent.setup();
    await utilisateur.click(await boutonNouvellePage());
    const saisie = await attendreLaZoneDeSaisie();
    await waitFor(() => expect(simulee.pages.at(-1)).toBeDefined());
    const page = simulee.pages.at(-1) as PageAffichee;

    poser(simulee, {
      affiche: "synchronise",
      rattachement: "adopte",
      droit: "lecture",
      droitChange: "lecture",
    });
    expect(phrasesDeLaZone()).toEqual([
      TITRES_DES_ETATS.synchronise,
      TRANSMISES,
      LECTURE_SEULE,
      DROIT_DEVENU_LECTURE,
    ]);
    const creer = await boutonNouvellePage();
    expect(creer.hasAttribute("disabled")).toBe(true);
    expect(descriptionDe(creer)).toBe(LECTURE_SEULE);
    await waitFor(() => expect(saisie.getAttribute("contenteditable")).toBe("false"));
    const avant = Y.encodeStateAsUpdate(page.doc);
    await utilisateur.type(saisie, "refusé");
    expect(Y.encodeStateAsUpdate(page.doc)).toEqual(avant);
    expect(session.lireEtat().phase).toBe("pret");
  });

  it("F-013-AC25 en lecture seule, aucune action de la barre ni de l'éditeur n'écrit, même par un chemin ouvert avant le changement de droit : documents d'espace et de page identiques octet pour octet, aucune mise à jour", async () => {
    const simulee = synchronisationSimulee();
    const { session } = await ouvrirAvec(simulee);
    const utilisateur = userEvent.setup();
    creerPage(session, "Alpha");
    await utilisateur.click(await screen.findByRole("link", { name: "Alpha" }));
    const saisie = await attendreLaZoneDeSaisie();
    await utilisateur.click(saisie);
    await utilisateur.keyboard("Avant");
    await waitFor(() => expect(simulee.pages.at(-1)).toBeDefined());
    const page = simulee.pages.at(-1) as PageAffichee;
    // Une saisie de titre ouverte pendant que l'espace était modifiable.
    screen.getByRole("link", { name: "Alpha" }).focus();
    await utilisateur.keyboard("{F2}");
    const champ = screen.getByRole("textbox", { name: TITRE_DE_LA_PAGE });
    await utilisateur.clear(champ);
    await utilisateur.type(champ, "Renommée");

    poser(simulee, { affiche: "synchronise", rattachement: "adopte", droit: "lecture" });
    const docs = [session.doc as Y.Doc, page.doc];
    const avant = docs.map((doc) => Y.encodeStateAsUpdate(doc));
    let mises = 0;
    const compter = (): void => {
      mises += 1;
    };
    docs.forEach((doc) => doc.on("update", compter));

    await utilisateur.keyboard("{Enter}");
    const lien = screen.getByRole("link", { name: "Alpha" });
    lien.focus();
    await utilisateur.keyboard("{F2}");
    fireEvent.doubleClick(lien);
    expect(screen.queryByRole("textbox", { name: TITRE_DE_LA_PAGE })).toBeNull();
    fireEvent.click(await boutonNouvellePage());
    fireEvent.click(screen.getByRole("button", { name: nomAjouterSousPage("Alpha") }));
    await utilisateur.click(screen.getByRole("button", { name: nomActionsDeLaPage("Alpha") }));
    for (const entree of screen.getAllByRole("menuitem")) {
      fireEvent.click(entree);
    }
    await utilisateur.click(saisie);
    await utilisateur.keyboard("frappe");
    fireEvent.paste(saisie, {
      clipboardData: { getData: () => "collé", types: ["text/plain"], files: [] },
    });
    await utilisateur.keyboard("{Control>}z{/Control}");
    await utilisateur.keyboard("{Alt>}{F10}{/Alt}");
    expect(screen.queryByRole("toolbar", { name: NOM_DE_LA_BARRE_DE_BLOCS })).toBeNull();
    await act(() => laisserIndexedDbTravailler());

    docs.forEach((doc) => doc.off("update", compter));
    expect(docs.map((doc) => Y.encodeStateAsUpdate(doc))).toEqual(avant);
    expect(mises).toBe(0);
    expect(screen.getByRole("link", { name: "Alpha" })).toBeDefined();
  });

  it("F-013-AC25 en lecture seule, la corbeille ne restaure ni ne supprime, pas même par une confirmation ouverte avant le changement de droit", async () => {
    const simulee = synchronisationSimulee();
    const { session } = await ouvrirAvec(simulee);
    const utilisateur = userEvent.setup();
    const jetee = creerPage(session, "Jetée");
    const etat = session.lireEtat();
    if (etat.phase !== "pret") {
      throw new Error("La session n'est pas prête.");
    }
    act(() => etat.operations.mettreALaCorbeille(jetee));
    await utilisateur.click(screen.getByRole("button", { name: ENTREE_CORBEILLE }));
    await utilisateur.click(await screen.findByRole("button", { name: nomSupprimer("Jetée") }));
    const confirmation = screen.getByRole("alertdialog");

    poser(simulee, { affiche: "synchronise", rattachement: "adopte", droit: "lecture" });
    const doc = session.doc as Y.Doc;
    const avant = Y.encodeStateAsUpdate(doc);
    let mises = 0;
    const compter = (): void => {
      mises += 1;
    };
    doc.on("update", compter);
    await utilisateur.click(
      within(confirmation).getByRole("button", { name: nomSupprimer("Jetée") }),
    );
    expect(screen.getByRole("alert").textContent).toBe(LECTURE_SEULE);
    fireEvent.click(screen.getByRole("button", { name: nomRestaurer("Jetée") }));
    fireEvent.click(screen.getByRole("button", { name: nomSupprimer("Jetée") }));
    doc.off("update", compter);

    expect(Y.encodeStateAsUpdate(doc)).toEqual(avant);
    expect(mises).toBe(0);
  });

  it("F-013-AC27 copie divergente : le message, les pages concernées et « Effacer la copie locale »", async () => {
    const simulee = synchronisationSimulee();
    const { session } = await ouvrirAvec(simulee);
    const idPage = creerPage(session, "Divergente");
    poser(simulee, {
      affiche: "erreur",
      rattachement: "adopte",
      droit: "lecture",
      divergentes: [idPage, undefined],
    });

    expect(phrasesDeLaZone()).toEqual(
      expect.arrayContaining([
        TITRES_DES_ETATS.erreur,
        COPIE_DIVERGENTE,
        `${PAGES_CONCERNEES} « Divergente », l'arborescence de l'espace`,
      ]),
    );
    expect(within(zone()).getByRole("button", { name: EFFACER_LA_COPIE_LOCALE })).toBeDefined();
  });

  it.each<CauseDErreur>([
    "trop-volumineux",
    "document-trop-grand",
    "quota-atteint",
    "version-refusee",
  ])(
    "F-013-AC28 F-013-AC29 F-013-AC47 « %s » : le message cite la page et « Réessayer » la vise, elle seule",
    async (cause) => {
      const simulee = synchronisationSimulee();
      const { session } = await ouvrirAvec(simulee);
      const idPage = creerPage(session, "Bloquée");
      creerPage(session, "Libre");
      poser(simulee, {
        affiche: "erreur",
        rattachement: "adopte",
        documentsEnErreur: [{ idPage, cause, reessayable: true }],
      });

      expect(phrasesDeLaZone()).toEqual([
        TITRES_DES_ETATS.erreur,
        texteDUneErreur(cause, "Bloquée", true),
      ]);
      await userEvent
        .setup()
        .click(within(zone()).getByRole("button", { name: `${REESSAYER} : « Bloquée »` }));
      expect(simulee.documentsReessayes).toEqual([idPage]);
    },
  );

  it("F-013-AC19 refus de connexion, compte connecté : la phrase sans cause affirmée, la suggestion, et « Réessayer »", async () => {
    const simulee = synchronisationSimulee({
      affiche: "erreur",
      rattachement: "adopte",
      refusDeConnexion: true,
    });
    await ouvrirAvec(simulee);

    expect(phrasesDeLaZone()).toContain(REFUS_DE_CONNEXION);
    await userEvent.setup().click(within(zone()).getByRole("button", { name: REESSAYER }));
    expect(simulee.compteurs.reessais).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
// F-013-AC31, AC32, AC48 : les textes de la zone, dans chaque état, stockage présent ou coupé.

const CAUSES: readonly CauseDErreur[] = [
  "trop-volumineux",
  "document-trop-grand",
  "quota-atteint",
  "version-refusee",
  "motif-inconnu",
  "acces-refuse",
  "erreur-interne",
];

function etatComplet(affiche: EtatAffiche): EtatDeSynchronisation {
  return {
    ...ETAT_LOCAL,
    affiche,
    rattachement: affiche === "local" ? "local" : "adopte",
    detache: affiche === "detache",
    refusDeConnexion: affiche === "erreur",
    droit: "lecture",
    droitChange: "lecture",
    documentsEnErreur:
      affiche === "erreur"
        ? CAUSES.map((cause) => ({ idPage: cause, cause, reessayable: true }))
        : [],
    divergentes: affiche === "erreur" ? ["une-page"] : [],
  };
}

function texteDeLaZoneSeule(affiche: EtatAffiche, stockageDisponible: boolean): string {
  return texteDeLaZonePour(etatComplet(affiche), stockageDisponible);
}

function texteDeLaZonePour(etat: EtatDeSynchronisation, stockageDisponible: boolean): string {
  const simulee = synchronisationSimulee(etat);
  const synchro = simulee.fabrique({
    idEspace: "x",
    doc: new Y.Doc(),
    lirePages: () => undefined,
    surDocumentsSupprimes: () => undefined,
    surEffacement: () => undefined,
  });
  const rendu = render(
    <ZoneDeSynchronisation
      synchro={synchro}
      etat={synchro.lireEtat()}
      titreDe={(idPage) => (idPage === undefined ? "l'arborescence" : `Titre ${idPage}`)}
      nombreDePages={3}
      stockageDisponible={stockageDisponible}
      avantLEffacement={() => undefined}
    />,
  );
  const texte = [...rendu.container.querySelectorAll("p, button, span")]
    .map(({ textContent }) => textContent)
    .join("\n");
  rendu.unmount();
  return texte;
}

/** L'état que le module publie quand ce motif l'atteint, pour la page « Titre p1 ». */
function etatDUnEffet(effet: EffetDUnMotif, droit: "lecture" | "ecriture"): EtatDeSynchronisation {
  const adopte = { ...ETAT_LOCAL, rattachement: "adopte" as const, droit };
  if ("cause" in effet) {
    return {
      ...adopte,
      affiche: "erreur",
      documentsEnErreur: [{ idPage: "p1", cause: effet.cause, reessayable: false }],
    };
  }
  if ("droit" in effet) {
    return { ...adopte, affiche: "synchronise", droitChange: droit };
  }
  return { ...adopte, affiche: effet.etat, refusDeConnexion: effet.etat === "erreur" };
}

describe("F-013-AC30 le message de chaque couple est celui que la zone affiche", () => {
  const couples = Object.entries(MESSAGES_DES_MOTIFS).flatMap(([motif, canaux]) =>
    Object.entries(canaux).map(([canal, effet]) => ({ motif, canal, effet })),
  );

  it.each(couples)("F-013-AC30 $motif, $canal", ({ effet }) => {
    for (const stockage of [true, false]) {
      for (const droit of ["lecture", "ecriture"] as const) {
        const attendu = texteDUnMotif(effet, "Titre p1", stockage, droit);
        expect(texteDeLaZonePour(etatDUnEffet(effet, droit), stockage).split("\n")).toContain(
          attendu,
        );
      }
    }
  });

  it("F-013-AC26 F-013-AC30 « droits-modifies » annonce le changement dans son sens : lecture seule après une rétrogradation, écriture après une promotion", () => {
    const effet = MESSAGES_DES_MOTIFS["droits-modifies"]["fermeture-d-ouverture"];
    expect(effet).toEqual({ droit: true });
    if (effet === undefined) {
      return;
    }
    expect(texteDUnMotif(effet, "", true, "ecriture")).toBe(DROIT_DEVENU_ECRITURE);
    expect(texteDUnMotif(effet, "", true, "lecture")).toBe(DROIT_DEVENU_LECTURE);
    expect(texteDeLaZonePour(etatDUnEffet(effet, "ecriture"), true)).not.toContain(
      DROIT_DEVENU_LECTURE,
    );
  });
});

describe("F-013-AC31 F-013-AC32 F-013-AC48 les textes de la zone", () => {
  it("F-013-AC31 chaque état de la liste fermée a son titre, seul de la liste à être affiché, annoncé dans une région d'état sans déplacer le focus", async () => {
    const simulee = synchronisationSimulee();
    await ouvrirAvec(simulee);
    const focus = await boutonNouvellePage();
    focus.focus();
    for (const affiche of ETATS_AFFICHES) {
      poser(simulee, etatComplet(affiche));
      const statut = within(zone()).getByRole("status");
      // Un titre ouvre sa phrase : « Cet espace ne se synchronise plus » est suivi de sa cause.
      const titres = Object.values(TITRES_DES_ETATS).filter((titre) =>
        phrasesDeLaZone().some((phrase) => phrase.startsWith(titre)),
      );
      expect(titres, affiche).toEqual([TITRES_DES_ETATS[affiche]]);
      expect(statut.textContent).toContain(TITRES_DES_ETATS[affiche]);
      expect(document.activeElement).toBe(focus);
    }
  });

  it("F-013-AC32 « Synchronisé » n'affirme que la transmission ; aucun texte de la zone, dans aucun état, ne dit que le serveur a enregistré ou sauvegardé", () => {
    for (const affiche of ETATS_AFFICHES) {
      for (const stockage of [true, false]) {
        const texte = texteDeLaZoneSeule(affiche, stockage);
        expect(texte, affiche).not.toMatch(/sauvegard/i);
        // « enregistr » ne dit jamais que l'appareil : sur cet appareil, ou nulle part.
        for (const phrase of texte.split(/(?<=[.:;])\s+|\n/)) {
          if (/enregistr/i.test(phrase)) {
            expect(phrase, affiche).toMatch(/cet appareil|nulle part/);
          }
        }
      }
    }
    expect(texteDeLaZoneSeule("synchronise", true).split("\n").slice(0, 2)).toEqual([
      TITRES_DES_ETATS.synchronise,
      TRANSMISES,
    ]);
  });

  it("F-013-AC48 stockage coupé, aucun texte de la zone, dans aucun état, ne dit que les modifications ou les pages restent sur cet appareil", () => {
    for (const affiche of ETATS_AFFICHES) {
      const texte = texteDeLaZoneSeule(affiche, false);
      expect(texte, affiche).not.toMatch(
        /restent sur cet appareil|restent disponibles sur cet appareil/,
      );
    }
    expect(texteDeLaZoneSeule("hors-ligne", false)).toContain(HORS_LIGNE_SANS_STOCKAGE);
    expect(texteDeLaZoneSeule("synchronise", false)).toContain(TRANSMISES_SANS_STOCKAGE);
  });

  it("F-013-AC48 F-013-AC49 les deux indications, dans les quatre combinaisons, sans que l'une efface l'autre ; la confirmation avant de quitter ne tient qu'à une modification ni enregistrée ni acquittée", async () => {
    const connexions = suivreLesConnexionsTenues();
    const simulee = synchronisationSimulee({ affiche: "synchronise", rattachement: "adopte" });
    const { session } = await ouvrirAvec(simulee);
    const local = (): string => within(screen.getByRole("banner")).getByRole("status").textContent;
    const constater = (enregistre: string, synchro: readonly string[]): void => {
      expect(local()).toContain(enregistre);
      expect(phrasesDeLaZone()).toEqual(synchro);
    };

    constater("Enregistré sur cet appareil", [TITRES_DES_ETATS.synchronise, TRANSMISES]);
    poser(simulee, { affiche: "hors-ligne" });
    constater("Enregistré sur cet appareil", [TITRES_DES_ETATS["hors-ligne"]]);

    simulerLHorloge();
    act(() => fermerDeForce(connexions.at(-1) as IDBDatabase));
    await act(() => laisserIndexedDbTravailler());
    constater("Non enregistré sur cet appareil", [HORS_LIGNE_SANS_STOCKAGE]);
    poser(simulee, { affiche: "synchronise" });
    constater("Non enregistré sur cet appareil", [
      TITRES_DES_ETATS.synchronise,
      TRANSMISES_SANS_STOCKAGE,
    ]);

    // F-013-AC49 : une modification non enregistrée sur l'appareil retient l'onglet tant que le
    // serveur ne l'a pas acquittée, et plus après ; l'acquittement d'un autre document n'y fait rien.
    creerPage(session, "Pendant la coupure");
    expect(tenterDeQuitter().defaultPrevented).toBe(true);
    simulee.acquittes.add(new Y.Doc());
    poser(simulee, {});
    expect(tenterDeQuitter().defaultPrevented).toBe(true);
    simulee.acquittes.add(session.doc as Y.Doc);
    poser(simulee, {});
    expect(tenterDeQuitter().defaultPrevented).toBe(false);
    simulee.acquittes.clear();
    poser(simulee, { affiche: "en-cours" });
    expect(tenterDeQuitter().defaultPrevented).toBe(true);
    expect(local()).toContain("Non enregistré sur cet appareil");
  });
});

describe("une table en lecture seule (F-018-AC52)", () => {
  it("F-018-AC52 en lecture seule, « Nouvelle table », « Ajouter une table » et chaque action qui écrit dans la table sont désactivées avec la raison ; navigation et réglages restent ; documents d'espace et de table identiques octet pour octet", async () => {
    const simulee = synchronisationSimulee();
    const { session } = await ouvrirAvec(simulee);
    const utilisateur = userEvent.setup();
    const etat = session.lireEtat();
    if (etat.phase !== "pret") {
      throw new Error("La session n'est pas prête.");
    }
    let idTable = "";
    act(() => {
      idTable = etat.operations.creerTable("Budget");
    });
    await utilisateur.click(await screen.findByRole("link", { name: "Table Budget" }));
    await utilisateur.click(await screen.findByRole("button", { name: "Ajouter une colonne" }));
    await utilisateur.type(screen.getByRole("textbox", { name: "Nom de la colonne" }), "Fait");
    await utilisateur.selectOptions(
      screen.getByRole("combobox", { name: "Type de la colonne" }),
      "case",
    );
    await utilisateur.click(screen.getByRole("button", { name: "Créer la colonne" }));
    await utilisateur.click(screen.getByRole("button", { name: "Nouvelle ligne" }));
    await waitFor(() => expect(simulee.tables.at(-1)?.idTable).toBe(idTable));
    const docDeTable = (simulee.tables.at(-1) as TableAffichee).doc;

    poser(simulee, { affiche: "synchronise", rattachement: "adopte", droit: "lecture" });
    const docs = [session.doc as Y.Doc, docDeTable];
    const avant = docs.map((doc) => Y.encodeStateAsUpdate(doc));
    let mises = 0;
    const compter = (): void => {
      mises += 1;
    };
    docs.forEach((doc) => doc.on("update", compter));

    expect(
      (screen.getByRole("button", { name: "Nouvelle table" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    for (const nom of ["Ajouter une colonne", "Nouvelle ligne"]) {
      const bouton = screen.getByRole<HTMLButtonElement>("button", { name: nom });
      expect(bouton.disabled, nom).toBe(true);
      expect(descriptionDe(bouton), nom).toBe(LECTURE_SEULE);
    }
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: "Fait, ligne 1" }).disabled).toBe(
      true,
    );
    const casePremiere = screen.getAllByRole("gridcell")[0] as HTMLElement;
    casePremiere.focus();
    await utilisateur.keyboard(" {Enter}{F2}{Delete}x");
    fireEvent.doubleClick(casePremiere);
    expect(screen.queryByRole("textbox")).toBeNull();
    await utilisateur.click(screen.getByRole("button", { name: "Actions de la ligne 1" }));
    for (const entree of within(screen.getByRole("menu")).getAllByRole("menuitem")) {
      expect(entree.hasAttribute("disabled"), entree.textContent ?? "").toBe(true);
    }
    await utilisateur.keyboard("{Escape}");
    await utilisateur.click(screen.getByRole("button", { name: "Actions de la colonne Fait" }));
    const ouvertes = within(screen.getByRole("menu"))
      .getAllByRole("menuitem")
      .filter((entree) => !entree.hasAttribute("disabled"))
      .map((entree) => entree.firstChild?.textContent);
    expect(ouvertes).toEqual(["Régler la largeur"]);
    await utilisateur.keyboard("{Escape}");
    await utilisateur.click(screen.getByRole("button", { name: nomActionsDeLaPage("Budget") }));
    expect(
      screen.getByRole("menuitem", { name: "Ajouter une table" }).hasAttribute("disabled"),
    ).toBe(true);
    await utilisateur.keyboard("{Escape}");

    // Navigation au clavier et réglages de vue restent utilisables.
    casePremiere.focus();
    await utilisateur.keyboard("{ArrowLeft}");
    expect(document.activeElement?.getAttribute("role")).toBe("rowheader");
    const separateur = screen.getByRole("separator", { name: "Largeur de la colonne Fait" });
    act(() => separateur.focus());
    await utilisateur.keyboard("{ArrowRight}");
    expect(separateur.getAttribute("aria-valuenow")).toBe("196");
    await act(() => laisserIndexedDbTravailler());

    docs.forEach((doc) => doc.off("update", compter));
    expect(docs.map((doc) => Y.encodeStateAsUpdate(doc))).toEqual(avant);
    expect(mises).toBe(0);
    localStorage.clear();
  });
});

function creerTable(ops: OperationsDeLEspace, titre: string): string {
  let id = "";
  act(() => {
    id = ops.creerTable(titre);
  });
  return id;
}

// Couture de l'application et de la fabrique de synchronisation (F-018-AC51, AC53) : le type que
// l'application lit dans sa session est celui que la synchronisation reçoit, sans quoi une table
// serait synchronisée sous `page:` (F-018-AC9) ; une table supprimée ailleurs voit son document
// fermé dans l'onglet.
describe("l'application et la synchronisation d'une table (F-018-AC51, AC53)", () => {
  it("F-018-AC51 F-018-AC9 la synchronisation reçoit de l'application le type lu de chaque identifiant : table, page, rien pour un inconnu", async () => {
    const simulee = synchronisationSimulee();
    const { session } = await ouvrirAvec(simulee);
    const etat = session.lireEtat();
    if (etat.phase !== "pret") {
      throw new Error("La session n'est pas prête.");
    }
    const ops = etat.operations;
    let ids: string[] = [];
    act(() => {
      const page = ops.creerPage("Projets");
      const archive = ops.creerTable("Archive");
      ops.mettreALaCorbeille(archive);
      ids = [ops.creerTable("Budget"), ops.creerTable("Suivi", { parent: page }), archive, page];
    });
    const espace = simulee.espace();

    expect([...ids, crypto.randomUUID()].map((id) => espace?.typeDe?.(id))).toEqual([
      "table",
      "table",
      "table",
      "page",
      undefined,
    ]);
  });

  it("F-018-AC51 le type donné suit l'arborescence lue : une table créée ou retirée après une première lecture est vue telle qu'elle est", async () => {
    const simulee = synchronisationSimulee();
    const { session } = await ouvrirAvec(simulee);
    const etat = session.lireEtat();
    if (etat.phase !== "pret") {
      throw new Error("La session n'est pas prête.");
    }
    const ops = etat.operations;
    const espace = simulee.espace();
    const premiere = creerTable(ops, "Budget");
    expect(espace?.typeDe?.(premiere)).toBe("table");

    const seconde = creerTable(ops, "Suivi");
    expect([premiere, seconde].map((id) => espace?.typeDe?.(id))).toEqual(["table", "table"]);
    act(() => {
      ops.mettreALaCorbeille(seconde);
      ops.supprimerDefinitivement(seconde);
    });
    expect(espace?.typeDe?.(seconde)).toBeUndefined();
  });

  it("F-018-AC53 une table supprimée ailleurs : l'application ferme son document dans l'onglet, sans effacer sa base faute d'espace désigné", async () => {
    const simulee = synchronisationSimulee();
    const { session } = await ouvrirAvec(simulee);
    const utilisateur = userEvent.setup();
    const etat = session.lireEtat();
    if (etat.phase !== "pret") {
      throw new Error("La session n'est pas prête.");
    }
    let idTable = "";
    act(() => {
      idTable = etat.operations.creerTable("Budget");
    });
    await utilisateur.click(await screen.findByRole("link", { name: "Table Budget" }));
    await waitFor(() => expect(simulee.tables.at(-1)?.idTable).toBe(idTable));
    const docDeTable = (simulee.tables.at(-1) as TableAffichee).doc;
    expect(docDeTable.isDestroyed).toBe(false);

    act(() => simulee.espace()?.surDocumentsSupprimes?.([idTable]));

    expect(docDeTable.isDestroyed).toBe(true);
    await act(() => laisserIndexedDbTravailler());
    expect(await nomsDesBases()).toContain(`notionlike:table:${etat.idEspace}:${idTable}`);
  });

  it("F-018-AC51 quitter la table affichée pour un écran sans document : l'application le dit à la synchronisation par afficherAucun, sans passer de page", async () => {
    const simulee = synchronisationSimulee();
    const { session } = await ouvrirAvec(simulee);
    const utilisateur = userEvent.setup();
    const etat = session.lireEtat();
    if (etat.phase !== "pret") {
      throw new Error("La session n'est pas prête.");
    }
    let idTable = "";
    act(() => {
      idTable = etat.operations.creerTable("Budget");
    });
    await utilisateur.click(await screen.findByRole("link", { name: "Table Budget" }));
    await waitFor(() => expect(simulee.tables.at(-1)?.idTable).toBe(idTable));
    const aucunAvant = simulee.compteurs.aucun;
    const pagesAvant = simulee.pages.length;

    act(() => {
      window.location.hash = "#/corbeille";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    await waitFor(() => expect(simulee.compteurs.aucun).toBe(aucunAvant + 1));
    expect(simulee.pages.length).toBe(pagesAvant);
  });

  it("F-018-AC51 « aucun document affiché » n'a qu'un point d'entrée : afficherPage exige une page, afficherAucun n'en prend pas", () => {
    // Vérifié à la vérification de types (`pnpm typecheck`, lancée par `table-contrat.test.ts`).
    expectTypeOf<Synchronisation["afficherPage"]>().parameters.toEqualTypeOf<[PageAffichee]>();
    expectTypeOf<Synchronisation["afficherAucun"]>().parameters.toEqualTypeOf<[]>();
  });
});
