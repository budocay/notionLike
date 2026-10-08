import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  type Arborescence,
  creerDocumentEspace,
  type DocumentEspace,
  ErreurDocument,
  type IdPage,
  ouvrirDocumentEspace,
  type PageLue,
} from "../src/index.ts";
import { GRAINE, NOMBRE_EXECUTIONS } from "./aides.ts";

const TITRE_MAXIMAL = "t".repeat(200);
const TITRE_TROP_LONG = "t".repeat(201);
const PROFONDEUR = 10_000;

type Champs = Record<string, unknown>;

function page(id: IdPage, titre: string, enfants: readonly PageLue[] = []): PageLue {
  return { id, titre, enfants };
}

/** Une entrée écrite par `yjs` seul : ses champs sont ceux qu'on lui donne, rien de plus. */
function entree(champs: Champs): Y.Map<unknown> {
  const valeur = new Y.Map<unknown>();
  for (const [champ, contenu] of Object.entries(champs)) {
    valeur.set(champ, contenu);
  }
  return valeur;
}

function champsValides(titre: string, parent: IdPage | null, rang: string): Champs {
  return { titre, place: { parent, rang }, corbeille: false };
}

function ecrirePages(doc: Y.Doc, valeurs: Record<IdPage, unknown>): void {
  doc.transact(() => {
    for (const [id, valeur] of Object.entries(valeurs)) {
      doc.getMap("pages").set(id, valeur);
    }
  });
}

function identifiantsLus({ racines, corbeille }: Arborescence): IdPage[] {
  const lus: IdPage[] = [];
  const aVoir = [...racines, ...corbeille];
  for (const lue of aVoir) {
    lus.push(lue.id);
    lue.enfants.forEach((enfant) => aVoir.push(enfant));
  }
  return lus;
}

function codeDuRefus(operation: () => void): unknown {
  try {
    operation();
    return "acceptée";
  } catch (erreur) {
    return erreur instanceof ErreurDocument ? erreur.code : erreur;
  }
}

function codesDesQuatreEcritures(espace: DocumentEspace, id: IdPage): unknown[] {
  return [
    codeDuRefus(() => espace.renommerPage(id, "x")),
    codeDuRefus(() => espace.deplacerPage(id, { parent: null })),
    codeDuRefus(() => espace.mettreALaCorbeille(id)),
    codeDuRefus(() => espace.creerPage("x", { parent: id })),
  ];
}

// Une page valide, l'entrée à l'épreuve, et une fille valide de cette entrée : le tout reçu par
// une façade déjà ouverte et écoutée.
function recevoirAvecUneEntree(suspecte: unknown): {
  espace: DocumentEspace;
  notifications: number;
} {
  const source = new Y.Doc();
  ecrirePages(source, {
    valide: entree(champsValides("Valide", null, "k")),
    suspecte,
    fille: entree(champsValides("Fille", "suspecte", "V")),
  });
  const espace = ouvrirDocumentEspace(new Y.Doc());
  const rappel = vi.fn();
  espace.abonner(rappel);
  Y.applyUpdate(espace.doc, Y.encodeStateAsUpdate(source));
  return { espace, notifications: rappel.mock.calls.length };
}

