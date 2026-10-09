// Point d'entrée du processus (ADR-0006) : `node apps/server/src/main.ts`. C'est le seul fichier
// qui lit `process.env`, écoute les signaux et fixe le code de sortie.
import { ouvrirBase } from "@notionlike/db";

import { creerApplication } from "./application.ts";
import { ErreurConfiguration, lireConfiguration, type Configuration } from "./configuration.ts";
import { creerJournal } from "./journal.ts";
import { demarrerServeur } from "./serveur.ts";

// Deux secondes de marge sous les 10 secondes de F-008-AC7.
const DELAI_ARRET_MS = 8000;

// F-008-AC12 : le message nomme les variables fautives, sans leur valeur ; rien n'a écouté.
function configurationOuRefus(): Configuration | undefined {
  try {
    return lireConfiguration(process.env);
  } catch (erreur) {
    if (!(erreur instanceof ErreurConfiguration)) {
      throw erreur;
    }
    process.stderr.write(`${erreur.message}\n`);
    process.exitCode = 1;
    return undefined;
  }
}

// Le serveur démarre même si la base est injoignable : GET /pret le dira.
async function servir(configuration: Configuration): Promise<void> {
  const journal = creerJournal(process.stdout);
  const base = ouvrirBase(configuration.urlBaseDonnees);
  const application = creerApplication({ configuration, base, journal });
  const { hote } = configuration;
  const { port, arreter } = await demarrerServeur({
    application,
    hote,
    port: configuration.port,
    delaiArretMs: DELAI_ARRET_MS,
  });
  journal.ecoute(hote, port);
  // F-008-AC7 : plus de nouvelle connexion, les requêtes en cours finissent, la base est fermée,
  // puis le processus se termine en code 0. La sortie est explicite : une base figée ne ferme
  // jamais son côté des connexions, qui retiendraient le processus après l'adieu du pilote.
  process.once("SIGTERM", () => {
    void arreter()
      .then(() => base.fermer())
      .then(() => {
        journal.arret(hote, port);
        process.exit(0);
      });
  });
}

const configuration = configurationOuRefus();
if (configuration !== undefined) {
  await servir(configuration);
}
