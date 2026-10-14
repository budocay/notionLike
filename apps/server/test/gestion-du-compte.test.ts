// Routes de la gestion du compte (F-027) contre le serveur réel et la base embarquée : nom (AC1 à
// AC3), mot de passe (AC4 à AC7), sessions (AC9 à AC13), protection des routes (AC14, AC16, AC17).
// Chaque corps de réponse lu passe par un schéma publié (AC19).
import crypto from "node:crypto";

import {
  CHEMINS_COMPTES,
  ROUTES_DU_COMPTE,
  schemaCompte,
  schemaCompteNatif,
  schemaListeMembresVueParUnProprietaire,
  schemaListeSessions,
  schemaRevocationDesAutres,
} from "@notionlike/contrats";
import type { Base } from "@notionlike/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  arreterLesServeurs,
  DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  lancerServeur,
  type ServeurDEssai,
} from "./aides.ts";
import {
  connecter,
  cookiePose,
  DELAI_D_UN_CAS_QUI_OUVRE_SA_BASE_MS,
  ecouterLesSuppressions,
  enTetesDOuverture,
  executer,
  fermerLesBases,
  lignesDe,
  lire,
  NOM_DU_COOKIE,
  NOM_DU_COOKIE_SECURISE,
  ouvrirUneBase,
  texteDeLaBase,
} from "./aides-comptes.ts";
import {
  appeler,
  cheminDe,
  corpsDe,
  erreurDe,
  etatDesEspaces,
  nouvelIdentifiant,
} from "./aides-espaces.ts";
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
  sessionsRestantes,
  type TitulaireDEssai,
} from "./aides-gestion-du-compte.ts";

const DELAI_MS = 30_000;
const ORIGINE_ETRANGERE = "http://ailleurs.exemple.test";
const ID_INCONNU = "00000000-0000-4000-8000-000000000000";
const MAUVAIS = { motDePasseActuel: "pas-le-bon-mot-de-passe" };

let base: Base;
let serveur: ServeurDEssai;

beforeAll(async () => {
  base = await ouvrirUneBase();
}, DELAI_D_OUVERTURE_D_UNE_BASE_MS);
afterEach(async () => {
  vi.restoreAllMocks();
  await arreterLesServeurs();
});
afterAll(fermerLesBases);

async function preparer(): Promise<TitulaireDEssai> {
  serveur = await lancerServeur(base);
  return creerUnTitulaire(base);
}

// Le statut de `GET /api/v1/moi` pour un cookie : 200 si sa session vit, 401 sinon.
async function statutDeMoi(cookie: string): Promise<number> {
  return (await lire(serveur, CHEMINS_COMPTES.moi, cookie)).status;
}

async function nomEnBase(idCompte: string): Promise<string | undefined> {
  return (await lignesDe(base, "user")).find(({ id }) => id === idCompte)?.name;
}

