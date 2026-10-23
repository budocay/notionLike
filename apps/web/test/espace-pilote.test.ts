// F-032 : pilote de l'onglet, hors de React. Lancement sur l'espace retenu (AC17), délai de
// F-002-AC24 tenu quand la base de l'appareil ne répond pas, changement d'espace sur une session et
// un `Y.Doc` neufs (AC10, AC14, AC15), espace retenu inscrit une fois la session prête et jamais
// pour un document refusé (AC17, AC35), aucune erreur non gérée (AC31).
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { ouvrirLeMagasinDeLAppareil } from "../src/espace/appareil.ts";
import {
  type CibleDeSession,
  type EtatDuPilote,
  piloterLOnglet,
  type PiloteDeLOnglet,
} from "../src/espace/espace-ouvert.ts";
import {
  BASE_DE_L_APPAREIL,
  baseDEspace,
  contenuDeLAppareil,
  E_ALPHA,
  E_APPAREIL,
  E_BETA,
  ECRITURE,
  LECTURE,
  poserDansLAppareil,
  poserUneBaseQuiPorte,
} from "./aides-appareil.ts";
import { demarrerSession, ecouteurs } from "./aides-facade.ts";
import { ecrireLaVersion, VERSION_NON_PRISE_EN_CHARGE } from "./aides-format.ts";
import { laisserIndexedDbTravailler, retenirLesOuvertures } from "./aides-persistance.ts";
import { ecouterLesErreursNonInterceptees, refuserLOuvertureDe } from "./aides-reprise.ts";

type SessionEspace = ReturnType<typeof demarrerSession>;
type Ouvert = Extract<EtatDuPilote, { phase: "ouvert" }>;

const ALPHA: CibleDeSession = { sorte: "ajoute", idEspace: E_ALPHA };
const BETA: CibleDeSession = { sorte: "ajoute", idEspace: E_BETA };
const APPAREIL: CibleDeSession = { sorte: "appareil" };

const fermetures: (() => void)[] = [];
afterEach(() => {
  fermetures.splice(0).forEach((fermer) => fermer());
});

interface Onglet {
  readonly pilote: PiloteDeLOnglet;
  /** Chaque session démarrée par le pilote, dans l'ordre, avec sa cible. */
  readonly demarrees: { readonly cible: CibleDeSession; readonly session: SessionEspace }[];
  readonly journal: string[];
}

function lancerLOnglet(): Onglet {
  const magasin = ouvrirLeMagasinDeLAppareil();
  const demarrees: Onglet["demarrees"] = [];
  const journal: string[] = [];
  const pilote = piloterLOnglet({
    magasin,
    demarrerSession: (cible) => {
      journal.push(`démarre ${cible.sorte === "appareil" ? "appareil" : cible.idEspace}`);
      const session = demarrerSession(cible);
      demarrees.push({ cible, session });
      return session;
    },
  });
  fermetures.push(() => {
    pilote.fermer();
    magasin.fermer();
  });
  return { pilote, demarrees, journal };
}

async function ouvert(pilote: PiloteDeLOnglet): Promise<Ouvert> {
  await waitFor(() => expect(pilote.lireEtat().phase).toBe("ouvert"));
  return pilote.lireEtat() as Ouvert;
}

async function prete(session: SessionEspace): Promise<void> {
  await waitFor(() => expect(session.lireEtat().phase).toBe("pret"));
}

/** Vrai : la façade de la session est fermée, son document ne porte plus d'écouteur. */
function fermee(session: SessionEspace): boolean {
  return session.doc !== undefined && ecouteurs(session.doc) === ecouteurs(new Y.Doc());
}

/** Un document d'espace d'une version de format que l'application ne prend pas en charge. */
async function poserUnEspaceDUneAutreVersion(idEspace: string): Promise<void> {
  const doc = new Y.Doc();
  ecrireLaVersion(doc, VERSION_NON_PRISE_EN_CHARGE);
  await poserUneBaseQuiPorte(baseDEspace(idEspace), Y.encodeStateAsUpdate(doc));
}

function changerVers(pilote: PiloteDeLOnglet, cible: CibleDeSession, journal: string[]): void {
  pilote.changer(cible, { avant: () => journal.push("avant"), nom: "Choisi" });
}

