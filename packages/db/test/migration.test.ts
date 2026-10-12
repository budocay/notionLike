// Migrations sur la base embarquée (F-008-AC15, F-008-AC16), forme du journal, et couture du
// bloc : `Pilote` gagne `appliquerMigrations`, `BaseEmbarquee` gagne `pilote`.
// Exception nommée par la conception : ce fichier importe `src/migration.ts`, parce que la commande
// ne sait ouvrir que le pilote `pg`. La commande est exercée par `commande.test.ts`.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { ouvrirPilotePg } from "../src/acces.ts";
import { DOSSIER_MIGRATIONS, lancerMigration } from "../src/migration.ts";
import {
  demarrerFauxPostgres,
  ouvrirBaseEmbarquee,
  portFerme,
  type BaseEmbarquee,
} from "./essai.ts";
import { faitEntrer, fichiersDuWorkspace, RACINE } from "./fichiers-du-workspace.ts";

const JEUX_D_ESSAI = fileURLToPath(new URL("./migrations-essai", import.meta.url));
const PREMIER_LANCEMENT = join(JEUX_D_ESSAI, "premier-lancement");
const LANCEMENT_DEFAILLANT = join(JEUX_D_ESSAI, "lancement-defaillant");
const LANCEMENT_CORRIGE = join(JEUX_D_ESSAI, "lancement-corrige");
// Le dossier réel tel que F-008 l'a livré : un journal sans entrée. Depuis F-009, le dossier réel
// porte la migration des comptes, éprouvée par `comptes.test.ts`.
const ETAT_F_008 = join(JEUX_D_ESSAI, "etat-f-008");
const MOT_DE_PASSE = "mot-de-passe-de-test";
const PHRASE_D_ECHEC = "La migration a échoué : aucune migration de ce lancement n'est appliquée.";
// Horodatages des trois entrées des journaux d'essai, dans l'ordre.
const QUAND = ["1759968000000", "1759968001000", "1759968002000"];

interface Lancement {
  readonly code: number;
  readonly lignes: readonly string[];
}

async function lancer(embarquee: BaseEmbarquee, dossier: string): Promise<Lancement> {
  const lignes: string[] = [];
  const code = await lancerMigration(embarquee.pilote, dossier, (ligne) => {
    lignes.push(ligne);
  });
  return { code, lignes };
}

function lignesDe(resultat: unknown): Record<string, unknown>[] {
  expect(resultat).toHaveProperty("rows");
  return (resultat as { rows: Record<string, unknown>[] }).rows;
}

async function tablesPubliques(embarquee: BaseEmbarquee): Promise<unknown[]> {
  const resultat = await embarquee.base.db.execute(
    sql`select tablename from pg_tables where schemaname = 'public' order by tablename`,
  );
  return lignesDe(resultat).map((ligne) => ligne.tablename);
}

// Les horodatages consignés dans la table de suivi, dans l'ordre où ils l'ont été.
async function suivi(embarquee: BaseEmbarquee): Promise<unknown[]> {
  const resultat = await embarquee.base.db.execute(
    sql`select created_at::text as quand from drizzle.__drizzle_migrations order by id`,
  );
  return lignesDe(resultat).map((ligne) => ligne.quand);
}

