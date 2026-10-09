// Aides des tests HTTP : l'application est construite comme en production (configuration lue,
// journal, application, écoute) et servie sur un port libre de 127.0.0.1 ; le journal est capturé.
import { Writable } from "node:stream";

import { schemaEnveloppeErreur, type EnveloppeErreur } from "@notionlike/contrats";
import type { Base } from "@notionlike/db";

import { creerApplication } from "../src/application.ts";
import { lireConfiguration } from "../src/configuration.ts";
import { creerJournal } from "../src/journal.ts";
import { demarrerServeur } from "../src/serveur.ts";

export const MOT_DE_PASSE_D_ESSAI = "mot-de-passe-d-essai";
export const URL_BASE_D_ESSAI = `postgres://essai:${MOT_DE_PASSE_D_ESSAI}@127.0.0.1:5432/essai`;

const DELAI_ARRET_D_ESSAI_MS = 1000;

export type LigneDeJournal = Readonly<Record<string, unknown>>;

export interface ServeurDEssai {
  readonly url: string;
  readonly port: number;
  texteDuJournal(): string;
  lignesDuJournal(): LigneDeJournal[];
  arreter(): Promise<void>;
}

export interface Reglages {
  readonly env?: Readonly<Record<string, string>>;
  readonly delaiArretMs?: number;
}

const serveursLances: ServeurDEssai[] = [];

export async function lancerServeur(base: Base, reglages: Reglages = {}): Promise<ServeurDEssai> {
  const morceaux: string[] = [];
  const sortie = new Writable({
    write(morceau: Buffer, _encodage, fin) {
      morceaux.push(morceau.toString("utf8"));
      fin();
    },
  });
  const configuration = lireConfiguration({
    PORT: "0",
    URL_BASE_DONNEES: URL_BASE_D_ESSAI,
    ...reglages.env,
  });
  const application = creerApplication({ configuration, base, journal: creerJournal(sortie) });
  const ecoute = await demarrerServeur({
    application,
    hote: configuration.hote,
    port: configuration.port,
    delaiArretMs: reglages.delaiArretMs ?? DELAI_ARRET_D_ESSAI_MS,
  });
  const texteDuJournal = (): string => morceaux.join("");
  const serveur: ServeurDEssai = {
    url: `http://${configuration.hote}:${ecoute.port}`,
    port: ecoute.port,
    texteDuJournal,
    lignesDuJournal: () =>
      texteDuJournal()
        .split("\n")
        .filter((ligne) => ligne !== "")
        .map((ligne) => JSON.parse(ligne) as LigneDeJournal),
    arreter: ecoute.arreter,
  };
  serveursLances.push(serveur);
  return serveur;
}

// À appeler après chaque test : arrêter deux fois un serveur est sans effet.
export async function arreterLesServeurs(): Promise<void> {
  await Promise.all(serveursLances.splice(0).map((serveur) => serveur.arreter()));
}

// Une `Base` dont la sonde est choisie par le test ; `Base` est une interface (conception).
export function baseDontLaSonde(db: Base["db"], sonder: () => Promise<void>): Base {
  return { db, sonder, fermer: () => Promise.resolve() };
}

// F-008-AC22 : toute enveloppe lue par un test passe par le schéma publié.
export async function enveloppeDe(reponse: Response): Promise<EnveloppeErreur> {
  return schemaEnveloppeErreur.parse(await reponse.json());
}

export function attendre(dureeMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, dureeMs);
  });
}
