// Suppression de sessions (F-009-AC33, part de `packages/db`) : la requête que la fonction de
// suppression de session d'`apps/server` appelle, hors transaction et dans une transaction.
import { describe, expect, it } from "vitest";

import { ErreurBase, ouvrirBase, schemaComptes, supprimerSessions } from "../src/index.ts";
import { ouvrirBaseEmbarqueeMigree, portFerme, type BaseEmbarquee } from "./essai.ts";

const MOT_DE_PASSE = "mot-de-passe-de-test";
const ID_INCONNU = "00000000-0000-4000-8000-000000000000";
const DANS_UNE_HEURE = new Date(Date.now() + 3_600_000);
const DELAI_MAXIMAL_DU_CAS_MS = 10_000;
// Chaque base embarquée est une instance PGlite neuve. La première du fichier compile le
// WebAssembly et fait un initdb : 1,6 à 5,6 s mesurés seul sur 4 CPU, plusieurs fois plus quand
// toute la suite tourne en parallèle. Un test qui ouvre sa base dans son corps a donc ce délai
// explicite, comme dans `migration.test.ts` et `acces.test.ts`.
const DELAI_D_OUVERTURE_D_UNE_BASE_MS = 30_000;

const { user, session } = schemaComptes;
type Db = BaseEmbarquee["base"]["db"];

interface Peuplement {
  readonly db: Db;
  readonly fermer: () => Promise<void>;
  // Identifiant de compte, puis identifiant de chaque session par son jeton.
  readonly anne: string;
  readonly bob: string;
  readonly sessions: Readonly<Record<string, string>>;
}

async function creerCompte(db: Db, email: string): Promise<string> {
  const [cree] = await db.insert(user).values({ name: "Essai", email }).returning({ id: user.id });
  expect(cree).toBeDefined();
  return cree?.id ?? "";
}

// Deux comptes : Anne a deux sessions (`anne-1`, `anne-2`), Bob une (`bob-1`).
async function peupler(): Promise<Peuplement> {
  const { base } = await ouvrirBaseEmbarqueeMigree();
  const anne = await creerCompte(base.db, "anne@exemple.test");
  const bob = await creerCompte(base.db, "bob@exemple.test");
  const creees = await base.db
    .insert(session)
    .values(
      [
        [anne, "anne-1"],
        [anne, "anne-2"],
        [bob, "bob-1"],
      ].map(([userId = "", token = ""]) => ({ userId, token, expiresAt: DANS_UNE_HEURE })),
    )
    .returning({ id: session.id, token: session.token });
  const sessions = Object.fromEntries(creees.map(({ id, token }) => [token, id]));
  return { db: base.db, fermer: () => base.fermer(), anne, bob, sessions };
}

async function jetonsRestants(db: Db): Promise<string[]> {
  const lignes = await db.select({ token: session.token }).from(session).orderBy(session.token);
  return lignes.map((ligne) => ligne.token);
}

async function echecDe(promesse: Promise<unknown>): Promise<ErreurBase> {
  const issue = await promesse.then(
    () => "la promesse a abouti",
    (erreur: unknown) => erreur,
  );
  expect(issue).toBeInstanceOf(ErreurBase);
  return issue as ErreurBase;
}

