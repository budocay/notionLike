// Persistance d'une page en échec et reprise (F-003-AC18), couture du module de persistance
// (F-003-AC25).
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { creerPagesOuvertes } from "../src/page/pages-ouvertes.ts";
import type { SessionPage } from "../src/page/session-page.ts";
import { ouvrirEspaceLocal, ouvrirPersistance } from "../src/persistance/index.ts";
import { boutonNouvellePage, rendreApplication, saisirTitre } from "./aides-coquille.tsx";
import { ajouter, bloc, contenuLu, fragmentBrut } from "./aides-facade-page.ts";
import { graphe } from "./aides-graphe.ts";
import { lire } from "./aides-disque.ts";
import { contenuEnregistre, ouvrirUnePage } from "./aides-page.tsx";
import {
  attendreEtat,
  enregistrements,
  ESPACE_A,
  ESPACE_B,
  fermerDeForce,
  laisserIndexedDbTravailler,
  nomsDesBases,
  refuserLesOuverturesParUneErreur,
  retenirLesOuvertures,
  suivreLesConnexionsTenues,
} from "./aides-persistance.ts";
import {
  ecouterLesErreursNonInterceptees,
  identifiantInscrit,
  inscrireALaPlaceDeLIdentifiant,
  refuserLOuvertureDe,
  simulerLHorloge,
} from "./aides-reprise.ts";
import {
  afficherUnePage,
  attendrePhase,
  demarrerUneSession,
  enregistrerDansLaBase,
  nomDeLaBaseDePage,
  PAGE_A,
  PAGE_A_DE_L_ESPACE_A,
  PAGE_B,
} from "./aides-session-page.tsx";
import {
  attendreLaZoneDeSaisie,
  commande,
  entrerDansLEditeur,
  presser,
  selectionnerLeBloc,
  taper,
  zoneDeSaisie,
} from "./edition/aides-edition.tsx";

const ECHEANCE_MS = 10_000;
const AVERTISSEMENT = /Stockage de l'appareil indisponible/;

function documentDeLaSession(session: SessionPage): Y.Doc {
  const etat = session.lireEtat();
  if (etat.phase !== "pret" || etat.contenu.doc === null) {
    throw new Error("La session de page n'est pas prête.");
  }
  return etat.contenu.doc;
}

function estEnregistree(session: SessionPage): boolean {
  const etat = session.lireEtat();
  return etat.phase === "pret" && etat.enregistre;
}

/** Crée une page dans l'application coupée de son stockage, et attend son éditeur. */
async function creerUnePageSansStockage(): Promise<void> {
  const { utilisateur } = rendreApplication();
  await utilisateur.click(await boutonNouvellePage());
  await saisirTitre(utilisateur, "Sans stockage");
  await attendreLaZoneDeSaisie();
}

