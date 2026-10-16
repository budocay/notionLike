// Contrôles statiques et coutures de F-028 : aucune ouverture d'adresse hors d'un élément `a`
// (F-028-AC10), la règle des adresses sur chaque chemin qui écrit ou rend un lien (F-028-AC18),
// les appelants du format et de la version du document de page couverts par chaque ligne de la
// table et par la version suivante (F-028-AC24, AC28), et les garanties de F-003 tenues après
// l'ajout des dépendances (F-028-AC29). Chaque contrôle est livré avec son cas fautif.
import { lireVersionPage, VERSION_PAGE_PRISE_EN_CHARGE } from "@notionlike/document";
import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { RACCOURCIS } from "../src/interface/raccourcis.ts";
import { creerPagesOuvertes } from "../src/page/pages-ouvertes.ts";
import type { SessionPage } from "../src/page/session-page.ts";
import { versionAdmise } from "../src/synchronisation/index.ts";
import { lireLesFichiersDuWorkspace } from "./aides-coutures.ts";
import { lire, lireDossier } from "./aides-disque.ts";
import { contenuLu, fragmentBrut, ouvrirFacadeDePage } from "./aides-facade-page.ts";
import { type Aretes, graphe } from "./aides-graphe.ts";
import {
  documentDeLaLigne,
  documentDeVersionInconnue,
  enregistrerParLaPersistance,
  relireParLaPersistance,
  textesDeLaLigne,
  VERSION_INCONNUE,
  VERSIONS_DE_LA_TABLE,
} from "./aides-lignes.ts";
import { ESPACE_A } from "./aides-persistance.ts";
import { attendrePhase, demarrerUneSession, rendreLaSession } from "./aides-session-page.tsx";
import { recevoirSurLaPageAffichee } from "./synchronisation/aides-page-affichee.ts";
import {
  chercherLaZoneDeSaisie,
  couperLeReseau,
  entrerDansLEditeur,
  monterLEditeur,
  presserAvecMod,
  selectionnerLeTexte,
  taper,
  zoneDeSaisie,
} from "./edition/aides-edition.tsx";

// ——— F-028-AC10 : l'adresse ne s'ouvre que par l'activation d'un élément `a` ———

