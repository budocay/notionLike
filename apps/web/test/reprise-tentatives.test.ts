// F-030 : la coupure d'une persistance n'est plus définitive. Cadence des tentatives (AC1),
// tentative immédiate (AC2), réouverture (AC3), abandon (AC7), persistance fermée (AC11),
// abonnés sous garde (AC25).
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { ouvrirPersistance, type Persistance } from "../src/persistance/index.ts";
import { ouvrirFacade } from "./aides-facade.ts";
import {
  attendreEtat,
  enregistrements,
  ESPACE_A,
  fermerDeForce,
  laisserIndexedDbTravailler,
  refuserLesOuverturesParUneException,
  retenirLesOuvertures,
  suivreLesConnexionsTenues,
} from "./aides-persistance.ts";
import { etatsSuccessifs, instantsDesOuvertures, simulerLHorloge } from "./aides-reprise.ts";
import { desarmerLesMinuteries } from "./preparation.ts";

const ESPACE = { type: "espace", idEspace: ESPACE_A } as const;
const BASE = `notionlike:espace:${ESPACE_A}`;
const ECHEANCE_MS = 10_000;
const DIX_MINUTES_MS = 600_000;

function titres(doc: Y.Doc): string[] {
  return ouvrirFacade(doc)
    .lire()
    .racines.map((page) => page.titre);
}

async function enregistrerUnePage(titre: string): Promise<void> {
  const facade = ouvrirFacade(new Y.Doc());
  const persistance = ouvrirPersistance(facade.doc, ESPACE);
  await attendreEtat(persistance, "active");
  facade.creerPage(titre);
  await laisserIndexedDbTravailler();
  persistance.fermer();
}

/** Avance l'horloge simulée, puis laisse `fake-indexeddb` répondre. */
async function avancer(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms);
  await laisserIndexedDbTravailler();
}

