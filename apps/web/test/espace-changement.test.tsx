// F-032, bloc 4 : l'interface à plusieurs espaces, lancée comme l'entrée la lance (pilote et
// magasin réels, persistance réelle sur l'appareil simulé), avec une synchronisation simulée sauf
// pour F-032-AC18. Chaque changement est demandé par « Ouvrir cet espace » de l'écran des espaces. Sélecteur d'espace (AC4), changement d'espace (AC10), aucune frappe perdue
// (AC11), confirmations (AC12, AC13, horloge injectée), adresse (AC16), local d'abord (AC18),
// lecture seule dès l'ouverture (AC25), clavier et focus (AC29), aucune erreur non gérée (AC31).
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { ESPACE_DE_CET_APPAREIL } from "../src/interface/messages-espaces.ts";
import {
  CHANGEMENT_D_ESPACE_EN_COURS,
  CHANGER_D_ESPACE,
  CHANGER_QUAND_MEME,
  espaceOuvert,
  modificationsEnregistreesNullePart,
  modificationsNonTransmises,
  ESPACE_COURANT,
  NOM_INCONNU_SUR_CET_APPAREIL,
  nomDuSelecteur,
  nomOuvrirCetEspace,
  RESTER_SUR_CET_ESPACE,
} from "../src/interface/messages-espaces.ts";
import { LECTURE_SEULE } from "../src/interface/messages-synchronisation.ts";
import { NOUVELLE_TABLE } from "../src/interface/messages-tables.ts";
import { ENTREE_CORBEILLE } from "../src/interface/messages-corbeille.ts";
import {
  nomActionsDeLaPage,
  nomAjouterSousPage,
  nomRestaurer,
  nomSupprimer,
  TITRE_DE_LA_PAGE,
} from "../src/interface/messages.ts";
import { EXPLICATION_PAGE_INTROUVABLE, PAGE_INTROUVABLE } from "../src/interface/messages.ts";
import {
  demarrerSynchronisation,
  type Environnement,
  type PageAffichee,
} from "../src/synchronisation/index.ts";
import { serveurDesEspaces, sourceDuCompte } from "../src/interface/branchement-synchronisation.ts";
import {
  baseDEspace,
  contenuDeLAppareil,
  E_ALPHA,
  E_APPAREIL,
  E_BETA,
  E_GAMMA,
  ECRITURE,
  LECTURE,
  poserDansLAppareil,
  poserUneBaseQuiPorte,
} from "./aides-appareil.ts";
import { jamais } from "./aides-compte.tsx";
import { boutonNouvellePage } from "./aides-coquille.tsx";
import { GAMMA_SERVEUR, partie, serveurDesEspacesListes } from "./aides-ecrans-des-espaces.tsx";
import { aller, estDesactive } from "./aides-espaces.tsx";
import { creerFacade, ecouteurs, ouvrirFacade } from "./aides-facade.ts";
import {
  ajoute,
  APPAREIL,
  ETAT_ADOPTE,
  lancerLOnglet,
  nomDeCible,
  operationsDe,
  ouvertMaintenant,
  poserUnEspace,
  selecteur,
  synchronisationSimulee,
} from "./aides-onglet.tsx";
import { contenuEnregistre } from "./aides-page.tsx";
import { enregistrements, laisserIndexedDbTravailler } from "./aides-persistance.ts";
import {
  annulerLesProchainsAjouts,
  ecouterLesErreursNonInterceptees,
  refuserLOuvertureDe,
  tenterDeQuitter,
} from "./aides-reprise.ts";
import { attendreLaZoneDeSaisie, entrerDansLEditeur, taper } from "./edition/aides-edition.tsx";

const ALPHA = ajoute(E_ALPHA);
const BETA = ajoute(E_BETA);

/** « Ouvrir cet espace » de l'espace de ce nom, sur l'écran affiché. */
function commande(nom: string): HTMLElement {
  return screen.getByRole("button", { name: nomOuvrirCetEspace(nom) });
}

/**
 * « Ouvrir cet espace » de l'espace de ce nom sur l'écran des espaces, où le sélecteur mène
 * (F-032-AC4), ouvert au besoin : la commande réelle du changement d'espace (F-032-AC10).
 */
async function ouvrirCetEspace(nom: string): Promise<HTMLElement> {
  if (window.location.hash !== "#/espaces") {
    aller("#/espaces");
  }
  await screen.findByRole("heading", { level: 1, name: "Espaces" });
  return screen.findByRole("button", { name: nomOuvrirCetEspace(nom) });
}

/** Les régions d'état qui portent ce texte. */
function annonces(texte: string): HTMLElement[] {
  return screen.getAllByRole("status").filter((region) => region.textContent === texte);
}