describe("migrations sur une base embarquée", () => {
  it("F-008-AC15 un dossier sans migration, celui que F-008 a livré, crée la table de suivi vide et aucune table", async () => {
    const embarquee = await ouvrirBaseEmbarquee();

    expect(await lancer(embarquee, ETAT_F_008)).toEqual({ code: 0, lignes: [] });

    expect(await suivi(embarquee)).toEqual([]);
    expect(await tablesPubliques(embarquee)).toEqual([]);
    await embarquee.base.fermer();
  });

  it("F-008-AC15 sur une base vide la migration est appliquée et consignée ; relancée, la commande n'en réapplique aucune", async () => {
    const embarquee = await ouvrirBaseEmbarquee();

    expect(await lancer(embarquee, PREMIER_LANCEMENT)).toEqual({ code: 0, lignes: [] });
    expect(await tablesPubliques(embarquee)).toEqual(["essai_un"]);
    expect(await suivi(embarquee)).toEqual([QUAND[0]]);

    // Réappliquée, `create table essai_un` échouerait : le code 0 prouve qu'elle ne l'est pas.
    expect(await lancer(embarquee, PREMIER_LANCEMENT)).toEqual({ code: 0, lignes: [] });
    expect(await tablesPubliques(embarquee)).toEqual(["essai_un"]);
    expect(await suivi(embarquee)).toEqual([QUAND[0]]);
    await embarquee.base.fermer();
  });

  it("F-008-AC15 sur une base vide trois migrations sont appliquées dans l'ordre du journal et consignées chacune", async () => {
    const embarquee = await ouvrirBaseEmbarquee();

    // La troisième référence la table de la deuxième : appliquée avant elle, elle échouerait.
    expect(await lancer(embarquee, LANCEMENT_CORRIGE)).toEqual({ code: 0, lignes: [] });
    expect(await tablesPubliques(embarquee)).toEqual(["essai_deux", "essai_trois", "essai_un"]);
    expect(await suivi(embarquee)).toEqual(QUAND);

    expect(await lancer(embarquee, LANCEMENT_CORRIGE)).toEqual({ code: 0, lignes: [] });
    expect(await suivi(embarquee)).toEqual(QUAND);
    await embarquee.base.fermer();
  });

  it("F-008-AC16 un lancement dont la troisième migration échoue est annulé en entier, le précédent reste intact, la relance corrigée applique tout", async () => {
    const embarquee = await ouvrirBaseEmbarquee();
    expect(await lancer(embarquee, PREMIER_LANCEMENT)).toEqual({ code: 0, lignes: [] });

    const defaillant = await lancer(embarquee, LANCEMENT_DEFAILLANT);

    expect(defaillant.code).toBe(1);
    expect(await tablesPubliques(embarquee)).toEqual(["essai_un"]);
    expect(await suivi(embarquee)).toEqual([QUAND[0]]);
    expect(defaillant.lignes[0]).toBe(PHRASE_D_ECHEC);
    expect(defaillant.lignes.slice(1).join(" | ")).toMatch(/essai_un.*already exists/);

    expect(await lancer(embarquee, LANCEMENT_CORRIGE)).toEqual({ code: 0, lignes: [] });
    expect(await tablesPubliques(embarquee)).toEqual(["essai_deux", "essai_trois", "essai_un"]);
    expect(await suivi(embarquee)).toEqual(QUAND);
    await embarquee.base.fermer();
  });

  it("F-008-AC16 un dossier sans journal finit en code 1 sans toucher à la base", async () => {
    const embarquee = await ouvrirBaseEmbarquee();

    const lancement = await lancer(embarquee, join(JEUX_D_ESSAI, "dossier-absent"));

    expect(lancement.code).toBe(1);
    expect(lancement.lignes).toEqual([PHRASE_D_ECHEC, "Can't find meta/_journal.json file"]);
    expect(await tablesPubliques(embarquee)).toEqual([]);
    await embarquee.base.fermer();
  });

  it("F-008-AC16 l'échec s'écrit en une phrase fixe puis cinq messages de cause au plus, un par ligne, jamais un objet", async () => {
    const embarquee = await ouvrirBaseEmbarquee();
    const chaine = [7, 6, 5, 4, 3, 2, 1].reduce<unknown>(
      (cause, rang) => new Error(`cause ${rang}\n  sur deux lignes`, { cause }),
      { secret: MOT_DE_PASSE },
    );
    const echouer = (erreur: unknown): Promise<Lancement> =>
      lancer(
        {
          ...embarquee,
          pilote: { ...embarquee.pilote, appliquerMigrations: () => Promise.reject(erreur) },
        },
        DOSSIER_MIGRATIONS,
      );

    expect(await echouer(chaine)).toEqual({
      code: 1,
      lignes: [
        PHRASE_D_ECHEC,
        "cause 1 sur deux lignes",
        "cause 2 sur deux lignes",
        "cause 3 sur deux lignes",
        "cause 4 sur deux lignes",
        "cause 5 sur deux lignes",
      ],
    });
    expect(await echouer({ secret: MOT_DE_PASSE })).toEqual({ code: 1, lignes: [PHRASE_D_ECHEC] });
    expect(await echouer(new Error("seule", { cause: { secret: MOT_DE_PASSE } }))).toEqual({
      code: 1,
      lignes: [PHRASE_D_ECHEC, "seule"],
    });
    await embarquee.base.fermer();
  });
});

