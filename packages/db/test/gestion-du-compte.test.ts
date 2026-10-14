// Requêtes de la gestion du compte (F-027, part de `packages/db`) : nom, empreinte du mot de passe,
// sessions d'un compte, et suppression des sessions d'un compte sauf une.
import { describe, expect, it } from "vitest";

import {
  ecrireEmpreinte,
  ErreurBase,
  lireEmpreinte,
  listerSessions,
  ouvrirBase,
  renommerCompte,
  schemaComptes,
  supprimerSessions,
  verrouillerSessionDuCompte,
} from "../src/index.ts";
import { ouvrirBaseEmbarqueeMigree, portFerme, type BaseEmbarquee } from "./essai.ts";

const ID_INCONNU = "00000000-0000-4000-8000-000000000000";
const MAINTENANT = new Date("2026-10-14T08:00:00.000Z");
const minutes = (n: number): Date => new Date(MAINTENANT.getTime() + n * 60_000);
// Voir `sessions.test.ts` : une base embarquée neuve par test.
const DELAI_D_OUVERTURE_D_UNE_BASE_MS = 30_000;
const DELAI_MAXIMAL_DU_CAS_MS = 10_000;
const MOT_DE_PASSE = "mot-de-passe-de-test";

const { user, session, account } = schemaComptes;
type Db = BaseEmbarquee["base"]["db"];

interface Peuplement {
  readonly db: Db;
  readonly fermer: () => Promise<void>;
  readonly anne: string;
  readonly bob: string;
  // Identifiant de chaque session par son jeton.
  readonly sessions: Readonly<Record<string, string>>;
}

// Un compte et sa ligne de mot de passe, telle que l'inscription native l'écrit (MEMORY/VEILLE.md).
async function creerCompte(db: Db, email: string): Promise<string> {
  const [cree] = await db.insert(user).values({ name: "Essai", email }).returning({ id: user.id });
  const id = cree?.id ?? "";
  await db.insert(account).values({
    userId: id,
    providerId: "credential",
    accountId: id,
    password: `empreinte-${email}`,
  });
  return id;
}

// Anne : `anne-recente` (prolongée il y a 1 min), `anne-ancienne` (prolongée il y a 10 min),
// `anne-expiree` (expirée il y a 1 min). Bob : `bob-1`.
async function peupler(): Promise<Peuplement> {
  const { base } = await ouvrirBaseEmbarqueeMigree();
  const anne = await creerCompte(base.db, "anne@exemple.test");
  const bob = await creerCompte(base.db, "bob@exemple.test");
  const lignes = [
    { userId: anne, token: "anne-recente", updatedAt: minutes(-1), expiresAt: minutes(60) },
    { userId: anne, token: "anne-ancienne", updatedAt: minutes(-10), expiresAt: minutes(60) },
    { userId: anne, token: "anne-expiree", updatedAt: minutes(-120), expiresAt: minutes(-1) },
    { userId: bob, token: "bob-1", updatedAt: minutes(-5), expiresAt: minutes(60) },
  ].map((ligne) => ({
    ...ligne,
    createdAt: minutes(-200),
    ipAddress: "203.0.113.7",
    userAgent: "Navigateur <script>",
  }));
  const creees = await base.db
    .insert(session)
    .values(lignes)
    .returning({ id: session.id, token: session.token });
  const sessions = Object.fromEntries(creees.map(({ id, token }) => [token, id]));
  return { db: base.db, fermer: () => base.fermer(), anne, bob, sessions };
}

async function jetonsRestants(db: Db): Promise<string[]> {
  const lignes = await db.select({ token: session.token }).from(session).orderBy(session.token);
  return lignes.map((ligne) => ligne.token);
}

const triees = (ids: readonly (string | undefined)[]): string[] => ids.map((id) => id ?? "").sort();

