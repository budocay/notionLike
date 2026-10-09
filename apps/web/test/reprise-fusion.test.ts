// F-030 : à la reprise, l'état relu et l'état en mémoire sont fusionnés, sans perte ni doublon
// (AC4), sans jamais ramener la mémoire à un état plus ancien (AC5), de façon rejouable (AC6), et
// dans n'importe quel ordre entre deux onglets (AC8).
import type { Arborescence, DocumentEspace } from "@notionlike/document";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { ouvrirPersistance, type Persistance } from "../src/persistance/index.ts";
import { ouvrirFacade } from "./aides-facade.ts";
import {
  attendreEtat,
  enregistrements,
  ESPACE_A,
  laisserIndexedDbTravailler,
  refuserLesOuverturesParUneException,
  retenirLesOuvertures,
  suivreLesConnexions,
} from "./aides-persistance.ts";
import {
  annulerLesProchainsAjouts,
  etatsSuccessifs,
  instancesAyantRelu,
  simulerLHorloge,
} from "./aides-reprise.ts";

const ESPACE = { type: "espace", idEspace: ESPACE_A } as const;
const BASE = `notionlike:espace:${ESPACE_A}`;
const ECHEANCE_MS = 10_000;
const PREMIERE_ATTENTE_MS = 2_000;

interface Onglet {
  readonly facade: DocumentEspace;
  readonly persistance: Persistance;
}

async function ouvrirUnOnglet(): Promise<Onglet> {
  const facade = ouvrirFacade(new Y.Doc());
  const persistance = ouvrirPersistance(facade.doc, ESPACE);
  await attendreEtat(persistance, "active");
  return { facade, persistance };
}

/** Écriture en échec après l'ouverture : la mise à jour suivante coupe la persistance. */
async function couperParUneEcritureEnEchec(onglet: Onglet, titre: string): Promise<void> {
  annulerLesProchainsAjouts(1);
  onglet.facade.creerPage(titre);
  await attendreEtat(onglet.persistance, "coupee");
  await laisserIndexedDbTravailler();
  vi.restoreAllMocks();
}

// Seule l'attente de la tentative suivante est armée pendant une coupure : l'horloge saute à elle,
// sans avancer jusqu'à l'échéance de la tentative qu'elle lance.
async function reprendre(persistance: Persistance): Promise<void> {
  expect(vi.getTimerCount()).toBe(1);
  vi.advanceTimersToNextTimer();
  await attendreEtat(persistance, "active");
  await laisserIndexedDbTravailler();
}

/** Arborescence lue et corbeille d'un document Yjs vierge relu de la base, sans le module. */
async function luDeLaBase(): Promise<Arborescence> {
  const relu = new Y.Doc();
  (await enregistrements(BASE)).forEach((lu) => Y.applyUpdate(relu, Uint8Array.from(lu)));
  return ouvrirFacade(relu).lire();
}

function titresDe(arborescence: Arborescence): { racines: string[]; corbeille: string[] } {
  return {
    racines: arborescence.racines.map((page) => page.titre).sort(),
    corbeille: arborescence.corbeille.map((page) => page.titre).sort(),
  };
}

function etat(doc: Y.Doc): number[] {
  return [...Y.encodeStateAsUpdate(doc)];
}