describe("changement du nom", () => {
  it(
    "F-027-AC1 F-027-AC19 le nom est enregistré et rendu au schéma de /api/v1/moi ; /moi, la liste des membres et get-session le rendent dès la requête suivante",
    async () => {
      const titulaire = await preparer();
      const idEspace = nouvelIdentifiant();
      const creation = await appeler(serveur, "POST", "/api/v1/espaces", {
        cookie: titulaire.cookie,
        corps: { idEspace, nom: "Équipe" },
      });
      expect(creation.status).toBe(201);

      const reponse = await changerLeNom(serveur, titulaire.cookie, { nom: "Ada B." });

      expect(await corpsDe(reponse, 200, schemaCompte)).toEqual({
        id: titulaire.id,
        nom: "Ada B.",
        courriel: titulaire.courriel,
      });
      const moi = schemaCompte.parse(
        await (await lire(serveur, CHEMINS_COMPTES.moi, titulaire.cookie)).json(),
      );
      const membres = await corpsDe(
        await appeler(serveur, "GET", `/api/v1/espaces/${idEspace}/membres`, {
          cookie: titulaire.cookie,
        }),
        200,
        schemaListeMembresVueParUnProprietaire,
      );
      const natif = await corpsDe(
        await lire(serveur, CHEMINS_COMPTES.session, titulaire.cookie),
        200,
        z.looseObject({ user: schemaCompteNatif }),
      );
      expect(moi.nom).toBe("Ada B.");
      expect(membres.membres.map(({ nom }) => nom)).toEqual(["Ada B."]);
      expect(natif.user.name).toBe("Ada B.");
    },
    DELAI_MS,
  );

  it.each([
    ["nom manquant", {}],
    ["nom vide", { nom: "" }],
    ["nom fait de blancs", { nom: "   " }],
    ["nom de 101 caractères", { nom: "n".repeat(101) }],
    ["courriel en plus", { nom: "Ada", courriel: "autre@exemple.test" }],
    ["email en plus", { nom: "Ada", email: "autre@exemple.test" }],
    ["image en plus", { nom: "Ada", image: "https://exemple.test/a.png" }],
    ["emailVerified en plus", { nom: "Ada", emailVerified: true }],
    ["id en plus", { nom: "Ada", id: ID_INCONNU }],
    ["corps qui n'est pas du JSON", "nom=Ada"],
  ])(
    "F-027-AC2 %s : 400 requete-invalide, rien de modifié",
    async (_cas, corps) => {
      const titulaire = await preparer();
      const avant = await texteDeLaBase(base);

      const reponse =
        typeof corps === "string"
          ? await appeler(serveur, "PATCH", "/api/v1/compte", {
              cookie: titulaire.cookie,
              brut: corps,
              enTetes: { "Content-Type": "application/x-www-form-urlencoded" },
            })
          : await changerLeNom(serveur, titulaire.cookie, corps);

      await erreurDe(reponse, 400, "requete-invalide");
      expect(await texteDeLaBase(base)).toBe(avant);
    },
    DELAI_MS,
  );

  it(
    "F-027-AC2 F-027-AC3 un changement de nom accepté n'écrit que le nom : courriel, état de vérification, identifiant et espaces inchangés",
    async () => {
      const titulaire = await preparer();
      const [avant] = (await lignesDe(base, "user")).filter(({ id }) => id === titulaire.id);
      const espaces = await etatDesEspaces(base);

      await corpsDe(
        await changerLeNom(serveur, titulaire.cookie, { nom: "Autre" }),
        200,
        schemaCompte,
      );

      const [apres] = (await lignesDe(base, "user")).filter(({ id }) => id === titulaire.id);
      expect(apres).toMatchObject({
        id: avant?.id,
        email: avant?.email,
        emailVerified: avant?.emailVerified,
        image: avant?.image,
        name: "Autre",
      });
      expect(await etatDesEspaces(base)).toBe(espaces);
    },
    DELAI_MS,
  );
});

