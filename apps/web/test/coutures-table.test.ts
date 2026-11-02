// Couture de F-034 (AC11, AC9) : la façade de table change deux contrats publics, `lire()` (dans une
// transaction englobante elle rend une relecture fraîche s'il n'y a aucun abonné) et `fermer()` (il
// relit une dernière fois avant de se fermer). Les appelants sont énumérés en liste fermée : un
// nouvel appelant fait échouer ce test, jusqu'à ce qu'on établisse ce qu'il tolère.
//
// Cette couture n'est plus la seule garantie : depuis le tour 5, `abonner()` donne à chaque abonné la
// table lue à son inscription et `lire()` rend une relecture fraîche, de sorte que la façade est
// correcte même appelée dans une transaction (tests de `packages/document`). Elle garde un rôle de
// détecteur de changement d'appelant ; la preuve d'intégration (la vraie persistance n'atteint jamais
// la façade en transaction) est dans `table-session-hors-transaction.test.ts`.
//
// Changement voulu : `abonner()` appelé dans une transaction ne notifie plus pour les écritures faites
// avant l'inscription dans la même transaction (la base de comparaison est la table lue à l'inscription).
//
// Règle d'énumération, sans filtre de nom de variable. Un fichier peut tenir une façade s'il nomme
// `DocumentTable`, `ouvrirDocumentTable` ou `creerDocumentTable`, ou s'il importe (transitivement, par
// import relatif) un fichier qui le fait : le type d'une façade ne peut lui parvenir que par là, même
// inféré. Dans ces fichiers, TOUT appel `.lire(`, `.abonner(` ou `.fermer(`, quel que soit le
// receveur, est relevé avec ses multiplicités et comparé à la liste fermée, qui dit pour chacun si
// c'est la façade (et pourquoi c'est sûr) ou un autre objet. Les fichiers hors de cette fermeture ne
// peuvent pas tenir de façade. Les fichiers sont lus comme du texte.
import { describe, expect, it } from "vitest";

import { lireLesFichiersDuWorkspace } from "./aides-coutures.ts";

const SOURCES = /^apps\/[^/]+\/src\//;
const NOMME = /\b(?:DocumentTable|ouvrirDocumentTable|creerDocumentTable)\b/;
const APPEL = /\.(?:lire|abonner|fermer)\b/;
const TRANSACTION = /\btransact\(/;

type Fichiers = ReadonlyMap<string, string>;

// Limite : seuls les imports statiques avec liaison sont vus, ni `import("./…")` dynamique ni import de
// simple effet (comme la déstructuration, déjà hors de portée).
function importsRelatifs(chemin: string, texte: string, fichiers: Fichiers): string[] {
  const trouves: string[] = [];
  for (const [, visee] of texte.matchAll(/from\s+"(\.[^"]+)"/g)) {
    const segments = chemin.split("/").slice(0, -1);
    for (const segment of (visee ?? "").split("/")) {
      if (segment === "..") {
        segments.pop();
      } else if (segment !== ".") {
        segments.push(segment);
      }
    }
    const cible = [segments.join("/"), segments.join("/").replace(/\.js$/, ".ts")].find((c) =>
      fichiers.has(c),
    );
    if (cible !== undefined) {
      trouves.push(cible);
    }
  }
  return trouves;
}

/** Les fichiers de `apps/*\/src` qui nomment la façade ou importent, transitivement, un fichier qui la nomme. */
export function fichiersQuiPeuventTenirLaFacade(fichiers: Fichiers): Set<string> {
  const sources = [...fichiers].filter(([chemin]) => SOURCES.test(chemin));
  const fermeture = new Set(sources.filter(([, texte]) => NOMME.test(texte)).map(([c]) => c));
  for (let ajout = true; ajout;) {
    ajout = false;
    for (const [chemin, texte] of sources) {
      if (
        !fermeture.has(chemin) &&
        importsRelatifs(chemin, texte, fichiers).some((i) => fermeture.has(i))
      ) {
        fermeture.add(chemin);
        ajout = true;
      }
    }
  }
  return fermeture;
}