const ENTREES_MAL_FORMEES: { cas: string; fabriquer: () => unknown }[] = [
  { cas: "une chaîne à la place de l'entrée", fabriquer: () => "pas une entrée" },
  { cas: "un nombre à la place de l'entrée", fabriquer: () => 42 },
  { cas: "null à la place de l'entrée", fabriquer: () => null },
  {
    cas: "un objet simple à la place de l'entrée",
    fabriquer: () => champsValides("Objet", null, "V"),
  },
  { cas: "un Y.Array à la place de l'entrée", fabriquer: () => new Y.Array() },
  { cas: "un Y.Text à la place de l'entrée", fabriquer: () => new Y.Text("texte") },
  {
    cas: "le titre manquant",
    fabriquer: () => entree({ place: { parent: null, rang: "V" }, corbeille: false }),
  },
  { cas: "la place manquante", fabriquer: () => entree({ titre: "T", corbeille: false }) },
  {
    cas: "le drapeau de corbeille manquant",
    fabriquer: () => entree({ titre: "T", place: { parent: null, rang: "V" } }),
  },
  {
    cas: "un titre qui est un nombre",
    fabriquer: () => entree({ ...champsValides("T", null, "V"), titre: 12 }),
  },
  {
    cas: "un titre null",
    fabriquer: () => entree({ ...champsValides("T", null, "V"), titre: null }),
  },
  {
    cas: "un titre de 201 caractères",
    fabriquer: () => entree(champsValides(TITRE_TROP_LONG, null, "V")),
  },
  {
    cas: "un drapeau de corbeille en chaîne",
    fabriquer: () => entree({ ...champsValides("T", null, "V"), corbeille: "false" }),
  },
  {
    cas: "un drapeau de corbeille en nombre",
    fabriquer: () => entree({ ...champsValides("T", null, "V"), corbeille: 0 }),
  },
  {
    cas: "une place null",
    fabriquer: () => entree({ ...champsValides("T", null, "V"), place: null }),
  },
  {
    cas: "une place en tableau",
    fabriquer: () => entree({ ...champsValides("T", null, "V"), place: [null, "V"] }),
  },
  {
    cas: "une place en chaîne",
    fabriquer: () => entree({ ...champsValides("T", null, "V"), place: "V" }),
  },
  {
    cas: "une place qui est un type partagé",
    fabriquer: () =>
      entree({ ...champsValides("T", null, "V"), place: entree({ parent: null, rang: "V" }) }),
  },
  {
    cas: "une place sans parent",
    fabriquer: () => entree({ ...champsValides("T", null, "V"), place: { rang: "V" } }),
  },
  {
    cas: "une place sans rang",
    fabriquer: () => entree({ ...champsValides("T", null, "V"), place: { parent: null } }),
  },
  {
    cas: "un parent qui est un nombre",
    fabriquer: () => entree({ ...champsValides("T", null, "V"), place: { parent: 3, rang: "V" } }),
  },
  {
    cas: "un parent qui est un objet",
    fabriquer: () => entree({ ...champsValides("T", null, "V"), place: { parent: {}, rang: "V" } }),
  },
  {
    cas: "un rang qui est un nombre",
    fabriquer: () => entree({ ...champsValides("T", null, "V"), place: { parent: null, rang: 5 } }),
  },
  {
    cas: "un rang null",
    fabriquer: () =>
      entree({ ...champsValides("T", null, "V"), place: { parent: null, rang: null } }),
  },
  { cas: "un rang vide", fabriquer: () => entree(champsValides("T", null, "")) },
  { cas: "un rang qui finit par 0", fabriquer: () => entree(champsValides("T", null, "V0")) },
  { cas: "un rang réduit à 0", fabriquer: () => entree(champsValides("T", null, "0")) },
  { cas: "un rang hors de l'alphabet", fabriquer: () => entree(champsValides("T", null, "a-b")) },
  {
    cas: "un rang avec une lettre accentuée",
    fabriquer: () => entree(champsValides("T", null, "é")),
  },
  {
    cas: "un rang suivi d'un saut de ligne",
    fabriquer: () => entree(champsValides("T", null, "V\n")),
  },
];

