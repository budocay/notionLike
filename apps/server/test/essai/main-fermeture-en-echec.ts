// Entrée d'essai de F-008-AC26, lancée par `processus.test.ts` comme `src/main.ts` l'est en
// production : le même service, avec une base dont la fermeture rejette par une erreur qui porte
// l'URL de connexion, comme le ferait une erreur du pilote.
import { ouvrirBase } from "@notionlike/db";

import { lireConfiguration } from "../../src/configuration.ts";
import { servir } from "../../src/service.ts";

const configuration = lireConfiguration(process.env);
const reelle = ouvrirBase(configuration.urlBaseDonnees);

await servir({
  configuration,
  base: {
    db: reelle.db,
    sonder: () => reelle.sonder(),
    fermer: async () => {
      await reelle.fermer();
      throw new Error(`fermeture en échec de ${configuration.urlBaseDonnees}`);
    },
  },
  processus: process,
});