/** Toutes les lignes d'appel de la fermeture, avec leurs multiplicités, triées. */
export function appelants(fichiers: Fichiers): string[] {
  const trouves: string[] = [];
  for (const chemin of fichiersQuiPeuventTenirLaFacade(fichiers)) {
    for (const ligne of (fichiers.get(chemin) ?? "").split("\n")) {
      if (APPEL.test(ligne)) {
        trouves.push(`${chemin} | ${ligne.trim()}`);
      }
    }
  }
  return trouves.sort();
}

/** Les fichiers de `apps/*\/src` qui ouvrent une transaction, sous quelque forme que ce soit. */
export function ouvrantUneTransaction(fichiers: Fichiers): string[] {
  return [...fichiers]
    .filter(([chemin, texte]) => SOURCES.test(chemin) && TRANSACTION.test(texte))
    .map(([chemin]) => chemin)
    .sort();
}

/** Écart entre deux listes, multiplicités comprises (aucun `Set`). */
export function ecart(trouves: readonly string[], attendus: readonly string[]): string[] {
  const restants = [...attendus];
  const enTrop: string[] = [];
  for (const ligne of trouves) {
    const indice = restants.indexOf(ligne);
    if (indice >= 0) {
      restants.splice(indice, 1);
    } else {
      enTrop.push(`en trop : ${ligne}`);
    }
  }
  return [...enTrop, ...restants.map((ligne) => `manquant : ${ligne}`)];
}

const SESSION = "apps/web/src/table/session-table.ts";
const TABLES = "apps/web/src/table/tables-ouvertes.ts";
const ECRAN = "apps/web/src/vues-de-table/EcranDeTable.tsx";
const BOITE = "boîte, menu ou commande d'interface (fermer une boîte), pas la façade";
const SESSION_DE_TABLE =
  "session de table (lireEtat, abonner, fermer de la session, pas de la façade)";

