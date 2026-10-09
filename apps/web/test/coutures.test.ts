// Couture des appelants de la façade de @notionlike/document (F-002-AC31). Les fichiers du
// workspace sont lus comme du texte : aucun module d'un autre paquet n'est évalué ici, seuls des
// noms de fichiers et des déclarations d'import en sont tirés (conception, « Règles de dépendances »).
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { ouvrirPersistance } from "../src/persistance/index.ts";
import {
  creerFacade,
  ecouteurs,
  facadesEncoreOuvertes,
  fermerLesFacades,
  ouvrirFacade,
} from "./aides-facade.ts";
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
// le workspace, doit être inscrit dans l'une d'elles, avec ce qu'elle exige. La sorte
// « production » arrive avec la session d'espace.
const AIDES_SUIVIES = ["apps/web/test/aides-facade.ts", "packages/document/test/fermeture.test.ts"];
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
      ...AIDES_SUIVIES,
      ...IMPORT_ENTIER_SANS_OUVERTURE,
      ...FACADES_DE_TEST_DE_F001_NON_MODIFIABLES,
    ];

    expect(ouvrants()).toEqual([...attendus].sort());
    expect(new Set(attendus).size).toBe(attendus.length);
    expect([...fichiers.keys()]).toEqual(
      expect.arrayContaining([
        "apps/web/src/identifiants/uuid-canonique.ts",
        "apps/web/src/persistance/indexeddb.ts",
        "apps/web/test/aides-coutures.ts",
        "apps/web/test/coutures.test.ts",
        "apps/web/test/preparation.ts",
        "packages/document/src/arbre.ts",
        "packages/document/test/rang.test.ts",
      ]),
    );
  });

  it("F-002-AC31 hors de ses deux fichiers de définition, aucun fichier de src/ n'ouvre de façade, et dans apps/web/test seul aides-facade.ts fait entrer une fonction d'ouverture", () => {
    const horsDefinition = ouvrants().filter((chemin) => !DEFINITION.includes(chemin));

    expect(
      horsDefinition.filter((chemin) => /^(apps|packages)\/[^/]+\/src\//.test(chemin)),
    ).toEqual([]);
    expect(
      horsDefinition.filter(
        (chemin) =>
          chemin.startsWith("apps/web/") && declarationsDe(texteDe(chemin)).some(nommeUneOuverture),
      ),
    ).toEqual(["apps/web/test/aides-facade.ts"]);
  });
});

describe("ce que chaque sorte d'ouvrant exige", () => {
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

    expect(persistance.etat()).toBe("fermee");
    expect(facadesEncoreOuvertes()).toBe(1);
    facade.fermer();
    expect(facadesEncoreOuvertes()).toBe(0);
    expect(ecouteurs(facade.doc)).toBe(0);
  });
});