describe("changement du mot de passe", () => {
  it(
    "F-027-AC4 F-027-AC13 204 ; empreinte nouvelle au format de F-009-AC5, autres sessions supprimées par la fonction, session courante gardée sans cookie posé",
    async () => {
      const titulaire = await preparer();
      const autre = await ouvrirUneSession(base, titulaire.id);
      const ancienne = await empreinteDuCompte(base, titulaire.id);
      const recus = ecouterLesSuppressions(serveur);

      const reponse = await changerLeMotDePasse(serveur, titulaire.cookie);

      expect(reponse.status).toBe(204);
      expect(reponse.headers.getSetCookie()).toEqual([]);
      const nouvelle = await empreinteDuCompte(base, titulaire.id);
      expect(nouvelle).toMatch(
        /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/,
      );
      expect(nouvelle).not.toBe(ancienne);
      expect(await sessionsRestantes(base, titulaire.id)).toEqual([titulaire.idSession]);
      expect(recus).toEqual([{ idSession: autre.idSession, idCompte: titulaire.id }]);
      expect(await statutDeMoi(titulaire.cookie)).toBe(200);
    },
    DELAI_MS,
  );

  it(
    "F-027-AC5 par la route native de connexion du serveur réel, l'ancien mot de passe est refusé et le nouveau accepté ; une session ouverte avant est refusée par /moi",
    async () => {
      const titulaire = await preparer();
      const avant = await connecter(serveur, {
        email: titulaire.courriel,
        password: MOT_DE_PASSE_ACTUEL,
      });
      expect(avant.status).toBe(200);
      const cookieDAvant = cookiePose(avant).paire;
      expect(await statutDeMoi(cookieDAvant)).toBe(200);

      expect((await changerLeMotDePasse(serveur, titulaire.cookie)).status).toBe(204);

      const ancien = await connecter(serveur, {
        email: titulaire.courriel,
        password: MOT_DE_PASSE_ACTUEL,
      });
      const nouveau = await connecter(serveur, {
        email: titulaire.courriel,
        password: NOUVEAU_MOT_DE_PASSE,
      });
      expect([ancien.status, nouveau.status]).toEqual([401, 200]);
      expect(await statutDeMoi(cookieDAvant)).toBe(401);
      expect(await statutDeMoi(titulaire.cookie)).toBe(200);
    },
    DELAI_MS,
  );

  it(
    "F-027-AC4 un nouveau mot de passe égal à l'ancien est accepté, avec le même effet sur les sessions (H4)",
    async () => {
      const titulaire = await preparer();
      await ouvrirUneSession(base, titulaire.id);

      const reponse = await changerLeMotDePasse(serveur, titulaire.cookie, {
        motDePasseActuel: MOT_DE_PASSE_ACTUEL,
        nouveauMotDePasse: MOT_DE_PASSE_ACTUEL,
      });

      expect(reponse.status).toBe(204);
      expect(await sessionsRestantes(base, titulaire.id)).toEqual([titulaire.idSession]);
    },
    DELAI_MS,
  );

  it(
    "F-027-AC6 un mot de passe actuel faux : 403 mot-de-passe-incorrect après un calcul aux paramètres de F-009-AC5, rien de modifié, session courante gardée",
    async () => {
      const titulaire = await preparer();
      await ouvrirUneSession(base, titulaire.id);
      const avant = await texteDeLaBase(base);
      const calcul = vi.spyOn(crypto, "argon2");

      const reponse = await changerLeMotDePasse(serveur, titulaire.cookie, {
        ...MAUVAIS,
        nouveauMotDePasse: NOUVEAU_MOT_DE_PASSE,
      });

      await erreurDe(reponse, 403, "mot-de-passe-incorrect");
      expect(calcul).toHaveBeenCalledTimes(1);
      expect(calcul.mock.calls[0]?.[1]).toMatchObject({
        memory: 19_456,
        passes: 2,
        parallelism: 1,
      });
      expect(await texteDeLaBase(base)).toBe(avant);
      expect(await statutDeMoi(titulaire.cookie)).toBe(200);
    },
    DELAI_MS,
  );

  it.each(["pas-une-empreinte", "", `${"ab".repeat(16)}:${"cd".repeat(64)}`])(
    "F-027-AC6 une empreinte stockée mal formée (%j) : 403 mot-de-passe-incorrect sur chaque action sensible, après un calcul, sans erreur",
    async (stockee) => {
      const titulaire = await preparer();
      const autre = await ouvrirUneSession(base, titulaire.id);
      await executer(
        base,
        `update "account" set "password" = '${stockee}' where "userId" = '${titulaire.id}'`,
      );
      const avant = await texteDeLaBase(base);
      const calcul = vi.spyOn(crypto, "argon2");

      const reponses = [
        await changerLeMotDePasse(serveur, titulaire.cookie),
        await revoquer(serveur, titulaire.cookie, autre.idSession),
        await revoquerLesAutres(serveur, titulaire.cookie),
      ];

      for (const reponse of reponses) {
        await erreurDe(reponse, 403, "mot-de-passe-incorrect");
      }
      expect(calcul).toHaveBeenCalledTimes(3);
      expect(await texteDeLaBase(base)).toBe(avant);
    },
    DELAI_MS,
  );

  it.each([
    ["nouveau mot de passe manquant", { motDePasseActuel: MOT_DE_PASSE_ACTUEL }],
    [
      "nouveau de 11 caractères",
      { motDePasseActuel: MOT_DE_PASSE_ACTUEL, nouveauMotDePasse: "n".repeat(11) },
    ],
    [
      "nouveau de 129 caractères",
      { motDePasseActuel: MOT_DE_PASSE_ACTUEL, nouveauMotDePasse: "n".repeat(129) },
    ],
    ["actuel manquant", { nouveauMotDePasse: NOUVEAU_MOT_DE_PASSE }],
    [
      "actuel de 129 caractères",
      { motDePasseActuel: "m".repeat(129), nouveauMotDePasse: NOUVEAU_MOT_DE_PASSE },
    ],
    [
      "champ inconnu",
      {
        motDePasseActuel: MOT_DE_PASSE_ACTUEL,
        nouveauMotDePasse: NOUVEAU_MOT_DE_PASSE,
        revokeOtherSessions: false,
      },
    ],
  ])(
    "F-027-AC7 %s : 400 requete-invalide avant tout calcul, rien de modifié, aucun mot de passe répété",
    async (_cas, corps) => {
      const titulaire = await preparer();
      const avant = await texteDeLaBase(base);
      const calcul = vi.spyOn(crypto, "argon2");

      const reponse = await changerLeMotDePasse(serveur, titulaire.cookie, corps);
      const texte = await reponse.clone().text();

      await erreurDe(reponse, 400, "requete-invalide");
      expect(calcul).not.toHaveBeenCalled();
      expect(await texteDeLaBase(base)).toBe(avant);
      for (const motDePasse of Object.values(corps).filter(
        (valeur) => typeof valeur === "string",
      )) {
        expect(texte).not.toContain(motDePasse);
        expect(serveur.texteDuJournal()).not.toContain(motDePasse);
      }
    },
    DELAI_MS,
  );

  it(
    "F-027-AC7 un corps de révocation sans mot de passe actuel ou avec un champ inconnu : 400 avant tout calcul",
    async () => {
      const titulaire = await preparer();
      const autre = await ouvrirUneSession(base, titulaire.id);
      const calcul = vi.spyOn(crypto, "argon2");

      await erreurDe(
        await revoquer(serveur, titulaire.cookie, autre.idSession, {}),
        400,
        "requete-invalide",
      );
      await erreurDe(
        await revoquerLesAutres(serveur, titulaire.cookie, {
          motDePasseActuel: MOT_DE_PASSE_ACTUEL,
          token: "x",
        }),
        400,
        "requete-invalide",
      );
      expect(calcul).not.toHaveBeenCalled();
      expect(await sessionsRestantes(base, titulaire.id)).toHaveLength(2);
    },
    DELAI_MS,
  );
});

