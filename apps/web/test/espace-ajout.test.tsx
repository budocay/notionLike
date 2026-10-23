// F-032, bloc 5 : ouvrir sur l'appareil un espace du serveur, retirer un espace de l'appareil, et ce
// que les autres onglets en voient. Onglet lancé comme l'entrée le lance (pilote et magasin réels,
// persistance réelle sur l'appareil simulé, synchronisation simulée, client des espaces sur un
// serveur simulé). Ajout (AC5), échecs de l'ajout (AC6), première synchronisation (AC8), retrait
// (AC20), onglets (AC22), clavier et annonces (AC29), aucune erreur non gérée (AC31).
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  AJOUT_SANS_STOCKAGE,
  ECHEC_GENERIQUE,
  ESPACE_COURANT,
  ESPACE_DE_CET_APPAREIL,
  ESPACES_DU_SERVEUR,
  espaceOuvert,
  espaceRetireDeLAppareil,
  PAS_ENCORE_TELECHARGE,
  PLUS_ACCESSIBLE,
  REQUETE_EN_COURS,
  retraitIncomplet,
  SUR_CET_APPAREIL,
  titreDuRetraitDeLAppareil,
} from "../src/interface/messages-espaces.ts";
import {
  PREMIERE_SYNCHRONISATION,
  TITRES_DES_ETATS,
} from "../src/interface/messages-synchronisation.ts";
import {
  INVITATION_PREMIERE_PAGE,
  PAGES_PAS_ENCORE_TELECHARGEES,
} from "../src/interface/messages.ts";
import {
  BASE_DE_L_APPAREIL,
  baseDEspace,
  canauxRelies,
  contenuDeLAppareil,
  E_ALPHA,
  E_APPAREIL,
  E_BETA,
  E_GAMMA,
  ECRITURE,
  P_DEUX,
  P_UN,
  poserDansLAppareil,
  poserUneBase,
} from "./aides-appareil.ts";
import { enveloppe, jamais, json, ROUTES } from "./aides-compte.tsx";
import {
  ALPHA_SERVEUR,
  BETA_SERVEUR,
  GAMMA_SERVEUR,
  ouvrirLEcranDesEspaces,
  partie,
  poserLAppareil,
  rangee,
  rangeesDe,
  serveurDesEspacesListes,
  TEMOIN_DE_L_APPAREIL,
} from "./aides-ecrans-des-espaces.tsx";
import {
  aller,
  corpsDe,
  descriptionDe,
  espace,
  espace200,
  estDesactive,
  JETON_INVITATION,
  membre,
  membres200,
  R,
} from "./aides-espaces.tsx";
import {
  ajoute,
  APPAREIL,
  ETAT_ADOPTE,
  lancerLOnglet,
  magasinDeLOnglet,
  type Onglet,
  ouvertMaintenant,
  relancer,
  selecteur,
  synchronisationSimulee,
} from "./aides-onglet.tsx";
import { nomsDesBases } from "./aides-persistance.ts";
import { ecouterLesErreursNonInterceptees, refuserLOuvertureDe } from "./aides-reprise.ts";

const PAGE_DE_BETA = `notionlike:page:${E_BETA}:${P_UN}`;
const PAGE_D_ALPHA = `notionlike:page:${E_ALPHA}:${P_DEUX}`;

function bouton(nom: string): HTMLButtonElement {
  return screen.getByRole("button", { name: nom });
}

function lecturesDe(onglet: Onglet, route: string): number {
  return onglet.serveur.routesAppelees().filter((appelee) => appelee === route).length;
}

/** Ce que l'appareil retient de cet espace, clé par clé. */
async function retenuDe(idEspace: string): Promise<string[]> {
  return Object.keys(await contenuDeLAppareil()).filter((cle) => cle.includes(idEspace));
}

async function basesDe(idEspace: string): Promise<string[]> {
  return (await nomsDesBases()).filter((nom) => nom.includes(idEspace));
}

/** Les régions d'état qui portent ce texte. */
function annonces(texte: string): HTMLElement[] {
  return screen.getAllByRole("status").filter((region) => region.textContent === texte);
}

