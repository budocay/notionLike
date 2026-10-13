// Vie d'une session : route protégée sans session valide, expiration et prolongation, déconnexion,
// lecture native sans session, déconnexion en échec (F-009-AC11, AC12, AC13, AC20, AC25, AC26).
import * as contrats from "@notionlike/contrats";
import { CHEMINS_COMPTES, schemaEnveloppeErreur } from "@notionlike/contrats";
import type { Base } from "@notionlike/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  arreterLesServeurs,
  enveloppeDe,
  lancerServeur,
  type ServeurDEssai,
  DELAI_D_OUVERTURE_D_UNE_BASE_MS,
} from "./aides.ts";
import {
  DELAI_DES_COMPTES_MS,
  compteDe,
  connecter,
  cookiePose,
  cookieSigne,
  corpsUnique,
  deconnecter,
  ecouterLesSuppressions,
  effaceLeCookieDeSession,
  executer,
  fermerLesBases,
  fixerLExpiration,
  inscrire,
  JOUR_MS,
  jetonEtSignatureDe,
  lignesDe,
  lire,
  ouvertureDe,
  ouvrirUneBase,
  poseUnCookieDeSession,
  SEPT_JOURS_S,
  sessionDuJeton,
  sessionsDe,
  type Ouverture,
  DELAI_D_UN_CAS_QUI_OUVRE_SA_BASE_MS,
} from "./aides-comptes.ts";
import { sourcesDuDepot } from "./aides-sources.ts";

const MINUTE_MS = 60_000;

let base: Base;

beforeAll(async () => {
  base = await ouvrirUneBase();
}, DELAI_D_OUVERTURE_D_UNE_BASE_MS);
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await arreterLesServeurs();
});
afterAll(fermerLesBases);

// Chaque cas de « session non valide » de F-009-AC11 et F-009-AC25 : le cookie qu'une requête
// présente, préparé à partir d'une session ouverte pour ce cas.
type Cas = readonly [string, (serveur: ServeurDEssai, ouverte: Ouverture) => Promise<string>];

function signatureAlteree({ cookie }: Ouverture): string {
  const { jeton, signature } = jetonEtSignatureDe(cookie);
  const autre = signature.startsWith("A") ? `B${signature.slice(1)}` : `A${signature.slice(1)}`;
  return `${cookie.slice(0, cookie.indexOf("="))}=${encodeURIComponent(`${jeton}.${autre}`)}`;
}

function jetonAltere({ cookie }: Ouverture): string {
  const { jeton, signature } = jetonEtSignatureDe(cookie);
  const autre = `${jeton.slice(0, -1)}${jeton.endsWith("a") ? "b" : "a"}`;
  return `${cookie.slice(0, cookie.indexOf("="))}=${encodeURIComponent(`${autre}.${signature}`)}`;
}

const CAS_SANS_SESSION_VALIDE: readonly Cas[] = [
  ["aucun cookie", () => Promise.resolve("")],
  [
    "un cookie à la signature altérée",
    (_serveur, ouverte) => Promise.resolve(signatureAlteree(ouverte)),
  ],
  ["un cookie au jeton altéré", (_serveur, ouverte) => Promise.resolve(jetonAltere(ouverte))],
  [
    "un cookie signé d'un jeton inconnu",
    () => Promise.resolve(cookieSigne("JetonInconnuDeTrenteDeuxSignesXy")),
  ],
  [
    "le cookie d'une session expirée dont la ligne existe encore",
    async (_serveur, ouverte) => {
      await fixerLExpiration(base, ouverte.jeton, new Date(Date.now() - MINUTE_MS));
      expect(await sessionDuJeton(base, ouverte.jeton)).toBeDefined();
      return ouverte.cookie;
    },
  ],
  [
    "le cookie d'une session révoquée par la déconnexion",
    async (serveur, ouverte) => {
      expect((await deconnecter(serveur, ouverte.cookie)).status).toBe(200);
      return ouverte.cookie;
    },
  ],
];

