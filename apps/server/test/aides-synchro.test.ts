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
import WebSocket from "ws";

import {
  attendreQue,
  fermerLesClients,
  fournisseur,
  pause,
  priseDeFournisseur,
} from "./aides-synchro.ts";

let ecoute: Server | undefined;
const connexions = new Set<Socket>();

// Un serveur TCP qui accepte la connexion mais ne répond jamais à la poignée de main : la prise
// du client reste en cours de connexion tant qu'on ne la ferme pas.
async function serveurMuet(): Promise<{ urlDeSynchro: string; urlPublique: string }> {
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
  };
}

// Ouvre une prise qui reste en cours de connexion et rend son objet WebSocket.
async function priseEnConnexion(): Promise<{ socket: WebSocket }> {
  const serveur = await serveurMuet();
  const prise = priseDeFournisseur(serveur, "session=essai");
  fournisseur(prise, "document-d-essai");
  await attendreQue(
    () => prise.webSocket?.readyState === WebSocket.CONNECTING && connexions.size === 1,
  );
  const socket = prise.webSocket;
  if (socket === null) {
    throw new Error("prise absente");
  }
  return { socket: socket as unknown as WebSocket };
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
    const { socket } = await priseEnConnexion();

    await fermerLesClients();
    // Le ws émet son erreur de fermeture au tick suivant : un rapport « Unhandled Errors » de
    // vitest tomberait pendant cette pause. Sans le correctif de `close`, ce test échoue.
    await pause(100);

    expect(socket.readyState).toBe(WebSocket.CLOSED);
    // L'absorption est consommée : elle ne survit pas à la fermeture.
    expect((socket as EventEmitter).listenerCount("error")).toBe(0);
    await attendreQue(() => connexions.size === 0);
  });

  it("F-046-AC3 une autre erreur de prise, hors fermeture, reste visible", async () => {
    const { socket } = await priseEnConnexion();
    // Le fournisseur a retiré ses écouteurs à la destruction : on les retire ici pour constater
    // qu'aucun écouteur permanent de l'aide n'absorbe une erreur de prise.
    socket.removeAllListeners("error");
    const autre = new Error("erreur de protocole simulée");

    expect(() => socket.emit("error", autre)).toThrow(autre);

    const vues: Error[] = [];
    socket.on("error", (erreur) => vues.push(erreur));
    socket.emit("error", autre);
    expect(vues).toEqual([autre]);
  });

  it("F-046-AC3 une prise déjà close est laissée close, sans erreur, et plus aucune connexion ne reste", async () => {
    const { socket } = await priseEnConnexion();
    const incidents: unknown[] = [];
    const noter = (incident: unknown): void => {
      incidents.push(incident);
    };
    process.on("uncaughtException", noter);
    process.on("unhandledRejection", noter);
    try {
      socket.close();
      await attendreQue(() => socket.readyState === WebSocket.CLOSED);

      await fermerLesClients();
      await pause(100);

      expect(socket.readyState).toBe(WebSocket.CLOSED);
      expect(incidents).toEqual([]);
      await attendreQue(() => connexions.size === 0);
      // Les ensembles de l'aide sont vidés : un second appel ne retouche rien.
      await fermerLesClients();
      expect(socket.readyState).toBe(WebSocket.CLOSED);
    } finally {
      process.off("uncaughtException", noter);
      process.off("unhandledRejection", noter);
    }
  });
});

describe("couture des appelants de priseDeFournisseur (F-046-AC7)", () => {
  it("F-046-AC7 les incidents que constatent synchro-limites et synchro-plafonds ne passent pas par la prise corrigée", () => {
    const dossier = new URL("./", import.meta.url);
    const contenus = new Map(
      readdirSync(dossier)
        .filter((nom) => nom.endsWith(".ts") && nom !== "aides-synchro.test.ts")
        .map((nom) => [nom, readFileSync(new URL(nom, dossier), "utf8")] as const),
    );
    const utilisentLaPrise = [...contenus]
      .filter(([, texte]) => /priseDeFournisseur|fermerLesClients/.test(texte))
      .map(([nom]) => nom);
    expect(utilisentLaPrise).toContain("synchro-document.test.ts");
    expect(utilisentLaPrise).toContain("synchro-connexion.test.ts");

    // Seuls ces deux fichiers posent des écouteurs d'incident ; un nouveau doit être examiné ici.
    const observentDesIncidents = [...contenus]
      .filter(([nom]) => utilisentLaPrise.includes(nom))
      .filter(([, texte]) =>
        /uncaughtException|unhandledRejection|\.on\("error"|\.once\("error"/.test(texte),
      )
      .map(([nom]) => nom)
      .filter((nom) => nom !== "aides-synchro.ts");
    expect(observentDesIncidents).toEqual(["synchro-limites.test.ts", "synchro-plafonds.test.ts"]);

    // La classe corrigée n'existe que dans `priseDeFournisseur` (fournisseur Hocuspocus). Ces deux
    // fichiers n'ouvrent ni fournisseur ni prise de ce type : `synchro-limites` observe le
    // processus pendant des clients bruts (`connecterBrut`), `synchro-plafonds` une requête HTTP.
    // L'absorption n'est armée que par `close()` sur une prise en connexion (test ci-dessus), et
    // `fermerLesClients` n'y est appelé qu'en `afterEach`, hors des fenêtres d'observation.
    for (const nom of observentDesIncidents) {
      const texte = contenus.get(nom) ?? "";
      expect(texte).not.toMatch(/priseDeFournisseur|fournisseurSynchronise|\bfournisseur\(/);
      expect(texte).not.toMatch(/HocuspocusProvider/);
    }
    const limites = contenus.get("synchro-limites.test.ts") ?? "";
    const fenetre = limites.slice(
      limites.indexOf('process.on("uncaughtException"'),
      limites.indexOf('process.off("unhandledRejection"'),
    );
    expect(fenetre.length).toBeGreaterThan(0);
    expect(fenetre).not.toContain("fermerLesClients");
  });
});