describe("ouvrir sur l'appareil un espace du serveur (F-032-AC5)", () => {
  it("F-032-AC5 depuis la liste : GET de l'espace une fois, « Requête en cours. » sans seconde requête, rien de l'espace ouvert avant l'inscription ; puis l'entrée adopte avec le droit du rôle, le nom et la marque, et le changement d'espace", async () => {
    await poserLAppareil();
    const serveur = serveurDesEspacesListes([ALPHA_SERVEUR, BETA_SERVEUR, GAMMA_SERVEUR]);
    let repondre: (reponse: Response) => void = () => undefined;
    serveur.poser(R.lire(E_GAMMA), () => new Promise<Response>((fin) => (repondre = fin)));
    const journal: string[] = [];
    const simulee = synchronisationSimulee(journal);
    const onglet = lancerLOnglet({ serveur, synchronisation: simulee.fabrique, journal });
    await ouvrirLEcranDesEspaces(TEMOIN_DE_L_APPAREIL);

    const ouvrir = await screen.findByRole("button", { name: "Ouvrir cet espace : Gamma" });
    await onglet.utilisateur.click(ouvrir);
    await waitFor(() => expect(descriptionDe(ouvrir)).toBe(REQUETE_EN_COURS));
    expect(estDesactive(ouvrir)).toBe(true);
    await onglet.utilisateur.click(ouvrir);
    expect(lecturesDe(onglet, R.lire(E_GAMMA))).toBe(1);
    expect(await basesDe(E_GAMMA)).toEqual([]);
    expect(await retenuDe(E_GAMMA)).toEqual([]);
    expect(journal.filter((ligne) => ligne.includes(E_GAMMA))).toEqual([]);
    expect(ouvertMaintenant(onglet.pilote).cible).toEqual(APPAREIL);

    act(() => repondre(espace200(espace("lecteur", "Gamma", E_GAMMA))));
    await waitFor(() => expect(ouvertMaintenant(onglet.pilote).cible).toEqual(ajoute(E_GAMMA)));
    const appareil = await contenuDeLAppareil();
    expect(appareil[`registre:${E_GAMMA}`]).toEqual({ rattachement: "adopte", droit: "lecture" });
    expect(appareil[`nom:${E_GAMMA}`]).toBe("Gamma");
    expect(appareil[`premiere-synchronisation:${E_GAMMA}`]).toBe(true);
    expect(lecturesDe(onglet, R.lire(E_GAMMA))).toBe(1);
    expect(journal).toContain(`démarre ${E_GAMMA}`);
    await waitFor(() => expect(selecteur().textContent).toBe("Gamma"));
    expect(annonces(espaceOuvert("Gamma"))).toHaveLength(1);
    expect(window.location.hash).toBe("#/");
  });

  it("F-032-AC5 F-032-AC10 depuis l'écran d'un espace : un espace de l'appareil s'ouvre sans requête ; un espace du serveur, par une lecture de plus que celles de l'écran, puis le changement", async () => {
    await poserLAppareil();
    const serveur = serveurDesEspacesListes([ALPHA_SERVEUR, GAMMA_SERVEUR]);
    for (const id of [E_ALPHA, E_GAMMA]) {
      serveur.poser(R.membres(id), () => membres200([membre(id, "Inès Laurent", "editeur")]));
    }
    // Alpha adopté, connexion établie, rien en attente : le quitter n'attend ni ne confirme (AC12).
    const simulee = synchronisationSimulee();
    simulee.poser(E_ALPHA, ETAT_ADOPTE);
    simulee.connexions.set(E_ALPHA, { etablie: true, enAttente: false });
    const onglet = lancerLOnglet({ serveur, synchronisation: simulee.fabrique });
    await screen.findByRole("link", { name: TEMOIN_DE_L_APPAREIL });

    aller(`#/espaces/${E_ALPHA}`);
    const alpha = await screen.findByRole("button", { name: "Ouvrir cet espace : Alpha" });
    const lecturesDAlpha = lecturesDe(onglet, R.lire(E_ALPHA));
    await onglet.utilisateur.click(alpha);
    await waitFor(() => expect(ouvertMaintenant(onglet.pilote).cible).toEqual(ajoute(E_ALPHA)));
    expect(lecturesDe(onglet, R.lire(E_ALPHA))).toBe(lecturesDAlpha);

    await screen.findByRole("link", { name: "Page d'Alpha" });
    aller(`#/espaces/${E_GAMMA}`);
    const ouvrir = await screen.findByRole("button", { name: "Ouvrir cet espace : Gamma" });
    const lecturesDeGamma = lecturesDe(onglet, R.lire(E_GAMMA));
    await onglet.utilisateur.click(ouvrir);
    await waitFor(() => expect(ouvertMaintenant(onglet.pilote).cible).toEqual(ajoute(E_GAMMA)));
    expect(lecturesDe(onglet, R.lire(E_GAMMA))).toBe(lecturesDeGamma + 1);
  });

  it("F-032-AC5 F-014-AC23 après l'acceptation d'une invitation : « Ouvrir cet espace » est proposé, rien n'est écrit sur l'appareil et l'espace courant ne change pas sans ce second geste", async () => {
    await poserLAppareil();
    const serveur = serveurDesEspacesListes([GAMMA_SERVEUR]);
    serveur.poser(R.accepter, () => espace200(espace("lecteur", "Gamma", E_GAMMA)));
    window.history.replaceState(null, "", `#/invitation/${JETON_INVITATION}`);
    const onglet = lancerLOnglet({ serveur });

    await onglet.utilisateur.click(
      await screen.findByRole("button", { name: "Rejoindre l'espace" }),
    );
    const ouvrir = await screen.findByRole("button", { name: "Ouvrir cet espace : Gamma" });
    expect(screen.getByRole("link", { name: "Voir cet espace" })).toBeTruthy();
    expect(ouvertMaintenant(onglet.pilote).cible).toEqual(APPAREIL);
    expect(await retenuDe(E_GAMMA)).toEqual([]);
    expect(corpsDe(serveur, R.accepter)).toEqual([{ jeton: JETON_INVITATION }]);

    await onglet.utilisateur.click(ouvrir);
    await waitFor(() => expect(ouvertMaintenant(onglet.pilote).cible).toEqual(ajoute(E_GAMMA)));
  });

  it("F-032-AC5 F-014-AC7 après la création d'un espace : son écran propose « Ouvrir cet espace », l'espace courant ne change pas et rien n'est écrit sur l'appareil", async () => {
    await poserLAppareil();
    const serveur = serveurDesEspacesListes([]);
    let tire = "";
    serveur.poser(R.creer, () => {
      const corps = corpsDe(serveur, R.creer).at(-1) as { idEspace: string; nom: string };
      tire = corps.idEspace;
      serveur.poser(R.lire(tire), () => espace200(espace("proprietaire", corps.nom, tire)));
      serveur.poser(R.membres(tire), () => membres200([]));
      serveur.poser(`GET /api/v1/espaces/${tire}/invitations`, () =>
        json(200, { invitations: [] }),
      );
      return espace200(espace("proprietaire", corps.nom, tire), 201);
    });
    const onglet = lancerLOnglet({ serveur });
    await ouvrirLEcranDesEspaces(TEMOIN_DE_L_APPAREIL);
    const avant = await contenuDeLAppareil();

    await onglet.utilisateur.click(await screen.findByRole("button", { name: "Nouvel espace" }));
    await onglet.utilisateur.keyboard("Équipe Nord{Enter}");
    expect(
      await screen.findByRole("button", { name: "Ouvrir cet espace : Équipe Nord" }),
    ).toBeTruthy();
    expect(ouvertMaintenant(onglet.pilote).cible).toEqual(APPAREIL);
    expect(await contenuDeLAppareil()).toEqual(avant);
  });
});

