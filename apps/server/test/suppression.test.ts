// La fonction de suppression de session et son signal (F-009-AC33) : suppression d'une session ou
// de toutes celles d'un compte, signal après la validation, rien quand la suppression échoue ou que
// la transaction est annulée, abonné en échec sans conséquence.
import { Writable } from "node:stream";

import type { Base, SessionSupprimee } from "@notionlike/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { creerJournal } from "../src/journal.ts";
import { creerSuppressionDeSessions } from "../src/sessions.ts";
import { arreterLesServeurs, lancerServeur } from "./aides.ts";
import {
  DELAI_DES_COMPTES_MS,
  comptesDe,
  connecter,
  corpsUnique,
  ecouterLesSuppressions,
  executer,
  fermerLesBases,
  inscrire,
  ouvertureDe,
  ouvrirUneBase,
  sessionsDe,
} from "./aides-comptes.ts";

const SECRET_DE_L_ABONNE = "donnee-que-l-abonne-ne-doit-pas-faire-journaliser";

let base: Base;

beforeAll(async () => {
  base = await ouvrirUneBase();
}, DELAI_DES_COMPTES_MS);
afterEach(async () => {
  vi.restoreAllMocks();
  await arreterLesServeurs();
});
afterAll(fermerLesBases);

// Un compte et ses deux sessions, ouvertes par HTTP ; puis une fonction de suppression neuve, sur
// la même base, avec son journal capturé.
async function preparer(laBase = base) {
  const serveur = await lancerServeur(laBase);
  const corps = corpsUnique();
  const premiere = await inscrire(serveur, corps);
  const seconde = await ouvertureDe(await connecter(serveur, corps));
  const sessions = await sessionsDe(laBase, premiere.compte.id);
  const lignes: string[] = [];
  const journal = creerJournal(
    new Writable({
      write(morceau: Buffer, _encodage, fin) {
        lignes.push(morceau.toString("utf8"));
        fin();
      },
    }),
  );
  return {
    corps,
    idCompte: premiere.compte.id,
    jetons: [premiere.jeton, seconde.jeton],
    sessions,
    suppression: creerSuppressionDeSessions(laBase, journal),
    texteDuJournal: () => lignes.join(""),
  };
}

function trie(signaux: readonly SessionSupprimee[]): SessionSupprimee[] {
  return [...signaux].sort((a, b) => a.idSession.localeCompare(b.idSession));
}

