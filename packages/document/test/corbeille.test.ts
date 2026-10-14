// F-007 : restauration et suppression définitive d'une page de la corbeille, dans le modèle.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  type Arborescence,
  type CodeErreurDocument,
  type DocumentEspace,
  ErreurDocument,
  type IdPage,
  type PageLue,
} from "../src/index.ts";
import { creerReplique, echanger, livrerToutesLesEmises, type Replique } from "./aides.ts";
import { creerSuivie, fermerLesSuivies, ouvrirSuivie } from "./aides-corbeille.ts";

const ID_ABSENT = "00000000-0000-4000-8000-0000000000ff";
const TITRE_TEMOIN = "TEMOIN-SECRET-7f3a";

interface EntreeEnregistree {
  readonly titre: string;
  readonly place: { readonly parent: IdPage | null; readonly rang: string };
  readonly corbeille: boolean;
}

function texteDe(relatif: string): string {
  return readFileSync(new URL(relatif, import.meta.url), "utf8");
}

function entrees(espace: DocumentEspace): Record<IdPage, EntreeEnregistree> {
  return espace.doc.getMap("pages").toJSON() as Record<IdPage, EntreeEnregistree>;
}

function titres(pages: readonly PageLue[]): string[] {
  return pages.map((page) => page.titre);
}

function identifiantsLus({ racines, corbeille }: Arborescence): IdPage[] {
  const aplatir = (pages: readonly PageLue[]): IdPage[] =>
    pages.flatMap((lue) => [lue.id, ...aplatir(lue.enfants)]);
  return [...aplatir(racines), ...aplatir(corbeille)];
}

/** Code du refus et nombre de mises à jour émises pendant l'opération. */
function refus(
  espace: DocumentEspace,
  operation: () => unknown,
): { code: CodeErreurDocument | "aucun" | "autre"; misesAJour: number } {
  let misesAJour = 0;
  const compter = (): void => {
    misesAJour += 1;
  };
  espace.doc.on("update", compter);
  try {
    operation();
    return { code: "aucun", misesAJour };
  } catch (erreur) {
    return { code: erreur instanceof ErreurDocument ? erreur.code : "autre", misesAJour };
  } finally {
    espace.doc.off("update", compter);
  }
}

function contientLeTexte(octets: Uint8Array, texte: string): boolean {
  return new TextDecoder("utf-8", { fatal: false }).decode(octets).includes(texte);
}

/** Espace : Racine > Parent > (Fille > Petite), Seconde ; Parent à la corbeille. */
function espaceAvecCorbeille(espace = creerSuivie()): {
  espace: DocumentEspace;
  racine: IdPage;
  parent: IdPage;
  fille: IdPage;
  petite: IdPage;
  seconde: IdPage;
} {
  const racine = espace.creerPage("Racine");
  const parent = espace.creerPage("Parent", { parent: racine });
  const fille = espace.creerPage("Fille", { parent });
  const petite = espace.creerPage("Petite", { parent: fille });
  const seconde = espace.creerPage("Seconde", { parent: racine });
  espace.mettreALaCorbeille(parent);
  return { espace, racine, parent, fille, petite, seconde };
}

// Répliques ouvertes par `aides.ts` (F-001), fermées ici ; les façades de l'aide suivie le sont par
// elle, et la preuve est le compte d'écouteurs revenu à son départ (F-002-AC31).
const ouvertes: DocumentEspace[] = [];

afterEach(() => {
  ouvertes.splice(0).forEach((espace) => espace.fermer());
  vi.restoreAllMocks();
  expect(fermerLesSuivies()).toBe(0);
});

