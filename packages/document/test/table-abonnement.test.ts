// F-017-AC9 : abonnement à la table lue (une notification par transaction qui la change, aucune
// sinon, plus rien après désabonnement), garde des rappels qui lèvent, et fermeture de la façade.
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  creerDocumentTable,
  type DocumentTable,
  ErreurDocument,
  ouvrirDocumentTable,
} from "../src/index.ts";
import { GRAINE, NOMBRE_EXECUTIONS } from "./aides.ts";
// Documents d'espace produits par creerDocumentEspace, par l'aide suivie de F-007 (F-002-AC31).
import { creerSuivie, fermerLesSuivies } from "./aides-corbeille.ts";
import {
  appliquer,
  creerRepliqueDeTable,
  fixerDesIdentifiantsDisperses,
  livrer,
  ORIGINE_RECUE,
  refus,
  refusDe,
  suiteDeCommandes,
} from "./aides-table.ts";

afterEach(() => {
  vi.restoreAllMocks();
  expect(fermerLesSuivies()).toBe(0);
});

function compteur(table: DocumentTable): { readonly valeur: () => number; arreter: () => void } {
  let notifications = 0;
  const arreter = table.abonner(() => {
    notifications += 1;
  });
  return { valeur: () => notifications, arreter };
}

/** La table lue par une façade ouverte puis fermée pour l'occasion, ou le code du refus. */
function lectureNeuve(doc: Y.Doc): string {
  const neuve = ouvrirDocumentTable(doc);
  try {
    return JSON.stringify(neuve.lire());
  } catch (erreur) {
    return erreur instanceof ErreurDocument ? erreur.code : "autre";
  } finally {
    neuve.fermer();
  }
}

describe("notifications", () => {
  it("F-017-AC9 chaque opération locale qui change la table notifie chaque abonné une fois", () => {
    const table = creerDocumentTable();
    const premier = compteur(table);
    const second = compteur(table);

    const colonne = table.creerColonne("c", "texte");
    const ligne = table.creerLigne();
    table.ecrireCellule(ligne, colonne, "x");

    expect([premier.valeur(), second.valeur()]).toEqual([3, 3]);
  });

  it("F-017-AC9 plusieurs opérations dans une même transaction Yjs : une seule notification", () => {
    const table = creerDocumentTable();
    const abonne = compteur(table);

    table.doc.transact(() => {
      const colonne = table.creerColonne("c", "nombre");
      table.creerLigne(new Map([[colonne, 1]]));
      table.creerLigne();
    });

    expect(abonne.valeur()).toBe(1);
    expect(table.lire().lignes).toHaveLength(2);
  });

  it("F-017-AC9 une mise à jour reçue qui change la table notifie une fois ; la même, réappliquée, ne notifie pas", () => {
    const source = creerRepliqueDeTable(1);
    source.table.creerColonne("c", "case");
    const cible = creerRepliqueDeTable(2);
    const abonne = compteur(cible.table);
    const etat = Y.encodeStateAsUpdate(source.table.doc);

    livrer(cible, etat);
    livrer(cible, etat);

    expect(abonne.valeur()).toBe(1);
  });

  it("F-017-AC9 une transaction qui ne change pas la table lue ne notifie pas : écriture dans une ligne supprimée, réécriture identique d'un champ, transaction vide", () => {
    const table = creerDocumentTable();
    const colonne = table.creerColonne("c", "texte");
    const ligne = table.creerLigne();
    table.supprimerLigne(ligne);
    const abonne = compteur(table);

    table.doc.transact(() => undefined);
    // Écritures directes, qu'un pair ou un autre module pourrait faire.
    const lignes = table.doc.getMap("lignes");
    const entree = lignes.get(ligne) as Y.Map<unknown>;
    (entree.get("cellules") as Y.Map<unknown>).set(colonne, "invisible");
    const champs = table.doc.getMap("colonnes").get(colonne) as Y.Map<unknown>;
    champs.set("nom", "c");

    expect(abonne.valeur()).toBe(0);
  });

  it("F-017-AC9 un refus, ou une opération sans effet, n'ouvre aucune transaction et ne notifie pas", () => {
    const table = creerDocumentTable();
    const colonne = table.creerColonne("c", "texte");
    const ligne = table.creerLigne();
    const abonne = compteur(table);
    let transactions = 0;
    table.doc.on("afterTransaction", () => (transactions += 1));

    table.renommerColonne(colonne, "c");
    table.deplacerColonne(colonne, 0);
    table.ecrireCellule(ligne, colonne, null);
    expect(refusDe(table.doc, () => table.creerColonne("n".repeat(201), "texte"))).toEqual(
      refus("nom-non-admis"),
    );

    expect([transactions, abonne.valeur()]).toEqual([0, 0]);
  });

  it("F-017-AC9 après désabonnement, plus aucune notification ; le désabonnement est idempotent", () => {
    const table = creerDocumentTable();
    const abonne = compteur(table);
    table.creerColonne("a", "texte");

    abonne.arreter();
    abonne.arreter();
    table.creerColonne("b", "texte");

    expect(abonne.valeur()).toBe(1);
  });

  it("F-017-AC9 un abonné inscrit pendant une diffusion n'est notifié qu'à la suivante ; un abonné désabonné par un autre rappel ne l'est plus", () => {
    const table = creerDocumentTable();
    const appels: string[] = [];
    let arreterB: () => void = () => undefined;
    table.abonner(() => {
      appels.push("a");
      arreterB();
      table.abonner(() => appels.push("tard"));
    });
    arreterB = table.abonner(() => appels.push("b"));

    table.creerColonne("x", "texte");

    expect(appels).toEqual(["a"]);
  });

  it("F-017-AC9 un rappel qui lève ne prive pas les suivants et ne remonte ni par l'opération ni par Y.applyUpdate", () => {
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const table = creerDocumentTable();
    table.abonner(() => {
      throw new Error("rappel fautif");
    });
    const suivant = compteur(table);
    const source = creerDocumentTable();
    source.creerColonne("c", "texte");

    expect(() => table.creerColonne("x", "texte")).not.toThrow();
    expect(() =>
      Y.applyUpdate(table.doc, Y.encodeStateAsUpdate(source.doc), ORIGINE_RECUE),
    ).not.toThrow();

    expect(suivant.valeur()).toBe(2);
    expect(erreurs).toHaveBeenCalledTimes(2);
  });

  it("F-017-AC9 l'entrée dans un refus (document d'espace reçu) notifie une fois, puis plus rien tant que le refus dure", () => {
    const table = ouvrirDocumentTable(new Y.Doc());
    const abonne = compteur(table);
    const espace = creerSuivie();

    Y.applyUpdate(table.doc, Y.encodeStateAsUpdate(espace.doc));
    espace.creerPage("p");
    Y.applyUpdate(table.doc, Y.encodeStateAsUpdate(espace.doc));

    expect(abonne.valeur()).toBe(1);
    expect(() => table.lire()).toThrow(ErreurDocument);
  });

  it("F-017-AC9 la table lue garde sa référence tant qu'elle ne change pas", () => {
    const table = creerDocumentTable();
    table.creerColonne("c", "texte");
    const avant = table.lire();

    table.doc.transact(() => undefined);
    expect(table.lire()).toBe(avant);
    table.creerLigne();
    expect(table.lire()).not.toBe(avant);
  });

  it("F-017-AC9 pour toute suite tirée d'opérations locales et de mises à jour reçues, une notification par transaction qui change la table lue, aucune sinon", () => {
    fixerDesIdentifiantsDisperses();
    let client = 10;
    fc.assert(
      fc.property(
        suiteDeCommandes(2, 20),
        suiteDeCommandes(2, 20),
        fc.array(fc.nat(), { maxLength: 30 }),
        (locales, distantes, entrelacement) => {
          const ici = creerRepliqueDeTable(client++);
          const ailleurs = creerRepliqueDeTable(client++);
          distantes.forEach((c) => appliquer(ailleurs.table, c));
          const recues = [...ailleurs.emises];
          let notifications = 0;
          ici.table.abonner(() => (notifications += 1));
          let attendues = 0;
          // Oracle indépendant de la façade abonnée : une lecture neuve du même Y.Doc à chaque pas.
          const pas = (action: () => void): void => {
            const avant = lectureNeuve(ici.table.doc);
            action();
            attendues += lectureNeuve(ici.table.doc) === avant ? 0 : 1;
            expect(notifications).toBe(attendues);
          };

          // Entrelacement tiré : une opération locale ou une mise à jour reçue, dans le désordre.
          const restantes = [...locales];
          for (const choix of entrelacement) {
            const recue = recues.splice(choix % Math.max(recues.length, 1), 1)[0];
            if (choix % 2 === 0 && recue !== undefined) pas(() => livrer(ici, recue));
            else if (restantes.length > 0) {
              const c = restantes.shift();
              if (c !== undefined) pas(() => appliquer(ici.table, c));
            }
          }
          recues.forEach((recue) => pas(() => livrer(ici, recue)));
          restantes.forEach((c) => pas(() => appliquer(ici.table, c)));
        },
      ),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS },
    );
  });
});

