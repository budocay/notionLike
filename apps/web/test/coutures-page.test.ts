// Coutures de la façade du document de page (F-003-AC35), extension de celles de F-002-AC31 : les
// fichiers du workspace qui font entrer `ouvrirDocumentPage` sont énumérés par leurs imports, chacun
// inscrit dans sa sorte ; chaque appelant qui ouvre une façade de page la ferme, prouvé par le compte
// des écouteurs et des observateurs du `Y.Doc` ; la fermeture d'une façade de page, d'une façade
// d'espace, d'une session d'espace, d'une session de page ou d'une persistance ne vaut fermeture
// d'aucune autre. Les fichiers sont lus comme du texte, comme dans `coutures.test.ts`.
import { ErreurDocument, VERSION_PAGE_PRISE_EN_CHARGE } from "@notionlike/document";
import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { messageErreur } from "../src/interface/messages.ts";
import { creerPagesOuvertes } from "../src/page/pages-ouvertes.ts";
import { estUnePageDeVersionAdmise } from "../src/page/session-page.ts";
import { ouvrirPersistance } from "../src/persistance/index.ts";
import { depuisLaRacine, lireLesFichiersDuWorkspace } from "./aides-coutures.ts";
import { demarrerSession, ecouteurs, ouvrirFacade } from "./aides-facade.ts";
import {
  contenuLu,
  fermerLesFacadesDePage,
  miseAJourDUneReplique,
  observateursDuDocument,
  ouvrirFacadeDePage,
} from "./aides-facade-page.ts";
import { attendreEtat, ESPACE_A, laisserIndexedDbTravailler } from "./aides-persistance.ts";
import { demarrerUneSession, PAGE_A, PAGE_A_DE_L_ESPACE_A } from "./aides-session-page.tsx";

const ICI = "apps/web/test";
const PAQUET = "@notionlike/document";
const NOM_OUVRIR_PAGE = "ouvrirDocumentPage";
const VERSION_INCONNUE = VERSION_PAGE_PRISE_EN_CHARGE + 1;

// Les deux fichiers d'où la fonction d'ouverture peut sortir du paquet.
const DEFINITION = ["packages/document/src/document-page.ts", "packages/document/src/index.ts"];
// Les sortes d'ouvrants d'une façade de page. Un fichier qui fait entrer la fonction, où que ce soit
// dans le workspace, doit être inscrit dans l'une d'elles, avec ce qu'elle exige.
const SESSION_DE_PAGE = "apps/web/src/page/session-page.ts";
const PRODUCTION = [SESSION_DE_PAGE];
const AIDE_D_APPS_WEB = "apps/web/test/aides-facade-page.ts";
const AIDE_DU_PAQUET = "packages/document/test/aides-page.ts";
const AIDES_SUIVIES = [AIDE_D_APPS_WEB, AIDE_DU_PAQUET];
const IMPORT_ENTIER_SANS_OUVERTURE = ["apps/web/test/structure.test.ts"];
// Liste fermée de F-002-AC31, qui ne reçoit aucun fichier de cette feature.
const FACADES_DE_TEST_DE_F001_NON_MODIFIABLES = [
  "packages/document/test/abonnement.test.ts",
  "packages/document/test/aides.ts",
  "packages/document/test/convergence.test.ts",
  "packages/document/test/operations.test.ts",
  "packages/document/test/robustesse.test.ts",
];
// Qui démarre une session de page : la seule ouverture de production, et l'aide qui la suit.
const PAGES_OUVERTES = "apps/web/src/page/pages-ouvertes.ts";
const AIDE_DE_SESSION_DE_PAGE = "apps/web/test/aides-session-page.tsx";
const NOM_DU_DEMARRAGE = "demarrerSessionPage";

const fichiers = lireLesFichiersDuWorkspace();

function texteDe(chemin: string): string {
  const texte = fichiers.get(chemin);
  if (texte === undefined) {
    throw new Error(`fichier non lu : ${chemin}`);
  }
  return texte;
}

interface Declaration {
  /** Noms que la déclaration fait entrer, avant tout renommage par `as`. */
  readonly noms: readonly string[];
  /** Vrai quand la déclaration prend le module entier. */
  readonly entier: boolean;
  /** Module visé ; inconnu quand l'argument d'un import dynamique est calculé. */
  readonly source: string | undefined;
  readonly exporte: boolean;
}

