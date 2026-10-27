// F-032, bloc 5 : l'écran des espaces à trois parties, dans un onglet lancé comme l'entrée le lance
// (pilote et magasin réels, persistance réelle sur l'appareil simulé, client des espaces enveloppé
// comme l'entrée l'enveloppe, sur un serveur simulé). Liste (AC1), liste sans le serveur (AC2),
// dernier nom connu (AC3), membre retiré ou espace supprimé (AC26), quitter ou supprimer un espace
// de l'appareil (AC27), matrice des droits (AC28), règles de la coquille (AC30).
import { CHEMINS_ESPACES } from "@notionlike/contrats";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { cheminDe } from "../src/compte/client-espaces.ts";
import type { ClientDesEspaces, EspaceLu, Resultat } from "../src/compte/index.ts";
import { permet } from "../src/compte/regles-espaces.ts";
import { COMMANDES, COMMANDES_DE_L_APPAREIL } from "../src/interface/commandes-espaces.ts";
import { ESPACES } from "../src/interface/composants/compte.classes.ts";
import {
  CONNECTEZ_VOUS,
  DEMANDE_UNE_CONNEXION,
  ESPACE_COURANT,
  ESPACE_DE_CET_APPAREIL,
  ESPACES_DU_SERVEUR,
  MENTION_DETACHE,
  MENTION_LOCAL,
  MENTION_PREMIERE_SYNCHRONISATION,
  NOM_INCONNU_SUR_CET_APPAREIL,
  nomDuSelecteur,
  RETRAIT_DE_L_ESPACE_OUVERT,
  SUR_CET_APPAREIL,
} from "../src/interface/messages-espaces.ts";
import { avecLesNoms } from "../src/interface/noms-des-espaces.ts";
import {
  baseDEspace,
  contenuDeLAppareil,
  E_ALPHA,
  E_BETA,
  E_GAMMA,
  poserDansLAppareil,
} from "./aides-appareil.ts";
import { COMPTE, enveloppe, moi401, serveurSimule } from "./aides-compte.tsx";
import { lire } from "./aides-disque.ts";
import {
  ALPHA_SERVEUR,
  BETA_SERVEUR,
  GAMMA_SERVEUR,
  listerAuServeur,
  ouvrirLEcranDesEspaces,
  partie,
  poserLAppareil,
  rangee,
  rangeesDe,
  routesDesEspaces,
  serveurDesEspacesListes,
  TEMOIN_DE_L_APPAREIL,
} from "./aides-ecrans-des-espaces.tsx";
import {
  aller,
  descriptionDe,
  espace,
  estDesactive,
  membre,
  membres200,
  R,
  toutLeStockage,
  vide204,
} from "./aides-espaces.tsx";
import { ajoute, lancerLOnglet, ouvertMaintenant, selecteur } from "./aides-onglet.tsx";
import { nomsDesBases } from "./aides-persistance.ts";
import { rendreLOnglet } from "./aides-reprise.ts";
import { contexteDe, fauteDeClasse, FEUILLE_D_ENTREE, FICHIER_DES_JETONS } from "./aides-styles.ts";

const MENTION_DE_F014 = "Les espaces du serveur ne s'ouvrent pas encore dans l'éditeur.";

function bouton(nom: string): HTMLButtonElement {
  return screen.getByRole("button", { name: nom });
}

