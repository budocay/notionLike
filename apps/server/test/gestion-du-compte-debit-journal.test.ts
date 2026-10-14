// Plafonds de la gestion du compte (F-027-AC15), à horloge injectée, et journal de ses routes
// (F-027-AC18), dont toute la sortie du processus est parcourue : journal du serveur, console et
// les deux flux.
import crypto from "node:crypto";

import { CHEMINS_DU_COMPTE, schemaCompte } from "@notionlike/contrats";
import type { Base } from "@notionlike/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  arreterLesServeurs,
  DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  lancerServeur,
  type LigneDeJournal,
  type ServeurDEssai,
} from "./aides.ts";
import {
  fermerLesBases,
  lignesDe,
  NOM_DU_COOKIE,
  NOM_DU_COOKIE_SECURISE,
  ouvrirUneBase,
  texteDeLaBase,
} from "./aides-comptes.ts";
import { appeler, cheminDe, corpsDe, erreurDe } from "./aides-espaces.ts";
import {
  changerLeMotDePasse,
  changerLeNom,
  creerUnTitulaire,
  empreinteDuCompte,
  listerLesSessions,
  MOT_DE_PASSE_ACTUEL,
  NOUVEAU_MOT_DE_PASSE,
  ouvrirUneSession,
  revoquer,
  revoquerLesAutres,
  type TitulaireDEssai,
} from "./aides-gestion-du-compte.ts";

const DELAI_MS = 60_000;
const FAUX = { motDePasseActuel: "pas-le-bon-mot-de-passe" };
const AGENT_SECRET = "AgentSecret/9.9 (essai)";
const NOM_SECRET = "Nom-Que-Le-Journal-Ignore";

let base: Base;
let serveur: ServeurDEssai;
let maintenant = Date.now();

beforeAll(async () => {
  base = await ouvrirUneBase();
}, DELAI_D_OUVERTURE_D_UNE_BASE_MS);
afterEach(async () => {
  vi.restoreAllMocks();
  await arreterLesServeurs();
});
afterAll(fermerLesBases);

async function preparer(env?: Record<string, string>): Promise<TitulaireDEssai> {
  maintenant = Date.now();
  serveur = await lancerServeur(base, {
    horloge: () => new Date(maintenant),
    ...(env === undefined ? {} : { env }),
  });
  const nomDuCookie = env?.NODE_ENV === "production" ? NOM_DU_COOKIE_SECURISE : NOM_DU_COOKIE;
  return creerUnTitulaire(base, "debit", nomDuCookie);
}

function attenteDe(reponse: Response): number {
  return Number(reponse.headers.get("retry-after"));
}

