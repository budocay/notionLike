// Commande de la pile (F-031) : points d'entrée, aide, état, arrêt, secrets et compatibilité bash 3.2.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ANCIEN_MOT_DE_PASSE,
  type Arbre,
  CONTENEURS_EN_MARCHE,
  creerArbre,
  DELAI_DES_TESTS_DE_LA_PILE_MS,
  DEPOT,
  ecrire,
  ENV_INFRA,
  ENV_SERVEUR,
  lancer,
  lire,
  MOT_DE_PASSE,
  poserCommande,
  poserEtat,
  poserLesFichiers,
  type Resultat,
  retirerCommande,
  SECRET,
  SOUS_COMMANDES,
  supprimerArbre,
  variables,
  DELAI_D_UN_TEST_MS,
} from "./aides-pile.ts";

vi.setConfig({ testTimeout: DELAI_D_UN_TEST_MS });
import { constatsBash4 } from "./regles/bash.ts";
import { constatsSyntaxe } from "./regles/fumee.ts";
import { constatsSuppressionDuVolume, fichiersSurveilles } from "./regles/retention.ts";

const texteDuScript = readFileSync(join(DEPOT, "infra/pile.sh"), "utf8");
const LIGNE_DE_L_AIDE = /^ {2}([a-z]+) {2,}/;
const SUPPRESSION_DE_VOLUME = /(?:^|\s)(?:-v|--volumes)(?:\s|$)|volume (?:rm|remove)|prune/;

let arbre: Arbre;

beforeEach(() => {
  arbre = creerArbre();
});

afterEach(() => {
  supprimerArbre(arbre);
});

function sousCommandesDeLAide(texte: string): string[] {
  return texte.split("\n").flatMap((ligne) => LIGNE_DE_L_AIDE.exec(ligne)?.[1] ?? []);
}