// Mêmes motifs que `coutures.test.ts` (F-002-AC31), dont ce fichier ne peut rien importer.
const DECLARATION_STATIQUE = /(?:^|;)[ \t]*(import|export)\b([^"'`;]*?)\bfrom\s*["']([^"']+)["']/gm;
const IMPORT_DYNAMIQUE = /\bimport\s*\(([^)]*)\)/g;
const COMMENTAIRE_EN_BLOC = /\/\*[^]*?\*\//g;
const CHAINE_LITTERALE = /^["']([^"']+)["']$/;

function nomsDeLaClause(clause: string): string[] {
  const entreAccolades = /\{([^}]*)\}/.exec(clause)?.[1] ?? "";
  return entreAccolades
    .split(",")
    .map((element) => /^\s*(?:type\s+)?([\w$]+)/.exec(element)?.[1] ?? "")
    .filter((nom) => nom !== "");
}

function declarationsDe(texte: string): Declaration[] {
  const statiques = [...texte.matchAll(DECLARATION_STATIQUE)].map(
    ([, motCle, clause = "", source]): Declaration => ({
      noms: nomsDeLaClause(clause),
      entier: clause.includes("*"),
      source,
      exporte: motCle === "export",
    }),
  );
  const dynamiques = [...texte.matchAll(IMPORT_DYNAMIQUE)].map(
    ([, argument = ""]): Declaration => ({
      noms: [],
      entier: true,
      source: CHAINE_LITTERALE.exec(argument.replace(COMMENTAIRE_EN_BLOC, "").trim())?.[1],
      exporte: false,
    }),
  );
  return [...statiques, ...dynamiques];
}

function sansExtension(chemin: string): string {
  return chemin.replace(/\.(ts|tsx|js)$/, "");
}

function vise(chemin: string, source: string): string {
  return sansExtension(depuisLaRacine(chemin.slice(0, chemin.lastIndexOf("/")), source));
}

// Un module pris en entier donne la fonction s'il est le paquet, l'un de ses sous-chemins, l'un des
// deux fichiers de définition, ou un module que le texte ne permet pas de connaître.
function donneLOuverture(chemin: string, source: string | undefined): boolean {
  if (source === undefined || source === PAQUET || source.startsWith(`${PAQUET}/`)) {
    return true;
  }
  return source.startsWith(".") && DEFINITION.map(sansExtension).includes(vise(chemin, source));
}

function nommeLOuverture(declaration: Declaration): boolean {
  return declaration.noms.includes(NOM_OUVRIR_PAGE);
}

function estUnOuvrant(chemin: string, texte: string): boolean {
  return (
    new RegExp(`\\b(?:function|const|let|var)\\s+${NOM_OUVRIR_PAGE}\\b`).test(texte) ||
    declarationsDe(texte).some(
      (declaration) =>
        nommeLOuverture(declaration) ||
        (declaration.entier && donneLOuverture(chemin, declaration.source)),
    )
  );
}

function fichiersQui(critere: (chemin: string, texte: string) => boolean): string[] {
  return [...fichiers]
    .filter(([chemin, texte]) => critere(chemin, texte))
    .map(([chemin]) => chemin)
    .sort();
}

function occurrences(texte: string, motif: string): number {
  return [...texte.matchAll(new RegExp(motif, "g"))].length;
}

function appelsDOuverture(texte: string): number {
  return occurrences(texte, `\\b${NOM_OUVRIR_PAGE}\\s*\\(`);
}

// La fonction rendue au dehors : entre les accolades d'un `export`, par défaut, ou par le module
// entier réexporté.
function exporteLOuverture(chemin: string, texte: string): boolean {
  return (
    new RegExp(`\\bexport\\s*\\{[^}]*\\b${NOM_OUVRIR_PAGE}\\b`).test(texte) ||
    new RegExp(`\\bexport\\s+default\\s+${NOM_OUVRIR_PAGE}\\b`).test(texte) ||
    declarationsDe(texte).some(
      (declaration) =>
        declaration.exporte && declaration.entier && donneLOuverture(chemin, declaration.source),
    )
  );
}