describe("lancement sur l'espace retenu (F-032-AC17)", () => {
  it("F-032-AC17 sans espace retenu, l'espace de l'appareil s'ouvre comme avant F-032, sans annonce", async () => {
    const { pilote, demarrees } = lancerLOnglet();

    expect(pilote.lireEtat().phase).toBe("chargement");
    const etat = await ouvert(pilote);

    expect(etat.cible).toEqual(APPAREIL);
    expect(etat.arrivee).toBeUndefined();
    expect(demarrees.map(({ cible }) => cible)).toEqual([APPAREIL]);
    expect(etat.session).toBe(demarrees[0]?.session);
  });

  it("F-032-AC17 l'espace retenu, inscrit au registre, s'ouvre : la session de l'espace de l'appareil démarrée en même temps est fermée", async () => {
    await poserDansLAppareil({
      "espace-local": E_APPAREIL,
      [`registre:${E_ALPHA}`]: LECTURE,
      "espace-retenu": E_ALPHA,
    });
    const { pilote, demarrees } = lancerLOnglet();

    const etat = await ouvert(pilote);

    expect(etat.cible).toEqual(ALPHA);
    expect(etat.droit).toBe("lecture");
    expect(demarrees.map(({ cible }) => cible)).toEqual([APPAREIL, ALPHA]);
    const [deLAppareil, alpha] = demarrees;
    expect(deLAppareil !== undefined && fermee(deLAppareil.session)).toBe(true);
    expect(etat.session).toBe(alpha?.session);
    await prete(etat.session);
    const lu = etat.session.lireEtat();
    expect(lu.phase === "pret" ? lu.idEspace : undefined).toBe(E_ALPHA);
  });

  it.each([
    ["désigne l'espace de l'appareil", { "espace-retenu": E_APPAREIL }],
    ["n'a pas la forme d'un UUID canonique", { "espace-retenu": "pas-un-uuid" }],
    ["est d'un autre type qu'une chaîne", { "espace-retenu": 42 }],
    ["désigne un espace sans entrée au registre", { "espace-retenu": E_BETA }],
    [
      "désigne un espace dont l'entrée a une autre forme",
      { "espace-retenu": E_BETA, [`registre:${E_BETA}`]: { rattachement: "adopte" } },
    ],
  ])(
    "F-032-AC17 une valeur retenue qui %s : l'espace de l'appareil s'ouvre, sans message bloquant",
    async (_cas, valeurs) => {
      await poserDansLAppareil({
        "espace-local": E_APPAREIL,
        [`registre:${E_ALPHA}`]: ECRITURE,
        ...valeurs,
      });
      const { pilote, demarrees } = lancerLOnglet();

      const etat = await ouvert(pilote);

      expect(etat.cible).toEqual(APPAREIL);
      expect(demarrees).toHaveLength(1);
      await prete(etat.session);
    },
  );

  it("F-032-AC17 F-032-AC31 base de l'appareil qui refuse toute ouverture : l'espace de l'appareil s'ouvre en mémoire, sans erreur non interceptée", async () => {
    const relever = ecouterLesErreursNonInterceptees();
    refuserLOuvertureDe(BASE_DE_L_APPAREIL);
    const { pilote } = lancerLOnglet();

    const etat = await ouvert(pilote);

    expect(etat.cible).toEqual(APPAREIL);
    await prete(etat.session);
    vi.restoreAllMocks();
    await laisserIndexedDbTravailler();
    expect(relever()).toEqual([]);
  });

  it("F-002-AC24 F-032-AC17 base de l'appareil sans réponse : chargement jusqu'à 9 999 ms, l'espace de l'appareil en mémoire à 10 000 ms", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(indexedDB, "open").mockImplementation(() => ({}) as IDBOpenDBRequest);
    const { pilote } = lancerLOnglet();

    vi.advanceTimersByTime(9999);
    expect(pilote.lireEtat().phase).toBe("chargement");

    vi.advanceTimersByTime(1);
    return vi.waitFor(() => {
      const etat = pilote.lireEtat();
      expect(etat.phase === "ouvert" ? etat.session.lireEtat().phase : etat.phase).toBe("pret");
    });
  });

  it("F-032-AC31 l'onglet fermé pendant le chargement : la session démarrée est fermée, rien n'est publié", async () => {
    const { pilote, demarrees } = lancerLOnglet();
    const publications: EtatDuPilote[] = [];
    pilote.abonner(() => publications.push(pilote.lireEtat()));

    pilote.fermer();
    await laisserIndexedDbTravailler();

    expect(publications).toEqual([]);
    expect(pilote.lireEtat().phase).toBe("chargement");
    const [deLAppareil] = demarrees;
    expect(deLAppareil !== undefined && fermee(deLAppareil.session)).toBe(true);
  });
});

