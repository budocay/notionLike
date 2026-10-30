// F-036 (D-040, F-032-AC32) : la session d'un espace ajouté garde ce que la session de l'appareil
// tient de F-002 et de F-030, « vrai pour un espace ouvert par changement ». Chaque scénario est
// joué pour les deux sortes de cible, sur la même base (`notionlike:espace:<id>`), et leurs
// observations sont comparées : délai de 10 secondes et échec (AC1), reprise (AC2), version non
// prise en charge (AC3), un seul chemin vers la persistance de l'espace ajouté (AC4).
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import type { CibleDeSession } from "../src/espace/espace-ouvert.ts";
import { lireDossier } from "./aides-disque.ts";
import { baseDEspace, E_ALPHA, poserDansLAppareil } from "./aides-appareil.ts";
import { demarrerSession, ecouteurs } from "./aides-facade.ts";
import { ecrireUneEntreeDePage } from "./aides-format.ts";
import { poserUnEspace, poserUnEspaceDUneAutreVersion } from "./aides-onglet.tsx";
import {
  enregistrements,
  laisserIndexedDbTravailler,
  refuserLesOuverturesParUneErreur,
  refuserLesOuverturesParUneException,
  retenirLesOuvertures,
} from "./aides-persistance.ts";
import { instantsDesOuvertures, simulerLHorloge } from "./aides-reprise.ts";

const ECHEANCE_MS = 10_000;
const BASE = baseDEspace(E_ALPHA);
const ENREGISTREMENT_VIDE = [0, 0];
// Types dérivés de la façade de test : le test ne lit pas l'état de la session par import direct
// (F-030-AC19, liste des lecteurs de `reprise-coutures.test.tsx`).
type SessionEspace = ReturnType<typeof demarrerSession>;
type EtatPret = Extract<ReturnType<SessionEspace["lireEtat"]>, { readonly phase: "pret" }>;

const CIBLES: readonly [string, CibleDeSession][] = [
  ["appareil", { sorte: "appareil" }],
  ["ajouté", { sorte: "ajoute", idEspace: E_ALPHA }],
];

// L'espace de l'appareil est nommé par la base de l'appareil : il est posé sur le même identifiant
// que l'espace ajouté, pour que les deux sortes de cible ouvrent les mêmes enregistrements.
async function poserLEspace(titres: readonly string[]): Promise<void> {
  await poserDansLAppareil({ "espace-local": E_ALPHA });
  await poserUnEspace(E_ALPHA, titres);
}

interface Observation {
  readonly phase: string;
  readonly enregistre: boolean | undefined;
  readonly baseRelue: boolean | undefined;
  readonly titres: readonly string[] | undefined;
}

function observer(session: SessionEspace): Observation {
  const etat = session.lireEtat();
  const pret = etat.phase === "pret" ? etat : undefined;
  return {
    phase: etat.phase,
    enregistre: pret?.enregistre,
    baseRelue: pret?.baseRelue,
    titres: pret?.arborescence.racines.map((page) => page.titre),
  };
}

function pret(session: SessionEspace): EtatPret {
  const etat = session.lireEtat();
  if (etat.phase !== "pret") {
    throw new Error(`Session non prête : ${etat.phase}.`);
  }
  return etat;
}

/** Joue le scénario pour chaque cible, avec une base et une horloge neuves, et rend les résultats. */
async function pourChaqueCible<T>(
  preparer: () => Promise<void>,
  jouer: (cible: CibleDeSession) => Promise<T>,
): Promise<readonly [T, T]> {
  const resultats: T[] = [];
  for (const [, cible] of CIBLES) {
    await preparer();
    resultats.push(await jouer(cible));
    vi.useRealTimers();
    vi.restoreAllMocks();
  }
  return [resultats[0] as T, resultats[1] as T];
}