describe("restaurer une racine de la corbeille", () => {
  it("F-007-AC5 la page retourne sous son parent enregistré, à la place de son rang, avec sa descendance non jetée", () => {
    const { espace, racine, parent, fille, petite } = espaceAvecCorbeille(creerSuivie());
    const rangAvant = entrees(espace)[parent]?.place;

    espace.restaurerPage(parent);

    const lue = espace.lire();
    expect(lue.corbeille).toEqual([]);
    expect(lue.racines).toEqual([
      {
        id: racine,
        titre: "Racine",
        enfants: [
          {
            id: parent,
            titre: "Parent",
            enfants: [
              {
                id: fille,
                titre: "Fille",
                enfants: [{ id: petite, titre: "Petite", enfants: [] }],
              },
            ],
          },
          expect.objectContaining({ titre: "Seconde" }),
        ],
      },
    ]);
    expect(entrees(espace)[parent]?.place).toEqual(rangAvant);
  });

  it("F-007-AC6 une descendante jetée séparément reste à la corbeille, où elle devient une racine avec sa propre descendance", () => {
    const { espace, parent, fille, petite } = espaceAvecCorbeille(creerSuivie());
    espace.restaurerPage(parent);
    espace.mettreALaCorbeille(fille);
    espace.mettreALaCorbeille(parent);

    espace.restaurerPage(parent);

    const lue = espace.lire();
    expect(lue.corbeille).toEqual([
      { id: fille, titre: "Fille", enfants: [{ id: petite, titre: "Petite", enfants: [] }] },
    ]);
    expect(identifiantsLus({ racines: lue.racines, corbeille: [] })).toContain(parent);
    expect(identifiantsLus({ racines: lue.racines, corbeille: [] })).not.toContain(fille);
  });

  it("F-007-AC7 une page dont le parent enregistré a été supprimé définitivement réapparaît à la racine", () => {
    const a = creerReplique(1);
    const b = creerReplique(2);
    ouvertes.push(a.espace, b.espace);
    const mere = a.espace.creerPage("Mère");
    echanger([a, b]);
    // A crée une fille sous Mère et la jette ; B, sans la voir, jette Mère et la supprime.
    const fille = a.espace.creerPage("Fille", { parent: mere });
    a.espace.mettreALaCorbeille(fille);
    b.espace.mettreALaCorbeille(mere);
    b.espace.supprimerDefinitivement(mere);
    echanger([a, b]);
    expect(a.espace.lire().corbeille.map((page) => page.id)).toEqual([fille]);

    a.espace.restaurerPage(fille);
    echanger([a, b]);

    for (const { espace } of [a, b]) {
      expect(espace.lire()).toEqual({
        racines: [{ id: fille, titre: "Fille", enfants: [] }],
        corbeille: [],
      });
      expect(entrees(espace)[fille]?.place.parent).toBe(mere);
    }
  });

  it("F-007-AC8 seule une racine de la corbeille se restaure ; toute page de la corbeille se supprime", () => {
    const { espace, parent, fille, petite } = espaceAvecCorbeille(creerSuivie());

    expect(refus(espace, () => espace.restaurerPage(fille)).code).toBe("page-a-la-corbeille");
    expect(refus(espace, () => espace.restaurerPage(petite)).code).toBe("page-a-la-corbeille");
    expect(espace.supprimerDefinitivement(petite)).toEqual([petite]);
    expect(espace.supprimerDefinitivement(fille)).toEqual([fille]);
    expect(refus(espace, () => espace.restaurerPage(parent)).code).toBe("aucun");
  });
});