const OUVERTURES_INTERDITES: readonly (readonly [string, RegExp])[] = [
  ["window.open", /\bwindow\s*\.\s*open\s*\(/],
  ["location.assign", /\blocation\s*\.\s*assign\s*\(/],
  ["location.replace", /\blocation\s*\.\s*replace\s*\(/],
  ["affectation à location.href", /\blocation\s*\.\s*href\s*=(?!=)/],
];

/** Première ouverture interdite de ces fichiers, nommée avec son fichier ; `undefined` sinon. */
function premiereOuverture(fichiers: ReadonlyMap<string, string>): string | undefined {
  for (const [chemin, texte] of fichiers) {
    for (const [nom, motif] of OUVERTURES_INTERDITES) {
      if (motif.test(texte)) {
        return `${chemin} : ${nom}`;
      }
    }
  }
  return undefined;
}

const PANNEAU_DE_LIEN = "src/interface/composants/Edition.tsx";

function fichiersDeLEditionEtDuPanneau(): Map<string, string> {
  const sources = lireDossier("src");
  return new Map(
    [...sources].filter(
      ([chemin]) => chemin.startsWith("src/edition/") || chemin === PANNEAU_DE_LIEN,
    ),
  );
}

describe("ouverture d'une adresse", () => {
  it("F-028-AC10 aucun fichier du module d'édition ni du panneau de lien n'ouvre une adresse par window.open, location.assign, location.replace ou une affectation à location.href", () => {
    const fichiers = fichiersDeLEditionEtDuPanneau();

    expect([...fichiers.keys()]).toContain(PANNEAU_DE_LIEN);
    expect(
      [...fichiers.keys()].filter((chemin) => chemin.startsWith("src/edition/")).length,
    ).toBeGreaterThan(10);
    expect(premiereOuverture(fichiers)).toBeUndefined();
  });

  it.each([
    ["window.open", "window.open(adresse, '_blank');"],
    ["location.assign", "window.location.assign(adresse);"],
    ["location.replace", "location.replace(adresse);"],
    ["affectation à location.href", "document.location.href = adresse;"],
  ])("F-028-AC10 cas fautif : %s est nommé avec son fichier", (nom, texte) => {
    const fichiers = new Map([
      ["src/edition/a.ts", "if (location.href === avant) {}"],
      ["src/edition/b.ts", texte],
      ["src/edition/c.ts", "window.open(autre);"],
    ]);

    expect(premiereOuverture(fichiers)).toBe(`src/edition/b.ts : ${nom}`);
  });
});

// ——— F-028-AC18, AC32 : la règle des adresses sur chaque chemin ———

/** Ce qui, dans un fichier, écrit, lit ou rend un lien. */
const ECRIT_OU_REND_UN_LIEN =
  /\b(?:setLink|toggleLink|unsetLink|renderHTML|parseHTML|handlePaste|handleClick|NOM_DE_LA_MARQUE_DE_LIEN)\b|\bhref\b/;
const APPEL_DE_LA_REGLE =
  /\b(?:adresseAcceptee|adresseDUneSaisie|estUneAdresseNormalisee|adresseSeuleCollee)\(/;
const IMPORT_DE_LA_REGLE = /from\s+["']\.\/(?:adresses|marques)\.ts["']/;

/** Les chemins d'un lien et le fichier qui les porte, qui appelle la règle (F-028-AC18). */
const CHEMINS_D_UN_LIEN: Readonly<Record<string, string>> = {
  "src/edition/commandes-de-marque.ts": "saisie dans le panneau, adresse à ouvrir du panneau",
  "src/edition/lien.ts": "rendu, lecture d'un collage ou d'un dépôt, validation de l'extension",
  "src/edition/marques.ts":
    "collage d'une adresse sur une sélection, Mod+clic, garde des commandes",
};
/** Fichiers qui montrent un lien sans en décider : l'adresse leur vient d'un chemin ci-dessus. */
const SANS_DECISION: Readonly<Record<string, string>> = {
  [PANNEAU_DE_LIEN]: "src/edition/commandes-de-marque.ts",
  "src/edition/EditeurDePage.tsx": "src/edition/commandes-de-marque.ts",
};

function fautesDeLaRegle(fichiers: ReadonlyMap<string, string>): string[] {
  const fautes: string[] = [];
  for (const [chemin, texte] of fichiers) {
    const ecrit = ECRIT_OU_REND_UN_LIEN.test(texte) && chemin !== "src/edition/adresses.ts";
    if (ecrit && !(chemin in CHEMINS_D_UN_LIEN) && !(chemin in SANS_DECISION)) {
      fautes.push(`${chemin} : écrit ou rend un lien hors des chemins inscrits`);
    }
    if (
      chemin in CHEMINS_D_UN_LIEN &&
      !(IMPORT_DE_LA_REGLE.test(texte) && APPEL_DE_LA_REGLE.test(texte))
    ) {
      fautes.push(`${chemin} : n'appelle pas la règle des adresses`);
    }
  }
  return fautes;
}

describe("la règle des adresses sur chaque chemin", () => {
  it("F-028-AC18 F-028-AC32 chaque fichier du module d'édition et du panneau qui écrit ou rend un lien est un chemin inscrit qui appelle la règle, ou reçoit l'adresse d'un tel chemin ; l'extension reçoit la règle comme validation", () => {
    const fichiers = fichiersDeLEditionEtDuPanneau();

    expect(fautesDeLaRegle(fichiers)).toEqual([]);
    expect(Object.keys(CHEMINS_D_UN_LIEN).every((chemin) => fichiers.has(chemin))).toBe(true);
    expect(lire("src/edition/lien.ts")).toMatch(
      /isAllowedUri: \(adresse\) => estUneAdresseNormalisee\(adresse\)/,
    );
    expect(lire("src/edition/lien.ts")).toMatch(/autolink: false,[^]*linkOnPaste: false/);
  });

  it("F-028-AC18 cas fautifs : un fichier qui pose un lien hors des chemins inscrits, et un chemin inscrit qui n'appelle plus la règle, sont nommés", () => {
    const fichiers = new Map([
      ["src/edition/nouveau.ts", "editeur.commands.setLink({ href: saisie });"],
      ["src/edition/lien.ts", "renderHTML({ mark }) { return ['a', mark.attrs, 0]; }"],
      ["src/edition/adresses.ts", "export const href = 1;"],
    ]);

    expect(fautesDeLaRegle(fichiers)).toEqual([
      "src/edition/nouveau.ts : écrit ou rend un lien hors des chemins inscrits",
      "src/edition/lien.ts : n'appelle pas la règle des adresses",
    ]);
  });
});

// ——— F-028-AC24, AC28 : appelants du format et de la version ———

const NOMS_DU_FORMAT = [
  "ouvrirDocumentPage",
  "lireVersionPage",
  "VERSION_PAGE_PRISE_EN_CHARGE",
  "TABLE_DES_VERSIONS_PAGE",
  "DocumentPage",
];
const IMPORT_DU_PAQUET = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']@notionlike\/document["']/g;

/** Fichiers de code du workspace qui font entrer de `@notionlike/document` la version ou le format. */
function appelantsDuFormat(fichiers: ReadonlyMap<string, string>): string[] {
  return [...fichiers]
    .filter(([chemin]) => /^(apps|packages)\/[^/]+\/src\//.test(chemin))
    .filter(([, texte]) =>
      [...texte.matchAll(IMPORT_DU_PAQUET)].some(([, noms = ""]) =>
        noms.split(",").some((nom) => NOMS_DU_FORMAT.includes(nom.replace(/\btype\b/, "").trim())),
      ),
    )
    .map(([chemin]) => chemin)
    .sort();
}

type Issue = "lu" | "refuse";

/**
 * Ce que chaque appelant fait d'un document de chaque ligne et de la version suivante, joué par
 * son propre code. Un appelant absent de cette liste fait échouer l'énumération.
 */
const SCENARIOS: Readonly<Record<string, (doc: Y.Doc, version: number) => Promise<Issue>>> = {
  // Lecture de la version, vérification et élévation : la session de page.
  "apps/web/src/page/session-page.ts": async (doc) => {
    const { session } = demarrerUneSession(undefined, doc);
    await Promise.race([
      attendrePhase(session, "pret"),
      attendrePhase(session, "version-non-prise-en-charge"),
    ]);
    const etat = session.lireEtat();
    if (etat.phase !== "pret") {
      return "refuse";
    }
    const avant = lireVersionPage(doc);
    expect(etat.preparerLaVersion({ noeuds: ["paragraph"], marques: ["bold"] })).toBe(true);
    expect(lireVersionPage(doc)).toBe(Math.max(avant, 2));
    return "lu";
  },
  // Vérification de version : la réplique de la synchronisation.
  "apps/web/src/synchronisation/miroir.ts": (doc) =>
    Promise.resolve(versionAdmise(doc) ? "lu" : "refuse"),
};

/** Les appelants du format que la spec nomme, au-delà des importateurs du paquet. */
const APPELANTS_NOMMES: Readonly<Record<string, (doc: Y.Doc, version: number) => Promise<Issue>>> =
  {
    // Le module d'édition, monté comme l'application le monte.
    "apps/web/src/edition/EditeurDePage.tsx": async (doc, version) => {
      const { session } = demarrerUneSession(undefined, doc);
      rendreLaSession(session);
      await act(() =>
        Promise.race([
          attendrePhase(session, "pret"),
          attendrePhase(session, "version-non-prise-en-charge"),
        ]),
      );
      const zone = chercherLaZoneDeSaisie();
      for (const texte of zone === null ? [] : textesDeLaLigne(version)) {
        expect(zone?.textContent).toContain(texte);
      }
      return zone === null ? "refuse" : "lu";
    },
    // Le module de persistance : enregistré puis relu dans un document vierge, à l'identique.
    "apps/web/src/persistance/index.ts": async (doc) => {
      const relu = await relireParLaPersistance(doc);
      expect(fragmentBrut(relu).toString()).toBe(fragmentBrut(doc).toString());
      expect(lireVersionPage(relu)).toBe(lireVersionPage(doc));
      return lireVersionPage(relu) <= VERSION_PAGE_PRISE_EN_CHARGE ? "lu" : "refuse";
    },
    // La façade de `@notionlike/document`.
    "packages/document/src/document-page.ts": (doc) => {
      try {
        ouvrirFacadeDePage(doc);
        return Promise.resolve("lu");
      } catch {
        return Promise.resolve("refuse");
      }
    },
  };

/**
 * Les fonctions qui lisent, vérifient ou élèvent la version pour leurs appelants, par fichier
 * appelant du paquet qui les exporte. Tout autre export de ces fichiers est déclaré sans version.
 */
const ENVELOPPES_DE_LA_VERSION: Readonly<Record<string, readonly string[]>> = {
  "apps/web/src/page/session-page.ts": [
    "demarrerSessionPage",
    "eleverPour",
    "estUnePageDeVersionAdmise",
    "versionExigee",
  ],
  "apps/web/src/synchronisation/miroir.ts": ["creerMiroir", "versionAdmise"],
};
const EXPORTS_SANS_VERSION: Readonly<Record<string, readonly string[]>> = {
  "apps/web/src/page/session-page.ts": [
    "DocumentDePage",
    "ElementsDuFormat",
    "EtatSessionPage",
    "SessionPage",
    "sessionDePageIntrouvable",
  ],
  "apps/web/src/synchronisation/miroir.ts": ["Miroir", "ORIGINE_DU_MIROIR"],
};
/** Ce que l'état prêt de la session donne à l'éditeur : la garde de version et l'élévation. */
const PROPRIETE_DE_LA_VERSION = /\b(?:preparerLaVersion|garderVersion)\b/;
const IMPORT_NOMME = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["'][^"']+["']/g;
/** Le module d'édition et le paquet lui-même, qui ont leurs scénarios nommés. */
const COUVERTS_PAR_LEUR_SCENARIO = ["apps/web/src/edition/", "packages/document/src/"];

/** Noms exportés par un fichier : déclarations et listes d'exports. */
function exportsDe(texte: string): string[] {
  const declares = [
    ...texte.matchAll(
      /^export\s+(?:async\s+)?(?:function|const|let|class|interface|type|enum)\s+(\w+)/gm,
    ),
  ].map(([, nom = ""]) => nom);
  const listes = [...texte.matchAll(/^export\s*(?:type\s*)?\{([^}]*)\}/gm)].flatMap(
    ([, liste = ""]) =>
      liste.split(",").map((nom) =>
        nom
          .replace(/\btype\b/, "")
          .split(/\s+as\s+/)
          .at(-1)
          ?.trim(),
      ),
  );
  return [...declares, ...listes].filter((nom): nom is string => nom !== undefined && nom !== "");
}

/** Exports des fichiers appelants du paquet qui ne sont ni des enveloppes ni déclarés sans version. */
function exportsNonClasses(fichiers: ReadonlyMap<string, string>, appelants: string[]): string[] {
  return appelants.flatMap((chemin) => {
    const classes = [
      ...(ENVELOPPES_DE_LA_VERSION[chemin] ?? []),
      ...(EXPORTS_SANS_VERSION[chemin] ?? []),
    ];
    return exportsDe(fichiers.get(chemin) ?? "")
      .filter((nom) => !classes.includes(nom))
      .map((nom) => `${chemin} : ${nom}`);
  });
}

/**
 * Fichiers de code du workspace qui appellent une enveloppe de la version (import nommé) ou se
 * servent de la garde ou de l'élévation de l'état prêt ; hors des fichiers qui les définissent, du
 * module d'édition et du paquet.
 */
function appelantsDesEnveloppes(fichiers: ReadonlyMap<string, string>): string[] {
  const enveloppes = Object.values(ENVELOPPES_DE_LA_VERSION).flat();
  const importeUneEnveloppe = (texte: string): boolean =>
    [...texte.matchAll(IMPORT_NOMME)].some(([, noms = ""]) =>
      noms.split(",").some((nom) => enveloppes.includes(nom.replace(/\btype\b/, "").trim())),
    );
  return [...fichiers]
    .filter(([chemin]) => /^(apps|packages)\/[^/]+\/src\//.test(chemin))
    .filter(([chemin]) => !(chemin in ENVELOPPES_DE_LA_VERSION))
    .filter(([chemin]) => !COUVERTS_PAR_LEUR_SCENARIO.some((dossier) => chemin.startsWith(dossier)))
    .filter(([, texte]) => importeUneEnveloppe(texte) || PROPRIETE_DE_LA_VERSION.test(texte))
    .map(([chemin]) => chemin)
    .sort();
}

function finDuChargement(session: SessionPage): Promise<void> {
  return Promise.race([
    attendrePhase(session, "pret"),
    attendrePhase(session, "version-non-prise-en-charge"),
  ]);
}

/**
 * Ce que chaque appelant d'une enveloppe fait d'un document de chaque ligne et de la version
 * suivante, joué par son propre code. Un appelant absent de cette liste fait échouer l'énumération.
 */
const SCENARIOS_DES_ENVELOPPES: Readonly<
  Record<string, (doc: Y.Doc, version: number) => Promise<Issue>>
> = {
  // La zone principale passe la garde et l'élévation à l'éditeur : Mod+B y élève la version.
  "apps/web/src/interface/ZonePrincipale.tsx": async (doc, version) => {
    const { session } = demarrerUneSession(undefined, doc);
    rendreLaSession(session);
    await act(() => finDuChargement(session));
    if (chercherLaZoneDeSaisie() === null) {
      return "refuse";
    }
    entrerDansLEditeur();
    selectionnerLeTexte(textesDeLaLigne(version)[0] ?? "");
    presserAvecMod("b");
    expect(lireVersionPage(doc)).toBe(Math.max(version, 2));
    return "lu";
  },
  // Les pages ouvertes de l'onglet démarrent la session sur ce que la base de la page porte.
  "apps/web/src/page/pages-ouvertes.ts": async (doc) => {
    const idPage = crypto.randomUUID();
    await enregistrerParLaPersistance(doc, idPage);
    const pages = creerPagesOuvertes();
    try {
      const session = pages.ouvrir({ idEspace: ESPACE_A, idPage });
      await finDuChargement(session);
      const etat = session.lireEtat();
      if (etat.phase !== "pret") {
        return "refuse";
      }
      expect(etat.contenu.toString()).toBe(fragmentBrut(doc).toString());
      return "lu";
    } finally {
      pages.fermer();
    }
  },
  // La page affichée de la synchronisation reçoit le document d'un autre onglet par son miroir.
  "apps/web/src/synchronisation/page-affichee.ts": (doc) =>
    Promise.resolve(recevoirSurLaPageAffichee(doc)),
};

const fichiersDuWorkspace = lireLesFichiersDuWorkspace();

const CAS_DE_VERSION: readonly (readonly [string, number, Issue])[] = [
  ...VERSIONS_DE_LA_TABLE.map((version) => [`la ligne ${String(version)}`, version, "lu"] as const),
  ["la version prise en charge plus un", VERSION_INCONNUE, "refuse"],
];

function documentDe(version: number): Y.Doc {
  return version === VERSION_INCONNUE ? documentDeVersionInconnue() : documentDeLaLigne(version);
}

describe("appelants du format et de la version du document de page", () => {
  it("F-028-AC28 F-028-AC24 les fichiers de code du workspace qui lisent la version, la vérifient ou l'élèvent sont énumérés par leurs imports : chacun a son scénario, et aucun module du serveur n'en est", () => {
    const appelants = appelantsDuFormat(fichiersDuWorkspace);

    expect(appelants).toEqual([
      "apps/web/src/page/session-page.ts",
      "apps/web/src/synchronisation/miroir.ts",
    ]);
    expect(appelants.every((chemin) => chemin in SCENARIOS)).toBe(true);
    expect(appelants.filter((chemin) => chemin.startsWith("apps/server/"))).toEqual([]);
    expect(Object.keys(APPELANTS_NOMMES).every((chemin) => fichiersDuWorkspace.has(chemin))).toBe(
      true,
    );
  });

  it("F-028-AC28 cas fautif : un module qui fait entrer la version prise en charge sans scénario est énuméré", () => {
    const fichiers = new Map([
      [
        "apps/web/src/nouveau.ts",
        'import { type DocumentPage, VERSION_PAGE_PRISE_EN_CHARGE } from "@notionlike/document";',
      ],
      ["apps/web/src/autre.ts", 'import { type DocumentEspace } from "@notionlike/document";'],
      ["apps/web/test/essai.ts", 'import { lireVersionPage } from "@notionlike/document";'],
    ]);

    expect(appelantsDuFormat(fichiers)).toEqual(["apps/web/src/nouveau.ts"]);
    expect("apps/web/src/nouveau.ts" in SCENARIOS).toBe(false);
  });

  it("F-028-AC28 les fonctions qui enveloppent la lecture, la vérification ou l'élévation de la version sont suivies : chaque export des appelants du paquet est classé, et chaque fichier qui appelle une enveloppe ou se sert de la garde ou de l'élévation de l'état prêt a son scénario", () => {
    const appelants = appelantsDuFormat(fichiersDuWorkspace);
    const desEnveloppes = appelantsDesEnveloppes(fichiersDuWorkspace);

    expect(Object.keys(ENVELOPPES_DE_LA_VERSION).sort()).toEqual(appelants);
    expect(exportsNonClasses(fichiersDuWorkspace, appelants)).toEqual([]);
    expect(desEnveloppes).toEqual([
      "apps/web/src/interface/ZonePrincipale.tsx",
      "apps/web/src/page/pages-ouvertes.ts",
      "apps/web/src/synchronisation/page-affichee.ts",
    ]);
    expect(Object.keys(SCENARIOS_DES_ENVELOPPES).sort()).toEqual(desEnveloppes);
    expect(desEnveloppes.filter((chemin) => chemin.startsWith("apps/server/"))).toEqual([]);
  });

  it("F-028-AC28 cas fautifs : un module qui appelle une enveloppe ou se sert de la garde de l'état prêt est énuméré ; un nouvel export d'un appelant du paquet, non classé, est nommé", () => {
    const fichiers = new Map([
      ["apps/web/src/nouveau.ts", 'import { eleverPour } from "../page/session-page.ts";'],
      ["apps/web/src/autre.ts", "const garde = etat.garderVersion;"],
      ["apps/web/src/edition/interne.ts", "options.preparerLaVersion(elements);"],
      [
        "apps/web/test/essai.ts",
        'import { versionAdmise } from "../src/synchronisation/index.ts";',
      ],
      [
        "apps/web/src/page/session-page.ts",
        "export function eleverPour() {}\nexport function lireLaVersionDeLaPage() {}",
      ],
    ]);

    expect(appelantsDesEnveloppes(fichiers)).toEqual([
      "apps/web/src/autre.ts",
      "apps/web/src/nouveau.ts",
    ]);
    expect(exportsNonClasses(fichiers, ["apps/web/src/page/session-page.ts"])).toEqual([
      "apps/web/src/page/session-page.ts : lireLaVersionDeLaPage",
    ]);
  });

  it.each(
    Object.entries({ ...SCENARIOS, ...APPELANTS_NOMMES, ...SCENARIOS_DES_ENVELOPPES }).flatMap(
      ([chemin, scenario]) =>
        CAS_DE_VERSION.map(
          ([cas, version, attendue]) => [chemin, cas, version, attendue, scenario] as const,
        ),
    ),
  )(
    "F-028-AC28 F-028-AC24 %s, sur un document de %s : %s",
    async (_chemin, _cas, version, attendue, scenario) => {
      expect(await scenario(documentDe(version), version)).toBe(attendue);
    },
  );

  it("F-028-AC24 un document rempli des trois marques, enregistré par le module de persistance puis relu dans un document vierge, donne le même contenu lu", async () => {
    const doc = documentDeLaLigne(2);

    const relu = await relireParLaPersistance(doc);

    expect(contenuLu(relu)).toBe(contenuLu(doc));
    expect(contenuLu(relu)).toMatch(/<bold>.*<italic>.*<link href="https:\/\/exemple.fr\/">/s);
  });
});

// ——— Couture de l'interface du module d'édition : chaque montage de l'éditeur ———

const COMPOSANT_D_EDITION = "EditeurDePage";
// Un montage par JSX, attributs jusqu'à la fermeture, ou par une fonction de création d'élément.
const MONTAGE = new RegExp(
  String.raw`<${COMPOSANT_D_EDITION}\b([^]*?)\/>|\b(?:createElement|jsxs?)\(\s*${COMPOSANT_D_EDITION}\b`,
  "g",
);
const MONTEURS_ATTENDUS = [
  "apps/web/src/interface/ZonePrincipale.tsx",
  "apps/web/test/edition/aides-edition.tsx",
];
const PROPRIETES_DE_F028 = ["preparerLaVersion", "ouvreLePanneauDeLien", "ouvreLAdresse"];

/** Les propriétés obligatoires de l'interface du composant, lues dans sa source. */
function proprietesObligatoires(source: string): string[] {
  const corps = /export interface ProprietesEditeurDePage \{([^]*?)\n\}/.exec(source)?.[1] ?? "";
  return [...corps.matchAll(/^\s+readonly (\w+):/gm)].map(([, nom = ""]) => nom);
}

/** Pour chaque fichier d'`apps/web` qui monte l'éditeur, les propriétés obligatoires non passées. */
function montagesDeLEditeur(
  fichiers: ReadonlyMap<string, string>,
  obligatoires: readonly string[],
): Map<string, string[]> {
  const montages = new Map<string, string[]>();
  for (const [chemin, texte] of fichiers) {
    if (!chemin.startsWith("apps/web/")) {
      continue;
    }
    for (const [, attributs] of texte.matchAll(MONTAGE)) {
      const passees = [...(attributs ?? "").matchAll(/(?:^|\s)(\w+)=/g)].map(([, nom]) => nom);
      const manquantes = obligatoires.filter((nom) => !passees.includes(nom));
      montages.set(chemin, [...(montages.get(chemin) ?? []), ...manquantes]);
    }
  }
  return montages;
}

describe("montages de l'éditeur de page", () => {
  it("F-028-AC21 F-028-AC6 F-028-AC10 les seuls fichiers qui montent l'éditeur sont la zone principale et l'aide des tests, et chacun passe toutes ses propriétés obligatoires, dont preparerLaVersion, ouvreLePanneauDeLien et ouvreLAdresse", () => {
    const obligatoires = proprietesObligatoires(lire("src/edition/EditeurDePage.tsx"));

    const montages = montagesDeLEditeur(fichiersDuWorkspace, obligatoires);

    expect(obligatoires).toEqual(expect.arrayContaining(PROPRIETES_DE_F028));
    expect([...montages.keys()].sort()).toEqual(MONTEURS_ATTENDUS);
    expect(Object.fromEntries(montages)).toEqual(
      Object.fromEntries(MONTEURS_ATTENDUS.map((chemin) => [chemin, []])),
    );
  });

  it("F-028-AC21 cas fautifs : un autre fichier qui monte l'éditeur, un montage qui oublie une propriété et un montage par une fonction de création sont nommés", () => {
    const fichiers = new Map([
      [
        "apps/web/src/interface/ZonePrincipale.tsx",
        `<${COMPOSANT_D_EDITION} contenu={c} preparerLaVersion={(e) => p(e)} ouvreLAdresse={o} />`,
      ],
      ["apps/web/src/autre.tsx", `createElement(${COMPOSANT_D_EDITION}, proprietes)`],
      ["packages/document/src/x.ts", `<${COMPOSANT_D_EDITION} />`],
    ]);

    const montages = montagesDeLEditeur(fichiers, ["contenu", ...PROPRIETES_DE_F028]);

    expect(Object.fromEntries(montages)).toEqual({
      "apps/web/src/interface/ZonePrincipale.tsx": ["ouvreLePanneauDeLien"],
      "apps/web/src/autre.tsx": ["contenu", ...PROPRIETES_DE_F028],
    });
  });
});

// ——— F-028-AC29 : garanties de F-003 après l'ajout des dépendances ———

function versionsResolues(verrou: string, paquet: string): string[] {
  const motif = new RegExp(
    String.raw`^  '?${paquet.replace("/", "\\/")}@(\d+\.\d+\.\d+)'?:$`,
    "gm",
  );
  return [...new Set([...verrou.matchAll(motif)].map(([, version = ""]) => version))];
}

function auMoins(version: string, minimum: string): boolean {
  const [a, b] = [version, minimum].map((texte) => texte.split(".").map(Number));
  for (let rang = 0; rang < 3; rang += 1) {
    const ecart = (a?.[rang] ?? 0) - (b?.[rang] ?? 0);
    if (ecart !== 0) {
      return ecart > 0;
    }
  }
  return true;
}

const EXTENSIONS_DE_MARQUE = /(^|\/)node_modules\/@tiptap\/extension-(bold|italic|link)\//;

function importateursDesMarques(aretes: Aretes): string[] {
  return [...aretes]
    .filter(([, dependances]) => dependances.some((une) => EXTENSIONS_DE_MARQUE.test(une)))
    .map(([module]) => module)
    .sort();
}

describe("garanties de F-003 après l'ajout des marques", () => {
  it("F-028-AC29 poser, afficher et survoler un lien, mettre en gras et en italique, réseau coupé : aucune requête", async () => {
    const appels = couperLeReseau();
    monterLEditeur();
    entrerDansLEditeur();
    taper("voir le site");
    selectionnerLeTexte("site");
    presserAvecMod("b");
    presserAvecMod("i");
    presserAvecMod(RACCOURCIS.lien.touche);
    await userEvent
      .setup()
      .type(screen.getByRole("textbox", { name: "Adresse du lien" }), "exemple.fr{Enter}");
    const lien = zoneDeSaisie().querySelector("a");
    if (lien !== null) {
      fireEvent.mouseOver(lien);
      fireEvent.mouseEnter(lien);
    }

    expect(lien?.getAttribute("href")).toBe("https://exemple.fr/");
    expect(appels).toEqual([]);
  });

  it("F-028-AC29 une seule version de yjs dans le fichier de verrou, prosemirror-view à 1.42.3 au moins, linkifyjs jamais sous 4.3.2, et les paquets de marque en 3.31.4 exactement", () => {
    const verrou = lire("../../pnpm-lock.yaml");
    const manifeste = JSON.parse(lire("package.json")) as { dependencies: Record<string, string> };

    expect(versionsResolues(verrou, "yjs")).toEqual(["13.6.33"]);
    expect(versionsResolues(verrou, "prosemirror-view").every((v) => auMoins(v, "1.42.3"))).toBe(
      true,
    );
    expect(versionsResolues(verrou, "linkifyjs").length).toBeGreaterThan(0);
    expect(versionsResolues(verrou, "linkifyjs").every((v) => auMoins(v, "4.3.2"))).toBe(true);
    for (const paquet of ["bold", "italic", "link"]) {
      expect(manifeste.dependencies[`@tiptap/extension-${paquet}`]).toBe("3.31.4");
    }
    expect(Object.keys(manifeste.dependencies)).not.toContain("@tiptap/starter-kit");
  });

  it("F-028-AC29 cas fautifs du contrôle des versions : deux yjs, un prosemirror-view trop ancien et un linkifyjs vulnérable sont vus", () => {
    const verrou = [
      "  yjs@13.6.33:",
      "  yjs@13.6.10:",
      "  prosemirror-view@1.42.2:",
      "  linkifyjs@4.3.1:",
    ].join("\n");

    expect(versionsResolues(verrou, "yjs")).toEqual(["13.6.33", "13.6.10"]);
    expect(versionsResolues(verrou, "prosemirror-view").every((v) => auMoins(v, "1.42.3"))).toBe(
      false,
    );
    expect(versionsResolues(verrou, "linkifyjs").every((v) => auMoins(v, "4.3.2"))).toBe(false);
  });

  it("F-028-AC29 les paquets de marque ne sont importés que par le module d'édition", async () => {
    const aretes = await graphe();

    expect(importateursDesMarques(aretes)).toEqual([
      "src/edition/lien.ts",
      "src/edition/schema.ts",
    ]);
  }, 60_000);
});