describe("échecs de l'ajout (F-032-AC6, AC31)", () => {
  const CAS = [
    ["le réseau", undefined, [PAS_ENCORE_TELECHARGE]],
    ["l'échéance", () => jamais(), [PAS_ENCORE_TELECHARGE]],
    ["un 404", () => enveloppe(404, "ressource-introuvable"), [PLUS_ACCESSIBLE]],
    [
      "un 500",
      () => enveloppe(500, "erreur-interne"),
      ["Une erreur est survenue sur le serveur. Réessayez.", "req-7c2e91"],
    ],
    ["un corps non conforme", () => json(200, { nom: 1 }), [ECHEC_GENERIQUE]],
  ] as const;

  it.each(CAS)(
    "F-032-AC6 F-032-AC31 F-014-AC28 F-014-AC30 F-014-AC31 %s : le message, l'onglet reste sur l'espace ouvert, aucune entrée ni base de l'espace, aucune erreur non gérée",
    async (_cas, reponse, phrases) => {
      const relevees = ecouterLesErreursNonInterceptees();
      await poserLAppareil();
      const serveur = serveurDesEspacesListes([GAMMA_SERVEUR]);
      if (reponse === undefined) {
        serveur.retirer(R.lire(E_GAMMA));
      } else {
        serveur.poser(R.lire(E_GAMMA), reponse);
      }
      const onglet = lancerLOnglet({ serveur, delaiMs: 50 });
      await ouvrirLEcranDesEspaces(TEMOIN_DE_L_APPAREIL);
      const listes = (): number => lecturesDe(onglet, R.espaces);
      await screen.findByRole("button", { name: "Ouvrir cet espace : Gamma" });
      const listesAvant = listes();

      await onglet.utilisateur.click(bouton("Ouvrir cet espace : Gamma"));
      const alerte = await screen.findByRole("alert");
      for (const phrase of phrases) {
        expect(alerte.textContent).toContain(phrase);
      }
      if (phrases[0] === PLUS_ACCESSIBLE) {
        await waitFor(() => expect(listes()).toBeGreaterThan(listesAvant));
      }
      expect(ouvertMaintenant(onglet.pilote).cible).toEqual(APPAREIL);
      expect(await retenuDe(E_GAMMA)).toEqual([]);
      expect(await basesDe(E_GAMMA)).toEqual([]);
      expect(relevees()).toEqual([]);
    },
  );

  it("F-032-AC6 F-010-AC28 un 401 fait revérifier l'état du compte", async () => {
    await poserLAppareil();
    const serveur = serveurDesEspacesListes([GAMMA_SERVEUR]);
    serveur.poser(R.lire(E_GAMMA), () => enveloppe(401, "non-authentifie"));
    const onglet = lancerLOnglet({ serveur });
    await ouvrirLEcranDesEspaces(TEMOIN_DE_L_APPAREIL);
    await screen.findByRole("button", { name: "Ouvrir cet espace : Gamma" });
    const moi = lecturesDe(onglet, ROUTES.moi);

    await onglet.utilisateur.click(bouton("Ouvrir cet espace : Gamma"));
    await waitFor(() => expect(lecturesDe(onglet, ROUTES.moi)).toBeGreaterThan(moi));
    expect(ouvertMaintenant(onglet.pilote).cible).toEqual(APPAREIL);
    expect(await retenuDe(E_GAMMA)).toEqual([]);
  });

  it("F-032-AC6 F-032-AC31 l'inscription échoue, la base de l'appareil refusée : « son stockage ne répond pas », aucune entrée, aucune base, l'onglet reste, aucune erreur non gérée ; la liste et l'espace de l'appareil restent affichés", async () => {
    const relevees = ecouterLesErreursNonInterceptees();
    await poserLAppareil();
    const onglet = lancerLOnglet({ serveur: serveurDesEspacesListes([GAMMA_SERVEUR]) });
    await ouvrirLEcranDesEspaces(TEMOIN_DE_L_APPAREIL);
    await screen.findByRole("button", { name: "Ouvrir cet espace : Gamma" });
    refuserLOuvertureDe(BASE_DE_L_APPAREIL);

    await onglet.utilisateur.click(bouton("Ouvrir cet espace : Gamma"));
    expect((await screen.findByRole("alert")).textContent).toBe(AJOUT_SANS_STOCKAGE);
    expect(ouvertMaintenant(onglet.pilote).cible).toEqual(APPAREIL);
    expect(await basesDe(E_GAMMA)).toEqual([]);
    expect(rangeesDe(ESPACE_DE_CET_APPAREIL)[0]).toContain(ESPACE_COURANT);
    expect(relevees()).toEqual([]);
  });
});

