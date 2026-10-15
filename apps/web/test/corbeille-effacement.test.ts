// F-007 : effacement des bases de page par le module de persistance (AC11, AC21, AC26, AC32, AC33).
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { creerPagesOuvertes } from "../src/page/pages-ouvertes.ts";
import type { SessionPage } from "../src/page/session-page.ts";
import {
  effacerBaseDePage,
  ouvrirEspaceLocal,
  ouvrirPersistance,
  type Persistance,
} from "../src/persistance/index.ts";
import { lire, lister } from "./aides-disque.ts";
import {
  attendreEtat,
  ESPACE_A,
  ESPACE_B,
  laisserIndexedDbTravailler,
  nomsDesBases,
  retenirLesOuvertures,
} from "./aides-persistance.ts";
import {
  ecouterLesErreursNonInterceptees,
  refuserLOuvertureDe,
  simulerLHorloge,
} from "./aides-reprise.ts";
import { attendrePhase, nomDeLaBaseDePage, PAGE_A, PAGE_B } from "./aides-session-page.tsx";

const TEMOIN = "contenu témoin de la page supprimée";
const ECHEANCE_MS = 10_000;
const ATTENTE_PLAFOND_MS = 60_000;
function sources(dossier: string): string[] {
  return lister(dossier).filter((chemin) => /\.tsx?$/.test(chemin));
}