describe("nom et empreinte d'un compte", () => {
  it(
    "F-027-AC1 F-027-AC2 le nom seul change ; le courriel, l'état de vérification, l'identifiant et l'autre compte restent",
    async () => {
      const { db, fermer, anne, bob } = await peupler();
      const avant = await db.select().from(user).orderBy(user.email);

      expect(await renommerCompte(db, anne, "Anne B.")).toEqual({
        id: anne,
        nom: "Anne B.",
        courriel: "anne@exemple.test",
      });

      const apres = await db.select().from(user).orderBy(user.email);
      expect(
        apres.map(({ id, name, email, emailVerified, image }) => [
          id,
          name,
          email,
          emailVerified,
          image,
        ]),
      ).toEqual([
        [anne, "Anne B.", avant[0]?.email, avant[0]?.emailVerified, avant[0]?.image],
        [bob, "Essai", avant[1]?.email, avant[1]?.emailVerified, avant[1]?.image],
      ]);
      expect(await renommerCompte(db, ID_INCONNU, "x")).toBeUndefined();
      expect(await renommerCompte(db, "pas-un-uuid", "x")).toBeUndefined();
      await fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );

  it(
    "F-027-AC4 F-027-AC14 l'empreinte est lue et remplacée sur la ligne de mot de passe du compte seul",
    async () => {
      const { db, fermer, anne, bob } = await peupler();

      expect(await lireEmpreinte(db, anne)).toBe("empreinte-anne@exemple.test");
      expect(await ecrireEmpreinte(db, anne, "nouvelle")).toBe(true);
      expect(await lireEmpreinte(db, anne)).toBe("nouvelle");
      expect(await lireEmpreinte(db, bob)).toBe("empreinte-bob@exemple.test");
      expect(await lireEmpreinte(db, ID_INCONNU)).toBeUndefined();
      expect(await lireEmpreinte(db, "pas-un-uuid")).toBeUndefined();
      expect(await ecrireEmpreinte(db, ID_INCONNU, "x")).toBe(false);
      expect(await ecrireEmpreinte(db, "pas-un-uuid", "x")).toBe(false);
      await fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );

  it(
    "F-027-AC4 une ligne d'un autre fournisseur ou d'un autre accountId n'est ni lue ni écrite",
    async () => {
      const { db, fermer, anne } = await peupler();
      await db.delete(account);
      await db.insert(account).values([
        { userId: anne, providerId: "github", accountId: anne, password: "a" },
        { userId: anne, providerId: "credential", accountId: "autre", password: "b" },
      ]);

      expect(await lireEmpreinte(db, anne)).toBeUndefined();
      expect(await ecrireEmpreinte(db, anne, "x")).toBe(false);
      const restantes = await db.select({ password: account.password }).from(account);
      expect(restantes.map(({ password }) => password).sort()).toEqual(["a", "b"]);
      await fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );

  it(
    "F-027-AC4 F-027-AC17 dans une transaction annulée ni l'empreinte ni la suppression des autres sessions ne sont acquises ; validée, les deux le sont",
    async () => {
      const { db, fermer, anne, sessions } = await peupler();
      const annulation = new Error("annulation voulue");
      const sauf = sessions["anne-recente"] ?? "";

      const annulee = db.transaction(async (transaction) => {
        expect(await ecrireEmpreinte(transaction, anne, "nouvelle")).toBe(true);
        expect(await supprimerSessions(transaction, { idCompte: anne, sauf })).toHaveLength(2);
        throw annulation;
      });
      await expect(annulee).rejects.toBe(annulation);
      expect(await lireEmpreinte(db, anne)).toBe("empreinte-anne@exemple.test");
      expect(await jetonsRestants(db)).toHaveLength(4);

      await db.transaction(async (transaction) => {
        await ecrireEmpreinte(transaction, anne, "nouvelle");
        await supprimerSessions(transaction, { idCompte: anne, sauf });
      });
      expect(await lireEmpreinte(db, anne)).toBe("nouvelle");
      expect(await jetonsRestants(db)).toEqual(["anne-recente", "bob-1"]);
      await fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );
});

describe("sessions d'un compte", () => {
  it(
    "F-027-AC9 seules les sessions non expirées du compte sont listées, de la plus récemment prolongée à la plus ancienne, sans jeton, à la limite près",
    async () => {
      const { db, fermer, anne, sessions } = await peupler();
      const lister = (idCompte: string, limite: number) =>
        listerSessions(db, { idCompte, maintenant: MAINTENANT, limite });

      const listees = await lister(anne, 100);

      expect(listees).toEqual([
        {
          idSession: sessions["anne-recente"],
          creeLe: minutes(-200),
          prolongeeLe: minutes(-1),
          expireLe: minutes(60),
          adresseIp: "203.0.113.7",
          agentUtilisateur: "Navigateur <script>",
        },
        expect.objectContaining({ idSession: sessions["anne-ancienne"] }),
      ]);
      const texte = JSON.stringify(listees);
      for (const jeton of Object.keys(sessions)) {
        expect(texte).not.toContain(jeton);
      }
      expect(await lister(anne, 1)).toHaveLength(1);
      expect(await lister(ID_INCONNU, 100)).toEqual([]);
      expect(await lister("pas-un-uuid", 100)).toEqual([]);
      await fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );

  it(
    "F-027-AC10 F-027-AC11 F-027-AC14 une session n'est désignée que si elle est du compte et n'a pas expiré, et rien n'est supprimé",
    async () => {
      const { db, fermer, anne, sessions } = await peupler();
      const cible = (idSession: string | undefined) =>
        verrouillerSessionDuCompte(db, {
          idCompte: anne,
          idSession: idSession ?? "",
          maintenant: MAINTENANT,
        });

      expect(await cible(sessions["anne-ancienne"])).toBe(true);
      expect(await cible(sessions["anne-expiree"])).toBe(false);
      expect(await cible(sessions["bob-1"])).toBe(false);
      expect(await cible(ID_INCONNU)).toBe(false);
      expect(await cible("pas-un-uuid")).toBe(false);
      expect(
        await verrouillerSessionDuCompte(db, {
          idCompte: "pas-un-uuid",
          idSession: sessions["anne-ancienne"] ?? "",
          maintenant: MAINTENANT,
        }),
      ).toBe(false);
      expect(await jetonsRestants(db)).toHaveLength(4);
      await fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );

  it(
    "F-027-AC10 dans une transaction, la session vérifiée et verrouillée est supprimée par son identifiant",
    async () => {
      const { db, fermer, anne, sessions } = await peupler();
      const idSession = sessions["anne-ancienne"] ?? "";

      const supprimees = await db.transaction(async (transaction) => {
        const verrouillee = await verrouillerSessionDuCompte(transaction, {
          idCompte: anne,
          idSession,
          maintenant: MAINTENANT,
        });
        expect(verrouillee).toBe(true);
        return supprimerSessions(transaction, { idSession });
      });

      expect(supprimees).toEqual([{ idSession, idCompte: anne }]);
      expect(await jetonsRestants(db)).toEqual(["anne-expiree", "anne-recente", "bob-1"]);
      await fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );

  it(
    "F-027-AC4 F-027-AC12 les sessions d'un compte, expirées comprises, sont supprimées sauf celle désignée ; celles des autres comptes restent",
    async () => {
      const { db, fermer, anne, sessions } = await peupler();

      const supprimees = await supprimerSessions(db, {
        idCompte: anne,
        sauf: sessions["anne-recente"] ?? "",
      });

      expect(triees(supprimees.map(({ idSession }) => idSession))).toEqual(
        triees([sessions["anne-ancienne"], sessions["anne-expiree"]]),
      );
      expect(supprimees.every(({ idCompte }) => idCompte === anne)).toBe(true);
      expect(await jetonsRestants(db)).toEqual(["anne-recente", "bob-1"]);
      await fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );

  it(
    "F-027-AC14 F-027-AC20 F-009-AC33 couture : `sauf` qui désigne la session d'un autre compte ne la protège ni ne la supprime, et les deux formes livrées par F-009 gardent leur effet",
    async () => {
      const { db, fermer, anne, bob, sessions } = await peupler();

      // `sauf` étranger au compte : toutes les sessions d'Anne partent, celle de Bob reste.
      const etranger = await supprimerSessions(db, {
        idCompte: anne,
        sauf: sessions["bob-1"] ?? "",
      });
      expect(etranger).toHaveLength(3);
      expect(await jetonsRestants(db)).toEqual(["bob-1"]);

      // Les formes de F-009 (déconnexion, suppression d'un compte) : inchangées.
      expect(await supprimerSessions(db, { idCompte: bob })).toEqual([
        { idSession: sessions["bob-1"], idCompte: bob },
      ]);
      expect(await supprimerSessions(db, { idSession: ID_INCONNU })).toEqual([]);
      expect(await jetonsRestants(db)).toEqual([]);
      await fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );
});

describe("erreurs de la base", () => {
  it(
    "F-027-AC17 par le pilote pg vers un port fermé, chaque requête de la gestion du compte lève une erreur typée, sans cause ni URL",
    async () => {
      const base = ouvrirBase(
        `postgres://essai:${MOT_DE_PASSE}@127.0.0.1:${await portFerme()}/essai`,
      );
      const ciblee = { idCompte: ID_INCONNU, idSession: ID_INCONNU, maintenant: MAINTENANT };
      const appels: (() => Promise<unknown>)[] = [
        () => renommerCompte(base.db, ID_INCONNU, "x"),
        () => lireEmpreinte(base.db, ID_INCONNU),
        () => ecrireEmpreinte(base.db, ID_INCONNU, "x"),
        () => listerSessions(base.db, { idCompte: ID_INCONNU, maintenant: MAINTENANT, limite: 1 }),
        () => verrouillerSessionDuCompte(base.db, ciblee),
        () => supprimerSessions(base.db, { idCompte: ID_INCONNU, sauf: ID_INCONNU }),
      ];

      for (const appel of appels) {
        const issue = await appel().then(
          () => "la promesse a abouti",
          (erreur: unknown) => erreur,
        );
        expect(issue).toBeInstanceOf(ErreurBase);
        expect(issue).toMatchObject({ code: "requete-echouee" });
        expect((issue as ErreurBase).cause).toBeUndefined();
        const texte = JSON.stringify(issue, Object.getOwnPropertyNames(issue));
        expect(texte).not.toContain(MOT_DE_PASSE);
        expect(texte).not.toContain("127.0.0.1");
      }
      await base.fermer();
    },
    DELAI_MAXIMAL_DU_CAS_MS,
  );
});
