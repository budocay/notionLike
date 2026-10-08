import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  creerDocumentEspace,
  type DocumentEspace,
  ErreurDocument,
  ouvrirDocumentEspace,
} from "../src/index.ts";

const ID_ABSENT = "00000000-0000-4000-8000-0000000000ff";

function titres(espace: DocumentEspace): string[] {
  return espace.lire().racines.map((lue) => lue.titre);
}

// La réplique part de l'état complet de la source : Yjs retient une mise à jour tant que celles
// qui la précèdent chez le même émetteur manquent.
function repliqueSynchronisee(source: DocumentEspace): DocumentEspace {
  const replique = ouvrirDocumentEspace(new Y.Doc());
  Y.applyUpdate(replique.doc, Y.encodeStateAsUpdate(source.doc));
  return replique;
}

function enregistrerLesMisesAJour(doc: Y.Doc): Uint8Array[] {
  const misesAJour: Uint8Array[] = [];
  doc.on("update", (miseAJour: Uint8Array) => {
    misesAJour.push(miseAJour);
  });
  return misesAJour;
}

describe("s'abonner à l'arborescence lue", () => {
  it("F-001-AC6 chaque opération locale qui change l'arborescence lue notifie l'abonné une fois", () => {
    const espace = creerDocumentEspace();
    const rappel = vi.fn();
    espace.abonner(rappel);

    const a = espace.creerPage("a");
    expect(rappel).toHaveBeenCalledTimes(1);

    const b = espace.creerPage("b", { parent: a });
    expect(rappel).toHaveBeenCalledTimes(2);

    espace.renommerPage(a, "A");
    expect(rappel).toHaveBeenCalledTimes(3);

    espace.deplacerPage(b, { parent: null, position: 0 });
    expect(rappel).toHaveBeenCalledTimes(4);

    espace.mettreALaCorbeille(a);
    expect(rappel).toHaveBeenCalledTimes(5);
  });

  it("F-001-AC6 pendant la notification, lire() rend déjà la nouvelle arborescence", () => {
    const espace = creerDocumentEspace();
    const lus: string[][] = [];
    espace.abonner(() => lus.push(titres(espace)));

    espace.creerPage("a");
    espace.creerPage("b");

    expect(lus).toEqual([["a"], ["a", "b"]]);
  });

  it("F-001-AC6 une opération sans effet ne notifie pas", () => {
    const espace = creerDocumentEspace();
    const a = espace.creerPage("a");
    espace.creerPage("b");
    const rappel = vi.fn();
    espace.abonner(rappel);

    espace.renommerPage(a, "a");
    espace.deplacerPage(a, { parent: null, position: 0 });

    expect(rappel).not.toHaveBeenCalled();
  });

  it("F-001-AC6 une opération refusée ne notifie pas", () => {
    const espace = creerDocumentEspace();
    const a = espace.creerPage("a");
    const rappel = vi.fn();
    espace.abonner(rappel);

    expect(() => espace.renommerPage(ID_ABSENT, "x")).toThrow(ErreurDocument);
    expect(() => espace.deplacerPage(a, { parent: a })).toThrow(ErreurDocument);
    expect(() => espace.creerPage("x", { parent: ID_ABSENT })).toThrow(ErreurDocument);
    expect(() => espace.mettreALaCorbeille(ID_ABSENT)).toThrow(ErreurDocument);

    expect(rappel).not.toHaveBeenCalled();
  });

  it("F-001-AC6 chaque mise à jour reçue notifie l'abonné une fois, et la réplique lit la même arborescence", () => {
    const source = creerDocumentEspace();
    const replique = repliqueSynchronisee(source);
    const rappel = vi.fn();
    replique.abonner(rappel);
    const misesAJour = enregistrerLesMisesAJour(source.doc);
    const a = source.creerPage("a");
    const b = source.creerPage("b", { parent: a });
    source.renommerPage(a, "A");
    source.deplacerPage(b, { parent: null, position: 0 });
    source.mettreALaCorbeille(a);

    expect(misesAJour).toHaveLength(5);
    misesAJour.forEach((miseAJour, rang) => {
      Y.applyUpdate(replique.doc, miseAJour);
      expect(rappel).toHaveBeenCalledTimes(rang + 1);
    });

    expect(replique.lire()).toEqual(source.lire());
  });

  it("F-001-AC6 une mise à jour reçue qui ne change que la corbeille notifie l'abonné une fois", () => {
    const source = creerDocumentEspace();
    const page = source.creerPage("Ancien titre");
    const replique = repliqueSynchronisee(source);
    replique.mettreALaCorbeille(page);
    const rappel = vi.fn();
    replique.abonner(rappel);
    const misesAJour = enregistrerLesMisesAJour(source.doc);

    source.renommerPage(page, "Nouveau titre");
    misesAJour.forEach((miseAJour) => Y.applyUpdate(replique.doc, miseAJour));

    expect(rappel).toHaveBeenCalledTimes(1);
    expect(replique.lire()).toEqual({
      racines: [],
      corbeille: [{ id: page, titre: "Nouveau titre", enfants: [] }],
    });
  });

  it("F-001-AC6 une mise à jour déjà appliquée ne notifie pas et laisse la référence de lire() inchangée", () => {
    const source = creerDocumentEspace();
    const replique = repliqueSynchronisee(source);
    const misesAJour = enregistrerLesMisesAJour(source.doc);
    source.creerPage("a");
    misesAJour.forEach((miseAJour) => Y.applyUpdate(replique.doc, miseAJour));
    const rappel = vi.fn();
    replique.abonner(rappel);
    const lue = replique.lire();

    misesAJour.forEach((miseAJour) => Y.applyUpdate(replique.doc, miseAJour));

    expect(rappel).not.toHaveBeenCalled();
    expect(replique.lire()).toBe(lue);
  });

  it("F-001-AC6 une transaction qui ne change pas l'arborescence lue ne notifie pas", () => {
    const espace = creerDocumentEspace();
    espace.creerPage("a");
    const rappel = vi.fn();
    espace.abonner(rappel);
    const lue = espace.lire();

    espace.doc.getMap("hors-arborescence").set("cle", "valeur");

    expect(rappel).not.toHaveBeenCalled();
    expect(espace.lire()).toBe(lue);
  });

  it("F-001-AC6 plusieurs opérations dans une même transaction Yjs donnent une seule notification", () => {
    const espace = creerDocumentEspace();
    const rappel = vi.fn();
    espace.abonner(rappel);

    espace.doc.transact(() => {
      const a = espace.creerPage("a");
      espace.creerPage("fille de a", { parent: a });
      espace.creerPage("b");
      espace.creerPage("c");
    });

    expect(rappel).toHaveBeenCalledTimes(1);
    expect(titres(espace)).toEqual(["a", "b", "c"]);
    expect(espace.lire().racines[0]?.enfants.map((lue) => lue.titre)).toEqual(["fille de a"]);
  });

  it("F-001-AC6 après son désabonnement, un abonné n'est plus notifié", () => {
    const espace = creerDocumentEspace();
    const rappel = vi.fn();
    const desabonner = espace.abonner(rappel);
    espace.creerPage("a");

    desabonner();
    desabonner();
    espace.creerPage("b");

    expect(rappel).toHaveBeenCalledTimes(1);
  });

  it("F-001-AC6 chaque abonné est notifié une fois, et le désabonnement de l'un laisse les autres abonnés", () => {
    const espace = creerDocumentEspace();
    const premier = vi.fn();
    const second = vi.fn();
    const desabonnerLePremier = espace.abonner(premier);
    espace.abonner(second);

    espace.creerPage("a");
    desabonnerLePremier();
    espace.creerPage("b");

    expect(premier).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("F-001-AC6 un même rappel abonné deux fois compte pour deux abonnés", () => {
    const espace = creerDocumentEspace();
    const rappel = vi.fn();
    const desabonnerUneFois = espace.abonner(rappel);
    espace.abonner(rappel);

    espace.creerPage("a");
    expect(rappel).toHaveBeenCalledTimes(2);

    desabonnerUneFois();
    espace.creerPage("b");
    expect(rappel).toHaveBeenCalledTimes(3);
  });

  it("F-001-AC6 un abonné qui se désabonne pendant la notification n'empêche pas les suivants d'être notifiés", () => {
    const espace = creerDocumentEspace();
    const suivant = vi.fn();
    const desabonner = espace.abonner(() => desabonner());
    espace.abonner(suivant);

    espace.creerPage("a");
    espace.creerPage("b");

    expect(suivant).toHaveBeenCalledTimes(2);
  });

  it("F-001-AC6 un abonné désabonné pendant la notification par un abonné inscrit avant lui n'est pas notifié", () => {
    const espace = creerDocumentEspace();
    const second = vi.fn();
    const desabonnerLeSecond: { appeler: () => void } = { appeler: () => undefined };
    const premier = vi.fn(() => desabonnerLeSecond.appeler());
    espace.abonner(premier);
    desabonnerLeSecond.appeler = espace.abonner(second);

    espace.creerPage("a");

    expect(premier).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("F-001-AC6 deux façades ouvertes sur le même Y.Doc sont notifiées l'une et l'autre", () => {
    const espace = creerDocumentEspace();
    const autreFacade = ouvrirDocumentEspace(espace.doc);
    const rappel = vi.fn();
    autreFacade.abonner(rappel);

    espace.creerPage("a");

    expect(rappel).toHaveBeenCalledTimes(1);
    expect(autreFacade.lire()).toEqual(espace.lire());
  });

  it("F-001-AC6 lire() rend la même référence tant que rien n'a changé, et une autre après un changement", () => {
    const espace = creerDocumentEspace();
    const a = espace.creerPage("a");
    const avant = espace.lire();

    expect(espace.lire()).toBe(avant);
    espace.renommerPage(a, "a");
    expect(() => espace.renommerPage(ID_ABSENT, "x")).toThrow(ErreurDocument);
    expect(espace.lire()).toBe(avant);

    espace.renommerPage(a, "A");

    expect(espace.lire()).not.toBe(avant);
    expect(espace.lire()).toBe(espace.lire());
    expect(titres(espace)).toEqual(["A"]);
  });
});