describe("migrations par le pilote pg", () => {
  it("F-008-AC15 le migrateur du pilote pg applique le dossier réel sur le faux serveur : code 0", async () => {
    const faux = await demarrerFauxPostgres(MOT_DE_PASSE);
    const pilote = ouvrirPilotePg(faux.url);
    const lignes: string[] = [];

    const code = await lancerMigration(pilote, DOSSIER_MIGRATIONS, (ligne) => lignes.push(ligne));

    expect({ code, lignes }).toEqual({ code: 0, lignes: [] });
    await pilote.fermer();
    await faux.arreter();
  });

  it("F-008-AC16 F-008-AC17 vers un port fermé le lancement finit en code 1 et ses lignes ne portent ni l'URL ni le mot de passe", async () => {
    const url = `postgres://essai:${MOT_DE_PASSE}@127.0.0.1:${await portFerme()}/essai`;
    const pilote = ouvrirPilotePg(url);
    const lignes: string[] = [];

    const code = await lancerMigration(pilote, DOSSIER_MIGRATIONS, (ligne) => lignes.push(ligne));

    expect(code).toBe(1);
    expect(lignes[0]).toBe(PHRASE_D_ECHEC);
    const texte = lignes.join("\n");
    expect(texte).toContain("ECONNREFUSED");
    expect(texte).not.toContain(url);
    expect(texte).not.toContain(MOT_DE_PASSE);
    await pilote.fermer();
  });
});

// Forme d'un dossier de migrations (ADR-0005) : le journal de Drizzle et un fichier SQL par entrée.
// Le migrateur ne compare que l'horodatage de la dernière migration appliquée (H13) : une entrée
// dont l'horodatage n'est pas supérieur au précédent serait ignorée sans erreur.
interface DossierLu {
  readonly journal: unknown;
  readonly fichiers: readonly string[];
}

interface EntreeDeJournal {
  readonly idx: number;
  readonly when: number;
  readonly tag: string;
}

function estUneEntree(valeur: unknown): valeur is EntreeDeJournal {
  const entree = valeur as Partial<EntreeDeJournal> | null;
  return (
    typeof entree?.idx === "number" &&
    Number.isSafeInteger(entree.when) &&
    typeof entree.tag === "string"
  );
}

function fautesDesEntrees(entrees: readonly unknown[]): string[] {
  const fautes: string[] = [];
  let precedent = 0;
  entrees.forEach((entree, rang) => {
    if (!estUneEntree(entree)) {
      fautes.push(`entrée ${rang} mal formée`);
    } else {
      if (entree.idx !== rang) fautes.push(`entrée ${rang} : idx ${entree.idx}`);
      if (entree.when <= precedent) fautes.push(`entrée ${rang} : horodatage non croissant`);
      if (!/^\d{4}_[a-z0-9_]+$/.test(entree.tag)) fautes.push(`entrée ${rang} : nom ${entree.tag}`);
      precedent = entree.when;
    }
  });
  return fautes;
}

function fautesDuDossier(lu: DossierLu): string[] {
  const journal = lu.journal as { version?: unknown; dialect?: unknown; entries?: unknown } | null;
  const entrees = Array.isArray(journal?.entries) ? (journal.entries as unknown[]) : undefined;
  if (journal?.version !== "7" || journal.dialect !== "postgresql" || entrees === undefined) {
    return ["en-tête du journal invalide"];
  }
  const attendus = entrees.filter(estUneEntree).map((entree) => `${entree.tag}.sql`);
  const fautes = fautesDesEntrees(entrees);
  if (JSON.stringify([...lu.fichiers].sort()) !== JSON.stringify([...attendus].sort())) {
    fautes.push(`fichiers SQL : ${[...lu.fichiers].sort().join(", ")}`);
  }
  return fautes;
}

function lireDossier(dossier: string): DossierLu {
  return {
    journal: JSON.parse(readFileSync(join(dossier, "meta", "_journal.json"), "utf8")),
    fichiers: readdirSync(dossier).filter((nom) => nom !== "meta"),
  };
}

function entree(idx: number, when: number, tag: string): Record<string, unknown> {
  return { idx, version: "7", when, tag, breakpoints: true };
}

function journalDe(entries: unknown): Record<string, unknown> {
  return { version: "7", dialect: "postgresql", entries };
}

