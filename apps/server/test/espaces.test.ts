// Espaces et membres par l'API REST (F-011-AC1 à AC7, AC13 à AC18, AC27). Chaque réponse est lue
// par le schéma publié de sa route (F-011-AC31).
import {
  CHEMINS_ESPACES,
  QUOTAS,
  schemaEspace,
  schemaListeEspaces,
  schemaListeMembres,
  schemaListeMembresVueParUnProprietaire,
  schemaMembreVuParUnProprietaire,
} from "@notionlike/contrats";
import { creerEspace, lireAdhesion, type Base } from "@notionlike/db";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  arreterLesServeurs,
  DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  lancerServeur,
  type ServeurDEssai,
} from "./aides.ts";
import { fermerLesBases, ouvrirUneBase, sessionsDe } from "./aides-comptes.ts";
import {
  ajouterUnMembre,
  appeler,
  cheminDe,
  corpsDe,
  creerUnCompte,
  erreurDe,
  etatDesEspaces,
  nouvelIdentifiant,
  preparerUnEspace,
  type EspaceDEssai,
} from "./aides-espaces.ts";

const DELAI_MS = 20_000;

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

function espaceDe(espace: EspaceDEssai, cookie: string) {
  return appeler(serveur, "GET", cheminDe(CHEMINS_ESPACES.espace, espace), { cookie });
}

describe("création d'un espace", () => {
  it(
    "F-011-AC1 un compte crée un espace sous l'identifiant qu'il fournit, et en devient propriétaire",
    async () => {
      serveur = await lancerServeur(base);
      const compte = await creerUnCompte(base);
      const idEspace = nouvelIdentifiant();

      const reponse = await appeler(serveur, "POST", CHEMINS_ESPACES.espaces, {
        cookie: compte.cookie,
        corps: { idEspace, nom: "Atelier" },
      });

      expect(await corpsDe(reponse, 201, schemaEspace)).toEqual({
        idEspace,
        nom: "Atelier",
        role: "proprietaire",
      });
      expect(await lireAdhesion(base.db, idEspace, compte.id)).toEqual({
        idEspace,
        nom: "Atelier",
        role: "proprietaire",
      });
    },
    DELAI_MS,
  );

  it(
    "F-011-AC2 le propriétaire qui rejoue la création reçoit 200 et l'état actuel, sans rien modifier",
    async () => {
      const espace = await preparer();
      const avant = await etatDesEspaces(base);

      const reponse = await appeler(serveur, "POST", CHEMINS_ESPACES.espaces, {
        cookie: espace.proprietaire.cookie,
        corps: { idEspace: espace.idEspace, nom: "Autre nom" },
      });

      expect(await corpsDe(reponse, 200, schemaEspace)).toEqual({
        idEspace: espace.idEspace,
        nom: "Équipe",
        role: "proprietaire",
      });
      expect(await etatDesEspaces(base)).toBe(avant);
    },
    DELAI_MS,
  );

  it.each(["editeur", "lecteur", "nonMembre"] as const)(
    "F-011-AC2 l'identifiant d'un espace dont le compte (%s) n'est pas propriétaire reçoit 409 identifiant-indisponible",
    async (qui) => {
      const espace = await preparer();
      const avant = await etatDesEspaces(base);

      const reponse = await appeler(serveur, "POST", CHEMINS_ESPACES.espaces, {
        cookie: espace[qui].cookie,
        corps: { idEspace: espace.idEspace, nom: "Prise" },
      });

      const enveloppe = await erreurDe(reponse, 409, "identifiant-indisponible");
      expect(Object.keys(enveloppe).sort()).toEqual(["code", "idRequete", "message"]);
      expect(JSON.stringify(enveloppe)).not.toContain("Équipe");
      expect(await etatDesEspaces(base)).toBe(avant);
    },
    DELAI_MS,
  );

  it(
    "F-011-AC7 un compte qui possède déjà 20 espaces reçoit 409 quota-atteint, sans rien créer",
    async () => {
      serveur = await lancerServeur(base);
      const compte = await creerUnCompte(base);
      for (let rang = 0; rang < QUOTAS.espacesPossedesParCompte; rang += 1) {
        await creerEspace(base.db, {
          idEspace: nouvelIdentifiant(),
          nom: `Espace ${String(rang)}`,
          idCompte: compte.id,
          plafondEspacesPossedes: QUOTAS.espacesPossedesParCompte,
        });
      }
      const idEspace = nouvelIdentifiant();

      const reponse = await appeler(serveur, "POST", CHEMINS_ESPACES.espaces, {
        cookie: compte.cookie,
        corps: { idEspace, nom: "Vingt et unième" },
      });

      await erreurDe(reponse, 409, "quota-atteint");
      expect(await lireAdhesion(base.db, idEspace, compte.id)).toBeUndefined();
    },
    DELAI_MS,
  );

  it.each([
    ["un champ role", { nom: "Équipe", role: "lecteur" }],
    ["un champ idCompte", { nom: "Équipe", idCompte: nouvelIdentifiant() }],
    ["un nom de blancs", { nom: "   " }],
    ["un nom de 101 caractères", { nom: "é".repeat(101) }],
    ["un identifiant en majuscules", { nom: "Équipe", majuscules: true }],
    ["sans nom", {}],
  ])(
    "F-011-AC27 une création qui porte %s reçoit 400 requete-invalide sans rien créer",
    async (_cas, gabarit) => {
      serveur = await lancerServeur(base);
      const compte = await creerUnCompte(base);
      const idEspace = nouvelIdentifiant();
      const { majuscules, ...reste } = gabarit as { majuscules?: boolean };
      const corps = { idEspace: majuscules === true ? idEspace.toUpperCase() : idEspace, ...reste };
      const avant = await etatDesEspaces(base);

      const reponse = await appeler(serveur, "POST", CHEMINS_ESPACES.espaces, {
        cookie: compte.cookie,
        corps,
      });

      await erreurDe(reponse, 400, "requete-invalide");
      expect(await etatDesEspaces(base)).toBe(avant);
    },
    DELAI_MS,
  );

  it.each([
    ["un JSON illisible", "{", "application/json"],
    ["un corps qui n'est pas JSON", "idEspace=1", "application/x-www-form-urlencoded"],
    ["un tableau", "[]", "application/json"],
  ])(
    "F-011-AC27 une création qui envoie %s reçoit 400 requete-invalide",
    async (_cas, brut, type) => {
      serveur = await lancerServeur(base);
      const compte = await creerUnCompte(base);

      const reponse = await appeler(serveur, "POST", CHEMINS_ESPACES.espaces, {
        cookie: compte.cookie,
        brut,
        enTetes: { "Content-Type": type },
      });

      await erreurDe(reponse, 400, "requete-invalide");
    },
    DELAI_MS,
  );
});