describe("route protégée sans session valide", () => {
  it.each(CAS_SANS_SESSION_VALIDE)(
    "F-009-AC11 F-009-AC22 avec %s, GET /api/v1/moi répond 401 non-authentifie sans exécuter son traitement",
    async (_cas, preparer) => {
      const serveur = await lancerServeur(base);
      const ouverte = await inscrire(serveur, corpsUnique());
      const cookie = await preparer(serveur, ouverte);
      const traitement = vi.spyOn(contrats.schemaCompte, "parse");

      const reponse = await lire(serveur, CHEMINS_COMPTES.moi, cookie === "" ? undefined : cookie);
      const texte = await reponse.text();

      expect(reponse.status).toBe(401);
      expect(schemaEnveloppeErreur.parse(JSON.parse(texte))).toMatchObject({
        code: "non-authentifie",
        message: "Cette requête exige une session valide.",
      });
      expect(texte).not.toContain(ouverte.compte.id);
      expect(texte).not.toContain(ouverte.compte.email);
      expect(traitement).not.toHaveBeenCalled();
      expect(poseUnCookieDeSession(reponse)).toBe(false);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC11 le témoin : la même session, valide, passe et le traitement a lieu",
    async () => {
      const serveur = await lancerServeur(base);
      const ouverte = await inscrire(serveur, corpsUnique());
      const traitement = vi.spyOn(contrats.schemaCompte, "parse");

      const reponse = await lire(serveur, CHEMINS_COMPTES.moi, ouverte.cookie);

      expect(reponse.status).toBe(200);
      expect(traitement).toHaveBeenCalledTimes(1);
    },
    DELAI_DES_COMPTES_MS,
  );
});

describe("lecture native de la session sans session valide", () => {
  it.each(CAS_SANS_SESSION_VALIDE)(
    "F-009-AC25 avec %s, GET /api/auth/get-session répond 200 null, sans donnée ni nouvelle session",
    async (_cas, preparer) => {
      const serveur = await lancerServeur(base);
      const ouverte = await inscrire(serveur, corpsUnique());
      const cookie = await preparer(serveur, ouverte);
      const avant = (await lignesDe(base, "session")).length;

      const reponse = await lire(
        serveur,
        CHEMINS_COMPTES.session,
        cookie === "" ? undefined : cookie,
      );
      const texte = await reponse.text();

      expect(reponse.status).toBe(200);
      expect(texte).toBe("null");
      expect(poseUnCookieDeSession(reponse)).toBe(false);
      expect((await lignesDe(base, "session")).length).toBeLessThanOrEqual(avant);
      expect(await sessionsDe(base, ouverte.compte.id).then((lignes) => lignes.length)).toBe(
        cookie === "" || cookie !== ouverte.cookie ? 1 : 0,
      );
    },
    DELAI_DES_COMPTES_MS,
  );
});

describe("expiration et prolongation", () => {
  async function ouvrirAHorlogeFixe(debut: number) {
    vi.useFakeTimers({ toFake: ["Date"], now: debut });
    const serveur = await lancerServeur(base);
    const ouverte = await inscrire(serveur, corpsUnique());
    return { serveur, ouverte };
  }

  it(
    "F-009-AC12 une session ouverte expire 7 jours après : refusée à 7 jours et une seconde, alors que sa ligne existe encore",
    async () => {
      const debut = Date.now();
      const { serveur, ouverte } = await ouvrirAHorlogeFixe(debut);
      const ligne = await sessionDuJeton(base, ouverte.jeton);

      vi.setSystemTime(debut + 7 * JOUR_MS + 1000);
      const existeAvant = await sessionDuJeton(base, ouverte.jeton);
      const reponse = await lire(serveur, CHEMINS_COMPTES.moi, ouverte.cookie);

      expect(ligne?.expiresAt.getTime()).toBe(debut + SEPT_JOURS_S * 1000);
      expect(existeAvant).toBeDefined();
      expect(reponse.status).toBe(401);
      expect((await enveloppeDe(reponse)).code).toBe("non-authentifie");
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC12 utilisée moins de 24 heures après sa dernière prolongation, la session n'est pas prolongée",
    async () => {
      const debut = Date.now();
      const { serveur, ouverte } = await ouvrirAHorlogeFixe(debut);

      vi.setSystemTime(debut + JOUR_MS - MINUTE_MS);
      const reponse = await lire(serveur, CHEMINS_COMPTES.moi, ouverte.cookie);

      expect(reponse.status).toBe(200);
      expect(poseUnCookieDeSession(reponse)).toBe(false);
      expect((await sessionDuJeton(base, ouverte.jeton))?.expiresAt.getTime()).toBe(
        debut + 7 * JOUR_MS,
      );
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC12 utilisée plus de 24 heures après, elle est prolongée de 7 jours, cookie compris : valide au-delà de sa première échéance",
    async () => {
      const debut = Date.now();
      const { serveur, ouverte } = await ouvrirAHorlogeFixe(debut);

      vi.setSystemTime(debut + JOUR_MS + MINUTE_MS);
      const prolongee = await lire(serveur, CHEMINS_COMPTES.moi, ouverte.cookie);
      const { paire, attributs } = cookiePose(prolongee);
      vi.setSystemTime(debut + 7 * JOUR_MS + MINUTE_MS);
      const apresLaPremiereEcheance = await lire(serveur, CHEMINS_COMPTES.moi, ouverte.cookie);

      expect(prolongee.status).toBe(200);
      expect(jetonEtSignatureDe(paire).jeton).toBe(ouverte.jeton);
      expect(attributs).toContain(`Max-Age=${String(SEPT_JOURS_S)}`);
      expect(apresLaPremiereEcheance.status).toBe(200);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC12 prolongée, elle expire 7 jours après cette prolongation",
    async () => {
      const debut = Date.now();
      const { serveur, ouverte } = await ouvrirAHorlogeFixe(debut);
      const prolongation = debut + JOUR_MS + MINUTE_MS;

      vi.setSystemTime(prolongation);
      const prolongee = await lire(serveur, CHEMINS_COMPTES.moi, ouverte.cookie);
      vi.setSystemTime(prolongation + 7 * JOUR_MS + 1000);
      const apresSonEcheance = await lire(serveur, CHEMINS_COMPTES.moi, ouverte.cookie);

      expect(prolongee.status).toBe(200);
      expect(apresSonEcheance.status).toBe(401);
      expect((await enveloppeDe(apresSonEcheance)).code).toBe("non-authentifie");
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC12 la prolongation est écrite en base : 7 jours après l'instant de la requête",
    async () => {
      const debut = Date.now();
      const { serveur, ouverte } = await ouvrirAHorlogeFixe(debut);
      const prolongation = debut + 2 * JOUR_MS;

      vi.setSystemTime(prolongation);
      await lire(serveur, CHEMINS_COMPTES.session, ouverte.cookie);

      expect((await sessionDuJeton(base, ouverte.jeton))?.expiresAt.getTime()).toBe(
        prolongation + 7 * JOUR_MS,
      );
    },
    DELAI_DES_COMPTES_MS,
  );
});

describe("déconnexion", () => {
  it(
    "F-009-AC13 F-009-AC33 supprime la session par la fonction de suppression avant de répondre 200, efface le cookie, et le cookie rejoué est refusé dès la requête suivante",
    async () => {
      const serveur = await lancerServeur(base);
      const recus = ecouterLesSuppressions(serveur);
      const ouverte = await inscrire(serveur, corpsUnique());
      const ligne = await sessionDuJeton(base, ouverte.jeton);

      const reponse = await deconnecter(serveur, ouverte.cookie);
      const restante = await sessionDuJeton(base, ouverte.jeton);
      const moi = await lire(serveur, CHEMINS_COMPTES.moi, ouverte.cookie);
      const session = await lire(serveur, CHEMINS_COMPTES.session, ouverte.cookie);

      expect(reponse.status).toBe(200);
      expect(await reponse.json()).toEqual({ success: true });
      expect(effaceLeCookieDeSession(reponse)).toBe(true);
      expect(restante).toBeUndefined();
      expect(recus).toEqual([{ idSession: ligne?.id, idCompte: ouverte.compte.id }]);
      expect(moi.status).toBe(401);
      expect((await enveloppeDe(moi)).code).toBe("non-authentifie");
      expect(await session.text()).toBe("null");
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC13 seule la session du cookie est supprimée : celle d'un autre appareil reste valide",
    async () => {
      const serveur = await lancerServeur(base);
      const corps = corpsUnique();
      const premiere = await inscrire(serveur, corps);
      const seconde = await ouvertureDe(await connecter(serveur, corps));

      await deconnecter(serveur, premiere.cookie);

      expect((await lire(serveur, CHEMINS_COMPTES.moi, premiere.cookie)).status).toBe(401);
      expect((await lire(serveur, CHEMINS_COMPTES.moi, seconde.cookie)).status).toBe(200);
      expect((await sessionsDe(base, premiere.compte.id)).map(({ token }) => token)).toEqual([
        seconde.jeton,
      ]);
    },
    DELAI_DES_COMPTES_MS,
  );
});

describe("déconnexion en échec", () => {
  // Une base dont la suppression des sessions échoue, ou est ignorée sans erreur.
  async function baseDontLaSuppression(comportement: "echoue" | "est-ignoree"): Promise<Base> {
    const defaillante = await ouvrirUneBase();
    const corps =
      comportement === "echoue"
        ? "begin raise exception 'suppression refusée'; end;"
        : "begin return null; end;";
    await executer(
      defaillante,
      `create function essai_suppression() returns trigger language plpgsql as $$ ${corps} $$`,
    );
    return defaillante;
  }

  async function rendreDefaillante(defaillante: Base): Promise<void> {
    await executer(
      defaillante,
      `create trigger essai_suppression before delete on "session" for each row execute function essai_suppression()`,
    );
  }

  it.each(["echoue", "est-ignoree"] as const)(
    "F-009-AC26 F-009-AC20 quand la suppression de la session %s, la déconnexion répond 500 erreur-interne, efface quand même le cookie, consigne l'échec et n'émet aucun signal",
    async (comportement) => {
      const defaillante = await baseDontLaSuppression(comportement);
      const serveur = await lancerServeur(defaillante);
      const recus = ecouterLesSuppressions(serveur);
      const ouverte = await inscrire(serveur, corpsUnique());
      await rendreDefaillante(defaillante);

      const reponse = await deconnecter(serveur, ouverte.cookie);
      const enveloppe = await enveloppeDe(reponse);
      const echecs = serveur
        .lignesDuJournal()
        .filter(({ message }) => message === "echec")
        .map(({ code, idRequete }) => ({ code, idRequete }));

      expect(reponse.status).toBe(500);
      expect(enveloppe.code).toBe("erreur-interne");
      expect(effaceLeCookieDeSession(reponse)).toBe(true);
      expect(echecs).toEqual([{ code: "session-non-supprimee", idRequete: enveloppe.idRequete }]);
      expect(recus).toEqual([]);
      expect(await sessionDuJeton(defaillante, ouverte.jeton)).toBeDefined();
      expect(serveur.texteDuJournal()).not.toContain(ouverte.jeton);
    },
    DELAI_D_UN_CAS_QUI_OUVRE_SA_BASE_MS,
  );

  it(
    "F-009-AC26 F-009-AC20 quand la table des sessions est illisible, la déconnexion répond 500 erreur-interne et efface le cookie",
    async () => {
      const defaillante = await ouvrirUneBase();
      const serveur = await lancerServeur(defaillante);
      const ouverte = await inscrire(serveur, corpsUnique());
      await executer(defaillante, `alter table "session" rename to "session_illisible"`);

      const reponse = await deconnecter(serveur, ouverte.cookie);

      expect(reponse.status).toBe(500);
      expect((await enveloppeDe(reponse)).code).toBe("erreur-interne");
      expect(effaceLeCookieDeSession(reponse)).toBe(true);
    },
    DELAI_D_UN_CAS_QUI_OUVRE_SA_BASE_MS,
  );

  it(
    "F-009-AC26 le témoin : sur la même base sans déclencheur, la déconnexion répond 200",
    async () => {
      const temoin = await baseDontLaSuppression("echoue");
      const serveur = await lancerServeur(temoin);
      const ouverte = await inscrire(serveur, corpsUnique());

      expect((await deconnecter(serveur, ouverte.cookie)).status).toBe(200);
    },
    DELAI_D_UN_CAS_QUI_OUVRE_SA_BASE_MS,
  );
});

describe("vérification de session en échec", () => {
  it(
    "F-009-AC20 si la base échoue pendant la vérification de la session, GET /api/v1/moi répond 500 erreur-interne et n'accorde rien",
    async () => {
      const defaillante = await ouvrirUneBase();
      const serveur = await lancerServeur(defaillante);
      const ouverte = await inscrire(serveur, corpsUnique());
      await executer(defaillante, `alter table "session" rename to "session_illisible"`);
      const traitement = vi.spyOn(contrats.schemaCompte, "parse");

      const moi = await lire(serveur, CHEMINS_COMPTES.moi, ouverte.cookie);
      const texte = await moi.text();
      const session = await lire(serveur, CHEMINS_COMPTES.session, ouverte.cookie);

      expect(moi.status).toBe(500);
      expect(schemaEnveloppeErreur.parse(JSON.parse(texte)).code).toBe("erreur-interne");
      expect(texte).not.toContain(ouverte.compte.id);
      expect(traitement).not.toHaveBeenCalled();
      expect(session.status).toBe(500);
      expect((await enveloppeDe(session)).code).toBe("erreur-interne");
      expect(
        serveur
          .lignesDuJournal()
          .filter(({ message }) => message === "echec")
          .map(({ code }) => code),
      ).toEqual(["verification-de-session-en-echec", "authentification-en-echec"]);
    },
    DELAI_D_UN_CAS_QUI_OUVRE_SA_BASE_MS,
  );

  it(
    "F-009-AC20 le témoin : sur une base saine, la même lecture rend le compte",
    async () => {
      const serveur = await lancerServeur(base);
      const ouverte = await inscrire(serveur, corpsUnique());

      expect((await compteDe(await lire(serveur, CHEMINS_COMPTES.moi, ouverte.cookie))).id).toBe(
        ouverte.compte.id,
      );
    },
    DELAI_DES_COMPTES_MS,
  );
});

// F-009-AC25 : la réponse 200 de GET /api/auth/get-session ne prouve rien. Aucun code du dépôt ne
// s'adresse à cette route, hormis le contrat qui publie son chemin ; le serveur la monte sans la
// nommer, par la liste fermée de `comptes.ts`. Le refus 401 est porté par les routes protégées.
const QUI_NOMME_LA_LECTURE_NATIVE = ["packages/contrats/src/comptes.ts"];

function quiNommeLaLectureNative(sources: ReadonlyMap<string, string>): string[] {
  return [...sources]
    .filter(([, texte]) =>
      /get-session|CHEMINS_COMPTES\s*(\.\s*session\b|\[\s*["']session["'])/.test(texte),
    )
    .map(([chemin]) => chemin)
    .filter((chemin) => !QUI_NOMME_LA_LECTURE_NATIVE.includes(chemin))
    .sort();
}

describe("aucune preuve d'authentification par la lecture native", () => {
  it("F-009-AC25 aucun code du dépôt, hors du contrat qui publie le chemin, ne s'adresse à GET /api/auth/get-session", () => {
    const sources = sourcesDuDepot();

    expect(quiNommeLaLectureNative(sources)).toEqual([]);
    expect(
      QUI_NOMME_LA_LECTURE_NATIVE.every((chemin) => sources.get(chemin)?.includes("get-session")),
    ).toBe(true);
  });

  it.each([
    [
      "apps/web/src/session.ts",
      "const reponse = await fetch(CHEMINS_COMPTES.session);\nconst connecte = reponse.ok;\n",
    ],
    [
      "apps/web/src/garde.ts",
      'const ok = (await fetch(CHEMINS_COMPTES["session"])).status === 200;\n',
    ],
    ["apps/server/src/garde.ts", 'if ((await fetch("/api/auth/get-session")).ok) suivant();\n'],
  ])("F-009-AC25 le contrôle voit %s, qui s'adresse à la lecture native", (chemin, texte) => {
    const sources = new Map([...sourcesDuDepot(), [chemin, texte]]);

    expect(quiNommeLaLectureNative(sources)).toEqual([chemin]);
  });
});
