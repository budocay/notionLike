// Coutures d'apps/web avec @notionlike/document : appelants de la façade (F-002-AC31), modules
// qui lisent le document (F-002-AC20, AC22), limite de titre et codes d'erreur (F-002-AC14, AC15),
// instance de yjs (F-002-AC21). Les fichiers du workspace sont lus comme du texte : aucun module
// d'un autre paquet n'est évalué ici, seuls des noms de fichiers, des déclarations d'import et des
// occurrences de noms en sont tirés (conception, « Règles de dépendances »).
import { type CodeErreurDocument, ErreurDocument } from "@notionlike/document";
import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { estDUneVersionAdmise } from "../src/espace/garde-version.ts";
import { LONGUEUR_MAX_TITRE, messageErreur } from "../src/interface/messages.ts";
import { ouvrirPersistance } from "../src/persistance/index.ts";
import {
  creerFacade,
  demarrerSession,
  ecouteurs,
  facadesEncoreOuvertes,
  fermerLesFacades,
  ouvrirFacade,
} from "./aides-facade.ts";
import {
  ecrireLaVersion,
  NOMS_DU_FORMAT,
  VERSION_NON_PRISE_EN_CHARGE,
  VERSION_PRISE_EN_CHARGE,
} from "./aides-format.ts";
import { attendreEtat, ESPACE_A } from "./aides-persistance.ts";
import texteDesAidesDeCouture from "./aides-coutures.ts?raw";
import { depuisLaRacine, lireLesFichiersDuWorkspace } from "./aides-coutures.ts";

const ICI = "apps/web/test";
const PAQUET = "@notionlike/document";
const NOMS_D_OUVERTURE = ["creerDocumentEspace", "ouvrirDocumentEspace"];
const [NOM_CREER = "", NOM_OUVRIR = ""] = NOMS_D_OUVERTURE;
const UN_NOM_D_OUVERTURE = `(?:${NOMS_D_OUVERTURE.join("|")})`;
// Les deux fichiers d'où les fonctions d'ouverture peuvent sortir du paquet.
const DEFINITION = ["packages/document/src/document-espace.ts", "packages/document/src/index.ts"];

// Les sortes d'ouvrants. Un fichier qui fait entrer l'une des deux fonctions, où que ce soit dans
// le workspace, doit être inscrit dans l'une d'elles, avec ce qu'elle exige.
const SESSION = "apps/web/src/espace/session-espace.ts";
const ENTREE = "apps/web/src/main.tsx";
const AIDES_DE_FACADE = "apps/web/test/aides-facade.ts";
const PRODUCTION = [SESSION];
// F-030-AC10 : la garde de version ouvre une façade sur un document témoin, le temps de le juger.
const GARDE_DE_VERSION = "apps/web/src/espace/garde-version.ts";
const JUGES_D_UN_TEMOIN = [GARDE_DE_VERSION];
const AIDES_SUIVIES = [
  "apps/web/test/aides-facade.ts",
  "packages/document/test/fermeture.test.ts",
  // F-007 : aide suivie des tests de la corbeille du paquet.
  "packages/document/test/aides-corbeille.ts",
  // F-012 : seule aide des tests d'apps/server qui ouvre une façade (F-012-AC29).
  "apps/server/test/aides-facade.ts",
];
const IMPORT_ENTIER_SANS_OUVERTURE = ["apps/web/test/structure.test.ts"];
const FACADES_DE_TEST_DE_F001_NON_MODIFIABLES = [
  "packages/document/test/abonnement.test.ts",
  "packages/document/test/aides.ts",
  "packages/document/test/convergence.test.ts",
  "packages/document/test/operations.test.ts",
  "packages/document/test/robustesse.test.ts",
];

const fichiers = lireLesFichiersDuWorkspace();
fichiers.set(`${ICI}/aides-coutures.ts`, texteDesAidesDeCouture);

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

// Un module pris en entier donne les deux fonctions s'il est le paquet, l'un de ses sous-chemins,
// l'un des deux fichiers de définition, ou un module que le texte ne permet pas de connaître.
function donneLesOuvertures(chemin: string, source: string | undefined): boolean {
  if (source === undefined || source === PAQUET || source.startsWith(`${PAQUET}/`)) {
    return true;
  }
  if (!source.startsWith(".")) {
    return false;
  }
  const dossier = chemin.slice(0, chemin.lastIndexOf("/"));
  const vise = sansExtension(depuisLaRacine(dossier, source));
  return DEFINITION.map(sansExtension).includes(vise);
}

function nommeUneOuverture(declaration: Declaration): boolean {
  return declaration.noms.some((nom) => NOMS_D_OUVERTURE.includes(nom));
}

function definitUneOuverture(texte: string): boolean {
  return new RegExp(`\\b(?:function|const|let|var)\\s+${UN_NOM_D_OUVERTURE}\\b`).test(texte);
}

function estUnOuvrant(chemin: string, texte: string): boolean {
  return (
    definitUneOuverture(texte) ||
    declarationsDe(texte).some(
      (declaration) =>
        nommeUneOuverture(declaration) ||
        (declaration.entier && donneLesOuvertures(chemin, declaration.source)),
    )
  );
}

function ouvrants(): string[] {
  return [...fichiers]
    .filter(([chemin, texte]) => estUnOuvrant(chemin, texte))
    .map(([chemin]) => chemin)
    .sort();
}

function occurrences(texte: string, motif: string): number {
  return [...texte.matchAll(new RegExp(motif, "g"))].length;
}

function appelsDOuverture(texte: string): number {
  return occurrences(texte, `\\b${UN_NOM_D_OUVERTURE}\\s*\\(`);
}

