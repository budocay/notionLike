// F-030 : aucune erreur non interceptée du fait d'une tentative, d'un abandon, d'une reprise ou
// d'une fermeture (AC18), et abonnés d'une persistance appelés sous garde (AC25).
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  ouvrirEspaceLocal,
  ouvrirPersistance,
  type Persistance,
} from "../src/persistance/index.ts";
import { ouvrirFacade } from "./aides-facade.ts";
import {
  attendreEtat,
  ESPACE_A,
  ESPACE_B,
  fermerDeForce,
  laisserIndexedDbTravailler,
  refuserLesOuverturesParUneErreur,
  refuserLesOuverturesParUneException,
  suivreLesConnexionsTenues,
} from "./aides-persistance.ts";
import {
  annulerLesProchainsAjouts,
  ecouterLesErreursNonInterceptees,
  instancesAyantRelu,
  instantsDesOuvertures,
  intercepterLesLecturesBrutes,
  simulerLHorloge,
} from "./aides-reprise.ts";

const ESPACE = { type: "espace", idEspace: ESPACE_A } as const;
const TOUJOURS = Number.POSITIVE_INFINITY;
const CLE_DEJA_PRISE = 1;

let cesserLEcoute: (() => unknown[]) | undefined;

afterEach(() => {
  cesserLEcoute?.();
  cesserLEcoute = undefined;
});

function ecouter(): () => unknown[] {
  cesserLEcoute = ecouterLesErreursNonInterceptees();
  return cesserLEcoute;
}

/** Les lectures que la bibliothèque fait du magasin échouent : leur transaction est annulée. */
function faireEchouerLesLecturesDeLaBibliotheque(): void {
  const toutLire = IDBObjectStore.prototype.getAll;
  vi.spyOn(IDBObjectStore.prototype, "getAll").mockImplementation(function (
    this: IDBObjectStore,
    ...bornes: unknown[]
  ) {
    const demande = toutLire.apply(this, bornes as Parameters<typeof toutLire>);
    if (bornes.length > 0) {
      this.transaction.abort();
    }
    return demande;
  });
}

/** Une vraie erreur de contrainte à chaque ajout : la demande échoue, la transaction est annulée. */
function refuserLesAjoutsParUneContrainte(): void {
  const ajouter = IDBObjectStore.prototype.add;
  vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (
    this: IDBObjectStore,
    valeur: unknown,
  ) {
    ajouter.call(this, valeur, CLE_DEJA_PRISE);
    return ajouter.call(this, valeur, CLE_DEJA_PRISE);
  });
}

type Ouvrir = (doc: Y.Doc) => Persistance;
const ouvrirLeDocument: Ouvrir = (doc) => ouvrirPersistance(doc, ESPACE);
const ouvrirLEspaceLocal: Ouvrir = (doc) => ouvrirEspaceLocal(doc, ESPACE_B);

// La globale absente ne s'espionne pas : chaque tentative la lit une fois pour demander
// l'ouverture, et c'est cette lecture qui est comptée.
let lecturesDeLaGlobaleAbsente = 0;

function retirerIndexedDb(): void {
  // Inscrit la globale d'origine auprès de Vitest, qui la rend après le test.
  vi.stubGlobal("indexedDB", undefined);
  lecturesDeLaGlobaleAbsente = 0;
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    get: () => {
      lecturesDeLaGlobaleAbsente += 1;
      return undefined;
    },
    set: (valeur: unknown) => {
      Object.defineProperty(globalThis, "indexedDB", {
        configurable: true,
        enumerable: true,
        writable: true,
        value: valeur,
      });
    },
  });
}

interface Cas {
  readonly nom: string;
  readonly provoquer: () => void;
  /** Vrai si la globale est absente : les tentatives se comptent par ses lectures. */
  readonly sansGlobale?: boolean;
  readonly ouvrir: Ouvrir;
  /** Vrai si chaque tentative va jusqu'à l'événement `synced` de la bibliothèque. */
  readonly synced: boolean;
}

