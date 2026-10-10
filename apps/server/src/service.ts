// Vie du serveur dans son processus (ADR-0006) : écoute, arrêt sur SIGTERM, sorties en échec. Le
// processus est reçu en dépendance, comme la base : ce fichier ne touche pas au `process` global.
import type { Base } from "@notionlike/db";
import type { DestinationStream } from "pino";

import { creerApplication } from "./application.ts";
import type { Configuration } from "./configuration.ts";
import { creerJournal } from "./journal.ts";
import { demarrerServeur } from "./serveur.ts";

// Deux secondes de marge sous les 10 secondes de F-008-AC7.
const DELAI_ARRET_MS = 8000;
const ECOUTE_IMPOSSIBLE = "Écoute impossible sur l'adresse configurée : le serveur ne démarre pas.";
const ARRET_EN_ECHEC = "Arrêt en échec : le serveur n'a pas pu tout fermer.";

// Ce que le service demande au processus qui l'héberge ; `process` le satisfait.
interface ProcessusHebergeur {
  readonly stdout: DestinationStream;
  readonly stderr: { write(texte: string, ecrit: () => void): unknown };
  once(signal: "SIGTERM", ecouteur: () => void): unknown;
  exit(code: number): unknown;
}

interface Lancement {
  readonly configuration: Configuration;
  readonly base: Base;
  readonly processus: ProcessusHebergeur;
}

// F-008-AC25, AC26 : une phrase fixe, puis le code 1. L'objet d'erreur n'est écrit nulle part, ni
// ici ni dans le journal : il peut porter l'URL de connexion.
function sortirEnEchec(processus: ProcessusHebergeur, phrase: string): void {
  processus.stderr.write(`${phrase}\n`, () => {
    processus.exit(1);
  });
}

// Le serveur démarre même si la base est injoignable : GET /pret le dira.
export async function servir({ configuration, base, processus }: Lancement): Promise<void> {
  const journal = creerJournal(processus.stdout);
  const { hote } = configuration;
  const ecoute = await demarrerServeur({
    application: creerApplication({ configuration, base, journal }),
    hote,
    port: configuration.port,
    delaiArretMs: DELAI_ARRET_MS,
  }).catch(() => undefined);
  if (ecoute === undefined) {
    // F-008-AC25 : la base est fermée avant la sortie, que sa fermeture aboutisse ou non.
    await base.fermer().catch(() => undefined);
    sortirEnEchec(processus, ECOUTE_IMPOSSIBLE);
    return;
  }
  journal.ecoute(hote, ecoute.port);
  // F-008-AC7 : plus de nouvelle connexion, les requêtes en cours finissent, la base est fermée,
  // puis le processus se termine en code 0. La sortie est explicite : une base figée ne ferme
  // jamais son côté des connexions, qui retiendraient le processus après l'adieu du pilote.
  processus.once("SIGTERM", () => {
    void ecoute
      .arreter()
      .then(() => base.fermer())
      .then(() => {
        journal.arret(hote, ecoute.port);
        processus.exit(0);
      })
      .catch(() => {
        sortirEnEchec(processus, ARRET_EN_ECHEC);
      });
  });
}