describe("liste des espaces à trois parties (F-032-AC1)", () => {
  it("F-032-AC1 F-032-AC29 trois parties, chaque espace une seule fois, celui de l'appareil et du serveur dans la partie de l'appareil avec le rôle lu au serveur, au plus une mention, « Espace courant » par un texte ; la mention de F-014 a disparu ; la liste du serveur n'est conservée nulle part", async () => {
    await poserLAppareil();
    const serveur = serveurDesEspacesListes([ALPHA_SERVEUR, BETA_SERVEUR, GAMMA_SERVEUR]);
    lancerLOnglet({ serveur });
    await ouvrirLEcranDesEspaces(TEMOIN_DE_L_APPAREIL);

    await waitFor(() => expect(rangeesDe(ESPACES_DU_SERVEUR)).toHaveLength(1));
    expect(rangeesDe(ESPACE_DE_CET_APPAREIL)).toEqual([
      `${ESPACE_DE_CET_APPAREIL}${MENTION_LOCAL} · ${ESPACE_COURANT}`,
    ]);
    expect(rangeesDe(SUR_CET_APPAREIL)).toEqual([
      "AlphaÉditeurOuvrir cet espaceRetirer de cet appareil",
      `BêtaLecteur · ${MENTION_PREMIERE_SYNCHRONISATION}Ouvrir cet espaceRetirer de cet appareil`,
    ]);
    expect(rangeesDe(ESPACES_DU_SERVEUR)).toEqual(["GammaLecteurOuvrir cet espace"]);
    // Chaque espace une fois : son lien vers son écran, sa commande d'ouverture.
    for (const nom of ["Alpha", "Bêta", "Gamma"]) {
      expect(screen.getAllByRole("link", { name: `Ouvrir l'espace ${nom}` })).toHaveLength(1);
      expect(screen.getAllByRole("button", { name: `Ouvrir cet espace : ${nom}` })).toHaveLength(1);
    }
    expect(screen.getAllByText(ESPACE_COURANT, { exact: false })).toHaveLength(1);
    expect(screen.queryByText(MENTION_DE_F014)).toBeNull();
    expect(document.body.textContent).not.toContain(MENTION_DE_F014);
    // Seuls les noms des espaces de l'appareil sont retenus ; rien de la liste du serveur.
    const stockage = await toutLeStockage();
    expect(stockage).not.toContain("Gamma");
    expect(stockage).not.toContain(E_GAMMA);
  });

  it("F-032-AC1 F-032-AC20 l'espace ouvert est marqué « Espace courant » et ne s'ouvre pas ; son retrait est désactivé avec sa raison ; l'espace de l'appareil s'ouvre et ne se retire pas", async () => {
    await poserLAppareil();
    await poserDansLAppareil({ "espace-retenu": E_ALPHA });
    const serveur = serveurDesEspacesListes([ALPHA_SERVEUR, BETA_SERVEUR]);
    lancerLOnglet({ serveur });
    await ouvrirLEcranDesEspaces("Page d'Alpha");

    await waitFor(() =>
      expect(rangee(SUR_CET_APPAREIL, "Alpha").textContent).toContain(ESPACE_COURANT),
    );
    const alpha = rangee(SUR_CET_APPAREIL, "Alpha");
    expect(within(alpha).queryByRole("button", { name: /^Ouvrir cet espace/ })).toBeNull();
    const retirer = within(alpha).getByRole("button", { name: "Retirer de cet appareil : Alpha" });
    expect(estDesactive(retirer)).toBe(true);
    expect(descriptionDe(retirer)).toBe(RETRAIT_DE_L_ESPACE_OUVERT);
    const appareil = partie(ESPACE_DE_CET_APPAREIL);
    expect(
      within(appareil).getByRole("button", {
        name: `Ouvrir cet espace : ${ESPACE_DE_CET_APPAREIL}`,
      }),
    ).toBeTruthy();
    expect(within(appareil).queryByRole("button", { name: /^Retirer de cet appareil/ })).toBeNull();
  });
});