describe("changement d'espace (F-032-AC10, AC14, AC15)", () => {
  it("F-032-AC10 F-032-AC14 F-032-AC15 tout ce que l'espace quitté tient est fermé avant l'ouverture de l'espace choisi, sur une session et un `Y.Doc` neufs, à une génération nouvelle", async () => {
    await poserDansLAppareil({
      "espace-local": E_APPAREIL,
      [`registre:${E_ALPHA}`]: ECRITURE,
      [`registre:${E_BETA}`]: LECTURE,
    });
    const { pilote, demarrees, journal } = lancerLOnglet();
    const depart = await ouvert(pilote);
    await prete(depart.session);
    journal.splice(0);

    changerVers(pilote, ALPHA, journal);
    const versAlpha = pilote.lireEtat() as Ouvert;
    changerVers(pilote, BETA, journal);
    const versBeta = pilote.lireEtat() as Ouvert;
    changerVers(pilote, ALPHA, journal);
    const retour = pilote.lireEtat() as Ouvert;

    expect(journal).toEqual([
      "avant",
      `démarre ${E_ALPHA}`,
      "avant",
      `démarre ${E_BETA}`,
      "avant",
      `démarre ${E_ALPHA}`,
    ]);
    expect([versAlpha.generation, versBeta.generation, retour.generation]).toEqual([
      depart.generation + 1,
      depart.generation + 2,
      depart.generation + 3,
    ]);
    expect([versAlpha.droit, versBeta.droit, retour.droit]).toEqual([
      "ecriture",
      "lecture",
      "ecriture",
    ]);
    expect(retour.arrivee).toBe("Choisi");
    const documents = [depart, versAlpha, versBeta, retour].map(({ session }) => session.doc);
    expect(new Set(documents).size).toBe(4);
    expect(demarrees.slice(0, -1).every(({ session }) => fermee(session))).toBe(true);
    await prete(retour.session);
    const lu = retour.session.lireEtat();
    expect(lu.phase === "pret" ? lu.idEspace : undefined).toBe(E_ALPHA);
  });

  it("F-032-AC10 un changement vers l'espace déjà ouvert, ou pendant le chargement, est sans effet", async () => {
    const { pilote, journal } = lancerLOnglet();
    changerVers(pilote, ALPHA, journal);
    expect(pilote.lireEtat().phase).toBe("chargement");

    const etat = await ouvert(pilote);
    changerVers(pilote, APPAREIL, journal);

    expect(pilote.lireEtat()).toBe(etat);
    expect(journal).toEqual(["démarre appareil"]);
  });

  it("F-032-AC31 une fermeture de l'interface qui lève n'empêche pas le changement", async () => {
    await poserDansLAppareil({ "espace-local": E_APPAREIL, [`registre:${E_ALPHA}`]: ECRITURE });
    const signalement = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { pilote } = lancerLOnglet();
    await ouvert(pilote);

    pilote.changer(ALPHA, {
      avant: () => {
        throw new Error("fermeture en échec");
      },
      nom: "Alpha",
    });

    const etat = pilote.lireEtat() as Ouvert;
    expect(etat.cible).toEqual(ALPHA);
    expect(signalement).toHaveBeenCalledTimes(1);
  });
});