describe("supprimer définitivement une page de la corbeille", () => {
  it("F-007-AC10 la page et sa descendance lue quittent le document en une seule transaction ; elles ne sont plus lues et toute opération sur elles est refusée par page-introuvable", () => {
    const { espace, parent, fille, petite } = espaceAvecCorbeille(creerSuivie());
    let transactions = 0;
    const compter = (): void => {
      transactions += 1;
    };
    espace.doc.on("afterTransaction", compter);

    const retirees = espace.supprimerDefinitivement(parent);
    espace.doc.off("afterTransaction", compter);

    expect(transactions).toBe(1);
    expect(retirees).toEqual([parent, fille, petite]);
    for (const id of retirees) {
      expect(espace.doc.getMap("pages").has(id)).toBe(false);
      expect(identifiantsLus(espace.lire())).not.toContain(id);
      expect(refus(espace, () => espace.renommerPage(id, "x")).code).toBe("page-introuvable");
    }
    expect(espace.lire().corbeille).toEqual([]);
  });

  it("F-007-AC13 restaurer puis supprimer ne modifie aucune autre entrée : titres, parents, rangs, drapeaux et version de format restent ceux d'avant", () => {
    const { espace, racine, parent, seconde } = espaceAvecCorbeille(creerSuivie());
    espace.mettreALaCorbeille(seconde);
    const avant = entrees(espace);
    const versionAvant = espace.doc.getMap("meta").toJSON();

    espace.restaurerPage(parent);
    const apresRestauration = entrees(espace);
    expect({ ...apresRestauration, [parent]: undefined }).toEqual({
      ...avant,
      [parent]: undefined,
    });
    expect(apresRestauration[parent]).toEqual({ ...avant[parent], corbeille: false });

    espace.supprimerDefinitivement(seconde);
    const apresSuppression = entrees(espace);
    const restantes = Object.fromEntries(
      Object.entries(apresRestauration).filter(([id]) => id !== seconde),
    );
    expect(apresSuppression).toEqual(restantes);
    expect(espace.doc.getMap("meta").toJSON()).toEqual(versionAvant);
    expect(versionAvant).toEqual({ version: 1 });
    expect(Object.keys(apresSuppression)).toContain(racine);
  });

  it("F-007-AC29 le titre d'une page retirée ne figure plus dans l'état encodé, ni chez celle qui supprime ni chez une réplique qui reçoit la suppression", () => {
    const a = creerReplique(1);
    const b = creerReplique(2);
    ouvertes.push(a.espace, b.espace);
    const jetee = a.espace.creerPage(TITRE_TEMOIN);
    a.espace.creerPage("Gardée");
    a.espace.mettreALaCorbeille(jetee);
    echanger([a, b]);
    expect(contientLeTexte(Y.encodeStateAsUpdate(b.espace.doc), TITRE_TEMOIN)).toBe(true);
    const tailleAvant = Y.encodeStateAsUpdate(a.espace.doc).length;

    a.espace.supprimerDefinitivement(jetee);
    livrerToutesLesEmises(b, a);

    expect(contientLeTexte(Y.encodeStateAsUpdate(a.espace.doc), TITRE_TEMOIN)).toBe(false);
    expect(contientLeTexte(Y.encodeStateAsUpdate(b.espace.doc), TITRE_TEMOIN)).toBe(false);
    expect(Y.encodeStateAsUpdate(a.espace.doc).length).toBeLessThan(tailleAvant);
    expect(titres(b.espace.lire().racines)).toEqual(["Gardée"]);
  });

  it("F-007-AC29 le ramasse-miettes est actif sur le document que fournit creerDocumentEspace ; un document sans ramasse-miettes garderait le titre, ce que le test sait voir", () => {
    const fourni = creerSuivie();
    expect(fourni.doc.gc).toBe(true);
    expect(texteDe("../src/document-espace.ts")).toMatch(/new Y\.Doc\(\{ gc: true \}\)/);

    const sansRamasseMiettes = new Y.Doc({ gc: false });
    sansRamasseMiettes.getMap("meta").set("version", 1);
    const temoin = ouvrirSuivie(sansRamasseMiettes);
    const id = temoin.creerPage(TITRE_TEMOIN);
    temoin.mettreALaCorbeille(id);
    temoin.supprimerDefinitivement(id);

    expect(contientLeTexte(Y.encodeStateAsUpdate(sansRamasseMiettes), TITRE_TEMOIN)).toBe(true);
  });
});

describe("refus des deux opérations", () => {
  it("F-007-AC18 restaurer une page absente, hors corbeille ou sous une page jetée : page-introuvable, page-hors-corbeille, page-a-la-corbeille, sans mise à jour", () => {
    const { espace, racine, fille } = espaceAvecCorbeille(creerSuivie());

    expect(refus(espace, () => espace.restaurerPage(ID_ABSENT))).toEqual({
      code: "page-introuvable",
      misesAJour: 0,
    });
    expect(refus(espace, () => espace.restaurerPage(racine))).toEqual({
      code: "page-hors-corbeille",
      misesAJour: 0,
    });
    expect(refus(espace, () => espace.restaurerPage(fille))).toEqual({
      code: "page-a-la-corbeille",
      misesAJour: 0,
    });
  });

  it("F-007-AC19 supprimer une page absente ou hors corbeille : page-introuvable, page-hors-corbeille, sans mise à jour ; une version non prise en charge est refusée avant tout", () => {
    const { espace, racine, parent } = espaceAvecCorbeille(creerSuivie());

    expect(refus(espace, () => espace.supprimerDefinitivement(ID_ABSENT))).toEqual({
      code: "page-introuvable",
      misesAJour: 0,
    });
    expect(refus(espace, () => espace.supprimerDefinitivement(racine))).toEqual({
      code: "page-hors-corbeille",
      misesAJour: 0,
    });

    espace.doc.getMap("meta").set("version", 2);
    for (const operation of [
      () => espace.restaurerPage(parent),
      () => espace.supprimerDefinitivement(parent),
      () => espace.restaurerPage(ID_ABSENT),
      () => espace.supprimerDefinitivement(racine),
    ]) {
      expect(refus(espace, operation)).toEqual({
        code: "version-non-prise-en-charge",
        misesAJour: 0,
      });
    }
  });

  it("F-007-AC19 F-007-AC24 une façade fermée refuse les deux opérations par facade-fermee, sans rien écrire", () => {
    const { espace, parent } = espaceAvecCorbeille(creerSuivie());
    espace.fermer();

    expect(refus(espace, () => espace.restaurerPage(parent))).toEqual({
      code: "facade-fermee",
      misesAJour: 0,
    });
    expect(refus(espace, () => espace.supprimerDefinitivement(parent))).toEqual({
      code: "facade-fermee",
      misesAJour: 0,
    });
  });
});