describe("persistance d'une page en échec", () => {
  it.each([
    ["(a) indexedDB absent du navigateur", () => vi.stubGlobal("indexedDB", undefined)],
    ["(b) ouverture de la base refusée", () => refuserLesOuverturesParUneErreur()],
  ])(
    "F-003-AC18 %s : l'éditeur est affiché sur le document en mémoire, modifiable, avec l'avertissement, sans erreur non interceptée ni rejet non géré",
    async (_cas, couper) => {
      const relever = ecouterLesErreursNonInterceptees();
      couper();

      await creerUnePageSansStockage();
      entrerDansLEditeur();
      taper("écrit en mémoire");
      await act(() => laisserIndexedDbTravailler());

      expect(zoneDeSaisie().textContent).toBe("écrit en mémoire");
      expect(zoneDeSaisie().getAttribute("contenteditable")).toBe("true");
      expect(screen.getByRole("alert").textContent).toMatch(AVERTISSEMENT);
      expect(screen.queryByText("Chargement de la page…")).toBeNull();
      expect(relever()).toEqual([]);
    },
  );

  it("F-003-AC18 (c) lecture ou écriture en échec après l'ouverture : l'avertissement paraît, l'éditeur reste modifiable sur le document en mémoire, sans erreur non interceptée", async () => {
    const relever = ecouterLesErreursNonInterceptees();
    const connexions = suivreLesConnexionsTenues();
    const page = await ouvrirUnePage("Coupée après coup");
    entrerDansLEditeur();
    taper("avant");
    await act(() => laisserIndexedDbTravailler());
    const sansAvertissement = screen.queryByRole("alert");
    const connexion = connexions.find((tenue) => tenue.name === nomDeLaBaseDePage(page));
    if (connexion === undefined) {
      throw new Error("Aucune connexion tenue sur la base de la page.");
    }

    act(() => fermerDeForce(connexion));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(AVERTISSEMENT));
    taper(" après");

    expect(sansAvertissement).toBeNull();
    expect(zoneDeSaisie().textContent).toBe("avant après");
    // F-006 : la barre latérale porte ses propres régions d'annonces ; l'état est dans la barre du haut.
    expect(within(screen.getByRole("banner")).getByRole("status").textContent).toBe(
      "Non enregistré sur cet appareil",
    );
    expect(relever()).toEqual([]);
  });

  it("F-003-AC18 F-003-AC4 à l'échéance de 10 secondes, le chargement cesse et l'éditeur est modifiable ; la réponse de la base délivrée après l'échéance n'est ni appliquée ni affichée, et la base reste inchangée", async () => {
    await enregistrerDansLaBase(PAGE_A_DE_L_ESPACE_A, (replique) =>
      ajouter(replique, bloc("paragraph", "dans la base")),
    );
    const base = nomDeLaBaseDePage(PAGE_A_DE_L_ESPACE_A);
    const baseAvant = await enregistrements(base);
    const relever = ecouterLesErreursNonInterceptees();
    simulerLHorloge();
    const retenues = retenirLesOuvertures();
    const { doc, session } = demarrerUneSession();

    act(() => void vi.advanceTimersByTime(ECHEANCE_MS - 1));
    const justeAvant = session.lireEtat().phase;
    act(() => void vi.advanceTimersByTime(1));
    const aLEcheance = session.lireEtat();
    fragmentBrut(doc).insert(0, [bloc("paragraph", "en mémoire")]);
    const enMemoire = contenuLu(doc);
    retenues.cesser();
    retenues.repondre();
    await laisserIndexedDbTravailler();
    await laisserIndexedDbTravailler();

    expect(baseAvant.length).toBeGreaterThan(0);
    expect(justeAvant).toBe("chargement");
    expect(aLEcheance.phase).toBe("pret");
    expect(estEnregistree(session)).toBe(false);
    expect(enMemoire).toBe("<paragraph>en mémoire</paragraph>");
    expect(contenuLu(doc)).toBe(enMemoire);
    expect(await enregistrements(base)).toEqual(baseAvant);
    expect(relever()).toEqual([]);
  });
});