function faitEntrerLeDemarrage(chemin: string, texte: string): boolean {
  return declarationsDe(texte).some(
    (declaration) =>
      declaration.noms.includes(NOM_DU_DEMARRAGE) ||
      (declaration.entier &&
        declaration.source?.startsWith(".") === true &&
        vise(chemin, declaration.source) === sansExtension(SESSION_DE_PAGE)),
  );
}

// Les déclarations d'essai sont assemblées ici pour que ce fichier, lu lui aussi, n'en porte aucune.
const MOT_IMPORT = "import";
function statique(motCle: "import" | "export", clause: string, source: string): string {
  return `${motCle} ${clause} from "${source}";\n`;
}
function dynamique(argument: string): string {
  return `const module = await ${MOT_IMPORT}(${argument});\n`;
}

/** Observateurs, simples et profonds, des types racine du document : ni ses écouteurs, ni ceux de la persistance. */
function observateursDesTypes(doc: Y.Doc): number {
  let compte = 0;
  doc.share.forEach((type) => {
    compte += type._eH.l.length + type._dEH.l.length;
  });
  return compte;
}

/** Relève chaque type sur lequel un observateur simple est posé tant que l'espion est actif. */
function espionnerLesObservations(): {
  types: () => Y.AbstractType<unknown>[];
  arreter: () => void;
} {
  const espion = vi.spyOn(Y.AbstractType.prototype, "observe");
  return {
    types: () => [...new Set(espion.mock.contexts as Y.AbstractType<unknown>[])],
    arreter: () => espion.mockRestore(),
  };
}

function observateursRestantsSur(types: readonly Y.AbstractType<unknown>[]): number {
  return types.reduce((somme, type) => somme + type._eH.l.length + type._dEH.l.length, 0);
}

function codeDuRefus(operation: () => unknown): string | undefined {
  try {
    operation();
    return undefined;
  } catch (erreur) {
    return erreur instanceof ErreurDocument ? erreur.code : "autre erreur";
  }
}

/** Un document qui porte une version que cette application ne prend pas en charge. */
function documentDeVersionInconnue(): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(
    doc,
    miseAJourDUneReplique(doc, (replique) => replique.eleverVersion(VERSION_INCONNUE)),
  );
  return doc;
}