describe("liste des sessions", () => {
  it(
    "F-027-AC9 F-027-AC19 les sessions non expirées du compte seules, de la plus récemment utilisée à la plus ancienne, la courante désignée, sans aucun jeton",
    async () => {
      const titulaire = await preparer();
      const maintenant = Date.now();
      const ancienne = await ouvrirUneSession(base, titulaire.id, {
        prolongeeLe: new Date(maintenant - 3_600_000),
        adresseIp: "203.0.113.7",
        agentUtilisateur: "Navigateur ancien",
      });
      const recente = await ouvrirUneSession(base, titulaire.id, {
        prolongeeLe: new Date(maintenant - 60_000),
        adresseIp: "2001:db8::",
        agentUtilisateur: "Navigateur récent",
      });
      const expiree = await ouvrirUneSession(base, titulaire.id, {
        expireLe: new Date(maintenant - 1000),
      });
      const autreCompte = await creerUnTitulaire(base, "autre");

      const { sessions } = await corpsDe(
        await listerLesSessions(serveur, titulaire.cookie),
        200,
        schemaListeSessions,
      );

      expect(sessions.map(({ idSession }) => idSession)).toEqual([
        titulaire.idSession,
        recente.idSession,
        ancienne.idSession,
      ]);
      expect(sessions.map(({ courante }) => courante)).toEqual([true, false, false]);
      expect(sessions[2]).toMatchObject({
        prolongeeLe: new Date(maintenant - 3_600_000).toISOString(),
        adresseIp: "203.0.113.7",
        agentUtilisateur: "Navigateur ancien",
      });
      const texte = JSON.stringify(sessions);
      for (const jeton of [titulaire.jeton, ancienne.jeton, recente.jeton, expiree.jeton]) {
        expect(texte).not.toContain(jeton);
        expect(texte).not.toContain(encodeURIComponent(jeton));
      }
      expect(texte).not.toContain(expiree.idSession);
      expect(texte).not.toContain(autreCompte.idSession);
      expect(texte).not.toContain(NOM_DU_COOKIE);
    },
    DELAI_MS,
  );

  it(
    "F-027-AC9 100 sessions au plus ; l'agent utilisateur est tronqué à 300 caractères",
    async () => {
      const titulaire = await preparer();
      const long = `${"a".repeat(299)}😀fin`;
      await ouvrirUneSession(base, titulaire.id, { agentUtilisateur: long });
      for (let rang = 0; rang < 104; rang += 1) {
        await ouvrirUneSession(base, titulaire.id, {
          prolongeeLe: new Date(Date.now() - 86_400_000),
        });
      }

      const { sessions } = await corpsDe(
        await listerLesSessions(serveur, titulaire.cookie),
        200,
        schemaListeSessions,
      );

      expect(sessions).toHaveLength(100);
      const tronque = sessions.find(({ agentUtilisateur }) => agentUtilisateur?.startsWith("aaa"));
      expect(tronque?.agentUtilisateur).toBe("a".repeat(299));
    },
    DELAI_MS,
  );
});