const CAS: readonly Cas[] = [
  {
    nom: "`indexedDB` absent à chaque tentative",
    provoquer: retirerIndexedDb,
    sansGlobale: true,
    ouvrir: ouvrirLeDocument,
    synced: false,
  },
  {
    nom: "ouverture refusée par une exception",
    provoquer: refuserLesOuverturesParUneException,
    ouvrir: ouvrirLeDocument,
    synced: false,
  },
  {
    nom: "ouverture refusée par une erreur de la demande",
    provoquer: refuserLesOuverturesParUneErreur,
    ouvrir: ouvrirLeDocument,
    synced: false,
  },
  {
    nom: "lecture brute en échec pendant la tentative",
    provoquer: () =>
      intercepterLesLecturesBrutes((_rang, lire) => {
        const demande = lire();
        demande.transaction?.abort();
        return demande;
      }),
    ouvrir: ouvrirLeDocument,
    synced: false,
  },
  {
    nom: "lecture de la bibliothèque en échec pendant la tentative",
    provoquer: faireEchouerLesLecturesDeLaBibliotheque,
    ouvrir: ouvrirLeDocument,
    synced: false,
  },
  {
    nom: "écriture de l'état complet en échec (erreur de la demande)",
    provoquer: refuserLesAjoutsParUneContrainte,
    ouvrir: ouvrirLeDocument,
    synced: true,
  },
  {
    nom: "écriture de l'état complet en échec alors que la bibliothèque émet `synced`",
    provoquer: () => annulerLesProchainsAjouts(TOUJOURS),
    ouvrir: ouvrirLeDocument,
    synced: true,
  },
  {
    nom: "échéance dépassée",
    provoquer: () => {
      vi.spyOn(indexedDB, "open").mockImplementation(() => ({}) as IDBOpenDBRequest);
    },
    ouvrir: ouvrirLeDocument,
    synced: false,
  },
  {
    nom: "base de l'appareil en échec",
    provoquer: refuserLesOuverturesParUneErreur,
    ouvrir: ouvrirLEspaceLocal,
    synced: false,
  },
];

describe("aucune erreur non interceptée", () => {
  it.each(CAS)(
    "F-030-AC18 $nom : trois tentatives, une modification, une demande immédiate et la fermeture n'émettent ni erreur non interceptée ni rejet non géré ; la persistance reste coupée, l'état en mémoire entier",
    async ({ provoquer, ouvrir, synced, sansGlobale = false }) => {
      simulerLHorloge();
      const relever = ecouter();
      await enregistrerUnPremierEtat();
      provoquer();
      const facade = ouvrirFacade(new Y.Doc());
      const instances = instancesAyantRelu(facade.doc);
      const instants = sansGlobale ? undefined : instantsDesOuvertures();

      const persistance = ouvrir(facade.doc);
      facade.creerPage("En mémoire");
      await laisserIndexedDbTravailler();
      for (let tentative = 2; tentative <= 3; tentative += 1) {
        vi.advanceTimersByTime(10_000);
        expect(persistance.lireEtat()).toBe("coupee");
        vi.advanceTimersToNextTimer();
        await laisserIndexedDbTravailler();
      }
      expect(() => facade.creerPage("Pendant une tentative")).not.toThrow();
      vi.advanceTimersByTime(1_000);
      expect(() => persistance.reessayer()).not.toThrow();
      await laisserIndexedDbTravailler();
      expect(persistance.lireEtat()).toBe("coupee");
      vi.advanceTimersByTime(10_000);
      // La cadence continue : l'attente de la tentative suivante est armée, et elle seule.
      expect(vi.getTimerCount()).toBe(1);
      expect(() => persistance.fermer()).not.toThrow();
      expect(vi.getTimerCount()).toBe(0);
      await laisserIndexedDbTravailler();

      expect(relever()).toEqual([]);
      expect(persistance.lireEtat()).toBe("fermee");
      expect(instances.length > 0).toBe(synced);
      if (instants === undefined) {
        // Une lecture par tentative : l'ouverture, celles de la cadence à 2, 6, 14 et 30 secondes,
        // puis la tentative demandée.
        expect(lecturesDeLaGlobaleAbsente).toBe(6);
      } else {
        expect(instants.length).toBeGreaterThanOrEqual(3);
      }
      expect(facade.lire().racines.map((page) => page.titre)).toEqual(
        expect.arrayContaining(["En mémoire", "Pendant une tentative"]),
      );
    },
  );

  // Un premier état dans la base, pour que la lecture de la bibliothèque ait quelque chose à lire.
  async function enregistrerUnPremierEtat(): Promise<void> {
    const facade = ouvrirFacade(new Y.Doc());
    const persistance = ouvrirPersistance(facade.doc, ESPACE);
    await attendreEtat(persistance, "active");
    facade.creerPage("Dans la base");
    await laisserIndexedDbTravailler();
    persistance.fermer();
  }

  it("F-030-AC18 connexion fermée pendant qu'une modification est écrite : l'appel revient sans lever, la modification est dans l'état en mémoire, la persistance est coupée, puis reprend", async () => {
    simulerLHorloge();
    const relever = ecouter();
    const connexions = suivreLesConnexionsTenues();
    const facade = ouvrirFacade(new Y.Doc());
    const persistance = ouvrirPersistance(facade.doc, ESPACE);
    await attendreEtat(persistance, "active");
    expect(connexions).toHaveLength(1);

    // Fermée sans événement `close` : seule l'écriture suivante le découvre, par une exception.
    connexions[0]?.close();
    expect(() => facade.creerPage("Écrite sur une connexion fermée")).not.toThrow();

    expect(persistance.lireEtat()).toBe("coupee");
    expect(facade.lire().racines.map((page) => page.titre)).toEqual([
      "Écrite sur une connexion fermée",
    ]);
    vi.advanceTimersToNextTimer();
    await attendreEtat(persistance, "active");
    persistance.fermer();
    await laisserIndexedDbTravailler();
    expect(relever()).toEqual([]);
  });
});

