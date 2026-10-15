// Instantanés des documents (F-012, part de `packages/db`) : ce que `lireDocument`,
// `enregistrerDocument` et `compterDocuments` lisent, écrivent ou refusent sur la base embarquée
// migrée, sous une horloge fournie par le test. L'aller-retour par le pilote `pg` sur un
// PostgreSQL réel n'est prouvé par aucun contrôle des hooks (dette D-002, F-012 H11).
import { PGlite } from "@electric-sql/pglite";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  compterDocuments,
  enregistrerDocument,
  ErreurBase,
  lireDocument,
  schemaComptes,
  supprimerEspace,
  type Base,
  type CleDocument,
  type EnregistrementDocument,
} from "../src/index.ts";
import { DOSSIER_MIGRATIONS } from "../src/migration.ts";
import { adhesion, document, espace, user } from "../src/schema.ts";
import { ouvrirBaseEmbarqueeMigree } from "./essai.ts";

// Chaque base embarquée est une instance PGlite neuve ; la première du fichier compile le
// WebAssembly et fait un initdb, plusieurs secondes quand toute la suite tourne en parallèle.
// L'ouverture se fait dans un crochet qui a ce délai explicite, comme dans `espaces.test.ts`.
const DELAI_D_OUVERTURE_D_UNE_BASE_MS = 30_000;
const ESPACE_A = "5d2e7c1a-9b3f-4c6d-8e0a-1b2c3d4e5f01";
const ESPACE_B = "5d2e7c1a-9b3f-4c6d-8e0a-1b2c3d4e5f02";
const INCONNU = "5d2e7c1a-9b3f-4c6d-8e0a-1b2c3d4e5fff";
const PAGE = "7a8b9c0d-1e2f-4a3b-9c4d-5e6f7a8b9c01";
const AUTRE_PAGE = "7a8b9c0d-1e2f-4a3b-9c4d-5e6f7a8b9c02";
const TROISIEME_PAGE = "7a8b9c0d-1e2f-4a3b-9c4d-5e6f7a8b9c03";
const PLAFOND = 5_000;
const MAINTENANT = new Date("2026-10-14T10:00:00.000Z");
const PLUS_TARD = new Date("2026-10-14T10:00:02.000Z");
// Zéro, 0xFF, barre oblique inverse, apostrophe, guillemet (F-012-AC28).
const OCTETS_LIMITES = Uint8Array.from([0, 255, 1, 254, 92, 0, 39, 34]);
const MARQUE = "contenu-prive-du-membre";

type Db = Base["db"];

const cle = (idEspace: string, type: CleDocument["type"], idDocument: string): CleDocument => ({
  idEspace,
  type,
  idDocument,
});
const DOCUMENT_D_ESPACE_A = cle(ESPACE_A, "espace", ESPACE_A);
const PAGE_A = cle(ESPACE_A, "page", PAGE);
const PAGE_B = cle(ESPACE_B, "page", PAGE);
const TABLE_A = cle(ESPACE_A, "table", PAGE);

// Un motif de 0 à 255 répété, d'une longueur qui n'est pas un multiple de 256.
function octetsDe(longueur: number): Uint8Array {
  return Uint8Array.from({ length: longueur }, (_, rang) => (rang * 7 + 3) % 256);
}

function texteEnOctets(texte: string): Uint8Array {
  return new TextEncoder().encode(texte);
}

// Égalité par contenu, pas par type : PGlite rend un `Uint8Array`, le pilote `pg` un `Buffer`.
function memesOctets(lus: Uint8Array | undefined, attendus: Uint8Array): boolean {
  return lus !== undefined && Buffer.compare(Buffer.from(lus), Buffer.from(attendus)) === 0;
}

const enregistrement = (
  cleVisee: CleDocument,
  instantane: Uint8Array,
  plus: Partial<EnregistrementDocument> = {},
): EnregistrementDocument => ({
  ...cleVisee,
  instantane,
  enregistreLe: MAINTENANT,
  plafondDocumentsParEspace: PLAFOND,
  ...plus,
});