describe("forme des dossiers de migrations", () => {
  it.each([
    ["le dossier réel", DOSSIER_MIGRATIONS, 1],
    ["le jeu etat-f-008", ETAT_F_008, 0],
    ["le jeu premier-lancement", PREMIER_LANCEMENT, 1],
    ["le jeu lancement-defaillant", LANCEMENT_DEFAILLANT, 3],
    ["le jeu lancement-corrige", LANCEMENT_CORRIGE, 3],
  ])("F-008-AC15 %s a un journal ordonné et un fichier SQL par entrée", (_cas, dossier, nombre) => {
    const lu = lireDossier(dossier);

    expect(fautesDuDossier(lu)).toEqual([]);
    expect(lu.fichiers).toHaveLength(nombre);
  });

  it("F-008-AC15 le dossier réel est celui du paquet, quel que soit le dossier courant", () => {
    expect(relative(RACINE, DOSSIER_MIGRATIONS)).toBe(join("packages", "db", "migrations"));
  });

  it.each<[string, DossierLu, string[]]>([
    [
      "un horodatage antérieur au précédent",
      {
        journal: journalDe([entree(0, 2000, "0000_un"), entree(1, 1000, "0001_deux")]),
        fichiers: ["0000_un.sql", "0001_deux.sql"],
      },
      ["entrée 1 : horodatage non croissant"],
    ],
    [
      "deux entrées au même horodatage",
      {
        journal: journalDe([entree(0, 1000, "0000_un"), entree(1, 1000, "0001_deux")]),
        fichiers: ["0000_un.sql", "0001_deux.sql"],
      },
      ["entrée 1 : horodatage non croissant"],
    ],
    [
      "un rang qui saute",
      { journal: journalDe([entree(1, 1000, "0001_un")]), fichiers: ["0001_un.sql"] },
      ["entrée 0 : idx 1"],
    ],
    [
      "un nom hors convention",
      { journal: journalDe([entree(0, 1000, "Essai-Un")]), fichiers: ["Essai-Un.sql"] },
      ["entrée 0 : nom Essai-Un"],
    ],
    [
      "une entrée sans fichier SQL",
      { journal: journalDe([entree(0, 1000, "0000_un")]), fichiers: [] },
      ["fichiers SQL : "],
    ],
    [
      "un fichier SQL sans entrée",
      { journal: journalDe([]), fichiers: ["0000_oublie.sql"] },
      ["fichiers SQL : 0000_oublie.sql"],
    ],
    [
      "une entrée mal formée",
      { journal: journalDe([{ idx: 0, tag: "0000_un" }]), fichiers: [] },
      ["entrée 0 mal formée"],
    ],
    [
      "un autre dialecte",
      { journal: { version: "7", dialect: "sqlite", entries: [] }, fichiers: [] },
      ["en-tête du journal invalide"],
    ],
    [
      "un journal sans entrées",
      { journal: { version: "7", dialect: "postgresql" }, fichiers: [] },
      ["en-tête du journal invalide"],
    ],
  ])("F-008-AC15 un dossier fautif est refusé : %s", (_cas, fautif, fautes) => {
    expect(fautesDuDossier(fautif)).toEqual(fautes);
  });
});

// Couture du bloc 3. `Pilote` (interne, `src/acces.ts`) gagne `appliquerMigrations` : tout fichier
// qui le nomme doit être connu ici. `ouvrirBaseEmbarquee` rend `pilote` en plus de `base` : hors de
// `packages/db`, ses appelants ne lisent que `base` (interface figée avec `apps/server`).
const DEFINITION_DU_PILOTE = "packages/db/src/acces.ts";
const QUI_NOMME_LE_PILOTE = ["packages/db/src/migration.ts", "packages/db/test/base-embarquee.ts"];
const QUI_OUVRE_UNE_BASE_EMBARQUEE_ICI = [
  "packages/db/test/acces.test.ts",
  "packages/db/test/comptes.test.ts",
  "packages/db/test/essai.ts",
  "packages/db/test/migration.test.ts",
];
function importeLEntreeDEssai(texte: string): boolean {
  return /from\s*"(@notionlike\/db\/essai|[^"]*packages\/db\/test\/[^"]*)"/.test(texte);
}

// Un accès au champ, ou une déstructuration qui le nomme. Le mot seul, dans un titre, n'en est pas un.
function litLePilote(texte: string): boolean {
  return /\.pilote\b|\{[^{}]*\bpilote\b[^{}]*\}\s*=/.test(texte);
}

