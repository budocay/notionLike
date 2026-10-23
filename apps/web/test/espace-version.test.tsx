// F-032-AC35 : un document d'espace d'une version non prise en charge ne bloque jamais l'onglet d'un
// rechargement à l'autre. L'écran bloquant d'un espace ouvert qui n'est pas l'espace de l'appareil
// offre « Ouvrir l'espace de cet appareil », au clavier, sans attente ni confirmation ; l'espace
// refusé n'est jamais inscrit comme espace retenu ; l'écran de l'espace de l'appareil reste celui de
// F-002-AC17, sans commande. Pilote, magasin et persistance réels sur l'appareil simulé.
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ESPACE_DE_CET_APPAREIL,
  espaceOuvert,
  OUVRIR_L_ESPACE_DE_CET_APPAREIL,
} from "../src/interface/messages-espaces.ts";
import { TITRE_VERSION_NON_PRISE_EN_CHARGE } from "../src/interface/messages.ts";
import {
  contenuDeLAppareil,
  E_ALPHA,
  E_APPAREIL,
  ECRITURE,
  poserDansLAppareil,
} from "./aides-appareil.ts";
import { essai } from "./aides-commandes-d-essai.tsx";
import { tabulerJusqua } from "./aides-coquille.tsx";
import {
  ajoute,
  APPAREIL,
  lancerLOnglet,
  ouvertMaintenant,
  poserUnEspace,
  poserUnEspaceDUneAutreVersion,
  relancer,
  selecteur,
  synchronisationSimulee,
} from "./aides-onglet.tsx";
import { laisserIndexedDbTravailler } from "./aides-persistance.ts";

vi.mock("../src/interface/ZoneDeCompte.tsx", async (reel) =>
  (await import("./aides-commandes-d-essai.tsx")).avecLesCommandesDEssai(await reel()),
);

const ALPHA = ajoute(E_ALPHA);

function ecranBloquant(): Promise<HTMLElement> {
  return screen.findByRole("heading", { level: 1, name: TITRE_VERSION_NON_PRISE_EN_CHARGE });
}

function laCommande(): HTMLElement {
  return screen.getByRole("button", { name: OUVRIR_L_ESPACE_DE_CET_APPAREIL });
}

/** L'espace de l'appareil, avec une page témoin, et Alpha inscrit, d'une version refusée. */
async function poserAlphaRefuse(): Promise<void> {
  await poserUnEspace(E_APPAREIL, ["Témoin de l'appareil"]);
  await poserUnEspaceDUneAutreVersion(E_ALPHA);
  await poserDansLAppareil({
    "espace-local": E_APPAREIL,
    [`registre:${E_ALPHA}`]: ECRITURE,
    [`nom:${E_ALPHA}`]: "Alpha",
  });
}

describe("document d'une version non prise en charge (F-032-AC35)", () => {
  it("F-032-AC35 (a) depuis l'espace de l'appareil, sans espace retenu, passer sur un espace refusé pour sa version : écran bloquant et sa commande, clé `espace-retenu` restée absente, et le lancement suivant ouvre l'espace de l'appareil", async () => {
    await poserAlphaRefuse();
    essai.commandes = [{ libelle: "Vers Alpha", cible: ALPHA, nom: "Alpha" }];
    const onglet = lancerLOnglet({ synchronisation: synchronisationSimulee().fabrique });
    await screen.findByRole("link", { name: "Témoin de l'appareil" });

    await onglet.utilisateur.click(screen.getByRole("button", { name: "Vers Alpha" }));

    expect(await ecranBloquant()).toBeDefined();
    expect(laCommande()).toBeDefined();
    expect(ouvertMaintenant(onglet.pilote).cible).toEqual(ALPHA);
    await laisserIndexedDbTravailler();
    expect(await contenuDeLAppareil()).not.toHaveProperty("espace-retenu");

    const suivant = relancer(onglet);

    expect(await screen.findByRole("link", { name: "Témoin de l'appareil" })).toBeDefined();
    expect(ouvertMaintenant(suivant.pilote).cible).toEqual(APPAREIL);
  });

  it("F-032-AC35 (b) un espace refusé posé comme espace retenu : écran bloquant au lancement ; la commande, au clavier seul, ouvre l'espace de l'appareil et retire la clé `espace-retenu` ; le lancement suivant ouvre encore l'espace de l'appareil", async () => {
    await poserAlphaRefuse();
    await poserDansLAppareil({ "espace-retenu": E_ALPHA });
    const onglet = lancerLOnglet();

    expect(await ecranBloquant()).toBeDefined();
    expect(ouvertMaintenant(onglet.pilote).cible).toEqual(ALPHA);
    await tabulerJusqua(onglet.utilisateur, laCommande);
    await onglet.utilisateur.keyboard("{Enter}");

    expect(await screen.findByRole("link", { name: "Témoin de l'appareil" })).toBeDefined();
    expect(ouvertMaintenant(onglet.pilote).cible).toEqual(APPAREIL);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(selecteur()));
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("status")
          .some((region) => region.textContent === espaceOuvert(ESPACE_DE_CET_APPAREIL)),
      ).toBe(true),
    );
    await waitFor(async () =>
      expect(await contenuDeLAppareil()).not.toHaveProperty("espace-retenu"),
    );

    const suivant = relancer(onglet);

    expect(await screen.findByRole("link", { name: "Témoin de l'appareil" })).toBeDefined();
    expect(ouvertMaintenant(suivant.pilote).cible).toEqual(APPAREIL);
  });

  it("F-032-AC35 (c) F-002-AC17 l'écran bloquant de l'espace de l'appareil ne porte pas la commande : aucune action", async () => {
    await poserUnEspaceDUneAutreVersion(E_APPAREIL);
    await poserDansLAppareil({ "espace-local": E_APPAREIL });
    const onglet = lancerLOnglet();

    expect(await ecranBloquant()).toBeDefined();
    expect(ouvertMaintenant(onglet.pilote).cible).toEqual(APPAREIL);
    expect(screen.queryByRole("button", { name: OUVRIR_L_ESPACE_DE_CET_APPAREIL })).toBeNull();
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryAllByRole("link")).toEqual([]);
  });
});