describe("première synchronisation visible (F-032-AC8)", () => {
  it("F-032-AC8 tant que la marque est là, la zone le dit en plus de son état et l'accueil vide dit que les pages manquent, rechargement compris ; au premier « Synchronisé », la marque et ses textes disparaissent", async () => {
    await poserLAppareil();
    await poserDansLAppareil({
      [`registre:${E_GAMMA}`]: ECRITURE,
      [`nom:${E_GAMMA}`]: "Gamma",
      [`premiere-synchronisation:${E_GAMMA}`]: true,
      "espace-retenu": E_GAMMA,
    });
    const simulee = synchronisationSimulee();
    simulee.poser(E_GAMMA, ETAT_ADOPTE);
    const options = { synchronisation: simulee.fabrique };
    let onglet = lancerLOnglet(options);

    const zone = await screen.findByRole("region", { name: "Synchronisation" });
    await waitFor(() => expect(zone.textContent).toContain(PREMIERE_SYNCHRONISATION));
    expect(zone.textContent).toContain(TITRES_DES_ETATS["en-cours"]);
    expect(screen.getByText(PAGES_PAS_ENCORE_TELECHARGEES)).toBeTruthy();
    expect(screen.queryByText(INVITATION_PREMIERE_PAGE)).toBeNull();

    onglet = relancer(onglet, options);
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Synchronisation" }).textContent).toContain(
        PREMIERE_SYNCHRONISATION,
      ),
    );

    act(() => simulee.poser(E_GAMMA, { affiche: "synchronise" }));
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Synchronisation" }).textContent).not.toContain(
        PREMIERE_SYNCHRONISATION,
      ),
    );
    expect(screen.getByRole("region", { name: "Synchronisation" }).textContent).toContain(
      TITRES_DES_ETATS.synchronise,
    );
    expect(screen.queryByText(PAGES_PAS_ENCORE_TELECHARGEES)).toBeNull();
    await waitFor(async () =>
      expect((await contenuDeLAppareil())[`premiere-synchronisation:${E_GAMMA}`]).toBeUndefined(),
    );

    act(() => simulee.poser(E_GAMMA, { affiche: "en-cours" }));
    relancer(onglet, options);
    await screen.findByText(INVITATION_PREMIERE_PAGE);
    expect(screen.getByRole("region", { name: "Synchronisation" }).textContent).not.toContain(
      PREMIERE_SYNCHRONISATION,
    );
  });
});