async function echecDe(promesse: Promise<unknown>): Promise<unknown> {
  return promesse.then(
    () => "la promesse a abouti",
    (erreur: unknown) => erreur,
  );
}

async function lignes(db: Db) {
  return db
    .select({ idEspace: document.idEspace, type: document.type, idDocument: document.idDocument })
    .from(document)
    .orderBy(document.idEspace, document.type, document.idDocument);
}

// Deux espaces, A et B, dont Anne est propriétaire.
async function peupler(db: Db): Promise<void> {
  const [anne] = await db
    .insert(user)
    .values({ name: "Anne", email: "anne@exemple.test" })
    .returning({ id: user.id });
  await db.insert(espace).values([
    { id: ESPACE_A, nom: "A" },
    { id: ESPACE_B, nom: "B" },
  ]);
  await db.insert(adhesion).values([
    { idEspace: ESPACE_A, idCompte: anne?.id ?? "", role: "proprietaire" },
    { idEspace: ESPACE_B, idCompte: anne?.id ?? "", role: "proprietaire" },
  ]);
}

interface Monde {
  readonly db: Db;
  readonly fermer: () => Promise<void>;
}

let monde: Monde;

beforeEach(async () => {
  const { base } = await ouvrirBaseEmbarqueeMigree();
  await peupler(base.db);
  monde = { db: base.db, fermer: () => base.fermer() };
}, DELAI_D_OUVERTURE_D_UNE_BASE_MS);

afterEach(async () => {
  await monde.fermer();
});

describe("aller-retour des instantanés", () => {
  it("F-012-AC28 un instantané de plus de 256 Kio écrit puis relu est identique octet pour octet, comparé par contenu, avec sa taille en octets et sa date", async () => {
    const { db } = monde;
    const grand = octetsDe(262_144 + 7);

    expect(await enregistrerDocument(db, enregistrement(PAGE_A, grand))).toEqual({
      issue: "cree",
    });
    const lu = await lireDocument(db, PAGE_A);

    expect(lu?.instantane).toBeInstanceOf(Uint8Array);
    expect(lu?.instantane.byteLength).toBe(grand.byteLength);
    expect(memesOctets(lu?.instantane, grand)).toBe(true);
    expect(lu?.taille).toBe(grand.byteLength);
    expect(lu?.enregistreLe).toEqual(MAINTENANT);
  });

  it("F-012-AC28 les octets limites (zéro, 0xFF, barre oblique inverse, apostrophe, guillemet) sont restitués à l'identique, à la création comme au remplacement", async () => {
    const { db } = monde;

    await enregistrerDocument(db, enregistrement(DOCUMENT_D_ESPACE_A, OCTETS_LIMITES));
    expect(
      memesOctets((await lireDocument(db, DOCUMENT_D_ESPACE_A))?.instantane, OCTETS_LIMITES),
    ).toBe(true);

    const inverses = OCTETS_LIMITES.slice().reverse();
    expect(await enregistrerDocument(db, enregistrement(DOCUMENT_D_ESPACE_A, inverses))).toEqual({
      issue: "remplace",
    });
    const lu = await lireDocument(db, DOCUMENT_D_ESPACE_A);
    expect(memesOctets(lu?.instantane, inverses)).toBe(true);
    expect(memesOctets(lu?.instantane, OCTETS_LIMITES)).toBe(false);
    expect(lu?.taille).toBe(OCTETS_LIMITES.byteLength);
  });

  it("F-012-AC28 la comparaison par contenu distingue deux instantanés qui ne diffèrent que d'un octet", () => {
    const modifie = OCTETS_LIMITES.slice();
    modifie[3] = 253;
    expect(memesOctets(OCTETS_LIMITES, OCTETS_LIMITES.slice())).toBe(true);
    expect(memesOctets(Buffer.from(OCTETS_LIMITES), OCTETS_LIMITES)).toBe(true);
    expect(memesOctets(modifie, OCTETS_LIMITES)).toBe(false);
    expect(memesOctets(OCTETS_LIMITES.slice(1), OCTETS_LIMITES)).toBe(false);
    expect(memesOctets(undefined, OCTETS_LIMITES)).toBe(false);
  });
});

