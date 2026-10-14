// Autorisation des routes de F-011 : session (AC8), ordre des contrôles et absence de cache (AC9),
// matrice des droits (AC10, AC11), aucune fuite d'existence (AC12), origine (AC26), lecture en
// échec (AC28) et rattachement de chaque route d'espace à une action (AC32).
import {
  ACTIONS,
  CHEMIN_SYNCHRO,
  CHEMINS_ESPACES,
  MATRICE_DES_DROITS,
  ROLES,
  ROUTES_ESPACES,
  ROUTES_PUBLIQUES,
  schemaEnveloppeErreur,
  schemaInvitationCreee,
  type Action,
  type RouteApi,
} from "@notionlike/contrats";
import type { Base } from "@notionlike/db";
import type { Express } from "express";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { permet } from "../src/autorisation.ts";
import { ACTIONS_DES_ROUTES_D_ESPACE } from "../src/espaces.ts";
import {
  arreterLesServeurs,
  DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  lancerServeur,
  type ServeurDEssai,
} from "./aides.ts";
import {
  cookieSigne,
  DELAI_D_UN_CAS_QUI_OUVRE_SA_BASE_MS,
  executer,
  fermerLesBases,
  NOM_DU_COOKIE,
  NOM_DU_COOKIE_SECURISE,
  ouvrirUneBase,
} from "./aides-comptes.ts";
import {
  ajouterUnMembre,
  appeler,
  cheminDe,
  corpsDe,
  creerUnCompte,
  erreurDe,
  etatDesEspaces,
  lignesSql,
  nouvelIdentifiant,
  preparerUnEspace,
  type CompteDEssai,
  type EspaceDEssai,
} from "./aides-espaces.ts";
import { connecter, fermerLesClients } from "./aides-synchro.ts";
import { demarrerServeurDEssai } from "./fabrique.ts";

const DELAI_MS = 30_000;
const PREFIXE_API = "/api/v1/";
const ORIGINE_ETRANGERE = "http://ailleurs.exemple.test";
const ORIGINE_AUTORISEE = "http://autorisee.exemple.test";

let base: Base;
let serveur: ServeurDEssai;

beforeAll(async () => {
  base = await ouvrirUneBase();
}, DELAI_D_OUVERTURE_D_UNE_BASE_MS);
afterEach(arreterLesServeurs);
afterAll(fermerLesBases);

async function preparer(): Promise<EspaceDEssai> {
  serveur = await lancerServeur(base);
  return preparerUnEspace(serveur, base);
}

// La partie d'une route du routeur d'Express que le test lit.
const schemaRouteExpress = z.object({
  path: z.string(),
  methods: z.record(z.string(), z.boolean()),
});

// Les couples méthode et chemin enregistrés dans le routeur de l'application.
function routesEnregistrees(application: Express): RouteApi[] {
  return application.router.stack.flatMap((couche) => {
    const route = schemaRouteExpress.safeParse(couche.route);
    if (!route.success) {
      return [];
    }
    return Object.keys(route.data.methods).map((methode) => ({
      methode: methode.toUpperCase() as RouteApi["methode"],
      chemin: route.data.path,
    }));
  });
}

const cle = ({ methode, chemin }: RouteApi): string => `${methode} ${chemin}`;

// F-011-AC8 : les trois façons d'échouer. `statuts` : le statut reçu sans session, par route.
function fautesDeSession(
  enregistrees: readonly RouteApi[],
  publiques: readonly RouteApi[],
  statuts: ReadonlyMap<string, number>,
): string[] {
  const listees = new Set(publiques.map(cle));
  const connues = new Set(enregistrees.map(cle));
  return [
    ...enregistrees
      .filter((route) => !listees.has(cle(route)) && statuts.get(cle(route)) !== 401)
      .map((route) => `ouverte sans être listée : ${cle(route)}`),
    ...publiques
      .filter((route) => connues.has(cle(route)) && statuts.get(cle(route)) === 401)
      .map((route) => `listée mais protégée : ${cle(route)}`),
    ...publiques
      .filter((route) => !connues.has(cle(route)))
      .map((route) => `listée mais absente : ${cle(route)}`),
  ];
}

