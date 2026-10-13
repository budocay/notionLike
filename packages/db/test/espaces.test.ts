// Requêtes des espaces, des membres et des invitations (F-011, part de `packages/db`) : ce que
// chaque fonction de l'entrée publique lit, écrit ou refuse sur la base embarquée migrée, sous une
// horloge fournie par le test (F-011 H10).
import { createHash } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  accepterInvitation,
  changerRole,
  creerEspace,
  creerInvitation,
  ErreurBase,
  lireAdhesion,
  listerEspaces,
  listerInvitationsEnAttente,
  listerMembres,
  renommerEspace,
  retirerMembre,
  revoquerInvitation,
  schemaComptes,
  supprimerEspace,
  type Base,
  type Role,
  type RoleInvitable,
} from "../src/index.ts";
import { DOSSIER_MIGRATIONS } from "../src/migration.ts";
import { adhesion, espace, invitation, session, user } from "../src/schema.ts";
import { ouvrirBaseEmbarqueeMigree } from "./essai.ts";

// Chaque base embarquée est une instance PGlite neuve ; la première du fichier compile le
// WebAssembly et fait un initdb, plusieurs secondes quand toute la suite tourne en parallèle.
// L'ouverture se fait dans un crochet qui a ce délai explicite, comme dans `migration.test.ts`.
const DELAI_D_OUVERTURE_D_UNE_BASE_MS = 30_000;
const ESPACE = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a01";
const AUTRE_ESPACE = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a02";
const INCONNU = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4aff";
const PLAFOND_ESPACES = 20;
const PLAFOND_MEMBRES = 4;
const PLAFOND_INVITATIONS = 3;
const MAINTENANT = new Date("2026-10-13T10:00:00.000Z");
const SEPT_JOURS_MS = 7 * 24 * 3_600_000;
const PLUS_TARD = new Date(MAINTENANT.getTime() + SEPT_JOURS_MS);
const APRES_EXPIRATION = new Date(PLUS_TARD.getTime() + 1);
const JETON_ANNE = "Ab-_0123456789abcdefghijklmnopqrstuvwxyzABC";

type Db = Base["db"];

interface Monde {
  readonly db: Db;
  readonly fermer: () => Promise<void>;
  // Anne possède ESPACE, Bob y est éditeur, Chloé lectrice ; Dan n'est membre de rien.
  readonly anne: string;
  readonly bob: string;
  readonly chloe: string;
  readonly dan: string;
}

async function creerComptes(db: Db, noms: readonly string[]): Promise<string[]> {
  const crees = await db
    .insert(user)
    .values(noms.map((nom) => ({ name: nom, email: `${nom.toLowerCase()}@exemple.test` })))
    .returning({ id: user.id });
  return crees.map((cree) => cree.id);
}

async function peupler(db: Db): Promise<Omit<Monde, "db" | "fermer">> {
  const [anne = "", bob = "", chloe = "", dan = ""] = await creerComptes(db, [
    "Anne",
    "Bob",
    "Chloe",
    "Dan",
  ]);
  await creerEspace(db, {
    idEspace: ESPACE,
    nom: "Équipe",
    idCompte: anne,
    plafondEspacesPossedes: PLAFOND_ESPACES,
  });
  await db.insert(adhesion).values([
    { idEspace: ESPACE, idCompte: bob, role: "editeur" },
    { idEspace: ESPACE, idCompte: chloe, role: "lecteur" },
  ]);
  return { anne, bob, chloe, dan };
}

const inviter = (db: Db, jeton: string, role: RoleInvitable = "editeur", idEspace = ESPACE) =>
  creerInvitation(db, {
    idEspace,
    role,
    jeton,
    creeLe: MAINTENANT,
    expireLe: PLUS_TARD,
    plafondInvitationsEnAttente: PLAFOND_INVITATIONS,
  });

const accepter = (db: Db, jeton: string, idCompte: string, maintenant = MAINTENANT) =>
  accepterInvitation(db, { jeton, idCompte, maintenant, plafondMembres: PLAFOND_MEMBRES });

const jetonNumero = (rang: number) => `${JETON_ANNE.slice(0, -3)}${String(rang).padStart(3, "0")}`;

