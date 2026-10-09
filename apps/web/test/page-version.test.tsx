import { eleverVersionPage, lireVersionPage, ouvrirDocumentPage } from "@notionlike/document";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import type { ProprietesEditeurDePage } from "../src/edition/index.ts";
import type { SessionPage } from "../src/page/session-page.ts";
import { creerPageNommee, ouvrirCoquille } from "./aides-coquille.tsx";
import {
  ecrire,
  editeurAffiche,
  enregistrerPage,
  idEspaceLocal,
  idPageCourante,
  zoneDeSaisie,
  zoneDeSaisiePresente,
} from "./aides-page.tsx";

interface SessionSuivie {
  readonly session: SessionPage;
  /** Origine de chaque mise à jour émise par le document de la session, depuis son ouverture. */
  readonly origines: unknown[];
}

const suivi = vi.hoisted(() => ({ sessions: [] as SessionSuivie[], montages: 0 }));

// La session réelle, suivie : le test atteint son document comme la synchronisation le fera.
vi.mock("../src/page/session-page.ts", async (importer) => {
  const reel = await importer<typeof import("../src/page/session-page.ts")>();
  return {
    ...reel,
    ouvrirSessionPage: (...arguments_: Parameters<typeof reel.ouvrirSessionPage>) => {
      const session = reel.ouvrirSessionPage(...arguments_);
      const origines: unknown[] = [];
      session.doc.on("update", (_miseAJour: Uint8Array, origine: unknown) =>
        origines.push(origine),
      );
      suivi.sessions.push({ session, origines });
      return session;
    },
  };
});

// Le module d'édition réel, dont chaque montage d'éditeur est compté.
vi.mock("../src/edition/index.ts", async (importer) => {
  const reel = await importer<typeof import("../src/edition/index.ts")>();
  return {
    ...reel,
    EditeurDePage: (proprietes: ProprietesEditeurDePage) => {
      suivi.montages += 1;
      return createElement(reel.EditeurDePage, proprietes);
    },
  };
});

const DISTANT = "mise à jour reçue";

beforeEach(() => {
  suivi.sessions.length = 0;
  suivi.montages = 0;
});

function sessionCourante(): SessionSuivie {
  const derniere = suivi.sessions.at(-1);
  if (derniere === undefined) {
    throw new Error("Aucune session de page ouverte.");
  }
  return derniere;
}

function nomDuConstructeur(origine: unknown): string {
  return typeof origine === "object" && origine !== null
    ? origine.constructor.name
    : String(origine);
}

function ecrireUnNoeudInconnu(doc: Y.Doc): void {
  const inconnu = new Y.XmlElement("futureBlock");
  inconnu.insert(0, [new Y.XmlText("contenu d'une version future")]);
  const { length } = doc.getXmlFragment("contenu");
  doc.getXmlFragment("contenu").insert(length, [inconnu]);
}

function ecrireUneMarqueInconnue(doc: Y.Doc): void {
  const paragraphe = new Y.XmlElement("paragraph");
  const texte = new Y.XmlText();
  paragraphe.insert(0, [texte]);
  doc.getXmlFragment("contenu").insert(0, [paragraphe]);
  texte.insert(0, "normal ");
  texte.insert(texte.length, "gras", { bold: true });
}

/** Mises à jour qu'une application plus récente enverrait, parties de l'état de la session. */
function misesAJourDistantes(doc: Y.Doc, ...etapes: ((replique: Y.Doc) => void)[]): Uint8Array[] {
  const replique = new Y.Doc();
  Y.applyUpdate(replique, Y.encodeStateAsUpdate(doc));
  return etapes.map((etape) => {
    const avant = Y.encodeStateVector(replique);
    replique.transact(() => etape(replique));
    return Y.encodeStateAsUpdate(replique, avant);
  });
}

function messageDeMiseAJour(): HTMLElement {
  const alerte = within(screen.getByRole("main")).getByRole("alert");
  expect(alerte.textContent).toContain("Mettez l'application à jour");
  return alerte;
}

async function ouvrirUnePageEcrite(): Promise<SessionSuivie> {
  const { utilisateur } = await ouvrirCoquille();
  await creerPageNommee(utilisateur, "Affichée");
  await ecrire("écrit par cette version");
  return sessionCourante();
}