describe("enregistrement", () => {
  it("F-012-AC18 un second enregistrement remplace la ligne en entier : instantané, taille et date ensemble, une seule ligne", async () => {
    const { db } = monde;
    const premier = texteEnOctets("premier état");
    const second = octetsDe(1_000);

    expect(await enregistrerDocument(db, enregistrement(PAGE_A, premier))).toEqual({
      issue: "cree",
    });
    expect(
      await enregistrerDocument(db, enregistrement(PAGE_A, second, { enregistreLe: PLUS_TARD })),
    ).toEqual({ issue: "remplace" });

    const lu = await lireDocument(db, PAGE_A);
    expect(memesOctets(lu?.instantane, second)).toBe(true);
    expect(lu?.taille).toBe(1_000);
    expect(lu?.enregistreLe).toEqual(PLUS_TARD);
    expect(await lignes(db)).toEqual([{ idEspace: ESPACE_A, type: "page", idDocument: PAGE }]);
  });

  it("F-012-AC18 F-012-AC21 un enregistrement qui échoue en base lève une erreur typée et laisse la ligne stockée intacte", async () => {
    const { db } = monde;
    const stocke = texteEnOctets("état stocké");
    await enregistrerDocument(db, enregistrement(PAGE_A, stocke));
    // Le remplacement par un instantané de plus de 20 octets est refusé par la base.
    await db.execute(
      sql`alter table "document" add constraint "essai_refus" check (octet_length("instantane") <= 20)`,
    );

    const erreur = await echecDe(
      enregistrerDocument(db, enregistrement(PAGE_A, octetsDe(21), { enregistreLe: PLUS_TARD })),
    );

    expect(erreur).toBeInstanceOf(ErreurBase);
    expect(erreur).toMatchObject({ code: "requete-echouee" });
    const lu = await lireDocument(db, PAGE_A);
    expect(memesOctets(lu?.instantane, stocke)).toBe(true);
    expect(lu?.enregistreLe).toEqual(MAINTENANT);
  });

  it("F-012-AC28 un instantané vide s'enregistre, de taille zéro", async () => {
    const { db } = monde;

    expect(await enregistrerDocument(db, enregistrement(TABLE_A, new Uint8Array()))).toEqual({
      issue: "cree",
    });
    const lu = await lireDocument(db, TABLE_A);
    expect(lu?.taille).toBe(0);
    expect(lu?.instantane.byteLength).toBe(0);
  });
});

