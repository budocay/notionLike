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
import { lire } from "./aides-disque.ts";
import { ecrireLaVersion, VERSION_NON_PRISE_EN_CHARGE } from "./aides-format.ts";
import { type Aretes, graphe } from "./aides-graphe.ts";
import {
  attendreEtat,
  ESPACE_A,
  fermerDeForce,
  laisserIndexedDbTravailler,
  nomsDesBases,
  suivreLesConnexions,
} from "./aides-persistance.ts";
import { simulerLHorloge } from "./aides-reprise.ts";

const INTERFACE_DE_LA_PERSISTANCE = "src/persistance/index.ts";
const SESSION = "src/espace/session-espace.ts";
const GARDE_D_ONGLET = "src/espace/garde-onglet.ts";
const ECRAN_D_ENREGISTREMENT = "src/interface/Enregistrement.tsx";

// Les sortes d'appelants de l'interface de persistance. Tout fichier d'apps/web qui l'importe doit
// être inscrit dans l'une d'elles.
const APPELANTS_DE_PRODUCTION: Readonly<Record<string, string>> = {
  [SESSION]: "ouvre la persistance de l'espace, lit son état, s'y abonne, lui soumet l'état relu",
  [GARDE_D_ONGLET]: "s'abonne, lit les modifications non enregistrées, demande une tentative",
};
const AIDES_DE_TEST = ["test/aides-persistance.ts", "test/aides-reprise.ts"];
const TESTS_DE_LA_PERSISTANCE = [
  "test/coquille-echecs.test.tsx",
  "test/coutures.test.ts",
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
];

// Les fichiers de src/ qui lisent l'état de la session, dont dépend ce que l'écran dit de
// l'enregistrement : la façade du document et la persistance n'y sont lues par personne d'autre.
const LECTEURS_DE_L_ETAT_DE_LA_SESSION: Readonly<Record<string, string>> = {
  "src/interface/Application.tsx": "choisit l'écran selon la phase",
  [ECRAN_D_ENREGISTREMENT]: "avertissement et zone d'état, selon `enregistre` (F-030-AC29)",
  "src/main.tsx": "démarre la session",
};

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

/** Membres de l'interface que ce texte appelle sur un objet. */
function membresAppeles(texte: string): string[] {
  return MEMBRES_DE_LA_PERSISTANCE.filter((membre) => texte.includes(`.${membre}`));
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

  it("F-030-AC19 F-030-AC29 les lecteurs de l'état de la session dans src/ sont la coquille, l'écran d'enregistrement et l'entrée, et rien d'autre", () => {
    expect(importateurs(aretes, SESSION).filter((module) => module.startsWith("src/"))).toEqual(
      Object.keys(LECTEURS_DE_L_ETAT_DE_LA_SESSION).sort(),
    );
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
      [GARDE_D_ONGLET]: ["aDesModificationsNonEnregistrees", "abonner", "reessayer"],
    });
    expect(membresAppeles("persistance.fermer(); persistance.inconnu();")).toEqual(["fermer"]);
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
    const connexions = suivreLesConnexions();
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
    expect(Object.keys(PHASE_PAR_ETAT)).toHaveLength(4);
  });

  // Une persistance tenue par le test : le type impose chacun de ses membres.
  function persistanceSimulee(): Persistance & { regler(nonEnregistre: boolean): void } {
    const abonnes = new Set<() => void>();
    let nonEnregistre = false;
    return {
      lireEtat: () => "coupee",
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
    };
  }

  function quitterEstRetenu(): boolean {
    const evenement = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(evenement);
    return evenement.defaultPrevented;
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

  it("F-030-AC19 F-030-AC29 l'écran d'enregistrement traite la reprise : de « Non enregistré » avec l'avertissement à « Enregistré sur cet appareil » sans avertissement, et l'inverse", () => {
    const pret = (enregistre: boolean): Extract<EtatSession, { phase: "pret" }> => ({
      phase: "pret",
      arborescence: { racines: [], corbeille: [] },
      enregistre,
      baseRelue: true,
      basesNonRattachees: false,
      operations: { creerPage: vi.fn(), renommerPage: vi.fn(), mettreALaCorbeille: vi.fn() },
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
    expect(screen.getByRole("alert")).toBeTruthy();

    rerender(ecran(pret(true)));
    expect(screen.getByRole("status").textContent).toBe(
      "Enregistré sur cet appareilModifications enregistrées sur cet appareil.",
    );
    expect(screen.queryByRole("alert")).toBeNull();

    rerender(ecran(pret(false)));
    expect(screen.getByRole("status").textContent).toBe("Non enregistré sur cet appareil");
    expect(screen.getByRole("alert")).toBeTruthy();
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

// ── F-030-AC21 : sans objet tant que F-003 n'est pas fusionnée ───────────────────────────────────

describe("documents de page", () => {
  it("F-030-AC21 F-003 n'étant pas fusionnée, le critère est sans objet et la preuve le constate : aucune base de page ni de table n'est ouverte en production, la session d'espace est la seule à ouvrir une persistance, par ouvrirEspaceLocal", async () => {
    const production = Object.keys(APPELANTS_DE_PRODUCTION).map((chemin) => lire(chemin));
    expect(production.filter((texte) => /\bouvrirPersistance\b/.test(texte))).toEqual([]);
    expect(production.filter((texte) => /\bouvrirEspaceLocal\(/.test(texte))).toHaveLength(1);
    expect([...aretes.keys()].filter((module) => /^src\/(editeur|page)\//.test(module))).toEqual(
      [],
    );

    rendreApplication();
    await screen.findByRole("button", { name: "Nouvelle page" });
    expect((await nomsDesBases()).filter((nom) => /^notionlike:(page|table):/.test(nom))).toEqual(
      [],
    );
  });
});
