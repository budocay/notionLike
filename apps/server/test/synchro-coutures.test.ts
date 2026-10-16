// Coutures de la synchronisation (F-012-AC27, AC30 à AC32, AC34, AC36), lues dans les sources, le
// verrou et les manifestes, et constatées sur l'assemblage réel.
import { readdirSync, readFileSync } from "node:fs";
import { Writable } from "node:stream";

import { Document } from "@hocuspocus/server";
import {
  CANAUX_DES_MOTIFS,
  LIMITES_SYNCHRO,
  MOTIFS_SYNCHRO,
  TYPES_DE_DOCUMENT,
  type CanalDUnMotif,
} from "@notionlike/contrats";
import { TYPES_DE_DOCUMENT as TYPES_EN_BASE } from "@notionlike/db";
import { ouvrirBaseEmbarqueeMigree } from "@notionlike/db/essai";
import type { Express } from "express";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { assembler } from "../src/assemblage.ts";
import { creerApplication } from "../src/application.ts";
import { lireConfiguration } from "../src/configuration.ts";
import { creerJournal } from "../src/journal.ts";
import { creerSuppressionDeSessions } from "../src/sessions.ts";
import { REGLAGES_SYNCHRO } from "../src/synchro-reglages.ts";
import { importationsAtteignables } from "./aides-sources.ts";
import { DELAI_SYNCHRO_MS } from "./aides-synchro.ts";
import { ENV_D_ESSAI } from "./aides.ts";
import { demarrerServeurDEssai } from "./fabrique.ts";

const RACINE = new URL("../../../", import.meta.url);
const SERVEUR = new URL("../", import.meta.url);
const SRC = new URL("../src/", import.meta.url);
const TEST = new URL("./", import.meta.url);

const lire = (url: URL): string => readFileSync(url, "utf8");
const sources = new Map(readdirSync(SRC).map((nom) => [nom, lire(new URL(nom, SRC))] as const));

// ---------------------------------------------------------------------------------------------
// F-012-AC27 : chaque motif, par chacun de ses canaux, est constaté par un test du côté du client
// (du côté du serveur pour un refus de connexion) : le fichier et l'assertion qui le constatent.

function cleDuCanal(motif: string, canal: CanalDUnMotif): string {
  const precision =
    "statut" in canal
      ? ` ${String(canal.statut)}`
      : "code" in canal
        ? ` ${String(canal.code)}`
        : "";
  return `${motif} : ${canal.canal}${precision}`;
}

const CONSTATS: Readonly<Record<string, readonly [string, string]>> = {
  "non-authentifie : refus-de-connexion 401": ["synchro-connexion.test.ts", "statut: 401"],
  "non-authentifie : fermeture-de-connexion 1008": [
    "synchro-sessions.test.ts",
    '{ code: 1008, raison: "non-authentifie" }',
  ],
  "origine-refusee : refus-de-connexion 403": ["synchro-connexion.test.ts", "statut: 403"],
  "acces-refuse : refus-d-ouverture": ["synchro-ouverture.test.ts", 'texte: "acces-refuse"'],
  "acces-refuse : fermeture-d-ouverture": ["synchro-droits.test.ts", 'raison: "acces-refuse"'],
  "droits-modifies : fermeture-d-ouverture": [
    "synchro-droits.test.ts",
    'raison: "droits-modifies"',
  ],
  "nom-de-document-invalide : refus-d-ouverture": [
    "synchro-ouverture.test.ts",
    'texte: "nom-de-document-invalide"',
  ],
  "document-trop-grand : fermeture-d-ouverture": [
    "synchro-stockage.test.ts",
    'raison: "document-trop-grand"',
  ],
  "quota-atteint : refus-de-connexion 429": ["synchro-plafonds.test.ts", "statut: 429"],
  "quota-atteint : refus-de-connexion 503": ["synchro-plafonds.test.ts", "statut: 503"],
  "quota-atteint : refus-d-ouverture": ["synchro-fermetures.test.ts", 'texte: "quota-atteint"'],
  "quota-atteint : fermeture-d-ouverture": ["synchro-stockage.test.ts", 'raison: "quota-atteint"'],
  "trop-de-requetes : fermeture-de-connexion 1008": [
    "synchro-limites.test.ts",
    '{ code: 1008, raison: "trop-de-requetes" }',
  ],
  "message-trop-grand : fermeture-sans-raison 1009": [
    "synchro-limites.test.ts",
    '{ code: 1009, raison: "" }',
  ],
  "erreur-interne : refus-de-connexion 500": ["synchro-connexion.test.ts", "statut: 500"],
  "erreur-interne : refus-d-ouverture": ["synchro-stockage.test.ts", 'texte: "erreur-interne"'],
  "erreur-interne : fermeture-d-ouverture": ["synchro-droits.test.ts", 'raison: "erreur-interne"'],
  "erreur-interne : fermeture-de-connexion 1008": [
    "synchro-droits.test.ts",
    '{ code: 1008, raison: "erreur-interne" }',
  ],
  "version-refusee : fermeture-d-ouverture": [
    "synchro-document.test.ts",
    'raison: "version-refusee"',
  ],
};