describe("plafonds par compte (F-027-AC15)", () => {
  it.each(["test", "production"])(
    "F-027-AC15 sous NODE_ENV=%s, au-delà de 5 actions sensibles en 60 s, toutes routes confondues et réussies ou non : 429 avec Retry-After, sans calcul ni modification ; la fenêtre suivante les rouvre",
    async (nodeEnv) => {
      const titulaire = await preparer({ NODE_ENV: nodeEnv });
      const autre = await ouvrirUneSession(base, titulaire.id);
      const autreCompte = await creerUnTitulaire(base, "voisin", titulaire.cookie.split("=")[0]);

      const statuts = [
        (
          await changerLeMotDePasse(serveur, titulaire.cookie, {
            ...FAUX,
            nouveauMotDePasse: NOUVEAU_MOT_DE_PASSE,
          })
        ).status,
        (await revoquer(serveur, titulaire.cookie, autre.idSession, FAUX)).status,
        (await revoquerLesAutres(serveur, titulaire.cookie, FAUX)).status,
        (await revoquer(serveur, titulaire.cookie, autre.idSession, FAUX)).status,
        (await revoquerLesAutres(serveur, titulaire.cookie, FAUX)).status,
      ];
      expect(statuts).toEqual([403, 403, 403, 403, 403]);
      const avant = await texteDeLaBase(base);
      const calcul = vi.spyOn(crypto, "argon2");

      const enExces = [
        await revoquer(serveur, titulaire.cookie, autre.idSession),
        await changerLeMotDePasse(serveur, titulaire.cookie),
        await revoquerLesAutres(serveur, titulaire.cookie),
      ];

      for (const reponse of enExces) {
        expect(attenteDe(reponse)).toBeGreaterThanOrEqual(1);
        expect(attenteDe(reponse)).toBeLessThanOrEqual(60);
        expect(Number.isInteger(attenteDe(reponse))).toBe(true);
        await erreurDe(reponse, 429, "trop-de-requetes");
      }
      expect(calcul).not.toHaveBeenCalled();
      expect(await texteDeLaBase(base)).toBe(avant);
      // Le plafond est celui du compte : un autre compte agit encore.
      await erreurDe(
        await revoquerLesAutres(serveur, autreCompte.cookie, FAUX),
        403,
        "mot-de-passe-incorrect",
      );
      // Les routes ordinaires ne sont pas des actions sensibles.
      await corpsDe(
        await changerLeNom(serveur, titulaire.cookie, { nom: "Encore" }),
        200,
        schemaCompte,
      );

      maintenant += 60_000;
      expect((await revoquer(serveur, titulaire.cookie, autre.idSession)).status).toBe(204);
    },
    DELAI_MS,
  );

  it(
    "F-027-AC15 au-delà de 30 requêtes en 60 s sur l'ensemble des routes, 429 avec Retry-After, sur toute route de la spec",
    async () => {
      const titulaire = await preparer();

      for (let rang = 0; rang < 29; rang += 1) {
        expect((await listerLesSessions(serveur, titulaire.cookie)).status).toBe(200);
      }
      await corpsDe(
        await changerLeNom(serveur, titulaire.cookie, { nom: "Trentième" }),
        200,
        schemaCompte,
      );
      const avant = await texteDeLaBase(base);

      const enExces = [
        await listerLesSessions(serveur, titulaire.cookie),
        await changerLeNom(serveur, titulaire.cookie, { nom: "De trop" }),
        await changerLeMotDePasse(serveur, titulaire.cookie),
      ];

      for (const reponse of enExces) {
        expect(attenteDe(reponse)).toBeGreaterThanOrEqual(1);
        expect(attenteDe(reponse)).toBeLessThanOrEqual(60);
        await erreurDe(reponse, 429, "trop-de-requetes");
      }
      expect(await texteDeLaBase(base)).toBe(avant);

      maintenant += 45_000;
      const attente = attenteDe(await listerLesSessions(serveur, titulaire.cookie));
      expect(attente).toBe(15);
      maintenant += 15_000;
      expect((await listerLesSessions(serveur, titulaire.cookie)).status).toBe(200);
    },
    DELAI_MS,
  );
});

