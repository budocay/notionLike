import { CHEMINS, schemaReponsePret, schemaReponseSante } from "@notionlike/contrats";
import { ouvrirBase } from "@notionlike/db";
import {
  demarrerFauxPostgres,
  ouvrirBaseEmbarquee,
  portFerme,
  type BaseEmbarquee,
} from "@notionlike/db/essai";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  arreterLesServeurs,
  baseDontLaSonde,
  DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  DELAI_DES_TESTS_LENTS_MS,
  enveloppeDe,
  lancerServeur,
  MOT_DE_PASSE_D_ESSAI,
  santeDe,
} from "./aides.ts";

let embarquee: BaseEmbarquee;

beforeAll(async () => {
  embarquee = await ouvrirBaseEmbarquee();
}, DELAI_D_OUVERTURE_D_UNE_BASE_MS);
afterEach(arreterLesServeurs);
afterAll(() => embarquee.base.fermer());

describe("GET /sante", () => {
  it("F-008-AC1 répond 200 { etat: ok }, validé par le schéma publié, sans sonder la base", async () => {
    let sondes = 0;
    const base = baseDontLaSonde(embarquee.base.db, () => {
      sondes += 1;
      return Promise.reject(new Error("la base ne doit pas être sondée"));
    });
    const serveur = await lancerServeur(base);

    const reponse = await fetch(`${serveur.url}${CHEMINS.sante}`);

    expect(reponse.status).toBe(200);
    expect(schemaReponseSante.parse(await reponse.json())).toEqual({ etat: "ok" });
    expect(sondes).toBe(0);
  });
});

describe("GET /pret", () => {
  it("F-008-AC2 répond 200 { etat: pret } en moins de 2 secondes quand la base répond à la sonde", async () => {
    let sondes = 0;
    const base = baseDontLaSonde(embarquee.base.db, () => {
      sondes += 1;
      return embarquee.base.sonder();
    });
    const serveur = await lancerServeur(base);
    const debut = performance.now();

    const reponse = await fetch(`${serveur.url}${CHEMINS.pret}`);

    expect(performance.now() - debut).toBeLessThan(2000);
    expect(reponse.status).toBe(200);
    expect(schemaReponsePret.parse(await reponse.json())).toEqual({ etat: "pret" });
    expect(sondes).toBe(1);
  });

  // Ce test ouvre lui-même la seconde base : son corps porte le délai d'une ouverture.
  it(
    "F-008-AC18 deux serveurs du même fichier ont chacun leur base embarquée",
    async () => {
      const autre = await ouvrirBaseEmbarquee();
      const premier = await lancerServeur(embarquee.base);
      const second = await lancerServeur(autre.base);

      await autre.base.fermer();

      expect((await fetch(`${second.url}${CHEMINS.pret}`)).status).toBe(503);
      expect((await fetch(`${premier.url}${CHEMINS.pret}`)).status).toBe(200);
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );

  it("F-008-AC3 répond 503 base-indisponible quand la base est injoignable, et GET /sante reste à 200", async () => {
    const port = await portFerme();
    const base = ouvrirBase(`postgres://essai:${MOT_DE_PASSE_D_ESSAI}@127.0.0.1:${port}/essai`);
    const serveur = await lancerServeur(base);

    const pret = await fetch(`${serveur.url}${CHEMINS.pret}`);
    const sante = await fetch(`${serveur.url}${CHEMINS.sante}`);
    await base.fermer();

    expect(pret.status).toBe(503);
    expect((await enveloppeDe(pret)).code).toBe("base-indisponible");
    expect(sante.status).toBe(200);
    expect(schemaReponseSante.parse(await sante.json())).toEqual({ etat: "ok" });
  });

  it(
    "F-008-AC3 répond 503 entre 1,9 et 3 secondes quand la sonde reste sans réponse, GET /sante répondant pendant et après",
    async () => {
      const faux = await demarrerFauxPostgres(MOT_DE_PASSE_D_ESSAI);
      const base = ouvrirBase(faux.url);
      const serveur = await lancerServeur(base);
      faux.seTaire();
      const debut = performance.now();

      const enAttente = fetch(`${serveur.url}${CHEMINS.pret}`);
      const pendant = await fetch(`${serveur.url}${CHEMINS.sante}`);
      const pret = await enAttente;
      const duree = performance.now() - debut;
      const apres = await fetch(`${serveur.url}${CHEMINS.sante}`);
      await base.fermer();
      await faux.arreter();

      expect(pendant.status).toBe(200);
      expect(await santeDe(pendant)).toEqual({ etat: "ok" });
      expect(pret.status).toBe(503);
      expect((await enveloppeDe(pret)).code).toBe("base-indisponible");
      expect(duree).toBeGreaterThanOrEqual(1900);
      expect(duree).toBeLessThan(3000);
      expect(apres.status).toBe(200);
      expect(await santeDe(apres)).toEqual({ etat: "ok" });
    },
    DELAI_DES_TESTS_LENTS_MS,
  );
});