// Un nom d'ouverture rendu au dehors : entre les accolades d'un `export`, ou par défaut.
function exporteUneOuverture(chemin: string, texte: string): boolean {
  return (
    new RegExp(`\\bexport\\s*\\{[^}]*\\b${UN_NOM_D_OUVERTURE}\\b`).test(texte) ||
    new RegExp(`\\bexport\\s+default\\s+${UN_NOM_D_OUVERTURE}\\b`).test(texte) ||
    declarationsDe(texte).some(
      (declaration) =>
        declaration.exporte && declaration.entier && donneLesOuvertures(chemin, declaration.source),
    )
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

describe("énumération des fichiers qui ouvrent une façade", () => {
  it.each([
    ["un import nommé", statique("import", "{ ouvrirDocumentEspace }", PAQUET)],
    ["un import renommé", statique("import", "{ creerDocumentEspace as creer }", PAQUET)],
    [
      "un import sur plusieurs lignes, mêlé à des types",
      statique("import", "{\n  type DocumentEspace,\n  ouvrirDocumentEspace,\n}", PAQUET),
    ],
    ["un import venu d'un autre fichier", statique("import", "{ creerDocumentEspace }", "./x.ts")],
    ["un réexport", statique("export", "{ ouvrirDocumentEspace }", PAQUET)],
    ["un réexport renommé", statique("export", "{ ouvrirDocumentEspace as ouvre }", "./x.ts")],
    ["le paquet entier sous un nom", statique("import", "* as doc", PAQUET)],
    ["le paquet entier réexporté", statique("export", "*", PAQUET)],
    ["le paquet entier réexporté sous un nom", statique("export", "* as doc", PAQUET)],
    ["un sous-chemin du paquet", statique("import", "* as arbre", `${PAQUET}/src/arbre.ts`)],
    [
      "l'entrée du paquet par son chemin",
      statique("import", "* as doc", "../../../packages/document/src/index.ts"),
    ],
    [
      "le fichier de définition par son chemin, sans extension",
      statique("import", "* as doc", "../../../packages/document/src/document-espace"),
    ],
    ["l'import dynamique du paquet", dynamique(`"${PAQUET}"`)],
    ["un import dynamique annoté", dynamique(`/* @vite-ignore */ "${PAQUET}"`)],
    ["un import dynamique dont l'argument est calculé", dynamique("chemin")],
    ["la définition d'une des deux fonctions", `export function ${NOM_OUVRIR}(doc) {}\n`],
    [
      "une déclaration après une autre sur la même ligne",
      `${statique("import", "* as Y", "yjs").trim()} ${statique("import", "{ creerDocumentEspace }", PAQUET)}`,
    ],
  ])("F-002-AC31 voit comme ouvrant %s", (_cas, texte) => {
    expect(estUnOuvrant(`${ICI}/essai.ts`, texte)).toBe(true);
  });

  it.each([
    [
      "un import de types et d'erreurs du paquet",
      statique("import", "{ type DocumentEspace, ErreurDocument }", PAQUET),
    ],
    ["un import de type seul", statique("import", "type { Arborescence }", PAQUET)],
    ["yjs entier", statique("import", "* as Y", "yjs")],
    [
      "la persistance entière",
      statique("import", "* as persistance", "../src/persistance/index.ts"),
    ],
    ["les aides suivies", statique("import", "{ creerFacade, ouvrirFacade }", "./aides-facade.ts")],
    ["l'import dynamique d'un autre module", dynamique('"./aides-persistance.ts"')],
    [
      "un autre fichier du paquet, pris en entier",
      statique("import", "* as rang", "../../../packages/document/src/rang.ts"),
    ],
    [
      "un nom d'ouverture cité dans un commentaire",
      "// ouvrirDocumentEspace(doc) ouvre une façade\n",
    ],
  ])("F-002-AC31 ne prend pas pour un ouvrant %s", (_cas, texte) => {
    expect(estUnOuvrant(`${ICI}/essai.ts`, texte)).toBe(false);
  });

  it("F-002-AC31 énumère par leurs imports tous les fichiers du workspace qui font entrer une fonction d'ouverture, chacun inscrit dans sa sorte", () => {
    const attendus = [
      ...DEFINITION,
      ...PRODUCTION,
      ...JUGES_D_UN_TEMOIN,
      ...AIDES_SUIVIES,
      ...IMPORT_ENTIER_SANS_OUVERTURE,
      ...FACADES_DE_TEST_DE_F001_NON_MODIFIABLES,
    ];

    expect(ouvrants()).toEqual([...attendus].sort());
    expect(new Set(attendus).size).toBe(attendus.length);
    expect([...fichiers.keys()]).toEqual(
      expect.arrayContaining([
        "apps/web/src/identifiants/uuid-canonique.ts",
        "apps/web/src/interface/Application.tsx",
        "apps/web/src/main.tsx",
        "apps/web/src/persistance/indexeddb.ts",
        "apps/web/test/aides-coutures.ts",
        "apps/web/test/coutures.test.ts",
        "apps/web/test/preparation.ts",
        "packages/document/src/arbre.ts",
        "packages/document/test/rang.test.ts",
      ]),
    );
  });

  it("F-002-AC31 F-030-AC10 hors de ses deux fichiers de définition, aucun fichier de src/ autre que la session et la garde de version n'ouvre de façade, et dans apps/web/test seul aides-facade.ts fait entrer une fonction d'ouverture", () => {
    const horsDefinition = ouvrants().filter((chemin) => !DEFINITION.includes(chemin));

    expect(
      horsDefinition.filter((chemin) => /^(apps|packages)\/[^/]+\/src\//.test(chemin)),
    ).toEqual([...JUGES_D_UN_TEMOIN, ...PRODUCTION]);
    expect(
      horsDefinition.filter(
        (chemin) =>
          chemin.startsWith("apps/web/") && declarationsDe(texteDe(chemin)).some(nommeUneOuverture),
      ),
    ).toEqual([GARDE_DE_VERSION, SESSION, AIDES_DE_FACADE]);
  });
});

// Un fichier fait entrer le démarrage de la session s'il le nomme dans une déclaration, renommage
// compris, ou s'il prend en entier le module de la session. Un import dynamique à l'argument
// calculé n'est pas compté ici : l'énumération des ouvrants l'oblige déjà à figurer dans une sorte.
const NOM_DU_DEMARRAGE = "demarrerSessionEspace";
function faitEntrerLeDemarrage(chemin: string, texte: string): boolean {
  const dossier = chemin.slice(0, chemin.lastIndexOf("/"));
  return declarationsDe(texte).some((declaration) => {
    const viseLaSession =
      declaration.source?.startsWith(".") === true &&
      sansExtension(depuisLaRacine(dossier, declaration.source)) === sansExtension(SESSION);
    return declaration.noms.includes(NOM_DU_DEMARRAGE) || (declaration.entier && viseLaSession);
  });
}

function fichiersQui(critere: (chemin: string, texte: string) => boolean): string[] {
  return [...fichiers]
    .filter(([chemin, texte]) => critere(chemin, texte))
    .map(([chemin]) => chemin)
    .sort();
}

function sourcesDeLApplication(): [string, string][] {
  return [...fichiers].filter(([chemin]) => chemin.startsWith("apps/web/src/"));
}

describe("ce que chaque sorte d'ouvrant exige", () => {
  it.each(JUGES_D_UN_TEMOIN)(
    "F-030-AC10 F-002-AC31 juge d'un témoin %s : un seul appel d'ouverture, sur le témoin reçu, et sa façade est fermée avant le retour, que la version soit admise ou refusée",
    (chemin) => {
      expect(appelsDOuverture(texteDe(chemin))).toBe(1);
      const admis = creerFacade().doc;
      const refuse = creerFacade().doc;
      ecrireLaVersion(refuse, VERSION_NON_PRISE_EN_CHARGE);
      fermerLesFacades();
      const departs = [ecouteurs(admis), ecouteurs(refuse)];

      expect(estDUneVersionAdmise(admis)).toBe(true);
      expect(estDUneVersionAdmise(refuse)).toBe(false);
      expect(estDUneVersionAdmise(new Y.Doc())).toBe(true);

      expect([ecouteurs(admis), ecouteurs(refuse)]).toEqual(departs);
      expect(departs).toEqual([ecouteurs(new Y.Doc()), ecouteurs(new Y.Doc())]);
    },
  );

  it.each(PRODUCTION)(
    "F-002-AC31 production %s : la session démarrée ouvre une façade, un écouteur ; fermer() rend au Y.Doc le compte d'un document neuf",
    async (chemin) => {
      expect(appelsDOuverture(texteDe(chemin))).toBe(1);
      expect(occurrences(texteDe(chemin), `\\b${NOM_OUVRIR}\\s*\\(`)).toBe(1);
      const neuf = ecouteurs(new Y.Doc());
      const session = demarrerSession();
      const doc = session.doc;
      if (doc === undefined) {
        throw new Error("La session n'a pas de document.");
      }
      expect(ecouteurs(doc)).toBe(neuf);

      await waitFor(() => expect(session.lireEtat().phase).toBe("pret"));

      expect(ecouteurs(doc)).toBe(neuf + 1);
      expect(facadesEncoreOuvertes()).toBe(1);
      session.fermer();
      expect(ecouteurs(doc)).toBe(neuf);
      expect(facadesEncoreOuvertes()).toBe(0);
    },
  );

  it.each([
    [
      "un import nommé",
      statique("import", `{ ${NOM_DU_DEMARRAGE} }`, "../src/espace/session-espace.ts"),
    ],
    ["un import renommé", statique("import", `{ ${NOM_DU_DEMARRAGE} as demarrer }`, "./x.ts")],
    [
      "le module de la session entier",
      statique("import", "* as session", "../src/espace/session-espace.ts"),
    ],
    ["le module de la session réexporté", statique("export", "*", "../src/espace/session-espace")],
    ["l'import dynamique du module de la session", dynamique('"../src/espace/session-espace.ts"')],
  ])("F-002-AC31 voit comme démarrant une session %s", (_cas, texte) => {
    expect(faitEntrerLeDemarrage(`${ICI}/essai.ts`, texte)).toBe(true);
  });

  it.each([
    [
      "un import de type du module de la session",
      statique("import", "type { SessionEspace }", "../src/espace/session-espace.ts"),
    ],
    ["l'aide de démarrage", statique("import", "{ demarrerSession }", "./aides-facade.ts")],
    ["l'import dynamique de l'entrée", dynamique('"../src/main.tsx"')],
  ])("F-002-AC31 ne prend pas pour un démarrage de session %s", (_cas, texte) => {
    expect(faitEntrerLeDemarrage(`${ICI}/essai.ts`, texte)).toBe(false);
  });

  it("F-002-AC31 l'entrée est le seul fichier de src/ qui importe demarrerSessionEspace, et aides-facade.ts le seul de test/ et d'e2e/ : toute session de test est suivie", () => {
    expect(fichiersQui(faitEntrerLeDemarrage)).toEqual([ENTREE, AIDES_DE_FACADE]);

    // Dans l'aide, le module de la session ne sert qu'à quatre choses : son import, un type, un
    // appel de démarrage et l'espion de l'entrée. Il n'est ni rendu au dehors, ni passé en valeur.
    const aide = texteDe(AIDES_DE_FACADE);
    const nomDuModule =
      /\*\s+as\s+(\w+)\s+from\s*"\.\.\/src\/espace\/session-espace\.ts"/.exec(aide)?.[1] ?? "";
    expect(nomDuModule).not.toBe("");
    expect(occurrences(aide, `\\b${nomDuModule}\\b`)).toBe(4);
    expect(occurrences(aide, `\\b${nomDuModule}\\.${NOM_DU_DEMARRAGE}\\(\\)`)).toBe(1);
    expect(occurrences(aide, `vi\\.spyOn\\(${nomDuModule}, "${NOM_DU_DEMARRAGE}"\\)`)).toBe(1);
    expect(occurrences(aide, `=\\s*${nomDuModule}\\.SessionEspace;`)).toBe(1);
    expect(declarationsDe(aide).filter((declaration) => declaration.exporte)).toEqual([]);
    expect(occurrences(aide, `\\b${NOM_DU_DEMARRAGE}\\b`)).toBe(2);
    // L'entrée est importée par un chemin littéral : un argument calculé en ferait un ouvrant. Et
    // par cette aide seulement : un autre fichier de test qui l'importerait démarrerait une session
    // que personne ne suit.
    expect(aide).toContain(`await ${MOT_IMPORT}("../src/main.tsx")`);
    expect(
      fichiersQui((chemin, texte) => {
        const dossier = chemin.slice(0, chemin.lastIndexOf("/"));
        return declarationsDe(texte).some(
          ({ source }) =>
            source?.startsWith(".") === true &&
            sansExtension(depuisLaRacine(dossier, source)) === sansExtension(ENTREE),
        );
      }),
    ).toEqual([AIDES_DE_FACADE]);
  });

  it("F-002-AC31 F-030-AC10 la session et la garde de version sont les seuls fichiers de src/ qui nomment le type DocumentEspace : la session seule tient une façade entière, donc son abonner et son fermer ; la garde ne tient la sienne que le temps de juger un témoin", () => {
    const quiNommentLaFacade = sourcesDeLApplication()
      .filter(([, texte]) => /\bDocumentEspace\b/.test(texte))
      .map(([chemin]) => chemin);

    expect(quiNommentLaFacade).toEqual([GARDE_DE_VERSION, SESSION]);
    expect(texteDe(GARDE_DE_VERSION)).not.toMatch(/\.abonner\(/);
    expect(occurrences(texteDe(GARDE_DE_VERSION), "\\.fermer\\(\\)")).toBe(1);
    // Le mot est cherché seul : les deux noms d'ouverture ne le contiennent pas à une limite de mot.
    expect(/\bDocumentEspace\b/.test(`${NOM_CREER}() ${NOM_OUVRIR}(doc)`)).toBe(false);
    expect(/\bDocumentEspace\b/.test("Pick<DocumentEspace, 'lire'>")).toBe(true);
  });

  it.each(AIDES_SUIVIES)(
    "F-002-AC31 aide suivie %s : exactement deux appels d'ouverture, ceux de ses deux aides, et aucune des deux fonctions rendue au dehors",
    (chemin) => {
      const texte = texteDe(chemin);

      expect(appelsDOuverture(texte)).toBe(2);
      for (const nom of NOMS_D_OUVERTURE) {
        expect(occurrences(texte, `\\b${nom}\\s*\\(`), nom).toBe(1);
      }
      expect(exporteUneOuverture(chemin, texte)).toBe(false);
    },
  );

  it("F-002-AC31 dans aides-facade.ts, chaque fonction d'ouverture ne figure qu'à son import et à son appel : elle n'est ni passée en valeur ni renommée", () => {
    const chemin = "apps/web/test/aides-facade.ts";
    const texte = texteDe(chemin);

    for (const nom of NOMS_D_OUVERTURE) {
      expect(occurrences(texte, `\\b${nom}\\b`), nom).toBe(2);
    }
    expect(exporteUneOuverture(chemin, texte)).toBe(false);
    for (const rendue of [
      statique("export", `{ ${NOM_OUVRIR} }`, PAQUET),
      `export { ${NOM_CREER} as creer };\n`,
      `export default ${NOM_OUVRIR};\n`,
      statique("export", "*", PAQUET),
    ]) {
      expect(exporteUneOuverture(chemin, `${texte}${rendue}`), rendue).toBe(true);
    }
  });

  it.each(IMPORT_ENTIER_SANS_OUVERTURE)(
    "F-002-AC31 import entier sans ouverture %s : le module entier n'y sert qu'à lister ses exports",
    (chemin) => {
      const texte = texteDe(chemin);
      const nomsDuModule = [...texte.matchAll(/\*\s+as\s+(\w+)\s+from\s*"@notionlike\/document"/g)];
      const nom = nomsDuModule[0]?.[1] ?? "";

      expect(nomsDuModule).toHaveLength(1);
      expect(occurrences(texte, `\\b${nom}\\b`)).toBe(2);
      expect(texte).toContain(`Object.keys(${nom})`);
      // Un module importé à l'exécution n'est jamais gardé : il est attendu en échec, ou listé.
      const importsDynamiques = occurrences(texte, IMPORT_DYNAMIQUE.source);
      expect(importsDynamiques).toBeGreaterThan(0);
      expect(
        occurrences(texte, `(?:\\bexpect\\(|\\bObject\\.keys\\(await )${MOT_IMPORT}\\s*\\(`),
      ).toBe(importsDynamiques);
      expect(declarationsDe(texte).some(nommeUneOuverture)).toBe(false);
      expect(appelsDOuverture(texte)).toBe(0);
    },
  );

  it.each(FACADES_DE_TEST_DE_F001_NON_MODIFIABLES)(
    "F-002-AC31 façade de test de F-001, non modifiable, %s : le fichier existe, importe encore une fonction d'ouverture et ne ferme aucune façade",
    (chemin) => {
      const texte = texteDe(chemin);

      expect(declarationsDe(texte).some(nommeUneOuverture)).toBe(true);
      expect(appelsDOuverture(texte)).toBeGreaterThan(0);
      expect(texte).not.toMatch(/\.fermer\s*\(/);
    },
  );
});

describe("la fermeture se prouve par le compte d'écouteurs", () => {
  it("F-002-AC31 chaque façade ouverte par une aide ajoute un écouteur au Y.Doc, et la fermeture le ramène à son compte de départ", () => {
    const doc = new Y.Doc();
    const depart = ecouteurs(doc);
    expect(facadesEncoreOuvertes()).toBe(0);

    const premiere = ouvrirFacade(doc);
    ouvrirFacade(doc);
    const creee = creerFacade();

    expect(depart).toBe(0);
    expect(ecouteurs(doc)).toBe(depart + 2);
    expect(ecouteurs(creee.doc)).toBe(1);
    expect(facadesEncoreOuvertes()).toBe(3);
    premiere.fermer();
    expect(facadesEncoreOuvertes()).toBe(2);
    expect(fermerLesFacades()).toBe(0);
    expect(ecouteurs(doc)).toBe(depart);
    expect(ecouteurs(creee.doc)).toBe(0);
  });

  it("F-002-AC31 un écouteur resté sur le Y.Doc après fermer() est vu : le compte ne se fie pas à l'appel de fermer()", () => {
    const facade = ouvrirFacade(new Y.Doc());
    const ecouteurOublie = (): void => undefined;
    facade.doc.on("afterTransaction", ecouteurOublie);

    const resteesOuvertes = fermerLesFacades();
    facade.doc.off("afterTransaction", ecouteurOublie);

    expect(resteesOuvertes).toBe(1);
    expect(ecouteurs(facade.doc)).toBe(0);
  });

  it("F-002-AC31 fermer la persistance ne vaut pas fermeture de la façade ouverte sur le même Y.Doc", async () => {
    const facade = ouvrirFacade(new Y.Doc());
    const persistance = ouvrirPersistance(facade.doc, { type: "espace", idEspace: ESPACE_A });
    await attendreEtat(persistance, "active");
    // La persistance ne pose aucun écouteur sur l'événement que le compte regarde.
    expect(ecouteurs(facade.doc)).toBe(1);

    persistance.fermer();

    expect(persistance.lireEtat()).toBe("fermee");
    expect(facadesEncoreOuvertes()).toBe(1);
    facade.fermer();
    expect(facadesEncoreOuvertes()).toBe(0);
    expect(ecouteurs(facade.doc)).toBe(0);
  });
});

// Classement de chaque occurrence d'un nom d'ouverture dans un fichier d'aides suivies : seules
// quatre places sont admises. Une fonction passée en valeur ailleurs pourrait être appelée sous un
// autre nom, sur un `Y.Doc` que le fichier ne suit pas.
type Place = "import" | "appel" | "longueur mesurée" | "titre de test" | "autre";

// Premier argument, en chaîne, d'un `it(` ou d'un `describe(`, ou de l'appel qui suit un `.each(…)`.
const TITRE_DE_TEST = /(?:\b(?:it|describe)|\))\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1\s*,/g;

function plagesDe(texte: string, motif: RegExp): [number, number][] {
  return [...texte.matchAll(motif)].map((trouve) => [
    trouve.index,
    trouve.index + trouve[0].length,
  ]);
}

function placesDesNomsDOuverture(texte: string): { nom: string; place: Place }[] {
  const imports = plagesDe(texte, DECLARATION_STATIQUE);
  const titres = plagesDe(texte, TITRE_DE_TEST);
  const dans = (plages: [number, number][], position: number): boolean =>
    plages.some(([debut, fin]) => debut <= position && position < fin);
  return [...texte.matchAll(new RegExp(`\\b${UN_NOM_D_OUVERTURE}\\b`, "g"))].map((trouve) => {
    const nom = trouve[0];
    const avant = texte.slice(0, trouve.index);
    const apres = texte.slice(trouve.index + nom.length);
    let place: Place = "autre";
    if (dans(imports, trouve.index)) {
      place = "import";
    } else if (dans(titres, trouve.index)) {
      place = "titre de test";
    } else if (/\bexpect\(\s*$/.test(avant) && /^\s*\)\s*\.toHaveLength\(/.test(apres)) {
      place = "longueur mesurée";
    } else if (/^\s*\(/.test(apres)) {
      place = "appel";
    }
    return { nom, place };
  });
}

describe("occurrences des noms d'ouverture dans les aides suivies du paquet", () => {
  const FERMETURE = "packages/document/test/fermeture.test.ts";

  it.each<[string, string, Place]>([
    [
      "sa clause d'import",
      statique("import", `{ ${NOM_CREER}, ${NOM_OUVRIR} }`, "../src/index.ts"),
      "import",
    ],
    ["son appel", `return suivre(${NOM_OUVRIR}(doc), depart);\n`, "appel"],
    ["la mesure de sa longueur", `expect(${NOM_CREER}).toHaveLength(0);\n`, "longueur mesurée"],
    [
      "le titre d'un test",
      `it("une façade créée par ${NOM_CREER} se ferme", () => {});\n`,
      "titre de test",
    ],
    [
      "le titre d'un test paramétré",
      `it.each(cas)("%s par ${NOM_OUVRIR}", () => {});\n`,
      "titre de test",
    ],
    ["une affectation", `const ouvrir = ${NOM_OUVRIR};\n`, "autre"],
    ["un argument passé en valeur", `ouvrirAutrement(${NOM_OUVRIR}, doc);\n`, "autre"],
    ["un élément de tableau", `const ouvertures = [${NOM_CREER}];\n`, "autre"],
    ["une autre assertion que la longueur", `expect(${NOM_CREER}).toBe(creer);\n`, "autre"],
    ["une chaîne hors d'un titre", `const nom = "${NOM_OUVRIR}";\n`, "autre"],
    ["une chaîne passée à une autre fonction", `noter("${NOM_OUVRIR}", valeur);\n`, "autre"],
    ["un commentaire", `// ${NOM_OUVRIR} ouvre une façade\n`, "autre"],
  ])("F-002-AC31 classement d'un nom d'ouverture : %s", (_cas, texte, attendue) => {
    const places = placesDesNomsDOuverture(texte).map(({ place }) => place);

    expect(places.length).toBeGreaterThan(0);
    expect(new Set(places)).toEqual(new Set([attendue]));
  });

  it("F-002-AC31 fermeture.test.ts : chaque nom d'ouverture n'y figure qu'à son import, à l'appel de son aide, comme longueur mesurée ou dans un titre de test", () => {
    const places = placesDesNomsDOuverture(texteDe(FERMETURE));
    const compte = (nom: string, place: Place): number =>
      places.filter((occurrence) => occurrence.nom === nom && occurrence.place === place).length;

    expect(places.filter(({ place }) => place === "autre")).toEqual([]);
    for (const nom of NOMS_D_OUVERTURE) {
      expect(compte(nom, "import"), nom).toBe(1);
      expect(compte(nom, "appel"), nom).toBe(1);
    }
    expect(places.length).toBeGreaterThan(2 * NOMS_D_OUVERTURE.length);
  });
});

// Les fichiers de src/ des paquets clients du document, hors du paquet du document, qui nomment le
// type des codes ou lisent le champ `code` d'une erreur. Chacun est inscrit avec ce qu'il fait d'un
// code du document, ou écarté parce que le code qu'il porte est celui d'une autre erreur.
const LECTEURS_D_UN_CODE_DU_DOCUMENT: Readonly<Record<string, string>> = {
  "apps/web/src/espace/garde-version.ts": "ne lit que « version-non-prise-en-charge »",
  "apps/web/src/interface/Application.tsx": "passe le code à messages.ts",
  "apps/web/src/interface/messages.ts": "traduit chaque code",
  "apps/web/src/page/session-page.ts": "ne lit que « version-non-prise-en-charge »",
  // F-018 : refus du document de table, à l'ouverture et à la réception.
  "apps/web/src/table/session-table.ts":
    "ne lit que « version-non-prise-en-charge » et « pas-un-document-de-table »",
};
const PORTEURS_D_UN_AUTRE_CODE: Readonly<Record<string, string>> = {
  "apps/web/src/persistance/nom-de-base.ts": "ErreurPersistance porte son propre code",
  // F-010 : codes du serveur (enveloppe, codes natifs) et refus du schéma d'un formulaire.
  "apps/web/src/compte/client-auth.ts": "classe le code d'une réponse du serveur",
  "apps/web/src/compte/validation.ts": "lit le code d'un refus du schéma de contrats",
  "apps/web/src/interface/messages-compte.ts": "passe un code d'enveloppe à sa table",
  // F-014 : codes de l'enveloppe des routes d'espaces, classés par le client puis lus par les écrans.
  "apps/web/src/compte/client-espaces.ts": "classe le code d'une réponse du serveur",
  "apps/web/src/interface/messages-espaces.ts": "passe un code d'enveloppe à sa table",
  "apps/web/src/interface/outils-espaces.ts": "rend le code d'une erreur classée",
  "apps/web/src/interface/contexte-espace.ts": "choisit le texte propre au code, sinon la table",
  "apps/web/src/interface/EcranDInvitation.tsx": "choisit le texte propre au code de l'acceptation",
  // F-013 : codes de l'enveloppe de la déclaration d'un espace, codes de fermeture de la WebSocket.
  "apps/web/src/interface/AdoptionDeLEspace.tsx": "passe un code d'enveloppe à la table des codes",
  "apps/web/src/interface/branchement-synchronisation.ts":
    "recopie le code d'une erreur classée par le client des espaces",
  "apps/web/src/synchronisation/adoption.ts": "lit le code d'enveloppe de la déclaration",
  "apps/web/src/synchronisation/connexion.ts": "lit le code de fermeture de la WebSocket",
  "apps/web/src/synchronisation/synchronisation.ts":
    "lit le code d'enveloppe d'un refus et celui d'une fermeture de connexion",
};
const TRADUCTEUR = "apps/web/src/interface/messages.ts";
// Exhaustif par le type : un code ajouté au paquet sans entrée ici ne compile plus.
const CODES_DU_DOCUMENT = Object.keys({
  "page-introuvable": true,
  "page-a-la-corbeille": true,
  "deplacement-cyclique": true,
  "titre-trop-long": true,
  "position-invalide": true,
  "version-non-prise-en-charge": true,
  "facade-fermee": true,
  "version-invalide": true,
  "rang-indisponible": true,
  // F-007 : code des opérations de corbeille sur une page qui n'y est pas.
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

function litUnCode(texte: string): boolean {
  return /\bCodeErreurDocument\b|\.code\b/.test(texte);
}

function paquetDe(chemin: string): string {
  return /^(?:apps|packages)\/[^/]+/.exec(chemin)?.[0] ?? "";
}

function importeLeDocument(texte: string): boolean {
  return declarationsDe(texte).some(
    ({ source }) => source === PAQUET || source?.startsWith(`${PAQUET}/`) === true,
  );
}

// Une `ErreurDocument` ne peut arriver que dans un paquet dont un fichier de src/ importe le paquet
// du document ; une fois entrée, elle y circule sans que chaque fichier l'importe. Tous les lecteurs
// d'un `.code` d'un tel paquet sont donc énumérés ; ceux d'un paquet qui n'importe pas le document
// (ses propres erreurs à code, par exemple celles de la base) ne le sont pas.
function lecteursDUnCodeChezLesClientsDuDocument(textes: Iterable<[string, string]>): string[] {
  const deSrc = [...textes].filter(
    ([chemin]) =>
      /^(apps|packages)\/[^/]+\/src\//.test(chemin) && !chemin.startsWith("packages/document/"),
  );
  const clients = new Set(
    deSrc.filter(([, texte]) => importeLeDocument(texte)).map(([chemin]) => paquetDe(chemin)),
  );
  return deSrc
    .filter(([chemin, texte]) => clients.has(paquetDe(chemin)) && litUnCode(texte))
    .map(([chemin]) => chemin)
    .sort();
}

function codesCites(texte: string): string[] {
  return CODES_DU_DOCUMENT.filter((code) => texte.includes(`"${code}"`));
}

function codeDuRefus(operation: () => unknown): string | undefined {
  try {
    operation();
    return undefined;
  } catch (erreur) {
    return erreur instanceof ErreurDocument ? erreur.code : "autre erreur";
  }
}

describe("codes d'erreur du document", () => {
  const IMPORT_DU_DOCUMENT = `import { ErreurDocument } from "${PAQUET}";\n`;
  const LIT_UN_CODE = "export const lu = (erreur: { code: string }) => erreur.code;\n";

  it.each<[string, [string, string][], string[]]>([
    [
      "voit le lecteur d'un paquet client, même s'il n'importe pas lui-même le document",
      [
        ["apps/web/src/a.ts", IMPORT_DU_DOCUMENT],
        ["apps/web/src/b.ts", LIT_UN_CODE],
      ],
      ["apps/web/src/b.ts"],
    ],
    [
      "voit le lecteur d'un paquet client venu d'un sous-chemin ou d'un import dynamique",
      [
        ["apps/x/src/a.ts", `export * from "${PAQUET}/interne";\n${LIT_UN_CODE}`],
        ["packages/y/src/b.tsx", `await import("${PAQUET}");\ntype T = CodeErreurDocument;\n`],
      ],
      ["apps/x/src/a.ts", "packages/y/src/b.tsx"],
    ],
    [
      "écarte les erreurs à code d'un paquet qui n'importe pas le document",
      [
        ["apps/web/src/a.ts", IMPORT_DU_DOCUMENT],
        [
          "packages/db/src/erreurs.ts",
          "class ErreurBase { f(code: string) { this.code = code; } }",
        ],
        [
          "apps/server/src/sante.ts",
          `import { ErreurBase } from "@notionlike/db";\n${LIT_UN_CODE}`,
        ],
      ],
      [],
    ],
    [
      "écarte les tests, le paquet du document, et un paquet qui ne cite le document qu'en test ou en commentaire",
      [
        ["apps/web/test/a.test.ts", IMPORT_DU_DOCUMENT + LIT_UN_CODE],
        ["packages/document/src/erreurs.ts", LIT_UN_CODE],
        ["packages/z/test/a.test.ts", IMPORT_DU_DOCUMENT],
        ["packages/z/src/a.ts", `// voir ${PAQUET}\n${LIT_UN_CODE}`],
      ],
      [],
    ],
  ])("F-002-AC31 l'énumération des lecteurs d'un code %s", (_cas, textes, attendus) => {
    expect(lecteursDUnCodeChezLesClientsDuDocument(textes)).toEqual(attendus);
  });

  it("F-002-AC31 énumère les modules de src/ qui lisent un code d'erreur, hors du paquet du document : chacun est inscrit, et le traducteur traite « facade-fermee »", () => {
    const lecteurs = lecteursDUnCodeChezLesClientsDuDocument(fichiers);

    expect(lecteurs).toEqual(
      [
        ...Object.keys(LECTEURS_D_UN_CODE_DU_DOCUMENT),
        ...Object.keys(PORTEURS_D_UN_AUTRE_CODE),
      ].sort(),
    );
    for (const chemin of Object.keys(PORTEURS_D_UN_AUTRE_CODE)) {
      expect(texteDe(chemin), chemin).not.toMatch(/ErreurDocument|@notionlike\/document/);
    }
    for (const chemin of Object.keys(LECTEURS_D_UN_CODE_DU_DOCUMENT)) {
      expect(texteDe(chemin), chemin).toContain(`"${PAQUET}"`);
    }
    expect(codesCites(texteDe("apps/web/src/espace/session-espace.ts"))).toEqual([
      "version-non-prise-en-charge",
    ]);
    expect(texteDe("apps/web/src/interface/Application.tsx")).toMatch(/\bmessageErreur\(/);
    expect(codesCites(texteDe(TRADUCTEUR)).sort()).toEqual([...CODES_DU_DOCUMENT].sort());
    expect(texteDe(TRADUCTEUR)).toMatch(/"facade-fermee":/);
  });

  it("F-002-AC31 F-002-AC15 le message de « facade-fermee » est une phrase française, sans le code", () => {
    const message = messageErreur("facade-fermee");

    expect(message).toMatch(/^[A-ZÀ-Ý][^]*\.$/);
    expect(message).toMatch(/ (a été|n'a pas été|est) /);
    expect(message).toMatch(/fermé/);
    expect(message).not.toContain("facade");
    expect(message).not.toContain("fermee");
  });

  it("F-002-AC15 F-003-AC24 F-029-AC16 F-017-AC25 chaque code d'erreur du document, les dix-neuf (sept de F-002, version-invalide, rang-indisponible, page-hors-corbeille et neuf de la table), a un message français distinct, sans code ni identifiant", () => {
    // F-007 : dix codes, page-hors-corbeille compris ; F-017 : dix-neuf, avec les neuf de la table.
    expect(CODES_DU_DOCUMENT).toHaveLength(19);
    const messages = CODES_DU_DOCUMENT.map((code) => {
      const message = messageErreur(code);
      expect(message.length, code).toBeGreaterThan(20);
      expect(message, code).toMatch(/^[A-ZÀ-Ý][^]*\.$/);
      expect(message, code).not.toContain(code);
      expect(message, code).not.toMatch(/[a-z]+-[a-z]+-[a-z]+|undefined|Error|[0-9a-f]{8}-/);
      return message;
    });
    expect(new Set(messages).size).toBe(messages.length);
  });

  it("F-002-AC14 la limite citée par le message est celle de la façade : 200 accepté, 201 refusé", () => {
    const espace = creerFacade();

    expect(LONGUEUR_MAX_TITRE).toBe(200);
    expect(codeDuRefus(() => espace.creerPage("a".repeat(LONGUEUR_MAX_TITRE)))).toBeUndefined();
    expect(codeDuRefus(() => espace.creerPage("a".repeat(LONGUEUR_MAX_TITRE + 1)))).toBe(
      "titre-trop-long",
    );
    const id = espace.creerPage("court");
    expect(
      codeDuRefus(() => espace.renommerPage(id, "a".repeat(LONGUEUR_MAX_TITRE))),
    ).toBeUndefined();
    expect(codeDuRefus(() => espace.renommerPage(id, "a".repeat(LONGUEUR_MAX_TITRE + 1)))).toBe(
      "titre-trop-long",
    );
    expect(messageErreur("titre-trop-long")).toContain(String(LONGUEUR_MAX_TITRE));
  });
});

// Chaque fichier de src/ qui importe @notionlike/document, et le fichier de test qui le couvre :
// le test doit exister et atteindre le module par ses imports. Un module de plus, ou un test qui ne
// l'atteint plus, fait échouer l'énumération (F-002-AC20).
const MODULES_QUI_LISENT_LE_DOCUMENT: Readonly<Record<string, string>> = {
  "apps/web/src/espace/garde-version.ts": "apps/web/test/reprise-version.test.tsx",
  "apps/web/src/espace/session-espace.ts": "apps/web/test/session-fermeture.test.tsx",
  "apps/web/src/interface/Application.tsx": "apps/web/test/barre-laterale-erreurs.test.tsx",
  "apps/web/src/interface/BarreLaterale.tsx": "apps/web/test/barre-laterale.test.tsx",
  // F-007 : écran de la corbeille.
  "apps/web/src/interface/EcranDeLaCorbeille.tsx": "apps/web/test/corbeille-ecran.test.tsx",
  "apps/web/src/interface/FilDAriane.tsx": "apps/web/test/barre-du-haut.test.tsx",
  "apps/web/src/interface/RangeePage.tsx": "apps/web/test/barre-laterale.test.tsx",
  "apps/web/src/interface/ZonePrincipale.tsx": "apps/web/test/navigation.test.tsx",
  "apps/web/src/interface/messages.ts": "apps/web/test/barre-laterale-erreurs.test.tsx",
  "apps/web/src/interface/pages.ts": "apps/web/test/navigation.test.tsx",
  "apps/web/src/interface/repli.ts": "apps/web/test/depli.test.tsx",
  "apps/web/src/page/session-page.ts": "apps/web/test/page-affichage.test.tsx",
  // F-013 : la réplique de la page affichée lit sa version ; la synchronisation, les pages lues.
  "apps/web/src/synchronisation/miroir.ts": "apps/web/test/corbeille-relecture.test.tsx",
  "apps/web/src/synchronisation/pages-de-l-espace.ts": "apps/web/test/corbeille-relecture.test.tsx",
  // F-018 : la session de table ouvre la façade du document de table.
  "apps/web/src/table/session-table.ts": "apps/web/test/table-session.test.ts",
  // F-018 : l'écran de table, rendu par la zone principale.
  "apps/web/src/vues-de-table/EcranDeTable.tsx": "apps/web/test/table-ecran.test.tsx",
};

function importeLePaquet(texte: string, paquet: string): boolean {
  return declarationsDe(texte).some(
    ({ source }) => source === paquet || source?.startsWith(`${paquet}/`) === true,
  );
}

// Fichiers atteints depuis un fichier en suivant ses imports relatifs, de proche en proche.
function atteintsDepuis(depart: string): Set<string> {
  const atteints = new Set<string>([depart]);
  for (const chemin of atteints) {
    const dossier = chemin.slice(0, chemin.lastIndexOf("/"));
    for (const { source } of declarationsDe(fichiers.get(chemin) ?? "")) {
      if (source?.startsWith(".") === true && !source.includes("?")) {
        const vise = depuisLaRacine(dossier, source);
        if (fichiers.has(vise)) {
          atteints.add(vise);
        }
      }
    }
  }
  return atteints;
}

describe("modules d'apps/web qui lisent le document d'espace", () => {
  it("F-002-AC20 énumère les fichiers de src/ qui importent @notionlike/document : la liste est exacte, et chacun est atteint par le fichier de test qui le couvre", () => {
    const importateurs = sourcesDeLApplication()
      .filter(([, texte]) => importeLePaquet(texte, PAQUET))
      .map(([chemin]) => chemin)
      .sort();

    expect(importateurs).toEqual(Object.keys(MODULES_QUI_LISENT_LE_DOCUMENT).sort());
    for (const [module, test] of Object.entries(MODULES_QUI_LISENT_LE_DOCUMENT)) {
      expect(fichiers.has(test), test).toBe(true);
      expect(atteintsDepuis(test).has(module), `${test} atteint ${module}`).toBe(true);
    }
    expect(atteintsDepuis("apps/web/test/route.test.ts").has(SESSION)).toBe(false);
  });

  it("F-002-AC22 hors du module de persistance, seule la session importe yjs, et aucun fichier de src/ ne lit ni n'écrit un type partagé du Y.Doc", () => {
    const horsPersistance = sourcesDeLApplication().filter(
      ([chemin]) => !chemin.startsWith("apps/web/src/persistance/"),
    );

    expect(
      horsPersistance
        .filter(([, texte]) => importeLePaquet(texte, "yjs"))
        .map(([chemin]) => chemin),
    ).toEqual([
      "apps/web/src/edition/EditeurDePage.tsx",
      "apps/web/src/edition/schema.ts",
      SESSION,
      "apps/web/src/page/pages-ouvertes.ts",
      "apps/web/src/page/session-page.ts",
      // F-013 : le module de synchronisation, dont yjs est une dépendance permise (F-013-AC38).
      "apps/web/src/synchronisation/canal.ts",
      "apps/web/src/synchronisation/document-suivi.ts",
      "apps/web/src/synchronisation/miroir.ts",
      "apps/web/src/synchronisation/ouverture.ts",
      "apps/web/src/synchronisation/page-affichee.ts",
      "apps/web/src/synchronisation/passe-de-fond.ts",
      "apps/web/src/synchronisation/stockage.ts",
      "apps/web/src/synchronisation/synchronisation.ts",
      // F-018 : la session de table et les tables ouvertes, dont yjs est une dépendance permise
      // (web-table-liste-blanche) ; aucun type partagé n'y est lu ni écrit.
      "apps/web/src/table/session-table.ts",
      "apps/web/src/table/tables-ouvertes.ts",
    ]);
    expect(importeLePaquet(statique("import", "type * as Y", "yjs"), "yjs")).toBe(true);
    for (const [chemin, texte] of sourcesDeLApplication()) {
      expect(texte, chemin).not.toMatch(
        /\.(getMap|getArray|getText|getXmlFragment|getXmlElement|transact)\(/,
      );
      // F-006 : `deplacerPage` a un seul appelant d'écran, l'action de la barre, par l'opération que
      // la session expose ; leur couture est éprouvée par F-006-AC30.
      expect(texte.includes("deplacerPage"), chemin).toBe(
        ["apps/web/src/interface/Application.tsx", SESSION].includes(chemin),
      );
      expect(importeLePaquet(texte, "y-indexeddb"), chemin).toBe(
        chemin === "apps/web/src/persistance/indexeddb.ts",
      );
    }
  });

  it("F-002-AC21 le document de la session est un Y.Doc de l'instance de yjs d'apps/web", () => {
    expect(demarrerSession().doc).toBeInstanceOf(Y.Doc);
  });
});

// Un fichier nomme le format du document s'il écrit en chaîne le nom d'un type partagé ou de la clé
// de version. Les noms cherchés viennent de l'aide : ce fichier ne les écrit donc pas lui-même.
const AIDES_DE_FORMAT = "apps/web/test/aides-format.ts";
const FORMAT_DU_DOCUMENT = "packages/document/src/format.ts";
const UN_NOM_DU_FORMAT = `(?:${Object.values(NOMS_DU_FORMAT).join("|")})`;

function chainesDuFormat(texte: string): number {
  return occurrences(texte, `(["'\`])${UN_NOM_DU_FORMAT}\\1`);
}

function ecritUneVersion(doc: Y.Doc, version: number): boolean {
  ecrireLaVersion(doc, version);
  try {
    ouvrirFacade(doc).lire();
    return true;
  } catch {
    return false;
  }
}

describe("noms internes du format du document dans les tests", () => {
  it("F-002-AC22 aides-format.ts est le seul fichier d'apps/web/test et d'apps/web/e2e qui nomme un type partagé ou la clé de version du format", () => {
    const quiNommentLeFormat = fichiersQui(
      (chemin, texte) =>
        /^apps\/web\/(?:test|e2e)\//.test(chemin) &&
        (chainesDuFormat(texte) > 0 || /\.getMap\(\s*NOMS_DU_FORMAT\b/.test(texte)),
    );

    expect(quiNommentLeFormat).toEqual([AIDES_DE_FORMAT]);
    expect(fichiers.has("apps/web/e2e/aides.ts")).toBe(true);
    // Chaque nom n'est écrit qu'une fois dans l'aide, et la recherche voit les trois guillemets.
    expect(chainesDuFormat(texteDe(AIDES_DE_FORMAT))).toBe(Object.keys(NOMS_DU_FORMAT).length);
    for (const nom of Object.values(NOMS_DU_FORMAT)) {
      expect(chainesDuFormat(`doc.getMap('${nom}')`), nom).toBe(1);
      expect(chainesDuFormat(`doc.getMap(\`${nom}\`)`), nom).toBe(1);
      expect(chainesDuFormat(`doc.getMap("${nom}s")`), nom).toBe(0);
    }
  });

  it("F-002-AC22 F-002-AC17 les noms et les versions que l'aide forge sont ceux du paquet : chaque nom est écrit dans son fichier de format, la version prise en charge est lue, la suivante refusée", () => {
    const format = texteDe(FORMAT_DU_DOCUMENT);

    for (const nom of Object.values(NOMS_DU_FORMAT)) {
      expect(occurrences(format, `= "${nom}";`), nom).toBe(1);
    }
    expect(ecritUneVersion(new Y.Doc(), VERSION_PRISE_EN_CHARGE)).toBe(true);
    expect(ecritUneVersion(new Y.Doc(), VERSION_NON_PRISE_EN_CHARGE)).toBe(false);
  });
});
