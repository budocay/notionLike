// F-007 : coutures de la corbeille dans apps/web : modules qui importent le document et traduction
// des codes (AC24), formes d'adresse (AC27), ramasse-miettes des documents d'espace (AC29).
import type { CodeErreurDocument } from "@notionlike/document";
import { beforeAll, describe, expect, it } from "vitest";

import { messageErreur } from "../src/interface/messages.ts";
import {
  estLaCorbeille,
  estLEcranDuCompte,
  FRAGMENT_DE_LA_CORBEILLE,
  fragmentDe,
  lireEcranDEspaces,
  lireRoute,
} from "../src/navigation/route.ts";
import { lire, lister } from "./aides-disque.ts";
import { type Aretes, atteintsDepuis, graphe } from "./aides-graphe.ts";
import { PAGE_P } from "./aides-identifiants.ts";

const PAQUET = "@notionlike/document";

// Exhaustif par le type : un code ajouté au paquet sans entrée ici ne compile plus.
const CODES = Object.keys({
  "page-introuvable": true,
  "page-a-la-corbeille": true,
  "deplacement-cyclique": true,
  "titre-trop-long": true,
  "position-invalide": true,
  "version-non-prise-en-charge": true,
  "facade-fermee": true,
  "version-invalide": true,
  "rang-indisponible": true,
  "page-hors-corbeille": true,
  // F-017 : refus du document de table.
  "pas-un-document-de-table": true,
  "type-de-colonne-inconnu": true,
  "nom-non-admis": true,
  "libelle-non-admis": true,
  "ligne-introuvable": true,
  "colonne-introuvable": true,
  "colonne-sans-options": true,
  "option-introuvable": true,
  "valeur-non-conforme": true,
} satisfies Record<CodeErreurDocument, true>) as CodeErreurDocument[];

// Modules de src/ qui importent le paquet du document, à la date de F-007.
const IMPORTATEURS_DU_DOCUMENT = [
  "src/espace/garde-version.ts",
  "src/espace/session-espace.ts",
  "src/interface/Application.tsx",
  "src/interface/BarreLaterale.tsx",
  "src/interface/EcranDeLaCorbeille.tsx",
  "src/interface/FilDAriane.tsx",
  "src/interface/RangeePage.tsx",
  "src/interface/ZonePrincipale.tsx",
  "src/interface/messages.ts",
  "src/interface/pages.ts",
  "src/interface/repli.ts",
  "src/page/session-page.ts",
  // F-013 : la réplique lit la version d'une page, la synchronisation les pages de l'arborescence.
  "src/synchronisation/miroir.ts",
  "src/synchronisation/pages-de-l-espace.ts",
  // F-018 : la session de table ouvre la façade du document de table.
  "src/table/session-table.ts",
  // F-018 : l'écran de table lit la table par la façade que la session lui donne.
  "src/vues-de-table/EcranDeTable.tsx",
];

// Modules de src/ qui construisent un `Y.Doc` : la session porte le document d'espace, le témoin
// en porte une copie le temps de la juger, les pages ouvertes portent des documents de page.
const CONSTRUCTEURS_DE_Y_DOC = [
  "src/espace/session-espace.ts",
  "src/page/pages-ouvertes.ts",
  "src/persistance/temoin.ts",
  // F-013 : la réplique de la page affichée (H8), le document d'une page de la passe de fond.
  "src/synchronisation/miroir.ts",
  "src/synchronisation/passe-de-fond.ts",
  // F-018 : les tables ouvertes portent des documents de table, ramasse-miettes posé (H13).
  "src/table/tables-ouvertes.ts",
];

function sources(): string[] {
  return lister("src").filter((chemin) => /\.tsx?$/.test(chemin));
}

function importeLeDocument(texte: string): boolean {
  return new RegExp(`from\\s+"${PAQUET}"`).test(texte);
}

let aretes: Aretes;
beforeAll(async () => {
  aretes = await graphe();
}, 60_000);

describe("modules qui importent le document", () => {
  it("F-007-AC24 la liste des modules de src/ qui importent @notionlike/document est exacte, et chacun est atteint par au moins un test", () => {
    const importateurs = sources().filter((chemin) => importeLeDocument(lire(chemin)));
    expect(importateurs).toEqual([...IMPORTATEURS_DU_DOCUMENT].sort());

    const tests = [...aretes.keys()].filter((module) => /^test\/.*\.test\.tsx?$/.test(module));
    const atteints = new Set(tests.flatMap((test) => [...atteintsDepuis(aretes, test)]));
    for (const module of importateurs) {
      expect(atteints.has(module), module).toBe(true);
    }
    expect(atteints.has("src/inexistant.ts")).toBe(false);
  });

  it("F-007-AC24 F-017-AC25 le traducteur donne un message français distinct, sans code, pour chacun des dix-neuf codes, page-hors-corbeille et les neuf de la table compris", () => {
    // F-017 : dix-neuf, avec les neuf de la table.
    expect(CODES).toHaveLength(19);
    const messages = CODES.map((code) => {
      const message = messageErreur(code);
      expect(message, code).toMatch(/^[A-ZÀ-Ý][^]*\.$/);
      expect(message, code).not.toContain(code);
      expect(message, code).not.toMatch(/[a-z]+-[a-z]+-[a-z]+|undefined|Error/);
      return message;
    });
    expect(new Set(messages).size).toBe(messages.length);
    expect(messageErreur("page-hors-corbeille")).toContain("corbeille");
  });
});

