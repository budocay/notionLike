// F-036 (D-040, F-032-AC32) : la session d'un espace ajouté garde ce que la session de l'appareil
// tient de F-002 et de F-030, « vrai pour un espace ouvert par changement ». Chaque scénario est
// joué pour les deux sortes de cible, sur la même base (`notionlike:espace:<id>`), et leurs
// observations sont comparées : délai de 10 secondes et échec (AC1), reprise (AC2), version non
// prise en charge (AC3), un seul chemin vers la persistance de l'espace ajouté (AC4).
import { screen } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import type { CibleDeSession } from "../src/espace/espace-ouvert.ts";
import { TITRE_VERSION_NON_PRISE_EN_CHARGE } from "../src/interface/messages.ts";
import { lireDossier } from "./aides-disque.ts";
import {
  baseDEspace,
  E_ALPHA,
  E_APPAREIL,
  ECRITURE,
  poserDansLAppareil,
} from "./aides-appareil.ts";
import { demarrerSession, ecouteurs } from "./aides-facade.ts";
import { ecrireUneEntreeDePage } from "./aides-format.ts";
import {
  ajoute,
  lancerLOnglet,
  ouvertMaintenant,
  poserUnEspace,
  poserUnEspaceDUneAutreVersion,
} from "./aides-onglet.tsx";
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