describe("liste sans le serveur (F-032-AC2)", () => {
  it("F-032-AC2 F-014-AC2 compte déconnecté : les espaces de l'appareil avec leur dernier nom connu, sans mention du serveur ; « Connectez-vous » ; création désactivée avec sa raison ; passer de l'un à l'autre sans requête ni écran bloquant", async () => {
    await poserLAppareil();
    const serveur = serveurSimule({ "GET /api/v1/moi": () => moi401() });
    const onglet = lancerLOnglet({ serveur });
    await ouvrirLEcranDesEspaces(TEMOIN_DE_L_APPAREIL);

    await waitFor(() => expect(partie(ESPACES_DU_SERVEUR).textContent).toContain(CONNECTEZ_VOUS));
    await waitFor(() =>
      expect(rangeesDe(SUR_CET_APPAREIL)).toEqual([
        "AlphaOuvrir cet espaceRetirer de cet appareil",
        `Bêta${MENTION_PREMIERE_SYNCHRONISATION}Ouvrir cet espaceRetirer de cet appareil`,
      ]),
    );
    const creer = bouton("Nouvel espace");
    expect(estDesactive(creer)).toBe(true);
    expect(descriptionDe(creer)).toBe(CONNECTEZ_VOUS);

    await onglet.utilisateur.click(bouton("Ouvrir cet espace : Alpha"));
    await screen.findByRole("link", { name: "Page d'Alpha" });
    expect(ouvertMaintenant(onglet.pilote).cible).toEqual(ajoute(E_ALPHA));
    expect(routesDesEspaces(serveur)).toEqual([]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("F-032-AC2 F-014-AC2 la liste échoue : les espaces de l'appareil, aucune mention « Ne se synchronise plus », l'échec et « Demande une connexion au serveur. », création désactivée", async () => {
    await poserLAppareil();
    const serveur = serveurDesEspacesListes([]);
    serveur.poser(R.espaces, () => enveloppe(500, "erreur-interne"));
    lancerLOnglet({ serveur });
    await ouvrirLEcranDesEspaces(TEMOIN_DE_L_APPAREIL);

    const alerte = await within(partie(ESPACES_DU_SERVEUR)).findByRole("alert");
    expect(alerte.textContent).toContain(DEMANDE_UNE_CONNEXION);
    expect(rangeesDe(SUR_CET_APPAREIL)).toHaveLength(2);
    expect(document.body.textContent).not.toContain(MENTION_DETACHE);
    expect(estDesactive(bouton("Nouvel espace"))).toBe(true);
    expect(estDesactive(bouton("Ouvrir cet espace : Bêta"))).toBe(false);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("F-032-AC2 compte inconnu, serveur injoignable : les espaces de l'appareil restent listés et ouvrables", async () => {
    await poserLAppareil();
    lancerLOnglet({ serveur: serveurSimule() });
    await ouvrirLEcranDesEspaces(TEMOIN_DE_L_APPAREIL);

    await waitFor(() =>
      expect(partie(ESPACES_DU_SERVEUR).textContent).toContain(DEMANDE_UNE_CONNEXION),
    );
    await waitFor(() => expect(rangeesDe(SUR_CET_APPAREIL)).toHaveLength(2));
    expect(estDesactive(bouton("Ouvrir cet espace : Alpha"))).toBe(false);
  });
});

describe("dernier nom connu (F-032-AC3)", () => {
  it("F-032-AC3 un nom rendu par la liste est inscrit sur l'appareil et affiché dans la liste et le sélecteur sans rechargement ; celui d'un espace que l'appareil ne détient pas ne l'est pas", async () => {
    await poserLAppareil();
    await poserDansLAppareil({ "espace-retenu": E_ALPHA });
    const serveur = serveurDesEspacesListes([
      { ...ALPHA_SERVEUR, nom: "Alpha renommé" },
      GAMMA_SERVEUR,
    ]);
    lancerLOnglet({ serveur });
    await ouvrirLEcranDesEspaces("Page d'Alpha");

    await waitFor(() =>
      expect(selecteur().getAttribute("aria-label")).toBe(nomDuSelecteur("Alpha renommé")),
    );
    expect(rangee(SUR_CET_APPAREIL, "Alpha renommé")).toBeTruthy();
    await waitFor(async () =>
      expect((await contenuDeLAppareil())[`nom:${E_ALPHA}`]).toBe("Alpha renommé"),
    );
    const appareil = await contenuDeLAppareil();
    expect(appareil[`nom:${E_GAMMA}`]).toBeUndefined();
    expect(Object.values(appareil)).not.toContain("Gamma");
  });

  it("F-032-AC3 F-014-AC33 sans nom connu : « Espace de cet appareil » et « Nom inconnu sur cet appareil » ; un nom qui porte du balisage s'affiche comme du texte", async () => {
    await poserLAppareil();
    const piege = "<img src=x onerror=alert(1)>";
    await poserDansLAppareil({ [`nom:${E_BETA}`]: undefined, [`nom:${E_ALPHA}`]: piege });
    lancerLOnglet({ serveur: serveurSimule({ "GET /api/v1/moi": () => moi401() }) });
    await ouvrirLEcranDesEspaces(TEMOIN_DE_L_APPAREIL);

    await waitFor(() => expect(rangeesDe(SUR_CET_APPAREIL)).toHaveLength(2));
    expect(rangeesDe(ESPACE_DE_CET_APPAREIL)[0]).toContain(ESPACE_DE_CET_APPAREIL);
    expect(rangee(SUR_CET_APPAREIL, NOM_INCONNU_SUR_CET_APPAREIL)).toBeTruthy();
    expect(rangee(SUR_CET_APPAREIL, piege)).toBeTruthy();
    expect(screen.getByRole("button", { name: `Ouvrir cet espace : ${piege}` })).toBeTruthy();
    expect(document.querySelectorAll("main img, main script")).toHaveLength(0);
  });

  it("F-032-AC3 F-032-AC31 l'enveloppe du client note les noms de chaque réponse conforme de la liste, de la lecture, du renommage, de la déclaration et de l'acceptation, et d'elles seules ; une exception du magasin n'atteint pas l'appelant", async () => {
    const lu = (nom: string, idEspace = E_ALPHA): EspaceLu => espace("editeur", nom, idEspace);
    const ok = <T,>(valeur: T): Promise<Resultat<T>> => Promise.resolve({ ok: true, valeur });
    const echec = <T,>(): Promise<Resultat<T>> =>
      Promise.resolve({ ok: false, erreur: { type: "hors-ligne" } });
    const client = {
      listerEspaces: () => ok([lu("Liste"), lu("Autre", E_GAMMA)]),
      creerEspace: () => ok(lu("Créé")),
      declarerEspace: () => ok({ ...lu("Déclaré"), rejouee: false }),
      lireEspace: () => ok(lu("Lu")),
      renommerEspace: () => ok(lu("Renommé")),
      supprimerEspace: () => ok(null),
      accepterInvitation: () => ok(lu("Rejoint")),
    } as unknown as ClientDesEspaces;
    const noterLesNoms = vi.fn();
    const enveloppe = avecLesNoms(client, { noterLesNoms });

    await enveloppe.listerEspaces();
    await enveloppe.creerEspace({ idEspace: E_ALPHA, nom: "Créé" });
    await enveloppe.declarerEspace({ idEspace: E_ALPHA, nom: "Déclaré" });
    await enveloppe.lireEspace(E_ALPHA);
    await enveloppe.renommerEspace(E_ALPHA, { nom: "Renommé" });
    await enveloppe.accepterInvitation({ jeton: "x" });
    expect(noterLesNoms.mock.calls.map(([noms]) => [...(noms as Map<string, string>)])).toEqual([
      [
        [E_ALPHA, "Liste"],
        [E_GAMMA, "Autre"],
      ],
      [[E_ALPHA, "Déclaré"]],
      [[E_ALPHA, "Lu"]],
      [[E_ALPHA, "Renommé"]],
      [[E_ALPHA, "Rejoint"]],
    ]);

    const enEchec = avecLesNoms(
      { ...client, lireEspace: echec, listerEspaces: echec } as ClientDesEspaces,
      { noterLesNoms },
    );
    noterLesNoms.mockClear();
    expect((await enEchec.lireEspace(E_ALPHA)).ok).toBe(false);
    expect((await enEchec.listerEspaces()).ok).toBe(false);
    expect(noterLesNoms).not.toHaveBeenCalled();

    const signalement = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const quiLeve = avecLesNoms(client, {
      noterLesNoms: () => {
        throw new Error("magasin en panne");
      },
    });
    expect(await quiLeve.lireEspace(E_ALPHA)).toEqual({ ok: true, valeur: lu("Lu") });
    expect(signalement).toHaveBeenCalledOnce();
    signalement.mockRestore();
  });
});

describe("membre retiré, espace supprimé (F-032-AC26, AC27)", () => {
  it("F-032-AC26 un espace inscrit que la liste ne rend pas : « Ne se synchronise plus avec ce compte », toujours ouvrable et retirable ; recalculée à chaque lecture, jamais inscrite", async () => {
    await poserLAppareil();
    const serveur = serveurDesEspacesListes([BETA_SERVEUR]);
    lancerLOnglet({ serveur });
    await ouvrirLEcranDesEspaces(TEMOIN_DE_L_APPAREIL);

    await waitFor(() =>
      expect(rangee(SUR_CET_APPAREIL, "Alpha").textContent).toContain(MENTION_DETACHE),
    );
    // Au plus une mention : Bêta, listé et marqué, garde la sienne.
    expect(rangee(SUR_CET_APPAREIL, "Bêta").textContent).not.toContain(MENTION_DETACHE);
    expect(estDesactive(bouton("Ouvrir cet espace : Alpha"))).toBe(false);
    expect(estDesactive(bouton("Retirer de cet appareil : Alpha"))).toBe(false);
    expect(JSON.stringify(await contenuDeLAppareil())).not.toContain(MENTION_DETACHE);
    expect(await toutLeStockage()).not.toContain(MENTION_DETACHE);

    listerAuServeur(serveur, [ALPHA_SERVEUR, BETA_SERVEUR]);
    rendreLOnglet("visible");
    await waitFor(() =>
      expect(rangee(SUR_CET_APPAREIL, "Alpha").textContent).not.toContain(MENTION_DETACHE),
    );
  });

  it.each([
    ["quitté", "editeur"],
    ["supprimé", "proprietaire"],
  ] as const)(
    "F-032-AC27 F-014-AC11 F-014-AC12 un espace de l'appareil %s depuis cet appareil : aucune base effacée, son entrée gardée ; sa rangée passe sous « Ne se synchronise plus avec ce compte » à la relecture",
    async (geste, role) => {
      await poserLAppareil();
      const alpha = { ...ALPHA_SERVEUR, role };
      const serveur = serveurDesEspacesListes([alpha, BETA_SERVEUR]);
      serveur.poser(R.membres(E_ALPHA), () =>
        membres200([
          membre(
            COMPTE.id,
            COMPTE.nom,
            role,
            role === "proprietaire" ? COMPTE.courriel : undefined,
          ),
        ]),
      );
      const quitter = `DELETE ${cheminDe(CHEMINS_ESPACES.membre, { idEspace: E_ALPHA, idCompte: COMPTE.id })}`;
      const fin = (): Response => {
        listerAuServeur(serveur, [BETA_SERVEUR]);
        return vide204();
      };
      serveur.poser(quitter, fin);
      serveur.poser(R.supprimer(E_ALPHA), fin);
      const onglet = lancerLOnglet({ serveur });
      await screen.findByRole("link", { name: TEMOIN_DE_L_APPAREIL });
      const basesAvant = await nomsDesBases();
      aller(`#/espaces/${E_ALPHA}`);

      if (geste === "quitté") {
        await onglet.utilisateur.click(
          await screen.findByRole("button", { name: "Quitter cet espace : Alpha" }),
        );
        const boite = screen.getByRole("alertdialog");
        await onglet.utilisateur.click(within(boite).getByRole("button", { name: /^Quitter/ }));
      } else {
        await onglet.utilisateur.click(
          await screen.findByRole("button", { name: "Supprimer cet espace : Alpha" }),
        );
        const boite = screen.getByRole("alertdialog");
        await onglet.utilisateur.type(within(boite).getByRole("textbox"), "Alpha");
        await onglet.utilisateur.click(
          within(boite).getByRole("button", { name: /^Supprimer définitivement/ }),
        );
      }

      await waitFor(() => expect(window.location.hash).toBe("#/espaces"));
      await waitFor(() =>
        expect(rangee(SUR_CET_APPAREIL, "Alpha").textContent).toContain(MENTION_DETACHE),
      );
      expect(await nomsDesBases()).toEqual(basesAvant);
      expect(await nomsDesBases()).toContain(baseDEspace(E_ALPHA));
      expect((await contenuDeLAppareil())[`registre:${E_ALPHA}`]).toEqual({
        rattachement: "adopte",
        droit: "ecriture",
      });
    },
  );
});

describe("matrice des droits (F-032-AC28)", () => {
  it("F-032-AC28 « Ouvrir cet espace » d'un espace du serveur est rattaché à lire-espace, que chaque rôle permet ; les commandes de l'appareil ne sont rattachées à aucune action", () => {
    expect(COMMANDES["ouvrir-espace"]).toBe("lire-espace");
    for (const role of ["proprietaire", "editeur", "lecteur"] as const) {
      expect(permet(role, COMMANDES["ouvrir-espace"])).toBe(true);
    }
    expect([...COMMANDES_DE_L_APPAREIL]).toEqual([
      "ouvrir-sur-l-appareil",
      "retirer-de-l-appareil",
    ]);
    const commandes = lire("src/interface/commandes-espaces.ts");
    expect(commandes).not.toMatch(/"ouvrir-sur-l-appareil":\s*"[a-z-]+-espace"/);
    expect(Object.keys(COMMANDES)).not.toEqual(
      expect.arrayContaining([...COMMANDES_DE_L_APPAREIL]),
    );
  });
});

describe("règles de la coquille (F-032-AC30)", () => {
  const contexte = contexteDe(lire(FICHIER_DES_JETONS), lire(FEUILLE_D_ENTREE));

  it("F-032-AC30 F-004-AC43 F-004-AC24 F-004-AC41 chaque commande ajoutée garde la cible de 44 pixels, compacte seulement par etroit:pointer-fine: ; le titre d'une rangée tient sur une ligne ; chaque classe est bâtie sur un jeton", async () => {
    await poserLAppareil();
    lancerLOnglet({
      serveur: serveurDesEspacesListes([ALPHA_SERVEUR, BETA_SERVEUR, GAMMA_SERVEUR]),
    });
    await ouvrirLEcranDesEspaces(TEMOIN_DE_L_APPAREIL);
    await waitFor(() => expect(rangeesDe(ESPACES_DU_SERVEUR)).toHaveLength(1));

    const commandes = [
      bouton("Ouvrir cet espace : Alpha"),
      bouton("Retirer de cet appareil : Alpha"),
      bouton("Ouvrir cet espace : Gamma"),
      screen.getByRole("link", { name: "Ouvrir l'espace Gamma" }),
    ];
    for (const commande of commandes) {
      const classes = commande.className.split(" ");
      expect(classes).toContain("min-h-cible");
      expect(classes.filter((classe) => /min-h-/.test(classe))).toEqual([
        "min-h-cible",
        "etroit:pointer-fine:min-h-rangee",
      ]);
    }
    const titreLien = screen.getByRole("link", { name: "Ouvrir l'espace Alpha" }).firstElementChild;
    expect(titreLien?.className.split(" ")).toEqual(
      expect.arrayContaining(["truncate", "extensible"]),
    );
    const titreTexte = rangee(ESPACE_DE_CET_APPAREIL, ESPACE_DE_CET_APPAREIL).firstElementChild;
    expect(titreTexte?.className.split(" ")).toContain("truncate");
    const ajoutees = [
      ESPACES.groupe,
      ESPACES.liste,
      ESPACES.rangee,
      ESPACES.titreDeRangee,
      ESPACES.lienDeRangee,
      ESPACES.titreCoupe,
      ESPACES.detailDeRangee,
    ].flatMap((liste) => liste.split(" "));
    expect(ajoutees.flatMap((classe) => fauteDeClasse(classe, contexte) ?? [])).toEqual([]);
    // Aucune largeur fixe : rien ne force un défilement horizontal à 360 pixels (F-004-AC45).
    expect(ajoutees.filter((classe) => /^(min-)?w-(?!auto|full)/.test(classe))).toEqual([]);
  });
});