describe("fusion à la reprise", () => {
  it("F-030-AC4 (1) coupure après l'ouverture par une écriture en échec, puis une page créée, une renommée et une mise à la corbeille pendant la coupure : après la reprise, la mémoire et un document vierge relu de la base lisent la même arborescence et la même corbeille, chaque modification une fois", async () => {
    simulerLHorloge();
    const onglet = await ouvrirUnOnglet();
    const aRenommer = onglet.facade.creerPage("À renommer");
    const aJeter = onglet.facade.creerPage("À jeter");
    await laisserIndexedDbTravailler();
    const avant = await enregistrements(BASE);
    await couperParUneEcritureEnEchec(onglet, "Refusée par la base");
    onglet.facade.creerPage("Créée pendant la coupure");
    onglet.facade.renommerPage(aRenommer, "Renommée pendant la coupure");
    onglet.facade.mettreALaCorbeille(aJeter);
    expect(await enregistrements(BASE)).toEqual(avant);

    await reprendre(onglet.persistance);

    const lue = await luDeLaBase();
    expect(lue).toEqual(onglet.facade.lire());
    expect(titresDe(lue)).toEqual({
      racines: ["Créée pendant la coupure", "Refusée par la base", "Renommée pendant la coupure"],
      corbeille: ["À jeter"],
    });
    const apres = await enregistrements(BASE);
    expect(apres.slice(0, avant.length)).toEqual(avant);
    onglet.persistance.fermer();
  });

  it("F-030-AC4 (2) coupure dès l'ouverture par l'échéance, sur une base qui porte déjà des pages, une page créée en mémoire : après la reprise, les pages de la base et la page créée sont lues toutes, des deux côtés", async () => {
    const premier = await ouvrirUnOnglet();
    const mere = premier.facade.creerPage("Mère dans la base");
    premier.facade.creerPage("Fille dans la base", { parent: mere });
    premier.facade.mettreALaCorbeille(premier.facade.creerPage("Jetée dans la base"));
    await laisserIndexedDbTravailler();
    premier.persistance.fermer();
    simulerLHorloge();
    const retenues = retenirLesOuvertures();
    const facade = ouvrirFacade(new Y.Doc());
    const persistance = ouvrirPersistance(facade.doc, ESPACE);
    vi.advanceTimersByTime(ECHEANCE_MS);
    expect(persistance.lireEtat()).toBe("coupee");
    facade.creerPage("Créée en mémoire");
    retenues.cesser();

    await reprendre(persistance);

    const lue = await luDeLaBase();
    expect(lue).toEqual(facade.lire());
    expect(titresDe(lue)).toEqual({
      racines: ["Créée en mémoire", "Mère dans la base"],
      corbeille: ["Jetée dans la base"],
    });
    expect(lue.racines.find((page) => page.id === mere)?.enfants.map((page) => page.titre)).toEqual(
      ["Fille dans la base"],
    );
    persistance.fermer();
  });

  it("F-030-AC5 état relu ancêtre de l'état en mémoire : la reprise n'émet aucune mise à jour sur le document, son état encodé est le même octet pour octet, les enregistrements d'avant sont inchangés, et la base relue lit comme la mémoire", async () => {
    simulerLHorloge();
    const connexions = suivreLesConnexions();
    const onglet = await ouvrirUnOnglet();
    onglet.facade.creerPage("Enregistrée");
    await laisserIndexedDbTravailler();
    const avant = await enregistrements(BASE);
    connexions.at(-1)?.close();
    onglet.facade.creerPage("Écrite sur une connexion fermée");
    expect(onglet.persistance.lireEtat()).toBe("coupee");
    onglet.facade.creerPage("Créée pendant la coupure");
    const etatAvant = etat(onglet.facade.doc);
    const arborescenceAvant = onglet.facade.lire();
    const emises = vi.fn();
    onglet.facade.doc.on("update", emises);
    const lecturesDeLaFacade = vi.fn();
    onglet.facade.abonner(lecturesDeLaFacade);

    await reprendre(onglet.persistance);
    onglet.facade.doc.off("update", emises);

    expect(emises).not.toHaveBeenCalled();
    expect(lecturesDeLaFacade).not.toHaveBeenCalled();
    expect(etat(onglet.facade.doc)).toEqual(etatAvant);
    expect(onglet.facade.lire()).toBe(arborescenceAvant);
    const apres = await enregistrements(BASE);
    expect(apres.slice(0, avant.length)).toEqual(avant);
    expect(apres).toEqual([...avant, etatAvant]);
    expect(await luDeLaBase()).toEqual(onglet.facade.lire());
    onglet.persistance.fermer();
  });

  it("F-030-AC5 état relu en avance sur la mémoire (autre onglet) : ses modifications s'ajoutent, rien n'est retiré de la mémoire, et un même titre modifié des deux côtés se lit pareil en mémoire et dans la base", async () => {
    simulerLHorloge();
    const coupe = await ouvrirUnOnglet();
    const commune = coupe.facade.creerPage("Titre de départ");
    await laisserIndexedDbTravailler();
    await couperParUneEcritureEnEchec(coupe, "De l'onglet coupé");
    coupe.facade.renommerPage(commune, "Renommée par l'onglet coupé");
    const autre = await ouvrirUnOnglet();
    autre.facade.renommerPage(commune, "Renommée par l'autre onglet");
    autre.facade.creerPage("De l'autre onglet");
    await laisserIndexedDbTravailler();
    autre.persistance.fermer();

    await reprendre(coupe.persistance);

    const lue = await luDeLaBase();
    expect(lue).toEqual(coupe.facade.lire());
    const titres = titresDe(lue).racines;
    expect(titres).toHaveLength(3);
    expect(titres).toEqual(expect.arrayContaining(["De l'autre onglet", "De l'onglet coupé"]));
    expect(["Renommée par l'onglet coupé", "Renommée par l'autre onglet"]).toContain(
      lue.racines.find((page) => page.id === commune)?.titre,
    );
    coupe.persistance.fermer();
  });
});

