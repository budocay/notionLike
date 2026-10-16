// Mot de passe désaccordé avec le volume (F-031-AC20 à AC23) : `demarrer` l'éprouve, `accorder` le
// remet en accord ; `docker` de substitution, dont le volume garde le mot de passe de sa création.
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ANCIEN_MOT_DE_PASSE,
  type Arbre,
  CONTENEURS_EN_MARCHE,
  creerArbre,
  ecrire,
  ENV_INFRA,
  ENV_SERVEUR,
  lancer,
  lireEtat,
  MOT_DE_PASSE,
  poserEtat,
  poserLesFichiers,
  supprimerArbre,
} from "./aides-pile.ts";

const EPREUVE =
  "exec -T -e PGPASSWORD base psql -h base -U notionlike -d notionlike -w -At -c select 1";
const REMISE_EN_ACCORD =
  "exec -T base psql -U notionlike -d notionlike -v ON_ERROR_STOP=1 -q -c \\password notionlike";
const RECU_PAR_L_ENVIRONNEMENT = "docker : PGPASSWORD reçu par son environnement";

let arbre: Arbre;

beforeEach(() => {
  arbre = creerArbre();
});

afterEach(() => {
  supprimerArbre(arbre);
});

const appelsDe = (appels: readonly string[], motif: string): string[] =>
  appels.filter((appel) => appel.includes(motif));

function volumeInitialiseAvec(motDePasse: string): void {
  poserEtat(arbre, "volume");
  poserEtat(arbre, "mdp-volume", motDePasse);
}

describe("épreuve du mot de passe par demarrer", () => {
  it("F-031-AC20 volume initialisé avec un autre mot de passe : la base seule démarrée, épreuve par TCP refusée, ni migration ni serveur, cause et issues dites", () => {
    poserLesFichiers(arbre);
    volumeInitialiseAvec(ANCIEN_MOT_DE_PASSE);

    const resultat = lancer(arbre, ["demarrer"]);

    expect(resultat.code).not.toBe(0);
    expect(appelsDe(resultat.appels, "up -d --wait base")).toHaveLength(1);
    expect(appelsDe(resultat.appels, EPREUVE)).toHaveLength(1);
    expect(resultat.appels).toContain(RECU_PAR_L_ENVIRONNEMENT);
    expect(appelsDe(resultat.appels, "up -d --wait --build")).toEqual([]);
    expect(resultat.erreur).toContain("La base refuse POSTGRES_PASSWORD de infra/.env");
    expect(resultat.erreur).toContain("que PostgreSQL ne relit jamais");
    expect(resultat.erreur).toContain("remettre l'ancien mot de passe dans infra/.env");
    expect(resultat.erreur).toContain("pnpm -w pile accorder");
    expect(resultat.erreur).toContain(
      "Ne pas supprimer le volume des données : cela efface la base",
    );
  });

  it("F-031-AC20 la base trouvée arrêtée y revient ; trouvée en marche, elle y reste", () => {
    poserLesFichiers(arbre);
    volumeInitialiseAvec(ANCIEN_MOT_DE_PASSE);
    const arretee = lancer(arbre, ["demarrer"]);
    poserEtat(arbre, "conteneurs", CONTENEURS_EN_MARCHE);
    const enMarche = lancer(arbre, ["demarrer"]);

    expect(appelsDe(arretee.appels, " stop base")).toHaveLength(1);
    expect(appelsDe(enMarche.appels, " stop ")).toEqual([]);
  });

  it("F-031-AC20 le volume est constaté avant la vérification de la configuration, l'épreuve après", () => {
    poserLesFichiers(arbre);
    volumeInitialiseAvec(MOT_DE_PASSE);

    const resultat = lancer(arbre, ["demarrer"]);
    const rang = (motif: string): number =>
      resultat.appels.findIndex((appel) => appel.includes(motif));

    expect(resultat.code).toBe(0);
    expect(rang("volume inspect")).toBeLessThan(rang("verifier-configuration.ts"));
    expect(rang("verifier-configuration.ts")).toBeLessThan(rang(EPREUVE));
    expect(rang(EPREUVE)).toBeLessThan(rang("up -d --wait --build"));
  });

  it("F-031-AC20 sans volume, aucune épreuve : la base l'initialise avec le mot de passe d'infra/.env", () => {
    poserLesFichiers(arbre);

    const resultat = lancer(arbre, ["demarrer"]);

    expect(resultat.code).toBe(0);
    expect(appelsDe(resultat.appels, EPREUVE)).toEqual([]);
    expect(lireEtat(arbre, "mdp-volume")).toBe(MOT_DE_PASSE);
  });
});