describe("énumération des fichiers qui ouvrent une façade de page", () => {
  it.each([
    ["un import nommé", statique("import", `{ ${NOM_OUVRIR_PAGE} }`, PAQUET)],
    ["un import renommé", statique("import", `{ ${NOM_OUVRIR_PAGE} as ouvrir }`, PAQUET)],
    [
      "un import sur plusieurs lignes, mêlé à des types",
      statique("import", `{\n  type DocumentPage,\n  ${NOM_OUVRIR_PAGE},\n}`, PAQUET),
    ],
    ["un import venu d'un autre fichier", statique("import", `{ ${NOM_OUVRIR_PAGE} }`, "./x.ts")],
    ["un réexport", statique("export", `{ ${NOM_OUVRIR_PAGE} }`, PAQUET)],
    ["un réexport renommé", statique("export", `{ ${NOM_OUVRIR_PAGE} as ouvre }`, "./x.ts")],
    ["le paquet entier sous un nom", statique("import", "* as doc", PAQUET)],
    ["le paquet entier réexporté", statique("export", "*", PAQUET)],
    ["un sous-chemin du paquet", statique("import", "* as page", `${PAQUET}/src/document-page.ts`)],
    [
      "l'entrée du paquet par son chemin",
      statique("import", "* as doc", "../../../packages/document/src/index.ts"),
    ],
    [
      "le fichier de définition par son chemin, sans extension",
      statique("import", "* as doc", "../../../packages/document/src/document-page"),
    ],
    ["l'import dynamique du paquet", dynamique(`"${PAQUET}"`)],
    ["un import dynamique annoté", dynamique(`/* @vite-ignore */ "${PAQUET}"`)],
    ["un import dynamique dont l'argument est calculé", dynamique("chemin")],
    ["la définition de la fonction", `export function ${NOM_OUVRIR_PAGE}(doc) {}\n`],
  ])("F-003-AC35 voit comme ouvrant d'une façade de page %s", (_cas, texte) => {
    expect(estUnOuvrant(`${ICI}/essai.ts`, texte)).toBe(true);
  });

  it.each([
    [
      "un import de types et d'erreurs du paquet",
      statique("import", "{ type DocumentPage, ErreurDocument }", PAQUET),
    ],
    ["l'ouverture de la façade d'espace", statique("import", "{ ouvrirDocumentEspace }", PAQUET)],
    ["la lecture de version, qui n'ouvre rien", statique("import", "{ lireVersionPage }", PAQUET)],
    ["yjs entier", statique("import", "* as Y", "yjs")],
    [
      "la session de page entière",
      statique("import", "* as session", "../src/page/session-page.ts"),
    ],
    ["les aides suivies", statique("import", "{ ouvrirFacadeDePage }", "./aides-facade-page.ts")],
    ["l'import dynamique d'un autre module", dynamique('"./aides-persistance.ts"')],
    [
      "un autre fichier du paquet, pris en entier",
      statique("import", "* as format", "../../../packages/document/src/format-page.ts"),
    ],
    ["le nom cité dans un commentaire", `// ${NOM_OUVRIR_PAGE}(doc) ouvre une façade\n`],
  ])("F-003-AC35 ne prend pas pour un ouvrant d'une façade de page %s", (_cas, texte) => {
    expect(estUnOuvrant(`${ICI}/essai.ts`, texte)).toBe(false);
  });

  it("F-003-AC35 énumère par leurs imports tous les fichiers du workspace qui font entrer la fonction d'ouverture de la façade de page, chacun inscrit dans sa sorte, et la liste d'exemptions de F-002-AC31 n'en reçoit aucun", () => {
    const attendus = [
      ...DEFINITION,
      ...PRODUCTION,
      ...AIDES_SUIVIES,
      ...IMPORT_ENTIER_SANS_OUVERTURE,
    ];
    const ouvrants = fichiersQui(estUnOuvrant);

    expect(ouvrants).toEqual([...attendus].sort());
    expect(new Set(attendus).size).toBe(attendus.length);
    expect(
      ouvrants.filter((chemin) => FACADES_DE_TEST_DE_F001_NON_MODIFIABLES.includes(chemin)),
    ).toEqual([]);
    // La liste d'exemptions de F-002-AC31 est restée celle de F-001.
    const listeDeF002 = /const FACADES_DE_TEST_DE_F001_NON_MODIFIABLES = \[([^\]]*)\]/.exec(
      texteDe("apps/web/test/coutures.test.ts"),
    )?.[1];
    expect([...(listeDeF002 ?? "").matchAll(/"([^"]+)"/g)].map(([, chemin]) => chemin)).toEqual(
      FACADES_DE_TEST_DE_F001_NON_MODIFIABLES,
    );
    // L'énumération lit bien le workspace : code et tests d'apps/web et du paquet, ce fichier compris.
    expect([...fichiers.keys()]).toEqual(
      expect.arrayContaining([
        "apps/web/src/page/pages-ouvertes.ts",
        "apps/web/src/edition/EditeurDePage.tsx",
        "apps/web/test/coutures-page.test.ts",
        "packages/document/src/format-page.ts",
        "packages/document/test/page-fermeture.test.ts",
      ]),
    );
  });

  it("F-003-AC35 les fichiers de définition : la fonction est définie dans document-page.ts et l'entrée du paquet la réexporte de ce seul fichier", () => {
    const [definition = "", entree = ""] = DEFINITION;

    expect(texteDe(definition)).toMatch(new RegExp(`\\bexport function ${NOM_OUVRIR_PAGE}\\(`));
    expect(
      declarationsDe(texteDe(entree))
        .filter(nommeLOuverture)
        .map(({ source, exporte }) => [source, exporte]),
    ).toEqual([["./document-page.ts", true]]);
  });

  it.each(IMPORT_ENTIER_SANS_OUVERTURE)(
    "F-003-AC35 import entier sans ouverture %s : le nom de la fonction n'y est jamais appelé",
    (chemin) => {
      expect(appelsDOuverture(texteDe(chemin))).toBe(0);
      expect(declarationsDe(texteDe(chemin)).some(nommeLOuverture)).toBe(false);
    },
  );

  it.each([
    [AIDE_D_APPS_WEB, 2],
    [AIDE_DU_PAQUET, 2],
  ])(
    "F-003-AC35 aide suivie %s : %i appels d'ouverture, chacun fermé, et la fonction n'est pas rendue au dehors",
    (chemin, appels) => {
      const texte = texteDe(chemin);

      expect(appelsDOuverture(texte)).toBe(appels);
      expect(exporteLOuverture(chemin, texte)).toBe(false);
      for (const rendue of [
        statique("export", `{ ${NOM_OUVRIR_PAGE} }`, PAQUET),
        `export { ${NOM_OUVRIR_PAGE} as ouvrir };\n`,
        `export default ${NOM_OUVRIR_PAGE};\n`,
        statique("export", "*", PAQUET),
      ]) {
        expect(exporteLOuverture(chemin, `${texte}${rendue}`), rendue).toBe(true);
      }
    },
  );

  it.each([
    [
      "un import nommé",
      statique("import", `{ ${NOM_DU_DEMARRAGE} }`, "../src/page/session-page.ts"),
    ],
    ["un import renommé", statique("import", `{ ${NOM_DU_DEMARRAGE} as demarrer }`, "./x.ts")],
    ["le module entier", statique("import", "* as session", "../src/page/session-page.ts")],
    ["le module réexporté", statique("export", "*", "../src/page/session-page")],
    ["l'import dynamique du module", dynamique('"../src/page/session-page.ts"')],
  ])("F-003-AC35 voit comme démarrant une session de page %s", (_cas, texte) => {
    expect(faitEntrerLeDemarrage(`${ICI}/essai.ts`, texte)).toBe(true);
  });

  it("F-003-AC35 seuls pages-ouvertes.ts dans src/ et aides-session-page.tsx dans les tests démarrent une session de page ; un import de type ou de la seule garde n'en démarre pas", () => {
    expect(fichiersQui(faitEntrerLeDemarrage)).toEqual([PAGES_OUVERTES, AIDE_DE_SESSION_DE_PAGE]);
    expect(
      faitEntrerLeDemarrage(
        `${ICI}/essai.ts`,
        statique(
          "import",
          "{ type SessionPage, estUnePageDeVersionAdmise }",
          "../src/page/session-page.ts",
        ),
      ),
    ).toBe(false);
  });
});