describe("lecture et liste des espaces", () => {
  it(
    "F-011-AC3 la liste ne porte que les espaces du membre, avec son rôle ; un compte sans adhésion reçoit une liste vide",
    async () => {
      const espace = await preparer();
      const autre = await preparerUnEspace(serveur, base);

      const duLecteur = await appeler(serveur, "GET", CHEMINS_ESPACES.espaces, {
        cookie: espace.lecteur.cookie,
      });
      const duNonMembre = await appeler(serveur, "GET", CHEMINS_ESPACES.espaces, {
        cookie: espace.nonMembre.cookie,
      });

      expect(await corpsDe(duLecteur, 200, schemaListeEspaces)).toEqual({
        espaces: [{ idEspace: espace.idEspace, nom: "Équipe", role: "lecteur" }],
      });
      expect(await corpsDe(duNonMembre, 200, schemaListeEspaces)).toEqual({ espaces: [] });
      expect(autre.idEspace).not.toBe(espace.idEspace);
    },
    DELAI_MS,
  );

  it.each(["proprietaire", "editeur", "lecteur"] as const)(
    "F-011-AC4 un %s lit l'espace avec son propre rôle",
    async (role) => {
      const espace = await preparer();

      const reponse = await espaceDe(espace, espace[role].cookie);

      expect(await corpsDe(reponse, 200, schemaEspace)).toEqual({
        idEspace: espace.idEspace,
        nom: "Équipe",
        role,
      });
    },
    DELAI_MS,
  );
});

