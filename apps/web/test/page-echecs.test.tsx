import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import { forceCloseDatabase } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";

import { creerPageNommee, ouvrirCoquille, rendreApplication } from "./aides-coquille.tsx";
import {
  basesDePage,
  contenuEnregistre,
  ecrire,
  editeurAffiche,
  idEspaceLocal,
  idPageCourante,
  refuserLesBasesDePage,
  zoneDeSaisie,
  zoneDeSaisiePresente,
} from "./aides-page.tsx";

const PREFIXE_BASE_PAGE = "notionlike:page:";
const DELAI_RELECTURE_MS = 10_000;
const TOURS_POUR_VIDER_LA_FILE = 40;

// Fournie par Node sous Vitest ; le projet n'a pas ses types (pas de @types/node).
declare function setImmediate(rappel: () => void): unknown;

const rejets: unknown[] = [];
const noterLeRejet = (evenement: PromiseRejectionEvent): void => void rejets.push(evenement.reason);
const noterLErreur = (evenement: ErrorEvent): void => void rejets.push(evenement.error);
window.addEventListener("unhandledrejection", noterLeRejet);
window.addEventListener("error", noterLErreur);

afterEach(() => {
  rejets.length = 0;
});

function avertissement(): HTMLElement {
  const alerte = screen.getByRole("alert");
  expect(alerte.textContent).toContain("ne sont pas enregistrées");
  return alerte;
}

// `fake-indexeddb` s'ordonnance par `setImmediate`, que l'horloge simulée laisse réelle.
async function laisserIndexedDbTravailler(): Promise<void> {
  await act(async () => {
    for (let tour = 0; tour < TOURS_POUR_VIDER_LA_FILE; tour += 1) {
      await new Promise<void>((resoudre) => setImmediate(resoudre));
    }
  });
}

/** Connexions ouvertes avec succès sur une base de page, dans l'ordre. */
function suivreLesConnexionsDePage(): IDBDatabase[] {
  const ouvrir = indexedDB.open.bind(indexedDB);
  const connexions: IDBDatabase[] = [];
  vi.spyOn(indexedDB, "open").mockImplementation((nom, version) => {
    const demande = ouvrir(nom, version);
    if (nom.startsWith(PREFIXE_BASE_PAGE)) {
      demande.addEventListener("success", () => connexions.push(demande.result));
    }
    return demande;
  });
  return connexions;
}

describe("page affichée : échecs de la persistance", () => {
  it("F-003-AC18 base de la page refusée : éditeur sur le document en mémoire, modifiable, avec l'avertissement, sans rien écrire", async () => {
    const { utilisateur } = await ouvrirCoquille();
    refuserLesBasesDePage();

    await creerPageNommee(utilisateur, "En mémoire");
    await ecrire("non enregistré");

    expect((await zoneDeSaisie()).textContent).toBe("non enregistré");
    avertissement();
    expect(screen.queryByRole("status")).toBeNull();
    expect(await basesDePage()).toEqual([]);
    expect(rejets).toEqual([]);
  });

  it("F-003-AC18 sans indexedDB : la page s'édite en mémoire, un seul avertissement pour l'espace et la page", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const { utilisateur } = await ouvrirCoquille();

    await creerPageNommee(utilisateur, "Sans stockage");
    await ecrire("en mémoire");

    expect((await zoneDeSaisie()).textContent).toBe("en mémoire");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    avertissement();
    expect(rejets).toEqual([]);
  });

  it("F-003-AC18 connexion de la page perdue en cours d'édition : même éditeur, contenu gardé, avertissement, plus rien d'écrit dans la base", async () => {
    const connexions = suivreLesConnexionsDePage();
    const { utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Coupée");
    await ecrire("avant la coupure");
    const editeur = await editeurAffiche();
    const idEspace = await idEspaceLocal();
    const idPage = idPageCourante();
    expect(screen.queryByRole("alert")).toBeNull();
    await waitFor(() => expect(connexions.length).toBeGreaterThan(0));

    act(() => {
      connexions.forEach((connexion) =>
        forceCloseDatabase(connexion as unknown as Parameters<typeof forceCloseDatabase>[0]),
      );
    });

    await waitFor(() => avertissement());
    expect(await editeurAffiche()).toBe(editeur);
    expect(editeur.isDestroyed).toBe(false);
    await ecrire(" et après");
    expect((await zoneDeSaisie()).textContent).toBe("avant la coupure et après");
    await new Promise((resoudre) => setTimeout(resoudre, 20));
    vi.restoreAllMocks();
    expect(await contenuEnregistre(idEspace, idPage)).toBe(
      "<paragraph>avant la coupure</paragraph>",
    );
    expect(rejets).toEqual([]);
  });

  it("F-003-AC4 F-003-AC18 relecture de la page sans réponse : chargement jusqu'à 9 999 ms, éditeur en mémoire et avertissement à 10 000 ms", async () => {
    const premiere = await ouvrirCoquille();
    await creerPageNommee(premiere.utilisateur, "Sans réponse");
    await zoneDeSaisie();
    cleanup();
    const ouvrir = indexedDB.open.bind(indexedDB);
    vi.spyOn(indexedDB, "open").mockImplementation((nom, version) =>
      nom.startsWith(PREFIXE_BASE_PAGE) ? ({} as IDBOpenDBRequest) : ouvrir(nom, version),
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    rendreApplication();
    await laisserIndexedDbTravailler();
    act(() => void vi.advanceTimersByTime(DELAI_RELECTURE_MS - 1));

    const principale = screen.getByRole("main");
    expect(within(principale).getByRole("heading", { level: 1 }).textContent).toBe("Sans réponse");
    expect(within(principale).getByRole("status").textContent).toBe("Chargement…");
    expect(zoneDeSaisiePresente()).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();

    act(() => void vi.advanceTimersByTime(1));

    expect(screen.queryByRole("status")).toBeNull();
    expect(zoneDeSaisiePresente()?.getAttribute("contenteditable")).toBe("true");
    avertissement();
    expect(rejets).toEqual([]);
  });
});
