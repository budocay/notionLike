// La commande de migration lancée par un vrai processus Node, sans compilation (F-008-AC15,
// F-008-AC17). C'est le seul passage de `pnpm test` par le point d'entrée `src/migrer.ts`.
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { demarrerFauxPostgres, portFerme } from "./essai.ts";

const COMMANDE = fileURLToPath(new URL("../src/migrer.ts", import.meta.url));
const MOT_DE_PASSE = "mot-de-passe-de-test";
const DELAI_MAXIMAL_DU_CAS_MS = 20_000;
const DUREE_MAXIMALE_AVEC_FERMETURE_MS = 5000;

interface Issue {
  readonly code: number | null;
  readonly sortie: string;
  readonly erreurs: string;
}

// Le dossier courant n'est ni le paquet ni la racine : la commande trouve seule son dossier de migrations.
function lancerLaCommande(environnement: Record<string, string>): Promise<Issue> {
  return new Promise((resolve, reject) => {
    const processus = spawn(process.execPath, [COMMANDE], {
      cwd: tmpdir(),
      env: environnement,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let sortie = "";
    let erreurs = "";
    processus.stdout.on("data", (morceau: Buffer) => {
      sortie += morceau.toString("utf8");
    });
    processus.stderr.on("data", (morceau: Buffer) => {
      erreurs += morceau.toString("utf8");
    });
    processus.on("error", reject);
    processus.on("close", (code) => {
      resolve({ code, sortie, erreurs });
    });
  });
}

describe("commande de migration", () => {
  it(
    "F-008-AC15 sans URL_BASE_DONNEES la commande finit en code 1 et nomme la variable",
    async () => {
      const issue = await lancerLaCommande({});

      expect(issue).toEqual({
        code: 1,
        sortie: "",
        erreurs: "La variable URL_BASE_DONNEES est absente.\n",
      });
    },
    DELAI_MAXIMAL_DU_CAS_MS,
  );

  it(
    "F-008-AC17 avec une URL invalide la commande finit en code 1 sans écrire l'URL",
    async () => {
      const url = `mysql://essai:${MOT_DE_PASSE}@127.0.0.1:3306/essai`;

      const issue = await lancerLaCommande({ URL_BASE_DONNEES: url });

      expect(issue).toEqual({
        code: 1,
        sortie: "",
        erreurs: "L'URL de connexion à la base est invalide.\n",
      });
    },
    DELAI_MAXIMAL_DU_CAS_MS,
  );

  it(
    "F-008-AC17 F-008-AC16 vers un port local fermé la commande finit en code 1 sans écrire l'URL ni le mot de passe",
    async () => {
      const port = await portFerme();
      const url = `postgres://essai:${MOT_DE_PASSE}@127.0.0.1:${port}/essai`;

      const issue = await lancerLaCommande({ URL_BASE_DONNEES: url });

      expect(issue.code).toBe(1);
      expect(issue.sortie).toBe("");
      expect(issue.erreurs).toMatch(/^La migration a échoué : /);
      expect(issue.erreurs).toContain("ECONNREFUSED");
      expect(issue.erreurs).not.toContain(url);
      expect(issue.erreurs).not.toContain(MOT_DE_PASSE);
    },
    DELAI_MAXIMAL_DU_CAS_MS,
  );

  it(
    "F-008-AC15 contre le faux serveur, qui termine toute requête sans ligne, la commande ferme ses connexions et finit en code 0, sans rien écrire",
    async () => {
      const faux = await demarrerFauxPostgres(MOT_DE_PASSE);
      const debut = performance.now();

      const issue = await lancerLaCommande({ URL_BASE_DONNEES: faux.url });

      expect(issue).toEqual({ code: 0, sortie: "", erreurs: "" });
      // Sans fermeture, le processus attendrait l'expiration des connexions inactives de la réserve.
      expect(performance.now() - debut).toBeLessThan(DUREE_MAXIMALE_AVEC_FERMETURE_MS);
      await faux.arreter();
    },
    DELAI_MAXIMAL_DU_CAS_MS,
  );
});
