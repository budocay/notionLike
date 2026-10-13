// Coutures de F-011 : comportement livré par F-008 et F-009 conservé (AC33), signaux des écritures
// d'adhésion (AC32), journal (AC29), listes partagées avec `packages/db`, et cas (b) de H14 et H16
// (AC34, AC35). Chaque corps lu passe par un schéma publié (AC31).
import { readdirSync, readFileSync } from "node:fs";
import { Writable } from "node:stream";

import {
  CHEMINS,
  CHEMINS_COMPTES,
  CHEMINS_ESPACES,
  CODES_ERREUR,
  ROLES,
  ROLES_INVITABLES,
  schemaCompte,
  schemaEspace,
  schemaInvitationCreee,
  type CodeErreur,
} from "@notionlike/contrats";
import {
  ROLES as ROLES_DE_LA_BASE,
  ROLES_INVITABLES as ROLES_INVITABLES_DE_LA_BASE,
  type Base,
} from "@notionlike/db";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { creerAdhesions, type ChangementDAdhesion } from "../src/adhesions.ts";
import { creerJournal } from "../src/journal.ts";
import {
  arreterLesServeurs,
  DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  lancerServeur,
  pretDe,
  santeDe,
  type LigneDeJournal,
  type ServeurDEssai,
} from "./aides.ts";
import {
  connecter,
  corpsUnique,
  DELAI_DES_COMPTES_MS,
  deconnecter,
  fermerLesBases,
  inscrire,
  lire,
  ouvrirUneBase,
} from "./aides-comptes.ts";
import { sourcesDuDepot } from "./aides-sources.ts";
import {
  appeler,
  cheminDe,
  corpsDe,
  creerUnCompte,
  erreurDe,
  nouvelIdentifiant,
  preparerUnEspace,
} from "./aides-espaces.ts";

const DELAI_MS = 30_000;
const LIMITE = 100_000;

// F-011-AC31 : les sept codes de F-011.
const CODES_DE_F011: readonly CodeErreur[] = [
  "acces-refuse",
  "origine-refusee",
  "identifiant-indisponible",
  "dernier-proprietaire",
  "deja-membre",
  "invitation-invalide",
  "quota-atteint",
];

let base: Base;
let serveur: ServeurDEssai;

beforeAll(async () => {
  base = await ouvrirUneBase();
}, DELAI_D_OUVERTURE_D_UNE_BASE_MS);
afterEach(arreterLesServeurs);
afterAll(fermerLesBases);