describe("abonnés d'une persistance sous garde", () => {
  interface Abonnes {
    readonly appels: string[];
    readonly signalements: unknown[][];
    readonly exception: Error;
  }

  // Dans l'ordre d'inscription : « premier » désabonne « retiré » et inscrit « tardif » pendant la
  // diffusion, « fautif » lève, « dernier » doit être appelé quand même.
  function abonner(persistance: Persistance): Abonnes {
    const appels: string[] = [];
    const exception = new Error("abonné fautif");
    const signalements: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...arguments_: unknown[]) => {
      signalements.push(arguments_);
    });
    let inscrit = false;
    persistance.abonner(() => {
      appels.push(`premier:${persistance.lireEtat()}`);
      desabonnerLeRetire();
      if (!inscrit) {
        inscrit = true;
        persistance.abonner(() => appels.push(`tardif:${persistance.lireEtat()}`));
      }
    });
    persistance.abonner(() => {
      appels.push(`fautif:${persistance.lireEtat()}`);
      throw exception;
    });
    const desabonnerLeRetire = persistance.abonner(() => appels.push("retiré"));
    persistance.abonner(() => appels.push(`dernier:${persistance.lireEtat()}`));
    return { appels, signalements, exception };
  }

  function attendus(etat: string): string[] {
    return [`premier:${etat}`, `fautif:${etat}`, `dernier:${etat}`];
  }

  function signalementUnique({ signalements, exception }: Abonnes): void {
    expect(signalements).toHaveLength(1);
    expect(signalements[0]?.[0]).toEqual(expect.stringContaining("abonné d'une persistance"));
    expect(signalements[0]?.[1]).toBe(exception);
  }

  it("F-030-AC25 fin de relecture : les abonnés suivants sont appelés dans l'ordre malgré celui qui lève, l'exception va une fois à console.error, l'état actif est atteint ; l'abonné désabonné pendant la diffusion n'est pas appelé, l'abonné inscrit pendant la diffusion ne l'est qu'au changement suivant", async () => {
    const relever = ecouter();
    const persistance = ouvrirPersistance(new Y.Doc(), ESPACE);
    const abonnes = abonner(persistance);

    await attendreEtat(persistance, "active");
    await laisserIndexedDbTravailler();

    expect(abonnes.appels).toEqual(attendus("active"));
    signalementUnique(abonnes);
    expect(persistance.lireEtat()).toBe("active");

    expect(() => persistance.fermer()).not.toThrow();
    expect(abonnes.appels).toEqual([
      ...attendus("active"),
      "premier:fermee",
      "fautif:fermee",
      "dernier:fermee",
      "tardif:fermee",
    ]);
    expect(abonnes.signalements).toHaveLength(2);
    expect(relever()).toEqual([]);
  });

  it("F-030-AC25 coupure par un gestionnaire d'IndexedDB (connexion fermée par le navigateur) : même diffusion, et la tentative suivante est lancée malgré le rappel fautif", async () => {
    simulerLHorloge();
    const relever = ecouter();
    const connexions = suivreLesConnexionsTenues();
    const persistance = ouvrirPersistance(new Y.Doc(), ESPACE);
    await attendreEtat(persistance, "active");
    const abonnes = abonner(persistance);
    const instants = instantsDesOuvertures();

    fermerDeForce(connexions[0] as IDBDatabase);
    await attendreEtat(persistance, "coupee");
    await laisserIndexedDbTravailler();

    expect(abonnes.appels).toEqual(attendus("coupee"));
    signalementUnique(abonnes);
    expect(instants).toEqual([]);
    vi.advanceTimersByTime(2_000);
    expect(instants).toHaveLength(1);
    persistance.fermer();
    await laisserIndexedDbTravailler();
    expect(relever()).toEqual([]);
  });

  it("F-030-AC25 coupure à l'échéance, dans la minuterie : même diffusion, rien ne remonte de la minuterie, et la tentative suivante est lancée", async () => {
    simulerLHorloge();
    const relever = ecouter();
    vi.spyOn(indexedDB, "open").mockImplementation(() => ({}) as IDBOpenDBRequest);
    const instants = instantsDesOuvertures();
    const persistance = ouvrirPersistance(new Y.Doc(), ESPACE);
    const abonnes = abonner(persistance);

    expect(() => vi.advanceTimersByTime(10_000)).not.toThrow();

    expect(abonnes.appels).toEqual(attendus("coupee"));
    signalementUnique(abonnes);
    expect(instants).toHaveLength(1);
    vi.advanceTimersByTime(2_000);
    expect(instants).toHaveLength(2);
    persistance.fermer();
    await laisserIndexedDbTravailler();
    expect(relever()).toEqual([]);
  });

  it("F-030-AC25 reprise, lancée par la demande de tentative immédiate : même diffusion, l'état actif est atteint, `reessayer` ne lève pas", async () => {
    simulerLHorloge();
    const relever = ecouter();
    const connexions = suivreLesConnexionsTenues();
    const persistance = ouvrirPersistance(new Y.Doc(), ESPACE);
    await attendreEtat(persistance, "active");
    fermerDeForce(connexions[0] as IDBDatabase);
    await attendreEtat(persistance, "coupee");
    vi.restoreAllMocks();
    const abonnes = abonner(persistance);

    vi.advanceTimersByTime(1_000);
    expect(() => persistance.reessayer()).not.toThrow();
    await attendreEtat(persistance, "active");
    await laisserIndexedDbTravailler();

    expect(abonnes.appels).toEqual(attendus("active"));
    signalementUnique(abonnes);
    expect(vi.getTimerCount()).toBe(0);
    persistance.fermer();
    expect(relever()).toEqual([]);
  });

  it("F-030-AC25 fermeture d'une persistance coupée : même diffusion, `fermer()` ne lève pas, l'état fermé est atteint, sans erreur non interceptée", async () => {
    const relever = ecouter();
    refuserLesOuverturesParUneException();
    const persistance = ouvrirPersistance(new Y.Doc(), ESPACE);
    const abonnes = abonner(persistance);

    expect(() => persistance.fermer()).not.toThrow();

    expect(abonnes.appels).toEqual(attendus("fermee"));
    signalementUnique(abonnes);
    expect(persistance.lireEtat()).toBe("fermee");
    await laisserIndexedDbTravailler();
    expect(relever()).toEqual([]);
  });
});