describe("suppression et signal", () => {
  it(
    "F-009-AC33 une session : la ligne est supprimée, puis chaque abonné reçoit son identifiant et celui de son compte, jamais son jeton",
    async () => {
      const { suppression, sessions, idCompte } = await preparer();
      const [visee, gardee] = sessions;
      const recus: unknown[] = [];
      const presentesAuSignal: number[] = [];
      suppression.abonner(async (session) => {
        recus.push(session);
        presentesAuSignal.push((await sessionsDe(base, idCompte)).length);
      });

      const supprimees = await suppression.supprimer({ idSession: visee?.id ?? "" });

      expect(supprimees).toEqual([{ idSession: visee?.id, idCompte }]);
      expect(recus).toEqual([{ idSession: visee?.id, idCompte }]);
      expect(Object.keys(recus[0] as object).sort()).toEqual(["idCompte", "idSession"]);
      expect(JSON.stringify(recus)).not.toContain(visee?.token ?? "jeton absent");
      expect(presentesAuSignal).toEqual([1]);
      expect((await sessionsDe(base, idCompte)).map(({ id }) => id)).toEqual([gardee?.id]);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC33 toutes les sessions d'un compte : un signal par session supprimée, à chaque abonné",
    async () => {
      const { suppression, sessions, idCompte } = await preparer();
      const premiers: SessionSupprimee[] = [];
      const seconds: SessionSupprimee[] = [];
      suppression.abonner((session) => {
        premiers.push(session);
      });
      suppression.abonner((session) => {
        seconds.push(session);
      });
      const attendus = trie(sessions.map(({ id }) => ({ idSession: id, idCompte })));

      await suppression.supprimer({ idCompte });

      expect(attendus).toHaveLength(2);
      expect(trie(premiers)).toEqual(attendus);
      expect(trie(seconds)).toEqual(attendus);
      expect(await sessionsDe(base, idCompte)).toEqual([]);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC33 dans une transaction plus large, la suppression en fait partie et le signal ne part qu'après sa validation",
    async () => {
      const { suppression, sessions, idCompte, corps } = await preparer();
      const nomsAuSignal: string[] = [];
      suppression.abonner(async () => {
        nomsAuSignal.push(...(await comptesDe(base, corps.email)).map(({ name }) => name));
      });

      await suppression.dansUneTransaction(async (transaction, supprimer) => {
        await transaction.execute(
          `update "user" set "name" = 'Renommée' where "id" = '${idCompte}'`,
        );
        await supprimer({ idSession: sessions[0]?.id ?? "" });
        expect(nomsAuSignal).toEqual([]);
      });

      expect(nomsAuSignal).toEqual(["Renommée"]);
      expect(await sessionsDe(base, idCompte)).toHaveLength(1);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC33 une transaction annulée ne supprime rien et n'émet aucun signal",
    async () => {
      const { suppression, idCompte, corps } = await preparer();
      const recus = vi.fn();
      suppression.abonner(recus);

      const issue = await suppression
        .dansUneTransaction(async (transaction, supprimer) => {
          await transaction.execute(
            `update "user" set "name" = 'Renommée' where "id" = '${idCompte}'`,
          );
          await supprimer({ idCompte });
          throw new Error("annulation voulue");
        })
        .then(
          () => "validée",
          (erreur: unknown) => (erreur as Error).message,
        );

      expect(issue).toBe("annulation voulue");
      expect(recus).not.toHaveBeenCalled();
      expect(await sessionsDe(base, idCompte)).toHaveLength(2);
      expect((await comptesDe(base, corps.email)).map(({ name }) => name)).toEqual([corps.name]);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC33 une suppression en échec lève sans émettre aucun signal",
    async () => {
      const defaillante = await ouvrirUneBase();
      const { suppression, idCompte } = await preparer(defaillante);
      await executer(
        defaillante,
        `create function essai_refus() returns trigger language plpgsql as $$ begin raise exception 'refus'; end; $$`,
      );
      await executer(
        defaillante,
        `create trigger essai_refus before delete on "session" for each row execute function essai_refus()`,
      );
      const recus = vi.fn();
      suppression.abonner(recus);

      const issue = await suppression.supprimer({ idCompte }).then(
        () => "aboutie",
        (erreur: unknown) => (erreur as Error).name,
      );

      expect(issue).toBe("ErreurBase");
      expect(recus).not.toHaveBeenCalled();
      expect(await sessionsDe(defaillante, idCompte)).toHaveLength(2);
    },
    DELAI_DES_COMPTES_MS,
  );
});

describe("abonné en échec", () => {
  it.each<[string, () => void | Promise<void>]>([
    [
      "qui lève",
      () => {
        throw new Error(SECRET_DE_L_ABONNE);
      },
    ],
    ["qui rejette", () => Promise.reject(new TypeError(SECRET_DE_L_ABONNE))],
  ])(
    "F-009-AC33 un abonné %s : l'erreur est consignée sans donnée, les autres sont prévenus, la suppression tient, rien n'échappe",
    async (_cas, abonne) => {
      const { suppression, idCompte, sessions, texteDuJournal } = await preparer();
      const nonInterceptees = vi.fn();
      process.on("unhandledRejection", nonInterceptees);
      process.on("uncaughtException", nonInterceptees);
      const avant: SessionSupprimee[] = [];
      const apres: SessionSupprimee[] = [];
      suppression.abonner((session) => {
        avant.push(session);
      });
      suppression.abonner(abonne);
      suppression.abonner((session) => {
        apres.push(session);
      });

      const supprimees = await suppression.supprimer({ idSession: sessions[0]?.id ?? "" });
      await new Promise((resolve) => setImmediate(resolve));
      process.off("unhandledRejection", nonInterceptees);
      process.off("uncaughtException", nonInterceptees);
      const echecs = texteDuJournal()
        .split("\n")
        .filter((ligne) => ligne !== "")
        .map((ligne) => JSON.parse(ligne) as Record<string, unknown>);

      expect(supprimees).toHaveLength(1);
      expect(avant).toEqual(supprimees);
      expect(apres).toEqual(supprimees);
      expect(await sessionsDe(base, idCompte)).toHaveLength(1);
      expect(echecs.map(({ code, classe, niveau }) => ({ code, classe, niveau }))).toEqual([
        { code: "abonne-en-echec", classe: expect.stringMatching(/Error$/), niveau: "error" },
      ]);
      expect(texteDuJournal()).not.toContain(SECRET_DE_L_ABONNE);
      expect(nonInterceptees).not.toHaveBeenCalled();
    },
    DELAI_DES_COMPTES_MS,
  );
});

describe("déconnexion et signal", () => {
  it(
    "F-009-AC33 F-009-AC13 la déconnexion passe par la fonction : un abonné du serveur reçoit la session supprimée",
    async () => {
      const serveur = await lancerServeur(base);
      const recus = ecouterLesSuppressions(serveur);
      const { cookie, compte, jeton } = await inscrire(serveur, corpsUnique());
      const [session] = await sessionsDe(base, compte.id);

      await fetch(`${serveur.url}/api/auth/sign-out`, {
        method: "POST",
        headers: { Cookie: cookie, Origin: "http://app.exemple.test" },
      });

      expect(session?.token).toBe(jeton);
      expect(recus).toEqual([{ idSession: session?.id, idCompte: compte.id }]);
    },
    DELAI_DES_COMPTES_MS,
  );
});