describe("espace retenu inscrit au changement (F-032-AC17, AC35)", () => {
  it("F-032-AC17 l'espace choisi n'est inscrit comme espace retenu qu'une fois sa session prête", async () => {
    await poserDansLAppareil({ "espace-local": E_APPAREIL, [`registre:${E_ALPHA}`]: ECRITURE });
    const { pilote, journal } = lancerLOnglet();
    await prete((await ouvert(pilote)).session);
    const ouvertures = retenirLesOuvertures();

    changerVers(pilote, ALPHA, journal);
    const etat = pilote.lireEtat() as Ouvert;
    await new Promise((resoudre) => setTimeout(resoudre, 50));

    expect(etat.session.lireEtat().phase).toBe("chargement");
    ouvertures.cesser();
    expect((await contenuDeLAppareil())["espace-retenu"]).toBeUndefined();

    ouvertures.repondre();
    await prete(etat.session);
    await waitFor(async () => expect((await contenuDeLAppareil())["espace-retenu"]).toBe(E_ALPHA));
  });

  it("F-032-AC17 R1 l'espace de l'appareil choisi après un autre espace retire la clé `espace-retenu`, et le lancement suivant ouvre l'espace de l'appareil", async () => {
    await poserDansLAppareil({
      "espace-local": E_APPAREIL,
      [`registre:${E_ALPHA}`]: ECRITURE,
      "espace-retenu": E_ALPHA,
    });
    const premier = lancerLOnglet();
    expect((await ouvert(premier.pilote)).cible).toEqual(ALPHA);

    changerVers(premier.pilote, APPAREIL, premier.journal);
    await prete((premier.pilote.lireEtat() as Ouvert).session);
    await waitFor(async () =>
      expect(Object.keys(await contenuDeLAppareil())).not.toContain("espace-retenu"),
    );
    premier.pilote.fermer();

    const suivant = lancerLOnglet();
    expect((await ouvert(suivant.pilote)).cible).toEqual(APPAREIL);
  });

  it("F-032-AC17 F-032-AC35 un espace dont le document est refusé pour sa version n'est jamais inscrit : l'espace retenu reste celui d'avant, et le lancement suivant ouvre l'espace de l'appareil", async () => {
    await poserDansLAppareil({ "espace-local": E_APPAREIL, [`registre:${E_ALPHA}`]: ECRITURE });
    await poserUnEspaceDUneAutreVersion(E_ALPHA);
    const premier = lancerLOnglet();
    await prete((await ouvert(premier.pilote)).session);

    changerVers(premier.pilote, ALPHA, premier.journal);
    const etat = premier.pilote.lireEtat() as Ouvert;
    await waitFor(() => expect(etat.session.lireEtat().phase).toBe("version-non-prise-en-charge"));
    await laisserIndexedDbTravailler();

    expect(Object.keys(await contenuDeLAppareil())).not.toContain("espace-retenu");
    premier.pilote.fermer();
    const suivant = lancerLOnglet();
    expect((await ouvert(suivant.pilote)).cible).toEqual(APPAREIL);
  });

  it("F-032-AC35 l'espace retenu refusé pour sa version s'ouvre bloqué ; le changement vers l'espace de l'appareil retire la clé `espace-retenu`, et le lancement suivant ouvre encore l'espace de l'appareil", async () => {
    await poserDansLAppareil({
      "espace-local": E_APPAREIL,
      [`registre:${E_ALPHA}`]: ECRITURE,
      "espace-retenu": E_ALPHA,
    });
    await poserUnEspaceDUneAutreVersion(E_ALPHA);
    const premier = lancerLOnglet();
    const bloque = await ouvert(premier.pilote);
    expect(bloque.cible).toEqual(ALPHA);
    await waitFor(() =>
      expect(bloque.session.lireEtat().phase).toBe("version-non-prise-en-charge"),
    );

    changerVers(premier.pilote, APPAREIL, premier.journal);
    await prete((premier.pilote.lireEtat() as Ouvert).session);
    await waitFor(async () =>
      expect(Object.keys(await contenuDeLAppareil())).not.toContain("espace-retenu"),
    );
    premier.pilote.fermer();

    const suivant = lancerLOnglet();
    expect((await ouvert(suivant.pilote)).cible).toEqual(APPAREIL);
  });

  it("F-032-AC17 F-032-AC31 l'inscription de l'espace retenu échoue : le changement a lieu quand même dans l'onglet, sans erreur non interceptée, et le lancement suivant ouvre l'espace retenu d'avant", async () => {
    await poserDansLAppareil({
      "espace-local": E_APPAREIL,
      [`registre:${E_ALPHA}`]: ECRITURE,
      [`registre:${E_BETA}`]: ECRITURE,
      "espace-retenu": E_BETA,
    });
    const relever = ecouterLesErreursNonInterceptees();
    const premier = lancerLOnglet();
    await prete((await ouvert(premier.pilote)).session);
    refuserLOuvertureDe(BASE_DE_L_APPAREIL);

    changerVers(premier.pilote, ALPHA, premier.journal);
    const etat = premier.pilote.lireEtat() as Ouvert;
    await prete(etat.session);
    await laisserIndexedDbTravailler();

    expect(etat.cible).toEqual(ALPHA);
    vi.restoreAllMocks();
    expect((await contenuDeLAppareil())["espace-retenu"]).toBe(E_BETA);
    expect(relever()).toEqual([]);
    premier.pilote.fermer();
    const suivant = lancerLOnglet();
    expect((await ouvert(suivant.pilote)).cible).toEqual(BETA);
  });
});