describe("couture de F-008 et de F-009 (F-011-AC33)", () => {
  it(
    "F-011-AC33 /sante et /pret répondent sans session",
    async () => {
      serveur = await lancerServeur(base);

      expect(await santeDe(await lire(serveur, CHEMINS.sante))).toEqual({ etat: "ok" });
      expect(await pretDe(await lire(serveur, CHEMINS.pret))).toEqual({ etat: "pret" });
    },
    DELAI_MS,
  );

  it(
    "F-011-AC33 les quatre routes d'authentification gardent leurs statuts, l'inscription reste ouverte, et /api/v1/moi son schéma strict",
    async () => {
      serveur = await lancerServeur(base);
      const corps = corpsUnique("couture");

      const ouverture = await inscrire(serveur, corps);
      const connexion = await connecter(serveur, corps);
      const session = await lire(serveur, CHEMINS_COMPTES.session, ouverture.cookie);
      const moi = await lire(serveur, CHEMINS_COMPTES.moi, ouverture.cookie);
      const sortie = await deconnecter(serveur, ouverture.cookie);

      expect(ouverture.compte.email).toBe(corps.email);
      expect([connexion.status, session.status, sortie.status]).toEqual([200, 200, 200]);
      expect(Object.keys(schemaCompte.parse(await moi.json())).sort()).toEqual([
        "courriel",
        "id",
        "nom",
      ]);
      await erreurDe(await lire(serveur, "/api/auth/ok"), 404, "ressource-introuvable");
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-011-AC33 un chemin inconnu sous /api/v1/ reçoit toujours le 404 de F-008-AC5",
    async () => {
      serveur = await lancerServeur(base);
      const compte = await creerUnCompte(base);

      for (const chemin of ["/api/v1/inconnu", "/api/v1/espaces/", "/api/v1/invitations"]) {
        await erreurDe(
          await appeler(serveur, "GET", chemin, { cookie: compte.cookie }),
          404,
          "ressource-introuvable",
        );
      }
    },
    DELAI_MS,
  );

  it(
    "F-011-AC33 les en-têtes de F-008-AC4 et F-008-AC9 sont posés sur les routes de F-011",
    async () => {
      serveur = await lancerServeur(base);
      const espace = await preparerUnEspace(serveur, base);
      const reponses = [
        await appeler(serveur, "GET", CHEMINS_ESPACES.espaces, { cookie: espace.lecteur.cookie }),
        await appeler(serveur, "GET", cheminDe(CHEMINS_ESPACES.espace, espace)),
        await appeler(serveur, "PATCH", cheminDe(CHEMINS_ESPACES.espace, espace), {
          cookie: espace.lecteur.cookie,
          corps: { nom: "x" },
        }),
      ];

      expect(reponses.map(({ status }) => status)).toEqual([200, 401, 403]);
      for (const reponse of reponses) {
        expect(reponse.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
        expect(reponse.headers.get("x-content-type-options")).toBe("nosniff");
        expect(reponse.headers.get("referrer-policy")).toBe("no-referrer");
        expect(reponse.headers.get("content-security-policy")?.split(";")).toContain(
          "default-src 'none'",
        );
        expect(reponse.headers.get("x-powered-by")).toBeNull();
      }
    },
    DELAI_MS,
  );

  it(
    "F-011-AC33 la limite de 100 kilo-octets de F-008-AC6 s'applique aux routes de F-011",
    async () => {
      serveur = await lancerServeur(base);
      const compte = await creerUnCompte(base);
      const grand = `{"nom":"${"x".repeat(LIMITE)}"}`;

      for (const chemin of [CHEMINS_ESPACES.espaces, CHEMINS_ESPACES.acceptation]) {
        const reponse = await appeler(serveur, "POST", chemin, {
          cookie: compte.cookie,
          brut: grand,
          enTetes: { "Content-Type": "application/json" },
        });
        await erreurDe(reponse, 413, "corps-trop-grand");
      }
    },
    DELAI_MS,
  );

  it("F-011-AC33 F-011-AC31 la liste fermée des codes n'est modifiée que par l'ajout des sept codes", () => {
    expect(CODES_ERREUR.slice(-CODES_DE_F011.length)).toEqual(CODES_DE_F011);
    expect(CODES_ERREUR).toHaveLength(14);
  });
});

describe("listes partagées avec packages/db (F-011-AC31)", () => {
  it("F-011-AC31 les rôles et les rôles invitables de la base sont ceux du contrat", () => {
    expect([...ROLES_DE_LA_BASE]).toEqual([...ROLES]);
    expect([...ROLES_INVITABLES_DE_LA_BASE]).toEqual([...ROLES_INVITABLES]);
  });
});

function journalMuet() {
  return creerJournal(
    new Writable({
      write(_morceau, _encodage, fin) {
        fin();
      },
    }),
  );
}

describe("signaux des écritures d'adhésion (F-011-AC32)", () => {
  it(
    "F-011-AC32 création, acceptation, changement de rôle, retrait et suppression sont signalés aux abonnés",
    async () => {
      const adhesions = creerAdhesions(base, journalMuet());
      const recus: ChangementDAdhesion[] = [];
      adhesions.abonner((changement) => {
        recus.push(changement);
      });
      adhesions.abonner(() => {
        throw new Error("abonné en échec");
      });
      serveur = await lancerServeur(base, { adhesions });
      const [proprietaire, invite] = [await creerUnCompte(base), await creerUnCompte(base)];
      const idEspace = nouvelIdentifiant();
      const cookie = proprietaire.cookie;

      await appeler(serveur, "POST", CHEMINS_ESPACES.espaces, {
        cookie,
        corps: { idEspace, nom: "Signaux" },
      });
      const { jeton } = await corpsDe(
        await appeler(serveur, "POST", cheminDe(CHEMINS_ESPACES.invitations, { idEspace }), {
          cookie,
          corps: { role: "lecteur" },
        }),
        201,
        schemaInvitationCreee,
      );
      await appeler(serveur, "POST", CHEMINS_ESPACES.acceptation, {
        cookie: invite.cookie,
        corps: { jeton },
      });
      const membre = cheminDe(CHEMINS_ESPACES.membre, { idEspace, idCompte: invite.id });
      await appeler(serveur, "PATCH", membre, { cookie, corps: { role: "proprietaire" } });
      await appeler(serveur, "DELETE", membre, { cookie });
      await appeler(serveur, "DELETE", cheminDe(CHEMINS_ESPACES.espace, { idEspace }), { cookie });

      expect(recus).toEqual([
        { type: "creee", idEspace, idCompte: proprietaire.id, role: "proprietaire" },
        { type: "creee", idEspace, idCompte: invite.id, role: "lecteur" },
        {
          type: "role-change",
          idEspace,
          idCompte: invite.id,
          role: "proprietaire",
          roleAvant: "lecteur",
        },
        { type: "supprimee", idEspace, idCompte: invite.id, role: "proprietaire" },
        { type: "supprimee", idEspace, idCompte: proprietaire.id, role: "proprietaire" },
      ]);
    },
    DELAI_MS,
  );

  it("F-011-AC32 seuls adhesions.ts écrit une adhésion et autorisation.ts la lit, dans apps/server/src", () => {
    const sources = [...sourcesDuDepot()].filter(([chemin]) =>
      chemin.startsWith("apps/server/src/"),
    );
    const qui = (motif: RegExp) =>
      sources.filter(([, texte]) => motif.test(texte)).map(([chemin]) => chemin);

    expect(
      qui(/\b(creerEspace|supprimerEspace|changerRole|retirerMembre|accepterInvitation)\b,/),
    ).toEqual(["apps/server/src/adhesions.ts"]);
    expect(qui(/\blireAdhesion\b/)).toEqual(["apps/server/src/autorisation.ts"]);
  });
});

describe("journal des espaces (F-011-AC29)", () => {
  it(
    "F-011-AC29 chaque événement porte type, requête, compte, espace et compte visé, sans jeton, empreinte, courriel ni nom",
    async () => {
      serveur = await lancerServeur(base);
      const espace = await preparerUnEspace(serveur, base);
      const cookie = espace.proprietaire.cookie;
      const membre = (idCompte: string) =>
        cheminDe(CHEMINS_ESPACES.membre, { ...espace, idCompte });
      const invitations = cheminDe(CHEMINS_ESPACES.invitations, espace);
      const ids: Record<string, string | null> = {};
      const noter = (type: string, reponse: Response) => {
        ids[type] = reponse.headers.get("x-request-id");
        return reponse;
      };
      const premiere = await corpsDe(
        noter(
          "invitation-creee",
          await appeler(serveur, "POST", invitations, { cookie, corps: { role: "editeur" } }),
        ),
        201,
        schemaInvitationCreee,
      );
      const seconde = await corpsDe(
        await appeler(serveur, "POST", invitations, { cookie, corps: { role: "lecteur" } }),
        201,
        schemaInvitationCreee,
      );
      noter(
        "invitation-acceptee",
        await appeler(serveur, "POST", CHEMINS_ESPACES.acceptation, {
          cookie: espace.nonMembre.cookie,
          corps: { jeton: premiere.jeton },
        }),
      );
      noter(
        "invitation-revoquee",
        await appeler(
          serveur,
          "DELETE",
          cheminDe(CHEMINS_ESPACES.invitation, { ...espace, idInvitation: seconde.idInvitation }),
          { cookie },
        ),
      );
      noter(
        "role-change",
        await appeler(serveur, "PATCH", membre(espace.lecteur.id), {
          cookie,
          corps: { role: "editeur" },
        }),
      );
      noter(
        "action-refusee",
        await appeler(serveur, "DELETE", membre(espace.lecteur.id), {
          cookie: espace.editeur.cookie,
        }),
      );
      noter(
        "membre-retire",
        await appeler(serveur, "DELETE", membre(espace.lecteur.id), { cookie }),
      );
      noter(
        "espace-supprime",
        await appeler(serveur, "DELETE", cheminDe(CHEMINS_ESPACES.espace, espace), { cookie }),
      );

      const lignes = serveur.lignesDuJournal().filter((ligne) => ligne.message === "espace");
      // La première ligne de chaque type : celle de la requête notée.
      const parType = new Map(lignes.toReversed().map((ligne) => [ligne.type, ligne]));
      const attendu = (type: string, idCompte: string, idCompteVise?: string): LigneDeJournal => ({
        type,
        idRequete: ids[type],
        idCompte,
        idEspace: espace.idEspace,
        ...(idCompteVise === undefined ? {} : { idCompteVise }),
      });
      const champs = (ligne: LigneDeJournal | undefined) => {
        const { type, idRequete, idCompte, idEspace, idCompteVise } = ligne ?? {};
        return { type, idRequete, idCompte, idEspace, ...(idCompteVise ? { idCompteVise } : {}) };
      };
      const p = espace.proprietaire.id;
      expect(champs(parType.get("espace-cree"))).toMatchObject({
        type: "espace-cree",
        idCompte: p,
      });
      for (const [type, idCompte, vise] of [
        ["invitation-creee", p],
        ["invitation-acceptee", espace.nonMembre.id],
        ["invitation-revoquee", p],
        ["role-change", p, espace.lecteur.id],
        ["action-refusee", espace.editeur.id, espace.lecteur.id],
        ["membre-retire", p, espace.lecteur.id],
        ["espace-supprime", p],
      ] as const) {
        expect(champs(parType.get(type))).toEqual(attendu(type, idCompte, vise));
      }
      const texte = serveur.texteDuJournal();
      const interdits = [
        premiere.jeton,
        seconde.jeton,
        "Équipe",
        ...[espace.proprietaire, espace.editeur, espace.lecteur, espace.nonMembre].flatMap(
          (compte) => [compte.courriel, compte.nom],
        ),
      ];
      expect(interdits.filter((interdit) => texte.includes(interdit))).toEqual([]);
      expect(texte).not.toMatch(/[0-9a-f]{64}/);
    },
    DELAI_MS,
  );
});

describe("cas (b) de H14 et de H16 (F-011-AC34, AC35)", () => {
  it("F-011-AC34 sans table de messages de F-010, aucun fichier d'apps/web ne porte les codes de F-011", () => {
    const web = [...sourcesDuDepot()].filter(([chemin]) => chemin.startsWith("apps/web/src/"));
    const tableDeF010 = web.some(([, texte]) => texte.includes("@notionlike/contrats"));
    const citent = web.filter(([, texte]) =>
      CODES_DE_F011.some((code) => texte.includes(`"${code}"`)),
    );

    expect(tableDeF010 ? [] : citent.map(([chemin]) => chemin)).toEqual([]);
  });

  it("F-011-AC35 sans la fonction de F-026, F-011 ne lit pas emailVerified et ne publie pas courriel-non-verifie", () => {
    const modules = ["adhesions.ts", "autorisation.ts", "espaces.ts"];
    const dossier = new URL("../src/", import.meta.url);
    const presents = readdirSync(dossier).filter((nom) => modules.includes(nom));

    expect(presents.sort()).toEqual(modules);
    for (const nom of presents) {
      expect(readFileSync(new URL(nom, dossier), "utf8")).not.toContain("emailVerified");
    }
    expect(CODES_ERREUR).not.toContain("courriel-non-verifie");
  });
});

describe("couture des appelants (creerApplication, creerCompteurs)", () => {
  it("F-011-AC33 creerApplication garde ses appelants, qui n'ont rien à fournir de plus", () => {
    const appelants = [...sourcesDuDepot()]
      .filter(([, texte]) => /\bcreerApplication\(\{/.test(texte))
      .map(([chemin]) => chemin);

    expect(appelants).toEqual(["apps/server/src/service.ts"]);
  });

  it(
    "F-011-AC33 un espace créé sans réglage d'horloge ni d'adhésions suit l'horloge du système",
    async () => {
      serveur = await lancerServeur(base);
      const espace = await preparerUnEspace(serveur, base);
      const avant = Date.now();

      const creee = await corpsDe(
        await appeler(serveur, "POST", cheminDe(CHEMINS_ESPACES.invitations, espace), {
          cookie: espace.proprietaire.cookie,
          corps: { role: "lecteur" },
        }),
        201,
        schemaInvitationCreee,
      );

      const ecart = Date.parse(creee.expireLe) - avant - 7 * 86_400_000;
      expect(ecart).toBeGreaterThanOrEqual(0);
      expect(ecart).toBeLessThan(10_000);
      expect(
        await corpsDe(
          await appeler(serveur, "GET", cheminDe(CHEMINS_ESPACES.espace, espace), {
            cookie: espace.proprietaire.cookie,
          }),
          200,
          schemaEspace,
        ),
      ).toMatchObject({ role: "proprietaire" });
    },
    DELAI_MS,
  );
});