describe("session (F-011-AC8)", () => {
  it(
    "F-011-AC8 toute route enregistrée sous /api/v1/ répond 401 sans session, hors de la liste publiée des routes publiques",
    async () => {
      const espace = await preparer();
      const enregistrees = routesEnregistrees(serveur.application).filter(({ chemin }) =>
        chemin.startsWith(PREFIXE_API),
      );
      const avant = await etatDesEspaces(base);

      const statuts = new Map<string, number>();
      for (const route of enregistrees) {
        const reponse = await appeler(serveur, route.methode, cheminDe(route.chemin, espace), {
          corps: route.methode === "GET" ? undefined : { nom: "x", role: "editeur", jeton: "x" },
        });
        statuts.set(cle(route), reponse.status);
        if (reponse.status === 401) {
          await erreurDe(reponse, 401, "non-authentifie");
        }
      }

      expect(enregistrees.map(cle)).toEqual(
        expect.arrayContaining([...ROUTES_ESPACES.map(cle), "GET /api/v1/moi"]),
      );
      expect(fautesDeSession(enregistrees, ROUTES_PUBLIQUES, statuts)).toEqual([]);
      expect(await etatDesEspaces(base)).toBe(avant);
    },
    DELAI_MS,
  );

  it(
    "F-011-AC8 F-012-AC31 le point de synchronisation, sous /api/v1/, refuse sans session (401), avec une origine admise",
    async () => {
      expect(CHEMIN_SYNCHRO.startsWith(PREFIXE_API)).toBe(true);
      expect(ROUTES_PUBLIQUES.map(({ chemin }) => chemin)).not.toContain(CHEMIN_SYNCHRO);
      const avecSynchro = await demarrerServeurDEssai();
      try {
        expect(await connecter(avecSynchro)).toEqual({ issue: "refusee", statut: 401 });
      } finally {
        await fermerLesClients();
        await avecSynchro.fermer();
      }
    },
    DELAI_D_UN_CAS_QUI_OUVRE_SA_BASE_MS,
  );

  it("F-011-AC8 le constat échoue dans ses trois cas", () => {
    const protegee = { methode: "GET", chemin: "/api/v1/protegee" } as const;
    const ouverte = { methode: "POST", chemin: "/api/v1/ouverte" } as const;
    const absente = { methode: "POST", chemin: "/api/v1/absente" } as const;

    expect(
      fautesDeSession(
        [protegee, ouverte],
        [protegee, absente],
        new Map([
          [cle(protegee), 401],
          [cle(ouverte), 200],
        ]),
      ),
    ).toEqual([
      "ouverte sans être listée : POST /api/v1/ouverte",
      "listée mais protégée : GET /api/v1/protegee",
      "listée mais absente : POST /api/v1/absente",
    ]);
  });

  it(
    "F-011-AC8 un cookie dont la session est inconnue reçoit 401 sur une route d'espace",
    async () => {
      const espace = await preparer();

      const reponse = await appeler(serveur, "GET", cheminDe(CHEMINS_ESPACES.espace, espace), {
        cookie: cookieSigne("session-inconnue"),
      });

      await erreurDe(reponse, 401, "non-authentifie");
    },
    DELAI_MS,
  );
});

type Sujet = "proprietaire" | "editeur" | "lecteur" | "nonMembre";
const SUJETS: readonly Sujet[] = ["proprietaire", "editeur", "lecteur", "nonMembre"];

interface Exercice {
  readonly succes: number;
  // Ce que la case prépare avant la requête : une cible, une invitation, un second propriétaire.
  preparer?(espace: EspaceDEssai): Promise<string>;
  executer(espace: EspaceDEssai, acteur: CompteDEssai, prepare: string): Promise<Response>;
}

// Une cible propre à chaque case : un lecteur ajouté pour l'occasion.
async function ajouterUneCible(espace: EspaceDEssai, role: "lecteur" | "proprietaire") {
  const cible = await creerUnCompte(base, "cible");
  await ajouterUnMembre(base, espace.idEspace, cible.id, role);
  return cible.id;
}

