import { connect, type Socket } from "node:net";

import { CHEMINS } from "@notionlike/contrats";
import { ouvrirBase } from "@notionlike/db";
import {
  demarrerFauxPostgres,
  ouvrirBaseEmbarquee,
  type BaseEmbarquee,
} from "@notionlike/db/essai";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  arreterLesServeurs,
  attendre,
  baseDontLaSonde,
  lancerServeur,
  MOT_DE_PASSE_D_ESSAI,
  type ServeurDEssai,
} from "./aides.ts";

const DELAI_DES_TESTS_LENTS_MS = 15_000;

let embarquee: BaseEmbarquee;

beforeAll(async () => {
  embarquee = await ouvrirBaseEmbarquee();
});
afterEach(arreterLesServeurs);
afterAll(() => embarquee.base.fermer());

interface ConnexionBrute {
  readonly connexion: Socket;
  readonly fermee: Promise<string>;
}

// Ouvre une connexion et y écrit un début de requête ; `fermee` rend tout ce que le serveur a envoyé.
function envoyerLeDebut(serveur: ServeurDEssai, debut: string): Promise<ConnexionBrute> {
  return new Promise((resolve, reject) => {
    const morceaux: Buffer[] = [];
    const connexion = connect(serveur.port, "127.0.0.1");
    const fermee = new Promise<string>((fin) => {
      connexion.on("close", () => {
        fin(Buffer.concat(morceaux).toString("utf8"));
      });
    });
    connexion.on("data", (morceau: Buffer) => morceaux.push(morceau));
    connexion.on("error", reject);
    connexion.on("connect", () => {
      connexion.write(debut, () => {
        resolve({ connexion, fermee });
      });
    });
  });
}

describe("arrêt du serveur", () => {
  it(
    "F-008-AC7 l'arrêt laisse finir la requête en cours, refuse toute nouvelle connexion et finit dès la réponse rendue",
    async () => {
      const faux = await demarrerFauxPostgres(MOT_DE_PASSE_D_ESSAI);
      const lente = ouvrirBase(faux.url);
      faux.seTaire();
      let signaler = (): void => undefined;
      const sondeDemarree = new Promise<void>((resolve) => {
        signaler = resolve;
      });
      const base = baseDontLaSonde(lente.db, () => {
        signaler();
        return lente.sonder();
      });
      const serveur = await lancerServeur(base, { delaiArretMs: 10_000 });

      const enCours = fetch(`${serveur.url}${CHEMINS.pret}`);
      await sondeDemarree;
      const arret = serveur.arreter();
      const nouvelle = await fetch(`${serveur.url}${CHEMINS.sante}`).then(
        (reponse) => `réponse ${reponse.status}`,
        () => "connexion refusée",
      );
      const reponse = await enCours;
      const rendue = performance.now();
      await arret;
      const finDeLArret = performance.now();
      await lente.fermer();
      await faux.arreter();

      expect(nouvelle).toBe("connexion refusée");
      expect(reponse.status).toBe(503);
      expect(finDeLArret - rendue).toBeLessThan(1000);
    },
    DELAI_DES_TESTS_LENTS_MS,
  );

  it("F-008-AC7 l'arrêt ferme aussitôt une connexion inactive gardée ouverte par le client", async () => {
    const serveur = await lancerServeur(embarquee.base, { delaiArretMs: 10_000 });
    const requeteComplete = "GET /sante HTTP/1.1\r\nHost: essai\r\nConnection: keep-alive\r\n\r\n";
    const { fermee } = await envoyerLeDebut(serveur, requeteComplete);
    await expect.poll(() => serveur.lignesDuJournal()).toHaveLength(1);
    const debut = performance.now();

    await serveur.arreter();

    expect(await fermee).toContain("HTTP/1.1 200 OK");
    expect(performance.now() - debut).toBeLessThan(1000);
  });

  it("F-008-AC7 une requête dont le corps n'arrive pas est coupée sans réponse à l'échéance du délai d'arrêt", async () => {
    const serveur = await lancerServeur(embarquee.base, { delaiArretMs: 300 });
    const debutDeRequete =
      'POST /inconnu HTTP/1.1\r\nHost: essai\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{"a":';
    const { fermee } = await envoyerLeDebut(serveur, debutDeRequete);
    await attendre(50);
    const debut = performance.now();

    await serveur.arreter();
    const duree = performance.now() - debut;

    expect(await fermee).toBe("");
    expect(duree).toBeGreaterThanOrEqual(290);
    expect(duree).toBeLessThan(2000);
  });

  it("F-008-AC7 arrêter un serveur déjà arrêté est sans effet", async () => {
    const serveur = await lancerServeur(embarquee.base);

    await serveur.arreter();

    await expect(serveur.arreter()).resolves.toBeUndefined();
    await expect(fetch(`${serveur.url}${CHEMINS.sante}`)).rejects.toThrow();
  });
});