describe("fermeture", () => {
  it("F-017-AC9 après fermer(), plus aucune notification, l'écouteur est retiré et toute opération lève facade-fermee avant tout autre refus", () => {
    const doc = new Y.Doc();
    const ecouteursAvant = doc._observers.get("afterTransaction")?.size ?? 0;
    const table = ouvrirDocumentTable(doc);
    const abonne = compteur(table);
    table.creerColonne("c", "texte");

    table.fermer();
    table.fermer();
    const autre = ouvrirDocumentTable(doc);
    autre.creerColonne("d", "texte");

    expect(abonne.valeur()).toBe(1);
    expect(doc._observers.get("afterTransaction")?.size ?? 0).toBe(ecouteursAvant + 1);
    expect(refusDe(doc, () => table.creerColonne("n".repeat(201), "x" as never))).toEqual(
      refus("facade-fermee"),
    );
    expect(refusDe(doc, () => table.supprimerLigne("absente"))).toEqual(refus("facade-fermee"));
    expect(table.abonner(() => undefined)()).toBeUndefined();
    autre.fermer();
  });

  it("F-017-AC9 facade-fermee passe avant le refus du document", () => {
    const espace = creerSuivie();
    const table = ouvrirDocumentTable(espace.doc);
    table.fermer();

    expect(refusDe(espace.doc, () => table.creerLigne())).toEqual(refus("facade-fermee"));
  });

  it("F-017-AC9 une façade fermée par le rappel d'une autre ne relit ni ne notifie dans la même émission", () => {
    const doc = new Y.Doc();
    const premiere = ouvrirDocumentTable(doc);
    const seconde = ouvrirDocumentTable(doc);
    let notifiee = 0;
    premiere.abonner(() => seconde.fermer());
    seconde.abonner(() => (notifiee += 1));

    premiere.creerColonne("c", "texte");

    expect(notifiee).toBe(0);
  });
});