describe("clé de stockage", () => {
  it("F-012-AC8 page:<A>:<p> et page:<B>:<p> sont deux documents : lire celui de A ne rend jamais un octet de celui de B", async () => {
    const { db } = monde;
    const deB = texteEnOctets(`${MARQUE} de B`);
    await enregistrerDocument(db, enregistrement(PAGE_B, deB));

    expect(await lireDocument(db, PAGE_A)).toBeUndefined();

    const deA = texteEnOctets("page de A");
    expect(await enregistrerDocument(db, enregistrement(PAGE_A, deA))).toEqual({ issue: "cree" });
    expect(memesOctets((await lireDocument(db, PAGE_A))?.instantane, deA)).toBe(true);
    expect(memesOctets((await lireDocument(db, PAGE_B))?.instantane, deB)).toBe(true);
    expect(await lignes(db)).toEqual([
      { idEspace: ESPACE_A, type: "page", idDocument: PAGE },
      { idEspace: ESPACE_B, type: "page", idDocument: PAGE },
    ]);
  });

  it("F-012-AC8 une table de A et une page de B de même identifiant sont deux documents ; une page et une table de même identifiant aussi", async () => {
    const { db } = monde;
    const tableB = cle(ESPACE_B, "table", PAGE);
    await enregistrerDocument(db, enregistrement(tableB, texteEnOctets(`${MARQUE} table B`)));

    expect(await lireDocument(db, TABLE_A)).toBeUndefined();

    await enregistrerDocument(db, enregistrement(TABLE_A, texteEnOctets("table A")));
    await enregistrerDocument(db, enregistrement(PAGE_A, texteEnOctets("page A")));
    expect(
      memesOctets((await lireDocument(db, TABLE_A))?.instantane, texteEnOctets("table A")),
    ).toBe(true);
    expect(memesOctets((await lireDocument(db, PAGE_A))?.instantane, texteEnOctets("page A"))).toBe(
      true,
    );
    expect(await compterDocuments(db, ESPACE_A)).toBe(2);
    expect(await compterDocuments(db, ESPACE_B)).toBe(1);
  });

  it.each<[string, CleDocument]>([
    ["un type hors liste", { ...PAGE_A, type: "image" as CleDocument["type"] }],
    ["un identifiant d'espace en majuscules", { ...PAGE_A, idEspace: ESPACE_A.toUpperCase() }],
    ["un identifiant de document qui n'est pas un UUID", { ...PAGE_A, idDocument: "page-1" }],
    ["un identifiant vide", { ...PAGE_A, idDocument: "" }],
    ["un document d'espace qui porte un autre identifiant", cle(ESPACE_A, "espace", PAGE)],
    ["un document d'espace qui porte celui d'un autre espace", cle(ESPACE_A, "espace", ESPACE_B)],
  ])(
    "F-012-AC8 F-012-AC7 une clé invalide (%s) ne désigne aucun document, sans requête",
    async (_cas, invalide) => {
      const { db } = monde;
      await monde.fermer();

      expect(await lireDocument(db, invalide)).toBeUndefined();
      expect(await enregistrerDocument(db, enregistrement(invalide, OCTETS_LIMITES))).toEqual({
        issue: "cle-invalide",
      });
      expect(await compterDocuments(db, invalide.idEspace.toUpperCase())).toBe(0);

      const { base } = await ouvrirBaseEmbarqueeMigree();
      monde = { db: base.db, fermer: () => base.fermer() };
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );
});

describe("une lecture n'écrit rien", () => {
  it("F-012-AC9 F-012-AC35 lire un document jamais stocké rend undefined et ne crée aucune ligne ; relire un document stocké laisse sa ligne inchangée, date comprise", async () => {
    const { db } = monde;

    for (const visee of [DOCUMENT_D_ESPACE_A, PAGE_A, TABLE_A, cle(INCONNU, "page", PAGE)]) {
      expect(await lireDocument(db, visee)).toBeUndefined();
    }
    expect(await db.$count(document)).toBe(0);

    await enregistrerDocument(db, enregistrement(PAGE_A, OCTETS_LIMITES));
    const avant = await db.select().from(document);
    await lireDocument(db, PAGE_A);
    await lireDocument(db, PAGE_A);
    expect(await db.select().from(document)).toEqual(avant);
  });
});

describe("plafond de documents par espace", () => {
  it("F-012-AC24 un espace qui compte déjà le plafond de documents refuse d'en créer un de plus, sans rien écrire, et accepte de remplacer l'un des siens", async () => {
    const { db } = monde;
    const plafond = { plafondDocumentsParEspace: 3 };
    for (const visee of [DOCUMENT_D_ESPACE_A, PAGE_A, TABLE_A]) {
      expect(await enregistrerDocument(db, enregistrement(visee, OCTETS_LIMITES, plafond))).toEqual(
        { issue: "cree" },
      );
    }
    expect(await compterDocuments(db, ESPACE_A)).toBe(3);

    const quatrieme = cle(ESPACE_A, "page", AUTRE_PAGE);
    expect(
      await enregistrerDocument(db, enregistrement(quatrieme, OCTETS_LIMITES, plafond)),
    ).toEqual({ issue: "quota-atteint" });
    expect(await lireDocument(db, quatrieme)).toBeUndefined();
    expect(await compterDocuments(db, ESPACE_A)).toBe(3);

    const remplacant = texteEnOctets("remplaçant");
    expect(await enregistrerDocument(db, enregistrement(PAGE_A, remplacant, plafond))).toEqual({
      issue: "remplace",
    });
    expect(memesOctets((await lireDocument(db, PAGE_A))?.instantane, remplacant)).toBe(true);
  });

  it("F-012-AC24 le plafond se compte par espace : un espace plein ne bloque pas un autre espace", async () => {
    const { db } = monde;
    const plafond = { plafondDocumentsParEspace: 2 };
    await enregistrerDocument(db, enregistrement(PAGE_A, OCTETS_LIMITES, plafond));
    await enregistrerDocument(db, enregistrement(TABLE_A, OCTETS_LIMITES, plafond));

    expect(
      await enregistrerDocument(
        db,
        enregistrement(cle(ESPACE_A, "page", TROISIEME_PAGE), OCTETS_LIMITES, plafond),
      ),
    ).toEqual({ issue: "quota-atteint" });
    expect(await enregistrerDocument(db, enregistrement(PAGE_B, OCTETS_LIMITES, plafond))).toEqual({
      issue: "cree",
    });
    expect(await compterDocuments(db, ESPACE_A)).toBe(2);
    expect(await compterDocuments(db, ESPACE_B)).toBe(1);
    expect(await compterDocuments(db, INCONNU)).toBe(0);
  });
});

describe("suppression de l'espace", () => {
  it("F-012-AC31 F-011-AC6 supprimer un espace efface ses documents en base, aucun n'en reste lisible, et laisse ceux de l'autre espace", async () => {
    const { db } = monde;
    for (const visee of [DOCUMENT_D_ESPACE_A, PAGE_A, TABLE_A, PAGE_B]) {
      await enregistrerDocument(db, enregistrement(visee, texteEnOctets(MARQUE)));
    }

    expect(await supprimerEspace(db, ESPACE_A)).toHaveLength(1);

    for (const visee of [DOCUMENT_D_ESPACE_A, PAGE_A, TABLE_A]) {
      expect(await lireDocument(db, visee)).toBeUndefined();
    }
    expect(await compterDocuments(db, ESPACE_A)).toBe(0);
    expect(await lignes(db)).toEqual([{ idEspace: ESPACE_B, type: "page", idDocument: PAGE }]);
    expect(
      await db.$count(document, and(eq(document.idEspace, ESPACE_A), eq(document.type, "page"))),
    ).toBe(0);
  });

  it("F-012-AC21 F-012-AC31 un enregistrement qui arrive après la suppression de l'espace est abandonné : ni l'espace ni le document ne sont recréés", async () => {
    const { db } = monde;
    await enregistrerDocument(db, enregistrement(PAGE_A, texteEnOctets("avant")));
    await supprimerEspace(db, ESPACE_A);

    for (const visee of [PAGE_A, DOCUMENT_D_ESPACE_A, cle(INCONNU, "espace", INCONNU)]) {
      expect(await enregistrerDocument(db, enregistrement(visee, texteEnOctets(MARQUE)))).toEqual({
        issue: "espace-absent",
      });
    }
    expect(await db.$count(espace, eq(espace.id, ESPACE_A))).toBe(0);
    expect(await db.$count(espace, eq(espace.id, INCONNU))).toBe(0);
    expect(await db.$count(document)).toBe(0);
  });
});

describe("échecs de la base", () => {
  it("F-012-AC20 F-012-AC26 une lecture, un décompte ou un enregistrement qui échouent lèvent une erreur typée sans cause, sans texte SQL ni octet de l'instantané", async () => {
    const { db } = monde;
    const instantane = texteEnOctets(MARQUE);
    await enregistrerDocument(db, enregistrement(PAGE_A, instantane));
    await db.execute(sql`alter table "document" rename to "document_cache"`);

    for (const appel of [
      () => lireDocument(db, PAGE_A),
      () => compterDocuments(db, ESPACE_A),
      () => enregistrerDocument(db, enregistrement(PAGE_A, instantane)),
      () => enregistrerDocument(db, enregistrement(TABLE_A, instantane)),
    ]) {
      const erreur = await echecDe(appel());
      expect(erreur).toBeInstanceOf(ErreurBase);
      expect(erreur).toMatchObject({ code: "requete-echouee" });
      expect((erreur as ErreurBase).cause).toBeUndefined();
      // La pile nomme les fichiers traversés (dont ce test) : elle n'est cherchée que pour le
      // contenu, les autres champs aussi pour le texte SQL.
      const champs = Object.getOwnPropertyNames(erreur).filter((nom) => nom !== "stack");
      expect(JSON.stringify(erreur, champs)).not.toMatch(
        /select|update|insert|document|instantane|\$1/i,
      );
      const texte = JSON.stringify(erreur, Object.getOwnPropertyNames(erreur));
      expect(texte).not.toContain(MARQUE);
      expect(texte).not.toContain(Buffer.from(instantane).toString("hex"));
    }

    await db.execute(sql`alter table "document_cache" rename to "document"`);
    expect(memesOctets((await lireDocument(db, PAGE_A))?.instantane, instantane)).toBe(true);
  });

  it(
    "F-012-AC20 F-012-AC15 sur une base fermée, chaque fonction des documents lève une erreur typée : aucun document vide n'est rendu à la place",
    async () => {
      const { db } = monde;
      await monde.fermer();

      for (const appel of [
        () => lireDocument(db, PAGE_A),
        () => compterDocuments(db, ESPACE_A),
        () => enregistrerDocument(db, enregistrement(PAGE_A, OCTETS_LIMITES)),
      ]) {
        const erreur = await echecDe(appel());
        expect(erreur).toBeInstanceOf(ErreurBase);
        expect(erreur).toMatchObject({ code: "requete-echouee" });
      }

      const { base } = await ouvrirBaseEmbarqueeMigree();
      monde = { db: base.db, fermer: () => base.fermer() };
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );
});

// Les volets « en même temps » ne se jouent pas sur PGlite, qui sérialise les requêtes (F-012
// H11, D-002) : le verrou et la transaction sont constatés sur les requêtes envoyées.
describe("verrou et transaction", () => {
  it(
    "F-012-AC18 F-012-AC21 F-012-AC24 chaque enregistrement verrouille d'abord la ligne de l'espace, puis remplace ou compte et crée, dans une seule transaction",
    async () => {
      const requetes: string[] = [];
      const moteur = new PGlite();
      const journalise = drizzle(moteur, {
        schema: schemaComptes,
        logger: { logQuery: (requete) => requetes.push(requete) },
      });
      await migrate(journalise, { migrationsFolder: DOSSIER_MIGRATIONS });
      // Le journal de Drizzle ne voit ni l'ouverture ni la validation d'une transaction : elles
      // sont marquées autour de celle du moteur, que l'accès appelle.
      const transactionDuMoteur = moteur.transaction.bind(moteur);
      moteur.transaction = (async (rappel: Parameters<typeof transactionDuMoteur>[0]) => {
        requetes.push("begin");
        const rendu: unknown = await transactionDuMoteur(rappel);
        requetes.push("commit");
        return rendu;
      }) as typeof moteur.transaction;
      const db: Db = journalise;
      await peupler(db);
      const verrou = /^select "id" from "espace" where "espace"\."id" = \$1 for update$/;

      const suite = async (operation: () => Promise<unknown>): Promise<string[]> => {
        requetes.length = 0;
        await operation();
        return requetes.map((requete) =>
          verrou.test(requete) ? "verrou" : (/^\w+/.exec(requete)?.[0] ?? requete),
        );
      };

      expect(
        await suite(() => enregistrerDocument(db, enregistrement(PAGE_A, OCTETS_LIMITES))),
      ).toEqual(["begin", "verrou", "update", "select", "insert", "commit"]);
      expect(
        await suite(() => enregistrerDocument(db, enregistrement(PAGE_A, OCTETS_LIMITES))),
      ).toEqual(["begin", "verrou", "update", "commit"]);
      expect(
        await suite(() =>
          enregistrerDocument(
            db,
            enregistrement(TABLE_A, OCTETS_LIMITES, { plafondDocumentsParEspace: 1 }),
          ),
        ),
      ).toEqual(["begin", "verrou", "update", "select", "commit"]);
      expect(await suite(() => lireDocument(db, PAGE_A))).toEqual(["select"]);
      await moteur.close();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );
});