async function roles(db: Db, idEspace = ESPACE): Promise<Record<string, Role>> {
  const lignes = await db.select().from(adhesion).where(eq(adhesion.idEspace, idEspace));
  return Object.fromEntries(lignes.map((ligne) => [ligne.idCompte, ligne.role]));
}

async function echecDe(promesse: Promise<unknown>): Promise<unknown> {
  return promesse.then(
    () => "la promesse a abouti",
    (erreur: unknown) => erreur,
  );
}

let monde: Monde;

beforeEach(async () => {
  const { base } = await ouvrirBaseEmbarqueeMigree();
  monde = { db: base.db, fermer: () => base.fermer(), ...(await peupler(base.db)) };
}, DELAI_D_OUVERTURE_D_UNE_BASE_MS);

afterEach(async () => {
  await monde.fermer();
});

describe("espaces", () => {
  it("F-011-AC1 crée l'espace sous l'identifiant fourni et l'adhésion propriétaire de son créateur", async () => {
    const { db, dan } = monde;

    const issue = await creerEspace(db, {
      idEspace: AUTRE_ESPACE,
      nom: "Projet",
      idCompte: dan,
      plafondEspacesPossedes: PLAFOND_ESPACES,
    });

    expect(issue).toEqual({
      issue: "cree",
      espace: { idEspace: AUTRE_ESPACE, nom: "Projet", role: "proprietaire" },
    });
    expect(await db.select().from(espace).where(eq(espace.id, AUTRE_ESPACE))).toEqual([
      { id: AUTRE_ESPACE, nom: "Projet" },
    ]);
    expect(await roles(db, AUTRE_ESPACE)).toEqual({ [dan]: "proprietaire" });
  });

  it("F-011-AC1 l'espace et l'adhésion sont écrits dans une même transaction : si l'adhésion échoue, l'espace n'existe pas", async () => {
    const { db } = monde;

    const erreur = await echecDe(
      creerEspace(db, {
        idEspace: AUTRE_ESPACE,
        nom: "Orphelin",
        idCompte: INCONNU,
        plafondEspacesPossedes: PLAFOND_ESPACES,
      }),
    );

    expect(erreur).toBeInstanceOf(ErreurBase);
    expect(await db.$count(espace, eq(espace.id, AUTRE_ESPACE))).toBe(0);
  });

  it("F-011-AC2 rejouée par son propriétaire, la création rend l'état actuel sans rien modifier ; par tout autre compte, identifiant-indisponible sans rien modifier", async () => {
    const { db, anne, bob, chloe, dan } = monde;
    const avant = await roles(db);
    const rejouer = (idCompte: string) =>
      creerEspace(db, {
        idEspace: ESPACE,
        nom: "Autre nom",
        idCompte,
        plafondEspacesPossedes: PLAFOND_ESPACES,
      });

    expect(await rejouer(anne)).toEqual({
      issue: "existant",
      espace: { idEspace: ESPACE, nom: "Équipe", role: "proprietaire" },
    });
    for (const idCompte of [bob, chloe, dan]) {
      expect(await rejouer(idCompte)).toEqual({ issue: "identifiant-indisponible" });
    }
    expect(await db.select().from(espace)).toEqual([{ id: ESPACE, nom: "Équipe" }]);
    expect(await roles(db)).toEqual(avant);
  });

  it("F-011-AC7 un compte qui possède déjà le plafond d'espaces n'en crée pas d'autre, mais rejoue encore les siens ; une adhésion d'éditeur ne compte pas", async () => {
    const { db, anne, bob } = monde;
    const creer = (idCompte: string, rang: number) =>
      creerEspace(db, {
        idEspace: `6f1c2a8e-3b4d-4e5f-8a9b-${String(rang).padStart(12, "0")}`,
        nom: `Espace ${rang}`,
        idCompte,
        plafondEspacesPossedes: PLAFOND_ESPACES,
      });
    for (let rang = 1; rang < PLAFOND_ESPACES; rang += 1) {
      expect((await creer(anne, rang)).issue).toBe("cree");
    }
    // Bob est éditeur d'ESPACE : il peut encore en posséder PLAFOND_ESPACES.
    expect((await creer(bob, 100)).issue).toBe("cree");

    expect(await creer(anne, PLAFOND_ESPACES)).toEqual({ issue: "quota-atteint" });
    expect((await creer(anne, 1)).issue).toBe("existant");
    expect(await db.$count(adhesion, eq(adhesion.idCompte, anne))).toBe(PLAFOND_ESPACES);
  });

  it("F-011-AC3 F-011-AC4 F-011-AC9 chaque membre lit l'espace avec son rôle, lu en base à chaque appel ; un compte sans adhésion a une liste vide", async () => {
    const { db, anne, bob, chloe, dan } = monde;
    await creerEspace(db, {
      idEspace: AUTRE_ESPACE,
      nom: "Archive",
      idCompte: bob,
      plafondEspacesPossedes: PLAFOND_ESPACES,
    });

    expect(await listerEspaces(db, bob)).toEqual([
      { idEspace: AUTRE_ESPACE, nom: "Archive", role: "proprietaire" },
      { idEspace: ESPACE, nom: "Équipe", role: "editeur" },
    ]);
    expect(await listerEspaces(db, anne)).toEqual([
      { idEspace: ESPACE, nom: "Équipe", role: "proprietaire" },
    ]);
    expect(await listerEspaces(db, dan)).toEqual([]);
    expect(await lireAdhesion(db, ESPACE, chloe)).toEqual({
      idEspace: ESPACE,
      nom: "Équipe",
      role: "lecteur",
    });

    await changerRole(db, { idEspace: ESPACE, idCompte: chloe, role: "editeur" });
    expect((await lireAdhesion(db, ESPACE, chloe))?.role).toBe("editeur");
  });

  it.each([
    ["un non-membre d'un espace existant", ESPACE, "dan"],
    ["un espace qui n'existe pas", INCONNU, "anne"],
    ["une valeur qui n'est pas un UUID", "pas-un-uuid", "anne"],
    ["un UUID en majuscules", ESPACE.toUpperCase(), "anne"],
    ["une injection", `${ESPACE}' or '1'='1`, "anne"],
  ] as const)(
    "F-011-AC12 aucune adhésion n'est lue pour %s, sans erreur",
    async (_cas, idEspace, qui) => {
      expect(await lireAdhesion(monde.db, idEspace, monde[qui])).toBeUndefined();
    },
  );

  it("F-011-AC5 enregistre le nom ; un espace inconnu n'est pas renommé", async () => {
    const { db } = monde;

    expect(await renommerEspace(db, ESPACE, "Nouveau nom")).toEqual({
      idEspace: ESPACE,
      nom: "Nouveau nom",
    });
    expect(await renommerEspace(db, INCONNU, "Rien")).toBeUndefined();
    expect(await renommerEspace(db, "pas-un-uuid", "Rien")).toBeUndefined();
    expect(await db.select().from(espace)).toEqual([{ id: ESPACE, nom: "Nouveau nom" }]);
  });

  it("F-011-AC6 F-011-AC12 supprime l'espace, ses adhésions et ses invitations, rend les adhésions supprimées ; l'espace se lit ensuite comme inconnu, et son identifiant redevient disponible", async () => {
    const { db, anne, bob, chloe, dan } = monde;
    await inviter(db, JETON_ANNE);

    const supprimees = await supprimerEspace(db, ESPACE);

    expect(supprimees?.map((s) => s.idCompte).sort()).toEqual([anne, bob, chloe].sort());
    expect(supprimees?.find((s) => s.idCompte === anne)).toEqual({
      idEspace: ESPACE,
      idCompte: anne,
      role: "proprietaire",
    });
    expect(await db.$count(espace)).toBe(0);
    expect(await db.$count(adhesion)).toBe(0);
    expect(await db.$count(invitation)).toBe(0);
    for (const ancien of [anne, bob, chloe]) {
      expect(await lireAdhesion(db, ESPACE, ancien)).toBeUndefined();
    }
    expect(await supprimerEspace(db, ESPACE)).toBeUndefined();
    expect(
      await creerEspace(db, {
        idEspace: ESPACE,
        nom: "Repris",
        idCompte: dan,
        plafondEspacesPossedes: PLAFOND_ESPACES,
      }),
    ).toEqual({
      issue: "cree",
      espace: { idEspace: ESPACE, nom: "Repris", role: "proprietaire" },
    });
    expect(await roles(db)).toEqual({ [dan]: "proprietaire" });
  });
});