describe("chaque ouvrant d'une façade de page la ferme, prouvé par le compte d'observateurs", () => {
  it("F-003-AC35 production session-page.ts : un seul appel d'ouverture ; la session prête pose un observateur sur le type de version, sa fermeture le retire, et la fermeture de la persistance rend au Y.Doc son compte de départ", async () => {
    expect(appelsDOuverture(texteDe(SESSION_DE_PAGE))).toBe(1);
    const doc = new Y.Doc();
    const depart = observateursDuDocument(doc);
    const { session, persistance } = demarrerUneSession(PAGE_A_DE_L_ESPACE_A, doc);

    await waitFor(() => expect(session.lireEtat().phase).toBe("pret"));

    expect(observateursDesTypes(doc)).toBe(1);
    session.fermer();
    expect(observateursDesTypes(doc)).toBe(0);
    persistance.fermer();
    await laisserIndexedDbTravailler();
    // Seul reste l'écouteur des mises à jour que l'aide pose et retire en fin de test.
    expect(doc._observers.get("update")?.size).toBe(1);
    expect(observateursDuDocument(doc)).toBe(depart + 1);
  });

  it("F-003-AC35 F-030-AC10 juge d'un témoin dans session-page.ts : la façade ouverte pour juger un témoin est fermée avant le retour, que la version soit admise ou refusée", () => {
    const admis = new Y.Doc();
    const refuse = documentDeVersionInconnue();
    const departs = [observateursDuDocument(admis), observateursDuDocument(refuse)];

    expect(estUnePageDeVersionAdmise(admis)).toBe(true);
    expect(estUnePageDeVersionAdmise(refuse)).toBe(false);

    expect([observateursDuDocument(admis), observateursDuDocument(refuse)]).toEqual(departs);
  });

  it("F-003-AC35 pages-ouvertes.ts, qui démarre la session de page : chaque type observé pendant l'ouverture d'une page n'a plus aucun observateur après la fermeture de sa session", async () => {
    const espion = espionnerLesObservations();
    const pages = creerPagesOuvertes();
    try {
      const session = pages.ouvrir({ idEspace: ESPACE_A, idPage: PAGE_A });
      await waitFor(() => expect(session.lireEtat().phase).toBe("pret"));
      expect(espion.types().length).toBeGreaterThan(0);
      expect(observateursRestantsSur(espion.types())).toBe(espion.types().length);

      session.fermer();

      expect(observateursRestantsSur(espion.types())).toBe(0);
    } finally {
      espion.arreter();
      pages.fermer();
      await laisserIndexedDbTravailler();
    }
  });

  it("F-003-AC35 aide suivie aides-facade-page.ts : chaque façade ouverte ajoute un observateur, la fermeture des aides le retire ; la façade de la réplique est fermée avant le retour", () => {
    const doc = new Y.Doc();
    const depart = observateursDuDocument(doc);

    ouvrirFacadeDePage(doc);
    contenuLu(doc);
    expect(observateursDuDocument(doc)).toBe(depart + 2);
    expect(fermerLesFacadesDePage()).toBe(0);
    expect(observateursDuDocument(doc)).toBe(depart);

    const espion = espionnerLesObservations();
    try {
      miseAJourDUneReplique(doc, (replique) =>
        replique.eleverVersion(VERSION_PAGE_PRISE_EN_CHARGE),
      );
      expect(espion.types()).toHaveLength(1);
      expect(observateursRestantsSur(espion.types())).toBe(0);
    } finally {
      espion.arreter();
    }
  });

  it("F-003-AC35 un observateur resté sur un type du document après la fermeture de la façade est vu : le compte ne se fie pas à l'appel de fermer()", () => {
    const doc = new Y.Doc();
    ouvrirFacadeDePage(doc);
    const oublie = (): void => undefined;
    doc.share.forEach((type) => type.observe(oublie));

    const restes = fermerLesFacadesDePage();
    doc.share.forEach((type) => type.unobserve(oublie));

    expect(restes).toBe(doc.share.size);
    expect(restes).toBeGreaterThan(0);
    expect(observateursDesTypes(doc)).toBe(0);
  });
});

