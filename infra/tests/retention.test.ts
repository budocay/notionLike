import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { lireCompose } from "./regles/compose.ts";
import {
  constatsMontageDesDonnees,
  constatsSuppressionDuVolume,
  fichiersSurveilles,
} from "./regles/retention.ts";

const dossierInfra = fileURLToPath(new URL("../", import.meta.url));
const lire = (chemin: string): string => readFileSync(join(dossierInfra, chemin), "utf8");
const compose = lireCompose(lire("docker-compose.yml"));

describe("rétention des données : aucune commande d'infra/ ne supprime un volume", () => {
  it("F-008-AC20 aucun fichier d'infra/ hors fumee.sh ne supprime de volume, et la procédure de retour arrière est lue", () => {
    const fichiers = fichiersSurveilles(dossierInfra);

    expect(fichiers).toEqual(
      expect.arrayContaining([
        ".env.example",
        "Dockerfile",
        "RETOUR-ARRIERE.md",
        "docker-compose.yml",
      ]),
    );
    expect(fichiers.flatMap((chemin) => constatsSuppressionDuVolume(chemin, lire(chemin)))).toEqual(
      [],
    );
  });

  it("F-008-AC20 fumee.sh, seul exclu, supprime bien le volume de sa pile jetable", () => {
    const constats = constatsSuppressionDuVolume("fumee.sh", lire("fumee.sh"));

    expect(constats).not.toEqual([]);
    expect(
      constats.every((constat) => constat.endsWith("down supprime les volumes (-v, --volumes)")),
    ).toBe(true);
  });

  it("F-008-AC20 n'écarte que fumee.sh à la racine, tests/ et .env", () => {
    const dossier = mkdtempSync(join(tmpdir(), "retention-"));
    const fichiers = [
      "fumee.sh",
      ".env",
      "tests/regles/cas.ts",
      "Dockerfile",
      "outils/fumee.sh",
      "outils/arret.sh",
    ];
    try {
      for (const chemin of fichiers) {
        mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
        writeFileSync(join(dossier, chemin), "");
      }

      expect(fichiersSurveilles(dossier)).toEqual([
        "Dockerfile",
        "outils/arret.sh",
        "outils/fumee.sh",
      ]);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });

  it.each([
    ["down -v", "arret.sh", "docker compose down -v\n", "down"],
    [
      "down --volumes après le projet",
      "arret.sh",
      "docker compose -p notionlike down --volumes\n",
      "down",
    ],
    ["-v après une autre option", "arret.sh", "docker compose down --remove-orphans -v\n", "down"],
    ["-v groupé avec une autre option", "arret.sh", "docker compose down -fv\n", "down"],
    ["--volumes=true", "arret.sh", "docker-compose down --volumes=true\n", "down"],
    ["-v sur une ligne de suite", "arret.sh", "docker compose down \\\n  --volumes\n", "down"],
    ["-v après un enchaînement", "arret.sh", "cd infra && docker compose down -v\n", "down"],
    [
      "-v dans la fonction compose de fumee.sh",
      "arret.sh",
      "compose down -v --rmi local\n",
      "down",
    ],
    ["volume rm", "arret.sh", "docker volume rm notionlike_donnees-base\n", "volume rm"],
    ["volume prune", "arret.sh", "docker volume prune -af\n", "volume prune"],
    ["system prune --volumes", "arret.sh", "docker system prune --volumes\n", "prune"],
    [
      "down -v dans un bloc de code Markdown",
      "notes.md",
      "Arrêt :\n\n```sh\ndocker compose down -v\n```\n",
      "down",
    ],
  ])("F-008-AC20 refuse %s", (_cas, chemin, texte, motif) => {
    const constats = constatsSuppressionDuVolume(chemin, texte);

    expect(constats).toHaveLength(1);
    expect(constats[0]).toMatch(new RegExp(`^${chemin}:\\d+ : ${motif} supprime `));
  });

  it("F-008-AC20 donne la ligne de la commande fautive, jamais son contenu", () => {
    expect(
      constatsSuppressionDuVolume(
        "notes.md",
        "# Titre\n\n```sh\ndocker compose ps\ndocker compose down -v\n```\n",
      ),
    ).toEqual(["notes.md:5 : down supprime les volumes (-v, --volumes)"]);
  });

  it.each([
    ["un arrêt sans option", "arret.sh", "docker compose down\n"],
    [
      "un arrêt qui garde les volumes",
      "arret.sh",
      "docker compose down --remove-orphans --rmi local\n",
    ],
    ["un commentaire", "arret.sh", "# jamais docker compose down -v ici\n"],
    [
      "un -v d'une autre commande enchaînée",
      "arret.sh",
      "docker compose down && grep -v x journal\n",
    ],
    ["la prose d'un fichier Markdown", "notes.md", "Ne lancez jamais `docker compose down -v`.\n"],
    [
      "un commentaire dans un bloc de code Markdown",
      "notes.md",
      "```sh\n# docker volume rm x\n```\n",
    ],
    [
      "une liste de volumes",
      "arret.sh",
      "docker volume ls --filter name=notionlike_donnees-base\n",
    ],
  ])("F-008-AC20 accepte %s", (_cas, chemin, texte) => {
    expect(constatsSuppressionDuVolume(chemin, texte)).toEqual([]);
  });
});

describe("rétention des données : rien d'éphémère sur /var/lib/postgresql dans le fichier Compose", () => {
  it("F-008-AC20 le fichier Compose ne monte sur les données que le volume nommé déclaré, sur disque", () => {
    expect(constatsMontageDesDonnees(compose)).toEqual([]);
  });

  it.each([
    [
      "un tmpfs en une ligne",
      "    tmpfs: /var/lib/postgresql\n",
      "base : tmpfs sur /var/lib/postgresql",
    ],
    [
      "un tmpfs en liste, sous la cible, avec ses options",
      "    tmpfs:\n      - /var/lib/postgresql/18/docker:size=1g\n",
      "base : tmpfs sur /var/lib/postgresql/18/docker",
    ],
    [
      "un volume anonyme",
      "    volumes:\n      - /var/lib/postgresql\n",
      "base : montage non nommé sur /var/lib/postgresql",
    ],
    [
      "un volume non déclaré",
      "    volumes:\n      - autre-volume:/var/lib/postgresql/\n",
      "base : montage non nommé sur /var/lib/postgresql/",
    ],
    [
      "un montage tmpfs en forme longue",
      "    volumes:\n      - { type: tmpfs, target: /var/lib/postgresql }\n",
      "base : montage tmpfs sur /var/lib/postgresql, pas un volume nommé",
    ],
    [
      "un dossier du poste",
      "    volumes:\n      - ./donnees:/var/lib/postgresql\n",
      "base : montage bind sur /var/lib/postgresql, pas un volume nommé",
    ],
    [
      "un volume sans source en forme longue",
      "    volumes:\n      - { type: volume, target: /var/lib/postgresql }\n",
      "base : montage non nommé sur /var/lib/postgresql",
    ],
  ])("F-008-AC20 refuse %s", (_cas, base, constat) => {
    const fautif = lireCompose(`services:\n  base:\n${base}volumes:\n  donnees-base:\n`);

    expect(constatsMontageDesDonnees(fautif)).toEqual([constat]);
  });

  it("F-008-AC20 refuse un volume nommé au pilote tmpfs", () => {
    const fautif = lireCompose(
      "services:\n  base:\n    volumes:\n      - donnees-base:/var/lib/postgresql\n" +
        "volumes:\n  donnees-base:\n    driver_opts: { type: tmpfs, device: tmpfs }\n",
    );

    expect(constatsMontageDesDonnees(fautif)).toEqual([
      "volume donnees-base : pilote en tmpfs, monté par base sur /var/lib/postgresql",
    ]);
  });

  it("F-008-AC20 lit tous les services, pas seulement la base", () => {
    const fautif = lireCompose(
      "services:\n  base:\n    volumes:\n      - donnees-base:/var/lib/postgresql\n" +
        "  copie:\n    tmpfs: [/var/lib/postgresql]\n    volumes:\n      - /var/lib/postgresql/18\n" +
        "volumes:\n  donnees-base:\n",
    );

    expect(constatsMontageDesDonnees(fautif)).toEqual([
      "copie : tmpfs sur /var/lib/postgresql",
      "copie : montage non nommé sur /var/lib/postgresql/18",
    ]);
  });

  it("F-008-AC20 ignore un tmpfs ou un dossier du poste monté ailleurs que sur les données", () => {
    const conforme = lireCompose(
      "services:\n  base:\n    tmpfs: [/tmp, /var/lib/postgresql-temp]\n    volumes:\n" +
        "      - donnees-base:/var/lib/postgresql\n      - ./init:/docker-entrypoint-initdb.d\n" +
        "volumes:\n  donnees-base:\n",
    );

    expect(constatsMontageDesDonnees(conforme)).toEqual([]);
  });
});