describe("membres", () => {
  it("F-011-AC14 la liste porte l'identifiant, le nom et le rôle de chaque membre, le courriel seulement quand il est demandé, aucun autre champ", async () => {
    const { db, anne, bob, chloe } = monde;

    expect(await listerMembres(db, ESPACE, { avecCourriel: false })).toEqual([
      { idCompte: anne, nom: "Anne", role: "proprietaire" },
      { idCompte: bob, nom: "Bob", role: "editeur" },
      { idCompte: chloe, nom: "Chloe", role: "lecteur" },
    ]);
    expect(await listerMembres(db, ESPACE, { avecCourriel: true })).toEqual([
      { idCompte: anne, nom: "Anne", role: "proprietaire", courriel: "anne@exemple.test" },
      { idCompte: bob, nom: "Bob", role: "editeur", courriel: "bob@exemple.test" },
      { idCompte: chloe, nom: "Chloe", role: "lecteur", courriel: "chloe@exemple.test" },
    ]);
    expect(await listerMembres(db, INCONNU, { avecCourriel: true })).toEqual([]);
    expect(await listerMembres(db, "pas-un-uuid", { avecCourriel: true })).toEqual([]);
  });

  it("F-011-AC15 enregistre le rôle et rend le membre à jour ; un second propriétaire peut être nommé", async () => {
    const { db, anne, bob, chloe } = monde;

    expect(await changerRole(db, { idEspace: ESPACE, idCompte: chloe, role: "editeur" })).toEqual({
      issue: "fait",
      membre: { idCompte: chloe, nom: "Chloe", role: "editeur", courriel: "chloe@exemple.test" },
      roleAvant: "lecteur",
    });
    expect(
      (await changerRole(db, { idEspace: ESPACE, idCompte: bob, role: "proprietaire" })).issue,
    ).toBe("fait");
    expect(await roles(db)).toEqual({
      [anne]: "proprietaire",
      [bob]: "proprietaire",
      [chloe]: "editeur",
    });
  });

  it("F-011-AC17 le dernier propriétaire ne peut ni être rétrogradé ni se retirer ; de deux propriétaires qui se rétrogradent l'un après l'autre, le second est refusé", async () => {
    const { db, anne, bob } = monde;
    const avant = await roles(db);

    expect(await changerRole(db, { idEspace: ESPACE, idCompte: anne, role: "editeur" })).toEqual({
      issue: "dernier-proprietaire",
    });
    expect(await retirerMembre(db, { idEspace: ESPACE, idCompte: anne })).toEqual({
      issue: "dernier-proprietaire",
    });
    expect(await roles(db)).toEqual(avant);

    await changerRole(db, { idEspace: ESPACE, idCompte: bob, role: "proprietaire" });
    const [premier, second] = await Promise.all([
      changerRole(db, { idEspace: ESPACE, idCompte: anne, role: "lecteur" }),
      changerRole(db, { idEspace: ESPACE, idCompte: bob, role: "lecteur" }),
    ]);
    expect([premier?.issue, second?.issue]).toEqual(["fait", "dernier-proprietaire"]);
    expect(await db.$count(adhesion, sql`${adhesion.role} = 'proprietaire'`)).toBe(1);
  });

  it("F-011-AC16 F-011-AC18 retire un membre, qui devient non-membre dès l'appel suivant, son compte et ses sessions intacts ; un membre se retire lui-même", async () => {
    const { db, anne, bob, chloe } = monde;
    await db.insert(session).values({ userId: bob, token: "jeton-bob", expiresAt: PLUS_TARD });

    expect(await retirerMembre(db, { idEspace: ESPACE, idCompte: bob })).toEqual({
      issue: "fait",
      adhesion: { idEspace: ESPACE, idCompte: bob, role: "editeur" },
    });
    expect(await lireAdhesion(db, ESPACE, bob)).toBeUndefined();
    expect(await db.$count(user, eq(user.id, bob))).toBe(1);
    expect(await db.$count(session, eq(session.userId, bob))).toBe(1);

    expect((await retirerMembre(db, { idEspace: ESPACE, idCompte: chloe })).issue).toBe("fait");
    expect(await roles(db)).toEqual({ [anne]: "proprietaire" });
  });

  it("F-011-AC13 un compte qui n'est pas membre de l'espace, qu'il le soit ailleurs ou non, est introuvable, et rien n'est modifié dans aucun espace", async () => {
    const { db, anne, dan } = monde;
    await creerEspace(db, {
      idEspace: AUTRE_ESPACE,
      nom: "Ailleurs",
      idCompte: dan,
      plafondEspacesPossedes: PLAFOND_ESPACES,
    });
    const avant = [await roles(db), await roles(db, AUTRE_ESPACE)];

    for (const idCompte of [dan, INCONNU, "pas-un-uuid"]) {
      expect(await changerRole(db, { idEspace: ESPACE, idCompte, role: "lecteur" })).toEqual({
        issue: "membre-introuvable",
      });
      expect(await retirerMembre(db, { idEspace: ESPACE, idCompte })).toEqual({
        issue: "membre-introuvable",
      });
    }
    expect(await retirerMembre(db, { idEspace: INCONNU, idCompte: anne })).toEqual({
      issue: "espace-introuvable",
    });
    expect([await roles(db), await roles(db, AUTRE_ESPACE)]).toEqual(avant);
  });
});