// [clé, raison] : pour la façade, pourquoi l'appel n'est pas dans un `doc.transact` ou ce qu'il tolère.
const ADMIS: ReadonlyArray<readonly [string, string]> = [
  [
    `${SESSION} | facade.lire();`,
    "refusDeLaFacade : à l'ouverture (rappel de la persistance) et depuis #surLaTable, à la fin d'une transaction ; sans abonné lire() rend une relecture fraîche.",
  ],
  [
    `${SESSION} | facade.abonner(this.#surLaTable);`,
    "abonnement à l'ouverture, depuis un rappel de la persistance ; en transaction il serait sûr aussi (base = table lue à l'inscription).",
  ],
  [
    `${SESSION} | facade.fermer();`,
    "refusDeLaTable (façade d'un document témoin, depuis un rappel de la persistance).",
  ],
  [
    `${SESSION} | facade.fermer();`,
    "#surLaTable : depuis un abonné, à la fin d'une transaction, où fermer() relit hors transaction.",
  ],
  [
    `${SESSION} | this.#ouverte?.fermer();`,
    "fermeture de session (démontage, changement d'espace), depuis des rappels de la persistance ou des effets React.",
  ],
  [
    `${SESSION} | this.#ouverte?.fermer();`,
    "refus à l'ouverture, depuis un rappel de la persistance.",
  ],
  [`${SESSION} | this.#persistance.fermer();`, "persistance, pas la façade"],
  [`${SESSION} | this.#cesserDeSuivre = persistance.abonner(this.#surPersistance);`, "persistance"],
  [
    `${SESSION} | return { lireEtat: session.lireEtat, abonner: session.abonner, fermer: session.fermer };`,
    SESSION_DE_TABLE,
  ],
  [
    `${ECRAN} | return table.lire();`,
    "lectureDe : getSnapshot de useSyncExternalStore, au rendu ou dans le rappel de l'abonnement ; l'écran est abonné, donc lire() ne relit pas en cours de transaction.",
  ],
  [
    `${ECRAN} | const lue = useSyncExternalStore(table.abonner, () => lectureDe(table));`,
    "abonnement par React au montage, hors transaction.",
  ],
  [`${TABLES} | session.fermer();`, SESSION_DE_TABLE],
  [`${TABLES} | tenue.persistance.fermer();`, "persistance"],
  [`${TABLES} | tenue.persistance.fermer();`, "persistance"],
  [`${TABLES} | arrets.push(persistance.abonner(verifier));`, "persistance"],
  [
    "apps/web/src/interface/Application.tsx | const etat = useSyncExternalStore(session.abonner, session.lireEtat);",
    "session de l'application",
  ],
  [
    "apps/web/src/interface/Application.tsx | const appareil = useSyncExternalStore(espaces?.magasin.abonner ?? SANS_ABONNEMENT, () =>",
    "magasin d'espaces",
  ],
  ["apps/web/src/interface/Application.tsx | pages.fermer();", "pages ouvertes"],
  [
    "apps/web/src/interface/Application.tsx | tables.fermer();",
    "tables ouvertes (session), pas la façade",
  ],
  ["apps/web/src/interface/Application.tsx | session.fermer();", "session de l'application"],
  [
    "apps/web/src/interface/EspaceDeLOnglet.tsx | const etat = useSyncExternalStore(pilote.abonner, pilote.lireEtat);",
    "pilote d'espace",
  ],
  [
    "apps/web/src/interface/table-ouverte.ts | useEffect(() => () => tables.fermer(), [tables]);",
    "tables ouvertes (session), pas la façade",
  ],
  ["apps/web/src/interface/table-ouverte.ts | session.fermer();", SESSION_DE_TABLE],
  [
    "apps/web/src/interface/table-ouverte.ts | session?.abonner ?? SANS_ABONNEMENT,",
    SESSION_DE_TABLE,
  ],
  [
    "apps/web/src/interface/synchronisation-ouverte.ts | abonner: demarree.abonner,",
    "synchronisation",
  ],
  ["apps/web/src/interface/synchronisation-ouverte.ts | demarree.fermer();", "synchronisation"],
  [
    "apps/web/src/interface/synchronisation-ouverte.ts | return useSyncExternalStore(synchro?.abonner ?? SANS_ABONNEMENT, () => synchro?.lireEtat());",
    "synchronisation",
  ],
  [
    "apps/web/src/vues-de-table/Boites.tsx | <Bouton refBouton={annuler} libelle={ANNULER} surActivation={props.fermer} />",
    BOITE,
  ],
  ["apps/web/src/vues-de-table/Boites.tsx | surTouche={touchesDeBoite(props.fermer)}", BOITE],
  [
    "apps/web/src/vues-de-table/PanneauDesOptions.tsx | props.fermer(operer(() => vue.proprietes.table.retirerOption(colonne.id, option.id)))",
    BOITE,
  ],
  [
    "apps/web/src/vues-de-table/PanneauDesOptions.tsx | surActivation={() => props.fermer(undefined)}",
    BOITE,
  ],
  [
    "apps/web/src/vues-de-table/PanneauDesOptions.tsx | surTouche={touchesDeBoite(() => props.fermer(undefined))}",
    BOITE,
  ],
  ["apps/web/src/vues-de-table/VueTableau.tsx | fermer: vue.menu.fermer,", BOITE],
  [
    "apps/web/src/vues-de-table/kanban/VueKanban.tsx | fermer={() => vue.suppression.fermer(true)}",
    BOITE,
  ],
  ["apps/web/src/vues-de-table/kanban/use-vue-kanban.ts | bases.suppression.fermer(false);", BOITE],
  ["apps/web/src/vues-de-table/kanban/use-vue-kanban.ts | fermer: bases.menu.fermer,", BOITE],
  ["apps/web/src/vues-de-table/menus.ts | commandes.fermer();", BOITE],
  ["apps/web/src/vues-de-table/menus.ts | commandes.fermer();", BOITE],
  ["apps/web/src/vues-de-table/use-vue-tableau.ts | menu.fermer();", BOITE],
];