function canauxSansConstat(constats: Readonly<Record<string, readonly [string, string]>>) {
  const declares = MOTIFS_SYNCHRO.flatMap((motif) =>
    CANAUX_DES_MOTIFS[motif].map((canal) => cleDuCanal(motif, canal)),
  );
  return [
    ...MOTIFS_SYNCHRO.filter((motif) => CANAUX_DES_MOTIFS[motif].length === 0).map(
      (motif) => `${motif} : aucun canal`,
    ),
    ...declares.filter((cle) => {
      const constat = constats[cle];
      return constat === undefined || !lire(new URL(constat[0], TEST)).includes(constat[1]);
    }),
    ...Object.keys(constats).filter((cle) => !declares.includes(cle)),
  ];
}

describe("motifs et canaux (F-012-AC27)", () => {
  it("F-012-AC27 chaque motif a un canal déclaré, et chaque canal un test qui le constate", () => {
    expect(canauxSansConstat(CONSTATS)).toEqual([]);
  });

  it("F-012-AC27 le constat échoue pour un canal sans test ou un test qui ne l'observe pas", () => {
    const incomplets = Object.fromEntries(
      Object.entries(CONSTATS).filter(([cle]) => cle !== "version-refusee : fermeture-d-ouverture"),
    );
    const faux = {
      ...CONSTATS,
      "acces-refuse : refus-d-ouverture": ["synchro-ouverture.test.ts", "jamais écrit"] as const,
    };

    expect(canauxSansConstat(incomplets)).toEqual(["version-refusee : fermeture-d-ouverture"]);
    expect(canauxSansConstat(faux)).toEqual(["acces-refuse : refus-d-ouverture"]);
  });

  it("F-012-AC27 F-008-AC23 les types de document publiés sont ceux de la table de la base", () => {
    expect([...TYPES_DE_DOCUMENT]).toEqual([...TYPES_EN_BASE]);
  });
});

// ---------------------------------------------------------------------------------------------
// F-012-AC34 : les modules d'apps/server qui appellent la bibliothèque, et les tests d'exécution
// qui tiennent chacun des comportements non documentés dont le serveur dépend.