const EXERCICES: Readonly<Partial<Record<Action, Exercice>>> = {
  "lire-espace": {
    succes: 200,
    executer: (espace, { cookie }) =>
      appeler(serveur, "GET", cheminDe(CHEMINS_ESPACES.espace, espace), { cookie }),
  },
  "lister-membres": {
    succes: 200,
    executer: (espace, { cookie }) =>
      appeler(serveur, "GET", cheminDe(CHEMINS_ESPACES.membres, espace), { cookie }),
  },
  "quitter-espace": {
    succes: 204,
    // Un second propriétaire, pour que le premier puisse partir (F-011-AC17).
    preparer: (espace) => ajouterUneCible(espace, "proprietaire"),
    executer: (espace, acteur) =>
      appeler(
        serveur,
        "DELETE",
        cheminDe(CHEMINS_ESPACES.membre, { ...espace, idCompte: acteur.id }),
        { cookie: acteur.cookie },
      ),
  },
  "renommer-espace": {
    succes: 200,
    executer: (espace, { cookie }) =>
      appeler(serveur, "PATCH", cheminDe(CHEMINS_ESPACES.espace, espace), {
        cookie,
        corps: { nom: "Renommé" },
      }),
  },
  "supprimer-espace": {
    succes: 204,
    executer: (espace, { cookie }) =>
      appeler(serveur, "DELETE", cheminDe(CHEMINS_ESPACES.espace, espace), { cookie }),
  },
  inviter: {
    succes: 201,
    executer: (espace, { cookie }) =>
      appeler(serveur, "POST", cheminDe(CHEMINS_ESPACES.invitations, espace), {
        cookie,
        corps: { role: "lecteur" },
      }),
  },
  "retirer-membre": {
    succes: 204,
    preparer: (espace) => ajouterUneCible(espace, "lecteur"),
    executer: (espace, { cookie }, idCompte) =>
      appeler(serveur, "DELETE", cheminDe(CHEMINS_ESPACES.membre, { ...espace, idCompte }), {
        cookie,
      }),
  },
  "changer-role": {
    succes: 200,
    preparer: (espace) => ajouterUneCible(espace, "lecteur"),
    executer: (espace, { cookie }, idCompte) =>
      appeler(serveur, "PATCH", cheminDe(CHEMINS_ESPACES.membre, { ...espace, idCompte }), {
        cookie,
        corps: { role: "editeur" },
      }),
  },
};

// `inviter` couvre aussi la liste et la révocation : deux exercices de plus, sur la même action.
const EXERCICES_D_INVITER: readonly Exercice[] = [
  {
    succes: 200,
    executer: (espace, { cookie }) =>
      appeler(serveur, "GET", cheminDe(CHEMINS_ESPACES.invitations, espace), { cookie }),
  },
  {
    succes: 204,
    preparer: async (espace) => {
      const creee = await appeler(serveur, "POST", cheminDe(CHEMINS_ESPACES.invitations, espace), {
        cookie: espace.proprietaire.cookie,
        corps: { role: "editeur" },
      });
      return (await corpsDe(creee, 201, schemaInvitationCreee)).idInvitation;
    },
    executer: (espace, { cookie }, idInvitation) =>
      appeler(
        serveur,
        "DELETE",
        cheminDe(CHEMINS_ESPACES.invitation, { ...espace, idInvitation }),
        { cookie },
      ),
  },
];

const ACTIONS_SANS_ROUTE: readonly Action[] = ["lire-contenu", "ecrire-contenu"];

const CASES = Object.entries(EXERCICES).flatMap(([action, exercice]) => {
  const exercices = action === "inviter" ? [exercice, ...EXERCICES_D_INVITER] : [exercice];
  return exercices.flatMap((unExercice, rang) =>
    SUJETS.map((sujet) => [action as Action, rang, sujet, unExercice] as const),
  );
});

describe("matrice des droits (F-011-AC10, AC11)", () => {
  it("F-011-AC10 chaque action est exercée par une route, sauf lire-contenu et ecrire-contenu, laissées à F-012", () => {
    expect([...Object.keys(EXERCICES), ...ACTIONS_SANS_ROUTE].sort()).toEqual([...ACTIONS].sort());
  });

  it.each(CASES)(
    "F-011-AC10 F-011-AC11 F-011-AC12 l'action %s (exercice %i) par le %s reçoit le statut de la matrice",
    async (action, _rang, sujet, exercice) => {
      const espace = await preparer();
      const prepare = (await exercice.preparer?.(espace)) ?? "";
      const permise = sujet !== "nonMembre" && MATRICE_DES_DROITS[action].includes(sujet);
      const avant = await etatDesEspaces(base);

      const reponse = await exercice.executer(espace, espace[sujet], prepare);

      if (permise) {
        expect(reponse.status, await reponse.text()).toBe(exercice.succes);
        return;
      }
      const nonMembre = sujet === "nonMembre";
      const enveloppe = await erreurDe(
        reponse,
        nonMembre ? 404 : 403,
        nonMembre ? "ressource-introuvable" : "acces-refuse",
      );
      // F-011-AC11 : rien n'est exécuté, et la réponse ne dit rien de plus que l'enveloppe.
      expect(Object.keys(enveloppe).sort()).toEqual(["code", "idRequete", "message"]);
      expect(await etatDesEspaces(base)).toBe(avant);
    },
    DELAI_MS,
  );

  it.each(ACTIONS_SANS_ROUTE.flatMap((action) => ROLES.map((role) => [action, role] as const)))(
    "F-011-AC10 l'action %s est décidée pour le rôle %s selon la matrice",
    (action, role) => {
      const attendu = action === "lire-contenu" || role !== "lecteur";
      expect(permet(role, action)).toBe(attendu);
    },
  );
});