describe("reprise de la persistance d'une page", () => {
  it("F-003-AC18 une page modifiée pendant une coupure puis quittée garde son document en mémoire : rouverte, elle rend ce même document et la modification ; la base rétablie, la modification est relue dans un document vierge", async () => {
    simulerLHorloge();
    refuserLOuvertureDe(nomDeLaBaseDePage(PAGE_A_DE_L_ESPACE_A));
    const pages = creerPagesOuvertes();
    const coupee = pages.ouvrir(PAGE_A_DE_L_ESPACE_A);
    await attendrePhase(coupee, "pret");
    const doc = documentDeLaSession(coupee);
    fragmentBrut(doc).insert(0, [bloc("paragraph", "pendant la coupure")]);
    const enregistreeAvant = estEnregistree(coupee);

    const autre = pages.ouvrir({ idEspace: ESPACE_A, idPage: PAGE_B });
    await attendrePhase(autre, "pret");
    const conserveSansLiaison = { detruit: doc.isDestroyed, contenu: contenuLu(doc) };
    const rouverte = pages.ouvrir(PAGE_A_DE_L_ESPACE_A);
    await attendrePhase(rouverte, "pret");
    const rendu = documentDeLaSession(rouverte);
    vi.restoreAllMocks();
    vi.advanceTimersToNextTimer();
    await laisserIndexedDbTravailler();
    await laisserIndexedDbTravailler();

    expect(enregistreeAvant).toBe(false);
    expect(conserveSansLiaison).toEqual({
      detruit: false,
      contenu: "<paragraph>pendant la coupure</paragraph>",
    });
    expect(rendu).toBe(doc);
    expect(contenuLu(rendu)).toBe("<paragraph>pendant la coupure</paragraph>");
    expect(estEnregistree(rouverte)).toBe(true);
    vi.useRealTimers();
    expect(await contenuEnregistre(ESPACE_A, PAGE_A)).toBe(
      "<paragraph>pendant la coupure</paragraph>",
    );
    pages.fermer();
  });

  it("F-003-AC18 un document conservé poursuit ses tentatives sans être affiché, puis est libéré une fois la modification écrite", async () => {
    simulerLHorloge();
    refuserLOuvertureDe(nomDeLaBaseDePage(PAGE_A_DE_L_ESPACE_A));
    const pages = creerPagesOuvertes();
    const coupee = pages.ouvrir(PAGE_A_DE_L_ESPACE_A);
    await attendrePhase(coupee, "pret");
    const doc = documentDeLaSession(coupee);
    fragmentBrut(doc).insert(0, [bloc("paragraph", "à écrire plus tard")]);
    await attendrePhase(pages.ouvrir({ idEspace: ESPACE_A, idPage: PAGE_B }), "pret");
    const conserve = !doc.isDestroyed;

    vi.restoreAllMocks();
    vi.advanceTimersToNextTimer();
    await laisserIndexedDbTravailler();
    await laisserIndexedDbTravailler();
    vi.useRealTimers();

    expect(conserve).toBe(true);
    expect(doc.isDestroyed).toBe(true);
    expect(await contenuEnregistre(ESPACE_A, PAGE_A)).toBe(
      "<paragraph>à écrire plus tard</paragraph>",
    );
    pages.fermer();
  });

  it("F-003-AC18 une page quittée sans modification non enregistrée n'est pas conservée : rouverte, elle part d'un document neuf, relu depuis sa base", async () => {
    const pages = creerPagesOuvertes();
    const premiere = pages.ouvrir(PAGE_A_DE_L_ESPACE_A);
    await attendrePhase(premiere, "pret");
    const doc = documentDeLaSession(premiere);
    fragmentBrut(doc).insert(0, [bloc("paragraph", "enregistré")]);
    await laisserIndexedDbTravailler();

    await attendrePhase(pages.ouvrir({ idEspace: ESPACE_A, idPage: PAGE_B }), "pret");
    const rouverte = pages.ouvrir(PAGE_A_DE_L_ESPACE_A);
    await attendrePhase(rouverte, "pret");

    expect(doc.isDestroyed).toBe(true);
    expect(documentDeLaSession(rouverte)).not.toBe(doc);
    expect(contenuLu(documentDeLaSession(rouverte))).toBe("<paragraph>enregistré</paragraph>");
    pages.fermer();
  });

  it("F-003-AC18 tant que l'espace est inconnu, la page vit en mémoire sans base ; l'espace connu, la même page rouverte garde son document et l'enregistre", async () => {
    const pages = creerPagesOuvertes();
    const sansEspace = pages.ouvrir({ idEspace: undefined, idPage: PAGE_A });
    const etat = sansEspace.lireEtat();
    const doc = documentDeLaSession(sansEspace);
    fragmentBrut(doc).insert(0, [bloc("paragraph", "avant de connaître l'espace")]);
    const basesSansEspace = await nomsDesBases();

    const avecEspace = pages.ouvrir(PAGE_A_DE_L_ESPACE_A);
    await attendrePhase(avecEspace, "pret");
    await waitFor(() => expect(estEnregistree(avecEspace)).toBe(true));

    expect(etat.phase).toBe("pret");
    expect(basesSansEspace).toEqual([]);
    expect(documentDeLaSession(avecEspace)).toBe(doc);
    expect(await contenuEnregistre(ESPACE_A, PAGE_A)).toBe(
      "<paragraph>avant de connaître l'espace</paragraph>",
    );
    pages.fermer();
  });
});

const INTERFACE = "src/persistance/index.ts";