describe("renommage et suppression", () => {
  it(
    "F-011-AC5 le propriétaire renomme l'espace et reçoit l'espace à jour",
    async () => {
      const espace = await preparer();

      const reponse = await appeler(serveur, "PATCH", cheminDe(CHEMINS_ESPACES.espace, espace), {
        cookie: espace.proprietaire.cookie,
        corps: { nom: "Nouveau nom" },
      });

      expect(await corpsDe(reponse, 200, schemaEspace)).toEqual({
        idEspace: espace.idEspace,
        nom: "Nouveau nom",
        role: "proprietaire",
      });
      const relu = await espaceDe(espace, espace.lecteur.cookie);
      expect((await corpsDe(relu, 200, schemaEspace)).nom).toBe("Nouveau nom");
    },
    DELAI_MS,
  );

  it(
    "F-011-AC27 un renommage hors schéma reçoit 400, sans rien modifier",
    async () => {
      const espace = await preparer();
      const avant = await etatDesEspaces(base);

      const reponse = await appeler(serveur, "PATCH", cheminDe(CHEMINS_ESPACES.espace, espace), {
        cookie: espace.proprietaire.cookie,
        corps: { nom: "Nouveau", role: "lecteur" },
      });

      await erreurDe(reponse, 400, "requete-invalide");
      expect(await etatDesEspaces(base)).toBe(avant);
    },
    DELAI_MS,
  );

  it(
    "F-011-AC6 la suppression répond 204, efface adhésions et invitations, et l'identifiant redevient disponible",
    async () => {
      const espace = await preparer();
      const chemin = cheminDe(CHEMINS_ESPACES.espace, espace);
      await appeler(serveur, "POST", cheminDe(CHEMINS_ESPACES.invitations, espace), {
        cookie: espace.proprietaire.cookie,
        corps: { role: "lecteur" },
      });

      const reponse = await appeler(serveur, "DELETE", chemin, {
        cookie: espace.proprietaire.cookie,
      });

      expect(reponse.status).toBe(204);
      expect(await reponse.text()).toBe("");
      expect(await etatDesEspaces(base)).not.toContain(espace.idEspace);
      for (const ancien of [espace.proprietaire, espace.editeur, espace.lecteur]) {
        await erreurDe(await espaceDe(espace, ancien.cookie), 404, "ressource-introuvable");
      }
      const rejouee = await appeler(serveur, "DELETE", chemin, {
        cookie: espace.proprietaire.cookie,
      });
      await erreurDe(rejouee, 404, "ressource-introuvable");
      const reprise = await appeler(serveur, "POST", CHEMINS_ESPACES.espaces, {
        cookie: espace.nonMembre.cookie,
        corps: { idEspace: espace.idEspace, nom: "Neuf" },
      });
      expect(await corpsDe(reprise, 201, schemaEspace)).toEqual({
        idEspace: espace.idEspace,
        nom: "Neuf",
        role: "proprietaire",
      });
    },
    DELAI_MS,
  );
});