describe("version du document de page", () => {
  it("F-003-AC19 document de version non prise en charge, avec un nœud et une marque inconnus : aucun éditeur, aucune mise à jour, état identique octet pour octet", async () => {
    const premiere = await ouvrirCoquille();
    await creerPageNommee(premiere.utilisateur, "Récente");
    await zoneDeSaisie();
    const idEspace = await idEspaceLocal();
    const idPage = idPageCourante();
    cleanup();
    const prepare = await enregistrerPage(idEspace, idPage, (doc) => {
      eleverVersionPage(doc, 2);
      ecrireUneMarqueInconnue(doc);
      ecrireUnNoeudInconnu(doc);
    });
    const etatAvant = [...Y.encodeStateAsUpdate(prepare)];
    suivi.sessions.length = 0;
    suivi.montages = 0;

    await ouvrirCoquille();

    await waitFor(() => messageDeMiseAJour());
    const { session, origines } = sessionCourante();
    expect(session.lireEtat().phase).toBe("version-non-prise-en-charge");
    expect(suivi.montages).toBe(0);
    expect(zoneDeSaisiePresente()).toBeNull();
    expect(document.querySelector(".ProseMirror, [contenteditable]")).toBeNull();
    expect(screen.queryByRole("toolbar")).toBeNull();
    // Seule la relecture a parlé au document : rien n'est né dans l'onglet.
    expect(origines.map(nomDuConstructeur).filter((nom) => nom !== "IndexeddbPersistence")).toEqual(
      [],
    );
    expect([...Y.encodeStateAsUpdate(session.doc)]).toEqual(etatAvant);
    expect(lireVersionPage(session.doc)).toBe(2);
    expect(session.doc.getXmlFragment("contenu").toString()).toContain("futureblock");
  });

  it("F-003-AC19 la page refusée laisse la barre latérale utilisable : une autre page s'ouvre et s'édite", async () => {
    const premiere = await ouvrirCoquille();
    await creerPageNommee(premiere.utilisateur, "Récente");
    await zoneDeSaisie();
    const idEspace = await idEspaceLocal();
    await enregistrerPage(idEspace, idPageCourante(), (doc) => eleverVersionPage(doc, 2));
    cleanup();

    const { utilisateur } = await ouvrirCoquille();
    await waitFor(() => messageDeMiseAJour());
    expect(within(screen.getByRole("main")).getByRole("heading", { level: 1 }).textContent).toBe(
      "Récente",
    );
    await creerPageNommee(utilisateur, "Lisible");

    await ecrire("toujours possible");

    expect((await zoneDeSaisie()).textContent).toBe("toujours possible");
    expect(within(screen.getByRole("main")).queryByRole("alert")).toBeNull();
    expect(screen.getByRole("link", { name: "Récente" })).toBeDefined();
  });

  it.each([
    [
      "(1) la version seule, puis le nœud dans une seconde mise à jour",
      [(doc: Y.Doc) => eleverVersionPage(doc, 2), ecrireUnNoeudInconnu],
    ],
    [
      "(2) une seule mise à jour : la version puis le nœud",
      [
        (doc: Y.Doc) => {
          eleverVersionPage(doc, 2);
          ecrireUnNoeudInconnu(doc);
        },
      ],
    ],
    [
      "(3) une seule mise à jour : le nœud puis la version",
      [
        (doc: Y.Doc) => {
          ecrireUnNoeudInconnu(doc);
          eleverVersionPage(doc, 2);
        },
      ],
    ],
  ])(
    "F-003-AC29 version non prise en charge reçue pendant l'affichage, %s : éditeur détruit, nœud conservé, aucune mise à jour de l'onglet",
    async (_cas, etapes) => {
      const { session, origines } = await ouvrirUnePageEcrite();
      const editeur = await editeurAffiche();
      const misesAJour = misesAJourDistantes(session.doc, ...etapes);
      origines.length = 0;

      act(() => misesAJour.forEach((miseAJour) => Y.applyUpdate(session.doc, miseAJour, DISTANT)));

      expect(editeur.isDestroyed).toBe(true);
      expect(zoneDeSaisiePresente()).toBeNull();
      expect(document.querySelector(".ProseMirror")).toBeNull();
      messageDeMiseAJour();
      expect(session.lireEtat().phase).toBe("version-non-prise-en-charge");
      const lu = session.doc.getXmlFragment("contenu").toString();
      expect(lu).toContain("<futureblock>contenu d'une version future</futureblock>");
      expect(lu).toContain("<paragraph>écrit par cette version</paragraph>");
      await new Promise((resoudre) => setTimeout(resoudre, 20));
      expect(origines.filter((origine) => origine !== DISTANT)).toEqual([]);
      expect(screen.getByRole("button", { name: "Nouvelle page" })).toBeDefined();
    },
  );

  it("F-003-AC29 témoin : une version prise en charge reçue laisse l'éditeur en place, et l'ouverture d'une page saine ne monte qu'un éditeur à la fois", async () => {
    const { session } = await ouvrirUnePageEcrite();
    const editeur = await editeurAffiche();
    const [miseAJour] = misesAJourDistantes(session.doc, (doc) => {
      const paragraphe = new Y.XmlElement("paragraph");
      paragraphe.insert(0, [new Y.XmlText("reçu")]);
      doc.getXmlFragment("contenu").insert(1, [paragraphe]);
    });

    act(() => Y.applyUpdate(session.doc, miseAJour ?? new Uint8Array(), DISTANT));

    expect(editeur.isDestroyed).toBe(false);
    expect(await editeurAffiche()).toBe(editeur);
    expect((await zoneDeSaisie()).textContent).toBe("écrit par cette versionreçu");
    expect(screen.getAllByRole("textbox", { name: "Contenu de la page" })).toHaveLength(1);
    expect(suivi.montages).toBeGreaterThan(0);
    expect(() => ouvrirDocumentPage(session.doc)).not.toThrow();
  });
});
