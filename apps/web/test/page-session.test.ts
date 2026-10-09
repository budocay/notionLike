import { eleverVersionPage, ouvrirDocumentPage } from "@notionlike/document";
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  type EtatSessionPage,
  ouvrirSessionPage,
  type SessionPage,
} from "../src/page/session-page.ts";
import { ErreurPersistance } from "../src/persistance/index.ts";
import { basesDePage, contenuEnregistre, enregistrerPage } from "./aides-page.tsx";

const ESPACE = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const PAGE = "3f2e1d0c-9b8a-4c7d-8e6f-5a4b3c2d1e0f";
const DELAI_RELECTURE_MS = 10_000;

const QUATRE_TYPES =
  '<heading level="1">Titre</heading><paragraph>Texte</paragraph>' +
  "<bulletlist><listitem><paragraph>un</paragraph>" +
  "<bulletlist><listitem><paragraph>deux</paragraph></listitem></bulletlist></listitem></bulletlist>" +
  '<orderedlist start="1"><listitem><paragraph>premier</paragraph></listitem></orderedlist>';

afterEach(() => {
  vi.useRealTimers();
});

function bloc(nom: string, texte: string, attributs: Record<string, number> = {}): Y.XmlElement {
  const element = new Y.XmlElement(nom);
  Object.entries(attributs).forEach(([cle, valeur]) => element.setAttribute(cle, valeur as never));
  element.insert(0, [new Y.XmlText(texte)]);
  return element;
}

function elementDeListe(texte: string, ...suite: Y.XmlElement[]): Y.XmlElement {
  const element = new Y.XmlElement("listItem");
  element.insert(0, [bloc("paragraph", texte), ...suite]);
  return element;
}

function liste(
  nom: string,
  attributs: Record<string, number>,
  ...elements: Y.XmlElement[]
): Y.XmlElement {
  const element = new Y.XmlElement(nom);
  Object.entries(attributs).forEach(([cle, valeur]) => element.setAttribute(cle, valeur as never));
  element.insert(0, elements);
  return element;
}

// Les quatre types de blocs et une liste imbriquée, dans la forme que la liaison écrit.
function ecrireLesQuatreTypes(doc: Y.Doc): void {
  ouvrirDocumentPage(doc).contenu.insert(0, [
    bloc("heading", "Titre", { level: 1 }),
    bloc("paragraph", "Texte"),
    liste("bulletList", {}, elementDeListe("un", liste("bulletList", {}, elementDeListe("deux")))),
    liste("orderedList", { start: 1 }, elementDeListe("premier")),
  ]);
}

async function sessionPrete(
  session: SessionPage,
): Promise<Extract<EtatSessionPage, { phase: "pret" }>> {
  await waitFor(() => expect(session.lireEtat().phase).toBe("pret"));
  const etat = session.lireEtat();
  if (etat.phase !== "pret") {
    throw new Error("La session n'est pas prête.");
  }
  return etat;
}