describe("suppression de sessions", () => {
  it(
    "F-009-AC33 une session visée par son identifiant est supprimée seule et rendue par son identifiant et celui de son compte, sans son jeton",
    async () => {
      const { db, fermer, anne, sessions } = await peupler();

      const supprimees = await supprimerSessions(db, { idSession: sessions["anne-1"] ?? "" });

      expect(supprimees).toEqual([{ idSession: sessions["anne-1"], idCompte: anne }]);
      expect(await jetonsRestants(db)).toEqual(["anne-2", "bob-1"]);
      await fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );

  it(
    "F-009-AC33 toutes les sessions d'un compte sont supprimées et rendues une à une, celles des autres comptes restent",
    async () => {
      const { db, fermer, anne, sessions } = await peupler();

      const supprimees = await supprimerSessions(db, { idCompte: anne });

      expect([...supprimees].sort((a, b) => a.idSession.localeCompare(b.idSession))).toEqual(
        [
          { idSession: sessions["anne-1"] ?? "", idCompte: anne },
          { idSession: sessions["anne-2"] ?? "", idCompte: anne },
        ].sort((a, b) => a.idSession.localeCompare(b.idSession)),
      );
      expect(await jetonsRestants(db)).toEqual(["bob-1"]);
      await fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );

  it(
    "F-009-AC33 F-009-AC13 une session inconnue ou déjà supprimée ne supprime rien et rend une liste vide",
    async () => {
      const { db, fermer, sessions } = await peupler();
      const visee = { idSession: sessions["bob-1"] ?? "" };
      expect(await supprimerSessions(db, visee)).toHaveLength(1);

      expect(await supprimerSessions(db, visee)).toEqual([]);
      expect(await supprimerSessions(db, { idSession: ID_INCONNU })).toEqual([]);
      expect(await supprimerSessions(db, { idCompte: ID_INCONNU })).toEqual([]);

      expect(await jetonsRestants(db)).toEqual(["anne-1", "anne-2"]);
      await fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );

  it(
    "F-009-AC33 dans une transaction annulée la suppression n'est pas acquise ; dans une transaction validée elle l'est",
    async () => {
      const { db, fermer, anne, bob } = await peupler();
      const annulation = new Error("annulation voulue");

      const annulee = db.transaction(async (transaction) => {
        expect(await supprimerSessions(transaction, { idCompte: anne })).toHaveLength(2);
        expect(await jetonsRestants(transaction)).toEqual(["bob-1"]);
        throw annulation;
      });
      await expect(annulee).rejects.toBe(annulation);
      expect(await jetonsRestants(db)).toEqual(["anne-1", "anne-2", "bob-1"]);

      const validees = await db.transaction((transaction) =>
        supprimerSessions(transaction, { idCompte: bob }),
      );
      expect(validees).toHaveLength(1);
      expect(await jetonsRestants(db)).toEqual(["anne-1", "anne-2"]);
      await fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );

  it(
    "F-009-AC33 F-009-AC19 une requête que la base refuse lève une erreur typée sans cause, qui ne porte ni le texte SQL ni l'identifiant, et ne supprime rien",
    async () => {
      const { db, fermer } = await peupler();
      const malForme = "pas-un-uuid-0d4f";

      const erreur = await echecDe(supprimerSessions(db, { idSession: malForme }));

      expect(erreur.code).toBe("requete-echouee");
      expect(erreur.message).toBe("La requête à la base a échoué.");
      expect(erreur.cause).toBeUndefined();
      expect(JSON.stringify(erreur, Object.getOwnPropertyNames(erreur))).not.toMatch(
        /pas-un-uuid|delete from|returning|params/i,
      );
      expect(await jetonsRestants(db)).toEqual(["anne-1", "anne-2", "bob-1"]);
      await fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );

  it(
    "F-009-AC33 F-008-AC17 par le pilote pg vers un port fermé, l'erreur levée est typée, sans cause, sans l'URL de connexion ni le mot de passe",
    async () => {
      const url = `postgres://essai:${MOT_DE_PASSE}@127.0.0.1:${await portFerme()}/essai`;
      const base = ouvrirBase(url);

      const erreur = await echecDe(supprimerSessions(base.db, { idCompte: ID_INCONNU }));

      expect(erreur.code).toBe("requete-echouee");
      expect(erreur.cause).toBeUndefined();
      const texte = JSON.stringify(erreur, Object.getOwnPropertyNames(erreur));
      expect(texte).not.toContain(MOT_DE_PASSE);
      expect(texte).not.toContain("127.0.0.1");
      await base.fermer();
    },
    DELAI_MAXIMAL_DU_CAS_MS,
  );
});
