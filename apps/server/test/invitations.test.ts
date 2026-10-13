// Invitations par l'API REST (F-011-AC13, AC19 à AC25). L'horloge du serveur est injectée pour les
// expirations et la fenêtre du plafond d'acceptation (H10).
import { createHash } from "node:crypto";

import {
  CHEMINS_ESPACES,
  FORME_DU_JETON,
  QUOTAS,
  schemaEspace,
  schemaInvitationCreee,
  schemaListeInvitations,
  type InvitationCreee,
  type RoleInvitable,
} from "@notionlike/contrats";
import { lireAdhesion, type Base } from "@notionlike/db";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { tirerUnJeton } from "../src/espaces.ts";
import {
  arreterLesServeurs,
  DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  lancerServeur,
  type ServeurDEssai,
} from "./aides.ts";
import {
  executer,
  fermerLesBases,
  JOUR_MS,
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

const DELAI_MS = 30_000;
const DELAI_DES_MILLE_MS = 120_000;
const MILLE = 1000;
const SEPT_JOURS_MS = 7 * JOUR_MS;
const DEBUT = new Date("2026-10-13T08:00:00.000Z");

let base: Base;
let serveur: ServeurDEssai;
let maintenant = DEBUT;

beforeAll(async () => {
  base = await ouvrirUneBase();
}, DELAI_D_OUVERTURE_D_UNE_BASE_MS);
afterEach(arreterLesServeurs);
afterAll(fermerLesBases);

function avancer(dureeMs: number): void {
  maintenant = new Date(maintenant.getTime() + dureeMs);
}

async function preparer(): Promise<EspaceDEssai> {
  maintenant = DEBUT;
  serveur = await lancerServeur(base, { horloge: () => maintenant });
  return preparerUnEspace(serveur, base);
}

async function inviter(espace: EspaceDEssai, role: RoleInvitable = "editeur") {
  const reponse = await appeler(serveur, "POST", cheminDe(CHEMINS_ESPACES.invitations, espace), {
    cookie: espace.proprietaire.cookie,
    corps: { role },
  });
  return corpsDe(reponse, 201, schemaInvitationCreee);
}

function accepter(compte: CompteDEssai, corps: unknown, cookie = compte.cookie) {
  return appeler(serveur, "POST", CHEMINS_ESPACES.acceptation, { cookie, corps });
}

async function enAttente(espace: EspaceDEssai) {
  const reponse = await appeler(serveur, "GET", cheminDe(CHEMINS_ESPACES.invitations, espace), {
    cookie: espace.proprietaire.cookie,
  });
  return (await corpsDe(reponse, 200, schemaListeInvitations)).invitations;
}

function revoquer(espace: EspaceDEssai, idInvitation: string) {
  return appeler(
    serveur,
    "DELETE",
    cheminDe(CHEMINS_ESPACES.invitation, { ...espace, idInvitation }),
    { cookie: espace.proprietaire.cookie },
  );
}

const empreinteDe = (jeton: string) => createHash("sha256").update(jeton, "utf8").digest("hex");

describe("création d'une invitation (F-011-AC19)", () => {
  it(
    "F-011-AC19 le propriétaire reçoit 201 avec l'identifiant, le rôle, l'expiration à 7 jours et le jeton ; seule l'empreinte est en base",
    async () => {
      const espace = await preparer();

      const creee = await inviter(espace, "lecteur");

      expect(creee.role).toBe("lecteur");
      expect(creee.expireLe).toBe(new Date(DEBUT.getTime() + SEPT_JOURS_MS).toISOString());
      expect(creee.jeton).toMatch(FORME_DU_JETON);
      const lignes = await lignesSql(
        base,
        `select "empreinte" from "invitation" where "id" = '${creee.idInvitation}'`,
      );
      expect(lignes).toEqual([{ empreinte: empreinteDe(creee.jeton) }]);
      expect(await etatDesEspaces(base)).not.toContain(creee.jeton);
    },
    DELAI_MS,
  );

  it(
    "F-011-AC19 1 000 invitations créées par la route ont chacune un jeton de la forme exacte, sans répétition",
    async () => {
      const espace = await preparer();
      const jetons: string[] = [];

      for (let rang = 0; rang < MILLE; rang += 1) {
        // Le plafond d'invitations en attente (AC24) : les précédentes sont révoquées en base.
        if (rang % QUOTAS.invitationsEnAttenteParEspace === 0) {
          await executer(
            base,
            `update "invitation" set "revoqueeLe" = '${DEBUT.toISOString()}' where "accepteeLe" is null and "revoqueeLe" is null`,
          );
        }
        jetons.push((await inviter(espace)).jeton);
      }

      expect(jetons.filter((jeton) => !/^[A-Za-z0-9_-]{43}$/.test(jeton))).toEqual([]);
      expect(new Set(jetons).size).toBe(MILLE);
      const empreintes = await lignesSql(
        base,
        `select "empreinte" from "invitation" where "idEspace" = '${espace.idEspace}'`,
      );
      expect(new Set(empreintes.map(({ empreinte }) => empreinte))).toEqual(
        new Set(jetons.map(empreinteDe)),
      );
    },
    DELAI_DES_MILLE_MS,
  );

  it("F-011-AC19 le jeton est fait de 32 octets écrits en base64url sans remplissage", () => {
    const jeton = tirerUnJeton();

    expect(Buffer.from(jeton, "base64url")).toHaveLength(32);
    expect(Buffer.from(jeton, "base64url").toString("base64url")).toBe(jeton);
    expect(jeton).not.toContain("=");
  });

  it.each([["proprietaire"], ["administrateur"], [7]])(
    "F-011-AC19 F-011-AC27 le rôle %s reçoit 400 requete-invalide, sans invitation créée",
    async (role) => {
      const espace = await preparer();

      const reponse = await appeler(
        serveur,
        "POST",
        cheminDe(CHEMINS_ESPACES.invitations, espace),
        { cookie: espace.proprietaire.cookie, corps: { role } },
      );

      await erreurDe(reponse, 400, "requete-invalide");
      expect(await enAttente(espace)).toEqual([]);
    },
    DELAI_MS,
  );
});

describe("liste et révocation (F-011-AC20, AC13)", () => {
  it(
    "F-011-AC20 la liste porte les invitations en attente, sans jeton ni empreinte, et la révocation répond 204",
    async () => {
      const espace = await preparer();
      const premiere = await inviter(espace, "editeur");
      avancer(1000);
      const seconde = await inviter(espace, "lecteur");

      expect(await enAttente(espace)).toEqual([
        {
          idInvitation: premiere.idInvitation,
          role: "editeur",
          creeLe: DEBUT.toISOString(),
          expireLe: premiere.expireLe,
        },
        {
          idInvitation: seconde.idInvitation,
          role: "lecteur",
          creeLe: new Date(DEBUT.getTime() + 1000).toISOString(),
          expireLe: seconde.expireLe,
        },
      ]);
      expect((await revoquer(espace, premiere.idInvitation)).status).toBe(204);
      expect((await enAttente(espace)).map(({ idInvitation }) => idInvitation)).toEqual([
        seconde.idInvitation,
      ]);
      await erreurDe(
        await accepter(espace.nonMembre, { jeton: premiere.jeton }),
        404,
        "invitation-invalide",
      );
    },
    DELAI_MS,
  );

  it.each(["révoquée", "acceptée", "expirée", "inconnue", "d'un autre espace"] as const)(
    "F-011-AC20 F-011-AC13 révoquer une invitation %s reçoit 404 ressource-introuvable sans rien modifier",
    async (etat) => {
      const espace = await preparer();
      const autre = await preparerUnEspace(serveur, base);
      const visee = await inviter(etat === "d'un autre espace" ? autre : espace);
      if (etat === "révoquée") {
        await revoquer(espace, visee.idInvitation);
      } else if (etat === "acceptée") {
        expect((await accepter(espace.nonMembre, { jeton: visee.jeton })).status).toBe(200);
      } else if (etat === "expirée") {
        avancer(SEPT_JOURS_MS);
      }
      const idInvitation = etat === "inconnue" ? nouvelIdentifiant() : visee.idInvitation;
      const avant = await etatDesEspaces(base);

      await erreurDe(await revoquer(espace, idInvitation), 404, "ressource-introuvable");
      expect(await etatDesEspaces(base)).toBe(avant);
    },
    DELAI_MS,
  );
});

describe("acceptation (F-011-AC21 à AC24)", () => {
  it(
    "F-011-AC21 le compte qui présente le jeton devient membre avec le rôle de l'invitation",
    async () => {
      const espace = await preparer();
      const { jeton } = await inviter(espace, "lecteur");

      const reponse = await accepter(espace.nonMembre, { jeton });

      expect(await corpsDe(reponse, 200, schemaEspace)).toEqual({
        idEspace: espace.idEspace,
        nom: "Équipe",
        role: "lecteur",
      });
      expect((await lireAdhesion(base.db, espace.idEspace, espace.nonMembre.id))?.role).toBe(
        "lecteur",
      );
      expect(await enAttente(espace)).toEqual([]);
    },
    DELAI_MS,
  );

  it(
    "F-011-AC22 un jeton inconnu, mal formé, accepté, révoqué ou expiré reçoit la même réponse 404 invitation-invalide",
    async () => {
      const espace = await preparer();
      const acceptee = await inviter(espace);
      await accepter(espace.nonMembre, { jeton: acceptee.jeton });
      const revoquee = await inviter(espace);
      await revoquer(espace, revoquee.idInvitation);
      const expiree = await inviter(espace);
      avancer(SEPT_JOURS_MS);
      const candidat = await creerUnCompte(base, "candidat");
      const avant = await etatDesEspaces(base);
      const jetons = [
        tirerUnJeton(),
        acceptee.jeton,
        revoquee.jeton,
        expiree.jeton,
        "",
        "court",
        `${tirerUnJeton()}A`,
        `${tirerUnJeton().slice(1)}=`,
        `${tirerUnJeton().slice(1)}+`,
        `${tirerUnJeton().slice(1)}é`,
      ];

      const reponses = [];
      for (const jeton of jetons) {
        const enveloppe = await erreurDe(
          await accepter(candidat, { jeton }),
          404,
          "invitation-invalide",
        );
        reponses.push(`${enveloppe.code} ${enveloppe.message}`);
      }

      expect(new Set(reponses).size).toBe(1);
      expect(await etatDesEspaces(base)).toBe(avant);
      expect(await lireAdhesion(base.db, espace.idEspace, candidat.id)).toBeUndefined();
    },
    DELAI_MS,
  );

  it(
    "F-011-AC22 un jeton mal formé est refusé sans lecture en base",
    async () => {
      const espace = await preparer();
      await executer(base, `alter table "invitation" rename to "invitation_cachee"`);
      try {
        await erreurDe(
          await accepter(espace.nonMembre, { jeton: "mal formé" }),
          404,
          "invitation-invalide",
        );
        await erreurDe(
          await accepter(espace.nonMembre, { jeton: tirerUnJeton() }),
          500,
          "erreur-interne",
        );
      } finally {
        await executer(base, `alter table "invitation_cachee" rename to "invitation"`);
      }
    },
    DELAI_MS,
  );

  it.each([
    ["sans champ jeton", {}],
    ["avec un jeton qui n'est pas une chaîne", { jeton: 43 }],
    ["avec un champ inconnu", { jeton: "x", role: "proprietaire" }],
    ["qui n'est pas un objet", ["jeton"]],
  ])(
    "F-011-AC22 F-011-AC27 un corps %s reçoit 400 requete-invalide",
    async (_cas, corps) => {
      const espace = await preparer();

      await erreurDe(await accepter(espace.nonMembre, corps), 400, "requete-invalide");
    },
    DELAI_MS,
  );

  it(
    "F-011-AC22 une invitation ne sert qu'une fois, y compris pour deux acceptations envoyées ensemble",
    async () => {
      const espace = await preparer();
      const { jeton } = await inviter(espace);
      const second = await creerUnCompte(base, "second");

      const reponses = await Promise.all([
        accepter(espace.nonMembre, { jeton }),
        accepter(second, { jeton }),
      ]);

      expect(reponses.map(({ status }) => status).sort()).toEqual([200, 404]);
      const adhesions = await Promise.all(
        [espace.nonMembre, second].map((compte) =>
          lireAdhesion(base.db, espace.idEspace, compte.id),
        ),
      );
      expect(adhesions.filter((lue) => lue !== undefined)).toHaveLength(1);
      await erreurDe(await accepter(espace.nonMembre, { jeton }), 404, "invitation-invalide");
    },
    DELAI_MS,
  );

  it.each(["proprietaire", "editeur", "lecteur"] as const)(
    "F-011-AC23 un %s déjà membre reçoit 409 deja-membre, son rôle et l'invitation restent inchangés",
    async (role) => {
      const espace = await preparer();
      const { jeton, idInvitation } = await inviter(
        espace,
        role === "lecteur" ? "editeur" : "lecteur",
      );

      await erreurDe(await accepter(espace[role], { jeton }), 409, "deja-membre");

      expect((await lireAdhesion(base.db, espace.idEspace, espace[role].id))?.role).toBe(role);
      expect((await enAttente(espace)).map((lue) => lue.idInvitation)).toEqual([idInvitation]);
    },
    DELAI_MS,
  );

  it(
    "F-011-AC24 un espace de 50 membres refuse l'acceptation par 409 quota-atteint sans consommer le jeton",
    async () => {
      const espace = await preparer();
      const { jeton, idInvitation } = await inviter(espace);
      for (let rang = 3; rang < QUOTAS.membresParEspace; rang += 1) {
        const membre = await creerUnCompte(base, "remplissage");
        await ajouterUnMembre(base, espace.idEspace, membre.id, "lecteur");
      }

      await erreurDe(await accepter(espace.nonMembre, { jeton }), 409, "quota-atteint");

      expect(await lireAdhesion(base.db, espace.idEspace, espace.nonMembre.id)).toBeUndefined();
      expect((await enAttente(espace)).map((lue) => lue.idInvitation)).toEqual([idInvitation]);
    },
    DELAI_MS,
  );

  it(
    "F-011-AC24 un espace de 20 invitations en attente refuse la suivante par 409 quota-atteint",
    async () => {
      const espace = await preparer();
      const creees: InvitationCreee[] = [];
      for (let rang = 0; rang < QUOTAS.invitationsEnAttenteParEspace; rang += 1) {
        creees.push(await inviter(espace));
      }

      const reponse = await appeler(
        serveur,
        "POST",
        cheminDe(CHEMINS_ESPACES.invitations, espace),
        { cookie: espace.proprietaire.cookie, corps: { role: "lecteur" } },
      );

      await erreurDe(reponse, 409, "quota-atteint");
      expect(await enAttente(espace)).toHaveLength(creees.length);
    },
    DELAI_MS,
  );
});

describe("plafond d'acceptation (F-011-AC25)", () => {
  it.each(["test", "development", "production"])(
    "F-011-AC25 sous NODE_ENV=%s, la 11e acceptation en 60 secondes reçoit 429 avec Retry-After, sans chercher le jeton",
    async (nodeEnv) => {
      const nomDuCookie = nodeEnv === "production" ? NOM_DU_COOKIE_SECURISE : NOM_DU_COOKIE;
      maintenant = DEBUT;
      serveur = await lancerServeur(base, {
        horloge: () => maintenant,
        env: { NODE_ENV: nodeEnv },
      });
      const espace = await preparerUnEspace(serveur, base, nomDuCookie);
      const { jeton } = await inviter(espace);
      const candidat = await creerUnCompte(base, "candidat", nomDuCookie);
      const cookie = candidat.cookie;

      for (let rang = 0; rang < 10; rang += 1) {
        const reponse = await accepter(candidat, { jeton: rang % 2 === 0 ? "mal" : {} }, cookie);
        expect(reponse.status).not.toBe(429);
      }
      avancer(15_000);
      const refusee = await accepter(candidat, { jeton }, cookie);

      await erreurDe(refusee, 429, "trop-de-requetes");
      expect(refusee.headers.get("Retry-After")).toBe("45");
      expect(await lireAdhesion(base.db, espace.idEspace, candidat.id)).toBeUndefined();
      expect(await enAttente(espace)).toHaveLength(1);

      avancer(45_000);
      expect((await accepter(candidat, { jeton }, cookie)).status).toBe(200);
    },
    DELAI_MS,
  );

  it(
    "F-011-AC25 le plafond est tenu par compte : un autre compte n'en est pas affecté",
    async () => {
      const espace = await preparer();
      const { jeton } = await inviter(espace);
      const bavard = await creerUnCompte(base, "bavard");
      for (let rang = 0; rang < 11; rang += 1) {
        await accepter(bavard, { jeton: "mal" });
      }

      await erreurDe(await accepter(bavard, { jeton: "mal" }), 429, "trop-de-requetes");
      expect((await accepter(espace.nonMembre, { jeton })).status).toBe(200);
    },
    DELAI_MS,
  );
});