describe("F-034-AC11 couture : appelants de lire(), abonner() et fermer()", () => {
  const fichiers = lireLesFichiersDuWorkspace();

  it("les appels des fichiers qui peuvent tenir la façade sont la liste fermée ci-dessus, multiplicités comprises", () => {
    expect(ecart(appelants(fichiers), ADMIS.map(([cle]) => cle).sort())).toEqual([]);
  });

  it("chaque clé de la liste fermée est une ligne réellement présente dans le fichier qu'elle désigne", () => {
    for (const [cle] of ADMIS) {
      const coupure = cle.indexOf(" | ");
      expect(coupure, cle).toBeGreaterThan(0);
      expect(fichiers.get(cle.slice(0, coupure)) ?? "", cle).toContain(cle.slice(coupure + 3));
    }
  });

  it("aucun fichier de apps/*/src n'ouvre de transaction Yjs, sous quelque forme que ce soit", () => {
    expect(ouvrantUneTransaction(fichiers)).toEqual([]);
  });

  it("apps/server/src n'appelle pas la façade de table", () => {
    for (const [chemin, texte] of fichiers) {
      if (chemin.startsWith("apps/server/src/")) {
        expect(texte, chemin).not.toMatch(/ouvrirDocumentTable|creerDocumentTable/);
      }
    }
  });
});

// Cas fautifs, donnés comme données : chaque contrôle doit les détecter.
describe("F-034-AC11 couture : les contrôles détectent les cas fautifs", () => {
  const facade = "apps/web/src/a.ts";
  const consommateur = "apps/web/src/b.ts";
  const SOURCE = `import type { DocumentTable } from "@notionlike/document";\nexport const t: DocumentTable = x;\n`;

  it("alias : `const t = table; t.lire()` est relevé (aucun filtre de nom de variable)", () => {
    const f = new Map([[facade, `${SOURCE}const t = table;\nt.lire();\n`]]);
    expect(appelants(f)).toEqual([`${facade} | t.lire();`]);
  });

  // Limite connue du motif `APPEL` : il cherche `.lire`, `.abonner`, `.fermer` ; une déstructuration
  // n'est pas relevée. Elle est documentée ici, non corrigée : aucun fichier de `apps/*/src` ne le fait
  // et la façade est correcte en transaction (cette couture n'est plus la seule garantie).
  it("limite : `const { lire } = table; lire()` n'est pas relevé (déstructuration)", () => {
    const f = new Map([[facade, `${SOURCE}const { lire } = table;\nlire();\n`]]);
    expect(appelants(f)).toEqual([]);
  });

  it("fichier qui ne reçoit la façade que par un type inféré : il est dans la fermeture par son import", () => {
    const f = new Map([
      [facade, SOURCE],
      [consommateur, `import { t } from "./a.ts";\nt.abonner(rappel);\n`],
    ]);
    expect([...fichiersQuiPeuventTenirLaFacade(f)].sort()).toEqual([facade, consommateur]);
    expect(appelants(f)).toEqual([`${consommateur} | t.abonner(rappel);`]);
  });

  it("fichier sans lien avec la façade : hors fermeture", () => {
    const f = new Map([
      [facade, SOURCE],
      ["apps/web/src/c.ts", "persistance.fermer();\n"],
    ]);
    expect(appelants(f)).toEqual([]);
  });

  it.each([
    ["Y.transact(doc, f)", "Y.transact(doc, f);"],
    ["ydoc.transact(maFonction)", "ydoc.transact(maFonction);"],
    ["this.document.transact(() => {})", "this.document.transact(() => {});"],
    ["transact(doc, f) importé", "transact(doc, f);"],
  ])("transaction %s est relevée", (_nom, ligne) => {
    expect(ouvrantUneTransaction(new Map([["apps/web/src/x.ts", ligne]]))).toEqual([
      "apps/web/src/x.ts",
    ]);
    expect(ouvrantUneTransaction(new Map([["apps/server/src/x.ts", ligne]]))).toEqual([
      "apps/server/src/x.ts",
    ]);
  });

  it("appelant en doublon : une ligne de plus que la liste fermée est signalée, multiplicités comprises", () => {
    const ligne = `${facade} | facade.fermer();`;
    expect(ecart([ligne, ligne], [ligne])).toEqual([`en trop : ${ligne}`]);
    expect(ecart([ligne], [ligne, ligne])).toEqual([`manquant : ${ligne}`]);
    expect(ecart([ligne, ligne], [ligne, ligne])).toEqual([]);
  });
});
