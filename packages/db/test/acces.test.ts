import { inspect } from "node:util";

import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErreurBase, ouvrirBase } from "../src/index.ts";
import {
  demarrerFauxPostgres,
  ouvrirBaseEmbarquee,
  portFerme,
  type BaseEmbarquee,
} from "./essai.ts";

const MOT_DE_PASSE = "mot-de-passe-de-test";
const DELAI_MAXIMAL_DU_CAS_MS = 10_000;
const ATTENTE_DE_LA_COUPURE_MS = 200;
const ATTENTE_MAXIMALE_DE_LA_FERMETURE_MS = 1000;
// Chaque base embarquée est une instance PGlite neuve. La première du fichier compile le
// WebAssembly et fait un initdb : 1,6 à 5,6 s mesurés seul sur 4 CPU, plusieurs fois plus quand
// toute la suite tourne en parallèle ; les suivantes partent du gabarit de `base-embarquee.ts`.
// L'ouverture se fait donc dans un crochet qui a son propre délai, et le corps de chaque test garde
// le délai par défaut pour ce qu'il constate.
const DELAI_D_OUVERTURE_D_UNE_BASE_MS = 30_000;

function lignesDe(resultat: unknown): unknown[] {
  expect(resultat).toHaveProperty("rows");
  return (resultat as { rows: unknown[] }).rows;
}

async function echecDe(promesse: Promise<unknown>): Promise<ErreurBase> {
  const issue = await promesse.then(
    () => "la promesse a abouti",
    (erreur: unknown) => erreur,
  );
  expect(issue).toBeInstanceOf(ErreurBase);
  return issue as ErreurBase;
}

function echecSynchroneDe(action: () => unknown): ErreurBase {
  let issue: unknown = "aucune erreur levée";
  try {
    action();
  } catch (erreur) {
    issue = erreur;
  }
  expect(issue).toBeInstanceOf(ErreurBase);
  return issue as ErreurBase;
}

function attendre(dureeMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, dureeMs);
  });
}