function fautesDeCouture(fichiers: ReadonlyMap<string, string>): string[] {
  const fautes: string[] = [];
  for (const [chemin, texte] of fichiers) {
    const dansLePaquet = chemin.startsWith("packages/db/");
    if (faitEntrer(texte, "Pilote") && !QUI_NOMME_LE_PILOTE.includes(chemin)) {
      fautes.push(`${chemin} nomme Pilote sans être inscrit`);
    }
    if (dansLePaquet && faitEntrer(texte, "ouvrirBaseEmbarquee")) {
      if (!QUI_OUVRE_UNE_BASE_EMBARQUEE_ICI.includes(chemin)) {
        fautes.push(`${chemin} ouvre une base embarquée sans être inscrit`);
      }
    }
    if (!dansLePaquet && importeLEntreeDEssai(texte) && litLePilote(texte)) {
      fautes.push(`${chemin} lit le pilote d'une base embarquée`);
    }
  }
  return fautes;
}

// Les déclarations d'essai sont assemblées ici : ce fichier, lu lui aussi, n'en porte aucune.
function entrer(clause: string, source: string): string {
  return `${"import"} ${clause} from "${source}";\n`;
}

describe("couture du bloc des migrations", () => {
  const fichiers = fichiersDuWorkspace();

  it("F-008-AC15 énumère les fichiers qui nomment Pilote et ceux qui ouvrent une base embarquée : chacun est inscrit, aucun appelant hors du paquet ne lit le pilote", () => {
    expect(fautesDeCouture(fichiers)).toEqual([]);

    const inscrits = [
      ...QUI_NOMME_LE_PILOTE,
      ...QUI_OUVRE_UNE_BASE_EMBARQUEE_ICI,
      DEFINITION_DU_PILOTE,
    ];
    expect(inscrits.filter((chemin) => !fichiers.has(chemin))).toEqual([]);
    expect(
      QUI_NOMME_LE_PILOTE.filter((chemin) => !faitEntrer(fichiers.get(chemin) ?? "", "Pilote")),
    ).toEqual([]);
    expect(fichiers.get(DEFINITION_DU_PILOTE)).toMatch(
      /export interface Pilote \{[^}]*appliquerMigrations\(/,
    );
  });

  it.each([
    [
      "un fichier du serveur qui nomme Pilote",
      "apps/server/src/base.ts",
      entrer("type { Pilote }", "../../../packages/db/src/acces.ts"),
      "apps/server/src/base.ts nomme Pilote sans être inscrit",
    ],
    [
      "une troisième réalisation dans le paquet",
      "packages/db/test/autre-moteur.ts",
      entrer("{ creerBase, type Pilote }", "../src/acces.ts"),
      "packages/db/test/autre-moteur.ts nomme Pilote sans être inscrit",
    ],
    [
      "un test du paquet non inscrit qui ouvre une base embarquée",
      "packages/db/test/autre.test.ts",
      entrer("{ ouvrirBaseEmbarquee }", "./essai.ts"),
      "packages/db/test/autre.test.ts ouvre une base embarquée sans être inscrit",
    ],
    [
      "un test du serveur qui lit le pilote",
      "apps/server/test/sante.test.ts",
      `${entrer("{ ouvrirBaseEmbarquee }", "@notionlike/db/essai")}const { pilote } = await ouvrirBaseEmbarquee();\n`,
      "apps/server/test/sante.test.ts lit le pilote d'une base embarquée",
    ],
    [
      "un test du serveur qui atteint l'aide par son chemin et lit le pilote",
      "apps/server/test/aides.ts",
      `${entrer("{ ouvrirBaseEmbarquee }", "../../../packages/db/test/base-embarquee.ts")}await (await ouvrirBaseEmbarquee()).pilote.fermer();\n`,
      "apps/server/test/aides.ts lit le pilote d'une base embarquée",
    ],
  ])("F-008-AC15 la couture refuse %s", (_cas, chemin, texte, faute) => {
    expect(fautesDeCouture(new Map([[chemin, texte]]))).toEqual([faute]);
  });

  it.each([
    ["ne lit que la base", "const { base } = await ouvrirBaseEmbarquee();\n"],
    ["nomme le pilote pg dans un titre", 'it("le pilote pg vers un port fermé", () => {});\n'],
  ])("F-008-AC18 la couture accepte un test du serveur qui %s", (_cas, suite) => {
    const texte = `${entrer("{ ouvrirBaseEmbarquee }", "@notionlike/db/essai")}${suite}`;

    expect(fautesDeCouture(new Map([["apps/server/test/sante.test.ts", texte]]))).toEqual([]);
  });
});
