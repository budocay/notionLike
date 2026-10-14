// Vie du serveur dans son processus (ADR-0006) : écoute, arrêt sur SIGTERM, sorties en échec. Le
// processus est reçu en dépendance, comme la base : ce fichier ne touche pas au `process` global.
import type { Base } from "@notionlike/db";
import type { DestinationStream } from "pino";

import { assembler, type Assemblage } from "./assemblage.ts";
import type { Configuration } from "./configuration.ts";
import { creerJournal, type Journal } from "./journal.ts";
import { demarrerServeur, type Ecoute } from "./serveur.ts";

// Deux secondes de marge sous les 10 secondes de F-008-AC7.
const DELAI_ARRET_MS = 8000;
const INITIALISATION_IMPOSSIBLE = "Initialisation impossible : le serveur ne démarre pas.";
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

interface Servi {
  readonly journal: Journal;
  readonly ecoute: Ecoute;
}

// F-008-AC25, AC26 : une phrase fixe, puis le code 1. L'objet d'erreur n'est écrit nulle part, ni
// ici ni dans le journal : il peut porter l'URL de connexion.
function sortirEnEchec(processus: ProcessusHebergeur, phrase: string): void {
  processus.stderr.write(`${phrase}\n`, () => {
    processus.exit(1);
  });
}

// L'écouteur de SIGTERM est posé avant toute étape du démarrage : aucun signal reçu pendant
// l'écoute ne tue le processus sans fermer la base. Reçu avant que le serveur serve, l'arrêt part
// dès qu'il sert ; reçu après un démarrage en échec, il ne fait rien, la sortie en échec étant
// déjà en route.
function installerLArret(processus: ProcessusHebergeur): (arreter: () => void) => void {
  let demande = false;
  let arreterLeServeur: (() => void) | undefined;
  processus.once("SIGTERM", () => {
    demande = true;
    arreterLeServeur?.();
  });
  return (arreter) => {
    arreterLeServeur = arreter;
    if (demande) {
      arreter();
    }
  };
}

// F-008-AC7 : plus de nouvelle connexion, les requêtes en cours finissent, la base est fermée, puis
// le processus se termine en code 0. La sortie est explicite : une base figée ne ferme jamais son
// côté des connexions, qui retiendraient le processus après l'adieu du pilote.
function arreter({ base, processus }: Lancement, hote: string, { journal, ecoute }: Servi): void {
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
}

// Rend le serveur qui sert, ou la phrase de son échec : aucune erreur d'initialisation ne sort
// d'ici, ni ne parvient à la sortie d'erreur.
async function demarrer({ configuration, base, processus }: Lancement): Promise<Servi | string> {
  let journal: Journal;
  let assemblage: Assemblage;
  try {
    journal = creerJournal(processus.stdout);
    // F-012-AC36 : la production n'assemble qu'avec les limites publiées, sans paramètre d'essai.
    assemblage = assembler({ configuration, base, journal });
  } catch {
    return INITIALISATION_IMPOSSIBLE;
  }
  const { hote, port } = configuration;
  const { application, synchronisation } = assemblage;
  return demarrerServeur({
    application,
    passage: synchronisation,
    hote,
    port,
    delaiArretMs: DELAI_ARRET_MS,
  }).then(
    (ecoute) => ({ journal, ecoute }),
    () => ECOUTE_IMPOSSIBLE,
  );
}

// Le serveur démarre même si la base est injoignable : GET /pret le dira.
export async function servir(lancement: Lancement): Promise<void> {
  const { configuration, base, processus } = lancement;
  const quandIlSert = installerLArret(processus);
  const servi = await demarrer(lancement);
  if (typeof servi === "string") {
    // F-008-AC25 : la base est fermée avant la sortie, que sa fermeture aboutisse ou non.
    await base.fermer().catch(() => undefined);
    sortirEnEchec(processus, servi);
    return;
  }
  servi.journal.ecoute(configuration.hote, servi.ecoute.port);
  quandIlSert(() => {
    arreter(lancement, configuration.hote, servi);
  });
}