describe("couture du module de persistance", () => {
  it("F-003-AC25 un document rempli par l'éditeur, avec les quatre types de blocs et une liste imbriquée, est relu identique dans un document vierge par le module de persistance", async () => {
    const { doc } = await afficherUnePage();
    entrerDansLEditeur();

    taper("# Titre");
    presser("Enter");
    taper("paragraphe");
    presser("Enter");
    taper("- puce");
    presser("Enter");
    taper("imbriquée");
    presser("Tab");
    presser("Enter");
    presser("Enter");
    presser("Enter");
    taper("numéro");
    selectionnerLeBloc();
    act(() => commande("Liste numérotée").click());
    await act(() => laisserIndexedDbTravailler());

    const lu = contenuLu(doc).toLowerCase();
    expect(lu).toBe(
      '<heading level="1">titre</heading><paragraph>paragraphe</paragraph><bulletlist><listitem><paragraph>puce</paragraph><bulletlist><listitem><paragraph>imbriquée</paragraph></listitem></bulletlist></listitem></bulletlist><orderedlist start="1"><listitem><paragraph>numéro</paragraph></listitem></orderedlist>',
    );
    expect((await contenuEnregistre(ESPACE_A, PAGE_A)).toLowerCase()).toBe(lu);
  });

  it("F-003-AC25 les appelants de l'ouverture de l'espace local et de l'ouverture d'une persistance sont énumérés : un seul fichier de production pour chacune, et chaque fichier de test qui en appelle une", async () => {
    const aretes = await graphe();
    const importateurs = [...aretes]
      .filter(([, dependances]) => dependances.includes(INTERFACE))
      .map(([module]) => module)
      .sort();
    const quiAppellent = (nom: string): string[] =>
      importateurs.filter((module) => new RegExp(`\\b${nom}\\(`).test(lire(module)));

    expect(quiAppellent("ouvrirEspaceLocal")).toEqual([
      "src/espace/session-espace.ts",
      // F-007 : délai et échec de l'ouverture, constatés pour les appelants (F-007-AC26).
      "test/corbeille-effacement.test.ts",
      "test/page-echecs.test.tsx",
      "test/persistance-echecs.test.ts",
      "test/persistance-ouverture.test.ts",
      "test/reprise-echecs.test.ts",
      "test/reprise-reparation.test.ts",
      // F-013 : un onglet synchronisé ouvre son espace comme la session (H14).
      "test/synchronisation/aides-synchro.ts",
    ]);
    expect(quiAppellent("ouvrirPersistance").filter((module) => module.startsWith("src/"))).toEqual(
      // F-013-AC40 : la passe de fond et la réplique d'une page de version refusée, par le seul
      // fichier de stockage du module de synchronisation.
      ["src/page/pages-ouvertes.ts", "src/synchronisation/stockage.ts"],
    );
    expect(quiAppellent("ouvrirPersistance")).toContain("test/aides-session-page.tsx");
    expect(lire("src/espace/session-espace.ts")).toMatch(/\.idEspace\(\)/);
    expect([ouvrirPersistance.length, ouvrirEspaceLocal.length]).toEqual([2, 2]);
  });

  it("F-003-AC25 l'identifiant de l'espace rendu est celui que l'appareil a retenu et que la fonction de nommage a contrôlé : le candidat au premier lancement, l'identifiant déjà inscrit ensuite, jamais une valeur illisible", async () => {
    const premier = ouvrirEspaceLocal(new Y.Doc(), ESPACE_A);
    const avantLaRelecture = premier.idEspace();
    await attendreEtat(premier, "active");
    const auPremierLancement = premier.idEspace();
    premier.fermer();
    const second = ouvrirEspaceLocal(new Y.Doc(), ESPACE_B);
    await attendreEtat(second, "active");
    const auSecondLancement = second.idEspace();
    second.fermer();
    await laisserIndexedDbTravailler();
    await inscrireALaPlaceDeLIdentifiant("PAS-UN-IDENTIFIANT:page");
    const troisieme = ouvrirEspaceLocal(new Y.Doc(), ESPACE_B);
    await attendreEtat(troisieme, "active");

    expect(avantLaRelecture).toBeUndefined();
    expect(auPremierLancement).toBe(ESPACE_A);
    expect(auSecondLancement).toBe(ESPACE_A);
    expect(troisieme.idEspace()).toBe(await identifiantInscrit());
    expect(troisieme.idEspace()).toMatch(/^[0-9a-f-]{36}$/);
    troisieme.fermer();
  });

  it("F-003-AC25 pour le document d'espace, l'ouverture, le délai de 10 secondes et l'échec restent ceux de F-002 : relecture jusqu'à 9 999 ms, coupure à 10 000 ms, sans identifiant rendu ni exception", () => {
    simulerLHorloge();
    retenirLesOuvertures();
    const persistance = ouvrirEspaceLocal(new Y.Doc(), ESPACE_A);

    vi.advanceTimersByTime(ECHEANCE_MS - 1);
    const justeAvant = persistance.lireEtat();
    vi.advanceTimersByTime(1);

    expect(justeAvant).toBe("relecture");
    expect(persistance.lireEtat()).toBe("coupee");
    expect(persistance.idEspace()).toBeUndefined();
    persistance.fermer();
    expect(persistance.lireEtat()).toBe("fermee");
  });
});