describe("révocation d'une session", () => {
  it(
    "F-027-AC10 F-027-AC13 204 ; la session visée est supprimée par la fonction, son cookie refusé par /moi dès la requête suivante",
    async () => {
      const titulaire = await preparer();
      const visee = await ouvrirUneSession(base, titulaire.id);
      const gardee = await ouvrirUneSession(base, titulaire.id);
      const recus = ecouterLesSuppressions(serveur);
      expect(await statutDeMoi(visee.cookie)).toBe(200);

      const reponse = await revoquer(serveur, titulaire.cookie, visee.idSession);

      expect(reponse.status).toBe(204);
      expect(await statutDeMoi(visee.cookie)).toBe(401);
      expect(await statutDeMoi(gardee.cookie)).toBe(200);
      expect(await statutDeMoi(titulaire.cookie)).toBe(200);
      expect(recus).toEqual([{ idSession: visee.idSession, idCompte: titulaire.id }]);
    },
    DELAI_MS,
  );

  it(
    "F-027-AC11 une session d'un autre compte, inconnue, déjà révoquée, expirée, ou un identifiant qui n'est pas un uuid : le même 404, rien de supprimé",
    async () => {
      const titulaire = await preparer();
      const autreCompte = await creerUnTitulaire(base, "autre");
      const expiree = await ouvrirUneSession(base, titulaire.id, {
        expireLe: new Date(Date.now() - 1000),
      });
      const revoquee = await ouvrirUneSession(base, titulaire.id);
      expect((await revoquer(serveur, titulaire.cookie, revoquee.idSession)).status).toBe(204);
      const avant = await texteDeLaBase(base);
      const ecoutes: unknown[][] = [];

      // Sept actions sensibles en tout : chaque cas a son serveur, donc ses compteurs (AC15).
      const enveloppes = [];
      for (const idSession of [
        autreCompte.idSession,
        ID_INCONNU,
        revoquee.idSession,
        expiree.idSession,
        "pas-un-uuid",
        autreCompte.idSession.toUpperCase(),
      ]) {
        serveur = await lancerServeur(base);
        ecoutes.push(ecouterLesSuppressions(serveur));
        const enveloppe = await erreurDe(
          await revoquer(serveur, titulaire.cookie, idSession),
          404,
          "ressource-introuvable",
        );
        enveloppes.push({ ...enveloppe, idRequete: "" });
      }

      expect(new Set(enveloppes.map((enveloppe) => JSON.stringify(enveloppe))).size).toBe(1);
      expect(await texteDeLaBase(base)).toBe(avant);
      expect(ecoutes.flat()).toEqual([]);
      expect(await statutDeMoi(autreCompte.cookie)).toBe(200);
    },
    DELAI_MS,
  );

  it(
    "F-027-AC11 la session courante : 409 session-courante, rien de supprimé",
    async () => {
      const titulaire = await preparer();
      const avant = await texteDeLaBase(base);

      await erreurDe(
        await revoquer(serveur, titulaire.cookie, titulaire.idSession),
        409,
        "session-courante",
      );

      expect(await texteDeLaBase(base)).toBe(avant);
      expect(await statutDeMoi(titulaire.cookie)).toBe(200);
    },
    DELAI_MS,
  );

  it(
    "F-027-AC6 F-027-AC10 un mot de passe actuel faux : 403, la session visée reste",
    async () => {
      const titulaire = await preparer();
      const visee = await ouvrirUneSession(base, titulaire.id);

      await erreurDe(
        await revoquer(serveur, titulaire.cookie, visee.idSession, MAUVAIS),
        403,
        "mot-de-passe-incorrect",
      );

      expect(await statutDeMoi(visee.cookie)).toBe(200);
    },
    DELAI_MS,
  );
});