const ENTREES_BIEN_FORMEES: { cas: string; fabriquer: () => unknown; titre: string }[] = [
  {
    cas: "un titre de 200 caractères",
    fabriquer: () => entree(champsValides(TITRE_MAXIMAL, null, "V")),
    titre: TITRE_MAXIMAL,
  },
  { cas: "un titre vide", fabriquer: () => entree(champsValides("", null, "V")), titre: "" },
  {
    cas: "un champ inconnu en plus dans l'entrée",
    fabriquer: () => entree({ ...champsValides("T", null, "V"), icone: "🙂" }),
    titre: "T",
  },
  {
    cas: "un champ inconnu en plus dans la place",
    fabriquer: () =>
      entree({ ...champsValides("T", null, "V"), place: { parent: null, rang: "V", depuis: 3 } }),
    titre: "T",
  },
  {
    cas: "un rang long qui commence par des zéros",
    fabriquer: () => entree(champsValides("T", null, "000z")),
    titre: "T",
  },
  {
    cas: "un parent désigné par une chaîne vide",
    fabriquer: () => entree(champsValides("T", "", "V")),
    titre: "T",
  },
];

describe("ignorer une entrée de page mal formée", () => {
  it.each(ENTREES_MAL_FORMEES)(
    "F-001-AC16 $cas : l'entrée est ignorée sans exception, les autres pages restent lues, rien n'est écrit",
    ({ fabriquer }) => {
      let recu: { espace: DocumentEspace; notifications: number } | undefined;
      expect(() => {
        recu = recevoirAvecUneEntree(fabriquer());
      }).not.toThrow();
      const espace = recu?.espace ?? creerDocumentEspace();
      const etatRecu = Y.encodeStateAsUpdate(espace.doc);

      expect(espace.lire()).toEqual({
        racines: [page("fille", "Fille"), page("valide", "Valide")],
        corbeille: [],
      });
      expect(recu?.notifications).toBe(1);
      expect(ouvrirDocumentEspace(espace.doc).lire()).toEqual(espace.lire());
      expect(codesDesQuatreEcritures(espace, "suspecte")).toEqual(
        Array.from({ length: 4 }, () => "page-introuvable"),
      );
      expect(Y.encodeStateAsUpdate(espace.doc)).toEqual(etatRecu);
    },
  );

  it.each(ENTREES_BIEN_FORMEES)(
    "F-001-AC16 $cas : l'entrée est retenue, avec sa fille",
    ({ fabriquer, titre }) => {
      const { espace } = recevoirAvecUneEntree(fabriquer());

      expect(espace.lire()).toEqual({
        racines: [page("suspecte", titre, [page("fille", "Fille")]), page("valide", "Valide")],
        corbeille: [],
      });
    },
  );

  it("F-001-AC16 toute clé de pages est un identifiant, chaîne vide comprise", () => {
    const doc = new Y.Doc();
    ecrirePages(doc, {
      "": entree(champsValides("Sans identifiant", null, "V")),
      fille: entree(champsValides("Fille", "", "V")),
    });

    expect(ouvrirDocumentEspace(doc).lire().racines).toEqual([
      page("", "Sans identifiant", [page("fille", "Fille")]),
    ]);
  });

  it("F-001-AC16 une opération sur une page valide reste possible à côté d'une entrée mal formée", () => {
    const { espace } = recevoirAvecUneEntree(entree({ titre: 12 }));

    espace.renommerPage("valide", "Renommée");
    const creee = espace.creerPage("Créée", { parent: null, position: 0 });
    espace.deplacerPage("fille", { parent: "valide" });

    expect(espace.lire().racines).toEqual([
      page(creee, "Créée"),
      page("valide", "Renommée", [page("fille", "Fille")]),
    ]);
    expect(espace.doc.getMap("pages").has("suspecte")).toBe(true);
  });

  it("F-001-AC16 pour toutes valeurs arbitraires écrites dans pages ou dans une entrée, lire() ne lève pas et expose exactement les pages bien formées", () => {
    const identifiants = Array.from({ length: 8 }, (_, numero) => `p${numero}`);
    const rangValide = fc.constantFrom("V", "k", "0V", "zz", "A1");
    const placeValide = fc.record({
      parent: fc.option(fc.constantFrom(...identifiants, "absente"), { nil: null }),
      rang: rangValide,
    });
    const champsBienFormes = fc.record({
      titre: fc.string({ maxLength: 12 }),
      place: placeValide,
      corbeille: fc.boolean(),
    });
    // Chaque champ est tiré bien formé ou quelconque ; un champ peut aussi manquer.
    const champQuelconque = fc.option(fc.jsonValue(), { nil: undefined });
    const champsQuelconques = fc.record({
      titre: fc.oneof(fc.string({ maxLength: 12 }), champQuelconque),
      place: fc.oneof(placeValide, champQuelconque),
      corbeille: fc.oneof(fc.boolean(), champQuelconque),
    });
    const valeur = fc.oneof(
      fc.record({ nature: fc.constant("entree" as const), champs: champsBienFormes }),
      fc.record({ nature: fc.constant("entree" as const), champs: champsQuelconques }),
      fc.record({ nature: fc.constant("brute" as const), champs: fc.jsonValue() }),
    );

    function estUnePlaceBienFormee(place: unknown): boolean {
      if (typeof place !== "object" || place === null || Array.isArray(place)) {
        return false;
      }
      const { parent, rang } = place as Champs;
      return (
        (parent === null || typeof parent === "string") &&
        typeof rang === "string" &&
        /^[0-9A-Za-z]*[1-9A-Za-z]$/.test(rang)
      );
    }

    function estBienFormee(tiree: { nature: "entree" | "brute"; champs: unknown }): boolean {
      if (tiree.nature === "brute") {
        return false;
      }
      const { titre, place, corbeille } = tiree.champs as Champs;
      return (
        typeof titre === "string" &&
        titre.length <= 200 &&
        typeof corbeille === "boolean" &&
        estUnePlaceBienFormee(place)
      );
    }

    // Yjs n'enregistre que des valeurs JSON ordinaires : les objets tirés sans prototype et les
    // champs tirés `undefined` (c'est-à-dire absents) sont ramenés à cette forme avant l'écriture.
    function enJsonOrdinaire<T>(tire: T): T {
      return JSON.parse(JSON.stringify(tire)) as T;
    }

    fc.assert(
      fc.property(fc.dictionary(fc.constantFrom(...identifiants), valeur), (tireesBrutes) => {
        const tirees = enJsonOrdinaire(tireesBrutes);
        const source = new Y.Doc();
        ecrirePages(
          source,
          Object.fromEntries(
            Object.entries(tirees).map(([id, tiree]) => [
              id,
              tiree.nature === "entree" ? entree(tiree.champs) : tiree.champs,
            ]),
          ),
        );
        const espace = ouvrirDocumentEspace(new Y.Doc());
        espace.abonner(() => espace.lire());

        Y.applyUpdate(espace.doc, Y.encodeStateAsUpdate(source));

        const bienFormees = Object.keys(tirees).filter((id) => {
          const tiree = tirees[id];
          return tiree !== undefined && estBienFormee(tiree);
        });
        expect(identifiantsLus(espace.lire()).sort()).toEqual(bienFormees.sort());
        expect(ouvrirDocumentEspace(espace.doc).lire()).toEqual(espace.lire());
      }),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS },
    );
  });
});

