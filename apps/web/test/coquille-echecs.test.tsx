import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { ouvrirPersistance } from "../src/persistance/index.ts";
import {
  boutonNouvellePage,
  creerPageNommee,
  docDe,
  fermerLOnglet,
  ouvrirCoquille,
  rendreApplication,
  versionInconnueVenueDAilleurs,
} from "./aides-coquille.tsx";
import { ecouteurs, facadesEncoreOuvertes, importerEntree } from "./aides-facade.ts";
import {
  attendreEtat,
  enregistrements,
  fermerDeForce,
  laisserIndexedDbTravailler,
  nomsDesBases,
  refuserLesOuverturesParUneErreur,
  refuserLesOuverturesParUneException,
  retenirLesOuvertures,
  suivreLesConnexions,
} from "./aides-persistance.ts";

const PREFIXE_BASE_ESPACE = "notionlike:espace:";
const DELAI_RELECTURE_MS = 10_000;

function avertissementDePersistance(): HTMLElement {
  const alerte = screen.getByRole("alert");
  expect(alerte.textContent).toContain("enregistrées");
  return alerte;
}

function titresDesLiens(): (string | null)[] {
  return screen.queryAllByRole("link").map((lien) => lien.textContent);
}

async function idEspaceLocal(): Promise<string> {
  const base = (await nomsDesBases()).find((nom) => nom.startsWith(PREFIXE_BASE_ESPACE));
  if (base === undefined) {
    throw new Error("Aucune base d'espace sur l'appareil simulé.");
  }
  return base.slice(PREFIXE_BASE_ESPACE.length);
}

function etatRelu(misesAJour: number[][]): number[] {
  const doc = new Y.Doc();
  misesAJour.forEach((octets) => Y.applyUpdate(doc, Uint8Array.from(octets)));
  return [...Y.encodeStateAsUpdate(doc)];
}

function nonVides(misesAJour: number[][]): number[][] {
  return misesAJour.filter((octets) => octets.some((octet) => octet !== 0));
}

function ecranBloquantSansAction(): HTMLElement {
  const alerte = screen.getByRole("alert");
  expect(alerte.textContent).toContain("à jour");
  expect(screen.queryAllByRole("button")).toEqual([]);
  expect(screen.queryAllByRole("link")).toEqual([]);
  expect(screen.queryAllByRole("textbox")).toEqual([]);
  expect(screen.queryByRole("navigation")).toBeNull();
  return alerte;
}

// Un document d'une version de format que cette application ne connaît pas, enregistré à la
// place de l'espace local par le module de persistance lui-même.
async function enregistrerUneVersionInconnue(idEspace: string): Promise<void> {
  const doc = new Y.Doc();
  doc.getMap("meta").set("version", 2);
  doc.getMap("pages").set("page-d-une-autre-version", new Y.Map());
  const persistance = ouvrirPersistance(doc, { type: "espace", idEspace });
  await attendreEtat(persistance, "active");
  persistance.fermer();
}

