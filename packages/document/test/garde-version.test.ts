import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { type DocumentPage, eleverVersionPage, ouvrirDocumentPage } from "../src/index.ts";

const NOEUD_INCONNU = "noeudInconnu";

type Ecriture = (doc: Y.Doc) => void;

const ecrireLaVersion: Ecriture = (doc) => eleverVersionPage(doc, 2);
const ecrireLeNoeud: Ecriture = (doc) =>
  doc.getXmlFragment("contenu").insert(0, [new Y.XmlElement(NOEUD_INCONNU)]);

/** Une mise à jour par transaction d'une réplique distante, dans l'ordre d'émission. */
function misesAJourDistantes(...transactions: Ecriture[][]): Uint8Array[] {
  const distant = new Y.Doc();
  const emises: Uint8Array[] = [];
  distant.on("update", (miseAJour: Uint8Array) => emises.push(miseAJour));
  for (const ecritures of transactions) {
    distant.transact(() => ecritures.forEach((ecrire) => ecrire(distant)));
  }
  return emises;
}

interface PageSurveillee {
  readonly page: DocumentPage;
  /** « liaison » : doublure de la liaison de l'éditeur, observateur profond du fragment. */
  readonly journal: string[];
  readonly emises: Uint8Array[];
  readonly desabonner: () => void;
}

// La doublure s'abonne avant la garde : l'ordre d'abonnement ne doit rien décider.
function surveiller(): PageSurveillee {
  const doc = new Y.Doc();
  const page = ouvrirDocumentPage(doc);
  const journal: string[] = [];
  const emises: Uint8Array[] = [];
  page.contenu.observeDeep(() => journal.push("liaison"));
  const desabonner = page.garderVersion(() => journal.push("garde"));
  doc.on("update", (miseAJour: Uint8Array, origine: unknown) => {
    if (origine !== "reçue") {
      emises.push(miseAJour);
    }
  });
  return { page, journal, emises, desabonner };
}

function recevoir({ page }: PageSurveillee, misesAJour: readonly Uint8Array[]): void {
  misesAJour.forEach((miseAJour) => Y.applyUpdate(page.doc, miseAJour, "reçue"));
}

function nomsDesNoeuds({ contenu }: DocumentPage): string[] {
  return contenu.toArray().map((noeud) => (noeud instanceof Y.XmlElement ? noeud.nodeName : ""));
}

describe("garde de version du document de page", () => {
  it("F-003-AC29 cas 1, la version puis le nœud en deux mises à jour : la garde est appelée dès la première, avant toute liaison", () => {
    const surveillee = surveiller();
    const [version, noeud] = misesAJourDistantes([ecrireLaVersion], [ecrireLeNoeud]);

    recevoir(surveillee, [version as Uint8Array]);
    expect(surveillee.journal).toEqual(["garde"]);

    recevoir(surveillee, [noeud as Uint8Array]);
    expect(surveillee.journal).toEqual(["garde", "liaison"]);
    expect(surveillee.emises).toEqual([]);
  });

  it.each([
    { cas: "cas 2, la version puis le nœud", ecritures: [ecrireLaVersion, ecrireLeNoeud] },
    { cas: "cas 3, le nœud puis la version", ecritures: [ecrireLeNoeud, ecrireLaVersion] },
  ])(
    "F-003-AC29 $cas dans une même mise à jour : la garde passe avant l'observateur profond du fragment",
    ({ ecritures }) => {
      const surveillee = surveiller();

      recevoir(surveillee, misesAJourDistantes(ecritures));

      expect(surveillee.journal).toEqual(["garde", "liaison"]);
      expect(nomsDesNoeuds(surveillee.page)).toEqual([NOEUD_INCONNU]);
      expect(surveillee.emises).toEqual([]);
    },
  );

  it("F-003-AC29 une modification du seul contenu n'appelle pas la garde", () => {
    const surveillee = surveiller();

    recevoir(surveillee, misesAJourDistantes([ecrireLeNoeud]));
    surveillee.page.contenu.insert(0, [new Y.XmlElement("paragraph")]);

    expect(surveillee.journal).toEqual(["liaison", "liaison"]);
  });

  it("F-003-AC29 la garde est appelée à chaque modification qui laisse le document non pris en charge, élévation locale comprise", () => {
    const surveillee = surveiller();

    recevoir(surveillee, misesAJourDistantes([ecrireLaVersion]));
    eleverVersionPage(surveillee.page.doc, 3);

    expect(surveillee.journal).toEqual(["garde", "garde"]);
  });

  it("F-003-AC29 une forme stockée qui reçoit autre chose qu'un entier >= 1 appelle la garde", () => {
    const surveillee = surveiller();

    recevoir(surveillee, misesAJourDistantes([(doc) => doc.getArray("versions").push(["2"])]));

    expect(surveillee.journal).toEqual(["garde"]);
  });

  it("F-003-AC29 après désabonnement la garde n'est plus appelée, et les autres abonnés le restent", () => {
    const surveillee = surveiller();
    let autresAppels = 0;
    surveillee.page.garderVersion(() => (autresAppels += 1));

    surveillee.desabonner();
    recevoir(surveillee, misesAJourDistantes([ecrireLaVersion]));

    expect(surveillee.journal).toEqual([]);
    expect(autresAppels).toBe(1);
  });
});