describe("formes d'adresse", () => {
  it("F-007-AC27 #/corbeille est une forme exacte : ni ses variantes, ni une autre forme ne l'est", () => {
    expect(FRAGMENT_DE_LA_CORBEILLE).toBe("#/corbeille");
    expect(estLaCorbeille("#/corbeille")).toBe(true);
    for (const variante of ["#/corbeille/", "#/Corbeille", "#/corbeille?x", "#corbeille", "#/"]) {
      expect(estLaCorbeille(variante), variante).toBe(false);
    }
  });

  it("F-007-AC27 les formes déjà livrées gardent leur comportement : pages (F-002-AC11 à AC13), compte (F-010-AC26, F-027-AC27), espaces (F-014-AC38), et #/corbeille n'en désigne aucune", () => {
    // F-002 : la corbeille n'est ni une page ni une page refusée, et ne sélectionne rien.
    expect(lireRoute("#/corbeille")).toEqual({ forme: "accueil" });
    expect(lireRoute(`#/page/${PAGE_P}`)).toEqual({ forme: "page", idPage: PAGE_P });
    expect(lireRoute("#/page/x")).toEqual({ forme: "page-introuvable" });
    expect(lireRoute("#/")).toEqual({ forme: "accueil" });
    expect(fragmentDe({ forme: "page", idPage: PAGE_P })).toBe(`#/page/${PAGE_P}`);
    // F-010 et F-027.
    expect(lireRoute("#/connexion")).toEqual({ forme: "connexion" });
    expect(lireRoute("#/inscription")).toEqual({ forme: "inscription" });
    expect(estLEcranDuCompte("#/compte")).toBe(true);
    expect(estLEcranDuCompte("#/corbeille")).toBe(false);
    // F-014.
    expect(lireEcranDEspaces("#/espaces")).toEqual({ ecran: "espaces" });
    expect(lireEcranDEspaces("#/corbeille")).toBeUndefined();
    for (const fragment of ["#/connexion", "#/inscription", "#/compte", "#/espaces", "#/"]) {
      expect(estLaCorbeille(fragment), fragment).toBe(false);
    }
  });

  it("F-007-AC27 route.ts reste un calcul pur et le seul fichier qui écrit la forme de la corbeille", () => {
    const quiEcrivent = sources().filter((chemin) => lire(chemin).includes('"#/corbeille"'));
    expect(quiEcrivent).toEqual(["src/navigation/route.ts"]);
  });
});

/** Vrai si ce texte construit un `Y.Doc`. */
function construitUnYDoc(texte: string): boolean {
  return /\bnew\s+Y\.Doc\s*\(/.test(texte);
}

/** Vrai si ce texte coupe le ramasse-miettes d'un `Y.Doc`, à la construction ou après. */
function coupeLeRamasseMiettes(texte: string): boolean {
  return /\bgc\s*:\s*false\b|\.gc\s*=\s*false\b/.test(texte);
}

describe("ramasse-miettes des documents d'espace", () => {
  it.each([
    ["à la construction", "const doc = new Y.Doc({ gc: false });", true],
    ["avec d'autres options", "new Y.Doc({ guid: 'x', gc:false })", true],
    ["après la construction", "const doc = new Y.Doc();\ndoc.gc = false;", true],
    ["laissé par défaut", "const doc = new Y.Doc();", false],
    ["posé explicitement", "const doc = new Y.Doc({ gc: true });", false],
  ])(
    "F-007-AC29 la détection d'un ramasse-miettes coupé voit un module %s",
    (_cas, texte, coupe) => {
      expect(construitUnYDoc(texte)).toBe(true);
      expect(coupeLeRamasseMiettes(texte)).toBe(coupe);
    },
  );

  it("F-007-AC29 les modules d'apps/web qui construisent un Y.Doc sont énumérés, aucun ne coupe le ramasse-miettes, et la session le pose explicitement", () => {
    const constructeurs = sources().filter((chemin) => construitUnYDoc(lire(chemin)));
    expect(constructeurs).toEqual(CONSTRUCTEURS_DE_Y_DOC);
    expect(sources().filter((chemin) => coupeLeRamasseMiettes(lire(chemin)))).toEqual([]);
    expect(lire("src/espace/session-espace.ts")).toMatch(/new Y\.Doc\(\{ gc: true \}\)/);
    expect(lire("src/table/tables-ouvertes.ts")).toMatch(/new Y\.Doc\(\{ gc: true \}\)/);
  });
});