const COMPORTEMENTS: Readonly<Record<string, readonly [string, string]>> = {
  "remise d'une connexion et de ses messages": [
    "synchro-ouverture.test.ts",
    "F-012-AC16 F-012-AC34",
  ],
  "identité de la connexion relue sur chaque ouverture": [
    "synchro-ouverture.test.ts",
    "F-012-AC5 la réouverture",
  ],
  "énumération des ouvertures et fermeture sans la WebSocket": [
    "synchro-droits.test.ts",
    "F-012-AC12 F-012-AC34",
  ],
  "passage en lecture seule d'une ouverture vivante": [
    "synchro-droits.test.ts",
    "F-012-AC13 F-012-AC34",
  ],
  "refus d'ouverture portant la raison du serveur": ["synchro-ouverture.test.ts", "F-012-AC6"],
  "absence de relance native de l'enregistrement": [
    "synchro-stockage.test.ts",
    "F-012-AC21 F-012-AC34",
  ],
  "enregistrement et déchargement à l'arrêt": ["synchro-arret.test.ts", "F-012-AC31 F-012-AC34"],
  "portée annoncée à l'ouverture": ["synchro-ouverture.test.ts", "F-012-AC5 le client officiel"],
  "accusés positif et négatif": ["synchro-ouverture.test.ts", "F-012-AC10 F-012-AC34"],
  "fermeture et déchargement au message de fermeture du client": [
    "synchro-fermetures.test.ts",
    "F-012-AC24 F-012-AC34",
  ],
  "mise à l'écart d'un message de fermeture sans ouverture": [
    "synchro-fermetures.test.ts",
    "F-012-AC37 F-012-AC34",
  ],
  "crochet d'enregistrement après un échange sans effet": [
    "synchro-stockage.test.ts",
    "F-012-AC35 F-012-AC34",
  ],
};

const MODULES_DE_LA_BIBLIOTHEQUE: Readonly<Record<string, readonly string[]>> = {
  "synchro-relais.ts": ["mise à l'écart d'un message de fermeture sans ouverture"],
  "synchronisation.ts": Object.keys(COMPORTEMENTS),
};