describe("retrait de l'appareil (F-032-AC20, AC29)", () => {
  it("F-032-AC20 F-032-AC29 une boîte d'alerte qui cite l'espace, focus sur « Annuler », Échap annule ; confirmé, les bases de l'espace et ce que l'appareil retient de lui sont effacés, et rien d'autre ; l'annonce, sans déplacer le focus hors de la liste ; l'espace reste ouvrable depuis la liste du serveur", async () => {
    await poserLAppareil();
    await poserUneBase(PAGE_DE_BETA);
    await poserUneBase(PAGE_D_ALPHA);
    const canaux = canauxRelies();
    const onglet = lancerLOnglet({
      serveur: serveurDesEspacesListes([ALPHA_SERVEUR, BETA_SERVEUR]),
      ouvrirUnCanal: canaux.ouvrirUnCanal,
    });
    await ouvrirLEcranDesEspaces(TEMOIN_DE_L_APPAREIL);
    const origine = await screen.findByRole("button", { name: "Retirer de cet appareil : Bêta" });
    const basesAvant = await nomsDesBases();

    await onglet.utilisateur.click(origine);
    let boite = screen.getByRole("alertdialog", { name: titreDuRetraitDeLAppareil("Bêta") });
    for (const phrase of [
      "« Bêta »",
      "irréversible sur cet appareil",
      "n'ont pas été transmises au serveur seront perdues",
      "reste sur le serveur pour ses membres",
      "rouvrir",
    ]) {
      expect(boite.textContent).toContain(phrase);
    }
    expect(document.activeElement).toBe(within(boite).getByRole("button", { name: "Annuler" }));
    await onglet.utilisateur.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(origine));
    expect(await nomsDesBases()).toEqual(basesAvant);

    await onglet.utilisateur.keyboard("{Enter}");
    boite = screen.getByRole("alertdialog");
    await onglet.utilisateur.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(
      within(boite).getByRole("button", { name: "Retirer de cet appareil : Bêta" }),
    );
    await onglet.utilisateur.keyboard("{Enter}");

    await waitFor(() => expect(annonces(espaceRetireDeLAppareil("Bêta"))).toHaveLength(1));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(rangeesDe(SUR_CET_APPAREIL)).toHaveLength(1);
    await waitFor(() =>
      expect(partie(SUR_CET_APPAREIL).contains(document.activeElement)).toBe(true),
    );
    expect(await basesDe(E_BETA)).toEqual([]);
    expect(await retenuDe(E_BETA)).toEqual([]);
    expect(await basesDe(E_ALPHA)).toEqual([baseDEspace(E_ALPHA), PAGE_D_ALPHA].sort());
    expect(await nomsDesBases()).toContain(baseDEspace(E_APPAREIL));
    expect((await contenuDeLAppareil())[`registre:${E_ALPHA}`]).toEqual(ECRITURE);
    expect(rangee(ESPACES_DU_SERVEUR, "Bêta")).toBeTruthy();
  });

  it("F-032-AC20 F-007-AC21 F-032-AC31 un effacement qui échoue : l'avertissement, l'espace retiré de la liste quand même, aucune erreur non gérée", async () => {
    const relevees = ecouterLesErreursNonInterceptees();
    await poserLAppareil();
    const onglet = lancerLOnglet({
      serveur: serveurDesEspacesListes([]),
      retrait: async () => {
        await poserDansLAppareil({ [`registre:${E_BETA}`]: undefined });
        return "echec";
      },
    });
    await ouvrirLEcranDesEspaces(TEMOIN_DE_L_APPAREIL);
    await onglet.utilisateur.click(
      await screen.findByRole("button", { name: "Retirer de cet appareil : Bêta" }),
    );
    await onglet.utilisateur.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Retirer de cet appareil : Bêta",
      }),
    );

    expect((await within(partie(SUR_CET_APPAREIL)).findByRole("alert")).textContent).toBe(
      retraitIncomplet("Bêta"),
    );
    await waitFor(() => expect(rangeesDe(SUR_CET_APPAREIL)).toHaveLength(1));
    expect(relevees()).toEqual([]);
  });
});