describe("identifiant retiré", () => {
  it("F-007-AC30 après une suppression, chaque opération de la façade rejouée avec l'identifiant retiré, comme page puis comme parent, est refusée par page-introuvable, sans mise à jour, et l'identifiant reste absent", () => {
    const { espace, racine, parent } = espaceAvecCorbeille(creerSuivie());
    espace.supprimerDefinitivement(parent);

    const operations: readonly [string, () => unknown][] = [
      ["renommerPage", () => espace.renommerPage(parent, "Revenue")],
      ["deplacerPage (page)", () => espace.deplacerPage(parent, { parent: null })],
      ["mettreALaCorbeille", () => espace.mettreALaCorbeille(parent)],
      ["restaurerPage", () => espace.restaurerPage(parent)],
      ["supprimerDefinitivement", () => espace.supprimerDefinitivement(parent)],
      ["creerPage (parent)", () => espace.creerPage("Sous", { parent })],
      ["deplacerPage (parent)", () => espace.deplacerPage(racine, { parent })],
    ];
    for (const [nom, operation] of operations) {
      expect(refus(espace, operation), nom).toEqual({ code: "page-introuvable", misesAJour: 0 });
      expect(espace.doc.getMap("pages").has(parent), nom).toBe(false);
    }
  });

  it("F-007-AC30 l'identifiant d'une page créée vient de crypto.randomUUID : aucune opération ne reçoit d'identifiant à créer", () => {
    const tirage = vi.spyOn(crypto, "randomUUID");
    const espace = creerSuivie();

    const id = espace.creerPage("Neuve", { parent: null, position: 0 });

    expect(tirage).toHaveBeenCalledTimes(1);
    expect(tirage.mock.results[0]?.value).toBe(id);
    expect(espace.creerPage.length).toBeLessThanOrEqual(2);
    expect(texteDe("../src/document-espace.ts")).toMatch(/const id = crypto\.randomUUID\(\);/);
  });

  it("F-007-AC31 une entrée réécrite par un pair sous un identifiant retiré est lue comme une autre, pareil sur les deux répliques, sans exception ni retour de l'ancien contenu", () => {
    const a: Replique = creerReplique(1);
    const b: Replique = creerReplique(2);
    ouvertes.push(a.espace, b.espace);
    const jetee = a.espace.creerPage(TITRE_TEMOIN);
    a.espace.mettreALaCorbeille(jetee);
    echanger([a, b]);

    a.espace.supprimerDefinitivement(jetee);
    const reecrite = new Y.Map<unknown>();
    b.espace.doc.transact(() => {
      reecrite.set("titre", "Réécrite");
      reecrite.set("place", { parent: null, rang: "V" });
      reecrite.set("corbeille", false);
      b.espace.doc.getMap("pages").set(jetee, reecrite);
    });
    expect(() => echanger([a, b])).not.toThrow();

    const attendue = { racines: [{ id: jetee, titre: "Réécrite", enfants: [] }], corbeille: [] };
    expect(a.espace.lire()).toEqual(attendue);
    expect(b.espace.lire()).toEqual(attendue);
    expect(contientLeTexte(Y.encodeStateAsUpdate(a.espace.doc), TITRE_TEMOIN)).toBe(false);

    // Réécrite après avoir vu la suppression, une entrée mal formée est ignorée de même partout.
    const c = creerReplique(3);
    ouvertes.push(c.espace);
    echanger([a, b, c]);
    c.espace.doc.getMap("pages").set(jetee, new Y.Map<unknown>());
    echanger([a, b, c]);
    for (const replique of [a, b, c]) {
      expect(replique.espace.lire()).toEqual({ racines: [], corbeille: [] });
    }
  });
});