// Les octets d'un enregistrement portent l'identifiant du client Yjs, tiré au hasard à chaque
// document posé : deux passes se comparent par le compte et par ce que chacune a laissé inchangé.
function memesEnregistrements(a: readonly number[][], b: readonly number[][]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Joue le scénario pour chaque cible et rend les résultats. Chaque passe part d'un appareil neuf :
 * une usine de bases neuve (rien de la passe précédente, pas même l'enregistrement vide de deux
 * octets), `preparer`, puis les remises à zéro de l'horloge et des doublures, même si le scénario
 * échoue.
 */
async function pourChaqueCible<T>(
  preparer: () => Promise<void>,
  jouer: (cible: CibleDeSession) => Promise<T>,
): Promise<readonly [T, T]> {
  const resultats: T[] = [];
  for (const [, cible] of CIBLES) {
    try {
      vi.stubGlobal("indexedDB", new IDBFactory());
      await preparer();
      resultats.push(await jouer(cible));
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
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
        // La session de l'appareil ouvre d'abord la base de l'appareil, que la passe laisse aboutir :
        // dans les deux passes, la première ouverture retenue est celle de la base de l'espace.
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
          nombreAvant: avant.length,
          nombreApres: enregistrementsApres.length,
          inchanges: memesEnregistrements(enregistrementsApres, avant),
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
    expect(ajoute.inchanges).toBe(true);
    expect(ajoute.nombreAvant).toBeGreaterThan(0);
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
        // Une demande de lecture qui échoue, fabriquée : son `onerror` est appelé comme le fait
        // IndexedDB, sans dépendre du mode de la transaction.
        vi.spyOn(IDBObjectStore.prototype, "getAll").mockImplementation(() => {
          const demande = {
            onsuccess: null,
            onerror: null as ((evenement: Event) => void) | null,
            result: undefined,
            error: new DOMException("lecture", "UnknownError"),
          };
          setImmediate(() => demande.onerror?.(new Event("error", { cancelable: true })));
          return demande as unknown as IDBRequest<unknown[]>;
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
        return {
          alOuverture,
          apres,
          nombreAvant: avant.length,
          nombreApres: enregistrementsApres.length,
          inchanges: memesEnregistrements(enregistrementsApres, avant),
        };
      },
    );

    expect(ajoute).toEqual(appareil);
    expect(ajoute.alOuverture).toMatchObject({
      phase: "pret",
      enregistre: false,
      baseRelue: false,
    });
    expect(ajoute.apres.titres).toEqual(["Malgré l'échec"]);
    expect(ajoute.inchanges).toBe(true);
    expect(ajoute.nombreAvant).toBeGreaterThan(0);
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
        const apresLesRefus = observer(session);
        session.fermer();
        return { instants: [...instants], apresLesRefus };
      },
    );

    expect(ajoute).toEqual(appareil);
    expect(ajoute.instants).toEqual([
      0, 2_000, 6_000, 14_000, 30_000, 62_000, 122_000, 182_000, 242_000, 302_000,
    ]);
    expect(ajoute.apresLesRefus).toMatchObject({ phase: "pret", enregistre: false });
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

    // Les deux passes partent du même état, et chacune ajoute au plus l'enregistrement vide.
    expect(ajoute.avant.length).toBe(appareil.avant.length);
    expect(ajoute.avant.length).toBeGreaterThan(0);
    expect(ajoute.apres.length - ajoute.avant.length).toBeLessThanOrEqual(1);
    expect(appareil.apres.length - appareil.avant.length).toBeLessThanOrEqual(1);
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

describe("écran bloquant d'un espace ajouté de version non prise en charge (F-036-AC3)", () => {
  it("F-036-AC3 F-002-AC17 rendu réel : l'espace retenu est un espace ajouté d'une version refusée, l'écran bloquant « Mise à jour nécessaire » s'affiche, comme pour l'espace de l'appareil", async () => {
    await poserUnEspaceDUneAutreVersion(E_ALPHA);
    await poserUnEspace(E_APPAREIL, ["Témoin de l'appareil"]);
    await poserDansLAppareil({
      "espace-local": E_APPAREIL,
      "espace-retenu": E_ALPHA,
      [`registre:${E_ALPHA}`]: ECRITURE,
      [`nom:${E_ALPHA}`]: "Alpha",
    });

    const onglet = lancerLOnglet();

    const titre = await screen.findByRole("heading", {
      level: 1,
      name: TITRE_VERSION_NON_PRISE_EN_CHARGE,
    });
    expect(titre).toBeDefined();
    expect(ouvertMaintenant(onglet.pilote).cible).toEqual(ajoute(E_ALPHA));
  });
});

const DEFINITION_DE_LA_PERSISTANCE = "src/persistance/espace-local.ts";
const SESSION = "src/espace/session-espace.ts";
const BARIL = "src/persistance/index.ts";

/**
 * Les fichiers de `src/` qui importent, renomment, ré-exportent ou importent dynamiquement
 * `ouvrirEspaceInscrit` (ou un espace de noms de son module ou du baril de la persistance), hors de
 * sa définition : un appel sous un autre nom ou par référence n'y échappe pas.
 */
function importeursDeLOuverture(sources: ReadonlyMap<string, string>): string[] {
  const module = String.raw`[^"']*(?:espace-local(?:\.ts)?|persistance(?:/index(?:\.ts)?)?)`;
  const statique = new RegExp(
    String.raw`(?:import|export)\s+(?:type\s+)?([^;]*?)\s+from\s+["']${module}["']`,
    "g",
  );
  const dynamique = new RegExp(String.raw`import\(\s*["']${module}["']\s*\)`);
  return [...sources]
    .filter(([chemin]) => chemin !== DEFINITION_DE_LA_PERSISTANCE)
    .filter(
      ([, texte]) =>
        dynamique.test(texte) ||
        [...texte.matchAll(statique)].some(
          ([, clause = ""]) =>
            /\bouvrirEspaceInscrit\b/.test(clause) || /^\*\s*(?:as\b|$)/.test(clause.trim()),
        ),
    )
    .map(([chemin]) => chemin)
    .sort();
}

function appelantsDeLOuverture(sources: ReadonlyMap<string, string>): string[] {
  return [...sources]
    .filter(
      ([chemin, texte]) =>
        chemin !== DEFINITION_DE_LA_PERSISTANCE && /(?<![\w#])ouvrirEspaceInscrit\(/.test(texte),
    )
    .map(([chemin]) => chemin)
    .sort();
}

describe("un seul chemin vers la persistance de l'espace ajouté (F-036-AC4)", () => {
  it("F-036-AC4 F-036-AC10 `ouvrirEspaceInscrit` n'est appelée, dans src/, que par la session d'espace ; seuls la session et le baril de la persistance l'importent, sous quelque nom que ce soit : délai, échec et reprise d'AC1 à AC3 restent ceux de la session", () => {
    const sources = lireDossier("src");

    expect(appelantsDeLOuverture(sources)).toEqual([SESSION]);
    expect(importeursDeLOuverture(sources)).toEqual([SESSION, BARIL]);
  });

  it("F-036-AC4 F-036-AC10 la détection voit un appel direct, un import renommé, d'espace de noms, dynamique et un ré-export, et pas un fichier sans rapport", () => {
    const fautifs = new Map([
      [
        "src/a.ts",
        'import { ouvrirEspaceInscrit } from "../persistance/index.ts";\nouvrirEspaceInscrit(d, i);',
      ],
      [
        "src/b.ts",
        'import { ouvrirEspaceInscrit as ouvrir } from "../persistance/espace-local.ts";',
      ],
      ["src/c.ts", 'import * as p from "../persistance/index.ts";\np.ouvrirEspaceInscrit(d, i);'],
      ["src/d.ts", 'const p = await import("../persistance");'],
      ["src/e.ts", 'export {\n  ouvrirEspaceInscrit,\n} from "./espace-local.ts";'],
    ]);
    const sans = new Map([
      ["src/f.ts", 'import { ouvrirEspaceLocal } from "../persistance/index.ts";'],
      ["src/g.ts", 'import { ouvrirEspaceInscrit } from "./ailleurs.ts";'],
    ]);
    expect(importeursDeLOuverture(fautifs)).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
      "src/d.ts",
      "src/e.ts",
    ]);
    expect(appelantsDeLOuverture(fautifs)).toEqual(["src/a.ts", "src/c.ts"]);
    expect(importeursDeLOuverture(sans)).toEqual([]);
    expect(appelantsDeLOuverture(sans)).toEqual([]);
  });
});
