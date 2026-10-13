// Le faux serveur PostgreSQL publié par `@notionlike/db/essai`, exercé par le vrai pilote `pg`,
// et la couture de ses options : qui le démarre, et qui lui demande de ne jamais fermer.
import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { demarrerFauxPostgres } from "./essai.ts";
import { faitEntrer, fichiersDuWorkspace } from "./fichiers-du-workspace.ts";

const MOT_DE_PASSE = "mot-de-passe-de-test";
const ATTENTE_DE_L_ADIEU_MS = 500;

interface Adieu {
  // N'aboutit qu'une fois la connexion fermée des deux côtés.
  readonly fin: Promise<void>;
}

// Ouvre une connexion, passe une requête, puis dit adieu sans attendre la fermeture.
async function requetePuisAdieu(url: string): Promise<Adieu> {
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query("select 1");
  return { fin: client.end() };
}

function issueDansLAttente(fin: Promise<void>): Promise<string> {
  return Promise.race([
    fin.then(() => "fermée"),
    new Promise<string>((resolve) => {
      setTimeout(() => {
        resolve("toujours ouverte");
      }, ATTENTE_DE_L_ADIEU_MS);
    }),
  ]);
}

describe("faux serveur PostgreSQL", () => {
  it("F-008-AC18 sans option, il ferme la connexion à l'adieu du pilote et rend les types des messages reçus", async () => {
    const faux = await demarrerFauxPostgres(MOT_DE_PASSE);
    expect(faux.messagesRecus).toEqual([]);

    const adieu = await requetePuisAdieu(faux.url);

    expect(await issueDansLAttente(adieu.fin)).toBe("fermée");
    expect(faux.messagesRecus).toEqual(["Q", "X"]);
    await faux.arreter();
  });

  it("F-008-AC18 F-009-AC21 il termine aussi sans ligne une requête paramétrée, celle par laquelle le migrateur consigne une migration", async () => {
    const faux = await demarrerFauxPostgres(MOT_DE_PASSE);
    const client = new Client({ connectionString: faux.url });
    await client.connect();

    const resultat = await client.query("select $1::int", [1]);
    await client.end();

    expect(resultat.rows).toEqual([]);
    expect(faux.messagesRecus).toEqual(["P", "B", "D", "E", "S", "X"]);
    await faux.arreter();
  });

  it("F-008-AC18 avec neFermeJamais, il reçoit l'adieu du pilote mais garde la connexion ouverte jusqu'à son arrêt", async () => {
    const faux = await demarrerFauxPostgres(MOT_DE_PASSE, { neFermeJamais: true });

    const adieu = await requetePuisAdieu(faux.url);

    expect(await issueDansLAttente(adieu.fin)).toBe("toujours ouverte");
    expect(faux.messagesRecus).toEqual(["Q", "X"]);
    await faux.arreter();
    await expect(adieu.fin).resolves.toBeUndefined();
  });

  it("F-008-AC18 la liste des messages reçus confond les connexions et ignore leur démarrage", async () => {
    const faux = await demarrerFauxPostgres(MOT_DE_PASSE);

    await (
      await requetePuisAdieu(faux.url)
    ).fin;
    await (
      await requetePuisAdieu(faux.url)
    ).fin;

    expect(faux.messagesRecus).toEqual(["Q", "X", "Q", "X"]);
    await faux.arreter();
  });
});

// Couture : `demarrerFauxPostgres` gagne un second paramètre facultatif et `FauxPostgres` la liste
// `messagesRecus`. Les appelants d'avant ne passent que le mot de passe : ils gardent le serveur qui
// ferme à l'adieu, prouvé par le premier cas ci-dessus. Tout fichier qui fait entrer la fonction
// est inscrit ; seuls ceux de la seconde liste peuvent lui passer des options.
const QUI_DEMARRE_UN_FAUX_POSTGRES = [
  "apps/server/test/arret.test.ts",
  "apps/server/test/processus.test.ts",
  "apps/server/test/sante.test.ts",
  "packages/db/test/acces.test.ts",
  "packages/db/test/commande.test.ts",
  "packages/db/test/essai.ts",
  "packages/db/test/faux-postgres.test.ts",
  "packages/db/test/migration.test.ts",
];
const QUI_PEUT_PASSER_DES_OPTIONS = [
  "apps/server/test/processus.test.ts",
  "packages/db/test/faux-postgres.test.ts",
];
const NOM = "demarrerFauxPostgres";

// Un appel dont les arguments portent une virgule : un second argument est passé. La déclaration
// de la fonction, qui nomme ses deux paramètres, n'est pas un appel.
function passeDesOptions(texte: string): boolean {
  const appels = texte.matchAll(new RegExp(`(?<!function )\\b${NOM}\\(([^()]*)\\)`, "g"));
  return [...appels].some(([, arguments_ = ""]) => arguments_.includes(","));
}

function fautesDeCouture(fichiers: ReadonlyMap<string, string>): string[] {
  const fautes: string[] = [];
  for (const [chemin, texte] of fichiers) {
    if (faitEntrer(texte, NOM) && !QUI_DEMARRE_UN_FAUX_POSTGRES.includes(chemin)) {
      fautes.push(`${chemin} démarre un faux serveur sans être inscrit`);
    }
    if (passeDesOptions(texte) && !QUI_PEUT_PASSER_DES_OPTIONS.includes(chemin)) {
      fautes.push(`${chemin} passe des options au faux serveur sans être inscrit`);
    }
  }
  return fautes;
}

function entrer(source: string): string {
  return `${"import"} { ${NOM} } from "${source}";\n`;
}

describe("couture des options du faux serveur", () => {
  const fichiers = fichiersDuWorkspace();

  it("F-008-AC18 énumère les fichiers qui démarrent un faux serveur : chacun est inscrit, et ceux d'avant ne passent que le mot de passe", () => {
    expect(fautesDeCouture(fichiers)).toEqual([]);

    expect(
      QUI_DEMARRE_UN_FAUX_POSTGRES.filter((chemin) => !faitEntrer(fichiers.get(chemin) ?? "", NOM)),
    ).toEqual([]);
    expect(
      QUI_PEUT_PASSER_DES_OPTIONS.filter(
        (chemin) => !QUI_DEMARRE_UN_FAUX_POSTGRES.includes(chemin),
      ),
    ).toEqual([]);
  });

  it.each([
    [
      "un test du serveur non inscrit qui démarre un faux serveur",
      "apps/server/test/journal.test.ts",
      entrer("@notionlike/db/essai"),
      "apps/server/test/journal.test.ts démarre un faux serveur sans être inscrit",
    ],
    [
      "un appelant d'avant qui passe des options",
      "apps/server/test/sante.test.ts",
      `${entrer("@notionlike/db/essai")}await ${NOM}(MOT_DE_PASSE, { neFermeJamais: true });\n`,
      "apps/server/test/sante.test.ts passe des options au faux serveur sans être inscrit",
    ],
  ])("F-008-AC18 la couture refuse %s", (_cas, chemin, texte, faute) => {
    expect(fautesDeCouture(new Map([[chemin, texte]]))).toEqual([faute]);
  });

  it("F-008-AC18 la couture accepte un appelant d'avant qui ne passe que le mot de passe", () => {
    const texte = `${entrer("@notionlike/db/essai")}await ${NOM}(MOT_DE_PASSE);\n`;

    expect(fautesDeCouture(new Map([["apps/server/test/sante.test.ts", texte]]))).toEqual([]);
  });
});