describe("invitations", () => {
  it("F-011-AC19 crée l'invitation et n'en garde que l'empreinte SHA-256 des caractères du jeton, jamais le jeton ; la réponse ne porte ni l'un ni l'autre", async () => {
    const { db } = monde;

    const issue = await inviter(db, JETON_ANNE, "lecteur");

    expect(issue).toEqual({
      issue: "creee",
      invitation: {
        idInvitation: expect.any(String),
        role: "lecteur",
        creeLe: MAINTENANT,
        expireLe: PLUS_TARD,
      },
    });
    const [ligne] = await db.select().from(invitation);
    expect(ligne?.empreinte).toBe(createHash("sha256").update(JETON_ANNE).digest("hex"));
    const texte = JSON.stringify(await db.execute(sql`select * from invitation`));
    expect(texte).not.toContain(JETON_ANNE);
    expect(JSON.stringify(issue)).not.toContain(ligne?.empreinte ?? "");
  });

  it("F-011-AC19 F-011-AC30 la base refuse une invitation au rôle propriétaire, par une erreur typée sans détail", async () => {
    const erreur = await echecDe(inviter(monde.db, JETON_ANNE, "proprietaire" as RoleInvitable));

    expect(erreur).toBeInstanceOf(ErreurBase);
    expect(erreur).toMatchObject({ code: "requete-echouee" });
    expect((erreur as Error).cause).toBeUndefined();
    expect(await monde.db.$count(invitation)).toBe(0);
  });

  it("F-011-AC20 F-011-AC13 la liste ne porte que les invitations en attente ; seule une invitation en attente de cet espace est révoquée", async () => {
    const { db, dan } = monde;
    const enAttente = await inviter(db, jetonNumero(1));
    const acceptee = await inviter(db, jetonNumero(2), "lecteur");
    const revoquee = await inviter(db, jetonNumero(3));
    await accepter(db, jetonNumero(2), dan);
    const id = (issue: Awaited<ReturnType<typeof inviter>>) =>
      issue.issue === "creee" ? issue.invitation.idInvitation : "";
    await revoquerInvitation(db, {
      idEspace: ESPACE,
      idInvitation: id(revoquee),
      maintenant: MAINTENANT,
    });
    await creerEspace(db, {
      idEspace: AUTRE_ESPACE,
      nom: "Ailleurs",
      idCompte: dan,
      plafondEspacesPossedes: PLAFOND_ESPACES,
    });
    const ailleurs = await inviter(db, jetonNumero(4), "lecteur", AUTRE_ESPACE);

    expect(await listerInvitationsEnAttente(db, ESPACE, MAINTENANT)).toEqual([
      { idInvitation: id(enAttente), role: "editeur", creeLe: MAINTENANT, expireLe: PLUS_TARD },
    ]);
    expect(await listerInvitationsEnAttente(db, ESPACE, PLUS_TARD)).toEqual([]);
    for (const visee of [id(acceptee), id(revoquee), id(ailleurs), INCONNU, "pas-un-uuid"]) {
      expect(
        await revoquerInvitation(db, {
          idEspace: ESPACE,
          idInvitation: visee,
          maintenant: MAINTENANT,
        }),
      ).toBeUndefined();
    }
    expect(
      await revoquerInvitation(db, {
        idEspace: ESPACE,
        idInvitation: id(enAttente),
        maintenant: PLUS_TARD,
      }),
    ).toBeUndefined();
    expect(await listerInvitationsEnAttente(db, AUTRE_ESPACE, MAINTENANT)).toHaveLength(1);

    expect(
      await revoquerInvitation(db, {
        idEspace: ESPACE,
        idInvitation: id(enAttente),
        maintenant: MAINTENANT,
      }),
    ).toMatchObject({
      idInvitation: id(enAttente),
    });
    expect(await listerInvitationsEnAttente(db, ESPACE, MAINTENANT)).toEqual([]);
  });

  it("F-011-AC21 l'acceptation crée l'adhésion au rôle de l'invitation et la marque acceptée", async () => {
    const { db, dan } = monde;
    await inviter(db, JETON_ANNE, "lecteur");

    const issue = await accepter(db, JETON_ANNE, dan);

    expect(issue).toEqual({
      issue: "acceptee",
      espace: { idEspace: ESPACE, nom: "Équipe", role: "lecteur" },
      idInvitation: expect.any(String),
    });
    expect((await roles(db))[dan]).toBe("lecteur");
    expect(await db.select({ accepteeLe: invitation.accepteeLe }).from(invitation)).toEqual([
      { accepteeLe: MAINTENANT },
    ]);
  });

  it("F-011-AC22 un jeton inconnu, déjà accepté, révoqué ou expiré est invalide, sans adhésion créée", async () => {
    const { db, anne, dan } = monde;
    await inviter(db, jetonNumero(1));
    await accepter(db, jetonNumero(1), dan);
    const revoquee = await inviter(db, jetonNumero(2));
    if (revoquee.issue === "creee") {
      await revoquerInvitation(db, {
        idEspace: ESPACE,
        idInvitation: revoquee.invitation.idInvitation,
        maintenant: MAINTENANT,
      });
    }
    await inviter(db, jetonNumero(3));
    const [eve = ""] = await creerComptes(db, ["Eve"]);
    const avant = await roles(db);

    for (const [jeton, maintenant] of [
      [jetonNumero(9), MAINTENANT],
      [jetonNumero(1), MAINTENANT],
      [jetonNumero(2), MAINTENANT],
      [jetonNumero(3), PLUS_TARD],
      [jetonNumero(3), APRES_EXPIRATION],
    ] as const) {
      expect(await accepter(db, jeton, eve, maintenant)).toEqual({ issue: "invitation-invalide" });
    }
    expect(await accepter(db, jetonNumero(9), "pas-un-uuid")).toEqual({
      issue: "invitation-invalide",
    });
    expect(await roles(db)).toEqual(avant);
    expect(avant[anne]).toBe("proprietaire");
  });

  it("F-011-AC22 deux acceptations du même jeton lancées ensemble ne créent qu'une adhésion : l'autre reçoit invitation-invalide (séquentiel sur la base embarquée, H10)", async () => {
    const { db, dan } = monde;
    await inviter(db, JETON_ANNE);
    const [eve = ""] = await creerComptes(db, ["Eve"]);

    const issues = await Promise.all([
      accepter(db, JETON_ANNE, dan),
      accepter(db, JETON_ANNE, eve),
    ]);

    expect(issues.map((issue) => issue.issue)).toEqual(["acceptee", "invitation-invalide"]);
    expect(Object.keys(await roles(db))).toHaveLength(4);
  });

  it("F-011-AC23 un compte déjà membre reçoit deja-membre, garde son rôle, et l'invitation reste en attente", async () => {
    const { db, chloe } = monde;
    await inviter(db, JETON_ANNE, "editeur");

    expect(await accepter(db, JETON_ANNE, chloe)).toEqual({ issue: "deja-membre" });
    expect((await roles(db))[chloe]).toBe("lecteur");
    expect(await listerInvitationsEnAttente(db, ESPACE, MAINTENANT)).toHaveLength(1);
  });

  it("F-011-AC24 un espace plein refuse l'acceptation sans consommer le jeton ; le plafond d'invitations en attente refuse une création, les invitations expirées n'y comptant pas", async () => {
    const { db, dan } = monde;
    for (let rang = 1; rang <= PLAFOND_INVITATIONS; rang += 1) {
      expect((await inviter(db, jetonNumero(rang))).issue).toBe("creee");
    }
    expect(await inviter(db, jetonNumero(10))).toEqual({ issue: "quota-atteint" });
    expect(await db.$count(invitation)).toBe(PLAFOND_INVITATIONS);

    const [eve = ""] = await creerComptes(db, ["Eve"]);
    expect((await accepter(db, jetonNumero(1), dan)).issue).toBe("acceptee");
    expect(await accepter(db, jetonNumero(2), eve)).toEqual({ issue: "quota-atteint" });
    expect((await roles(db))[eve]).toBeUndefined();
    expect(await listerInvitationsEnAttente(db, ESPACE, MAINTENANT)).toHaveLength(
      PLAFOND_INVITATIONS - 1,
    );

    const tard = await creerInvitation(db, {
      idEspace: ESPACE,
      role: "lecteur",
      jeton: jetonNumero(11),
      creeLe: PLUS_TARD,
      expireLe: new Date(PLUS_TARD.getTime() + SEPT_JOURS_MS),
      plafondInvitationsEnAttente: PLAFOND_INVITATIONS,
    });
    expect(tard.issue).toBe("creee");
    expect(await inviter(db, jetonNumero(12), "lecteur", INCONNU)).toEqual({
      issue: "espace-introuvable",
    });
  });
});