describe("reprise rejouable", () => {
  it("F-030-AC6 l'écriture de l'état complet d'une première tentative échoue alors que `synced` est émis : coupure maintenue, instance détruite, rien d'ajouté à la base avant la tentative suivante, qui donne une base égale à la mémoire", async () => {
    simulerLHorloge();
    const onglet = await ouvrirUnOnglet();
    onglet.facade.creerPage("Enregistrée");
    await laisserIndexedDbTravailler();
    await couperParUneEcritureEnEchec(onglet, "Refusée par la base");
    const etats = etatsSuccessifs(onglet.persistance);
    const instances = instancesAyantRelu(onglet.facade.doc);
    const avant = await enregistrements(BASE);

    annulerLesProchainsAjouts(1);
    vi.advanceTimersByTime(PREMIERE_ATTENTE_MS);
    await laisserIndexedDbTravailler();
    vi.restoreAllMocks();
    expect(instances.map((instance) => instance.synced)).toEqual([true]);
    expect(onglet.persistance.lireEtat()).toBe("coupee");
    expect(etats).toEqual([]);
    const ecritures = vi.spyOn(IDBObjectStore.prototype, "add");
    onglet.facade.creerPage("Après la tentative en échec");
    await laisserIndexedDbTravailler();
    expect(ecritures).not.toHaveBeenCalled();
    expect(await enregistrements(BASE)).toEqual(avant);
    vi.restoreAllMocks();

    await reprendre(onglet.persistance);

    expect(etats).toEqual(["active"]);
    expect(instances).toHaveLength(2);
    expect(instances[1]).not.toBe(instances[0]);
    const lue = await luDeLaBase();
    expect(lue).toEqual(onglet.facade.lire());
    expect(titresDe(lue).racines).toEqual([
      "Après la tentative en échec",
      "Enregistrée",
      "Refusée par la base",
    ]);
    onglet.persistance.fermer();
  });

  it("F-030-AC6 après une reprise, une modification suivie aussitôt d'un rechargement est relue : chaque écriture est de nouveau validée sans attendre", async () => {
    simulerLHorloge();
    refuserLesOuverturesParUneException();
    const facade = ouvrirFacade(new Y.Doc());
    const persistance = ouvrirPersistance(facade.doc, ESPACE);
    vi.restoreAllMocks();
    await reprendre(persistance);
    const validations = vi.spyOn(IDBTransaction.prototype, "commit");

    facade.creerPage("Juste après la reprise");
    expect(validations).toHaveBeenCalledTimes(1);
    persistance.fermer();
    vi.useRealTimers();

    const recharge = await ouvrirUnOnglet();
    expect(titresDe(recharge.facade.lire()).racines).toEqual(["Juste après la reprise"]);
  });

  it("F-030-AC6 après une reprise, une nouvelle coupure est détectée comme à l'ouverture : écriture en échec, puis connexion fermée par le navigateur", async () => {
    simulerLHorloge();
    refuserLesOuverturesParUneException();
    const facade = ouvrirFacade(new Y.Doc());
    const persistance = ouvrirPersistance(facade.doc, ESPACE);
    vi.restoreAllMocks();
    await reprendre(persistance);

    await couperParUneEcritureEnEchec({ facade, persistance }, "Refusée après la reprise");
    expect(persistance.lireEtat()).toBe("coupee");
    const connexions = suivreLesConnexions();
    await reprendre(persistance);
    expect(connexions).toHaveLength(1);
    const { forceCloseDatabase } = await import("fake-indexeddb");
    forceCloseDatabase(connexions[0] as unknown as Parameters<typeof forceCloseDatabase>[0]);
    await attendreEtat(persistance, "coupee");
    await reprendre(persistance);

    expect(await luDeLaBase()).toEqual(facade.lire());
    persistance.fermer();
  });
});

describe("deux onglets", () => {
  async function deuxOngletsCoupes(): Promise<[Onglet, Onglet]> {
    simulerLHorloge();
    const [un, deux] = [await ouvrirUnOnglet(), await ouvrirUnOnglet()];
    un.facade.creerPage("Commune");
    await laisserIndexedDbTravailler();
    annulerLesProchainsAjouts(2);
    un.facade.creerPage("Du premier onglet");
    deux.facade.creerPage("Du second onglet");
    await Promise.all([
      attendreEtat(un.persistance, "coupee"),
      attendreEtat(deux.persistance, "coupee"),
    ]);
    await laisserIndexedDbTravailler();
    vi.restoreAllMocks();
    return [un, deux];
  }

  async function reprendreSeul(onglet: Onglet): Promise<void> {
    vi.advanceTimersByTime(1_000);
    onglet.persistance.reessayer();
    await attendreEtat(onglet.persistance, "active");
    await laisserIndexedDbTravailler();
  }

  it.each([
    ["le premier puis le second", [0, 1]],
    ["le second puis le premier", [1, 0]],
  ] as const)(
    "F-030-AC8 deux onglets coupés qui modifient chacun le document, puis reprennent, %s : la base relue porte les modifications des deux, identique dans les deux ordres",
    async (_ordre, [dAbord, ensuite]) => {
      const onglets = await deuxOngletsCoupes();

      await reprendreSeul(onglets[dAbord]);
      await reprendreSeul(onglets[ensuite]);

      const lue = await luDeLaBase();
      expect(titresDe(lue).racines).toEqual(["Commune", "Du premier onglet", "Du second onglet"]);
      // Le second à reprendre relit ce que le premier a écrit ; le premier ne voit pas le second.
      expect(onglets[ensuite].facade.lire()).toEqual(lue);
      expect(titresDe(onglets[dAbord].facade.lire()).racines).not.toContain(
        ["Du premier onglet", "Du second onglet"][ensuite],
      );
      onglets.forEach((onglet) => onglet.persistance.fermer());
    },
  );
});