function descriptionDe(element: HTMLElement): string {
  const id = element.getAttribute("aria-describedby") ?? "";
  return id === "" ? "" : (document.getElementById(id)?.textContent ?? "");
}

/** Le document d'espace relu dans un document vierge depuis sa base : ce qu'un rechargement lirait. */
async function titresEnregistres(idEspace: string): Promise<string[]> {
  const relu = new Y.Doc();
  for (const miseAJour of await enregistrements(baseDEspace(idEspace))) {
    Y.applyUpdate(relu, Uint8Array.from(miseAJour));
  }
  return ouvrirFacade(relu)
    .lire()
    .racines.map((page) => page.titre)
    .sort();
}

/** L'appareil, l'espace de l'appareil `local` (« Témoin de l'appareil ») et Alpha, adopté. */
async function poserDeuxEspaces(
  entreeAlpha: typeof ECRITURE | typeof LECTURE = ECRITURE,
): Promise<void> {
  await poserUnEspace(E_APPAREIL, ["Témoin de l'appareil"]);
  await poserUnEspace(E_ALPHA, ["Page d'Alpha"]);
  await poserDansLAppareil({
    "espace-local": E_APPAREIL,
    [`registre:${E_ALPHA}`]: entreeAlpha,
    [`nom:${E_ALPHA}`]: "Alpha",
  });
}

describe("sélecteur d'espace (F-032-AC4)", () => {
  it("F-032-AC4 le sélecteur affiche le nom de l'espace ouvert, coupé par des points de suspension, nommé « Espaces — espace courant : <nom> », et mène à l'écran des espaces ; un nom reçu s'y affiche sans rechargement", async () => {
    await poserDeuxEspaces();
    await poserDansLAppareil({ "espace-retenu": E_ALPHA });
    const onglet = lancerLOnglet();
    await screen.findByRole("link", { name: "Page d'Alpha" });

    const lien = selecteur();
    expect(lien.textContent).toBe("Alpha");
    expect(lien.getAttribute("aria-label")).toBe(nomDuSelecteur("Alpha"));
    expect(lien.getAttribute("href")).toBe("#/espaces");
    expect(lien.querySelector("span")?.className.split(" ")).toEqual(
      expect.arrayContaining(["truncate", "extensible"]),
    );

    act(() => onglet.magasin.noterLesNoms(new Map([[E_ALPHA, "Alpha <b>renommé</b>"]])));
    expect(selecteur().textContent).toBe("Alpha <b>renommé</b>");
    expect(selecteur().querySelector("b")).toBeNull();

    await onglet.utilisateur.click(selecteur());
    expect(window.location.hash).toBe("#/espaces");
  });

  it("F-032-AC4 sans nom connu : « Espace de cet appareil » pour l'espace de l'appareil, « Nom inconnu sur cet appareil » pour un autre, et pour un nom retenu que la règle des contrats refuse", async () => {
    await poserDansLAppareil({
      "espace-local": E_APPAREIL,
      [`registre:${E_ALPHA}`]: ECRITURE,
      [`registre:${E_BETA}`]: ECRITURE,
      [`nom:${E_BETA}`]: "   ",
    });
    const onglet = lancerLOnglet();
    await boutonNouvellePage();
    expect(selecteur().textContent).toBe(ESPACE_DE_CET_APPAREIL);
    expect(selecteur().getAttribute("aria-label")).toBe(nomDuSelecteur(ESPACE_DE_CET_APPAREIL));

    // Les deux rangées portent le même nom, dans l'ordre des clés du registre : Alpha, puis Bêta.
    aller("#/espaces");
    const [versAlpha] = await screen.findAllByRole("button", {
      name: nomOuvrirCetEspace(NOM_INCONNU_SUR_CET_APPAREIL),
    });
    await onglet.utilisateur.click(versAlpha as HTMLElement);
    await waitFor(() => expect(ouvertMaintenant(onglet.pilote).cible).toEqual(ALPHA));
    await waitFor(() => expect(selecteur().textContent).toBe(NOM_INCONNU_SUR_CET_APPAREIL));

    // Alpha est adopté et l'onglet n'a pas de synchronisation : rien n'est acquitté (F-032-AC12).
    await onglet.utilisateur.click(await ouvrirCetEspace(NOM_INCONNU_SUR_CET_APPAREIL));
    await onglet.utilisateur.click(await screen.findByRole("button", { name: CHANGER_D_ESPACE }));
    await waitFor(() => expect(ouvertMaintenant(onglet.pilote).cible).toEqual(BETA));
    await waitFor(() => expect(selecteur().textContent).toBe(NOM_INCONNU_SUR_CET_APPAREIL));
  });

  it("F-032-AC4 sans pilote, le sélecteur garde son libellé « Espaces » d'avant F-032 (aucune propriété `espaces`)", async () => {
    const { rendreAvecCompte } = await import("./aides-compte.tsx");
    const { serveurSimule, ROUTES, moi200 } = await import("./aides-compte.tsx");
    rendreAvecCompte(serveurSimule({ [ROUTES.moi]: () => moi200() }));
    await boutonNouvellePage();
    const lien = screen.getByRole("link", { name: "Espaces" });
    expect(lien.getAttribute("aria-label")).toBeNull();
    expect(screen.queryByRole("link", { name: /espace courant/ })).toBeNull();
  });
});