// Tout ce que le processus du test écrit, de la console aux deux flux, à partir de maintenant.
function capturerLaSortie(): () => string {
  const morceaux: string[] = [];
  const garder = (...valeurs: unknown[]) => {
    morceaux.push(valeurs.map((valeur) => String(valeur)).join(" "));
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

function evenements(): LigneDeJournal[] {
  return serveur.lignesDuJournal().filter(({ message }) => message === "compte");
}

describe("journal (F-027-AC18)", () => {
  it(
    "F-027-AC18 chaque changement, révocation, refus pour mot de passe incorrect et plafond atteint écrit une ligne d'identifiants ; aucune sortie ne porte de secret ni de donnée personnelle",
    async () => {
      const sortie = capturerLaSortie();
      const titulaire = await preparer();
      const visee = await ouvrirUneSession(base, titulaire.id, { agentUtilisateur: AGENT_SECRET });
      await ouvrirUneSession(base, titulaire.id);
      const empreinteAvant = await empreinteDuCompte(base, titulaire.id);
      const appel = (methode: string, chemin: string, corps?: unknown) =>
        appeler(serveur, methode, chemin, {
          cookie: titulaire.cookie,
          corps,
          enTetes: { "User-Agent": AGENT_SECRET },
        });
      const revocation = cheminDe(CHEMINS_DU_COMPTE.revocation, { idSession: visee.idSession });

      const reponses = {
        nom: await appel("PATCH", CHEMINS_DU_COMPTE.compte, { nom: NOM_SECRET }),
        liste: await appel("GET", CHEMINS_DU_COMPTE.sessions),
        refus: await appel("POST", revocation, FAUX),
        revocation: await appel("POST", revocation, { motDePasseActuel: MOT_DE_PASSE_ACTUEL }),
        autres: await appel("POST", CHEMINS_DU_COMPTE.revocationDesAutres, {
          motDePasseActuel: MOT_DE_PASSE_ACTUEL,
        }),
        motDePasse: await appel("POST", CHEMINS_DU_COMPTE.motDePasse, {
          motDePasseActuel: MOT_DE_PASSE_ACTUEL,
          nouveauMotDePasse: NOUVEAU_MOT_DE_PASSE,
        }),
        invalide: await appel("POST", CHEMINS_DU_COMPTE.motDePasse, {
          motDePasseActuel: MOT_DE_PASSE_ACTUEL,
          nouveauMotDePasse: "court-x1",
        }),
      };
      const plafond = await appel("POST", CHEMINS_DU_COMPTE.revocationDesAutres, FAUX);
      expect(Object.values(reponses).map(({ status }) => status)).toEqual([
        200, 200, 403, 204, 200, 204, 400,
      ]);
      expect(plafond.status).toBe(429);
      const idDe = (reponse: Response) => reponse.headers.get("x-request-id");
      const commun = { adresse: "127.0.0.1", idCompte: titulaire.id };

      expect(evenements()).toEqual([
        expect.objectContaining({ type: "nom-change", idRequete: idDe(reponses.nom), ...commun }),
        expect.objectContaining({
          type: "mot-de-passe-incorrect",
          idRequete: idDe(reponses.refus),
          idSession: visee.idSession,
          ...commun,
        }),
        expect.objectContaining({
          type: "session-revoquee",
          idRequete: idDe(reponses.revocation),
          idSession: visee.idSession,
          ...commun,
        }),
        expect.objectContaining({
          type: "sessions-revoquees",
          idRequete: idDe(reponses.autres),
          ...commun,
        }),
        expect.objectContaining({
          type: "mot-de-passe-change",
          idRequete: idDe(reponses.motDePasse),
          ...commun,
        }),
        expect.objectContaining({ type: "debit-depasse", idRequete: idDe(plafond), ...commun }),
      ]);
      for (const ligne of evenements()) {
        expect(Object.keys(ligne).sort()).toEqual(
          expect.arrayContaining(["adresse", "idCompte", "idRequete", "message", "type"]),
        );
        expect(
          Object.keys(ligne).filter(
            (cle) =>
              ![
                "adresse",
                "idCompte",
                "idRequete",
                "idSession",
                "message",
                "niveau",
                "time",
                "type",
              ].includes(cle),
          ),
        ).toEqual([]);
      }
      const texte = `${serveur.texteDuJournal()}\n${sortie()}`;
      const empreinteApres = await empreinteDuCompte(base, titulaire.id);
      const jetons = (await lignesDe(base, "session")).map(({ token }) => token);
      for (const secret of [
        MOT_DE_PASSE_ACTUEL,
        NOUVEAU_MOT_DE_PASSE,
        FAUX.motDePasseActuel,
        "court-x1",
        empreinteAvant ?? "",
        empreinteApres ?? "",
        titulaire.jeton,
        visee.jeton,
        titulaire.cookie,
        ...jetons,
        NOM_SECRET,
        titulaire.nom,
        titulaire.courriel,
        AGENT_SECRET,
      ]) {
        expect(secret).not.toBe("");
        expect(texte).not.toContain(secret);
      }
    },
    DELAI_MS,
  );
});
