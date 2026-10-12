// Journal des comptes et erreurs non prévues des routes d'authentification (F-009-AC19, AC20).
// Toute la sortie du test est capturée : le journal du serveur, la console et les deux flux du
// processus, où le journal interne de better-auth écrirait s'il n'était pas branché sur le nôtre.
import { CHEMINS_COMPTES } from "@notionlike/contrats";
import type { Base } from "@notionlike/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  arreterLesServeurs,
  enveloppeDe,
  lancerServeur,
  type LigneDeJournal,
  type ServeurDEssai,
} from "./aides.ts";
import {
  DELAI_DES_COMPTES_MS,
  comptesDe,
  connecter,
  corpsUnique,
  courrielUnique,
  deconnecter,
  executer,
  fermerLesBases,
  inscrire,
  lignesDe,
  ouvertureDe,
  ouvrirUneBase,
  poseUnCookieDeSession,
  poster,
} from "./aides-comptes.ts";

const CHAMPS_D_UN_EVENEMENT = [
  "adresse",
  "idCompte",
  "idRequete",
  "message",
  "niveau",
  "time",
  "type",
];
// Ce qu'une ligne ne doit jamais porter : un texte de requête SQL ou ses paramètres.
const TEXTE_SQL = /\b(select|insert into|update|delete from)\b|"user"|"session"|"account"|params:/i;
// Un jeton de session : 32 signes alphanumériques d'affilée.
const JETON = /[A-Za-z0-9]{32}/;

let base: Base;

beforeAll(async () => {
  base = await ouvrirUneBase();
}, DELAI_DES_COMPTES_MS);
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await arreterLesServeurs();
});
afterAll(fermerLesBases);

// Tout ce que le processus du test écrit, de la console aux deux flux, à partir de maintenant.
function capturerLaSortie(): () => string {
  const morceaux: string[] = [];
  const garder = (...valeurs: unknown[]) => {
    morceaux.push(
      valeurs
        .map((valeur) =>
          valeur instanceof Error ? `${valeur.message} ${valeur.stack ?? ""}` : String(valeur),
        )
        .join(" "),
    );
  };
  for (const methode of ["log", "info", "warn", "error", "debug", "trace"] as const) {
    vi.spyOn(console, methode).mockImplementation(garder);
  }
  for (const flux of [process.stdout, process.stderr]) {
    const ecrire = flux.write.bind(flux);
    vi.spyOn(flux, "write").mockImplementation(
      (morceau: string | Uint8Array, ...suite: unknown[]) => {
        garder(typeof morceau === "string" ? morceau : Buffer.from(morceau).toString("utf8"));
        return (ecrire as (...arguments_: unknown[]) => boolean)(morceau, ...suite);
      },
    );
  }
  return () => morceaux.join("\n");
}

function evenements(serveur: ServeurDEssai): LigneDeJournal[] {
  return serveur.lignesDuJournal().filter(({ message }) => message === "compte");
}

