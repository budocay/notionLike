// F-030-AC10 : la version de format de l'état relu est connue avant toute écriture et avant toute
// application à un document affiché, par une lecture brute soumise dans un document témoin.
import { act, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { ouvrirPersistance } from "../src/persistance/index.ts";
import {
  docDe,
  etatEncode,
  fermerLOnglet,
  ouvrirCoquille,
  rendreApplication,
} from "./aides-coquille.tsx";
import { ouvrirFacade } from "./aides-facade.ts";
import {
  ecrireLaVersion,
  ecrireUneEntreeDePage,
  porteUneEntreeDePage,
  VERSION_NON_PRISE_EN_CHARGE,
} from "./aides-format.ts";
import {
  attendreEtat,
  enregistrements,
  ESPACE_A,
  fermerDeForce,
  laisserIndexedDbTravailler,
  nomsDesBases,
  refuserLesOuverturesParUneException,
  suivreLesConnexionsTenues,
} from "./aides-persistance.ts";
import {
  etatsSuccessifs,
  instantsDesOuvertures,
  rendreLOnglet,
  simulerLHorloge,
} from "./aides-reprise.ts";

const PREFIXE = "notionlike:espace:";
const DIX_MINUTES_MS = 600_000;
const MODIFICATIONS_PERDUES =
  "Les modifications faites depuis l'ouverture n'ont pas pu être enregistrées sur cet appareil.";

async function baseDeLEspaceLocal(): Promise<string> {
  const base = (await nomsDesBases()).find((nom) => nom.startsWith(PREFIXE));
  if (base === undefined) {
    throw new Error("Aucune base d'espace sur l'appareil simulé.");
  }
  return base;
}

/** Ce qu'une application plus récente, ouverte dans un autre onglet, écrit dans la base. */
async function eleverLaVersionDeLaBase(base: string): Promise<void> {
  const doc = new Y.Doc();
  const persistance = ouvrirPersistance(doc, {
    type: "espace",
    idEspace: base.slice(PREFIXE.length),
  });
  await attendreEtat(persistance, "active");
  ecrireLaVersion(doc, VERSION_NON_PRISE_EN_CHARGE);
  await laisserIndexedDbTravailler();
  persistance.fermer();
  await laisserIndexedDbTravailler();
}

function creerUnePage(session: ReturnType<typeof rendreApplication>["session"], titre: string) {
  const etat = session.lireEtat();
  if (etat.phase !== "pret") {
    throw new Error("La session n'est pas prête.");
  }
  act(() => void etat.operations.creerPage(titre));
}

describe("version non prise en charge découverte à la reprise", () => {
  it("F-030-AC10 base passée à la version 2 pendant la coupure d'un document de version 1 modifié en mémoire : écran bloquant qui dit les modifications non enregistrées, persistance fermée, aucun enregistrement ajouté à la base, octet pour octet, plus aucune tentative", async () => {
    const connexions = suivreLesConnexionsTenues();
    const { session } = await ouvrirCoquille();
    creerUnePage(session, "Enregistrée par cette version");
    await laisserIndexedDbTravailler();
    const base = await baseDeLEspaceLocal();
    simulerLHorloge();
    act(() => fermerDeForce(connexions.at(-1) as IDBDatabase));
    await act(() => laisserIndexedDbTravailler());
    expect(session.lireEtat()).toMatchObject({ phase: "pret", enregistre: false });
    await eleverLaVersionDeLaBase(base);
    creerUnePage(session, "Créée pendant la coupure");
    const avant = await enregistrements(base);
    const enMemoire = etatEncode(session);
    const ecritures = vi.spyOn(IDBObjectStore.prototype, "add");

    act(() => void vi.advanceTimersToNextTimer());
    await act(() => laisserIndexedDbTravailler());

    expect(session.lireEtat()).toEqual({
      phase: "version-non-prise-en-charge",
      modificationsPerdues: true,
    });
    const alerte = screen.getByRole("alert");
    expect(alerte.textContent).toContain("Mise à jour nécessaire");
    expect(alerte.textContent).toContain(MODIFICATIONS_PERDUES);
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(ecritures).not.toHaveBeenCalled();
    expect(await enregistrements(base)).toEqual(avant);
    expect(etatEncode(session)).toEqual(enMemoire);

    const instants = instantsDesOuvertures();
    expect(vi.getTimerCount()).toBe(0);
    act(() => void vi.advanceTimersByTime(DIX_MINUTES_MS));
    rendreLOnglet("visible");
    expect(instants).toEqual([]);
  });

  it("F-030-AC10 base de version 2 à l'ouverture de l'application : écran bloquant sans phrase sur des modifications, et pas même l'enregistrement vide de deux octets n'est ajouté à la base", async () => {
    const premiere = await ouvrirCoquille();
    creerUnePage(premiere.session, "Écrite avant");
    await laisserIndexedDbTravailler();
    const base = await baseDeLEspaceLocal();
    fermerLOnglet(premiere);
    await eleverLaVersionDeLaBase(base);
    const avant = await enregistrements(base);

    const { session } = rendreApplication();
    await screen.findByRole("alert");
    await laisserIndexedDbTravailler();

    expect(session.lireEtat()).toEqual({
      phase: "version-non-prise-en-charge",
      modificationsPerdues: false,
    });
    expect(screen.getByRole("alert").textContent).toContain("Mise à jour nécessaire");
    expect(screen.getByRole("alert").textContent).not.toContain(MODIFICATIONS_PERDUES);
    expect(await enregistrements(base)).toEqual(avant);
    expect([...Y.encodeStateAsUpdate(docDe(session))]).toEqual([0, 0]);
  });

  it("F-030-AC10 seul le refus de version est un refus : une base de version admise dont une entrée de page est mal formée est admise, fusionnée à la mémoire, et la persistance devient active", async () => {
    const CLE_FORGEE = "pas-un-identifiant-de-page";
    const premiere = await ouvrirCoquille();
    await laisserIndexedDbTravailler();
    const base = await baseDeLEspaceLocal();
    fermerLOnglet(premiere);
    const forge = new Y.Doc();
    const ecriture = ouvrirPersistance(forge, {
      type: "espace",
      idEspace: base.slice(PREFIXE.length),
    });
    await attendreEtat(ecriture, "active");
    ecrireUneEntreeDePage(forge, CLE_FORGEE);
    await laisserIndexedDbTravailler();
    ecriture.fermer();
    await laisserIndexedDbTravailler();

    const { session } = await ouvrirCoquille();

    expect(session.lireEtat()).toMatchObject({ phase: "pret", enregistre: true });
    expect(porteUneEntreeDePage(docDe(session), CLE_FORGEE)).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("état relu soumis avant la fusion", () => {
  const ESPACE = { type: "espace", idEspace: ESPACE_A } as const;
  const BASE = PREFIXE + ESPACE_A;

  async function enregistrerUnePage(titre: string): Promise<void> {
    const facade = ouvrirFacade(new Y.Doc());
    const persistance = ouvrirPersistance(facade.doc, ESPACE);
    await attendreEtat(persistance, "active");
    facade.creerPage(titre);
    await laisserIndexedDbTravailler();
    persistance.fermer();
  }

  it("F-030-AC10 le juge reçoit un document témoin qui porte l'état relu de la base, jamais le document en mémoire ; son refus ferme la persistance avant toute construction d'instance : rien n'est appliqué à la mémoire, rien n'est écrit", async () => {
    await enregistrerUnePage("Dans la base");
    const avant = await enregistrements(BASE);
    const facade = ouvrirFacade(new Y.Doc());
    facade.creerPage("En mémoire");
    const enMemoire = [...Y.encodeStateAsUpdate(facade.doc)];
    const soumis: { titres: string[]; estLaMemoire: boolean }[] = [];

    const persistance = ouvrirPersistance(facade.doc, ESPACE);
    const etats = etatsSuccessifs(persistance);
    persistance.soumettreLEtatRelu((temoin) => {
      soumis.push({
        titres: ouvrirFacade(temoin)
          .lire()
          .racines.map((page) => page.titre),
        estLaMemoire: temoin === facade.doc,
      });
      return false;
    });
    await attendreEtat(persistance, "fermee");
    await laisserIndexedDbTravailler();

    expect(soumis).toEqual([{ titres: ["Dans la base"], estLaMemoire: false }]);
    expect(etats).toEqual(["fermee"]);
    expect([...Y.encodeStateAsUpdate(facade.doc)]).toEqual(enMemoire);
    expect(await enregistrements(BASE)).toEqual(avant);
  });

  it("F-030-AC10 un juge qui admet laisse la fusion se faire, et il est consulté à chaque tentative, pas sur une base absente", async () => {
    simulerLHorloge();
    refuserLesOuverturesParUneException();
    const facade = ouvrirFacade(new Y.Doc());
    const persistance = ouvrirPersistance(facade.doc, ESPACE);
    const juge = vi.fn(() => true);
    persistance.soumettreLEtatRelu(juge);
    vi.restoreAllMocks();
    vi.advanceTimersToNextTimer();
    await attendreEtat(persistance, "active");
    expect(juge).not.toHaveBeenCalled();

    const connexions = suivreLesConnexionsTenues();
    persistance.reessayer();
    facade.creerPage("Écrite avant la coupure");
    await laisserIndexedDbTravailler();
    // Une connexion n'entre dans la liste qu'une fois ouverte : constaté après l'attente.
    expect(connexions).toEqual([]);
    persistance.fermer();
    const seconde = ouvrirPersistance(facade.doc, ESPACE);
    seconde.soumettreLEtatRelu(juge);
    await attendreEtat(seconde, "active");

    expect(juge).toHaveBeenCalledTimes(1);
    seconde.fermer();
  });
});

describe("modifications non enregistrées", () => {
  const ESPACE = { type: "espace", idEspace: ESPACE_A } as const;

  it("F-030-AC10 F-030-AC16 une persistance dit porter des modifications non enregistrées dès qu'une mise à jour arrive hors de l'état actif, ou qu'une écriture échoue ; plus après la preuve d'écriture ; ce que la reprise relit de la base n'en est pas une", async () => {
    simulerLHorloge();
    const connexions = suivreLesConnexionsTenues();
    const facade = ouvrirFacade(new Y.Doc());
    const persistance = ouvrirPersistance(facade.doc, ESPACE);
    const diffusions = vi.fn();
    persistance.abonner(diffusions);
    expect(persistance.aDesModificationsNonEnregistrees()).toBe(false);
    await attendreEtat(persistance, "active");
    facade.creerPage("Enregistrée");
    await laisserIndexedDbTravailler();
    expect(persistance.aDesModificationsNonEnregistrees()).toBe(false);

    // Coupure sans modification : la connexion est fermée par le navigateur.
    fermerDeForce(connexions[0] as IDBDatabase);
    await attendreEtat(persistance, "coupee");
    expect(persistance.aDesModificationsNonEnregistrees()).toBe(false);
    diffusions.mockClear();
    facade.creerPage("Pendant la coupure");
    expect(persistance.aDesModificationsNonEnregistrees()).toBe(true);
    expect(diffusions).toHaveBeenCalledTimes(1);
    facade.creerPage("Encore pendant la coupure");
    expect(diffusions).toHaveBeenCalledTimes(1);

    vi.advanceTimersToNextTimer();
    await attendreEtat(persistance, "active");
    expect(persistance.aDesModificationsNonEnregistrees()).toBe(false);

    // Coupure par l'écriture même d'une modification : elle n'a pas atteint la base.
    connexions[0]?.close();
    facade.creerPage("Écrite sur une connexion fermée");
    expect(persistance.lireEtat()).toBe("coupee");
    expect(persistance.aDesModificationsNonEnregistrees()).toBe(true);
    persistance.fermer();
  });

  it("F-030-AC16 F-030-AC20 ce qu'une reprise relit de la base et applique à la mémoire n'est pas une modification non enregistrée", async () => {
    const autre = ouvrirFacade(new Y.Doc());
    const premiere = ouvrirPersistance(autre.doc, ESPACE);
    await attendreEtat(premiere, "active");
    autre.creerPage("Dans la base");
    await laisserIndexedDbTravailler();
    premiere.fermer();
    simulerLHorloge();
    refuserLesOuverturesParUneException();
    const doc = new Y.Doc();
    const persistance = ouvrirPersistance(doc, ESPACE);
    const relevees: boolean[] = [];
    doc.on("update", () => relevees.push(persistance.aDesModificationsNonEnregistrees()));
    vi.restoreAllMocks();

    vi.advanceTimersToNextTimer();
    await attendreEtat(persistance, "active");

    expect(relevees).toEqual([false]);
    expect(persistance.aDesModificationsNonEnregistrees()).toBe(false);
    persistance.fermer();
  });
});