describe("révocation des autres sessions", () => {
  it(
    "F-027-AC12 F-027-AC13 200 avec le nombre de sessions supprimées, expirées comprises, par la fonction ; la session courante reste",
    async () => {
      const titulaire = await preparer();
      const autres = [
        await ouvrirUneSession(base, titulaire.id),
        await ouvrirUneSession(base, titulaire.id),
        await ouvrirUneSession(base, titulaire.id, { expireLe: new Date(Date.now() - 1000) }),
      ];
      const autreCompte = await creerUnTitulaire(base, "autre");
      const recus = ecouterLesSuppressions(serveur);

      const corps = await corpsDe(
        await revoquerLesAutres(serveur, titulaire.cookie),
        200,
        schemaRevocationDesAutres,
      );

      expect(corps).toEqual({ supprimees: 3 });
      expect(await sessionsRestantes(base, titulaire.id)).toEqual([titulaire.idSession]);
      expect(recus.map(({ idSession }) => idSession).sort()).toEqual(
        autres.map(({ idSession }) => idSession).sort(),
      );
      expect(await statutDeMoi(titulaire.cookie)).toBe(200);
      expect(await statutDeMoi(autreCompte.cookie)).toBe(200);
      expect(
        await corpsDe(
          await revoquerLesAutres(serveur, titulaire.cookie),
          200,
          schemaRevocationDesAutres,
        ),
      ).toEqual({ supprimees: 0 });
    },
    DELAI_MS,
  );

  it(
    "F-027-AC6 F-027-AC12 un mot de passe actuel faux : 403, aucune session supprimée",
    async () => {
      const titulaire = await preparer();
      await ouvrirUneSession(base, titulaire.id);

      await erreurDe(
        await revoquerLesAutres(serveur, titulaire.cookie, MAUVAIS),
        403,
        "mot-de-passe-incorrect",
      );

      expect(await sessionsRestantes(base, titulaire.id)).toHaveLength(2);
    },
    DELAI_MS,
  );
});