describe("accès à une base embarquée", () => {
  let embarquee: BaseEmbarquee;

  beforeEach(async () => {
    embarquee = await ouvrirBaseEmbarquee();
  }, DELAI_D_OUVERTURE_D_UNE_BASE_MS);
  // La fermeture est idempotente (F-008-AC17) : refermer une base déjà fermée par le test ne change rien.
  afterEach(() => embarquee.base.fermer());

  // Premier test du fichier : sa base est celle dont le répertoire sert de gabarit aux suivantes.
  // Ce qu'elle reçoit après son ouverture ne doit pas atteindre une base ouverte ensuite.
  it(
    "F-008-AC18 une base ouverte après qu'une autre a reçu une table ne la voit pas",
    async () => {
      const chercher = sql`select to_regclass('essai_gabarit')::text as table_trouvee`;
      await embarquee.base.db.execute(sql`create table essai_gabarit (id integer primary key)`);

      const tardive = await ouvrirBaseEmbarquee();
      try {
        expect(lignesDe(await embarquee.base.db.execute(chercher))).toEqual([
          { table_trouvee: "essai_gabarit" },
        ]);
        expect(lignesDe(await tardive.base.db.execute(chercher))).toEqual([
          { table_trouvee: null },
        ]);
      } finally {
        await tardive.base.fermer();
      }
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );

  it("F-008-AC17 la sonde aboutit, l'accès Drizzle rend la ligne d'un select, la fermeture ferme", async () => {
    const { base } = embarquee;

    await expect(base.sonder()).resolves.toBeUndefined();
    const resultat = await base.db.execute(sql`select 41 + 1 as reponse`);
    expect(lignesDe(resultat)).toEqual([{ reponse: 42 }]);

    await expect(base.fermer()).resolves.toBeUndefined();
    const erreur = await echecDe(base.sonder());
    expect(erreur.code).toBe("base-injoignable");
  });

  describe("avec une seconde base ouverte", () => {
    let seconde: BaseEmbarquee;

    beforeEach(async () => {
      seconde = await ouvrirBaseEmbarquee();
    }, DELAI_D_OUVERTURE_D_UNE_BASE_MS);
    afterEach(() => seconde.base.fermer());

    it("F-008-AC18 deux bases embarquées ouvertes dans le même fichier ne partagent aucun état", async () => {
      const premiere = embarquee;
      const chercher = sql`select to_regclass('essai_isolement')::text as table_trouvee`;

      await premiere.base.db.execute(sql`create table essai_isolement (id integer primary key)`);

      expect(lignesDe(await premiere.base.db.execute(chercher))).toEqual([
        { table_trouvee: "essai_isolement" },
      ]);
      expect(lignesDe(await seconde.base.db.execute(chercher))).toEqual([{ table_trouvee: null }]);

      await expect(premiere.base.fermer()).resolves.toBeUndefined();
      await expect(seconde.base.fermer()).resolves.toBeUndefined();
    });
  });

  it("F-008-AC17 une seconde fermeture aboutit sans refermer le moteur embarqué", async () => {
    const { base, pilote } = embarquee;
    const fermeturesDuPilote = vi.spyOn(pilote, "fermer");

    await expect(base.fermer()).resolves.toBeUndefined();
    await expect(base.fermer()).resolves.toBeUndefined();

    expect(fermeturesDuPilote).toHaveBeenCalledTimes(1);
  });
});

describe("accès par le pilote pg", () => {
  it("F-008-AC17 vers un port local fermé, la sonde lève base-injoignable sans l'URL ni le mot de passe", async () => {
    const port = await portFerme();
    const url = `postgres://essai:${MOT_DE_PASSE}@127.0.0.1:${port}/essai`;
    const base = ouvrirBase(url);

    const erreur = await echecDe(base.sonder());

    expect(erreur.code).toBe("base-injoignable");
    expect(erreur.message).not.toContain(url);
    expect(erreur.message).not.toContain(MOT_DE_PASSE);
    expect(erreur.message).not.toContain(String(port));
    const chaineEntiere = inspect(erreur, { depth: Infinity });
    expect(chaineEntiere).toContain("ECONNREFUSED");
    expect(chaineEntiere).not.toContain(url);
    expect(chaineEntiere).not.toContain(MOT_DE_PASSE);
    await expect(base.fermer()).resolves.toBeUndefined();
  });

  it.each([
    ["un texte qui n'est pas une URL", "pas une url"],
    ["une chaîne vide", ""],
    ["un autre protocole", `mysql://essai:${MOT_DE_PASSE}@127.0.0.1:3306/essai`],
    ["un protocole web", `https://essai:${MOT_DE_PASSE}@127.0.0.1/essai`],
  ])("F-008-AC17 refus à l'ouverture, sans cause ni rappel de l'URL : %s", (_cas, url) => {
    const erreur = echecSynchroneDe(() => ouvrirBase(url));

    expect(erreur.code).toBe("url-de-connexion-invalide");
    expect(erreur.cause).toBeUndefined();
    expect(erreur.message).not.toContain(MOT_DE_PASSE);
    expect(erreur.message).not.toContain("127.0.0.1");
    expect(inspect(erreur, { depth: Infinity })).not.toContain(MOT_DE_PASSE);
  });

  it("F-008-AC17 une seconde fermeture aboutit sans refermer la réserve du pilote pg", async () => {
    const fermeturesDeLaReserve = vi.spyOn(Pool.prototype, "end");
    const base = ouvrirBase(
      `postgres://essai:${MOT_DE_PASSE}@127.0.0.1:${await portFerme()}/essai`,
    );
    try {
      await expect(base.fermer()).resolves.toBeUndefined();
      await expect(base.fermer()).resolves.toBeUndefined();

      expect(fermeturesDeLaReserve).toHaveBeenCalledTimes(1);
    } finally {
      fermeturesDeLaReserve.mockRestore();
    }
  });

  it.each([["postgres:"], ["postgresql:"]])(
    "F-008-AC17 le protocole %s est accepté et l'ouverture n'attend aucune connexion",
    async (protocole) => {
      const port = await portFerme();
      const base = ouvrirBase(`${protocole}//essai:${MOT_DE_PASSE}@127.0.0.1:${port}/essai`);

      expect(Object.keys(base).sort()).toEqual(["db", "fermer", "sonder"]);
      await expect(base.fermer()).resolves.toBeUndefined();
    },
  );

  it(
    "F-008-AC17 F-008-AC3 un serveur qui se tait fait échouer la sonde par sonde-hors-delai en 1,9 à 3 secondes",
    async () => {
      const faux = await demarrerFauxPostgres(MOT_DE_PASSE);
      const base = ouvrirBase(faux.url);
      await expect(base.sonder()).resolves.toBeUndefined();

      faux.seTaire();
      const debut = performance.now();
      const erreur = await echecDe(base.sonder());
      const dureeMs = performance.now() - debut;

      expect(erreur.code).toBe("sonde-hors-delai");
      expect(erreur.cause).toBeUndefined();
      expect(dureeMs).toBeGreaterThanOrEqual(1900);
      expect(dureeMs).toBeLessThan(3000);
      await faux.arreter();
      await expect(base.fermer()).resolves.toBeUndefined();
    },
    DELAI_MAXIMAL_DU_CAS_MS,
  );

  it(
    "F-008-AC17 la fermeture aboutit alors que la requête d'une sonde hors délai est encore en vol",
    async () => {
      const faux = await demarrerFauxPostgres(MOT_DE_PASSE);
      const base = ouvrirBase(faux.url);
      await expect(base.sonder()).resolves.toBeUndefined();
      faux.seTaire();
      expect((await echecDe(base.sonder())).code).toBe("sonde-hors-delai");

      const issue = await Promise.race([
        base.fermer().then(() => "fermée"),
        attendre(ATTENTE_MAXIMALE_DE_LA_FERMETURE_MS).then(() => "toujours ouverte"),
      ]);

      expect(issue).toBe("fermée");
      await faux.arreter();
    },
    DELAI_MAXIMAL_DU_CAS_MS,
  );

  // La sonde ignore l'issue de sa requête : la promesse du pilote `pg` est relevée sur la réserve
  // (`Pool.prototype.query`, que Drizzle appelle), sans rien changer à ce qu'elle fait.
  it(
    "F-008-AC17 après la fermeture, la requête restée en vol d'une sonde hors délai est rejetée",
    async () => {
      const requetesDeLaReserve = vi.spyOn(Pool.prototype, "query");
      const faux = await demarrerFauxPostgres(MOT_DE_PASSE);
      const base = ouvrirBase(faux.url);
      try {
        await expect(base.sonder()).resolves.toBeUndefined();
        faux.seTaire();
        expect((await echecDe(base.sonder())).code).toBe("sonde-hors-delai");
        const derniere = requetesDeLaReserve.mock.results.at(-1);
        expect(derniere?.type).toBe("return");
        const issueDeLaRequete = Promise.resolve(derniere?.value as unknown).then(
          () => "aboutie",
          (erreur: unknown) => erreur,
        );
        expect(await Promise.race([issueDeLaRequete, attendre(0).then(() => "en vol")])).toBe(
          "en vol",
        );

        void base.fermer();
        const issue = await Promise.race([
          issueDeLaRequete,
          attendre(ATTENTE_MAXIMALE_DE_LA_FERMETURE_MS).then(() => "toujours en vol"),
        ]);

        expect(issue).toBeInstanceOf(Error);
        expect((issue as Error).message).toBe("Connection terminated");
        expect(faux.messagesRecus).toEqual(["Q", "Q"]);
      } finally {
        requetesDeLaReserve.mockRestore();
        await faux.arreter();
        await base.fermer();
      }
    },
    DELAI_MAXIMAL_DU_CAS_MS,
  );

  it("F-008-AC3 des connexions inactives coupées ne lèvent aucune exception non interceptée et la sonde suivante aboutit", async () => {
    const nonInterceptees: unknown[] = [];
    const noter = (erreur: unknown): void => {
      nonInterceptees.push(erreur);
    };
    process.on("uncaughtException", noter);
    const faux = await demarrerFauxPostgres(MOT_DE_PASSE);
    const base = ouvrirBase(faux.url);
    try {
      await expect(base.sonder()).resolves.toBeUndefined();

      faux.couper();
      await attendre(ATTENTE_DE_LA_COUPURE_MS);

      expect(nonInterceptees).toEqual([]);
      await expect(base.sonder()).resolves.toBeUndefined();
    } finally {
      process.off("uncaughtException", noter);
    }
    await expect(base.fermer()).resolves.toBeUndefined();
    await faux.arreter();
  });
});
