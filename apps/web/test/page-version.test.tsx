// Version du document de page vue par la session et par l'écran : refus avant toute liaison
// (F-003-AC19), version reçue pendant l'affichage (F-003-AC29), fermeture de la façade
// (F-003-AC33), abonné fautif (F-003-AC34), état de chargement (F-003-AC4).
import { act, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import * as moduleDEdition from "../src/edition/index.ts";
import {
  ajouter,
  bloc,
  fragmentBrut,
  inventaireDuContenu,
  miseAJourDUneReplique,
  observateursDuDocument,
} from "./aides-facade-page.ts";
import {
  enregistrements,
  laisserIndexedDbTravailler,
  retenirLesOuvertures,
} from "./aides-persistance.ts";
import {
  afficherUnePage,
  attendrePhase,
  demarrerUneSession,
  enregistrerDansLaBase,
  nomDeLaBaseDePage,
  PAGE_A_DE_L_ESPACE_A,
  rendreLaSession,
} from "./aides-session-page.tsx";
import {
  chercherLaZoneDeSaisie,
  entrerDansLEditeur,
  porteUnEditeurVivant,
  taper,
  zoneDeSaisie,
} from "./edition/aides-edition.tsx";

const VERSION_INCONNUE = 2;
const MESSAGE_DE_MISE_A_JOUR = /Mettez l'application à jour/;

/** Un paragraphe dont le texte porte une marque que le schéma ne connaît pas. */
function paragrapheMarque(): Y.XmlElement {
  const paragraphe = new Y.XmlElement("paragraph");
  const texte = new Y.XmlText();
  texte.insert(0, "marqué", { bold: true });
  paragraphe.insert(0, [texte]);
  return paragraphe;
}

function etatEncodeDuDocument(doc: Y.Doc): number[] {
  return [...Y.encodeStateAsUpdate(doc)];
}

describe("refus par version, avant toute liaison", () => {
  it("F-003-AC19 une base de version non prise en charge, avec un nœud et une marque absents du schéma : ni éditeur ni liaison, le message de mise à jour, aucune mise à jour émise, le document et la base inchangés à l'octet près", async () => {
    await enregistrerDansLaBase(PAGE_A_DE_L_ESPACE_A, (replique) => {
      ajouter(replique, bloc("blocFutur", "inconnu"), paragrapheMarque());
      replique.eleverVersion(VERSION_INCONNUE);
    });
    const base = nomDeLaBaseDePage(PAGE_A_DE_L_ESPACE_A);
    const baseAvant = await enregistrements(base);
    const editeursCrees = vi.spyOn(moduleDEdition, "EditeurDePage");
    const doc = new Y.Doc();
    const avant = etatEncodeDuDocument(doc);

    const { session, emises, persistance } = demarrerUneSession(PAGE_A_DE_L_ESPACE_A, doc);
    rendreLaSession(session);
    await act(() => attendrePhase(session, "version-non-prise-en-charge"));
    await act(() => laisserIndexedDbTravailler());

    expect(screen.getByRole("alert").textContent).toMatch(MESSAGE_DE_MISE_A_JOUR);
    expect(editeursCrees).not.toHaveBeenCalled();
    expect(chercherLaZoneDeSaisie()).toBeNull();
    expect(emises).toEqual([]);
    expect(etatEncodeDuDocument(doc)).toEqual(avant);
    expect(await enregistrements(base)).toEqual(baseAvant);
    expect(baseAvant.length).toBeGreaterThan(0);
    expect(persistance.lireEtat()).toBe("fermee");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Page d'essai");
  });

  it("F-003-AC19 un document déjà en mémoire, entièrement relu et de version non prise en charge, n'est jamais lié : son état encodé est le même, octet pour octet, et aucune mise à jour n'est émise", async () => {
    const doc = new Y.Doc();
    Y.applyUpdate(
      doc,
      miseAJourDUneReplique(doc, (replique) => {
        ajouter(replique, bloc("blocFutur", "inconnu"), paragrapheMarque());
        replique.eleverVersion(VERSION_INCONNUE);
      }),
    );
    const avant = etatEncodeDuDocument(doc);
    const editeursCrees = vi.spyOn(moduleDEdition, "EditeurDePage");

    const { session, emises } = demarrerUneSession(PAGE_A_DE_L_ESPACE_A, doc);
    rendreLaSession(session);
    await act(() => attendrePhase(session, "version-non-prise-en-charge"));

    expect(screen.getByRole("alert").textContent).toMatch(MESSAGE_DE_MISE_A_JOUR);
    expect(editeursCrees).not.toHaveBeenCalled();
    expect(emises).toEqual([]);
    expect(etatEncodeDuDocument(doc)).toEqual(avant);
    expect(Object.keys(inventaireDuContenu(doc).noeuds)).toEqual(["blocFutur", "paragraph"]);
    expect(inventaireDuContenu(doc).marques).toEqual(["bold"]);
  });

  it("F-003-AC19 F-003-AC23 une base de version prise en charge est liée : l'éditeur affiche son contenu", async () => {
    await enregistrerDansLaBase(PAGE_A_DE_L_ESPACE_A, (replique) => {
      ajouter(replique, bloc("paragraph", "déjà là"));
      replique.eleverVersion(1);
    });

    await afficherUnePage();

    expect(zoneDeSaisie().textContent).toBe("déjà là");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

type Cas = readonly [string, (doc: Y.Doc) => Uint8Array[]];

// Les trois arrivées que le critère nomme : la version seule puis le nœud, ou les deux dans une
// même mise à jour, la version écrite avant ou après le nœud.
const ARRIVEES: readonly Cas[] = [
  [
    "une mise à jour qui ne porte que la version, puis une seconde qui porte le nœud",
    (doc) => {
      const version = miseAJourDUneReplique(doc, (replique) =>
        replique.eleverVersion(VERSION_INCONNUE),
      );
      const temoin = new Y.Doc();
      Y.applyUpdate(temoin, Y.encodeStateAsUpdate(doc));
      const vecteur = Y.encodeStateVector(temoin);
      fragmentBrut(temoin).insert(0, [bloc("blocFutur", "inconnu")]);
      return [version, Y.encodeStateAsUpdate(temoin, vecteur)];
    },
  ],
  [
    "une seule mise à jour, d'une transaction qui écrit la version puis le nœud",
    (doc) => [
      miseAJourDUneReplique(doc, (replique) =>
        replique.doc.transact(() => {
          replique.eleverVersion(VERSION_INCONNUE);
          ajouter(replique, bloc("blocFutur", "inconnu"));
        }),
      ),
    ],
  ],
  [
    "une seule mise à jour, d'une transaction qui écrit le nœud puis la version",
    (doc) => [
      miseAJourDUneReplique(doc, (replique) =>
        replique.doc.transact(() => {
          ajouter(replique, bloc("blocFutur", "inconnu"));
          replique.eleverVersion(VERSION_INCONNUE);
        }),
      ),
    ],
  ],
];

describe("version non prise en charge reçue pendant l'affichage", () => {
  it.each(ARRIVEES)(
    "F-003-AC29 %s : l'éditeur est détruit dans la transaction, le nœud absent du schéma reste dans le document, l'onglet n'émet rien, le message de mise à jour est affiché",
    async (_cas, preparer) => {
      const { doc, session, persistance } = await afficherUnePage();
      entrerDansLEditeur();
      taper("avant");
      const zone = zoneDeSaisie();
      const misesAJour = preparer(doc);
      const emisesParLOnglet: unknown[] = [];
      const noter = (_miseAJour: Uint8Array, origine: unknown): void => {
        if (origine !== "reçue") {
          emisesParLOnglet.push(origine);
        }
      };
      doc.on("update", noter);
      const vivants: boolean[] = [];

      act(() => {
        for (const miseAJour of misesAJour) {
          Y.applyUpdate(doc, miseAJour, "reçue");
          vivants.push(porteUnEditeurVivant(zone));
        }
      });
      await act(() => laisserIndexedDbTravailler());
      doc.off("update", noter);

      expect(vivants).toEqual(misesAJour.map(() => false));
      expect(Object.keys(inventaireDuContenu(doc).noeuds)).toEqual(["blocFutur", "paragraph"]);
      expect(emisesParLOnglet).toEqual([]);
      expect(session.lireEtat().phase).toBe("version-non-prise-en-charge");
      expect(chercherLaZoneDeSaisie()).toBeNull();
      expect(screen.getByRole("alert").textContent).toMatch(MESSAGE_DE_MISE_A_JOUR);
      expect(persistance.lireEtat()).toBe("fermee");
    },
  );

  it("F-003-AC29 sans version, le même nœud reçu est retiré par la liaison : c'est bien la garde qui le conserve", async () => {
    const { doc } = await afficherUnePage();

    act(() =>
      Y.applyUpdate(
        doc,
        miseAJourDUneReplique(doc, (replique) => ajouter(replique, bloc("blocFutur", "inconnu"))),
      ),
    );

    expect(Object.keys(inventaireDuContenu(doc).noeuds)).not.toContain("blocFutur");
    expect(porteUnEditeurVivant(zoneDeSaisie())).toBe(true);
  });
});

describe("fermeture de la façade de page par l'application", () => {
  it("F-003-AC33 après un refus de version pendant l'affichage, plus rien n'observe le document : la façade est fermée depuis le rappel de garde, l'éditeur et la persistance aussi", async () => {
    const doc = new Y.Doc();
    const depart = observateursDuDocument(doc);
    await afficherUnePage(doc);
    const pendant = observateursDuDocument(doc);

    act(() =>
      Y.applyUpdate(
        doc,
        miseAJourDUneReplique(doc, (replique) => replique.eleverVersion(VERSION_INCONNUE)),
      ),
    );

    // Il ne reste que l'écoute des mises à jour posée par ce test.
    expect(pendant).toBeGreaterThan(depart + 1);
    expect(observateursDuDocument(doc)).toBe(depart + 1);
  });

  it("F-003-AC33 fermer la session ferme sa façade : une version reçue ensuite n'appelle plus rien, et une seconde fermeture est sans effet", async () => {
    const { doc, session, persistance } = demarrerUneSession();
    await attendrePhase(session, "pret");
    const prevenus = vi.fn();
    session.abonner(prevenus);
    const avecLaFacade = observateursDuDocument(doc);

    session.fermer();
    const sansLaFacade = observateursDuDocument(doc);
    session.fermer();
    Y.applyUpdate(
      doc,
      miseAJourDUneReplique(doc, (replique) => replique.eleverVersion(VERSION_INCONNUE)),
    );

    expect(sansLaFacade).toBe(avecLaFacade - 1);
    expect(observateursDuDocument(doc)).toBe(sansLaFacade);
    expect(prevenus).not.toHaveBeenCalled();
    expect(session.lireEtat().phase).toBe("pret");
    // La persistance n'est pas à la session : celui qui la prête la ferme.
    expect(persistance.lireEtat()).toBe("active");
  });
});

describe("abonné de la session de page qui lève", () => {
  it("F-003-AC34 un abonné de la session qui lève ne prive pas les suivants, ne remonte pas par Y.applyUpdate, et son exception va une fois à console.error ; l'écran reste utilisable", async () => {
    const { doc, session } = await afficherUnePage();
    const signalements = vi.fn();
    vi.spyOn(console, "error").mockImplementation(signalements);
    const faute = new Error("abonné fautif");
    const suivant = vi.fn();
    session.abonner(() => {
      throw faute;
    });
    session.abonner(suivant);

    expect(() =>
      act(() =>
        Y.applyUpdate(
          doc,
          miseAJourDUneReplique(doc, (replique) => replique.eleverVersion(VERSION_INCONNUE)),
        ),
      ),
    ).not.toThrow();
    const signales = signalements.mock.calls.filter((appel) => appel.at(-1) === faute);
    vi.restoreAllMocks();

    expect(suivant).toHaveBeenCalledTimes(1);
    expect(signales).toHaveLength(1);
    expect(screen.getByRole("alert").textContent).toMatch(MESSAGE_DE_MISE_A_JOUR);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Page d'essai");
  });

  it("F-003-AC34 une garde de la session qui lève ne prive pas les gardes suivantes, et son exception va une fois à console.error", async () => {
    const { doc, session } = demarrerUneSession();
    await attendrePhase(session, "pret");
    const etat = session.lireEtat();
    if (etat.phase !== "pret") {
      throw new Error("La session devait être prête.");
    }
    const signalements = vi.fn();
    vi.spyOn(console, "error").mockImplementation(signalements);
    const faute = new Error("garde fautive");
    const suivante = vi.fn();
    etat.garderVersion(() => {
      throw faute;
    });
    etat.garderVersion(suivante);

    Y.applyUpdate(
      doc,
      miseAJourDUneReplique(doc, (replique) => replique.eleverVersion(VERSION_INCONNUE)),
    );
    const signales = signalements.mock.calls.filter((appel) => appel.at(-1) === faute);
    vi.restoreAllMocks();

    expect(suivante).toHaveBeenCalledTimes(1);
    expect(signales).toHaveLength(1);
    expect(session.lireEtat().phase).toBe("version-non-prise-en-charge");
  });
});

describe("état de chargement d'une page", () => {
  it("F-003-AC4 tant que le document de page n'est pas relu, l'état de chargement tient la place de l'éditeur et aucune saisie n'est possible ; il prend fin dès que la relecture aboutit", async () => {
    const retenues = retenirLesOuvertures();
    const { session } = demarrerUneSession();
    rendreLaSession(session);
    await act(() => laisserIndexedDbTravailler());

    const pendant = {
      phase: session.lireEtat().phase,
      etat: screen.getByRole("status").textContent,
      editeur: chercherLaZoneDeSaisie(),
    };
    retenues.cesser();
    retenues.repondre();
    await act(() => attendrePhase(session, "pret"));

    expect(pendant).toEqual({ phase: "chargement", etat: "Chargement de la page…", editeur: null });
    expect(zoneDeSaisie().getAttribute("contenteditable")).toBe("true");
    expect(screen.queryByRole("status")).toBeNull();
  });
});