describe("points d'entrée", () => {
  it.each(["apps/server", "infra", "apps", "."])(
    "F-031-AC1 pnpm -w pile aide depuis %s exécute infra/pile.sh et liste les six sous-commandes",
    (dossier) => {
      const resultat = spawnSync("pnpm", ["-w", "pile", "aide"], {
        cwd: join(DEPOT, dossier),
        encoding: "utf8",
        timeout: DELAI_DES_TESTS_DE_LA_PILE_MS,
      });

      expect(resultat.status).toBe(0);
      expect(sousCommandesDeLAide(resultat.stdout)).toEqual(SOUS_COMMANDES);
    },
  );

  it("F-031-AC1 les scripts pile et fumee du package.json racine lancent infra/pile.sh et infra/fumee.sh", () => {
    const { scripts } = JSON.parse(readFileSync(join(DEPOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(scripts.pile).toBe("bash infra/pile.sh");
    expect(scripts.fumee).toBe("bash infra/fumee.sh");
  });

  it("F-031-AC1 la racine est résolue depuis le script, pas depuis le dossier de lancement", () => {
    const resultat = spawnSync("/bin/bash", [join(arbre.racine, "infra/pile.sh"), "preparer"], {
      cwd: arbre.dossier,
      encoding: "utf8",
      env: { PATH: arbre.bin, TMPDIR: join(arbre.dossier, "tmp") },
    });

    expect(resultat.status).toBe(0);
    expect(statSync(join(arbre.racine, ENV_INFRA)).isFile()).toBe(true);
    expect(readdirSync(arbre.dossier).sort()).toEqual(["bin", "depot", "etat", "journal", "tmp"]);
  });

  it.each([[[]], [["inconnue"]], [["demarer"]]])(
    "F-031-AC2 sous-commande absente ou inconnue (%j) : code non nul, la liste sur la sortie d'erreur, aucun appel à docker",
    (argumentsDuScript) => {
      const resultat = lancer(arbre, argumentsDuScript);

      expect(resultat.code).not.toBe(0);
      expect(sousCommandesDeLAide(resultat.erreur)).toEqual(SOUS_COMMANDES);
      expect(resultat.sortie).toBe("");
      expect(resultat.appels).toEqual([]);
    },
  );
});

describe("arreter", () => {
  const constaterArret = (resultat: Resultat): void => {
    expect(resultat.code).toBe(0);
    expect(resultat.sortie).toContain("volume des données notionlike_donnees-base gardé");
    expect(resultat.appels).toContain("docker compose -p notionlike down");
    expect(resultat.appels.filter((appel) => SUPPRESSION_DE_VOLUME.test(appel))).toEqual([]);
  };

  it("F-031-AC24 sans fichiers de configuration ni pile en marche : arrêt en code 0, volume gardé, aucune option qui supprime un volume", () => {
    constaterArret(lancer(arbre, ["arreter"]));
  });

  it("F-031-AC24 fichiers présents et pile en marche : même arrêt, sans fichier Compose ni secret à lire", () => {
    poserLesFichiers(arbre);
    poserEtat(arbre, "conteneurs", CONTENEURS_EN_MARCHE);
    poserEtat(arbre, "volume");

    constaterArret(lancer(arbre, ["arreter"]));
  });

  it("F-031-AC24 Docker absent ou démon arrêté : code 0, rien ne tourne, le volume est gardé", () => {
    poserEtat(arbre, "sans-demon");
    const demonArrete = lancer(arbre, ["arreter"]);
    retirerCommande(arbre, "docker");
    const sansDocker = lancer(arbre, ["arreter"]);

    for (const resultat of [demonArrete, sansDocker]) {
      expect(resultat.code).toBe(0);
      expect(resultat.sortie).toContain("Le volume des données notionlike_donnees-base est gardé.");
    }
    expect(sansDocker.appels).toEqual([]);
  });

  it("F-031-AC24 retention.test.ts lit infra/pile.sh et la surcharge de vérification, qui ne suppriment aucun volume", () => {
    const dossierInfra = join(DEPOT, "infra");
    const fichiers = fichiersSurveilles(dossierInfra);

    expect(fichiers).toEqual(expect.arrayContaining(["pile.sh", "verification-configuration.yml"]));
    expect(constatsSuppressionDuVolume("pile.sh", texteDuScript)).toEqual([]);
    expect(
      constatsSuppressionDuVolume("pile.sh", "docker compose -p notionlike down -v\n"),
    ).toEqual(["pile.sh:1 : down supprime les volumes (-v, --volumes)"]);
  });
});

describe("etat", () => {
  it("F-031-AC25 fichiers absents, rien ne tourne : chaque service, aucun serveur ne répond, volume absent, adresse du client, code 0", () => {
    poserEtat(arbre, "pret", "000");

    const resultat = lancer(arbre, ["etat"]);

    expect(resultat.code).toBe(0);
    for (const service of ["base", "migration", "serveur"]) {
      expect(resultat.sortie).toContain(`  ${service} : aucun conteneur`);
    }
    expect(resultat.sortie).toContain("GET /pret sur le port 3000 : aucun serveur ne répond.");
    expect(resultat.sortie).toContain("Volume des données notionlike_donnees-base : absent.");
    expect(resultat.sortie).toContain("Client : http://127.0.0.1:5173");
    expect(resultat.appels).toContain(
      "curl -s -o /dev/null -w %{http_code} --max-time 3 http://127.0.0.1:3000/pret",
    );
  });

  it("F-031-AC25 pile en marche sur un port publié réglé : états des services, code de /pret, volume présent", () => {
    poserLesFichiers(arbre);
    ecrire(arbre, ENV_INFRA, `POSTGRES_PASSWORD=${MOT_DE_PASSE}\nPORT_PUBLIE_SERVEUR=3100\n`);
    poserEtat(arbre, "conteneurs", CONTENEURS_EN_MARCHE);
    poserEtat(arbre, "volume");
    poserEtat(arbre, "pret", "503");

    const resultat = lancer(arbre, ["etat"]);

    expect(resultat.code).toBe(0);
    expect(resultat.sortie).toContain("  base : running|Up 2 minutes (healthy)");
    expect(resultat.sortie).toContain("  migration : exited|Exited (0) 2 minutes ago");
    expect(resultat.sortie).toContain("GET /pret sur le port 3100 : 503.");
    expect(resultat.sortie).toContain("Volume des données notionlike_donnees-base : présent.");
  });

  it("F-031-AC25 Docker absent ou démon arrêté : l'état le dit et finit en code 0", () => {
    poserEtat(arbre, "sans-demon");
    const demonArrete = lancer(arbre, ["etat"]);
    retirerCommande(arbre, "docker");
    const sansDocker = lancer(arbre, ["etat"]);

    expect(demonArrete.code).toBe(0);
    expect(demonArrete.sortie).toContain("Docker : le démon ne répond pas.");
    expect(sansDocker.code).toBe(0);
    expect(sansDocker.sortie).toContain("Docker : absent du PATH.");
  });
});

// Chaque secret, entier ou par segment de quatre caractères, absent d'un texte.
function fuites(texte: string, secrets: readonly string[]): string[] {
  return secrets.flatMap((secret) =>
    Array.from({ length: secret.length - 3 }, (_, rang) => secret.slice(rang, rang + 4))
      .filter((segment, rang, segments) => segments.indexOf(segment) === rang)
      .filter((segment) => texte.includes(segment))
      .map(
        (segment) => `segment « ${segment} » d'un secret de ${String(secret.length)} caractères`,
      ),
  );
}

function textesHorsConfiguration(): string {
  const configuration = [ENV_INFRA, ENV_SERVEUR];
  const fichiers = readdirSync(arbre.racine, { recursive: true, encoding: "utf8" })
    .filter((chemin) => !configuration.includes(chemin))
    .filter((chemin) => statSync(join(arbre.racine, chemin)).isFile());
  const temporaires = readdirSync(join(arbre.dossier, "tmp"), {
    recursive: true,
    encoding: "utf8",
  });
  return [...fichiers.map((chemin) => lire(arbre, chemin)), ...temporaires].join("\n");
}

const textesDu = (resultat: Resultat): string =>
  [resultat.sortie, resultat.erreur, ...resultat.appels].join("\n");

// `od` de substitution : un aléa marqué, pour chercher les segments des secrets tirés par preparer.
const OD_MARQUE = `n=0
for argument in "$@"; do case "$argument" in -N*) n="\${argument#-N}" ;; esac; done
motif=a7; if [ "$n" = 24 ]; then motif=fd; fi; if [ "$n" = 32 ]; then motif=eb; fi
i=0; while [ "$i" -lt "$n" ]; do printf ' %s' "$motif"; i=$((i + 1)); done; printf '\\n'
`;

describe("secrets", () => {
  it("F-031-AC6 preparer n'écrit les secrets tirés ni sur ses sorties, ni en argument, ni hors des deux fichiers", () => {
    poserCommande(arbre, "od", OD_MARQUE);

    const resultat = lancer(arbre, ["preparer"]);

    expect(resultat.code).toBe(0);
    const secrets = [
      variables(lire(arbre, ENV_INFRA)).get("POSTGRES_PASSWORD") ?? "",
      variables(lire(arbre, ENV_SERVEUR)).get("BETTER_AUTH_SECRET") ?? "",
    ];
    expect(secrets).toEqual(["fd".repeat(24), "eb".repeat(32)]);
    expect(fuites(textesDu(resultat), secrets)).toEqual([]);
    expect(fuites(textesHorsConfiguration(), secrets)).toEqual([]);
  });

  it("F-031-AC6 deux preparer dans deux arbres vides tirent des secrets différents", () => {
    const autre = creerArbre();
    try {
      lancer(arbre, ["preparer"]);
      lancer(autre, ["preparer"]);
      const secretsDe = (dans: Arbre): string[] => [
        variables(lire(dans, ENV_INFRA)).get("POSTGRES_PASSWORD") ?? "",
        variables(lire(dans, ENV_SERVEUR)).get("BETTER_AUTH_SECRET") ?? "",
      ];

      const [premier, second] = [secretsDe(arbre), secretsDe(autre)];

      expect(premier[0]).not.toBe(second[0]);
      expect(premier[1]).not.toBe(second[1]);
      expect(premier[0]).not.toBe(premier[1]?.slice(0, premier[0]?.length));
    } finally {
      supprimerArbre(autre);
    }
  });

  it.each([
    ["aide", []],
    ["etat", ["conteneurs", "volume"]],
    ["arreter", ["conteneurs", "volume"]],
    ["demarrer", ["volume"]],
    ["demarrer", ["volume", "desaccorde"]],
    ["accorder", ["volume", "desaccorde"]],
    ["accorder", ["volume"]],
  ])(
    "F-031-AC6 F-031-AC22 %s (état %j) : aucun secret sur les sorties, dans les arguments ni hors des deux fichiers",
    (sousCommande, etat) => {
      poserLesFichiers(arbre);
      if (etat.includes("conteneurs")) poserEtat(arbre, "conteneurs", CONTENEURS_EN_MARCHE);
      if (etat.includes("volume")) poserEtat(arbre, "volume");
      poserEtat(
        arbre,
        "mdp-volume",
        etat.includes("desaccorde") ? ANCIEN_MOT_DE_PASSE : MOT_DE_PASSE,
      );

      const resultat = lancer(arbre, [sousCommande]);

      expect(resultat.code).not.toBeNull();
      const secrets = [MOT_DE_PASSE, SECRET, ANCIEN_MOT_DE_PASSE];
      expect(fuites(textesDu(resultat), secrets)).toEqual([]);
      expect(fuites(textesHorsConfiguration(), secrets)).toEqual([]);
    },
  );

  it("F-031-AC6 un secret glissé sur une sortie ou en argument est vu, par segment de quatre caractères", () => {
    expect(fuites(`URL : postgres://n:${MOT_DE_PASSE}@h`, [MOT_DE_PASSE])).toHaveLength(2);
    expect(fuites(`docker run -e X=${SECRET.slice(0, 4)}`, [SECRET])).toEqual([
      "segment « WkWk » d'un secret de 64 caractères",
    ]);
    expect(fuites("aucun secret ici", [MOT_DE_PASSE, SECRET])).toEqual([]);
  });
});

describe("compatibilité bash 3.2", () => {
  it("F-031-AC31 infra/pile.sh se lit sans erreur de syntaxe et n'emploie aucune construction de bash 4", () => {
    expect(constatsSyntaxe(texteDuScript)).toEqual([]);
    expect(constatsBash4(texteDuScript)).toEqual([]);
  });

  it.each([
    ["declare -A ports=()", "tableau associatif (declare -A)"],
    ["local -A vus", "tableau associatif (declare -A)"],
    ["mapfile -t lignes <fichier", "mapfile"],
    ["readarray lignes <fichier", "readarray"],
    ['echo "${nom,,}"', "${var,,} (minuscules)"],
    ['echo "${nom^^}"', "${var^^} (majuscules)"],
    ['echo "${liste[0],}"', "${var,,} (minuscules)"],
    ["declare -n reference=cible", "référence nommée (declare -n)"],
    ["coproc lecteur { cat; }", "coproc"],
    ["commande &>>journal", "redirection &>>"],
    ["commande |& tee journal", "tube |&"],
  ])("F-031-AC31 refuse « %s »", (ligne, constat) => {
    expect(constatsBash4(`#!/usr/bin/env bash\n# ${ligne}\n${ligne}\n`)).toEqual([
      `ligne 3 : ${constat}`,
    ]);
  });

  it("F-031-AC31 bash -n voit une erreur de syntaxe", () => {
    expect(constatsSyntaxe('case "$1" in\n  a) echo a\n')).toHaveLength(1);
  });

  it("F-031-AC31 les tests lancent le script dans un arbre temporaire, docker de substitution en tête d'un PATH réduit", () => {
    const resultat = lancer(arbre, ["etat"]);

    expect(arbre.racine).not.toBe(DEPOT);
    expect(resultat.appels[0]).toMatch(/^docker info$/);
    expect(
      resultat.appels.every(
        (appel) => /^(docker|curl|lsof) /.test(appel) || appel === "docker info",
      ),
    ).toBe(true);
  });
});