describe("changement d'espace (F-032-AC10, AC29)", () => {
  it("F-032-AC10 F-032-AC29 depuis l'espace de l'appareil `local`, sans attente ni confirmation : synchronisation, pages et session de l'espace quitté fermées avant l'ouverture de l'espace choisi, accueil, nom au sélecteur, focus sur lui, annonce, espace retenu inscrit une fois la session prête ; retour à l'espace de l'appareil, espace retenu retiré", async () => {
    await poserDeuxEspaces();
    const journal: string[] = [];
    const simulee = synchronisationSimulee(journal);
    simulee.etats.set(E_ALPHA, ETAT_ADOPTE);
    simulee.connexions.set(E_ALPHA, { etablie: true, enAttente: false });
    const onglet = lancerLOnglet({ synchronisation: simulee.fabrique, journal });
    await onglet.utilisateur.click(
      await screen.findByRole("link", { name: "Témoin de l'appareil" }),
    );
    await attendreLaZoneDeSaisie();
    expect(window.location.hash).toMatch(/^#\/page\//);
    const quittee = ouvertMaintenant(onglet.pilote).session;
    const versAlpha = await ouvrirCetEspace("Alpha");
    journal.splice(0);

    await onglet.utilisateur.click(versAlpha);

    expect(await screen.findByRole("link", { name: "Page d'Alpha" })).toBeDefined();
    expect(screen.queryByRole("link", { name: "Témoin de l'appareil" })).toBeNull();
    expect(journal.slice(0, 2)).toEqual([
      `synchronisation fermée ${E_APPAREIL}`,
      `démarre ${E_ALPHA}`,
    ]);
    expect(simulee.attentes).toEqual([]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(quittee.doc === undefined ? -1 : ecouteurs(quittee.doc)).toBe(ecouteurs(new Y.Doc()));
    expect(window.location.hash).toBe("#/");
    expect(screen.queryByRole("textbox", { name: /éditeur|Contenu/i })).toBeNull();
    await waitFor(() => expect(selecteur().textContent).toBe("Alpha"));
    await waitFor(() => expect(document.activeElement).toBe(selecteur()));
    await waitFor(() => expect(annonces(espaceOuvert("Alpha"))).toHaveLength(1));
    await waitFor(async () => expect((await contenuDeLAppareil())["espace-retenu"]).toBe(E_ALPHA));

    await onglet.utilisateur.click(await ouvrirCetEspace(ESPACE_DE_CET_APPAREIL));

    expect(await screen.findByRole("link", { name: "Témoin de l'appareil" })).toBeDefined();
    await waitFor(() => expect(selecteur().textContent).toBe(ESPACE_DE_CET_APPAREIL));
    await waitFor(() => expect(annonces(espaceOuvert(ESPACE_DE_CET_APPAREIL))).toHaveLength(1));
    await waitFor(async () =>
      expect(await contenuDeLAppareil()).not.toHaveProperty("espace-retenu"),
    );
    expect(ouvertMaintenant(onglet.pilote).cible).toEqual(APPAREIL);
  });

  it("F-032-AC10 l'espace déjà ouvert n'offre pas « Ouvrir cet espace », seulement « Espace courant » : aller à l'écran des espaces ne change ni l'espace ni sa session", async () => {
    await poserDeuxEspaces();
    const onglet = lancerLOnglet();
    await screen.findByRole("link", { name: "Témoin de l'appareil" });
    const avant = ouvertMaintenant(onglet.pilote);

    await ouvrirCetEspace("Alpha");
    await act(() => laisserIndexedDbTravailler());

    const appareil = partie(ESPACE_DE_CET_APPAREIL);
    expect(within(appareil).queryByRole("button", { name: /^Ouvrir cet espace/ })).toBeNull();
    expect(appareil.textContent).toContain(ESPACE_COURANT);
    expect(ouvertMaintenant(onglet.pilote)).toBe(avant);
  });
});

describe("aucune frappe perdue (F-032-AC11)", () => {
  it("F-032-AC11 (premier test) le titre d'une page et le contenu d'une autre, modifiés dans la même tâche que la demande de changement, se relisent dans un document vierge depuis chaque base de l'espace quitté", async () => {
    const [idA, idB] = await poserUnEspace(E_APPAREIL, ["Page A", "Page B"]);
    await poserUnEspace(E_ALPHA, ["Page d'Alpha"]);
    await poserDansLAppareil({
      "espace-local": E_APPAREIL,
      [`registre:${E_ALPHA}`]: ECRITURE,
      [`nom:${E_ALPHA}`]: "Alpha",
    });
    const onglet = lancerLOnglet();
    await onglet.utilisateur.click(await screen.findByRole("link", { name: "Page B" }));
    await attendreLaZoneDeSaisie();
    await waitFor(() => {
      const etat = ouvertMaintenant(onglet.pilote).session.lireEtat();
      expect(etat.phase === "pret" && etat.enregistre).toBe(true);
    });
    entrerDansLEditeur();
    const operations = operationsDe(ouvertMaintenant(onglet.pilote).session);

    // La frappe dans le contenu de la page B, puis l'écran des espaces dans la même tâche : la
    // commande du changement n'est offerte que là.
    taper("frappe de la fin");
    aller("#/espaces");
    const versAlpha = await ouvrirCetEspace("Alpha");
    // Une seule tâche : le titre de la page A, dernière frappe, et la demande.
    act(() => operations.renommerPage(idA as string, "Titre modifié"));
    fireEvent.click(versAlpha);

    expect(await screen.findByRole("link", { name: "Page d'Alpha" })).toBeDefined();
    await act(() => laisserIndexedDbTravailler());
    expect(await titresEnregistres(E_APPAREIL)).toEqual(["Page B", "Titre modifié"]);
    expect(await contenuEnregistre(E_APPAREIL, idB as string)).toBe(
      "<paragraph>frappe de la fin</paragraph>",
    );
  });
});

describe("modifications non acquittées (F-032-AC12, AC29)", () => {
  async function ouvrirAlphaEnAttente(connexion: { etablie: boolean; enAttente: boolean }) {
    await poserDeuxEspaces();
    await poserUnEspace(E_BETA, ["Page de Bêta"]);
    await poserDansLAppareil({
      "espace-retenu": E_ALPHA,
      [`registre:${E_BETA}`]: ECRITURE,
      [`nom:${E_BETA}`]: "Bêta",
    });
    const journal: string[] = [];
    const simulee = synchronisationSimulee(journal);
    simulee.etats.set(E_ALPHA, ETAT_ADOPTE);
    simulee.connexions.set(E_ALPHA, connexion);
    const onglet = lancerLOnglet({ synchronisation: simulee.fabrique, journal });
    await screen.findByRole("link", { name: "Page d'Alpha" });
    await ouvrirCetEspace(ESPACE_DE_CET_APPAREIL);
    return { onglet, simulee };
  }

  it("F-032-AC12 connexion établie : « Changement d'espace… » pendant 2 secondes au plus (horloge injectée), les autres demandes sont ignorées, et le changement a lieu dès l'acquittement, sans boîte", async () => {
    const { onglet, simulee } = await ouvrirAlphaEnAttente({ etablie: true, enAttente: true });

    await onglet.utilisateur.click(commande(ESPACE_DE_CET_APPAREIL));

    expect(simulee.attentes.map(({ delaiMs }) => delaiMs)).toEqual([2000]);
    await waitFor(() => expect(annonces(CHANGEMENT_D_ESPACE_EN_COURS)).toHaveLength(1));
    act(() => simulee.avancer(1999));
    // La commande d'un autre espace est désactivée avec sa raison ; l'activer ne fait rien.
    const versBeta = commande("Bêta");
    expect(estDesactive(versBeta)).toBe(true);
    expect(descriptionDe(versBeta)).toBe(CHANGEMENT_D_ESPACE_EN_COURS);
    await onglet.utilisateur.click(versBeta);
    await act(() => laisserIndexedDbTravailler());
    expect(simulee.attentes).toHaveLength(1);
    expect(ouvertMaintenant(onglet.pilote).cible).toEqual(ALPHA);
    expect(screen.queryByRole("alertdialog")).toBeNull();

    act(() => simulee.acquitter(E_ALPHA));

    expect(await screen.findByRole("link", { name: "Témoin de l'appareil" })).toBeDefined();
    expect(ouvertMaintenant(onglet.pilote).cible).toEqual(APPAREIL);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("F-032-AC12 F-032-AC29 non acquittées à l'échéance de 2 secondes : boîte d'alerte qui cite l'espace, focus sur « Rester sur cet espace » ; Échap reste, rien ne change, le focus revient à la commande ; « Changer d'espace » change", async () => {
    const { onglet, simulee } = await ouvrirAlphaEnAttente({ etablie: true, enAttente: true });
    const origine = commande(ESPACE_DE_CET_APPAREIL);
    origine.focus();
    await onglet.utilisateur.keyboard("{Enter}");

    act(() => simulee.avancer(1999));
    await act(() => laisserIndexedDbTravailler());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    act(() => simulee.avancer(1));

    const boite = await screen.findByRole("alertdialog");
    expect(within(boite).getByText(modificationsNonTransmises("Alpha"))).toBeDefined();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(boite).getByRole("button", { name: RESTER_SUR_CET_ESPACE }),
      ),
    );
    expect(annonces(CHANGEMENT_D_ESPACE_EN_COURS)).toHaveLength(0);

    await onglet.utilisateur.keyboard("{Escape}");

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(ouvertMaintenant(onglet.pilote).cible).toEqual(ALPHA);
    await waitFor(() => expect(document.activeElement).toBe(commande(ESPACE_DE_CET_APPAREIL)));

    await onglet.utilisateur.keyboard("{Enter}");
    act(() => simulee.avancer(2000));
    const seconde = await screen.findByRole("alertdialog");
    await onglet.utilisateur.tab();
    expect(document.activeElement).toBe(
      within(seconde).getByRole("button", { name: CHANGER_D_ESPACE }),
    );
    await onglet.utilisateur.tab();
    expect(document.activeElement).toBe(
      within(seconde).getByRole("button", { name: RESTER_SUR_CET_ESPACE }),
    );
    await onglet.utilisateur.tab({ shift: true });
    await onglet.utilisateur.keyboard("{Enter}");

    expect(await screen.findByRole("link", { name: "Témoin de l'appareil" })).toBeDefined();
    expect(ouvertMaintenant(onglet.pilote).cible).toEqual(APPAREIL);
    await waitFor(() => expect(document.activeElement).toBe(selecteur()));
  });

  it("F-032-AC12 connexion non établie : la boîte d'alerte s'ouvre sans attendre l'échéance", async () => {
    const { onglet, simulee } = await ouvrirAlphaEnAttente({ etablie: false, enAttente: true });

    await onglet.utilisateur.click(commande(ESPACE_DE_CET_APPAREIL));

    expect(await screen.findByRole("alertdialog")).toBeDefined();
    expect(simulee.attentes.map(({ delaiMs }) => delaiMs)).toEqual([2000]);
    await onglet.utilisateur.click(screen.getByRole("button", { name: RESTER_SUR_CET_ESPACE }));
    expect(ouvertMaintenant(onglet.pilote).cible).toEqual(ALPHA);
  });

  it.each(["hors-ligne", "pause"] as const)(
    "F-032-AC12 F-032-AC24 adopté, connexion non établie (« %s »), rien en attente : changement aussitôt, sans boîte",
    async (affiche) => {
      const { onglet, simulee } = await ouvrirAlphaEnAttente({ etablie: false, enAttente: false });
      act(() => simulee.poser(E_ALPHA, { affiche }));

      await onglet.utilisateur.click(commande(ESPACE_DE_CET_APPAREIL));

      expect(await screen.findByRole("link", { name: "Témoin de l'appareil" })).toBeDefined();
      expect(simulee.attentes.map(({ delaiMs }) => delaiMs)).toEqual([2000]);
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(ouvertMaintenant(onglet.pilote).cible).toEqual(APPAREIL);
    },
  );

  it("F-032-AC12 connexion établie, rien en attente : changement aussitôt, sans boîte", async () => {
    const { onglet } = await ouvrirAlphaEnAttente({ etablie: true, enAttente: false });

    await onglet.utilisateur.click(commande(ESPACE_DE_CET_APPAREIL));

    expect(await screen.findByRole("link", { name: "Témoin de l'appareil" })).toBeDefined();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("modifications enregistrées nulle part (F-032-AC13, AC29)", () => {
  it("F-032-AC13 F-032-AC29 la demande de confirmation avant de quitter étant armée : boîte d'AC13 à la place de celle d'AC12, sans attente, focus sur « Rester sur cet espace », focus retenu ; le changement n'a lieu qu'après « Changer quand même »", async () => {
    await poserDeuxEspaces();
    await poserDansLAppareil({ "espace-retenu": E_ALPHA });
    const simulee = synchronisationSimulee();
    simulee.etats.set(E_ALPHA, ETAT_ADOPTE);
    simulee.connexions.set(E_ALPHA, { etablie: true, enAttente: true });
    const onglet = lancerLOnglet({ synchronisation: simulee.fabrique });
    await screen.findByRole("link", { name: "Page d'Alpha" });
    await waitFor(() => {
      const etat = ouvertMaintenant(onglet.pilote).session.lireEtat();
      expect(etat.phase === "pret" && etat.enregistre).toBe(true);
    });
    annulerLesProchainsAjouts(1);
    act(() => void operationsDe(ouvertMaintenant(onglet.pilote).session).creerPage("Nulle part"));
    await waitFor(() => expect(tenterDeQuitter().defaultPrevented).toBe(true));

    await onglet.utilisateur.click(await ouvrirCetEspace(ESPACE_DE_CET_APPAREIL));

    const boite = await screen.findByRole("alertdialog");
    expect(within(boite).getByText(modificationsEnregistreesNullePart("Alpha"))).toBeDefined();
    expect(simulee.attentes).toEqual([]);
    const rester = within(boite).getByRole("button", { name: RESTER_SUR_CET_ESPACE });
    await waitFor(() => expect(document.activeElement).toBe(rester));
    await onglet.utilisateur.tab();
    await onglet.utilisateur.tab();
    expect(document.activeElement).toBe(rester);
    await onglet.utilisateur.click(rester);
    expect(ouvertMaintenant(onglet.pilote).cible).toEqual(ALPHA);
    await waitFor(() => expect(document.activeElement).toBe(commande(ESPACE_DE_CET_APPAREIL)));

    await onglet.utilisateur.click(commande(ESPACE_DE_CET_APPAREIL));
    const seconde = await screen.findByRole("alertdialog");
    await onglet.utilisateur.click(
      within(seconde).getByRole("button", { name: CHANGER_QUAND_MEME }),
    );

    expect(await screen.findByRole("link", { name: "Témoin de l'appareil" })).toBeDefined();
    expect(simulee.attentes).toEqual([]);
  });
});

describe("adresse (F-032-AC16)", () => {
  it("F-032-AC16 une adresse qui désigne une page d'un autre espace de l'appareil donne « Page introuvable », sans changer d'espace", async () => {
    await poserUnEspace(E_APPAREIL, ["Témoin de l'appareil"]);
    const [idAlpha] = await poserUnEspace(E_ALPHA, ["Page d'Alpha"]);
    await poserDansLAppareil({ "espace-local": E_APPAREIL, [`registre:${E_ALPHA}`]: ECRITURE });
    const onglet = lancerLOnglet();
    await screen.findByRole("link", { name: "Témoin de l'appareil" });
    const avant = ouvertMaintenant(onglet.pilote);

    act(() => {
      window.location.hash = `#/page/${idAlpha as string}`;
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(await screen.findByRole("heading", { level: 1, name: PAGE_INTROUVABLE })).toBeDefined();
    expect(screen.getByText(EXPLICATION_PAGE_INTROUVABLE)).toBeDefined();
    expect(ouvertMaintenant(onglet.pilote)).toBe(avant);
    expect(selecteur().textContent).toBe(ESPACE_DE_CET_APPAREIL);
    expect(screen.queryByRole("link", { name: "Page d'Alpha" })).toBeNull();
  });
});

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

describe("local d'abord au changement (F-032-AC18)", () => {
  it.each([
    ["la requête « moi » ne répond jamais", "jamais", 0],
    [
      "le compte est connecté, la liste des espaces ne répond jamais et la WebSocket ne s'établit jamais",
      "connecte",
      1,
    ],
  ] as const)(
    "F-032-AC18 %s : l'arborescence de l'espace choisi s'affiche dès la relecture de sa base",
    async (_, moi, tentatives) => {
      await poserDeuxEspaces();
      const prise = priseMuette();
      const onglet = lancerLOnglet({
        moi: moi === "jamais" ? jamais : undefined,
        routes: { "GET /api/v1/espaces": jamais },
        synchronisationDuCompte: (compte) => (espace) =>
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
      });
      await screen.findByRole("link", { name: "Témoin de l'appareil" });

      await onglet.utilisateur.click(await ouvrirCetEspace("Alpha"));

      expect(await screen.findByRole("link", { name: "Page d'Alpha" })).toBeDefined();
      expect(screen.queryByRole("alertdialog")).toBeNull();
      await waitFor(() => expect(prise.nombre()).toBeGreaterThanOrEqual(tentatives));
      expect(ouvertMaintenant(onglet.pilote).cible).toEqual(ALPHA);
    },
  );
});

describe("lecture seule dès l'ouverture (F-032-AC25, part jsdom)", () => {
  it("F-032-AC25 un espace inscrit en `lecture` est en lecture seule dès son premier affichage, avant que la synchronisation ait lu le registre : création désactivée avec « Lecture seule », éditeur non modifiable, documents inchangés ; le registre lu l'emporte ensuite", async () => {
    await poserDeuxEspaces(LECTURE);
    await poserDansLAppareil({ "espace-retenu": E_ALPHA });
    const simulee = synchronisationSimulee();
    simulee.etats.set(E_ALPHA, {
      ...ETAT_ADOPTE,
      rattachement: "local",
      registreLu: false,
      affiche: "hors-ligne",
    });
    // Chaque état du bouton « Nouvelle page » rendu depuis le premier affichage de l'espace.
    const etatsDeLaCreation: boolean[] = [];
    const observateur = new MutationObserver(() => {
      const bouton = screen.queryByRole("button", { name: "Nouvelle page" });
      if (bouton !== null && etatsDeLaCreation.at(-1) !== bouton.hasAttribute("disabled")) {
        etatsDeLaCreation.push(bouton.hasAttribute("disabled"));
      }
    });
    observateur.observe(document.body, { subtree: true, childList: true, attributes: true });
    const onglet = lancerLOnglet({ synchronisation: simulee.fabrique });
    const creer = await boutonNouvellePage();
    const session = ouvertMaintenant(onglet.pilote).session;

    expect(etatsDeLaCreation).toEqual([true]);
    observateur.disconnect();
    expect(descriptionDe(creer)).toBe(LECTURE_SEULE);
    expect(screen.getByRole("button", { name: NOUVELLE_TABLE }).hasAttribute("disabled")).toBe(
      true,
    );
    await onglet.utilisateur.click(screen.getByRole("link", { name: "Page d'Alpha" }));
    const saisie = await attendreLaZoneDeSaisie();
    await waitFor(() => expect(simulee.pages.at(-1)).toBeDefined());
    const docs = [session.doc as Y.Doc, (simulee.pages.at(-1) as PageAffichee).doc];
    const avant = docs.map((doc) => Y.encodeStateAsUpdate(doc));
    expect(saisie.getAttribute("contenteditable")).toBe("false");
    fireEvent.click(creer);
    fireEvent.click(screen.getByRole("button", { name: NOUVELLE_TABLE }));
    fireEvent.doubleClick(screen.getByRole("link", { name: "Page d'Alpha" }));
    expect(screen.queryByRole("textbox", { name: TITRE_DE_LA_PAGE })).toBeNull();
    await onglet.utilisateur.type(saisie, "refusé");
    await act(() => laisserIndexedDbTravailler());

    expect(docs.map((doc) => Y.encodeStateAsUpdate(doc))).toEqual(avant);
    expect(screen.getAllByRole("link", { name: "Page d'Alpha" })).toHaveLength(1);

    act(() =>
      simulee.poser(E_ALPHA, { registreLu: true, rattachement: "adopte", droit: "ecriture" }),
    );
    await waitFor(async () =>
      expect((await boutonNouvellePage()).hasAttribute("disabled")).toBe(false),
    );
  });

  it("F-032-AC25 F-032-AC5 ajouté en `lecteur` par « Ouvrir cet espace », connexion jamais établie (hors ligne) : chaque action qui écrit est désactivée avec « Lecture seule » ou n'ouvre rien, et l'état encodé du document d'espace, de la page affichée et de la base de l'espace est inchangé, octet pour octet", async () => {
    // Gamma, du serveur, n'a pas d'entrée au registre : l'appareil ne le détient pas. Ses bases
    // sont restées d'un retrait dont l'effacement a échoué (F-032-AC20) : l'espace ajouté a des
    // pages à renommer, déplacer et jeter hors ligne, et une page dans sa corbeille.
    await poserUnEspace(E_APPAREIL, ["Témoin de l'appareil"]);
    const gamma = creerFacade();
    gamma.creerPage("Page de Gamma");
    gamma.creerPage("Seconde de Gamma");
    gamma.mettreALaCorbeille(gamma.creerPage("Jetée"));
    await poserUneBaseQuiPorte(baseDEspace(E_GAMMA), Y.encodeStateAsUpdate(gamma.doc));
    gamma.fermer();
    await poserDansLAppareil({ "espace-local": E_APPAREIL });
    const simulee = synchronisationSimulee();
    simulee.etats.set(E_GAMMA, {
      ...ETAT_ADOPTE,
      rattachement: "local",
      registreLu: false,
      affiche: "hors-ligne",
    });
    simulee.connexions.set(E_GAMMA, { etablie: false, enAttente: false });
    const onglet = lancerLOnglet({
      serveur: serveurDesEspacesListes([GAMMA_SERVEUR]),
      synchronisation: simulee.fabrique,
    });
    await screen.findByRole("link", { name: "Témoin de l'appareil" });

    await onglet.utilisateur.click(await ouvrirCetEspace("Gamma"));

    expect(await screen.findByRole("link", { name: "Page de Gamma" })).toBeDefined();
    expect(ouvertMaintenant(onglet.pilote).cible).toEqual(ajoute(E_GAMMA));
    expect((await contenuDeLAppareil())[`registre:${E_GAMMA}`]).toEqual(LECTURE);
    const session = ouvertMaintenant(onglet.pilote).session;
    const desactiveEnLecture = (element: HTMLElement): void => {
      expect(element.hasAttribute("disabled"), element.textContent).toBe(true);
      expect(descriptionDe(element), element.textContent).toBe(LECTURE_SEULE);
    };
    const creer = await boutonNouvellePage();
    const table = screen.getByRole("button", { name: NOUVELLE_TABLE });
    const sousPage = screen.getByRole("button", { name: nomAjouterSousPage("Page de Gamma") });
    [creer, table, sousPage].forEach(desactiveEnLecture);
    await onglet.utilisateur.click(screen.getByRole("link", { name: "Page de Gamma" }));
    const saisie = await attendreLaZoneDeSaisie();
    await waitFor(() => expect(simulee.pages.at(-1)).toBeDefined());
    const docs = [session.doc as Y.Doc, (simulee.pages.at(-1) as PageAffichee).doc];
    const avant = docs.map((doc) => Y.encodeStateAsUpdate(doc));
    const baseAvant = await enregistrements(baseDEspace(E_GAMMA));

    fireEvent.click(creer);
    fireEvent.click(table);
    fireEvent.click(sousPage);
    fireEvent.doubleClick(screen.getByRole("link", { name: "Page de Gamma" }));
    expect(screen.queryByRole("textbox", { name: TITRE_DE_LA_PAGE })).toBeNull();
    // Le menu « ⋯ » : renommer, ajouter, mettre à la corbeille et chaque déplacement.
    await onglet.utilisateur.click(
      screen.getByRole("button", { name: nomActionsDeLaPage("Page de Gamma") }),
    );
    const entrees = screen.getAllByRole("menuitem");
    expect(entrees.length).toBeGreaterThan(3);
    entrees.forEach(desactiveEnLecture);
    entrees.forEach((entree) => fireEvent.click(entree));
    expect(screen.queryByRole("textbox", { name: TITRE_DE_LA_PAGE })).toBeNull();
    expect(saisie.getAttribute("contenteditable")).toBe("false");
    await onglet.utilisateur.type(saisie, "refusé");
    await act(() => laisserIndexedDbTravailler());
    // La corbeille : « Restaurer » et « Supprimer définitivement ».
    await onglet.utilisateur.click(screen.getByRole("button", { name: ENTREE_CORBEILLE }));
    const restaurer = await screen.findByRole("button", { name: nomRestaurer("Jetée") });
    const supprimer = screen.getByRole("button", { name: nomSupprimer("Jetée") });
    [restaurer, supprimer].forEach(desactiveEnLecture);
    fireEvent.click(restaurer);
    fireEvent.click(supprimer);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await act(() => laisserIndexedDbTravailler());

    expect(docs.map((doc) => Y.encodeStateAsUpdate(doc))).toEqual(avant);
    expect(await enregistrements(baseDEspace(E_GAMMA))).toEqual(baseAvant);
  });

  it("F-032-AC25 l'espace de l'appareil sans entrée au registre reste modifiable dès le premier affichage, comme avant F-032", async () => {
    await poserDeuxEspaces();
    const simulee = synchronisationSimulee();
    simulee.etats.set(E_APPAREIL, { ...ETAT_ADOPTE, rattachement: "local", registreLu: false });
    lancerLOnglet({ synchronisation: simulee.fabrique });

    expect((await boutonNouvellePage()).hasAttribute("disabled")).toBe(false);
  });
});

describe("aucune erreur non gérée (F-032-AC31)", () => {
  it("F-032-AC31 changements d'espace aller et retour, base de l'appareil qui refuse de s'ouvrir pour l'inscription de l'espace retenu : le changement a lieu dans l'onglet, sans erreur non interceptée ni rejet non géré", async () => {
    const relevees = ecouterLesErreursNonInterceptees();
    await poserDeuxEspaces();
    const simulee = synchronisationSimulee();
    simulee.etats.set(E_ALPHA, ETAT_ADOPTE);
    simulee.connexions.set(E_ALPHA, { etablie: true, enAttente: false });
    const onglet = lancerLOnglet({ synchronisation: simulee.fabrique });
    await screen.findByRole("link", { name: "Témoin de l'appareil" });
    const versAlpha = await ouvrirCetEspace("Alpha");
    refuserLOuvertureDe("notionlike:appareil");

    await onglet.utilisateur.click(versAlpha);
    expect(await screen.findByRole("link", { name: "Page d'Alpha" })).toBeDefined();
    await act(() => laisserIndexedDbTravailler());
    // Sans la base de l'appareil, l'espace de l'appareil s'ouvre comme F-030 le prescrit, coupé.
    await onglet.utilisateur.click(await ouvrirCetEspace(ESPACE_DE_CET_APPAREIL));
    await waitFor(() => expect(ouvertMaintenant(onglet.pilote).cible).toEqual(APPAREIL));
    await boutonNouvellePage();
    await act(() => laisserIndexedDbTravailler());

    expect(relevees()).toEqual([]);
    expect(nomDeCible(ouvertMaintenant(onglet.pilote).cible)).toBe("appareil");
  });
});
