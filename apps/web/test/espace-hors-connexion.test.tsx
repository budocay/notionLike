// F-036 : « Ouvrir cet espace » sur l'écran d'un espace que l'appareil ne détient pas, hors
// connexion (F-032-AC2, D-040) : la commande reste, désactivée avec sa raison (AC5), et redevient
// la commande active au retour de la connexion et de la lecture (AC6). Onglet lancé comme l'entrée
// le lance, persistance réelle sur l'appareil simulé, serveur simulé.
//
// Critères de portée de la feature, prouvés ailleurs et cités ici :
// - F-036-AC7 : aucun écran bloquant de plus et les tests existants passent sans modification, hors
//   les assertions d'absence de la commande de `espace-ecrans.test.tsx` (ce fichier, ci-dessous, le
//   prouve avec F-032-AC2) ; la suite entière d'`apps/web` en est la preuve.
// - F-036-AC11 : liste fermée des fichiers touchés, prouvée par `git diff --name-only origin/main...HEAD`.
// - F-036-AC12 : la signature d'`OuvertureHorsConnexion` ne change pas (`EcranDUnEspace.tsx` seul
//   l'appelle) ; `pnpm typecheck` et les tests d'`apps/web` passent sans adapter un appelant.
// - F-036-AC13 : dettes D-040 et D-043 résorbées, tracées dans `PROJECT_LOG.md` et `MEMORY/STATE.md`.
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  CONNECTEZ_VOUS,
  DEMANDE_UNE_CONNEXION,
  NOM_INCONNU_SUR_CET_APPAREIL,
  nomOuvrirCetEspace,
} from "../src/interface/messages-espaces.ts";
import { Bouton } from "../src/interface/composants/Espaces.tsx";
import { lireDossier } from "./aides-disque.ts";
import { contenuDeLAppareil, E_ALPHA, E_GAMMA } from "./aides-appareil.ts";
import { enveloppe, moi200, moi401, ROUTES, serveurSimule } from "./aides-compte.tsx";
import {
  GAMMA_SERVEUR,
  listerAuServeur,
  poserLAppareil,
  routesDesEspaces,
  TEMOIN_DE_L_APPAREIL,
} from "./aides-ecrans-des-espaces.tsx";
import {
  aller,
  descriptionDe,
  espace200,
  espace,
  membre,
  membres200,
  R,
} from "./aides-espaces.tsx";
import { APPAREIL, lancerLOnglet, ouvertMaintenant } from "./aides-onglet.tsx";
import { nomsDesBases } from "./aides-persistance.ts";
import { rendreLOnglet } from "./aides-reprise.ts";

const COMMANDE = nomOuvrirCetEspace(NOM_INCONNU_SUR_CET_APPAREIL);

function commandeDesactivee(): HTMLElement {
  return screen.getByRole("button", { name: COMMANDE });
}

function verifierDesactivee(raison: string): void {
  const commande = commandeDesactivee();
  expect(commande.getAttribute("aria-disabled")).toBe("true");
  expect(descriptionDe(commande)).toBe(raison);
  expect(screen.getAllByText(raison, { exact: false }).length).toBeGreaterThan(0);
}

describe("commande désactivée hors connexion (F-036-AC5)", () => {
  it.each([
    ["compte déconnecté", () => moi401(), CONNECTEZ_VOUS],
    ["compte inconnu, serveur injoignable", undefined, DEMANDE_UNE_CONNEXION],
  ] as const)(
    "F-036-AC5 F-032-AC2 %s : l'espace que l'appareil ne détient pas montre « Ouvrir cet espace » désactivée (aria-disabled), sa raison visible et décrite, atteignable au clavier ; ni requête d'espace, ni écriture sur l'appareil, ni écran bloquant, ni changement d'espace",
    async (_cas, moi, raison) => {
      await poserLAppareil();
      const serveur = moi === undefined ? serveurSimule() : serveurSimule({ [ROUTES.moi]: moi });
      const onglet = lancerLOnglet({ serveur });
      await screen.findByRole("link", { name: TEMOIN_DE_L_APPAREIL });
      const basesAvant = await nomsDesBases();
      const appareilAvant = await contenuDeLAppareil();

      aller(`#/espaces/${E_GAMMA}`);

      const commande = await screen.findByRole("button", { name: COMMANDE });
      await waitFor(() => verifierDesactivee(raison));
      commande.focus();
      expect(document.activeElement).toBe(commande);
      await onglet.utilisateur.click(commande);
      await onglet.utilisateur.keyboard("{Enter}");
      expect(routesDesEspaces(serveur)).toEqual([]);
      expect(ouvertMaintenant(onglet.pilote).cible).toEqual(APPAREIL);
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(await nomsDesBases()).toEqual(basesAvant);
      expect(await contenuDeLAppareil()).toEqual(appareilAvant);
    },
  );

  it("F-036-AC5 F-032-AC2 un espace que l'appareil détient garde la commande active sous son dernier nom connu, sans requête", async () => {
    await poserLAppareil();
    const serveur = serveurSimule({ [ROUTES.moi]: () => moi401() });
    const onglet = lancerLOnglet({ serveur });
    await screen.findByRole("link", { name: TEMOIN_DE_L_APPAREIL });

    aller(`#/espaces/${E_ALPHA}`);

    const commande = await screen.findByRole("button", { name: nomOuvrirCetEspace("Alpha") });
    expect(commande.getAttribute("aria-disabled")).toBeNull();
    expect((commande as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: COMMANDE })).toBeNull();
    await onglet.utilisateur.click(commande);
    await screen.findByRole("link", { name: "Page d'Alpha" });
    expect(routesDesEspaces(serveur)).toEqual([]);
  });
});

