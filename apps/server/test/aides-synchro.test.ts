// Tests des aides de synchronisation (F-046) : la fermeture des clients ne lève aucune erreur non
// gérée quand une prise est encore en cours de connexion (dette D-028).
// Critères de F-046 et ce que ce fichier en prouve (citations, pas de preuve nouvelle) :
// - F-046-AC1 : diagnostic et reproduction avant correction consignés dans MEMORY/features/F-046.md.
// - F-046-AC2 : les deux symptômes sont traités séparément, voir MEMORY/features/F-046.md.
// - F-046-AC4 : sans objet ici ; le symptôme du délai de 60 s n'est pas reproduit, voir MEMORY/features/F-046.md.
// - F-046-AC5 : la cause est dans les aides de test, pas dans apps/server/src ; le test de F-046-AC3 tient lieu de régression.
// - F-046-AC6 : aucun délai ni assertion modifié ; le constat est consigné dans MEMORY/features/F-046.md.
// - F-046-AC8 : les 20 passages de synchro-document.test.ts sont consignés dans MEMORY/features/F-046.md.
// - F-046-AC9 : vérifié par le dossier de revue (.agents/checks/dossier-revue.sh F-046).

import type { EventEmitter } from "node:events";
import { readdirSync, readFileSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import {
  attendreQue,
  fermerLesClients,
  fournisseur,
  pause,
  priseDeFournisseur,
} from "./aides-synchro.ts";
import type { ServeurDEssai } from "./fabrique.ts";

const ETAT_FERME = 3;
const ETAT_EN_CONNEXION = 0;

let ecoute: Server | undefined;
const connexions = new Set<Socket>();

// Un serveur TCP qui accepte la connexion mais ne répond jamais à la poignée de main : la prise
// du client reste en cours de connexion tant qu'on ne la ferme pas.
async function serveurMuet(): Promise<ServeurDEssai> {
  const serveur = createServer((connexion) => {
    connexions.add(connexion);
    connexion.on("error", () => undefined);
    connexion.resume();
    connexion.on("close", () => connexions.delete(connexion));
  });
  ecoute = serveur;
  await new Promise<void>((resolve) => serveur.listen(0, "127.0.0.1", resolve));
  const adresse = serveur.address();
  const port = typeof adresse === "object" && adresse !== null ? adresse.port : 0;
  return {
    urlDeSynchro: `ws://127.0.0.1:${String(port)}/synchro`,
    urlPublique: `http://127.0.0.1:${String(port)}`,
  } as ServeurDEssai;
}

afterEach(async () => {
  await fermerLesClients();
  for (const connexion of connexions) {
    connexion.destroy();
  }
  await new Promise<void>((resolve) =>
    ecoute === undefined ? resolve() : ecoute.close(() => resolve()),
  );
  ecoute = undefined;
});

describe("fermerLesClients (F-046-AC3, D-028)", () => {
  it("F-046-AC3 ferme une prise encore en cours de connexion sans erreur non gérée et la laisse close", async () => {
    const serveur = await serveurMuet();
    const prise = priseDeFournisseur(serveur, "session=essai");
    fournisseur(prise, "document-d-essai");
    await attendreQue(
      () => prise.webSocket?.readyState === ETAT_EN_CONNEXION && connexions.size === 1,
    );
    const socket = prise.webSocket;
    if (socket === null) {
      throw new Error("prise absente");
    }

    await fermerLesClients();
    // Le ws émet son erreur de fermeture au tick suivant : un rapport « Unhandled Errors » de
    // vitest tomberait pendant cette pause, et l'écouteur permanent la rend sans effet.
    await pause(100);

    expect(socket.readyState).toBe(ETAT_FERME);
    expect((socket as unknown as EventEmitter).listenerCount("error")).toBeGreaterThan(0);
    await attendreQue(() => connexions.size === 0);
  });

  it("F-046-AC3 fermer deux fois, ou une prise déjà close, ne lève rien", async () => {
    const serveur = await serveurMuet();
    const prise = priseDeFournisseur(serveur, "session=essai");
    fournisseur(prise, "document-d-essai");
    await attendreQue(() => prise.webSocket?.readyState === ETAT_EN_CONNEXION);

    await fermerLesClients();
    await fermerLesClients();
    await pause(100);

    expect(prise.webSocket).toBeNull();
  });
});

describe("couture des appelants de priseDeFournisseur (F-046-AC7)", () => {
  it("F-046-AC7 aucun appelant n'attend une erreur de prise non gérée, que l'écouteur permanent absorbe", () => {
    const dossier = new URL("./", import.meta.url);
    const appelants = readdirSync(dossier)
      .filter((nom) => nom.endsWith(".ts") && nom !== "aides-synchro.test.ts")
      .filter((nom) =>
        /priseDeFournisseur|fermerLesClients/.test(readFileSync(new URL(nom, dossier), "utf8")),
      );

    expect(appelants).toContain("synchro-document.test.ts");
    expect(appelants).toContain("synchro-connexion.test.ts");
    const dependants = appelants.filter((nom) =>
      /uncaughtException|unhandledRejection|\.on\("error"|\.once\("error"/.test(
        readFileSync(new URL(nom, dossier), "utf8"),
      ),
    );
    // Deux fichiers seulement touchent aux incidents : `synchro-limites` constate leur absence
    // (l'écouteur permanent ne peut qu'en retirer), `synchro-plafonds` écoute une requête HTTP sans
    // lien avec les prises du client. Un nouvel appelant doit être examiné ici.
    expect(dependants.filter((nom) => nom !== "aides-synchro.ts")).toEqual([
      "synchro-limites.test.ts",
      "synchro-plafonds.test.ts",
    ]);
  });
});