// Listes attendues à la date du commit de F-007 : celles des features livrées (F-001, F-002, F-003,
// F-029), plus les deux opérations et le code de cette spec (F-007 H13).
const EXPORTS_ATTENDUS = [
  "Arborescence",
  "CodeErreurDocument",
  "DocumentEspace",
  "DocumentPage",
  "Emplacement",
  "ErreurDocument",
  "IdPage",
  "LigneDeVersionPage",
  "PageLue",
  "TABLE_DES_VERSIONS_PAGE",
  "VERSION_PAGE_PRISE_EN_CHARGE",
  "creerDocumentEspace",
  "lireVersionPage",
  "ouvrirDocumentEspace",
  "ouvrirDocumentPage",
];
const METHODES_ATTENDUES: Readonly<Record<string, number>> = {
  abonner: 1,
  creerPage: 1,
  deplacerPage: 2,
  fermer: 0,
  lire: 0,
  mettreALaCorbeille: 1,
  renommerPage: 2,
  restaurerPage: 1,
  supprimerDefinitivement: 1,
};
const CODES_ATTENDUS = [
  "page-introuvable",
  "page-a-la-corbeille",
  "deplacement-cyclique",
  "titre-trop-long",
  "position-invalide",
  "version-non-prise-en-charge",
  "facade-fermee",
  "version-invalide",
  "rang-indisponible",
  "page-hors-corbeille",
];
// Empreintes des tests de F-001, relevées par F-029 (`borne-contrat.test.ts`) : F-007 n'en modifie aucun.
const TESTS_DE_F001: Readonly<Record<string, string>> = {
  "operations.test.ts": "87a1da35b578674a82aea93f9c7b443d3ca3ac63d4d9350267d67653b41ea7e3",
  "abonnement.test.ts": "064870765bec51128943655b36d20bccb6f24ed642435476fb3e6fc4393f80a0",
  "convergence.test.ts": "f94ad5f5d1f9216eb5da5219fbe3716342289e2ce68230b7b2a0e427c7321c7c",
  "robustesse.test.ts": "f854147e6235a4e021deb916f96c9701b465e4d22c8f0110f9ca869a849f0fbb",
  "structure.test.ts": "4c87a48aa438251ab81fb272e796577fdf13b7a9adc504671ea0f3710d77741a",
};

describe("contrat du paquet", () => {
  it("F-007-AC24 les exports sont ceux des features livrées, la façade a ses sept membres d'avant plus restaurerPage et supprimerDefinitivement, et le seul code nouveau est page-hors-corbeille", () => {
    const exportes = [
      ...texteDe("../src/index.ts").matchAll(/\bexport\s+(?:type\s+)?\{([^}]*)\}/g),
    ].flatMap(([, clause = ""]) =>
      clause
        .split(",")
        .map((nom) => nom.replace(/^\s*type\s+/, "").trim())
        .filter((nom) => nom !== ""),
    );
    expect(exportes.sort()).toEqual([...EXPORTS_ATTENDUS].sort());

    const espace = creerSuivie();
    const methodes = Object.fromEntries(
      Object.entries(espace)
        .filter(([, valeur]) => typeof valeur === "function")
        .map(([nom, valeur]) => [nom, (valeur as (...arguments_: unknown[]) => unknown).length]),
    );
    expect(methodes).toEqual(METHODES_ATTENDUES);
    expect(Object.keys(espace).sort()).toEqual(["doc", ...Object.keys(METHODES_ATTENDUES)].sort());

    const union = /export type CodeErreurDocument =([^;]*);/.exec(texteDe("../src/erreurs.ts"));
    expect([...(union?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(([, code]) => code)).toEqual(
      CODES_ATTENDUS,
    );
    const code: CodeErreurDocument = "page-hors-corbeille";
    expect(new ErreurDocument(code, "x").code).toBe("page-hors-corbeille");
  });

  it.each(Object.entries(TESTS_DE_F001))(
    "F-007-AC25 %s, test de F-001, n'est pas modifié",
    (fichier, empreinte) => {
      expect(
        createHash("sha256")
          .update(texteDe(`./${fichier}`))
          .digest("hex"),
      ).toBe(empreinte);
    },
  );

  it("F-007-AC25 la version de format reste 1 et les règles de lecture ne changent pas : un document dont des entrées ont été retirées se relit à l'identique par son état complet, et l'identifiant retiré y est introuvable", () => {
    const { espace, parent } = espaceAvecCorbeille(creerSuivie());
    espace.supprimerDefinitivement(parent);

    const vierge = new Y.Doc();
    Y.applyUpdate(vierge, Y.encodeStateAsUpdate(espace.doc));
    const relue = ouvrirSuivie(vierge);

    expect(relue.lire()).toEqual(espace.lire());
    expect(vierge.getMap("meta").get("version")).toBe(1);
    expect(refus(relue, () => relue.renommerPage(parent, "x")).code).toBe("page-introuvable");
  });
});