describe("membres", () => {
  it(
    "F-011-AC14 un propriétaire voit le courriel des membres, un éditeur ou un lecteur ne le voit pas",
    async () => {
      const espace = await preparer();
      const chemin = cheminDe(CHEMINS_ESPACES.membres, espace);

      const vueDuProprietaire = await corpsDe(
        await appeler(serveur, "GET", chemin, { cookie: espace.proprietaire.cookie }),
        200,
        schemaListeMembresVueParUnProprietaire,
      );
      const vues = await Promise.all(
        [espace.editeur, espace.lecteur].map(async (compte) =>
          corpsDe(
            await appeler(serveur, "GET", chemin, { cookie: compte.cookie }),
            200,
            schemaListeMembres,
          ),
        ),
      );

      const attendus = [
        { compte: espace.proprietaire, role: "proprietaire" },
        { compte: espace.editeur, role: "editeur" },
        { compte: espace.lecteur, role: "lecteur" },
      ];
      expect(vueDuProprietaire.membres).toEqual(
        expect.arrayContaining(
          attendus.map(({ compte, role }) => ({
            idCompte: compte.id,
            nom: compte.nom,
            role,
            courriel: compte.courriel,
          })),
        ),
      );
      expect(vueDuProprietaire.membres).toHaveLength(3);
      for (const vue of vues) {
        expect(JSON.stringify(vue)).not.toContain("@");
        expect(vue.membres).toHaveLength(3);
      }
    },
    DELAI_MS,
  );

  it(
    "F-011-AC15 le propriétaire change le rôle d'un membre, et peut nommer un second propriétaire",
    async () => {
      const espace = await preparer();

      const reponse = await appeler(
        serveur,
        "PATCH",
        cheminDe(CHEMINS_ESPACES.membre, { ...espace, idCompte: espace.lecteur.id }),
        { cookie: espace.proprietaire.cookie, corps: { role: "proprietaire" } },
      );

      expect(await corpsDe(reponse, 200, schemaMembreVuParUnProprietaire)).toEqual({
        idCompte: espace.lecteur.id,
        nom: espace.lecteur.nom,
        role: "proprietaire",
        courriel: espace.lecteur.courriel,
      });
      const relu = await corpsDe(await espaceDe(espace, espace.lecteur.cookie), 200, schemaEspace);
      expect(relu.role).toBe("proprietaire");
    },
    DELAI_MS,
  );

  it(
    "F-011-AC27 un changement de rôle hors liste reçoit 400, sans rien modifier",
    async () => {
      const espace = await preparer();
      const avant = await etatDesEspaces(base);

      const reponse = await appeler(
        serveur,
        "PATCH",
        cheminDe(CHEMINS_ESPACES.membre, { ...espace, idCompte: espace.lecteur.id }),
        { cookie: espace.proprietaire.cookie, corps: { role: "administrateur" } },
      );

      await erreurDe(reponse, 400, "requete-invalide");
      expect(await etatDesEspaces(base)).toBe(avant);
    },
    DELAI_MS,
  );

  it(
    "F-011-AC16 le membre retiré est traité en non-membre dès la requête suivante, sessions et compte intacts",
    async () => {
      const espace = await preparer();
      const avant = await espaceDe(espace, espace.editeur.cookie);
      expect(avant.status).toBe(200);

      const reponse = await appeler(
        serveur,
        "DELETE",
        cheminDe(CHEMINS_ESPACES.membre, { ...espace, idCompte: espace.editeur.id }),
        { cookie: espace.proprietaire.cookie },
      );

      expect(reponse.status).toBe(204);
      await erreurDe(await espaceDe(espace, espace.editeur.cookie), 404, "ressource-introuvable");
      expect(await sessionsDe(base, espace.editeur.id)).toHaveLength(1);
      const moi = await appeler(serveur, "GET", "/api/v1/moi", { cookie: espace.editeur.cookie });
      expect(moi.status).toBe(200);
    },
    DELAI_MS,
  );

  it.each([
    ["changer le rôle du dernier propriétaire", "PATCH", { role: "editeur" }],
    ["retirer le dernier propriétaire", "DELETE", undefined],
  ])(
    "F-011-AC17 %s reçoit 409 dernier-proprietaire sans rien modifier",
    async (_cas, methode, corps) => {
      const espace = await preparer();
      const avant = await etatDesEspaces(base);

      const reponse = await appeler(
        serveur,
        methode,
        cheminDe(CHEMINS_ESPACES.membre, { ...espace, idCompte: espace.proprietaire.id }),
        { cookie: espace.proprietaire.cookie, corps },
      );

      await erreurDe(reponse, 409, "dernier-proprietaire");
      expect(await etatDesEspaces(base)).toBe(avant);
    },
    DELAI_MS,
  );

  it(
    "F-011-AC17 de deux propriétaires qui se rétrogradent l'un après l'autre, le second est refusé",
    async () => {
      const espace = await preparer();
      const second = await creerUnCompte(base, "second");
      await ajouterUnMembre(base, espace.idEspace, second.id, "proprietaire");
      const retrograder = (compte: typeof second) =>
        appeler(
          serveur,
          "PATCH",
          cheminDe(CHEMINS_ESPACES.membre, { ...espace, idCompte: compte.id }),
          { cookie: compte.cookie, corps: { role: "editeur" } },
        );

      const [premiere, seconde] = await Promise.all([
        retrograder(espace.proprietaire),
        retrograder(second),
      ]);

      const statuts = [premiere.status, seconde.status].sort();
      expect(statuts).toEqual([200, 409]);
      const proprietaires = await Promise.all(
        [espace.proprietaire, second].map((compte) =>
          lireAdhesion(base.db, espace.idEspace, compte.id),
        ),
      );
      expect(proprietaires.filter((lue) => lue?.role === "proprietaire")).toHaveLength(1);
    },
    DELAI_MS,
  );

  it.each(["editeur", "lecteur"] as const)(
    "F-011-AC18 un %s quitte l'espace en se retirant lui-même",
    async (role) => {
      const espace = await preparer();

      const reponse = await appeler(
        serveur,
        "DELETE",
        cheminDe(CHEMINS_ESPACES.membre, { ...espace, idCompte: espace[role].id }),
        { cookie: espace[role].cookie },
      );

      expect(reponse.status).toBe(204);
      expect(await lireAdhesion(base.db, espace.idEspace, espace[role].id)).toBeUndefined();
    },
    DELAI_MS,
  );

  it(
    "F-011-AC18 un propriétaire qui n'est pas le dernier quitte l'espace",
    async () => {
      const espace = await preparer();
      const second = await creerUnCompte(base, "second");
      await ajouterUnMembre(base, espace.idEspace, second.id, "proprietaire");

      const reponse = await appeler(
        serveur,
        "DELETE",
        cheminDe(CHEMINS_ESPACES.membre, { ...espace, idCompte: second.id }),
        { cookie: second.cookie },
      );

      expect(reponse.status).toBe(204);
    },
    DELAI_MS,
  );

  it.each(["editeur", "lecteur"] as const)(
    "F-011-AC18 F-011-AC11 un %s qui vise un autre compte reçoit 403 acces-refuse",
    async (role) => {
      const espace = await preparer();
      const avant = await etatDesEspaces(base);

      const reponse = await appeler(
        serveur,
        "DELETE",
        cheminDe(CHEMINS_ESPACES.membre, { ...espace, idCompte: espace.proprietaire.id }),
        { cookie: espace[role].cookie },
      );

      await erreurDe(reponse, 403, "acces-refuse");
      expect(await etatDesEspaces(base)).toBe(avant);
    },
    DELAI_MS,
  );

  it.each([
    ["un compte d'un autre espace", "autre"],
    ["un compte inconnu", "inconnu"],
    ["une valeur qui n'est pas un UUID", "pas-un-uuid"],
  ] as const)(
    "F-011-AC13 le propriétaire qui désigne %s reçoit 404, sans rien modifier",
    async (_cas, cible) => {
      const espace = await preparer();
      const autre = await preparerUnEspace(serveur, base);
      const idCompte =
        cible === "autre"
          ? autre.lecteur.id
          : cible === "inconnu"
            ? nouvelIdentifiant()
            : "pas-un-uuid";
      const avant = await etatDesEspaces(base);
      const chemin = cheminDe(CHEMINS_ESPACES.membre, { ...espace, idCompte });

      const changement = await appeler(serveur, "PATCH", chemin, {
        cookie: espace.proprietaire.cookie,
        corps: { role: "editeur" },
      });
      const retrait = await appeler(serveur, "DELETE", chemin, {
        cookie: espace.proprietaire.cookie,
      });

      const enveloppes = [
        await erreurDe(changement, 404, "ressource-introuvable"),
        await erreurDe(retrait, 404, "ressource-introuvable"),
      ];
      expect(enveloppes.map(({ code, message }) => ({ code, message }))).toEqual([
        { code: "ressource-introuvable", message: "La ressource demandée est introuvable." },
        { code: "ressource-introuvable", message: "La ressource demandée est introuvable." },
      ]);
      expect(await etatDesEspaces(base)).toBe(avant);
    },
    DELAI_MS,
  );
});