describe("échecs de la base", () => {
  it(
    "F-011-AC28 sur une base fermée, chaque lecture d'adhésion ou de rôle lève une erreur typée sans cause ni texte SQL : aucun accès n'est accordé par défaut",
    async () => {
      const { db, anne } = monde;
      await monde.fermer();

      for (const lecture of [
        () => lireAdhesion(db, ESPACE, anne),
        () => listerEspaces(db, anne),
        () => listerMembres(db, ESPACE, { avecCourriel: false }),
        () => accepter(db, JETON_ANNE, anne),
      ]) {
        const erreur = await echecDe(lecture());
        expect(erreur).toBeInstanceOf(ErreurBase);
        expect(erreur).toMatchObject({ code: "requete-echouee" });
        expect((erreur as Error).cause).toBeUndefined();
        expect((erreur as Error).message).not.toMatch(/select|adhesion|espace/i);
      }
      const { base } = await ouvrirBaseEmbarqueeMigree();
      monde = { ...monde, db: base.db, fermer: () => base.fermer() };
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );
});

// Les volets « en même temps » de F-011-AC17 et AC22 ne se jouent pas sur PGlite, qui sérialise
// les requêtes (H10) : la présence du verrou est constatée sur les requêtes envoyées.
describe("verrous", () => {
  it(
    "F-011-AC17 F-011-AC22 F-011-AC24 chaque écriture d'adhésion ou d'invitation verrouille d'abord la ligne de l'espace, dans la transaction qui écrit",
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
      const { anne, bob } = await peupler(db);
      const verrou = /^select "id" from "espace" where "espace"\."id" = \$1 for update$/;
      const apres = async (operation: () => Promise<unknown>, ecriture: RegExp) => {
        requetes.length = 0;
        await operation();
        const rangDuVerrou = requetes.findIndex((requete) => verrou.test(requete));
        const rangDeLEcriture = requetes.findIndex((requete) => ecriture.test(requete));
        expect(requetes[0]).toBe("begin");
        expect(rangDuVerrou).toBeGreaterThan(0);
        expect(rangDeLEcriture).toBeGreaterThan(rangDuVerrou);
        expect(requetes.at(-1)).toBe("commit");
      };

      await apres(
        () => changerRole(db, { idEspace: ESPACE, idCompte: bob, role: "proprietaire" }),
        /^update "adhesion"/,
      );
      await apres(
        () => retirerMembre(db, { idEspace: ESPACE, idCompte: bob }),
        /^delete from "adhesion"/,
      );
      await apres(() => inviter(db, JETON_ANNE), /^insert into "invitation"/);
      await apres(() => accepter(db, JETON_ANNE, bob), /^insert into "adhesion"/);
      await apres(() => supprimerEspace(db, ESPACE), /^delete from "espace"/);
      expect(anne).toMatch(/^[0-9a-f-]{36}$/);
      await moteur.close();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );
});
