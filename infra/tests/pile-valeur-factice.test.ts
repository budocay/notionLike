// Couture de la valeur factice du mot de passe (F-031-AC9, AC14) : infra/pile.sh en recopie la valeur
// (MOT_DE_PASSE_FACTICE), qui doit rester celle d'apps/server/src/configuration.ts et celle de
// POSTGRES_PASSWORD d'infra/.env.example. Si l'une change seule, pile.sh cesserait en silence de
// refuser le mot de passe de l'exemple, et un volume serait initialisé avec un mot de passe que le
// serveur refuse ensuite (incident 2). Les trois fichiers sont lus comme du texte par ce test.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type Arbre,
  creerArbre,
  DELAI_D_UN_TEST_MS,
  DEPOT,
  ecrire,
  ENV_INFRA,
  lancer,
  poserLesFichiers,
  supprimerArbre,
} from "./aides-pile.ts";
import { lireExemple } from "./regles/exemples.ts";

vi.setConfig({ testTimeout: DELAI_D_UN_TEST_MS });

const SCRIPT = "infra/pile.sh";
const CONFIGURATION = "apps/server/src/configuration.ts";
const EXEMPLE = "infra/.env.example";
const DANS_LE_SCRIPT = /^MOT_DE_PASSE_FACTICE="([^"]*)"$/m;
const DANS_LA_CONFIGURATION = /^export const MOT_DE_PASSE_FACTICE = "([^"]*)";$/m;

interface Textes {
  readonly script: string;
  readonly configuration: string;
  readonly exemple: string;
}

const lire = (chemin: string): string => readFileSync(join(DEPOT, chemin), "utf8");

/** Écarts entre les trois valeurs factices ; les constats ne recopient aucune valeur. */
function ecartsDeLaValeurFactice({ script, configuration, exemple }: Textes): string[] {
  const valeurs: readonly (readonly [string, string | undefined])[] = [
    [`${SCRIPT} (MOT_DE_PASSE_FACTICE)`, DANS_LE_SCRIPT.exec(script)?.[1]],
    [`${CONFIGURATION} (MOT_DE_PASSE_FACTICE)`, DANS_LA_CONFIGURATION.exec(configuration)?.[1]],
    [
      `${EXEMPLE} (POSTGRES_PASSWORD)`,
      lireExemple(exemple).find(({ cle }) => cle === "POSTGRES_PASSWORD")?.valeur,
    ],
  ];
  const absentes = valeurs.flatMap(([nom, valeur]) =>
    valeur === undefined || valeur === "" ? [`${nom} : valeur introuvable`] : [],
  );
  if (absentes.length > 0) return absentes;
  const [[reference, attendue] = ["", ""], ...autres] = valeurs;
  return autres.flatMap(([nom, valeur]) =>
    valeur === attendue ? [] : [`${nom} : diffère de ${reference}`],
  );
}

const textesDuDepot = (): Textes => ({
  script: lire(SCRIPT),
  configuration: lire(CONFIGURATION),
  exemple: lire(EXEMPLE),
});

describe("couture de la valeur factice du mot de passe", () => {
  it("F-031-AC9 la valeur factice de pile.sh est celle de configuration.ts et de POSTGRES_PASSWORD d'infra/.env.example", () => {
    expect(ecartsDeLaValeurFactice(textesDuDepot())).toEqual([]);
  });

  it("F-031-AC9 cas fautif : une valeur divergente ou introuvable dans l'un des trois fichiers est vue", () => {
    const depot = textesDuDepot();
    const divergente = (texte: string): string =>
      texte.replace(/factice-a-remplacer/, "factice-a-changer");

    expect(ecartsDeLaValeurFactice({ ...depot, script: divergente(depot.script) })).toEqual([
      `${CONFIGURATION} (MOT_DE_PASSE_FACTICE) : diffère de ${SCRIPT} (MOT_DE_PASSE_FACTICE)`,
      `${EXEMPLE} (POSTGRES_PASSWORD) : diffère de ${SCRIPT} (MOT_DE_PASSE_FACTICE)`,
    ]);
    expect(
      ecartsDeLaValeurFactice({ ...depot, configuration: divergente(depot.configuration) }),
    ).toEqual([
      `${CONFIGURATION} (MOT_DE_PASSE_FACTICE) : diffère de ${SCRIPT} (MOT_DE_PASSE_FACTICE)`,
    ]);
    expect(ecartsDeLaValeurFactice({ ...depot, exemple: divergente(depot.exemple) })).toEqual([
      `${EXEMPLE} (POSTGRES_PASSWORD) : diffère de ${SCRIPT} (MOT_DE_PASSE_FACTICE)`,
    ]);
    expect(
      ecartsDeLaValeurFactice({
        ...depot,
        script: depot.script.replace(DANS_LE_SCRIPT, "MOT_FACTICE=autre"),
      }),
    ).toEqual([`${SCRIPT} (MOT_DE_PASSE_FACTICE) : valeur introuvable`]);
  });

  describe("par le script", () => {
    let arbre: Arbre;

    beforeEach(() => {
      arbre = creerArbre();
    });

    afterEach(() => {
      supprimerArbre(arbre);
    });

    it("F-031-AC9 infra/.env copié tel quel de l'exemple : demarrer refuse la valeur factice avant tout lancement", () => {
      poserLesFichiers(arbre);
      ecrire(arbre, ENV_INFRA, lire(EXEMPLE));

      const resultat = lancer(arbre, ["demarrer"]);

      expect(resultat.code).not.toBe(0);
      expect(resultat.erreur).toContain(
        "POSTGRES_PASSWORD de infra/.env refusé : valeur factice de l'exemple.",
      );
      expect(resultat.appels).toEqual(["docker info", "docker compose version --short"]);
    });
  });
});
