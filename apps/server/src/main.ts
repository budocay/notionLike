// Point d'entrée du processus (ADR-0006) : `node apps/server/src/main.ts`. C'est le seul fichier
// qui touche au `process` global : il lit `process.env`, ouvre la base et confie le processus au
// service, qui écoute le signal d'arrêt et fixe le code de sortie par lui.
import { ouvrirBase } from "@notionlike/db";

import { ErreurConfiguration, lireConfiguration, type Configuration } from "./configuration.ts";
import { servir } from "./service.ts";

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

const configuration = configurationOuRefus();
if (configuration !== undefined) {
  await servir({
    configuration,
    base: ouvrirBase(configuration.urlBaseDonnees),
    processus: process,
  });
}