describe("lire un arbre très profond", () => {
  function chaine(profondeur: number): Y.Doc {
    const doc = new Y.Doc();
    doc.transact(() => {
      for (let niveau = 0; niveau < profondeur; niveau += 1) {
        const parent = niveau === 0 ? null : `niveau-${niveau - 1}`;
        doc
          .getMap("pages")
          .set(`niveau-${niveau}`, entree(champsValides(`Niveau ${niveau}`, parent, "V")));
      }
    });
    return doc;
  }

  function profondeurLue(pages: readonly PageLue[]): number {
    let profondeur = 0;
    for (let niveau = pages; niveau.length > 0; niveau = niveau[0]?.enfants ?? []) {
      profondeur += 1;
    }
    return profondeur;
  }

  it("F-001-AC16 un arbre de 10 000 niveaux reçu par une façade écoutée se lit sans exception, en entier", () => {
    const espace = ouvrirDocumentEspace(new Y.Doc());
    const rappel = vi.fn();
    espace.abonner(rappel);

    expect(() =>
      Y.applyUpdate(espace.doc, Y.encodeStateAsUpdate(chaine(PROFONDEUR))),
    ).not.toThrow();

    expect(rappel).toHaveBeenCalledTimes(1);
    expect(profondeurLue(espace.lire().racines)).toBe(PROFONDEUR);
    expect(identifiantsLus(espace.lire())).toHaveLength(PROFONDEUR);
  });

  it("F-001-AC16 les opérations restent possibles au fond d'un arbre de 10 000 niveaux", () => {
    const espace = ouvrirDocumentEspace(chaine(PROFONDEUR));
    const fond = `niveau-${PROFONDEUR - 1}`;

    espace.renommerPage(fond, "Fond renommé");
    expect(codeDuRefus(() => espace.deplacerPage("niveau-0", { parent: fond }))).toBe(
      "deplacement-cyclique",
    );
    const creee = espace.creerPage("Sous le fond", { parent: fond });
    espace.deplacerPage(creee, { parent: null });
    expect(profondeurLue(espace.lire().racines)).toBe(PROFONDEUR);
    expect(espace.lire().racines.map((lue) => lue.id)).toEqual(["niveau-0", creee]);

    espace.mettreALaCorbeille("niveau-0");

    expect(espace.lire().racines.map((lue) => lue.id)).toEqual([creee]);
    expect(profondeurLue(espace.lire().corbeille)).toBe(PROFONDEUR);
  });

  it("F-001-AC16 un cycle de 10 000 pages se lit sans exception, coupé en un seul point", () => {
    const doc = chaine(PROFONDEUR);
    doc
      .getMap<Y.Map<unknown>>("pages")
      .get("niveau-0")
      ?.set("place", {
        parent: `niveau-${PROFONDEUR - 1}`,
        rang: "V",
      });

    const lue = ouvrirDocumentEspace(doc).lire();

    expect(lue.racines.map((racine) => racine.id)).toEqual(["niveau-0"]);
    expect(profondeurLue(lue.racines)).toBe(PROFONDEUR);
  });
});