describe("coquille : échecs et limites", () => {
  it("F-002-AC16 sans indexedDB : fin du chargement, avertissement annoncé, arborescence modifiable en mémoire", async () => {
    vi.stubGlobal("indexedDB", undefined);

    const { utilisateur } = await ouvrirCoquille();

    expect(screen.queryByRole("status")).toBeNull();
    avertissementDePersistance();
    await creerPageNommee(utilisateur, "En mémoire");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("En mémoire");
    avertissementDePersistance();
  });

  it.each([
    ["une exception levée à la demande d'ouverture", refuserLesOuverturesParUneException],
    ["une erreur de la demande d'ouverture", refuserLesOuverturesParUneErreur],
  ])(
    "F-002-AC16 ouverture de la base refusée par %s : session en mémoire, modifiable, avec l'avertissement",
    async (_cas, refuser) => {
      refuser();

      const { utilisateur } = await ouvrirCoquille();

      expect(screen.queryByRole("status")).toBeNull();
      avertissementDePersistance();
      await creerPageNommee(utilisateur, "Malgré le refus");
      avertissementDePersistance();
      vi.restoreAllMocks();
      expect(await nomsDesBases()).toEqual([]);
    },
  );

  it("F-002-AC16 connexion fermée par le navigateur après l'ouverture : l'avertissement annoncé apparaît et reste, l'arborescence affichée reste modifiable", async () => {
    const connexions = suivreLesConnexions();
    const { utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Avant la coupure");
    expect(screen.queryByRole("alert")).toBeNull();
    const connexionDeLEspace = connexions.at(-1);
    if (connexionDeLEspace === undefined) {
      throw new Error("Aucune connexion ouverte par la session.");
    }

    act(() => fermerDeForce(connexionDeLEspace));

    await waitFor(() => avertissementDePersistance());
    expect(titresDesLiens()).toEqual(["Avant la coupure"]);
    await creerPageNommee(utilisateur, "Après la coupure");
    expect(titresDesLiens()).toEqual(["Avant la coupure", "Après la coupure"]);
    avertissementDePersistance();
  });

  it("F-002-AC24 F-002-AC3 relecture sans réponse : chargement jusqu'à 9 999 ms, session en mémoire à 10 000 ms", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(indexedDB, "open").mockImplementation(() => ({}) as IDBOpenDBRequest);

    rendreApplication();
    act(() => void vi.advanceTimersByTime(DELAI_RELECTURE_MS - 1));

    expect(screen.getByRole("status").textContent).toBe("Chargement…");
    expect(screen.queryAllByRole("button")).toEqual([]);

    act(() => void vi.advanceTimersByTime(1));

    expect(screen.queryByRole("status")).toBeNull();
    avertissementDePersistance();
    expect(screen.getByRole("button", { name: "Nouvelle page" })).toBeDefined();
  });

  it("F-002-AC24 réponse de la base délivrée après l'échéance : ni l'arborescence affichée ni les enregistrements de la base ne changent", async () => {
    const premiere = await ouvrirCoquille();
    await creerPageNommee(premiere.utilisateur, "Enregistrée avant");
    const base = PREFIXE_BASE_ESPACE + (await idEspaceLocal());
    await laisserIndexedDbTravailler();
    const avant = await enregistrements(base);
    expect(nonVides(avant).length).toBeGreaterThan(0);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const ouvertures = retenirLesOuvertures();

    fermerLOnglet(premiere);
    const { utilisateur } = rendreApplication();
    act(() => void vi.advanceTimersByTime(DELAI_RELECTURE_MS));
    vi.useRealTimers();

    avertissementDePersistance();
    expect(titresDesLiens()).toEqual([]);
    await creerPageNommee(utilisateur, "Tenue en mémoire");

    await act(async () => {
      ouvertures.repondre();
      await laisserIndexedDbTravailler();
    });
    ouvertures.cesser();

    expect(titresDesLiens()).toEqual(["Tenue en mémoire"]);
    avertissementDePersistance();
    expect(await enregistrements(base)).toEqual(avant);
  });

  it("F-002-AC17 version de format non prise en charge : écran bloquant, aucune action, façade et persistance fermées, aucun enregistrement non vide ajouté", async () => {
    const premiere = await ouvrirCoquille();
    await creerPageNommee(premiere.utilisateur, "Écrite par cette version");
    const idEspace = await idEspaceLocal();
    const base = PREFIXE_BASE_ESPACE + idEspace;
    await enregistrerUneVersionInconnue(idEspace);
    const avant = await enregistrements(base);

    fermerLOnglet(premiere);

    const { session } = rendreApplication();

    await screen.findByRole("alert");
    ecranBloquantSansAction();
    expect(session.lireEtat().phase).toBe("version-non-prise-en-charge");
    expect(ecouteurs(docDe(session))).toBe(0);
    await laisserIndexedDbTravailler();
    const apres = await enregistrements(base);
    expect(etatRelu(apres)).toEqual(etatRelu(avant));
    expect(nonVides(apres.slice(avant.length))).toEqual([]);
    expect(nonVides(apres)).toEqual(nonVides(avant));

    // La persistance est fermée dès le refus : ce que le document reçoit ensuite n'atteint plus
    // IndexedDB.
    act(() => void docDe(session).getMap("pages").set("ecrite-apres-le-blocage", new Y.Map()));
    await laisserIndexedDbTravailler();
    expect(await enregistrements(base)).toEqual(apres);
  });

  it("F-002-AC17 version non prise en charge reçue en cours de session : écran bloquant, aucune action, plus rien d'écrit ensuite", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Avant la mise à jour");
    const base = PREFIXE_BASE_ESPACE + (await idEspaceLocal());
    const miseAJour = versionInconnueVenueDAilleurs(session);

    act(() => Y.applyUpdate(docDe(session), miseAJour));

    ecranBloquantSansAction();
    expect(session.lireEtat().phase).toBe("version-non-prise-en-charge");
    expect(ecouteurs(docDe(session))).toBe(0);

    // La persistance est fermée : ce que le document reçoit ensuite n'atteint plus IndexedDB.
    await laisserIndexedDbTravailler();
    const avant = await enregistrements(base);
    act(() => void docDe(session).getMap("pages").set("ecrite-apres-le-blocage", new Y.Map()));
    await laisserIndexedDbTravailler();
    expect(await enregistrements(base)).toEqual(avant);
    expect(session.lireEtat().phase).toBe("version-non-prise-en-charge");
  });

  it("F-002-AC1 F-002-AC31 page hôte sans élément « racine » : l'entrée lève une erreur explicite, sans démarrer de session ni créer de base", async () => {
    expect(document.getElementById("racine")).toBeNull();

    await expect(importerEntree()).rejects.toThrow("Élément #racine absent de la page hôte.");

    expect(facadesEncoreOuvertes()).toBe(0);
    await laisserIndexedDbTravailler();
    expect(await nomsDesBases()).toEqual([]);
    expect(document.body.textContent).toBe("");
  });

  it("F-002-AC26 sans crypto.randomUUID : écran d'explication annoncé, aucune base, aucune action", async () => {
    vi.stubGlobal("crypto", {});

    const { session } = rendreApplication();

    const alerte = screen.getByRole("alert");
    expect(alerte.textContent).toContain("https");
    expect(alerte.textContent).toContain("localhost");
    expect(alerte.textContent).toContain("127.0.0.1");
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryAllByRole("link")).toEqual([]);
    expect(screen.queryAllByRole("textbox")).toEqual([]);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(session.doc).toBeUndefined();
    await laisserIndexedDbTravailler();
    expect(within(document.body).getByRole("alert")).toBe(alerte);
    expect(await nomsDesBases()).toEqual([]);
  });

  it("F-002-AC26 sans l'objet crypto lui-même : même écran, aucune base", async () => {
    vi.stubGlobal("crypto", undefined);

    rendreApplication();

    expect(screen.getByRole("alert").textContent).toContain("https");
    expect(screen.queryAllByRole("button")).toEqual([]);
    await laisserIndexedDbTravailler();
    expect(await nomsDesBases()).toEqual([]);
  });

  it("F-002-AC26 crypto.randomUUID présente et isSecureContext faux : premier lancement de F-002-AC1", async () => {
    vi.stubGlobal("isSecureContext", false);
    expect(window.isSecureContext).toBe(false);

    await ouvrirCoquille();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(await boutonNouvellePage()).toBeDefined();
    expect(screen.getByRole("main").textContent).toContain("Créez-en une");
    expect(await nomsDesBases()).toHaveLength(2);
  });
});