describe("délai de 10 secondes et échec de la persistance (F-036-AC1)", () => {
  it("F-036-AC1 F-002-AC24 F-002-AC3 relecture sans réponse : chargement à 9 999 ms, modifiable en mémoire et non enregistré à 10 000 ms ; la réponse tardive n'applique ni n'écrit rien ; même état observable pour l'espace de l'appareil et l'espace ajouté", async () => {
    const [appareil, ajoute] = await pourChaqueCible(
      () => poserLEspace(["Enregistrée avant"]),
      async (cible) => {
        const avant = await enregistrements(BASE);
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        const ouvertures = retenirLesOuvertures(cible.sorte === "appareil" ? 2 : 1);
        const session = demarrerSession(cible);

        vi.advanceTimersByTime(ECHEANCE_MS - 1);
        const avantLEcheance = observer(session);
        vi.advanceTimersByTime(1);
        const alEcheance = observer(session);
        pret(session).operations.creerPage("Tenue en mémoire");
        const apresSaisie = observer(session);

        vi.useRealTimers();
        ouvertures.repondre();
        await laisserIndexedDbTravailler();
        ouvertures.cesser();
        const apresLaReponse = observer(session);
        const enregistrementsApres = await enregistrements(BASE);
        session.fermer();
        return {
          avantLEcheance,
          alEcheance,
          apresSaisie,
          apresLaReponse,
          avant,
          enregistrementsApres,
        };
      },
    );

    expect(ajoute).toEqual(appareil);
    expect(ajoute.avantLEcheance.phase).toBe("chargement");
    expect(ajoute.alEcheance).toEqual({
      phase: "pret",
      enregistre: false,
      baseRelue: false,
      titres: [],
    });
    expect(ajoute.apresSaisie.titres).toEqual(["Tenue en mémoire"]);
    expect(ajoute.apresLaReponse).toEqual({ ...ajoute.apresSaisie });
    expect(ajoute.apresLaReponse.enregistre).toBe(false);
    expect(ajoute.enregistrementsApres).toEqual(ajoute.avant);
  });

  it.each([
    ["une exception à l'ouverture", refuserLesOuverturesParUneException],
    ["une erreur de la demande d'ouverture", refuserLesOuverturesParUneErreur],
  ])(
    "F-036-AC1 F-002-AC16 base refusée par %s : fin du chargement, modifiable en mémoire, modifications signalées non enregistrées, comme pour l'espace de l'appareil",
    async (_cas, refuser) => {
      const [appareil, ajoute] = await pourChaqueCible(
        () => poserLEspace(["Enregistrée avant"]),
        async (cible) => {
          refuser();
          const session = demarrerSession(cible);
          await laisserIndexedDbTravailler();
          const alOuverture = observer(session);
          pret(session).operations.creerPage("Malgré le refus");
          const apres = observer(session);
          session.fermer();
          return { alOuverture, apres };
        },
      );

      expect(ajoute).toEqual(appareil);
      expect(ajoute.alOuverture).toMatchObject({ phase: "pret", enregistre: false });
      expect(ajoute.apres.titres).toEqual(["Malgré le refus"]);
      expect(ajoute.apres.enregistre).toBe(false);
    },
  );

  it("F-036-AC1 F-002-AC16 lecture en échec : la session sort du chargement, modifiable et non enregistrée, comme pour l'espace de l'appareil ; rien n'est écrit dans la base", async () => {
    const [appareil, ajoute] = await pourChaqueCible(
      () => poserLEspace(["Enregistrée avant"]),
      async (cible) => {
        const avant = await enregistrements(BASE);
        const ajouter = IDBObjectStore.prototype.add;
        vi.spyOn(IDBObjectStore.prototype, "getAll").mockImplementation(function (
          this: IDBObjectStore,
        ) {
          return ajouter.call(this, new Uint8Array(), 1) as unknown as IDBRequest<unknown[]>;
        });
        const session = demarrerSession(cible);
        await laisserIndexedDbTravailler();
        const alOuverture = observer(session);
        pret(session).operations.creerPage("Malgré l'échec");
        const apres = observer(session);
        await laisserIndexedDbTravailler();
        vi.restoreAllMocks();
        const enregistrementsApres = await enregistrements(BASE);
        session.fermer();
        return { alOuverture, apres, avant, enregistrementsApres };
      },
    );

    expect(ajoute).toEqual(appareil);
    expect(ajoute.alOuverture).toMatchObject({
      phase: "pret",
      enregistre: false,
      baseRelue: false,
    });
    expect(ajoute.apres.titres).toEqual(["Malgré l'échec"]);
    expect(ajoute.enregistrementsApres).toEqual(ajoute.avant);
  });

  it("F-036-AC1 F-002-AC16 écriture en échec : la modification est gardée en mémoire et signalée non enregistrée, comme pour l'espace de l'appareil", async () => {
    const [appareil, ajoute] = await pourChaqueCible(
      () => poserLEspace(["Enregistrée avant"]),
      async (cible) => {
        const ajouter = IDBObjectStore.prototype.add;
        vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (
          this: IDBObjectStore,
          valeur: unknown,
        ) {
          return ajouter.call(this, valeur, 1);
        });
        const session = demarrerSession(cible);
        await laisserIndexedDbTravailler();
        pret(session).operations.creerPage("Non écrite");
        await laisserIndexedDbTravailler();
        const apres = observer(session);
        session.fermer();
        return apres;
      },
    );

    expect(ajoute).toEqual(appareil);
    expect(ajoute).toMatchObject({ phase: "pret", enregistre: false });
    expect(ajoute.titres).toContain("Non écrite");
  });
});