describe("ordre des contrôles et absence de cache (F-011-AC9)", () => {
  it(
    "F-011-AC9 un changement de rôle s'applique dès la requête suivante du membre concerné",
    async () => {
      const espace = await preparer();
      const chemin = cheminDe(CHEMINS_ESPACES.espace, espace);
      const renommer = () =>
        appeler(serveur, "PATCH", chemin, { cookie: espace.lecteur.cookie, corps: { nom: "R" } });
      const changerLeRoleDuLecteur = (role: string) =>
        appeler(
          serveur,
          "PATCH",
          cheminDe(CHEMINS_ESPACES.membre, { ...espace, idCompte: espace.lecteur.id }),
          { cookie: espace.proprietaire.cookie, corps: { role } },
        );

      await erreurDe(await renommer(), 403, "acces-refuse");
      expect((await changerLeRoleDuLecteur("proprietaire")).status).toBe(200);
      expect((await renommer()).status).toBe(200);
      expect((await changerLeRoleDuLecteur("lecteur")).status).toBe(200);
      await erreurDe(await renommer(), 403, "acces-refuse");
    },
    DELAI_MS,
  );

  it(
    "F-011-AC9 le rôle est contrôlé avant le corps : un éditeur au corps invalide reçoit 403",
    async () => {
      const espace = await preparer();

      const reponse = await appeler(serveur, "PATCH", cheminDe(CHEMINS_ESPACES.espace, espace), {
        cookie: espace.editeur.cookie,
        corps: { nom: 42 },
      });

      await erreurDe(reponse, 403, "acces-refuse");
    },
    DELAI_MS,
  );

  it(
    "F-011-AC9 le corps est contrôlé avant l'état des données : 400 plutôt que dernier-proprietaire",
    async () => {
      const espace = await preparer();

      const reponse = await appeler(
        serveur,
        "PATCH",
        cheminDe(CHEMINS_ESPACES.membre, { ...espace, idCompte: espace.proprietaire.id }),
        { cookie: espace.proprietaire.cookie, corps: { role: "editeur", raison: "x" } },
      );

      await erreurDe(reponse, 400, "requete-invalide");
    },
    DELAI_MS,
  );
});

const ROUTES_D_ESPACE = ROUTES_ESPACES.filter(({ chemin }) => chemin.includes(":idEspace"));

const CORPS_ESSAYES = [
  ["valide", { nom: "Valide", role: "editeur" }],
  ["invalide", { inconnu: true }],
  ["absent", undefined],
] as const;

describe("aucune fuite d'existence (F-011-AC12)", () => {
  it(
    "F-011-AC12 F-011-AC13 chaque route d'espace répond pareil au non-membre, à un identifiant inconnu, à un espace supprimé et à une valeur qui n'est pas un UUID",
    async () => {
      const espace = await preparer();
      const supprime = await preparerUnEspace(serveur, base);
      await appeler(serveur, "DELETE", cheminDe(CHEMINS_ESPACES.espace, supprime), {
        cookie: supprime.proprietaire.cookie,
      });
      const cibles = [espace.idEspace, nouvelIdentifiant(), supprime.idEspace, "pas-un-uuid"];
      const avant = await etatDesEspaces(base);

      const differences: string[] = [];
      for (const route of ROUTES_D_ESPACE) {
        for (const [nomDuCorps, corps] of CORPS_ESSAYES) {
          const reponses = await Promise.all(
            cibles.map(async (idEspace) => {
              const reponse = await appeler(
                serveur,
                route.methode,
                cheminDe(route.chemin, {
                  idEspace,
                  idCompte: espace.lecteur.id,
                  idInvitation: nouvelIdentifiant(),
                }),
                { cookie: espace.nonMembre.cookie, corps },
              );
              const { idRequete, ...reste } = schemaEnveloppeErreur.parse(await reponse.json());
              expect(idRequete).not.toBe("");
              return JSON.stringify({ statut: reponse.status, ...reste });
            }),
          );
          if (new Set(reponses).size !== 1 || !reponses[0]?.includes("ressource-introuvable")) {
            differences.push(`${cle(route)} (corps ${nomDuCorps}) : ${reponses.join(" / ")}`);
          }
        }
      }

      expect(differences).toEqual([]);
      expect(ROUTES_D_ESPACE).toHaveLength(9);
      expect(await etatDesEspaces(base)).toBe(avant);
    },
    DELAI_MS,
  );
});