describe("couture de la bibliothèque (F-012-AC34)", () => {
  it("F-012-AC34 les modules d'apps/server/src qui importent @hocuspocus/server ou ws sont énumérés, chacun couvert", () => {
    const appelants = [...sources]
      .filter(([, texte]) => /from "(@hocuspocus\/server|ws)"/.test(texte))
      .map(([nom]) => nom)
      .sort();

    expect(appelants).toEqual(Object.keys(MODULES_DE_LA_BIBLIOTHEQUE).sort());
    for (const comportements of Object.values(MODULES_DE_LA_BIBLIOTHEQUE)) {
      for (const comportement of comportements) {
        const [fichier, extrait] = COMPORTEMENTS[comportement] ?? ["", "?"];
        expect(lire(new URL(fichier, TEST)), comportement).toContain(extrait);
      }
    }
  });

  it("F-012-AC34 F-012-AC32 la bibliothèque et ws sont déclarées à une version exacte, et seulement par apps/server", () => {
    const manifeste = JSON.parse(lire(new URL("package.json", SERVEUR))) as {
      dependencies: Record<string, string>;
    };
    expect(manifeste.dependencies["@hocuspocus/server"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifeste.dependencies.ws).toMatch(/^\d+\.\d+\.\d+$/);
    for (const autre of ["packages/db", "packages/contrats", "packages/document", "apps/web"]) {
      const texte = lire(new URL(`${autre}/package.json`, RACINE));
      expect(texte, autre).not.toMatch(/"(@hocuspocus\/server|ws)"\s*:/);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// F-012-AC30 : une seule instance de yjs.

describe("une seule instance de yjs (F-012-AC30)", () => {
  it("F-012-AC30 le document de la bibliothèque est un Y.Doc de l'instance d'apps/server, et le verrou ne résout qu'une version de yjs, y-protocols et lib0", () => {
    const document = new Document("essai");
    expect(document).toBeInstanceOf(Y.Doc);
    document.destroy();

    const verrou = lire(new URL("pnpm-lock.yaml", RACINE));
    for (const paquet of ["yjs", "y-protocols", "lib0"]) {
      const versions = new Set(
        [...verrou.matchAll(new RegExp(`^  ${paquet}@([0-9.]+)`, "gm"))].map(
          ([, version]) => version,
        ),
      );
      expect([...versions], paquet).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// F-012-AC36 : la fabrique d'essai, et ce que la production n'en voit pas.

describe("fabrique d'essai (F-012-AC36)", () => {
  it("F-012-AC36 depuis le point d'entrée de production, aucune importation n'atteint la fabrique ni la base embarquée", () => {
    const { fichiers, paquets } = importationsAtteignables(new URL("main.ts", SRC));

    expect(fichiers).toContain("src/synchronisation.ts");
    expect(fichiers.filter((fichier) => !fichier.startsWith("src/"))).toEqual([]);
    expect(paquets.filter((paquet) => /essai|@notionlike\/server/.test(paquet))).toEqual([]);
  });

  it(
    "F-012-AC36 le service de production assemble sans paramètre d'essai, donc avec les limites publiées",
    async () => {
      expect(sources.get("service.ts")).toMatch(/assembler\(\{ configuration, base, journal \}\)/);
      expect(REGLAGES_SYNCHRO).toMatchObject(LIMITES_SYNCHRO);
      expect(REGLAGES_SYNCHRO).toMatchObject({
        attenteDEnregistrementMs: 2000,
        attenteMaxDEnregistrementMs: 10_000,
        relanceDEnregistrementMs: 10_000,
        periodeDeReverificationMs: 60_000,
      });
      expect(Object.keys(lireConfiguration(ENV_D_ESSAI)).sort()).toEqual(
        [
          "cookiesSecurises",
          "hote",
          "originesAutorisees",
          "port",
          "proxysDeConfiance",
          "secretDesSessions",
          "urlBaseDonnees",
          "urlPublique",
        ].sort(),
      );

      const { base } = await ouvrirBaseEmbarqueeMigree();
      try {
        const journal = creerJournal(new Writable({ write: (_m, _e, fin) => fin() }));
        const { synchronisation } = assembler({
          configuration: lireConfiguration(ENV_D_ESSAI),
          base,
          journal,
        });
        expect(synchronisation.reglages).toEqual(REGLAGES_SYNCHRO);
        await synchronisation.arreter();
      } finally {
        await base.fermer();
      }
    },
    DELAI_SYNCHRO_MS,
  );

  it("F-012-AC36 sous NODE_ENV=production, la fabrique lève sans rien démarrer ; elle n'admet que des réglages réduits", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      await expect(demarrerServeurDEssai()).rejects.toThrow(/production/);
    } finally {
      vi.unstubAllEnvs();
    }
    await expect(
      demarrerServeurDEssai({
        reglages: { connexionsParCompte: LIMITES_SYNCHRO.connexionsParCompte + 1 },
      }),
    ).rejects.toThrow(/supérieur/);
  });

  it(
    "F-012-AC36 F-012-AC31 la fabrique redémarre sur la même base et le même port, et l'assemblage garde les routes de F-008 à F-011",
    async () => {
      const serveur = await demarrerServeurDEssai();
      try {
        const compte = await serveur.inscrire();
        const port = serveur.port;
        await serveur.redemarrer();

        expect(serveur.port).toBe(port);
        expect(
          (await serveur.appeler("GET", "/api/v1/moi", { cookie: compte.cookie })).status,
        ).toBe(200);
      } finally {
        await serveur.fermer();
      }

      const { base } = await ouvrirBaseEmbarqueeMigree();
      try {
        const configuration = lireConfiguration(ENV_D_ESSAI);
        const journal = creerJournal(new Writable({ write: (_m, _e, fin) => fin() }));
        const assemble = assembler({ configuration, base, journal });
        const seule = creerApplication({
          configuration,
          base,
          journal,
          suppression: creerSuppressionDeSessions(base, journal),
        });
        expect(routesDe(assemble.application)).toEqual(routesDe(seule));
        await assemble.synchronisation.arreter();
      } finally {
        await base.fermer();
      }
    },
    DELAI_SYNCHRO_MS,
  );
});

function routesDe(application: Express): string[] {
  return application.router.stack.flatMap((couche) => {
    const route = couche.route as { path?: string; methods?: Record<string, boolean> } | undefined;
    return route?.path === undefined
      ? []
      : Object.keys(route.methods ?? {}).map((methode) => `${methode} ${String(route.path)}`);
  });
}