describe("accorder", () => {
  it("F-031-AC21 donne au rôle le mot de passe d'infra/.env par la connexion locale, sans l'ancien, puis demarrer finit en code 0", () => {
    poserLesFichiers(arbre);
    volumeInitialiseAvec(ANCIEN_MOT_DE_PASSE);

    const accord = lancer(arbre, ["accorder"]);
    const demarrage = lancer(arbre, ["demarrer"]);

    expect(accord.code).toBe(0);
    expect(appelsDe(accord.appels, REMISE_EN_ACCORD)).toHaveLength(1);
    expect(appelsDe(accord.appels, EPREUVE)).toHaveLength(2);
    expect(lireEtat(arbre, "mdp-volume")).toBe(MOT_DE_PASSE);
    expect(accord.sortie).toContain("Mot de passe de infra/.env accordé au rôle notionlike");
    expect(appelsDe(accord.appels, " stop base")).toHaveLength(1);
    expect(demarrage.code).toBe(0);
  });

  it("F-031-AC21 mot de passe déjà accordé : code 0, dit, rien modifié ; la base trouvée en marche y reste", () => {
    poserLesFichiers(arbre);
    volumeInitialiseAvec(MOT_DE_PASSE);
    poserEtat(arbre, "conteneurs", CONTENEURS_EN_MARCHE);

    const resultat = lancer(arbre, ["accorder"]);

    expect(resultat.code).toBe(0);
    expect(resultat.sortie).toContain("déjà accordé au volume des données : rien n'est modifié");
    expect(appelsDe(resultat.appels, "\\password")).toEqual([]);
    expect(appelsDe(resultat.appels, " stop ")).toEqual([]);
  });

  it("F-031-AC22 le mot de passe remis en accord ne passe que par l'entrée standard de psql, jamais en argument ni sur les sorties", () => {
    poserLesFichiers(arbre);
    volumeInitialiseAvec(ANCIEN_MOT_DE_PASSE);

    const resultat = lancer(arbre, ["accorder"]);
    const textes = [resultat.sortie, resultat.erreur, ...resultat.appels].join("\n");

    expect(resultat.code).toBe(0);
    expect(lireEtat(arbre, "mdp-volume")).toBe(MOT_DE_PASSE);
    expect(textes).not.toContain(MOT_DE_PASSE.slice(0, 4));
    expect(textes).not.toContain(ANCIEN_MOT_DE_PASSE.slice(0, 4));
  });

  const SCENARIOS: Readonly<Record<string, () => void>> = {
    "sans-volume": () => {
      rmSync(join(arbre.etat, "volume"));
    },
    "sans-infra": () => {
      rmSync(join(arbre.racine, ENV_INFRA));
    },
    factice: () => {
      ecrire(arbre, ENV_INFRA, "POSTGRES_PASSWORD=factice-a-remplacer\n");
    },
    caractere: () => {
      ecrire(arbre, ENV_INFRA, "POSTGRES_PASSWORD=abc:def\n");
    },
    "sans-serveur": () => {
      rmSync(join(arbre.racine, ENV_SERVEUR));
    },
  };

  it.each([
    [
      "sans volume des données",
      "sans-volume",
      "Aucun volume des données (notionlike_donnees-base) : rien à accorder.",
    ],
    [
      "sans infra/.env",
      "sans-infra",
      "infra/.env absent : il n'y a pas de mot de passe à accorder.",
    ],
    [
      "avec le mot de passe factice",
      "factice",
      "POSTGRES_PASSWORD de infra/.env refusé : valeur factice de l'exemple.",
    ],
    [
      "avec un caractère refusé",
      "caractere",
      "POSTGRES_PASSWORD de infra/.env refusé : caractère hors de",
    ],
    ["sans apps/server/.env", "sans-serveur", "apps/server/.env absent : Compose l'exige"],
  ])(
    "F-031-AC23 accorder %s : code non nul, cause nommée, ni volume créé ni conteneur démarré",
    (_cas, scenario, message) => {
      poserLesFichiers(arbre);
      volumeInitialiseAvec(ANCIEN_MOT_DE_PASSE);
      SCENARIOS[scenario]?.();

      const resultat = lancer(arbre, ["accorder"]);

      expect(resultat.code).not.toBe(0);
      expect(resultat.erreur).toContain(message);
      expect(appelsDe(resultat.appels, " up ")).toEqual([]);
      expect(appelsDe(resultat.appels, " exec ")).toEqual([]);
      expect(existsSync(join(arbre.etat, "volume"))).toBe(scenario !== "sans-volume");
    },
  );
});