describe("cadence des tentatives", () => {
  it("F-030-AC1 sept échecs consécutifs : tentatives à 2, 4, 8, 16, 32, 60 puis 60 secondes de la fin de la précédente ; après une reprise, une coupure nouvelle repart de 2 secondes", async () => {
    simulerLHorloge();
    vi.setSystemTime(0);
    refuserLesOuverturesParUneException();
    const instants = instantsDesOuvertures();

    const persistance = ouvrirPersistance(new Y.Doc(), ESPACE);
    expect(persistance.lireEtat()).toBe("coupee");
    await avancer(302_000);

    const attendus = [0, 2_000, 6_000, 14_000, 30_000, 62_000, 122_000, 182_000, 242_000, 302_000];
    expect(instants).toEqual(attendus);
    expect(attendus.slice(1, 8).map((instant, rang) => instant - (attendus[rang] ?? 0))).toEqual([
      2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000,
    ]);

    vi.restoreAllMocks();
    const connexions = suivreLesConnexionsTenues();
    const apresRetablissement = instantsDesOuvertures();
    vi.advanceTimersByTime(60_000);
    await attendreEtat(persistance, "active");
    const instantDeLaReprise = Date.now();
    expect(instantDeLaReprise).toBe(362_000);
    expect(vi.getTimerCount()).toBe(0);

    refuserLesOuverturesParUneException();
    const apresLaNouvelleCoupure = instantsDesOuvertures();
    fermerDeForce(connexions[0] as IDBDatabase);
    await attendreEtat(persistance, "coupee");
    await avancer(1_999);
    expect(apresLaNouvelleCoupure).toEqual([]);
    await avancer(1);
    expect(apresLaNouvelleCoupure).toEqual([instantDeLaReprise + 2_000]);
    await avancer(4_000);
    expect(apresLaNouvelleCoupure).toEqual([
      instantDeLaReprise + 2_000,
      instantDeLaReprise + 6_000,
    ]);
    expect(apresRetablissement.length).toBeGreaterThan(0);
    persistance.fermer();
  });

  it("F-030-AC1 F-030-AC7 des tentatives sans réponse sont abandonnées à 10 secondes ; l'attente se compte de la fin de la précédente et jamais deux tentatives ne courent ensemble", async () => {
    simulerLHorloge();
    vi.setSystemTime(0);
    vi.spyOn(indexedDB, "open").mockImplementation(() => ({}) as IDBOpenDBRequest);
    const instants = instantsDesOuvertures();

    const persistance = ouvrirPersistance(new Y.Doc(), ESPACE);
    const etats = etatsSuccessifs(persistance);
    await avancer(ECHEANCE_MS - 1);
    expect(persistance.lireEtat()).toBe("relecture");
    await avancer(1);
    expect(persistance.lireEtat()).toBe("coupee");
    await avancer(60_000);

    // 10 s d'ouverture, 2 s d'attente, 10 s de tentative, 4 s d'attente, 10 s, 8 s, 10 s, 16 s.
    expect(instants).toEqual([0, 12_000, 26_000, 44_000, 70_000]);
    expect(etats).toEqual(["coupee"]);
    persistance.fermer();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("tentative immédiate", () => {
  async function coupeeDepuis(
    instantsAttendus: readonly number[],
  ): Promise<{ persistance: Persistance; instants: number[] }> {
    simulerLHorloge();
    vi.setSystemTime(0);
    refuserLesOuverturesParUneException();
    const instants = instantsDesOuvertures();
    const persistance = ouvrirPersistance(new Y.Doc(), ESPACE);
    await avancer(instantsAttendus.at(-1) ?? 0);
    expect(instants).toEqual(instantsAttendus);
    return { persistance, instants };
  }

  it("F-030-AC2 `reessayer` lance aussitôt une tentative sans attendre la cadence ; son échec ne remet pas la cadence à 2 secondes", async () => {
    const { persistance, instants } = await coupeeDepuis([0, 2_000, 6_000]);
    await avancer(1_500);

    persistance.reessayer();
    expect(instants).toEqual([0, 2_000, 6_000, 7_500]);

    // Sans elle, la suivante était due à 14 000 ; elle est maintenant à 16 secondes de cet échec.
    await avancer(15_999);
    expect(instants).toEqual([0, 2_000, 6_000, 7_500]);
    await avancer(1);
    expect(instants).toEqual([0, 2_000, 6_000, 7_500, 23_500]);
    persistance.fermer();
  });

  it("F-030-AC2 jamais plus d'une tentative par seconde : une demande faite moins d'une seconde après le lancement de la précédente est sans effet, la cadence continue", async () => {
    const { persistance, instants } = await coupeeDepuis([0, 2_000]);

    await avancer(999);
    persistance.reessayer();
    expect(instants).toEqual([0, 2_000]);
    await avancer(1);
    persistance.reessayer();
    persistance.reessayer();
    expect(instants).toEqual([0, 2_000, 3_000]);
    await avancer(999);
    persistance.reessayer();
    expect(instants).toEqual([0, 2_000, 3_000]);
    persistance.fermer();
  });

  it("F-030-AC2 `reessayer` n'interrompt pas une tentative en cours et n'en lance pas une seconde", async () => {
    simulerLHorloge();
    vi.setSystemTime(0);
    const retenues = retenirLesOuvertures();
    const instants = instantsDesOuvertures();
    const doc = new Y.Doc();
    const persistance = ouvrirPersistance(doc, ESPACE);
    await avancer(ECHEANCE_MS + 2_000);
    expect(instants).toEqual([0, 12_000]);

    await avancer(5_000);
    persistance.reessayer();
    expect(instants).toEqual([0, 12_000]);
    retenues.cesser();
    retenues.repondre();
    await attendreEtat(persistance, "active");

    expect(Date.now()).toBe(17_000);
    persistance.fermer();
  });

  it("F-030-AC2 `reessayer` est sans effet sur une persistance active ou en relecture", async () => {
    simulerLHorloge();
    const instants = instantsDesOuvertures();
    const persistance = ouvrirPersistance(new Y.Doc(), ESPACE);
    const pendantLaRelecture = instants.length;
    vi.advanceTimersByTime(5_000);
    persistance.reessayer();
    expect(instants).toHaveLength(pendantLaRelecture);
    await attendreEtat(persistance, "active");
    const unefoisActive = instants.length;

    vi.advanceTimersByTime(5_000);
    persistance.reessayer();

    expect(instants).toHaveLength(unefoisActive);
    expect(persistance.lireEtat()).toBe("active");
    persistance.fermer();
  });
});

describe("réouverture", () => {
  it("F-030-AC3 un document dont la base a refusé l'ouverture, fermé, puis rouvert sans rechargement une fois la base rétablie, a une persistance active et le contenu de la base", async () => {
    await enregistrerUnePage("Déjà dans la base");
    refuserLesOuverturesParUneException();
    const doc = new Y.Doc();
    const premiere = ouvrirPersistance(doc, ESPACE);
    expect(premiere.lireEtat()).toBe("coupee");
    premiere.fermer();
    expect(premiere.lireEtat()).toBe("fermee");

    vi.restoreAllMocks();
    const seconde = ouvrirPersistance(doc, ESPACE);
    expect(seconde.lireEtat()).toBe("relecture");
    await attendreEtat(seconde, "active");

    expect(titres(doc)).toEqual(["Déjà dans la base"]);
    expect(premiere.lireEtat()).toBe("fermee");
    seconde.fermer();
  });
});

describe("tentative abandonnée", () => {
  it("F-030-AC7 la réponse de la base délivrée après l'abandon n'est ni appliquée à l'état en mémoire ni écrite ; la tentative suivante reprend", async () => {
    await enregistrerUnePage("Dans la base");
    const avant = await enregistrements(BASE);
    simulerLHorloge();
    refuserLesOuverturesParUneException();
    const facade = ouvrirFacade(new Y.Doc());
    const persistance = ouvrirPersistance(facade.doc, ESPACE);
    facade.creerPage("En mémoire");
    const etatAvant = [...Y.encodeStateAsUpdate(facade.doc)];
    vi.restoreAllMocks();
    const retenues = retenirLesOuvertures();

    vi.advanceTimersByTime(2_000);
    vi.advanceTimersByTime(ECHEANCE_MS);
    expect(persistance.lireEtat()).toBe("coupee");
    retenues.repondre();
    retenues.cesser();
    await laisserIndexedDbTravailler();

    expect([...Y.encodeStateAsUpdate(facade.doc)]).toEqual(etatAvant);
    expect(facade.lire().racines.map((page) => page.titre)).toEqual(["En mémoire"]);
    expect(await enregistrements(BASE)).toEqual(avant);
    expect(persistance.lireEtat()).toBe("coupee");

    vi.advanceTimersByTime(4_000);
    await attendreEtat(persistance, "active");
    await laisserIndexedDbTravailler();

    expect(
      facade
        .lire()
        .racines.map((page) => page.titre)
        .sort(),
    ).toEqual(["Dans la base", "En mémoire"]);
    const relu = new Y.Doc();
    (await enregistrements(BASE)).forEach((lu) => Y.applyUpdate(relu, Uint8Array.from(lu)));
    expect(titres(relu).sort()).toEqual(["Dans la base", "En mémoire"]);
    persistance.fermer();
  });
});

describe("persistance fermée", () => {
  it("F-030-AC11 une persistance coupée puis fermée ne lance plus aucune tentative, ni par la cadence en dix minutes, ni par `reessayer`, et ne laisse aucune minuterie armée", async () => {
    simulerLHorloge();
    refuserLesOuverturesParUneException();
    const instants = instantsDesOuvertures();
    const persistance = ouvrirPersistance(new Y.Doc(), ESPACE);
    const etats = etatsSuccessifs(persistance);
    await avancer(2_000);
    expect(instants).toHaveLength(2);

    persistance.fermer();
    expect(vi.getTimerCount()).toBe(0);
    await avancer(DIX_MINUTES_MS);
    persistance.reessayer();
    persistance.fermer();

    expect(instants).toHaveLength(2);
    expect(persistance.lireEtat()).toBe("fermee");
    expect(etats).toEqual(["fermee"]);
  });

  it("F-030-AC11 fermer pendant une tentative l'abandonne : sa réponse tardive n'écrit rien, aucune autre tentative ne suit", async () => {
    simulerLHorloge();
    refuserLesOuverturesParUneException();
    const facade = ouvrirFacade(new Y.Doc());
    const persistance = ouvrirPersistance(facade.doc, ESPACE);
    facade.creerPage("En mémoire");
    vi.restoreAllMocks();
    const retenues = retenirLesOuvertures();
    const instants = instantsDesOuvertures();
    vi.advanceTimersByTime(2_000);
    expect(instants).toHaveLength(1);

    persistance.fermer();
    expect(vi.getTimerCount()).toBe(0);
    retenues.repondre();
    retenues.cesser();
    await avancer(DIX_MINUTES_MS);

    expect(instants).toHaveLength(1);
    expect(await indexedDB.databases()).toEqual([]);
  });
});

describe("minuteries des tests", () => {
  it("F-030-AC11 une minuterie réelle armée par un test est désarmée par la fonction que la préparation des tests appelle après chacun : elle n'arrive jamais, une minuterie armée ensuite arrive", async () => {
    const arrivees: string[] = [];
    setTimeout(() => arrivees.push("laissée par le test"), 20);

    desarmerLesMinuteries();
    setTimeout(() => arrivees.push("armée après"), 20);
    await new Promise((resoudre) => setTimeout(resoudre, 80));

    expect(arrivees).toEqual(["armée après"]);
  });
});