describe("onglets (F-032-AC22)", () => {
  it("F-032-AC22 F-032-AC3 un ajout, un nom inscrit et un retrait faits dans un autre onglet apparaissent dans l'écran des espaces et le sélecteur de cet onglet en moins de 2 secondes, sans rechargement", async () => {
    await poserLAppareil();
    await poserDansLAppareil({ "espace-retenu": E_ALPHA });
    const canaux = canauxRelies();
    lancerLOnglet({ serveur: serveurDesEspacesListes([]), ouvrirUnCanal: canaux.ouvrirUnCanal });
    await ouvrirLEcranDesEspaces("Page d'Alpha");
    await waitFor(() => expect(rangeesDe(SUR_CET_APPAREIL)).toHaveLength(2));
    const autre = magasinDeLOnglet(canaux.ouvrirUnCanal);
    await autre.relire();

    expect(await autre.ajouter(E_GAMMA, ECRITURE, "Gamma")).toBe(true);
    await waitFor(() => expect(rangee(SUR_CET_APPAREIL, "Gamma")).toBeTruthy(), { timeout: 2000 });

    act(() => autre.noterLesNoms(new Map([[E_ALPHA, "Alpha du soir"]])));
    await waitFor(() => expect(selecteur().textContent).toBe("Alpha du soir"), { timeout: 2000 });
    expect(rangee(SUR_CET_APPAREIL, "Alpha du soir")).toBeTruthy();

    expect(await autre.retirer(E_GAMMA)).toBe("retire");
    await waitFor(() => expect(rangeesDe(SUR_CET_APPAREIL)).toHaveLength(2), { timeout: 2000 });
    expect(screen.queryByText("Gamma")).toBeNull();
    autre.fermer();
  });
});

describe("clavier (F-032-AC29)", () => {
  it("F-032-AC29 ouvrir un espace du serveur au clavier seul, l'arrivée annoncée et le focus sur le sélecteur", async () => {
    await poserLAppareil();
    const onglet = lancerLOnglet({ serveur: serveurDesEspacesListes([GAMMA_SERVEUR]) });
    await ouvrirLEcranDesEspaces(TEMOIN_DE_L_APPAREIL);
    const ouvrir = await screen.findByRole("button", { name: "Ouvrir cet espace : Gamma" });

    act(() => ouvrir.focus());
    await onglet.utilisateur.keyboard("{Enter}");
    await waitFor(() => expect(ouvertMaintenant(onglet.pilote).cible).toEqual(ajoute(E_GAMMA)));
    await waitFor(() => expect(document.activeElement).toBe(selecteur()));
    expect(annonces(espaceOuvert("Gamma"))).toHaveLength(1);
  });
});