describe("protection des routes", () => {
  it(
    "F-027-AC14 sans session valide, chaque route répond 401 non-authentifie avant de lire le corps, et rien ne change",
    async () => {
      const titulaire = await preparer();
      const avant = await texteDeLaBase(base);
      const cookies = [undefined, `${NOM_DU_COOKIE}=inconnu.signature`];

      for (const route of ROUTES_DU_COMPTE) {
        for (const cookie of cookies) {
          const reponse = await appeler(
            serveur,
            route.methode,
            cheminDe(route.chemin, { idSession: titulaire.idSession }),
            route.methode === "GET"
              ? { cookie }
              : {
                  cookie,
                  brut: "{ce n'est pas du JSON",
                  enTetes: { "Content-Type": "application/json" },
                },
          );
          await erreurDe(reponse, 401, "non-authentifie");
        }
      }

      expect(await texteDeLaBase(base)).toBe(avant);
    },
    DELAI_MS,
  );

  it(
    "F-027-AC14 avec deux comptes, aucune route ne lit ni ne modifie le nom, le mot de passe ou les sessions de l'autre",
    async () => {
      const anne = await preparer();
      const bob = await creerUnTitulaire(base, "bob");
      const sessionDeBob = await ouvrirUneSession(base, bob.id);
      const empreinteDeBob = await empreinteDuCompte(base, bob.id);
      const nomDeBob = await nomEnBase(bob.id);

      await corpsDe(await changerLeNom(serveur, anne.cookie, { nom: "Anne" }), 200, schemaCompte);
      expect((await changerLeMotDePasse(serveur, anne.cookie)).status).toBe(204);
      const liste = await corpsDe(
        await listerLesSessions(serveur, anne.cookie),
        200,
        schemaListeSessions,
      );
      await erreurDe(
        await revoquer(serveur, anne.cookie, sessionDeBob.idSession, {
          motDePasseActuel: NOUVEAU_MOT_DE_PASSE,
        }),
        404,
        "ressource-introuvable",
      );
      await corpsDe(
        await revoquerLesAutres(serveur, anne.cookie, { motDePasseActuel: NOUVEAU_MOT_DE_PASSE }),
        200,
        schemaRevocationDesAutres,
      );

      expect(liste.sessions.map(({ idSession }) => idSession)).toEqual([anne.idSession]);
      expect(await nomEnBase(bob.id)).toBe(nomDeBob);
      expect(await empreinteDuCompte(base, bob.id)).toBe(empreinteDeBob);
      expect(await sessionsRestantes(base, bob.id)).toEqual(
        [bob.idSession, sessionDeBob.idSession].sort(),
      );
    },
    DELAI_MS,
  );

  it.each(["test", "development", "production"])(
    "F-027-AC16 sous NODE_ENV=%s, une écriture d'origine étrangère reçoit 403 origine-refusee sans rien modifier, et aucun en-tête Access-Control-Allow-*",
    async (nodeEnv) => {
      serveur = await lancerServeur(base, { env: { NODE_ENV: nodeEnv } });
      const nomDuCookie = nodeEnv === "production" ? NOM_DU_COOKIE_SECURISE : NOM_DU_COOKIE;
      const titulaire = await creerUnTitulaire(base, "origine", nomDuCookie);
      const autre = await ouvrirUneSession(base, titulaire.id);
      const avant = await texteDeLaBase(base);
      const ecritures = ROUTES_DU_COMPTE.filter(({ methode }) => methode !== "GET");

      for (const route of ecritures) {
        const reponse = await appeler(
          serveur,
          route.methode,
          cheminDe(route.chemin, { idSession: autre.idSession }),
          {
            cookie: titulaire.cookie,
            corps: {
              nom: "x",
              motDePasseActuel: MOT_DE_PASSE_ACTUEL,
              nouveauMotDePasse: NOUVEAU_MOT_DE_PASSE,
            },
            enTetes: { Origin: ORIGINE_ETRANGERE },
          },
        );
        expect(enTetesDOuverture(reponse.headers)).toEqual([]);
        await erreurDe(reponse, 403, "origine-refusee");
      }

      expect(ecritures).toHaveLength(4);
      expect(await texteDeLaBase(base)).toBe(avant);
    },
    DELAI_MS,
  );

  it(
    "F-027-AC17 la suppression des autres sessions en échec : 500 erreur-interne, et le mot de passe n'est pas changé (transaction annulée en entier)",
    async () => {
      const defaillante = await ouvrirUneBase();
      serveur = await lancerServeur(defaillante);
      const titulaire = await creerUnTitulaire(defaillante);
      await ouvrirUneSession(defaillante, titulaire.id);
      const avant = await empreinteDuCompte(defaillante, titulaire.id);
      for (const instruction of [
        `create function essai_refus() returns trigger language plpgsql as $$
         begin raise exception 'suppression refusée'; end; $$`,
        `create trigger essai_refus before delete on "session" for each row execute function essai_refus()`,
      ]) {
        await executer(defaillante, instruction);
      }

      const reponse = await changerLeMotDePasse(serveur, titulaire.cookie);

      await erreurDe(reponse, 500, "erreur-interne");
      expect(await empreinteDuCompte(defaillante, titulaire.id)).toBe(avant);
      expect(await sessionsRestantes(defaillante, titulaire.id)).toHaveLength(2);
      const journal = serveur.texteDuJournal();
      expect(journal).not.toContain("mot-de-passe-change");
      expect(journal).toContain("erreur-interne");
    },
    DELAI_D_UN_CAS_QUI_OUVRE_SA_BASE_MS,
  );

  it(
    "F-027-AC17 une lecture des sessions ou de l'empreinte en échec : 500 erreur-interne, sans révocation annoncée",
    async () => {
      const defaillante = await ouvrirUneBase();
      serveur = await lancerServeur(defaillante);
      const titulaire = await creerUnTitulaire(defaillante);
      const autre = await ouvrirUneSession(defaillante, titulaire.id);
      await executer(defaillante, `alter table "account" rename to "account_cache"`);

      await erreurDe(
        await revoquer(serveur, titulaire.cookie, autre.idSession),
        500,
        "erreur-interne",
      );
      await erreurDe(await revoquerLesAutres(serveur, titulaire.cookie), 500, "erreur-interne");

      expect(await sessionsRestantes(defaillante, titulaire.id)).toHaveLength(2);
      expect(serveur.texteDuJournal()).not.toMatch(/session-revoquee|sessions-revoquees/);
    },
    DELAI_D_UN_CAS_QUI_OUVRE_SA_BASE_MS,
  );
});