describe("exposer à la racine une page dont le parent est ignoré", () => {
  it("F-001-AC17 la fille d'une entrée mal formée est lue à la racine, avec sa propre descendance, de la même façon sur une seconde réplique", () => {
    const source = new Y.Doc();
    ecrirePages(source, {
      ignoree: entree(champsValides(TITRE_TROP_LONG, null, "V")),
      fille: entree(champsValides("Fille", "ignoree", "k")),
      "petite-fille": entree(champsValides("Petite-fille", "fille", "V")),
      autre: entree(champsValides("Autre", null, "V")),
    });
    const attendu = {
      racines: [
        page("autre", "Autre"),
        page("fille", "Fille", [page("petite-fille", "Petite-fille")]),
      ],
      corbeille: [],
    };

    const premiere = ouvrirDocumentEspace(source);
    const seconde = ouvrirDocumentEspace(new Y.Doc());
    Y.applyUpdate(seconde.doc, Y.encodeStateAsUpdate(source));

    expect(premiere.lire()).toEqual(attendu);
    expect(seconde.lire()).toEqual(attendu);
  });

  it("F-001-AC17 une page jetée dont le parent est ignoré est une racine de la corbeille", () => {
    const doc = new Y.Doc();
    ecrirePages(doc, {
      ignoree: "pas une entrée",
      jetee: entree({ ...champsValides("Jetée", "ignoree", "V"), corbeille: true }),
    });

    expect(ouvrirDocumentEspace(doc).lire()).toEqual({
      racines: [],
      corbeille: [page("jetee", "Jetée")],
    });
  });

  it("F-001-AC17 quand l'entrée du parent redevient bien formée, la fille le rejoint", () => {
    const doc = new Y.Doc();
    ecrirePages(doc, {
      parent: entree({ titre: "Parent", corbeille: false }),
      fille: entree(champsValides("Fille", "parent", "V")),
    });
    const espace = ouvrirDocumentEspace(doc);
    expect(espace.lire().racines).toEqual([page("fille", "Fille")]);

    doc.getMap<Y.Map<unknown>>("pages").get("parent")?.set("place", { parent: null, rang: "V" });

    expect(espace.lire().racines).toEqual([page("parent", "Parent", [page("fille", "Fille")])]);
  });
});