describe("session de page", () => {
  it("F-003-AC1 la session enregistre le document dans la base notionlike:page:<idEspace>:<idPage>, nommée par le module de persistance", async () => {
    const session = ouvrirSessionPage(ESPACE, PAGE);

    await sessionPrete(session);

    expect(await basesDePage()).toEqual([`notionlike:page:${ESPACE}:${PAGE}`]);
    expect(() => ouvrirSessionPage("pas-un-espace", PAGE)).toThrow(ErreurPersistance);
    session.fermer();
  });

  it("F-003-AC4 chargement tant que la relecture n'a pas abouti, puis prêt et enregistré, abonnés notifiés", async () => {
    const session = ouvrirSessionPage(ESPACE, PAGE);
    const phases: string[] = [];
    session.abonner(() => phases.push(session.lireEtat().phase));

    expect(session.lireEtat()).toEqual({ phase: "chargement" });
    const etat = await sessionPrete(session);

    expect(etat.enregistre).toBe(true);
    expect(etat.page.contenu).toBeInstanceOf(Y.XmlFragment);
    expect(phases).toEqual(["pret"]);
    session.fermer();
  });

  it("F-003-AC2 ouvrir une page qui n'a jamais existé n'émet aucune mise à jour Yjs sur son document", async () => {
    const session = ouvrirSessionPage(ESPACE, PAGE);
    const misesAJour: unknown[] = [];
    session.doc.on("update", (miseAJour: Uint8Array) => misesAJour.push(miseAJour));

    await sessionPrete(session);
    session.fermer();

    expect(misesAJour).toEqual([]);
    expect([...Y.encodeStateAsUpdate(session.doc)]).toEqual([0, 0]);
    expect(await contenuEnregistre(ESPACE, PAGE)).toBe("");
  });

  it("F-003-AC25 les quatre types de blocs et une liste imbriquée, enregistrés par la session, se relisent dans un document vierge", async () => {
    const session = ouvrirSessionPage(ESPACE, PAGE);
    await sessionPrete(session);

    ecrireLesQuatreTypes(session.doc);
    session.fermer();

    expect(await contenuEnregistre(ESPACE, PAGE)).toBe(QUATRE_TYPES);
  });

  it("F-003-AC3 une seconde session sur la même page relit le contenu avant de se dire prête", async () => {
    await enregistrerPage(ESPACE, PAGE, ecrireLesQuatreTypes);

    const session = ouvrirSessionPage(ESPACE, PAGE);
    const etat = await sessionPrete(session);

    expect(etat.page.contenu.toString()).toBe(QUATRE_TYPES);
    session.fermer();
  });

  it("F-003-AC5 fermer aussitôt après une modification la conserve ; après la fermeture, plus rien n'est écrit ni publié", async () => {
    const session = ouvrirSessionPage(ESPACE, PAGE);
    const { page } = await sessionPrete(session);
    const publications: string[] = [];
    session.abonner(() => publications.push(session.lireEtat().phase));

    page.contenu.insert(0, [bloc("paragraph", "écrit avant de quitter")]);
    session.fermer();
    page.contenu.insert(1, [bloc("paragraph", "écrit après la fermeture")]);
    eleverVersionPage(session.doc, 2);

    expect(await contenuEnregistre(ESPACE, PAGE)).toBe(
      "<paragraph>écrit avant de quitter</paragraph>",
    );
    expect(publications).toEqual([]);
  });

  it("F-003-AC5 deux pages d'un même espace ont chacune leur base : écrire dans l'une ne touche pas l'autre", async () => {
    const autrePage = "9d8c7b6a-5f4e-4d3c-a2b1-0f9e8d7c6b5a";
    const premiere = ouvrirSessionPage(ESPACE, PAGE);
    (await sessionPrete(premiere)).page.contenu.insert(0, [bloc("paragraph", "première")]);
    premiere.fermer();

    const seconde = ouvrirSessionPage(ESPACE, autrePage);
    (await sessionPrete(seconde)).page.contenu.insert(0, [bloc("paragraph", "seconde")]);
    seconde.fermer();

    expect(await contenuEnregistre(ESPACE, PAGE)).toBe("<paragraph>première</paragraph>");
    expect(await contenuEnregistre(ESPACE, autrePage)).toBe("<paragraph>seconde</paragraph>");
  });

  it("F-003-AC4 F-003-AC18 relecture sans réponse : chargement jusqu'à 9 999 ms, page en mémoire non enregistrée à 10 000 ms", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(indexedDB, "open").mockImplementation(() => ({}) as IDBOpenDBRequest);

    const session = ouvrirSessionPage(ESPACE, PAGE);
    vi.advanceTimersByTime(DELAI_RELECTURE_MS - 1);
    expect(session.lireEtat().phase).toBe("chargement");

    vi.advanceTimersByTime(1);

    const etat = session.lireEtat();
    expect(etat.phase === "pret" && !etat.enregistre).toBe(true);
    session.fermer();
  });
});