describe("événements des comptes", () => {
  it(
    "F-009-AC19 inscription, connexion réussie, connexion refusée, déconnexion et dépassement de débit écrivent chacun une ligne : type, identifiant de requête, adresse, compte s'il est connu, et rien d'autre",
    async () => {
      const serveur = await lancerServeur(base);
      const corps = corpsUnique();

      const inscription = await poster(serveur, CHEMINS_COMPTES.inscription, corps);
      const { compte, cookie, jeton } = await ouvertureDe(inscription.clone());
      const connexion = await connecter(serveur, corps);
      const refusee = await connecter(serveur, { ...corps, password: "mot-de-passe-faux" });
      const deconnexion = await deconnecter(serveur, cookie);
      for (let rang = 0; rang < 3; rang += 1) {
        await connecter(serveur, { ...corps, password: "mot-de-passe-faux" });
      }
      const enExces = await connecter(serveur, corps);
      const idDe = (reponse: Response) => reponse.headers.get("x-request-id");

      expect(enExces.status).toBe(429);
      expect(evenements(serveur).filter(({ type }) => type !== "connexion-refusee")).toEqual([
        expect.objectContaining({
          type: "inscription",
          idRequete: idDe(inscription),
          adresse: "127.0.0.1",
          idCompte: compte.id,
        }),
        expect.objectContaining({
          type: "connexion",
          idRequete: idDe(connexion),
          adresse: "127.0.0.1",
          idCompte: compte.id,
        }),
        expect.objectContaining({
          type: "deconnexion",
          idRequete: idDe(deconnexion),
          adresse: "127.0.0.1",
          idCompte: compte.id,
        }),
        expect.objectContaining({
          type: "debit-depasse",
          idRequete: idDe(enExces),
          adresse: "127.0.0.1",
        }),
      ]);
      expect(evenements(serveur).filter(({ type }) => type === "connexion-refusee")).toEqual([
        expect.objectContaining({ idRequete: idDe(refusee), adresse: "127.0.0.1" }),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      ]);
      for (const ligne of evenements(serveur)) {
        expect(Object.keys(ligne).every((champ) => CHAMPS_D_UN_EVENEMENT.includes(champ))).toBe(
          true,
        );
      }
      const texte = serveur.texteDuJournal();
      for (const secret of [
        corps.password,
        corps.email,
        jeton,
        cookie,
        cookie.slice(cookie.indexOf("=") + 1),
      ]) {
        expect(texte).not.toContain(secret);
      }
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC19 le dépassement du plafond global écrit aussi sa ligne",
    async () => {
      const serveur = await lancerServeur(base);
      for (let rang = 0; rang < 60; rang += 1) {
        await poster(serveur, "/api/auth/inconnue", {});
      }

      const enExces = await poster(serveur, "/api/auth/inconnue", {});

      expect(enExces.status).toBe(429);
      expect(evenements(serveur)).toEqual([
        expect.objectContaining({
          type: "debit-depasse",
          idRequete: enExces.headers.get("x-request-id"),
          adresse: "127.0.0.1",
        }),
      ]);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC19 après une connexion refusée et une origine refusée, ni le journal du serveur, ni celui de better-auth, ni aucune autre sortie ne porte le mot de passe, le courriel, le jeton ou le cookie",
    async () => {
      const serveur = await lancerServeur(base);
      const corps = corpsUnique();
      const { cookie, jeton } = await inscrire(serveur, corps);
      const sortie = capturerLaSortie();

      const refusee = await connecter(
        serveur,
        { ...corps, password: "mot-de-passe-faux" },
        { Cookie: cookie },
      );
      const inconnu = await connecter(serveur, {
        email: courrielUnique("inconnu"),
        password: corps.password,
      });
      const origine = await connecter(serveur, corps, {
        Origin: "http://ailleurs.exemple.test",
        Cookie: cookie,
      });
      const tout = `${serveur.texteDuJournal()}\n${sortie()}`;
      const deBetterAuth = serveur
        .lignesDuJournal()
        .filter(({ message }) => message === "better-auth");

      expect([refusee.status, inconnu.status, origine.status]).toEqual([401, 401, 403]);
      expect(deBetterAuth.map(({ niveau }) => niveau)).toEqual(["warn", "warn", "error"]);
      for (const secret of [corps.password, corps.email, jeton, cookie, "ailleurs.exemple.test"]) {
        expect(tout).not.toContain(secret);
      }
      expect(tout).not.toMatch(TEXTE_SQL);
    },
    DELAI_DES_COMPTES_MS,
  );
});

describe("base défaillante pendant une inscription et une connexion", () => {
  // Une base où l'écriture d'un compte, d'un identifiant de connexion ou d'une session échoue,
  // selon le domaine du courriel : l'erreur de Drizzle porte alors la requête et ses paramètres.
  async function baseDefaillante(): Promise<Base> {
    const defaillante = await ouvrirUneBase();
    // Une instruction par appel : le protocole étendu n'en accepte pas deux.
    const refuser = async (table: string, condition: string) => {
      await executer(
        defaillante,
        `create function essai_refus_${table}() returns trigger language plpgsql as $$
        begin if ${condition} then raise exception 'écriture refusée'; end if; return new; end; $$`,
      );
      await executer(
        defaillante,
        `create trigger essai_refus_${table} before insert on "${table}" for each row
        execute function essai_refus_${table}()`,
      );
    };
    await refuser("user", `new.email like '%@compte-refuse.test'`);
    await refuser(
      "account",
      `(select email from "user" where id = new."userId") like '%@identifiant-refuse.test'`,
    );
    await refuser(
      "session",
      `(select email from "user" where id = new."userId") like '%@session-refusee.test'`,
    );
    return defaillante;
  }

  it(
    "F-009-AC20 une inscription dont l'identifiant de connexion ne s'écrit pas répond 500 erreur-interne, sans laisser de compte ni poser de cookie",
    async () => {
      const defaillante = await baseDefaillante();
      const serveur = await lancerServeur(defaillante);
      const corps = {
        ...corpsUnique(),
        email: `ada-${String(Date.now())}@identifiant-refuse.test`,
      };

      const reponse = await poster(serveur, CHEMINS_COMPTES.inscription, corps);

      expect(reponse.status).toBe(500);
      expect((await enveloppeDe(reponse)).code).toBe("erreur-interne");
      expect(poseUnCookieDeSession(reponse)).toBe(false);
      expect(await comptesDe(defaillante, corps.email)).toEqual([]);
      expect(await lignesDe(defaillante, "account")).toEqual([]);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC20 une inscription dont le compte ne s'écrit pas répond 500 erreur-interne, et non le 422 que better-auth renvoie de lui-même",
    async () => {
      const defaillante = await baseDefaillante();
      const serveur = await lancerServeur(defaillante);
      const corps = { ...corpsUnique(), email: `ada-${String(Date.now())}@compte-refuse.test` };

      const reponse = await poster(serveur, CHEMINS_COMPTES.inscription, corps);

      expect(reponse.status).toBe(500);
      expect((await enveloppeDe(reponse)).code).toBe("erreur-interne");
      expect(poseUnCookieDeSession(reponse)).toBe(false);
      expect(await comptesDe(defaillante, corps.email)).toEqual([]);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC20 une connexion dont la session ne s'écrit pas répond 500 erreur-interne, sans session ni cookie",
    async () => {
      const defaillante = await baseDefaillante();
      const serveur = await lancerServeur(defaillante);
      const corps = { ...corpsUnique(), email: `ada-${String(Date.now())}@session-refusee.test` };
      await executer(defaillante, `alter table "session" disable trigger essai_refus_session`);
      const { compte } = await inscrire(serveur, corps);
      await executer(defaillante, `alter table "session" enable trigger essai_refus_session`);

      const reponse = await connecter(serveur, corps);

      expect(reponse.status).toBe(500);
      expect((await enveloppeDe(reponse)).code).toBe("erreur-interne");
      expect(poseUnCookieDeSession(reponse)).toBe(false);
      expect(
        (await lignesDe(defaillante, "session")).filter(({ userId }) => userId === compte.id),
      ).toHaveLength(1);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC19 l'erreur de Drizzle n'est jamais écrite : ni courriel, ni mot de passe, ni empreinte, ni jeton, ni texte de requête dans toute la sortie ; seuls son type et un code",
    async () => {
      const defaillante = await baseDefaillante();
      const serveur = await lancerServeur(defaillante);
      const suffixe = String(Date.now());
      const corps = {
        compte: { ...corpsUnique(), email: `ada-${suffixe}@compte-refuse.test` },
        identifiant: { ...corpsUnique(), email: `ada-${suffixe}@identifiant-refuse.test` },
        session: {
          ...corpsUnique(),
          email: `ada-${suffixe}@session-refusee.test`,
          password: "un-autre-mot-de-passe",
        },
      };
      await executer(defaillante, `alter table "session" disable trigger essai_refus_session`);
      await inscrire(serveur, corps.session);
      await executer(defaillante, `alter table "session" enable trigger essai_refus_session`);
      const [empreinte] = (await lignesDe(defaillante, "account")).map(
        ({ password }) => password ?? "",
      );
      const sortie = capturerLaSortie();

      const statuts = [
        (await poster(serveur, CHEMINS_COMPTES.inscription, corps.compte)).status,
        (await poster(serveur, CHEMINS_COMPTES.inscription, corps.identifiant)).status,
        (await connecter(serveur, corps.session)).status,
      ];
      const tout = `${serveur.texteDuJournal()}\n${sortie()}`;
      const echecs = serveur.lignesDuJournal().filter(({ message }) => message === "echec");

      expect(statuts).toEqual([500, 500, 500]);
      expect(echecs.map(({ code }) => code)).toEqual([
        "authentification-en-echec",
        "authentification-en-echec",
        "authentification-en-echec",
      ]);
      expect(echecs.every(({ classe }) => typeof classe === "string")).toBe(true);
      expect(empreinte).toMatch(/^\$argon2id\$/);
      for (const secret of [
        ...Object.values(corps).flatMap(({ email, password }) => [email, password]),
        empreinte ?? "",
        "argon2id",
        "écriture refusée",
      ]) {
        expect(tout).not.toContain(secret);
      }
      expect(tout).not.toMatch(TEXTE_SQL);
      expect(
        tout.replaceAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ""),
      ).not.toMatch(JETON);
    },
    DELAI_DES_COMPTES_MS,
  );
});
