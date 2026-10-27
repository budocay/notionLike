// Coutures de F-030 (AC19, AC20, AC21) : le contrat du module de persistance a changé (la coupure
// n'est plus définitive, l'état actif suit la preuve d'écriture, l'interface a gagné des membres).
// Ses appelants et les lecteurs de l'état de la session sont énumérés en listes fermées, par le
// graphe de dependency-cruiser, et chaque appelant de production prouve qu'il traite la reprise.
import { act, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { suivreLOnglet } from "../src/espace/garde-onglet.ts";
import type { EtatSession } from "../src/espace/session-espace.ts";
import {
  AvertissementDEnregistrement,
  ZoneDEnregistrement,
} from "../src/interface/Enregistrement.tsx";
import {
  type DesignationDocument,
  type EtatPersistance,
  ouvrirEspaceLocal,
  ouvrirPersistance,
  type Persistance,
} from "../src/persistance/index.ts";
import { rendreApplication } from "./aides-coquille.tsx";
import { lire, lireDossier } from "./aides-disque.ts";
import { ecrireLaVersion, VERSION_NON_PRISE_EN_CHARGE } from "./aides-format.ts";
import { type Aretes, graphe } from "./aides-graphe.ts";
import {
  attendreEtat,
  ESPACE_A,
  fermerDeForce,
  laisserIndexedDbTravailler,
  nomsDesBases,
  suivreLesConnexionsTenues,
} from "./aides-persistance.ts";
import { simulerLHorloge, tenterDeQuitter } from "./aides-reprise.ts";

const INTERFACE_DE_LA_PERSISTANCE = "src/persistance/index.ts";
const SESSION = "src/espace/session-espace.ts";
const GARDE_D_ONGLET = "src/espace/garde-onglet.ts";
const PAGES_OUVERTES = "src/page/pages-ouvertes.ts";
const SESSION_DE_PAGE = "src/page/session-page.ts";
const ECRAN_D_ENREGISTREMENT = "src/interface/Enregistrement.tsx";
const TABLES_OUVERTES = "src/table/tables-ouvertes.ts";
const SESSION_DE_TABLE = "src/table/session-table.ts";

// Les sortes d'appelants de l'interface de persistance. Tout fichier d'apps/web qui l'importe doit
// être inscrit dans l'une d'elles.
const APPELANTS_DE_PRODUCTION: Readonly<Record<string, string>> = {
  [SESSION]: "ouvre la persistance de l'espace, lit son état, s'y abonne, lui soumet l'état relu",
  [GARDE_D_ONGLET]:
    "s'abonne, lit l'état et les modifications non enregistrées, demande une tentative",
  [PAGES_OUVERTES]:
    "ouvre la persistance d'une page, la tient tant qu'une modification n'est pas écrite, la ferme",
  [SESSION_DE_PAGE]: "lit l'état de la persistance d'une page, s'y abonne, lui soumet l'état relu",
  // F-013-AC40 : passe de fond, réplique d'une page de version refusée, registre, effacements.
  "src/synchronisation/stockage.ts":
    "ouvre la base d'un document hors de l'écran, lit et inscrit le registre, efface des bases",
  // F-018-AC14, AC50 : la base d'une table, ses réglages de vue.
  [TABLES_OUVERTES]:
    "ouvre la persistance d'une table, la tient tant qu'une modification n'est pas écrite, la ferme, efface sa base et ses réglages",
  [SESSION_DE_TABLE]:
    "lit l'état de la persistance d'une table, s'y abonne, lui soumet l'état relu, la ferme sur un refus",
  // F-018-AC40 : lit et écrit les réglages de vue, sans persistance de document.
  "src/vues-de-table/use-reglages.ts": "lit et écrit les réglages de vue de la table affichée",
  // F-020-AC4 : lit et écrit la section `kanban` des réglages de vue, sans persistance de document.
  "src/vues-de-table/kanban/use-regroupement.ts":
    "lit et écrit la colonne de regroupement du kanban",
  // F-032-AC19 : la mémoire de l'appareil, sans persistance de document.
  "src/espace/appareil.ts":
    "lit et écrit ce que la base de l'appareil retient des espaces (registre, noms, marque, retenu)",
};
const AIDES_DE_TEST = [
  // F-028 : documents de chaque ligne de la table des versions, enregistrés puis relus (AC24, AC28).
  "test/aides-lignes.ts",
  "test/aides-page.tsx",
  "test/aides-persistance.ts",
  "test/aides-reprise.ts",
  "test/aides-session-page.tsx",
  // F-018 : bases de table écrites et relues.
  "test/aides-table.ts",
  // F-013 : onglets synchronisés sur le serveur réel.
  "test/synchronisation/aides-synchro.ts",
];
const TESTS_DE_LA_PERSISTANCE = [
  "test/coquille-echecs.test.tsx",
  // F-007 : effacement des bases de page.
  "test/corbeille-effacement.test.ts",
  "test/coutures-page.test.ts",
  "test/coutures.test.ts",
  "test/page-echecs.test.tsx",
  "test/persistance-echecs.test.ts",
  "test/persistance-ouverture.test.ts",
  "test/persistance-validation.test.ts",
  "test/reprise-coutures.test.tsx",
  "test/reprise-echecs.test.ts",
  "test/reprise-ecran.test.tsx",
  "test/reprise-fusion.test.ts",
  "test/reprise-preuve.test.ts",
  "test/reprise-reparation.test.ts",
  "test/reprise-tentatives.test.ts",
  "test/reprise-version.test.tsx",
  "test/structure.test.ts",
  // F-018 : réglages de vue, ouverture et persistance d'une table.
  "test/table-reglages.test.ts",
  // F-013 : registre de l'appareil, bases de page écrites et relues contre le serveur réel.
  "test/synchronisation/adoption.test.ts",
  "test/synchronisation/convergence.test.ts",
  "test/synchronisation/motifs.test.ts",
  "test/synchronisation/passe.test.ts",
  // F-018-AC51, AC53 : bases de table écrites et relues contre le serveur réel.
  "test/synchronisation/tables.test.ts",
  // F-032 : mémoire de l'appareil, bases d'un espace, réparation restreinte par le registre.
  "test/appareil-bases.test.ts",
  "test/appareil-memoire.test.ts",
  "test/appareil-reparation.test.ts",
  // F-032-AC20 : bases d'un espace posées puis retirées de l'appareil.
  "test/synchronisation/retrait.test.ts",
];

// Les fichiers qui importent la session, dont l'état publié a changé (`enregistre`, `baseRelue`,
// `basesNonRattachees`, `reessayer`, `modificationsPerdues`) : ceux de src/, dont dépend ce que
// l'écran dit de l'enregistrement, puis les aides et les tests.
const LECTEURS_DE_L_ETAT_DE_LA_SESSION: Readonly<Record<string, string>> = {
  "src/interface/Application.tsx": "choisit l'écran selon la phase",
  [ECRAN_D_ENREGISTREMENT]: "avertissement et zone d'état, selon `enregistre` (F-030-AC29)",
  "src/interface/etat-d-enregistrement.ts":
    "n'affirme l'enregistrement que si la page ouverte l'est aussi (F-003-AC18)",
  "src/main.tsx": "démarre la session",
  // F-032-AC17 : le pilote de l'onglet lit la phase pour n'inscrire l'espace retenu qu'une fois la
  // session de l'espace choisi prête.
  "src/espace/espace-ouvert.ts": "tient la session de l'espace ouvert, la ferme au changement",
};
const LECTEURS_DE_L_ETAT_DE_LA_SESSION_DANS_LES_TESTS: readonly string[] = [
  "test/aides-coquille.tsx",
  "test/aides-facade.ts",
  "test/coutures-f004.test.tsx",
  "test/depli.test.tsx",
  "test/reprise-coutures.test.tsx",
  "test/reprise-ecran.test.tsx",
  "test/session-fermeture.test.tsx",
  // F-018 : l'écran de table lit l'arborescence et l'espace dans l'état de la session.
  "test/table-ecran.test.tsx",
  "test/titre-affiche.test.tsx",
];

// Composants de présentation dont F-030 a changé la signature, et les fichiers qui les rendent :
// `Avertissement` reçoit des phrases et une action au lieu d'enfants, `ZoneEtat` une affirmation et
// une annonce, `EcranBloquant` une précision. Le compilateur vérifie chaque appel ; cette liste dit
// où ils sont.
const APPELANTS_DES_COMPOSANTS_CHANGES: Readonly<Record<string, readonly string[]>> = {
  Avertissement: ["src/demonstration/PageDemonstration.tsx", ECRAN_D_ENREGISTREMENT],
  EcranBloquant: ["src/demonstration/PageDemonstration.tsx", "src/interface/Application.tsx"],
  ZoneEtat: [
    "src/demonstration/PageDemonstration.tsx",
    ECRAN_D_ENREGISTREMENT,
    "test/composants.test.tsx",
  ],
};

/** Fichiers JSX qui rendent ce composant. */
function appelantsDuComposant(fichiers: ReadonlyMap<string, string>, composant: string): string[] {
  const rendu = new RegExp(`<${composant}[\\s/>]`);
  return [...fichiers]
    .filter(([chemin, texte]) => chemin.endsWith(".tsx") && rendu.test(texte))
    .map(([chemin]) => chemin)
    .sort();
}

/** Modules qui importent directement le module donné. */
function importateurs(aretes: Aretes, module: string): string[] {
  return [...aretes]
    .filter(([, dependances]) => dependances.includes(module))
    .map(([source]) => source)
    .sort();
}

const MEMBRES_DE_LA_PERSISTANCE = [
  "aDesModificationsNonEnregistrees",
  "aLaisseDesBasesNonRattachees",
  "aReluLaBase",
  "abonner",
  "fermer",
  "lireEtat",
  "reessayer",
  "soumettreLEtatRelu",
] as const;

/**
 * Membres de l'interface que ce texte appelle sur une persistance (`persistance.x`,
 * `this.#persistance.x`). Un membre du même nom appelé sur un autre objet (la façade, la session,
 * une diffusion) ne compte pas.
 */
function membresAppeles(texte: string): string[] {
  const appeles = new Set([...texte.matchAll(/\bpersistance\.(\w+)/g)].map(([, membre]) => membre));
  return MEMBRES_DE_LA_PERSISTANCE.filter((membre) => appeles.has(membre));
}

let aretes: Aretes;
beforeAll(async () => {
  aretes = await graphe();
}, 60_000);

describe("appelants de l'interface de persistance", () => {
  it("F-030-AC19 tout fichier d'apps/web qui importe l'interface de persistance est inscrit dans une sorte : production, aides de test, tests ; hors du module, personne n'importe un autre de ses fichiers", () => {
    const attendus = [
      ...Object.keys(APPELANTS_DE_PRODUCTION),
      ...AIDES_DE_TEST,
      ...TESTS_DE_LA_PERSISTANCE,
    ].sort();

    expect(importateurs(aretes, INTERFACE_DE_LA_PERSISTANCE)).toEqual(attendus);
    const internes = [...aretes.keys()].filter((module) => module.startsWith("src/persistance/"));
    expect(internes.length).toBeGreaterThanOrEqual(6);
    for (const interne of internes.filter((module) => module !== INTERFACE_DE_LA_PERSISTANCE)) {
      expect(
        importateurs(aretes, interne).filter((module) => !module.startsWith("src/persistance/")),
        interne,
      ).toEqual([]);
    }
  });

  it("F-030-AC19 F-030-AC29 les lecteurs de l'état de la session dans src/ sont la coquille, l'écran d'enregistrement et l'entrée, et rien d'autre ; dans test/, les aides et les tests de la liste", () => {
    const lecteurs = importateurs(aretes, SESSION);
    expect(lecteurs.filter((module) => module.startsWith("src/"))).toEqual(
      Object.keys(LECTEURS_DE_L_ETAT_DE_LA_SESSION).sort(),
    );
    expect(lecteurs.filter((module) => !module.startsWith("src/"))).toEqual(
      LECTEURS_DE_L_ETAT_DE_LA_SESSION_DANS_LES_TESTS,
    );
  });

  it("F-030-AC19 les composants de présentation dont la signature a changé ne sont rendus que par les fichiers de la liste ; un composant du même préfixe n'est pas compté, un fichier sans JSX non plus", () => {
    const fichiers = new Map([...lireDossier("src"), ...lireDossier("test")]);
    for (const [composant, appelants] of Object.entries(APPELANTS_DES_COMPOSANTS_CHANGES)) {
      expect(appelantsDuComposant(fichiers, composant), composant).toEqual([...appelants].sort());
    }

    const essai = new Map([
      ["src/a.tsx", "<Temoin phrases={[]} />"],
      ["src/b.tsx", "<Temoin>\n  enfant\n</Temoin>"],
      ["src/c.tsx", "<TemoinAutre />"],
      ["test/d.test.ts", 'const texte = "<Temoin />";'],
    ]);
    expect(appelantsDuComposant(essai, "Temoin")).toEqual(["src/a.tsx", "src/b.tsx"]);
  });

  it("F-030-AC19 l'énumération voit un importateur de plus, et un importateur qui manque", () => {
    const essai: Aretes = new Map([
      ["src/a.ts", [INTERFACE_DE_LA_PERSISTANCE]],
      ["src/b.ts", ["src/a.ts"]],
      ["test/c.test.ts", [INTERFACE_DE_LA_PERSISTANCE, "src/b.ts"]],
    ]);
    expect(importateurs(essai, INTERFACE_DE_LA_PERSISTANCE)).toEqual([
      "src/a.ts",
      "test/c.test.ts",
    ]);
    expect(importateurs(essai, "src/absent.ts")).toEqual([]);
  });

  it("F-030-AC19 l'interface a exactement huit membres, chacun appelé par un appelant de production : la session les appelle tous sauf ceux de la garde d'onglet, qui n'en ouvre ni n'en ferme aucune", () => {
    const persistance = ouvrirPersistance(new Y.Doc(), { type: "espace", idEspace: ESPACE_A });
    expect(Object.keys(persistance).sort()).toEqual([...MEMBRES_DE_LA_PERSISTANCE].sort());
    persistance.fermer();

    const parAppelant = Object.fromEntries(
      Object.keys(APPELANTS_DE_PRODUCTION).map((chemin) => [chemin, membresAppeles(lire(chemin))]),
    );
    expect(parAppelant).toEqual({
      [SESSION]: [
        "aDesModificationsNonEnregistrees",
        "aLaisseDesBasesNonRattachees",
        "aReluLaBase",
        "abonner",
        "fermer",
        "lireEtat",
        "reessayer",
        "soumettreLEtatRelu",
      ],
      [GARDE_D_ONGLET]: ["aDesModificationsNonEnregistrees", "abonner", "lireEtat", "reessayer"],
      [PAGES_OUVERTES]: ["aDesModificationsNonEnregistrees", "abonner", "fermer", "lireEtat"],
      [SESSION_DE_PAGE]: [
        "aReluLaBase",
        "abonner",
        "fermer",
        "lireEtat",
        "reessayer",
        "soumettreLEtatRelu",
      ],
      // F-013 : le stockage de la synchronisation ouvre ; la passe de fond et la réplique d'une page
      // de version refusée lisent, suivent et ferment ce qu'il ouvre (synchronisation/*.test.ts).
      "src/synchronisation/stockage.ts": [],
      // F-018 : comme les pages ouvertes et la session de page, pour une table.
      [TABLES_OUVERTES]: ["aDesModificationsNonEnregistrees", "abonner", "fermer", "lireEtat"],
      [SESSION_DE_TABLE]: [
        "aReluLaBase",
        "abonner",
        "fermer",
        "lireEtat",
        "reessayer",
        "soumettreLEtatRelu",
      ],
      "src/vues-de-table/use-reglages.ts": [],
      "src/vues-de-table/kanban/use-regroupement.ts": [],
      // F-032 : aucune persistance de document, seulement la base de l'appareil.
      "src/espace/appareil.ts": [],
    });
    expect(membresAppeles("persistance.fermer(); persistance.inconnu();")).toEqual(["fermer"]);
    expect(membresAppeles("this.#persistance.abonner(x); persistance.lireEtat()")).toEqual([
      "abonner",
      "lireEtat",
    ]);
    // Homonymes : la façade, une diffusion et la session portent des membres du même nom.
    expect(
      membresAppeles("facade.fermer(); this.#diffusion.abonner(x); session.lireEtat();"),
    ).toEqual([]);
  });

  it("F-030-AC19 les signatures de ouvrirPersistance et de ouvrirEspaceLocal sont celles de F-002, et l'état fermé reste définitif", async () => {
    const ouvrir: (doc: Y.Doc, designation: DesignationDocument) => Persistance = ouvrirPersistance;
    const ouvrirLocal: (doc: Y.Doc, idCandidat: string) => Persistance = ouvrirEspaceLocal;
    expect([ouvrir.length, ouvrirLocal.length]).toEqual([2, 2]);

    const persistance = ouvrir(new Y.Doc(), { type: "espace", idEspace: ESPACE_A });
    await attendreEtat(persistance, "active");
    persistance.fermer();
    persistance.reessayer();
    await laisserIndexedDbTravailler();
    expect(persistance.lireEtat()).toBe("fermee");
  });
});

describe("chaque appelant de production traite la reprise", () => {
  // Ce que la session publie pour chaque état de la persistance. Exhaustif par le type : un état
  // ajouté à la liste sans entrée ici ne compile plus.
  const PHASE_PAR_ETAT = {
    relecture: "chargement",
    active: "pret, enregistré",
    coupee: "pret, non enregistré",
    fermee: "version-non-prise-en-charge",
  } satisfies Record<EtatPersistance, string>;

  function publie(etat: EtatSession): string {
    if (etat.phase !== "pret") {
      return etat.phase;
    }
    return etat.enregistre ? "pret, enregistré" : "pret, non enregistré";
  }

  it("F-030-AC19 la session traite chacun des quatre états de la persistance, dont le retour de la coupure à l'état actif : ses abonnés sont prévenus à chaque passage", async () => {
    const connexions = suivreLesConnexionsTenues();
    const { session } = rendreApplication();
    const publies = [publie(session.lireEtat())];
    session.abonner(() => publies.push(publie(session.lireEtat())));
    await screen.findByRole("button", { name: "Nouvelle page" });
    const connexion = connexions.at(-1) as IDBDatabase;
    simulerLHorloge();
    act(() => fermerDeForce(connexion));
    await act(() => laisserIndexedDbTravailler());
    act(() => void vi.advanceTimersToNextTimer());
    await act(() => laisserIndexedDbTravailler());
    await act(() => laisserIndexedDbTravailler());
    const doc = session.doc as Y.Doc;
    const plusRecent = new Y.Doc();
    Y.applyUpdate(plusRecent, Y.encodeStateAsUpdate(doc));
    ecrireLaVersion(plusRecent, VERSION_NON_PRISE_EN_CHARGE);
    act(() => Y.applyUpdate(doc, Y.encodeStateAsUpdate(plusRecent)));

    expect(publies).toEqual([
      PHASE_PAR_ETAT.relecture,
      PHASE_PAR_ETAT.active,
      PHASE_PAR_ETAT.coupee,
      PHASE_PAR_ETAT.active,
      PHASE_PAR_ETAT.fermee,
    ]);
  });

  // Une persistance tenue par le test : le type impose chacun de ses membres.
  interface PersistanceSimulee extends Persistance {
    regler(nonEnregistre: boolean): void;
    /** La persistance passe à l'état fermé sans que la garde d'onglet l'ait demandé. */
    fermerParUnAutre(): void;
  }

  function persistanceSimulee(): PersistanceSimulee {
    const abonnes = new Set<() => void>();
    let nonEnregistre = false;
    let etat: EtatPersistance = "coupee";
    return {
      lireEtat: () => etat,
      abonner: (rappel) => {
        abonnes.add(rappel);
        return () => void abonnes.delete(rappel);
      },
      fermer: vi.fn(),
      reessayer: vi.fn(),
      aDesModificationsNonEnregistrees: () => nonEnregistre,
      aReluLaBase: () => true,
      aLaisseDesBasesNonRattachees: () => false,
      soumettreLEtatRelu: vi.fn(),
      regler: (valeur) => {
        nonEnregistre = valeur;
        abonnes.forEach((rappel) => rappel());
      },
      fermerParUnAutre: () => {
        etat = "fermee";
        abonnes.forEach((rappel) => rappel());
      },
    };
  }

  function quitterEstRetenu(): boolean {
    return tenterDeQuitter().defaultPrevented;
  }

  it("F-030-AC19 la garde d'onglet traite la reprise : la confirmation avant de quitter, armée par une modification non enregistrée, est désarmée dès que la persistance n'en porte plus, et la garde arrêtée ne suit plus rien", () => {
    const persistance = persistanceSimulee();
    const cesser = suivreLOnglet(persistance);
    expect(quitterEstRetenu()).toBe(false);

    persistance.regler(true);
    expect(quitterEstRetenu()).toBe(true);
    persistance.regler(false);
    expect(quitterEstRetenu()).toBe(false);

    persistance.regler(true);
    cesser();
    expect(quitterEstRetenu()).toBe(false);
    persistance.regler(true);
    expect(quitterEstRetenu()).toBe(false);
    window.dispatchEvent(new Event("pagehide"));
    expect(persistance.reessayer).not.toHaveBeenCalled();
  });

  it("F-030-AC11 une persistance fermée par un autre que la garde d'onglet, alors qu'elle porte encore une modification non enregistrée, ne retient plus l'onglet", () => {
    const persistance = persistanceSimulee();
    const cesser = suivreLOnglet(persistance);
    persistance.regler(true);
    expect(quitterEstRetenu()).toBe(true);

    persistance.fermerParUnAutre();

    expect(persistance.aDesModificationsNonEnregistrees()).toBe(true);
    expect(quitterEstRetenu()).toBe(false);
    cesser();
  });

  it("F-030-AC16 deux persistances suivies dans le même onglet : la reprise de l'une ne retire pas la confirmation que l'autre demande encore, ni l'arrêt de sa garde ; la confirmation tombe quand plus aucune ne porte de modification", () => {
    const [une, autre] = [persistanceSimulee(), persistanceSimulee()];
    const cesserLUne = suivreLOnglet(une);
    const cesserLAutre = suivreLOnglet(autre);
    une.regler(true);
    autre.regler(true);
    expect(quitterEstRetenu()).toBe(true);

    une.regler(false);
    expect(quitterEstRetenu()).toBe(true);
    cesserLUne();
    expect(quitterEstRetenu()).toBe(true);

    autre.regler(false);
    expect(quitterEstRetenu()).toBe(false);
    cesserLAutre();
  });

  it("F-030-AC19 F-030-AC29 l'écran d'enregistrement traite la reprise : de « Non enregistré » avec l'avertissement à « Enregistré sur cet appareil » sans avertissement, et l'inverse", () => {
    const pret = (enregistre: boolean): Extract<EtatSession, { phase: "pret" }> => ({
      phase: "pret",
      arborescence: { racines: [], corbeille: [] },
      idEspace: ESPACE_A,
      enregistre,
      baseRelue: true,
      basesNonRattachees: false,
      operations: {
        creerPage: vi.fn(),
        // F-018 : création d'une table.
        creerTable: vi.fn(),
        renommerPage: vi.fn(),
        // F-006 : déplacement d'une page.
        deplacerPage: vi.fn(),
        mettreALaCorbeille: vi.fn(),
        // F-007 : opérations de la corbeille.
        restaurerPage: vi.fn(),
        supprimerDefinitivement: vi.fn(),
      },
      reessayer: vi.fn(),
    });
    const ecran = (etat: Extract<EtatSession, { phase: "pret" }>) => (
      <>
        <AvertissementDEnregistrement etat={etat} zonePrincipale={{ current: null }} />
        <ZoneDEnregistrement etat={etat} />
      </>
    );
    const { rerender } = render(ecran(pret(false)));
    expect(screen.getByRole("status").textContent).toBe("Non enregistré sur cet appareil");
    expect(screen.queryByRole("alert")).not.toBeNull();

    rerender(ecran(pret(true)));
    expect(screen.getByRole("status").textContent).toBe(
      "Enregistré sur cet appareil Modifications enregistrées sur cet appareil.",
    );
    expect(screen.queryByRole("alert")).toBeNull();

    rerender(ecran(pret(false)));
    expect(screen.getByRole("status").textContent).toBe("Non enregistré sur cet appareil");
    expect(screen.queryByRole("alert")).not.toBeNull();
  });
});

// ── F-030-AC20 : confinement de la bibliothèque, champs touchés ──────────────────────────────────

const FICHIER_DE_LA_BIBLIOTHEQUE = "src/persistance/indexeddb.ts";
// Ce que le module touche d'une instance de `y-indexeddb@9.0.12`. `_db` et `_storeUpdate` sont les
// deux champs internes de l'ADR-0008 ; `db` et `doc` sont publics, lus pour la barrière et la preuve.
const CHAMPS_TOUCHES = ["_db", "_storeUpdate", "db", "destroy", "doc", "once"];

function champsDeLInstance(source: string): string[] {
  return [
    ...new Set([...source.matchAll(/\bbibliotheque\.(\w+)/g)].map(([, champ = ""]) => champ)),
  ].sort();
}

describe("confinement de la bibliothèque de persistance", () => {
  it("F-030-AC20 seul indexeddb.ts atteint y-indexeddb dans tout apps/web, et il n'en touche que les champs nommés par l'ADR-0008 et son amendement", () => {
    const atteignent = [...aretes]
      .filter(([, dependances]) => dependances.some((un) => /node_modules\/y-indexeddb\//.test(un)))
      .map(([source]) => source);
    expect(atteignent).toEqual([FICHIER_DE_LA_BIBLIOTHEQUE]);
    expect(champsDeLInstance(lire(FICHIER_DE_LA_BIBLIOTHEQUE))).toEqual(CHAMPS_TOUCHES);
  });

  it("F-030-AC20 un champ interne de plus touché par le module est nommé", () => {
    expect(champsDeLInstance("bibliotheque._db.then(); bibliotheque.once('synced');")).toEqual([
      "_db",
      "once",
    ]);
    expect(champsDeLInstance("bibliotheque._dbref = 0; bibliotheque._db;")).toEqual([
      "_db",
      "_dbref",
    ]);
  });
});

// ── F-030-AC2 : une tentative à la fois, lancée par le suivi seul ────────────────────────────────

const SUIVI = "src/persistance/suivi.ts";
const TEMOIN = "src/persistance/temoin.ts";

/** Membres qu'une classe expose : ses champs `readonly` sans dièse. */
function membresExposes(source: string): string[] {
  return [...source.matchAll(/^ {2}readonly (\w+) = /gm)].map(([, membre = ""]) => membre).sort();
}

describe("structure du module de persistance", () => {
  it("F-030-AC2 le suivi n'expose aucun moyen de lancer une tentative hors de `reessayer`, qui n'en lance jamais pendant une autre : la première part à sa construction", () => {
    expect(membresExposes(lire(SUIVI))).toEqual([
      "aDesModificationsNonEnregistrees",
      "aLaisseDesBasesNonRattachees",
      "aReluLaBase",
      "abonner",
      "fermer",
      "lireEtat",
      "noterUneModification",
      "reessayer",
      "signalerDesBasesNonRattachees",
    ]);
    expect(membresExposes("  readonly lancer = (): void => {\n  readonly #prive = 1;\n")).toEqual([
      "lancer",
    ]);
  });

  it("F-030-AC26 le calcul du document témoin est séparé de l'entrée-sortie : son fichier n'importe que yjs et ne nomme pas indexedDB ; le nom du magasin des mises à jour n'a qu'une définition dans le module", () => {
    expect(aretes.get(TEMOIN)?.filter((un) => !/node_modules\/yjs\//.test(un))).toEqual([]);
    expect(aretes.get(TEMOIN)?.length).toBeGreaterThan(0);
    expect(lire(TEMOIN)).not.toMatch(/indexedDB|IDB[A-Z]/);
    const definitions = [...lireDossier("src")]
      .filter(([, texte]) => /=\s*"updates"/.test(texte))
      .map(([chemin]) => chemin);
    expect(definitions).toEqual(["src/persistance/lecture-brute.ts"]);
  });
});

// ── F-030-AC21 : F-003, livrée après, porte la reprise des pages (F-003-AC18, H18) ───────────────

describe("documents de page", () => {
  it("F-030-AC21 F-003-AC18 F-003 étant livrée après F-030, c'est elle qui porte la reprise des pages : sa session et ses pages ouvertes sont dans l'énumération de F-030-AC19, un seul fichier de production ouvre une base de page, par ouvrirPersistance, et la session d'espace reste la seule à appeler ouvrirEspaceLocal", async () => {
    const quiAppellent = (motif: RegExp): string[] =>
      Object.keys(APPELANTS_DE_PRODUCTION).filter((chemin) => motif.test(lire(chemin)));
    // F-013-AC40 : la passe de fond et la réplique d'une page de version refusée ouvrent aussi la
    // base d'une page, par le stockage de la synchronisation.
    // F-018-AC14 : les tables ouvertes ouvrent la base d'une table, jamais celle d'une page.
    expect(quiAppellent(/\bouvrirPersistance\(/)).toEqual([
      PAGES_OUVERTES,
      "src/synchronisation/stockage.ts",
      TABLES_OUVERTES,
    ]);
    expect(lire(TABLES_OUVERTES)).not.toMatch(/type: "page"/);
    expect(quiAppellent(/\bouvrirEspaceLocal\(/)).toEqual([SESSION]);
    expect([...aretes.keys()].filter((module) => /^src\/page\//.test(module)).sort()).toEqual([
      PAGES_OUVERTES,
      SESSION_DE_PAGE,
    ]);

    // Sans page sélectionnée, aucune base de page ni de table n'est ouverte.
    rendreApplication();
    await screen.findByRole("button", { name: "Nouvelle page" });
    expect((await nomsDesBases()).filter((nom) => /^notionlike:(page|table):/.test(nom))).toEqual(
      [],
    );
  });
});