describe("la fermeture de l'un ne vaut pas fermeture d'un autre", () => {
  it("F-003-AC35 fermer la persistance ne ferme pas la façade de page ouverte sur le même Y.Doc : elle reste ouverte, sa garde est encore prévenue, puis sa propre fermeture rend au Y.Doc son compte de départ", async () => {
    const doc = new Y.Doc();
    const depart = observateursDuDocument(doc);
    const page = ouvrirFacadeDePage(doc);
    const persistance = ouvrirPersistance(doc, {
      type: "page",
      idEspace: ESPACE_A,
      idPage: PAGE_A,
    });
    await attendreEtat(persistance, "active");
    expect(observateursDesTypes(doc)).toBe(1);

    persistance.fermer();
    await laisserIndexedDbTravailler();

    expect(persistance.lireEtat()).toBe("fermee");
    expect(observateursDesTypes(doc)).toBe(1);
    expect(codeDuRefus(() => page.eleverVersion(VERSION_PAGE_PRISE_EN_CHARGE))).toBeUndefined();
    const garde = vi.fn();
    page.garderVersion(garde);
    Y.applyUpdate(
      doc,
      miseAJourDUneReplique(doc, (replique) => replique.eleverVersion(VERSION_INCONNUE)),
    );
    expect(garde).toHaveBeenCalledTimes(1);

    page.fermer();

    expect(codeDuRefus(() => page.eleverVersion(VERSION_PAGE_PRISE_EN_CHARGE))).toBe(
      "facade-fermee",
    );
    expect(observateursDuDocument(doc)).toBe(depart);
  });

  it("F-003-AC35 façade de page et façade d'espace sur le même Y.Doc : fermer l'une laisse l'autre ouverte, dans les deux ordres", () => {
    const doc = new Y.Doc();
    const espace = ouvrirFacade(doc);
    const page = ouvrirFacadeDePage(doc);
    expect([ecouteurs(doc), observateursDesTypes(doc)]).toEqual([1, 1]);

    espace.fermer();

    expect([ecouteurs(doc), observateursDesTypes(doc)]).toEqual([0, 1]);
    expect(codeDuRefus(() => espace.creerPage("a"))).toBe("facade-fermee");
    expect(codeDuRefus(() => page.eleverVersion(VERSION_PAGE_PRISE_EN_CHARGE))).toBeUndefined();

    const espaceRouvert = ouvrirFacade(doc);
    page.fermer();

    expect([ecouteurs(doc), observateursDesTypes(doc)]).toEqual([1, 0]);
    expect(codeDuRefus(() => espaceRouvert.creerPage("b"))).toBeUndefined();
    espaceRouvert.fermer();
    expect(ecouteurs(doc)).toBe(0);
  });

  it("F-003-AC35 session d'espace et façade de page sur le même Y.Doc : fermer la session ne ferme pas la façade de page, qui se ferme ensuite seule", async () => {
    const session = demarrerSession();
    const doc = session.doc;
    if (doc === undefined) {
      throw new Error("La session n'a pas de document.");
    }
    await waitFor(() => expect(session.lireEtat().phase).toBe("pret"));
    const departDesEcouteurs = ecouteurs(new Y.Doc());
    const page = ouvrirFacadeDePage(doc);
    expect(ecouteurs(doc)).toBe(departDesEcouteurs + 1);

    session.fermer();

    expect(ecouteurs(doc)).toBe(departDesEcouteurs);
    expect(observateursDesTypes(doc)).toBe(1);
    expect(codeDuRefus(() => page.eleverVersion(VERSION_PAGE_PRISE_EN_CHARGE))).toBeUndefined();
    page.fermer();
    expect(observateursDesTypes(doc)).toBe(0);
  });

  it("F-003-AC35 session de page et façade de page sur le même Y.Doc : fermer la session laisse la façade ouverte, fermer la façade laisse la session prête et gardée", async () => {
    const premier = new Y.Doc();
    const { session } = demarrerUneSession(PAGE_A_DE_L_ESPACE_A, premier);
    await waitFor(() => expect(session.lireEtat().phase).toBe("pret"));
    const page = ouvrirFacadeDePage(premier);
    expect(observateursDesTypes(premier)).toBe(2);

    session.fermer();

    expect(observateursDesTypes(premier)).toBe(1);
    expect(codeDuRefus(() => page.eleverVersion(VERSION_PAGE_PRISE_EN_CHARGE))).toBeUndefined();
    page.fermer();
    expect(observateursDesTypes(premier)).toBe(0);

    const second = new Y.Doc();
    const suivie = demarrerUneSession({ idEspace: ESPACE_A, idPage: PAGE_A }, second);
    await waitFor(() => expect(suivie.session.lireEtat().phase).toBe("pret"));
    const autre = ouvrirFacadeDePage(second);

    autre.fermer();

    expect(observateursDesTypes(second)).toBe(1);
    expect(suivie.session.lireEtat().phase).toBe("pret");
    Y.applyUpdate(
      second,
      miseAJourDUneReplique(second, (replique) => replique.eleverVersion(VERSION_INCONNUE)),
    );
    expect(suivie.session.lireEtat().phase).toBe("version-non-prise-en-charge");
    expect(observateursDesTypes(second)).toBe(0);
  });

  it("F-003-AC35 session de page et persistance : fermer la persistance laisse la façade de la session ouverte, que seule la fermeture de la session retire", async () => {
    const doc = new Y.Doc();
    const { session, persistance } = demarrerUneSession(PAGE_A_DE_L_ESPACE_A, doc);
    await waitFor(() => expect(session.lireEtat().phase).toBe("pret"));

    persistance.fermer();
    await laisserIndexedDbTravailler();

    expect(persistance.lireEtat()).toBe("fermee");
    expect(observateursDesTypes(doc)).toBe(1);
    session.fermer();
    expect(observateursDesTypes(doc)).toBe(0);
  });
});

describe("traducteur des codes d'erreur du document", () => {
  it("F-003-AC35 F-003-AC24 le traducteur porte « version-invalide » par une phrase française sans code technique, et traite toujours « facade-fermee »", () => {
    const traducteur = texteDe("apps/web/src/interface/messages.ts");
    expect(traducteur).toMatch(/"version-invalide":/);
    expect(traducteur).toMatch(/"facade-fermee":/);

    const message = messageErreur("version-invalide");
    expect(message).toMatch(/^[A-ZÀ-Ý][^]*\.$/);
    expect(message).toMatch(/ (a été|n'a pas été|est|peut) /);
    expect(message).not.toMatch(/version-invalide|invalide|[a-z]+-[a-z]+|\d/);
    expect(messageErreur("facade-fermee")).not.toBe(message);
    expect(messageErreur("facade-fermee")).not.toMatch(/facade|fermee/);
  });
});