describe("reprise après une coupure (F-036-AC2)", () => {
  it("F-036-AC2 F-030-AC1 refus répétés : tentatives à 2, 4, 8, 16, 32, 60 puis 60 secondes de la fin de la précédente, mêmes instants que pour l'espace de l'appareil", async () => {
    const [appareil, ajoute] = await pourChaqueCible(
      () => poserLEspace([]),
      async (cible) => {
        simulerLHorloge();
        vi.setSystemTime(0);
        refuserLesOuverturesParUneException();
        const instants = instantsDesOuvertures();
        const session = demarrerSession(cible);
        vi.advanceTimersByTime(302_000);
        await laisserIndexedDbTravailler();
        const alAbandon = observer(session);
        session.fermer();
        return { instants: [...instants], alAbandon };
      },
    );

    expect(ajoute).toEqual(appareil);
    expect(ajoute.instants).toEqual([
      0, 2_000, 6_000, 14_000, 30_000, 62_000, 122_000, 182_000, 242_000, 302_000,
    ]);
    expect(ajoute.alAbandon).toMatchObject({ phase: "pret", enregistre: false });
  });

  it("F-036-AC2 F-030-AC7 F-030-AC1 tentatives sans réponse : abandonnées à 10 secondes, l'attente comptée de la fin de la précédente, jamais deux tentatives ensemble, mêmes instants que pour l'espace de l'appareil", async () => {
    const [appareil, ajoute] = await pourChaqueCible(
      () => poserLEspace([]),
      async (cible) => {
        simulerLHorloge();
        vi.setSystemTime(0);
        vi.spyOn(indexedDB, "open").mockImplementation(() => ({}) as IDBOpenDBRequest);
        const instants = instantsDesOuvertures();
        const session = demarrerSession(cible);
        vi.advanceTimersByTime(ECHEANCE_MS - 1);
        const avantLEcheance = observer(session).phase;
        vi.advanceTimersByTime(1 + 60_000);
        const resultat = { instants: [...instants], avantLEcheance };
        session.fermer();
        return resultat;
      },
    );

    expect(ajoute).toEqual(appareil);
    // 10 s d'ouverture, 2 s d'attente, 10 s de tentative, 4 s d'attente, 10 s, 8 s, 10 s, 16 s.
    expect(ajoute.instants).toEqual([0, 12_000, 26_000, 44_000, 70_000]);
    expect(ajoute.avantLEcheance).toBe("chargement");
  });

  it("F-036-AC2 F-030-AC2 `reessayer` de la session lance aussitôt une tentative, sans effet moins d'une seconde après la précédente, sans remettre la cadence à 2 secondes ; mêmes instants que pour l'espace de l'appareil", async () => {
    const [appareil, ajoute] = await pourChaqueCible(
      () => poserLEspace([]),
      async (cible) => {
        simulerLHorloge();
        vi.setSystemTime(0);
        refuserLesOuverturesParUneException();
        const instants = instantsDesOuvertures();
        const session = demarrerSession(cible);
        vi.advanceTimersByTime(6_000);
        vi.advanceTimersByTime(1_500);
        pret(session).reessayer();
        const apresLaDemande = [...instants];
        pret(session).reessayer();
        const apresLaSeconde = [...instants];
        vi.advanceTimersByTime(15_999);
        const avantLaCadence = [...instants];
        vi.advanceTimersByTime(1);
        const resultat = {
          apresLaDemande,
          apresLaSeconde,
          avantLaCadence,
          instants: [...instants],
        };
        session.fermer();
        return resultat;
      },
    );

    expect(ajoute).toEqual(appareil);
    expect(ajoute.apresLaDemande).toEqual([0, 2_000, 6_000, 7_500]);
    expect(ajoute.apresLaSeconde).toEqual([0, 2_000, 6_000, 7_500]);
    expect(ajoute.avantLaCadence).toEqual([0, 2_000, 6_000, 7_500]);
    expect(ajoute.instants).toEqual([0, 2_000, 6_000, 7_500, 23_500]);
  });
});