describe("contrôle de l'origine (F-011-AC26)", () => {
  const ECRITURES = ROUTES_ESPACES.filter(({ methode }) => methode !== "GET");

  it.each(["test", "development", "production"])(
    "F-011-AC26 sous NODE_ENV=%s, toute écriture d'origine étrangère reçoit 403 origine-refusee sans rien modifier",
    async (nodeEnv) => {
      serveur = await lancerServeur(base, { env: { NODE_ENV: nodeEnv } });
      const nomDuCookie = nodeEnv === "production" ? NOM_DU_COOKIE_SECURISE : NOM_DU_COOKIE;
      const espace = await preparerUnEspace(serveur, base, nomDuCookie);
      const avant = await etatDesEspaces(base);

      for (const route of ECRITURES) {
        const reponse = await appeler(
          serveur,
          route.methode,
          cheminDe(route.chemin, { ...espace, idCompte: espace.lecteur.id }),
          {
            cookie: espace.proprietaire.cookie,
            corps: { idEspace: nouvelIdentifiant(), nom: "x", role: "editeur", jeton: "x" },
            enTetes: { Origin: ORIGINE_ETRANGERE },
          },
        );
        await erreurDe(reponse, 403, "origine-refusee");
      }

      expect(ECRITURES).toHaveLength(8);
      expect(await etatDesEspaces(base)).toBe(avant);
    },
    DELAI_MS,
  );

  it(
    "F-011-AC26 une écriture de l'URL publique, d'une origine autorisée ou sans Origin est admise",
    async () => {
      serveur = await lancerServeur(base, { env: { ORIGINES_AUTORISEES: ORIGINE_AUTORISEE } });
      const espace = await preparerUnEspace(serveur, base);
      const chemin = cheminDe(CHEMINS_ESPACES.espace, espace);
      const renommer = (enTetes: Record<string, string>) =>
        fetch(`${serveur.url}${chemin}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: espace.proprietaire.cookie,
            ...enTetes,
          },
          body: JSON.stringify({ nom: "Admis" }),
        });

      expect((await renommer({ Origin: ORIGINE_AUTORISEE })).status).toBe(200);
      expect((await renommer({})).status).toBe(200);
      await erreurDe(await renommer({ Origin: "null" }), 403, "origine-refusee");
    },
    DELAI_MS,
  );
});

describe("lecture de l'adhésion en échec (F-011-AC28)", () => {
  it(
    "F-011-AC28 une adhésion illisible donne 500 erreur-interne, et l'action n'a pas lieu",
    async () => {
      const defaillante = await ouvrirUneBase();
      serveur = await lancerServeur(defaillante);
      const espace = await preparerUnEspace(serveur, defaillante);
      await executer(defaillante, `alter table "adhesion" rename to "adhesion_cachee"`);

      const reponse = await appeler(serveur, "DELETE", cheminDe(CHEMINS_ESPACES.espace, espace), {
        cookie: espace.proprietaire.cookie,
      });

      await erreurDe(reponse, 500, "erreur-interne");
      const restants = await lignesSql(
        defaillante,
        `select "id" from "espace" where "id" = '${espace.idEspace}'`,
      );
      expect(restants).toEqual([{ id: espace.idEspace }]);
      expect(serveur.lignesDuJournal().some((ligne) => ligne.message === "erreur-interne")).toBe(
        true,
      );
    },
    DELAI_D_UN_CAS_QUI_OUVRE_SA_BASE_MS,
  );
});

describe("rattachement des routes d'espace (F-011-AC32)", () => {
  it(
    "F-011-AC32 chaque route d'espace enregistrée est rattachée à une action de la matrice",
    async () => {
      serveur = await lancerServeur(base);
      const enregistrees = routesEnregistrees(serveur.application).filter(({ chemin }) =>
        chemin.includes(":idEspace"),
      );

      const sansAction = enregistrees.filter((route) => {
        const actions = ACTIONS_DES_ROUTES_D_ESPACE.get(cle(route)) ?? [];
        return actions.length === 0 || !actions.every((action) => ACTIONS.includes(action));
      });

      expect(enregistrees.map(cle).sort()).toEqual(ROUTES_D_ESPACE.map(cle).sort());
      expect(sansAction).toEqual([]);
    },
    DELAI_MS,
  );
});
