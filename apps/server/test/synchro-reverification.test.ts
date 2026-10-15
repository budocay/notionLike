// Revérification de 60 secondes (F-012-AC14, H6) : une passe lit le rôle une seule fois par espace
// et par compte, quel que soit le nombre de ses ouvertures. Les décisions du module d'autorisation
// sont comptées par une enveloppe qui délègue au module réel.
import { randomUUID } from "node:crypto";

import { nomDeDocument } from "@notionlike/contrats";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import * as autorisation from "../src/autorisation.ts";
import {
  attendreQue,
  connecterBrut,
  DELAI_SYNCHRO_MS,
  fermerLesClients,
  pause,
  preparerUnEspace,
} from "./aides-synchro.ts";
import { demarrerServeurDEssai, type ServeurDEssai } from "./fabrique.ts";

vi.mock("../src/autorisation.ts", async (original) => {
  const reel = await original<typeof import("../src/autorisation.ts")>();
  return { ...reel, decider: vi.fn(reel.decider) };
});

let serveur: ServeurDEssai;

beforeAll(async () => {
  serveur = await demarrerServeurDEssai();
}, DELAI_SYNCHRO_MS);
afterEach(fermerLesClients);
afterAll(async () => {
  await serveur.fermer();
});

describe("une lecture du rôle par espace et par compte (F-012-AC14)", () => {
  it(
    "F-012-AC14 F-012-AC15 trente ouvertures dans deux espaces : une passe du filet fait deux lectures de rôle",
    async () => {
      const premier = await preparerUnEspace(serveur);
      const idSecond = await serveur.creerEspace(premier.proprietaire.cookie);
      await serveur.ajouterMembre(
        premier.proprietaire.cookie,
        idSecond,
        premier.editeur.cookie,
        "editeur",
      );
      const client = await connecterBrut(serveur, { cookie: premier.editeur.cookie });
      for (let rang = 0; rang < 30; rang += 1) {
        const idEspace = rang % 2 === 0 ? premier.idEspace : idSecond;
        await client.ouvrirEtSynchroniser(
          nomDeDocument({ type: "page", idEspace, idDocument: randomUUID() }),
        );
      }
      const decider = vi.mocked(autorisation.decider);
      decider.mockClear();

      serveur.horloge.avancer(serveur.reglages.periodeDeReverificationMs);
      await attendreQue(() => decider.mock.calls.length >= 2);
      await pause(300);

      expect(decider.mock.calls.map(([, demande]) => demande.idEspace).sort()).toEqual(
        [premier.idEspace, idSecond].sort(),
      );
      expect(client.recus.filter((lu) => lu.type === "fermeture")).toEqual([]);
    },
    DELAI_SYNCHRO_MS,
  );
});
