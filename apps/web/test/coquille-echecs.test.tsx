import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { ouvrirPersistance } from "../src/persistance/index.ts";
import {
  boutonNouvellePage,
  creerPageNommee,
  docDe,
  nomsDesBases,
  ouvrirCoquille,
  rendreApplication,
} from "./aides-coquille.tsx";

const PREFIXE_BASE_ESPACE = "notionlike:espace:";
const DELAI_RELECTURE_MS = 10_000;

function avertissementDePersistance(): HTMLElement {
  const alerte = screen.getByRole("alert");
  expect(alerte.textContent).toContain("enregistrées");
  return alerte;
}

async function idEspaceLocal(): Promise<string> {
  const base = (await nomsDesBases()).find((nom) => nom.startsWith(PREFIXE_BASE_ESPACE));
  if (base === undefined) {
    throw new Error("Aucune base d'espace sur l'appareil simulé.");
  }
  return base.slice(PREFIXE_BASE_ESPACE.length);
}

// Lecture directe du magasin de la bibliothèque : un tableau d'octets par mise à jour stockée.
function enregistrements(nomBase: string): Promise<number[][]> {
  return new Promise((resoudre, rejeter) => {
    const ouverture = indexedDB.open(nomBase);
    ouverture.onerror = () => rejeter(new Error("ouverture refusée"));
    ouverture.onsuccess = () => {
      const base = ouverture.result;
      const lecture = base.transaction("updates").objectStore("updates").getAll();
      lecture.onerror = () => rejeter(new Error("lecture refusée"));
      lecture.onsuccess = () => {
        base.close();
        resoudre((lecture.result as Uint8Array[]).map((octets) => [...octets]));
      };
    };
  });
}

function etatRelu(misesAJour: number[][]): number[] {
  const doc = new Y.Doc();
  misesAJour.forEach((octets) => Y.applyUpdate(doc, Uint8Array.from(octets)));
  return [...Y.encodeStateAsUpdate(doc)];
}

// Un document d'une version de format que cette application ne connaît pas, enregistré à la
// place de l'espace local par le module de persistance lui-même.
async function enregistrerUneVersionInconnue(idEspace: string): Promise<void> {
  const doc = new Y.Doc();
  doc.getMap("meta").set("version", 2);
  doc.getMap("pages").set("page-d-une-autre-version", new Y.Map());
  const persistance = ouvrirPersistance(doc, { type: "espace", idEspace });
  await waitFor(() => expect(persistance.etat()).toBe("active"));
  persistance.fermer();
}

// Ce qu'une réplique tenue par une application plus récente enverrait : la version seule change.
function versionInconnueVenueDAilleurs(doc: Y.Doc): Uint8Array {
  const replique = new Y.Doc();
  Y.applyUpdate(replique, Y.encodeStateAsUpdate(doc));
  const etatAvant = Y.encodeStateVector(replique);
  replique.getMap("meta").set("version", 2);
  return Y.encodeStateAsUpdate(replique, etatAvant);
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

  it("F-002-AC16 ouverture de la base refusée : même session en mémoire, avec l'avertissement", async () => {
    vi.spyOn(indexedDB, "open").mockImplementation(() => {
      throw new DOMException("refus", "SecurityError");
    });

    const { utilisateur } = await ouvrirCoquille();

    avertissementDePersistance();
    await creerPageNommee(utilisateur, "Malgré le refus");
    expect(await nomsDesBases()).toEqual([]);
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

  it("F-002-AC17 version de format non prise en charge : écran bloquant, aucune action, rien d'écrit", async () => {
    const premiere = await ouvrirCoquille();
    await creerPageNommee(premiere.utilisateur, "Écrite par cette version");
    const idEspace = await idEspaceLocal();
    await enregistrerUneVersionInconnue(idEspace);
    const avant = await enregistrements(PREFIXE_BASE_ESPACE + idEspace);
    cleanup();

    rendreApplication();

    const alerte = await screen.findByRole("alert");
    expect(alerte.textContent).toContain("à jour");
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryAllByRole("link")).toEqual([]);
    expect(screen.queryAllByRole("textbox")).toEqual([]);
    expect(screen.queryByRole("navigation")).toBeNull();
    const apres = await enregistrements(PREFIXE_BASE_ESPACE + idEspace);
    expect(etatRelu(apres)).toEqual(etatRelu(avant));
    expect(
      apres.slice(avant.length).filter((octets) => octets.some((octet) => octet !== 0)),
    ).toEqual([]);
  });

  it("F-002-AC17 version non prise en charge reçue en cours de session : écran bloquant, aucune action, plus rien d'écrit ensuite", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Avant la mise à jour");
    const base = PREFIXE_BASE_ESPACE + (await idEspaceLocal());
    const miseAJour = versionInconnueVenueDAilleurs(docDe(session));

    act(() => Y.applyUpdate(docDe(session), miseAJour));

    const alerte = screen.getByRole("alert");
    expect(alerte.textContent).toContain("à jour");
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryAllByRole("link")).toEqual([]);
    expect(screen.queryAllByRole("textbox")).toEqual([]);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(session.lireEtat().phase).toBe("version-non-prise-en-charge");

    // La persistance est fermée : ce que le document reçoit ensuite n'atteint plus IndexedDB.
    await new Promise((resoudre) => setTimeout(resoudre, 20));
    const avant = await enregistrements(base);
    act(() => void docDe(session).getMap("pages").set("ecrite-apres-le-blocage", new Y.Map()));
    await new Promise((resoudre) => setTimeout(resoudre, 20));
    expect(await enregistrements(base)).toEqual(avant);
    expect(session.lireEtat().phase).toBe("version-non-prise-en-charge");
  });

  it("F-002-AC26 sans crypto.randomUUID : écran d'explication annoncé, aucune base, aucune action", async () => {
    vi.stubGlobal("crypto", {});

    const { session } = rendreApplication();

    const alerte = screen.getByRole("alert");
    expect(alerte.textContent).toContain("https");
    expect(alerte.textContent).toContain("localhost");
    expect(alerte.textContent).toContain("127.0.0.1");
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(session.doc).toBeUndefined();
    await new Promise((resoudre) => setTimeout(resoudre, 20));
    expect(within(document.body).getByRole("alert")).toBe(alerte);
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
