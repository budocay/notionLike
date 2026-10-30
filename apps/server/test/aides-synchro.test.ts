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

// Liste fermée, triée, des fichiers de test qui atteignent la prise corrigée (voir la couture).
const APPELANTS: string[] = [
  "droits.test.ts",
  "synchro-arret.test.ts",
  "synchro-connexion.test.ts",
  "synchro-document.test.ts",
  "synchro-droits.test.ts",
  "synchro-fermetures.test.ts",
  "synchro-limites.test.ts",
  "synchro-ouverture.test.ts",
  "synchro-plafonds.test.ts",
  "synchro-reponse.test.ts",
  "synchro-reverification.test.ts",
  "synchro-sessions.test.ts",
  "synchro-stockage.test.ts",
];
// Ceux de ces fichiers qui posent un observateur d'incident (processus ou prise).
const OBSERVENT: string[] = ["synchro-limites.test.ts", "synchro-plafonds.test.ts"];

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
    await fermerLesClients();
    await pause(100);
    // Le fournisseur a retiré ses écouteurs et l'absorption de `close` est consommée : aucun
    // écouteur permanent de l'aide ne doit rester. Sinon cette erreur serait avalée au lieu d'être
    // levée par Node (aucun `removeAllListeners` ici, qui masquerait justement cet écouteur).
    const autre = new Error("erreur de protocole simulée");

    expect((socket as EventEmitter).listeners("error")).toEqual([]);
    expect(() => socket.emit("error", autre)).toThrow(autre);
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

// Noms exportés de aides-synchro.ts qui atteignent la prise corrigée, dérivés du code : on part de
// la construction de `PriseAvecCookie` (`priseDeFournisseur`), de l'ensemble qui la retient et du
// fournisseur officiel, puis on ajoute toute fonction exportée dont le corps cite un nom déjà retenu.
function aidesQuiAtteignentLaPrise(source: string): Set<string> {
  const exportees = [...source.matchAll(/^export (?:async )?function (\w+)/gm)].map(
    (m, i, tout) => ({
      nom: m[1] ?? "",
      corps: source.slice(m.index, tout[i + 1]?.index ?? source.length),
    }),
  );
  const atteignent = new Set<string>(["priseDeFournisseur", "prisesDeFournisseurs"]);
  for (const { nom, corps } of exportees) {
    if (/HocuspocusProvider/.test(corps)) atteignent.add(nom);
  }
  for (let change = true; change;) {
    change = false;
    for (const { nom, corps } of exportees) {
      if (!atteignent.has(nom) && [...atteignent].some((autre) => corps.includes(autre))) {
        atteignent.add(nom);
        change = true;
      }
    }
  }
  atteignent.delete("prisesDeFournisseurs");
  return atteignent;
}

function importsDe(texte: string, module: string): string[] {
  const motif = new RegExp(
    `import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s*from\\s*"\\./${module}\\.ts"`,
    "g",
  );
  return [...texte.matchAll(motif)].flatMap((m) =>
    (m[1] ?? "").split(",").map((nom) => (nom.trim().split(/\s+as\s+/)[0] ?? "").trim()),
  );
}

const OBSERVATEURS =
  /uncaughtException|unhandledRejection|\.on\("error"|\.once\("error"|addEventListener\("error"|onerror/;

describe("couture des appelants de priseDeFournisseur (F-046-AC7)", () => {
  it("F-046-AC7 les incidents que constatent synchro-limites et synchro-plafonds ne passent pas par la prise corrigée", () => {
    const dossier = new URL("./", import.meta.url);
    const contenus = new Map(
      readdirSync(dossier)
        .filter((nom) => nom.endsWith(".ts") && nom !== "aides-synchro.test.ts")
        .map((nom) => [nom, readFileSync(new URL(nom, dossier), "utf8")] as const),
    );
    const source = contenus.get("aides-synchro.ts") ?? "";
    expect(source, "aides-synchro.ts introuvable").not.toBe("");
    const atteignent = aidesQuiAtteignentLaPrise(source);
    // Garde-fou de la dérivation : ces aides atteignent la prise, sinon la dérivation est cassée.
    for (const nom of [
      "priseDeFournisseur",
      "fournisseur",
      "fournisseurSynchronise",
      "fermerLesClients",
    ]) {
      expect(atteignent.has(nom), `${nom} devrait atteindre la prise`).toBe(true);
    }

    // Fichiers qui importent une de ces aides, ou le fournisseur Hocuspocus directement.
    const appelants = [...contenus]
      .filter(([nom]) => nom !== "aides-synchro.ts")
      .filter(
        ([, texte]) =>
          importsDe(texte, "aides-synchro").some((nom) => atteignent.has(nom)) ||
          /@hocuspocus\/provider/.test(texte),
      )
      .map(([nom]) => nom)
      .sort();
    // Liste fermée : un appelant nouveau ou disparu fait échouer ce test et doit être examiné.
    expect(appelants).toEqual(APPELANTS);

    // Aucun appelant n'attend l'erreur que la prise corrigée absorbe.
    for (const nom of appelants) {
      expect(contenus.get(nom) ?? "", nom).not.toMatch(
        /closed before the connection was established/,
      );
    }

    // Parmi eux, ceux qui observent les incidents du processus ou des prises.
    const observent = appelants.filter((nom) => OBSERVATEURS.test(contenus.get(nom) ?? ""));
    expect(observent).toEqual(OBSERVENT);

    // La classe corrigée n'existe que dans `priseDeFournisseur`. Ces fichiers n'ouvrent ni
    // fournisseur ni prise de ce type ; l'absorption n'est armée que par `close()` sur une prise en
    // connexion, et `fermerLesClients` n'y est appelé qu'en `afterEach`, hors des fenêtres.
    for (const nom of observent) {
      const texte = contenus.get(nom) ?? "";
      expect(texte, nom).not.toMatch(/priseDeFournisseur|fournisseurSynchronise|\bfournisseur\(/);
      expect(texte, nom).not.toMatch(/HocuspocusProvider/);
    }
    const limites = contenus.get("synchro-limites.test.ts") ?? "";
    const debut = limites.indexOf('process.on("uncaughtException"');
    const fin = limites.indexOf('process.off("unhandledRejection"');
    expect(debut, "début de la fenêtre d'observation de synchro-limites introuvable").not.toBe(-1);
    expect(fin, "fin de la fenêtre d'observation de synchro-limites introuvable").not.toBe(-1);
    expect(fin, "fenêtre d'observation de synchro-limites à l'envers").toBeGreaterThan(debut);
    expect(limites.slice(debut, fin)).not.toContain("fermerLesClients");
  });
});
