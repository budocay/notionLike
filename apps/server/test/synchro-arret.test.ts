// Arrêt du serveur avec la synchronisation (F-012-AC31, AC34) : plus de connexion acceptée, les
// instantanés en attente enregistrés (un essai pour une relance en cours), les documents déchargés,
// chaque WebSocket fermée par 1001, sous le délai de F-008-AC7, sans autre gestionnaire de signal.
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

import { nomDeDocument } from "@notionlike/contrats";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  attendreQue,
  brut,
  connecter,
  connecterBrut,
  DELAI_SYNCHRO_MS,
  fermerLesClients,
  miseAJourTexte,
  preparerUnEspace,
  texteDe,
} from "./aides-synchro.ts";
import { demarrerServeurDEssai } from "./fabrique.ts";

const SRC = new URL("../src/", import.meta.url);

afterEach(fermerLesClients);

async function texteStocke(lu: Uint8Array | undefined): Promise<string | undefined> {
  if (lu === undefined) {
    return undefined;
  }
  const relu = new Y.Doc();
  Y.applyUpdate(relu, lu);
  return texteDe(relu);
}

describe("arrêt (F-012-AC31)", () => {
  it(
    "F-012-AC31 F-012-AC34 à l'arrêt, l'instantané en attente et celui d'une relance en cours sont enregistrés, puis chaque WebSocket est fermée par 1001, sous 10 secondes",
    async () => {
      let pannes = 0;
      const serveur = await demarrerServeurDEssai({
        defaillance: (operation) => {
          if (operation === "enregistrement" && pannes > 0) {
            pannes -= 1;
            throw new Error("panne");
          }
        },
      });
      try {
        const espace = await preparerUnEspace(serveur);
        const enRelance = nomDeDocument({
          type: "page",
          idEspace: espace.idEspace,
          idDocument: randomUUID(),
        });
        const enAttente = nomDeDocument({
          type: "page",
          idEspace: espace.idEspace,
          idDocument: randomUUID(),
        });
        const client = await connecterBrut(serveur, { cookie: espace.editeur.cookie });
        await client.ouvrirEtSynchroniser(enRelance);
        await client.ouvrirEtSynchroniser(enAttente);
        pannes = 1;
        client.envoyer(brut.miseAJour(enRelance, miseAJourTexte("relancé", client.doc(enRelance))));
        await attendreQue(
          () => serveur.lignesDuJournal().some((ligne) => ligne.type === "enregistrement-en-echec"),
          5000,
        );
        client.envoyer(
          brut.miseAJour(enAttente, miseAJourTexte("en attente", client.doc(enAttente))),
        );
        await attendreQue(() => client.recus.filter((lu) => lu.type === "accuse").length >= 2);

        // La fenêtre d'enregistrement de 2 secondes n'est pas écoulée : l'instantané est en attente.
        expect(await serveur.lireInstantane(enAttente)).toBeUndefined();
        const debut = Date.now();
        await serveur.arreter();

        expect(Date.now() - debut).toBeLessThan(10_000);
        expect(await client.fermeture).toEqual({ code: 1001, raison: "" });
        expect(client.recus.filter((lu) => lu.type === "fermeture")).toEqual([]);
        expect(await texteStocke(await serveur.lireInstantane(enRelance))).toBe("relancé");
        expect(await texteStocke(await serveur.lireInstantane(enAttente))).toBe("en attente");
        expect((await connecter(serveur, { cookie: espace.editeur.cookie })).issue).toBe("refusee");
      } finally {
        await serveur.fermer();
      }
    },
    DELAI_SYNCHRO_MS,
  );

  it("F-012-AC31 aucun autre gestionnaire de signal que celui du service, et la classe Server de la bibliothèque n'est pas employée", () => {
    const sources = readdirSync(SRC).map((nom) => [nom, readFileSync(new URL(nom, SRC), "utf8")]);

    expect(
      sources.filter(([, texte]) => /SIG(TERM|INT|QUIT)/.test(texte ?? "")).map(([nom]) => nom),
    ).toEqual(["service.ts"]);
    expect(
      sources.filter(([, texte]) =>
        /\bnew Server\(|\bServer\b.*from "@hocuspocus/.test(texte ?? ""),
      ),
    ).toEqual([]);
  });
});