const VERSIONS_NON_PRISES_EN_CHARGE: { cas: string; fabriquer: () => unknown }[] = [
  { cas: "2", fabriquer: () => 2 },
  { cas: "2.5", fabriquer: () => 2.5 },
  { cas: "1.5", fabriquer: () => 1.5 },
  { cas: "0", fabriquer: () => 0 },
  { cas: "-1", fabriquer: () => -1 },
  { cas: 'la chaîne "1"', fabriquer: () => "1" },
  { cas: 'la chaîne "2"', fabriquer: () => "2" },
  { cas: "true", fabriquer: () => true },
  { cas: "null", fabriquer: () => null },
  { cas: "undefined écrit", fabriquer: () => undefined },
  { cas: "un objet", fabriquer: () => ({ version: 1 }) },
  { cas: "un tableau", fabriquer: () => [1] },
  { cas: "un type partagé", fabriquer: () => new Y.Map() },
];

describe("refuser une version de format inconnue", () => {
  function espaceEnVersion(version: unknown): { espace: DocumentEspace; page: IdPage } {
    const espace = creerDocumentEspace();
    const creee = espace.creerPage("Page");
    espace.doc.getMap("meta").set("version", version);
    return { espace, page: creee };
  }

  it.each(VERSIONS_NON_PRISES_EN_CHARGE)(
    "F-001-AC18 version $cas : lire() et chaque écriture lèvent version-non-prise-en-charge, sans rien modifier",
    ({ fabriquer }) => {
      const { espace, page: creee } = espaceEnVersion(fabriquer());
      const etatAvant = Y.encodeStateAsUpdate(espace.doc);

      expect(espace.doc.getMap("meta").has("version")).toBe(true);
      expect(codeDuRefus(() => espace.lire())).toBe("version-non-prise-en-charge");
      expect(codesDesQuatreEcritures(espace, creee)).toEqual(
        Array.from({ length: 4 }, () => "version-non-prise-en-charge"),
      );
      expect(codeDuRefus(() => espace.creerPage("x"))).toBe("version-non-prise-en-charge");
      expect(Y.encodeStateAsUpdate(espace.doc)).toEqual(etatAvant);
    },
  );

  it.each(VERSIONS_NON_PRISES_EN_CHARGE)(
    "F-001-AC18 version $cas : ouvrirDocumentEspace et abonner ne lèvent pas, seules la lecture et les écritures sont refusées",
    ({ fabriquer }) => {
      const { espace } = espaceEnVersion(fabriquer());
      const etatAvant = Y.encodeStateAsUpdate(espace.doc);
      let ouverte: DocumentEspace | undefined;

      expect(() => {
        ouverte = ouvrirDocumentEspace(espace.doc);
        ouverte.abonner(() => undefined)();
      }).not.toThrow();

      expect(codeDuRefus(() => ouverte?.lire())).toBe("version-non-prise-en-charge");
      expect(Y.encodeStateAsUpdate(espace.doc)).toEqual(etatAvant);
    },
  );

  it("F-001-AC18 clé version absente : le document se lit comme une version 1, lecture et écritures permises", () => {
    const espace = ouvrirDocumentEspace(new Y.Doc());

    const creee = espace.creerPage("Page");
    espace.renommerPage(creee, "Renommée");

    expect(espace.doc.getMap("meta").has("version")).toBe(false);
    expect(espace.lire().racines).toEqual([page(creee, "Renommée")]);
  });

  it("F-001-AC18 la version non prise en charge est contrôlée avant le titre : les deux refus ensemble donnent version-non-prise-en-charge", () => {
    const { espace, page: creee } = espaceEnVersion(2);

    expect(codeDuRefus(() => espace.creerPage("t".repeat(201)))).toBe(
      "version-non-prise-en-charge",
    );
    expect(codeDuRefus(() => espace.renommerPage(creee, "t".repeat(201)))).toBe(
      "version-non-prise-en-charge",
    );
  });

  it("F-001-AC18 un abonné est notifié quand la version devient inconnue, et de nouveau quand elle redevient 1", () => {
    const espace = creerDocumentEspace();
    const creee = espace.creerPage("Page");
    const avant = espace.lire();
    const rappel = vi.fn();
    espace.abonner(rappel);

    espace.doc.getMap("meta").set("version", 2);

    expect(rappel).toHaveBeenCalledTimes(1);
    expect(codeDuRefus(() => espace.lire())).toBe("version-non-prise-en-charge");

    espace.doc.getMap("meta").set("version", 1);

    expect(rappel).toHaveBeenCalledTimes(2);
    expect(espace.lire()).toEqual(avant);
    expect(espace.lire().racines).toEqual([page(creee, "Page")]);
  });

  it("F-001-AC18 une version inconnue reçue par Y.applyUpdate ne fait pas lever la synchronisation : l'abonné est notifié, la lecture est refusée, puis rétablie", () => {
    const source = creerDocumentEspace();
    const creee = source.creerPage("Page");
    const replique = ouvrirDocumentEspace(new Y.Doc());
    Y.applyUpdate(replique.doc, Y.encodeStateAsUpdate(source.doc));
    const lectures: unknown[] = [];
    replique.abonner(() => lectures.push(codeDuRefus(() => replique.lire())));

    source.doc.getMap("meta").set("version", 99);
    expect(() => Y.applyUpdate(replique.doc, Y.encodeStateAsUpdate(source.doc))).not.toThrow();

    expect(lectures).toEqual(["version-non-prise-en-charge"]);
    expect(codeDuRefus(() => replique.mettreALaCorbeille(creee))).toBe(
      "version-non-prise-en-charge",
    );

    source.doc.getMap("meta").set("version", 1);
    expect(() => Y.applyUpdate(replique.doc, Y.encodeStateAsUpdate(source.doc))).not.toThrow();

    expect(lectures).toEqual(["version-non-prise-en-charge", "acceptée"]);
    expect(replique.lire()).toEqual(source.lire());
  });

  it("F-001-AC18 tant que la version reste inconnue, les mises à jour reçues ne notifient pas ; au retour à 1, la lecture reflète tout ce qui a été reçu", () => {
    const source = creerDocumentEspace();
    const replique = ouvrirDocumentEspace(new Y.Doc());
    source.doc.getMap("meta").set("version", 2);
    Y.applyUpdate(replique.doc, Y.encodeStateAsUpdate(source.doc));
    const rappel = vi.fn();
    replique.abonner(rappel);

    ecrirePages(source.doc, { recue: entree(champsValides("Reçue", null, "V")) });
    Y.applyUpdate(replique.doc, Y.encodeStateAsUpdate(source.doc));

    expect(rappel).not.toHaveBeenCalled();

    source.doc.getMap("meta").delete("version");
    Y.applyUpdate(replique.doc, Y.encodeStateAsUpdate(source.doc));

    expect(rappel).toHaveBeenCalledTimes(1);
    expect(replique.lire().racines).toEqual([page("recue", "Reçue")]);
  });
});