function sansCommentaires(texte: string): string {
  return texte.replace(/\/\*[^]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Écrit un témoin dans la base d'une page par le module, puis ferme la persistance. */
async function enregistrerUnTemoin(idEspace: string, idPage: string, texte: string): Promise<void> {
  const doc = new Y.Doc();
  const persistance = ouvrirPersistance(doc, { type: "page", idEspace, idPage });
  await attendreEtat(persistance, "active");
  doc.getMap("temoin").set("contenu", texte);
  await laisserIndexedDbTravailler();
  persistance.fermer();
  doc.destroy();
  await laisserIndexedDbTravailler();
}

/** Ce que la base d'une page porte, relu dans un document vierge par le module. */
async function temoinRelu(idEspace: string, idPage: string): Promise<unknown> {
  const doc = new Y.Doc();
  const persistance = ouvrirPersistance(doc, { type: "page", idEspace, idPage });
  await attendreEtat(persistance, "active");
  const lu: unknown = doc.getMap("temoin").get("contenu");
  persistance.fermer();
  doc.destroy();
  await laisserIndexedDbTravailler();
  return lu;
}

/** Connexion brute à la base, sans gestionnaire `versionchange` : elle bloque une suppression. */
async function tenirLaBaseOuverte(nom: string): Promise<IDBDatabase> {
  const demande = indexedDB.open(nom);
  return new Promise((resoudre) => {
    demande.onsuccess = () => resoudre(demande.result);
  });
}

function documentDe(session: SessionPage): Y.Doc {
  const etat = session.lireEtat();
  if (etat.phase !== "pret" || etat.contenu.doc === null) {
    throw new Error("La session de page n'est pas prête.");
  }
  return etat.contenu.doc;
}

describe("effacer la base d'une page", () => {
  it("F-007-AC11 seule la base de la page dans l'espace désigné est effacée : celle de même identifiant de page d'un autre espace reste, contenu intact", async () => {
    await enregistrerUnTemoin(ESPACE_A, PAGE_A, "dans l'espace A");
    await enregistrerUnTemoin(ESPACE_B, PAGE_A, "dans l'espace B");
    await enregistrerUnTemoin(ESPACE_A, PAGE_B, "autre page de A");

    const issue = await effacerBaseDePage({ idEspace: ESPACE_A, idPage: PAGE_A });

    expect(issue).toBe("effacee");
    const bases = await nomsDesBases();
    expect(bases).not.toContain(nomDeLaBaseDePage({ idEspace: ESPACE_A, idPage: PAGE_A }));
    expect(bases).toContain(nomDeLaBaseDePage({ idEspace: ESPACE_B, idPage: PAGE_A }));
    expect(await temoinRelu(ESPACE_B, PAGE_A)).toBe("dans l'espace B");
    expect(await temoinRelu(ESPACE_A, PAGE_B)).toBe("autre page de A");
  });

  it("F-007-AC11 effacer une base qui n'existe pas n'est pas une erreur", async () => {
    const relevees = ecouterLesErreursNonInterceptees();

    expect(await effacerBaseDePage({ idEspace: ESPACE_A, idPage: PAGE_B })).toBe("effacee");
    expect(await nomsDesBases()).toEqual([]);
    expect(relevees()).toEqual([]);
  });

  it("F-007-AC26 la promesse ne se résout qu'une fois la base absente : énumérée dès la résolution, elle n'y est plus", async () => {
    await enregistrerUnTemoin(ESPACE_A, PAGE_A, "présent");
    const nom = nomDeLaBaseDePage({ idEspace: ESPACE_A, idPage: PAGE_A });
    expect(await nomsDesBases()).toContain(nom);

    const bases = await effacerBaseDePage({ idEspace: ESPACE_A, idPage: PAGE_A }).then(() =>
      indexedDB.databases(),
    );

    expect(bases.map((base) => base.name)).not.toContain(nom);
  });

  it("F-007-AC26 l'opération appelle deleteDatabase elle-même, sous le nom tiré de la fonction de nommage, sans clearData ni clearDocument", async () => {
    const suppression = vi.spyOn(indexedDB, "deleteDatabase");

    await effacerBaseDePage({ idEspace: ESPACE_A, idPage: PAGE_A });

    expect(suppression.mock.calls).toEqual([
      [nomDeLaBaseDePage({ idEspace: ESPACE_A, idPage: PAGE_A })],
    ]);
    const effacement = lire("src/persistance/effacement.ts");
    expect(effacement).toMatch(/nomDeBase\(\{ type: "page"/);
    expect(effacement).toMatch(/onsuccess[^]*onerror[^]*onblocked/);
    for (const chemin of sources("src")) {
      expect(sansCommentaires(lire(chemin)), chemin).not.toMatch(/\bclearData\b|\bclearDocument\b/);
      expect(lire(chemin).includes("deleteDatabase("), chemin).toBe(
        chemin === "src/persistance/effacement.ts",
      );
    }
  });

  it("F-007-AC26 un appelant ne peut assembler le nom : un identifiant refusé par la fonction de nommage n'efface rien et n'est pas rejeté", async () => {
    await enregistrerUnTemoin(ESPACE_A, PAGE_A, "gardé");
    const suppression = vi.spyOn(indexedDB, "deleteDatabase");

    expect(await effacerBaseDePage({ idEspace: ESPACE_A, idPage: `${PAGE_A}:x` })).toBe("effacee");
    expect(await effacerBaseDePage({ idEspace: "*", idPage: PAGE_A })).toBe("effacee");

    expect(suppression).not.toHaveBeenCalled();
    expect(await temoinRelu(ESPACE_A, PAGE_A)).toBe("gardé");
  });
});

describe("effacement en échec, bloqué ou en retard", () => {
  it("F-007-AC21 bloquée par une connexion jamais fermée : échec après 10 secondes, sans erreur non interceptée", async () => {
    await enregistrerUnTemoin(ESPACE_A, PAGE_A, "tenu");
    const nom = nomDeLaBaseDePage({ idEspace: ESPACE_A, idPage: PAGE_A });
    const connexion = await tenirLaBaseOuverte(nom);
    const relevees = ecouterLesErreursNonInterceptees();
    simulerLHorloge();
    let issue: string | undefined;

    void effacerBaseDePage({ idEspace: ESPACE_A, idPage: PAGE_A }).then((rendue) => {
      issue = rendue;
    });
    await laisserIndexedDbTravailler();
    vi.advanceTimersByTime(ECHEANCE_MS - 1);
    await laisserIndexedDbTravailler();
    expect(issue).toBeUndefined();
    vi.advanceTimersByTime(1);
    await laisserIndexedDbTravailler();

    expect(issue).toBe("echec");
    expect(await nomsDesBases()).toContain(nom);
    connexion.close();
    await laisserIndexedDbTravailler();
    expect(relevees()).toEqual([]);
  });

  it("F-007-AC21 bloquée par une connexion fermée avant l'échéance : base absente, succès, aucun avertissement", async () => {
    await enregistrerUnTemoin(ESPACE_A, PAGE_A, "tenu");
    const nom = nomDeLaBaseDePage({ idEspace: ESPACE_A, idPage: PAGE_A });
    const connexion = await tenirLaBaseOuverte(nom);
    const bloquee = vi.fn();
    connexion.onversionchange = bloquee;
    simulerLHorloge();
    let issue: string | undefined;

    void effacerBaseDePage({ idEspace: ESPACE_A, idPage: PAGE_A }).then((rendue) => {
      issue = rendue;
    });
    await laisserIndexedDbTravailler();
    vi.advanceTimersByTime(ECHEANCE_MS - 1);
    expect(bloquee).toHaveBeenCalled();
    expect(issue).toBeUndefined();
    connexion.close();
    await laisserIndexedDbTravailler();

    expect(issue).toBe("effacee");
    expect(await nomsDesBases()).not.toContain(nom);
  });

  it("F-007-AC21 une demande en échec (événement error) rend l'échec, sans rejet ni erreur non interceptée", async () => {
    const relevees = ecouterLesErreursNonInterceptees();
    vi.spyOn(indexedDB, "deleteDatabase").mockImplementation(() => {
      const demande = new EventTarget() as unknown as IDBOpenDBRequest;
      setTimeout(() => {
        const evenement = new Event("error", { cancelable: true });
        demande.onerror?.(evenement);
      });
      return demande;
    });

    expect(await effacerBaseDePage({ idEspace: ESPACE_A, idPage: PAGE_A })).toBe("echec");
    expect(relevees()).toEqual([]);
  });

  it("F-007-AC21 IndexedDB indisponible : l'effacement ne peut pas être tenté, l'issue est un échec, sans exception", async () => {
    vi.spyOn(indexedDB, "deleteDatabase").mockImplementation(() => {
      throw new DOMException("refus", "SecurityError");
    });

    expect(await effacerBaseDePage({ idEspace: ESPACE_A, idPage: PAGE_A })).toBe("echec");
  });
});

describe("ce que l'onglet tient sur une page supprimée", () => {
  it("F-007-AC32 un témoin écrit dans une page ouverte par le module : après la suppression, la base est absente, et une persistance rouverte sous les mêmes identifiants trouve un document vide", async () => {
    const pages = creerPagesOuvertes();
    const session = pages.ouvrir({ idEspace: ESPACE_A, idPage: PAGE_A });
    await attendrePhase(session, "pret");
    const doc = documentDe(session);
    doc.getMap("temoin").set("contenu", TEMOIN);
    await laisserIndexedDbTravailler();
    expect(await nomsDesBases()).toContain(
      nomDeLaBaseDePage({ idEspace: ESPACE_A, idPage: PAGE_A }),
    );

    const issue = await pages.effacer(ESPACE_A, [PAGE_A]);
    await laisserIndexedDbTravailler();

    expect(issue).toBe("effacee");
    expect(doc.isDestroyed).toBe(true);
    expect(session.lireEtat().phase).toBe("pret");
    expect(await nomsDesBases()).not.toContain(
      nomDeLaBaseDePage({ idEspace: ESPACE_A, idPage: PAGE_A }),
    );
    const relu = new Y.Doc();
    const persistance = ouvrirPersistance(relu, {
      type: "page",
      idEspace: ESPACE_A,
      idPage: PAGE_A,
    });
    await attendreEtat(persistance, "active");
    expect(relu.getMap("temoin").toJSON()).toEqual({});
    expect(Y.encodeStateAsUpdate(relu)).toEqual(Y.encodeStateAsUpdate(new Y.Doc()));
    persistance.fermer();
    pages.fermer();
  });

  it("F-007-AC32 un document conservé parce que sa modification n'était pas écrite est libéré avant l'effacement : ses tentatives cessent et ne recréent pas la base", async () => {
    simulerLHorloge();
    refuserLOuvertureDe(nomDeLaBaseDePage({ idEspace: ESPACE_A, idPage: PAGE_B }));
    const pages = creerPagesOuvertes();
    const coupee = pages.ouvrir({ idEspace: ESPACE_A, idPage: PAGE_B });
    await attendrePhase(coupee, "pret");
    const doc = documentDe(coupee);
    doc.getMap("temoin").set("contenu", TEMOIN);
    const autre = pages.ouvrir({ idEspace: ESPACE_A, idPage: PAGE_A });
    await attendrePhase(autre, "pret");
    expect(doc.isDestroyed).toBe(false);

    const effacement = pages.effacer(ESPACE_A, [PAGE_B]);
    vi.restoreAllMocks();
    await laisserIndexedDbTravailler();
    expect(await effacement).toBe("effacee");
    vi.advanceTimersByTime(ATTENTE_PLAFOND_MS);
    await laisserIndexedDbTravailler();

    expect(doc.isDestroyed).toBe(true);
    expect(await nomsDesBases()).not.toContain(
      nomDeLaBaseDePage({ idEspace: ESPACE_A, idPage: PAGE_B }),
    );
    pages.fermer();
  });

  it("F-007-AC21 F-007-AC32 sans espace désigné, aucune base n'est effacée, mais le document conservé de la page est détruit et ses tentatives cessent", async () => {
    simulerLHorloge();
    refuserLOuvertureDe(nomDeLaBaseDePage({ idEspace: ESPACE_A, idPage: PAGE_B }));
    const pages = creerPagesOuvertes();
    const coupee = pages.ouvrir({ idEspace: ESPACE_A, idPage: PAGE_B });
    await attendrePhase(coupee, "pret");
    const doc = documentDe(coupee);
    doc.getMap("temoin").set("contenu", TEMOIN);
    const autre = pages.ouvrir({ idEspace: ESPACE_A, idPage: PAGE_A });
    await attendrePhase(autre, "pret");
    expect(doc.isDestroyed).toBe(false);
    const suppression = vi.spyOn(indexedDB, "deleteDatabase");

    const issue = await pages.effacer(undefined, [PAGE_B]);
    vi.restoreAllMocks();
    vi.advanceTimersByTime(ATTENTE_PLAFOND_MS);
    await laisserIndexedDbTravailler();

    expect(issue).toBe("echec");
    expect(suppression).not.toHaveBeenCalled();
    expect(doc.isDestroyed).toBe(true);
    expect(await nomsDesBases()).not.toContain(
      nomDeLaBaseDePage({ idEspace: ESPACE_A, idPage: PAGE_B }),
    );
    pages.fermer();
  });

  it("F-007-AC33 une autre instance du module tient la base ouverte : après l'effacement, son écriture suivante est un échec d'écriture, sans exception pour l'appelant, la modification restant en mémoire", async () => {
    const relevees = ecouterLesErreursNonInterceptees();
    const autreOnglet = new Y.Doc();
    const tenue: Persistance = ouvrirPersistance(autreOnglet, {
      type: "page",
      idEspace: ESPACE_A,
      idPage: PAGE_A,
    });
    await attendreEtat(tenue, "active");
    const pages = creerPagesOuvertes();
    const session = pages.ouvrir({ idEspace: ESPACE_A, idPage: PAGE_A });
    await attendrePhase(session, "pret");

    expect(await pages.effacer(ESPACE_A, [PAGE_A])).toBe("effacee");
    expect(() => autreOnglet.getMap("temoin").set("contenu", "écrit après")).not.toThrow();
    await laisserIndexedDbTravailler();

    expect(autreOnglet.getMap("temoin").get("contenu")).toBe("écrit après");
    expect(tenue.lireEtat()).toBe("coupee");
    expect(tenue.aDesModificationsNonEnregistrees()).toBe(true);
    expect(relevees()).toEqual([]);
    tenue.fermer();
    pages.fermer();
  });
});

// Appelants de production de l'interface de persistance (F-030-AC19) et de la nouvelle opération.
const APPELANTS_DE_LA_PERSISTANCE = [
  "src/espace/garde-onglet.ts",
  "src/espace/session-espace.ts",
  "src/page/pages-ouvertes.ts",
  "src/page/session-page.ts",
  // F-013-AC40 : le module de synchronisation, par son seul fichier de stockage (passe de fond,
  // réplique d'une page de version refusée, registre, effacement des bases d'un espace).
  "src/synchronisation/stockage.ts",
];

describe("appelants du module de persistance", () => {
  it("F-007-AC26 l'énumération des appelants de production est celle de F-030 ; seul pages-ouvertes.ts appelle l'effacement, et l'interface n'expose aucun type de la bibliothèque", () => {
    const importateurs = sources("src").filter(
      (chemin) =>
        !chemin.startsWith("src/persistance/") &&
        /from "\.\.\/persistance\/index\.ts"/.test(lire(chemin)),
    );
    expect(importateurs).toEqual(APPELANTS_DE_LA_PERSISTANCE);
    expect(importateurs.filter((chemin) => /\beffacerBaseDePage\(/.test(lire(chemin)))).toEqual([
      "src/page/pages-ouvertes.ts",
      // F-013-AC24, AC37 : la copie locale d'un espace, les pages supprimées sur un autre appareil.
      "src/synchronisation/stockage.ts",
    ]);
    expect(lire("src/persistance/index.ts")).not.toMatch(/y-indexeddb|IndexeddbPersistence/);
    expect(lire("src/persistance/effacement.ts")).not.toMatch(/y-indexeddb/);
  });

  it.each([
    [
      "ouvrirPersistance",
      (doc: Y.Doc) => ouvrirPersistance(doc, { type: "espace", idEspace: ESPACE_A }),
    ],
    ["ouvrirEspaceLocal", (doc: Y.Doc) => ouvrirEspaceLocal(doc, ESPACE_A)],
  ])(
    "F-007-AC26 %s, par où passent tous les appelants : ouverture active, coupure à 10 secondes sans réponse, et l'échec n'est pas une exception",
    async (_nom, ouvrir) => {
      const persistance = ouvrir(new Y.Doc());
      await attendreEtat(persistance, "active");
      persistance.fermer();

      const ouvertures = retenirLesOuvertures(1);
      simulerLHorloge();
      const retenue = ouvrir(new Y.Doc());
      vi.advanceTimersByTime(ECHEANCE_MS - 1);
      expect(retenue.lireEtat()).toBe("relecture");
      vi.advanceTimersByTime(1);
      expect(retenue.lireEtat()).toBe("coupee");
      retenue.fermer();
      ouvertures.cesser();
    },
  );
});