describe("version de format non prise en charge (F-036-AC3)", () => {
  it("F-036-AC3 F-002-AC17 F-030-AC10 écran bloquant, persistance fermée dès le refus, enregistrements identiques à ceux d'avant l'ouverture hors l'enregistrement vide de deux octets, comme pour l'espace de l'appareil", async () => {
    const [appareil, ajoute] = await pourChaqueCible(
      async () => {
        await poserDansLAppareil({ "espace-local": E_ALPHA });
        await poserUnEspaceDUneAutreVersion(E_ALPHA);
      },
      async (cible) => {
        const avant = await enregistrements(BASE);
        const session = demarrerSession(cible);
        await vi.waitFor(() =>
          expect(session.lireEtat().phase).toBe("version-non-prise-en-charge"),
        );
        await laisserIndexedDbTravailler();
        const apres = await enregistrements(BASE);
        const doc = session.doc as Y.Doc;
        const ecouteursApres = ecouteurs(doc);
        // La persistance est fermée dès le refus : ce que le document reçoit ensuite n'atteint plus
        // la base.
        ecrireUneEntreeDePage(doc, "ecrite-apres-le-blocage");
        await laisserIndexedDbTravailler();
        const apresUneEcriture = await enregistrements(BASE);
        const phase = session.lireEtat().phase;
        session.fermer();
        return { avant, apres, ecouteursApres, apresUneEcriture, phase };
      },
    );

    expect(ajoute.phase).toBe("version-non-prise-en-charge");
    expect(ajoute.phase).toBe(appareil.phase);
    expect(ajoute.ecouteursApres).toBe(appareil.ecouteursApres);
    expect(ajoute.apres.slice(0, ajoute.avant.length)).toEqual(ajoute.avant);
    for (const supplementaire of ajoute.apres.slice(ajoute.avant.length)) {
      expect(supplementaire).toEqual(ENREGISTREMENT_VIDE);
    }
    expect(ajoute.apresUneEcriture).toEqual(ajoute.apres);
    expect(appareil.apresUneEcriture).toEqual(appareil.apres);
  });
});

describe("un seul chemin vers la persistance de l'espace ajouté (F-036-AC4)", () => {
  it("F-036-AC4 F-036-AC10 `ouvrirEspaceInscrit(` n'est appelée, dans src/, que par la session d'espace (hors sa définition) : délai, échec et reprise d'AC1 à AC3 restent ceux de la session", () => {
    const appelants = [...lireDossier("src")]
      .filter(([chemin, texte]) => {
        return (
          chemin !== "src/persistance/espace-local.ts" && /\bouvrirEspaceInscrit\(/.test(texte)
        );
      })
      .map(([chemin]) => chemin)
      .sort();

    expect(appelants).toEqual(["src/espace/session-espace.ts"]);
  });
});
