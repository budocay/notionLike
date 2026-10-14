// Limites du relais (F-012-AC22, AC25, AC33, AC37) : taille d'un message par `ws`, débit de la
// connexion et taille de la présence par le relais, avant toute remise à la bibliothèque.
import { randomUUID } from "node:crypto";
import type { Socket } from "node:net";

import { nomDeDocument } from "@notionlike/contrats";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";

import {
  brut,
  connecterBrut,
  DELAI_SYNCHRO_MS,
  fermerLesClients,
  miseAJourTexte,
  pause,
  preparerUnEspace,
  texteDe,
  type ClientBrut,
  type EspaceDEssai,
} from "./aides-synchro.ts";
import { demarrerServeurDEssai, type ServeurDEssai } from "./fabrique.ts";

let serveur: ServeurDEssai;
let lent: ServeurDEssai;
let espace: EspaceDEssai;
let espaceLent: EspaceDEssai;

beforeAll(async () => {
  [serveur, lent] = await Promise.all([
    demarrerServeurDEssai(),
    demarrerServeurDEssai({ reglages: { messagesParFenetre: 20 } }),
  ]);
  [espace, espaceLent] = await Promise.all([preparerUnEspace(serveur), preparerUnEspace(lent)]);
}, DELAI_SYNCHRO_MS);
afterEach(fermerLesClients);
afterAll(async () => {
  await Promise.all([serveur.fermer(), lent.fermer()]);
});

const page = (idEspace = espace.idEspace): string =>
  nomDeDocument({ type: "page", idEspace, idDocument: randomUUID() });

function presence(octetsDeTexte: number): Uint8Array {
  const etat = new Awareness(new Y.Doc());
  etat.setLocalState({ texte: "p".repeat(octetsDeTexte) });
  const octets = encodeAwarenessUpdate(etat, [etat.clientID]);
  etat.destroy();
  return octets;
}

async function ouvrir(surLe: ServeurDEssai, cookie: string, document: string): Promise<ClientBrut> {
  const client = await connecterBrut(surLe, { cookie });
  await client.ouvrirEtSynchroniser(document);
  return client;
}

// Le processus ne voit ni exception non interceptée ni rejet non géré pendant `travail`.
async function sansIncident(travail: () => Promise<void>): Promise<void> {
  const incidents: unknown[] = [];
  const noter = (incident: unknown): void => {
    incidents.push(incident);
  };
  process.on("uncaughtException", noter);
  process.on("unhandledRejection", noter);
  try {
    await travail();
    await pause(200);
  } finally {
    process.off("uncaughtException", noter);
    process.off("unhandledRejection", noter);
  }
  expect(incidents).toEqual([]);
}

describe("taille d'un message (F-012-AC22, AC33)", () => {
  it(
    "F-012-AC22 F-012-AC33 un message de plus de 5 Mio ferme la connexion par 1009 sans raison, sans atteindre la bibliothèque ; une trame mal formée n'arrête pas le processus",
    async () => {
      const document = page();
      const temoin = await ouvrir(serveur, espace.proprietaire.cookie, document);
      const fautif = await ouvrir(serveur, espace.editeur.cookie, document);
      const malForme = await connecterBrut(serveur, { cookie: espace.lecteur.cookie });

      await sansIncident(async () => {
        const doc = new Y.Doc();
        doc.getText("contenu").insert(0, "x".repeat(5 * 1024 * 1024));
        const enorme = brut.miseAJour(document, Y.encodeStateAsUpdate(doc));
        expect(enorme.byteLength).toBeGreaterThan(serveur.reglages.octetsParMessage);
        fautif.envoyer(enorme);
        expect(await fautif.fermeture).toEqual({ code: 1009, raison: "" });

        (malForme.prise as unknown as { _socket: Socket })._socket.write(
          Buffer.from([0x83, 0x80, 1, 2, 3, 4]),
        );
        expect((await malForme.fermeture).code).toBe(1002);
      });

      expect(texteDe(temoin.doc(document))).toBe("");
      const depuis = temoin.recus.length;
      temoin.envoyer(brut.miseAJour(document, miseAJourTexte("vivant", temoin.doc(document))));
      expect(await temoin.attendre((lu) => lu.type === "accuse", depuis)).toMatchObject({
        applique: true,
      });
      expect(
        (await connecterBrut(serveur, { cookie: espace.editeur.cookie })).prise.readyState,
      ).toBe(1);
      expect(
        serveur
          .lignesDuJournal()
          .some(
            (ligne) => ligne.type === "limite-atteinte" && ligne.motif === "message-trop-grand",
          ),
      ).toBe(true);
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("présence (F-012-AC25)", () => {
  it(
    "F-012-AC25 une présence est relayée aux seules ouvertures du même document, jamais stockée ; au-delà de 16 Kio elle est écartée sans rien fermer",
    async () => {
      const document = page();
      const emetteur = await ouvrir(serveur, espace.editeur.cookie, document);
      const meme = await ouvrir(serveur, espace.lecteur.cookie, document);
      const ailleurs = await ouvrir(serveur, espace.proprietaire.cookie, page());
      const depuisMeme = meme.recus.length;
      const depuisAilleurs = ailleurs.recus.length;

      const grande = brut.presence(document, presence(17 * 1024));
      expect(grande.byteLength).toBeGreaterThan(serveur.reglages.octetsParMessageDePresence);
      emetteur.envoyer(grande);
      await pause(300);
      expect(meme.depuis(depuisMeme)).toEqual([]);

      emetteur.envoyer(brut.presence(document, presence(10)));
      await meme.attendre((lu) => lu.type === "presence", depuisMeme);
      await pause(200);

      expect(meme.depuis(depuisMeme).map((lu) => lu.type)).toEqual(["presence"]);
      expect(ailleurs.depuis(depuisAilleurs)).toEqual([]);
      expect(emetteur.prise.readyState).toBe(1);
      expect(await serveur.lireInstantane(document)).toBeUndefined();
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("débit (F-012-AC25, AC37)", () => {
  it(
    "F-012-AC25 au-delà du plafond de messages dans la fenêtre, tous types confondus, la connexion est fermée par 1008 trop-de-requetes",
    async () => {
      const document = page(espaceLent.idEspace);
      const client = await ouvrir(lent, espaceLent.editeur.cookie, document);
      for (let rang = 0; rang < 30; rang += 1) {
        client.envoyer(
          rang % 2 === 0
            ? brut.presence(document, presence(1))
            : brut.miseAJour(document, miseAJourTexte(String(rang), client.doc(document))),
        );
      }

      expect(await client.fermeture).toEqual({ code: 1008, raison: "trop-de-requetes" });
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC25 F-012-AC37 un message écarté compte dans le débit ; une nouvelle fenêtre rend la place",
    async () => {
      const client = await connecterBrut(lent, { cookie: espaceLent.editeur.cookie });
      for (let rang = 0; rang < 20; rang += 1) {
        client.envoyer(brut.fermeture(page(espaceLent.idEspace)));
      }
      await pause(200);
      expect(client.prise.readyState).toBe(1);

      lent.horloge.avancer(lent.reglages.fenetreDesMessagesMs);
      for (let rang = 0; rang < 20; rang += 1) {
        client.envoyer(brut.fermeture(page(espaceLent.idEspace)));
      }
      await pause(200);
      expect(client.prise.readyState).toBe(1);

      client.envoyer(brut.fermeture(page(espaceLent.idEspace)));
      expect(await client.fermeture).toEqual({ code: 1008, raison: "trop-de-requetes" });
    },
    DELAI_SYNCHRO_MS,
  );
});