describe("retour à la connexion (F-036-AC6)", () => {
  it("F-036-AC6 connecté mais la lecture de l'espace échoue : la commande reste désactivée avec « Demande une connexion au serveur. » et « Réessayer » ; la lecture qui aboutit la remplace par la commande active, sans rechargement", async () => {
    await poserLAppareil();
    const serveur = serveurSimule({ [ROUTES.moi]: () => moi200() });
    listerAuServeur(serveur, [GAMMA_SERVEUR]);
    serveur.poser(R.lire(E_GAMMA), () => enveloppe(500, "erreur-interne"));
    serveur.poser(R.membres(E_GAMMA), () => membres200([membre("m", "Inès Laurent", "lecteur")]));
    const onglet = lancerLOnglet({ serveur });
    await screen.findByRole("link", { name: TEMOIN_DE_L_APPAREIL });

    aller(`#/espaces/${E_GAMMA}`);

    const reessayer = await screen.findByRole("button", { name: "Réessayer" });
    await waitFor(() => verifierDesactivee(DEMANDE_UNE_CONNEXION));
    expect(screen.queryByRole("alertdialog")).toBeNull();

    serveur.poser(R.lire(E_GAMMA), () => espace200(espace("lecteur", "Gamma", E_GAMMA)));
    await onglet.utilisateur.click(reessayer);

    const active = await screen.findByRole("button", { name: nomOuvrirCetEspace("Gamma") });
    expect(active.getAttribute("aria-disabled")).toBeNull();
    expect((active as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: COMMANDE })).toBeNull();
  });

  it("F-036-AC6 la lecture échoue encore : la commande reste désactivée et « Réessayer » reste disponible", async () => {
    await poserLAppareil();
    const serveur = serveurSimule({ [ROUTES.moi]: () => moi200() });
    listerAuServeur(serveur, [GAMMA_SERVEUR]);
    serveur.poser(R.lire(E_GAMMA), () => enveloppe(500, "erreur-interne"));
    const onglet = lancerLOnglet({ serveur });
    await screen.findByRole("link", { name: TEMOIN_DE_L_APPAREIL });
    aller(`#/espaces/${E_GAMMA}`);
    await onglet.utilisateur.click(await screen.findByRole("button", { name: "Réessayer" }));

    await waitFor(() => verifierDesactivee(DEMANDE_UNE_CONNEXION));
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
  });

  it("F-036-AC6 le compte passe de déconnecté à connecté : la commande désactivée est remplacée par la commande active, sans rechargement", async () => {
    await poserLAppareil();
    let connecte = false;
    const serveur = serveurSimule({
      [ROUTES.moi]: () => (connecte ? moi200() : moi401()),
    });
    listerAuServeur(serveur, [GAMMA_SERVEUR]);
    serveur.poser(R.membres(E_GAMMA), () => membres200([membre("m", "Inès Laurent", "lecteur")]));
    lancerLOnglet({ serveur });
    await screen.findByRole("link", { name: TEMOIN_DE_L_APPAREIL });
    aller(`#/espaces/${E_GAMMA}`);
    await waitFor(() => verifierDesactivee(CONNECTEZ_VOUS));

    connecte = true;
    rendreLOnglet("visible");

    const active = await screen.findByRole("button", { name: nomOuvrirCetEspace("Gamma") });
    expect(active.getAttribute("aria-disabled")).toBeNull();
    expect(screen.queryByRole("button", { name: COMMANDE })).toBeNull();
  });
});

describe("couture de la prop indisponible de Bouton", () => {
  it("F-036-AC5 F-036-AC11 seul EcranDUnEspace fournit la prop ; les autres appelants gardent disabled", () => {
    const appelants = [...lireDossier("src")]
      .filter(([chemin]) => chemin.endsWith(".tsx"))
      .filter(([, texte]) => /<Bouton[\s/>]/.test(texte));
    expect(appelants.length).toBeGreaterThan(1);
    const ailleurs = [...lireDossier("src")]
      .filter(
        ([chemin]) =>
          !chemin.endsWith("EcranDUnEspace.tsx") && !chemin.endsWith("composants/Espaces.tsx"),
      )
      .filter(([, texte]) => /^\s*indisponible\s*$|\bindisponible=/m.test(texte));
    expect(ailleurs).toEqual([]);
    expect(lireDossier("src").get("src/interface/EcranDUnEspace.tsx")).toMatch(
      /^\s*indisponible\s*$/m,
    );
  });

  it("F-036-AC5 sans la prop, un Bouton avec raison reste disabled et sans aria-disabled", () => {
    render(<Bouton libelle="Agir" raison="Parce que" />);
    const bouton = screen.getByRole("button", { name: "Agir" });
    expect(bouton.hasAttribute("disabled")).toBe(true);
    expect(bouton.getAttribute("aria-disabled")).toBeNull();
  });

  it("F-036-AC5 avec la prop, le bouton est aria-disabled, atteignable et décrit par sa raison", () => {
    render(<Bouton libelle="Agir" raison="Parce que" indisponible />);
    const bouton = screen.getByRole("button", { name: "Agir" });
    expect(bouton.hasAttribute("disabled")).toBe(false);
    expect(bouton.getAttribute("aria-disabled")).toBe("true");
    expect(bouton.getAttribute("aria-describedby")).not.toBeNull();
  });
});
