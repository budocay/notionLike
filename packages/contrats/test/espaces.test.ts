import { describe, expect, it } from "vitest";

import {
  ACTIONS,
  CHEMINS_ESPACES,
  FORME_DU_JETON,
  LONGUEUR_DU_JETON,
  MATRICE_DES_DROITS,
  QUOTAS,
  ROLES,
  ROLES_INVITABLES,
  ROUTES_ESPACES,
  ROUTES_PUBLIQUES,
  schemaCorpsAcceptation,
  schemaCorpsChangementDeRole,
  schemaCorpsCreationEspace,
  schemaCorpsCreationInvitation,
  schemaCorpsRenommage,
  schemaEspace,
  schemaInvitation,
  schemaInvitationCreee,
  schemaJetonInvitation,
  schemaListeMembres,
  schemaListeMembresVueParUnProprietaire,
} from "../src/index.ts";

const ID = "0b3f9f1e-6c1a-4f43-9a52-7d1c2b8e4a10";
const JETON = "Ab0_-cdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN";

function accepte(schema: { safeParse(valeur: unknown): { success: boolean } }, valeur: unknown) {
  return schema.safeParse(valeur).success;
}

describe("routes et listes publiées", () => {
  it("F-011-AC31 les douze routes de F-011 sont publiées, toutes sous /api/v1/, sans doublon", () => {
    const couples = ROUTES_ESPACES.map(({ methode, chemin }) => `${methode} ${chemin}`);

    expect(couples).toHaveLength(12);
    expect(new Set(couples).size).toBe(12);
    expect(ROUTES_ESPACES.every(({ chemin }) => chemin.startsWith("/api/v1/"))).toBe(true);
    expect(Object.values(CHEMINS_ESPACES)).toHaveLength(7);
  });

  it("F-011-AC8 F-011-AC31 la liste des routes publiques est publiée vide par F-011", () => {
    expect(ROUTES_PUBLIQUES).toEqual([]);
  });

  it("F-011-AC31 les rôles et les rôles invitables sont des listes fermées", () => {
    expect(ROLES).toEqual(["proprietaire", "editeur", "lecteur"]);
    expect(ROLES_INVITABLES).toEqual(["editeur", "lecteur"]);
  });

  it("F-011-AC7 F-011-AC24 F-011-AC31 les quotas de H8 sont publiés", () => {
    expect(QUOTAS).toEqual({
      espacesPossedesParCompte: 20,
      membresParEspace: 50,
      invitationsEnAttenteParEspace: 20,
    });
  });
});

describe("matrice des droits", () => {
  it("F-011-AC10 F-011-AC31 chaque action a ses rôles, et ceux-là seuls", () => {
    expect(MATRICE_DES_DROITS).toEqual({
      "lire-espace": ["proprietaire", "editeur", "lecteur"],
      "lister-membres": ["proprietaire", "editeur", "lecteur"],
      "lire-contenu": ["proprietaire", "editeur", "lecteur"],
      "quitter-espace": ["proprietaire", "editeur", "lecteur"],
      "ecrire-contenu": ["proprietaire", "editeur"],
      "renommer-espace": ["proprietaire"],
      "supprimer-espace": ["proprietaire"],
      inviter: ["proprietaire"],
      "retirer-membre": ["proprietaire"],
      "changer-role": ["proprietaire"],
    });
    expect(Object.keys(MATRICE_DES_DROITS).sort()).toEqual([...ACTIONS].sort());
  });
});

describe("forme du jeton d'invitation", () => {
  it("F-011-AC19 F-011-AC31 la forme publiée est de 43 caractères de l'alphabet base64url", () => {
    expect(LONGUEUR_DU_JETON).toBe(43);
    expect(FORME_DU_JETON.test(JETON)).toBe(true);
    expect(accepte(schemaJetonInvitation, JETON)).toBe(true);
  });

  it.each([
    ["trop court", JETON.slice(1)],
    ["trop long", `${JETON}a`],
    ["avec remplissage", `${JETON.slice(1)}=`],
    ["en base64 standard", `${JETON.slice(1)}+`],
    ["avec une barre", `${JETON.slice(1)}/`],
    ["accentué", `${JETON.slice(1)}é`],
    ["avec un blanc", `${JETON.slice(1)} `],
  ])("F-011-AC22 F-011-AC31 un jeton %s est refusé par la forme publiée", (_cas, jeton) => {
    expect(accepte(schemaJetonInvitation, jeton)).toBe(false);
  });
});

describe("schémas des corps de requête", () => {
  it("F-011-AC1 un identifiant canonique et un nom de 1 à 100 caractères sont acceptés", () => {
    expect(accepte(schemaCorpsCreationEspace, { idEspace: ID, nom: "Équipe" })).toBe(true);
    expect(accepte(schemaCorpsCreationEspace, { idEspace: ID, nom: "é".repeat(100) })).toBe(true);
    expect(accepte(schemaCorpsCreationEspace, { idEspace: ID, nom: "😀".repeat(100) })).toBe(true);
  });

  it.each([
    ["un identifiant en majuscules", { idEspace: ID.toUpperCase(), nom: "Équipe" }],
    ["un identifiant qui n'est pas un UUID", { idEspace: "espace-1", nom: "Équipe" }],
    ["un nom vide", { idEspace: ID, nom: "" }],
    ["un nom de blancs", { idEspace: ID, nom: " \t\n " }],
    ["un nom de 101 caractères", { idEspace: ID, nom: "é".repeat(101) }],
    ["un nom qui n'est pas une chaîne", { idEspace: ID, nom: 7 }],
    ["un champ role", { idEspace: ID, nom: "Équipe", role: "lecteur" }],
    ["un champ idCompte", { idEspace: ID, nom: "Équipe", idCompte: ID }],
    ["un corps absent", undefined],
    ["un tableau", [ID, "Équipe"]],
  ])("F-011-AC27 la création d'espace refuse %s", (_cas, corps) => {
    expect(accepte(schemaCorpsCreationEspace, corps)).toBe(false);
  });

  it("F-011-AC5 F-011-AC27 le renommage n'accepte que le nom", () => {
    expect(accepte(schemaCorpsRenommage, { nom: "Nouveau" })).toBe(true);
    expect(accepte(schemaCorpsRenommage, { nom: "Nouveau", idEspace: ID })).toBe(false);
    expect(accepte(schemaCorpsRenommage, { nom: "  " })).toBe(false);
  });

  it.each(ROLES)("F-011-AC15 le changement de rôle accepte %s", (role) => {
    expect(accepte(schemaCorpsChangementDeRole, { role })).toBe(true);
  });

  it("F-011-AC27 le changement de rôle refuse un rôle hors liste ou un champ en trop", () => {
    expect(accepte(schemaCorpsChangementDeRole, { role: "administrateur" })).toBe(false);
    expect(accepte(schemaCorpsChangementDeRole, { role: "lecteur", idCompte: ID })).toBe(false);
  });

  it("F-011-AC19 l'invitation accepte editeur et lecteur, et refuse proprietaire", () => {
    expect(accepte(schemaCorpsCreationInvitation, { role: "editeur" })).toBe(true);
    expect(accepte(schemaCorpsCreationInvitation, { role: "lecteur" })).toBe(true);
    expect(accepte(schemaCorpsCreationInvitation, { role: "proprietaire" })).toBe(false);
    expect(accepte(schemaCorpsCreationInvitation, { role: "invite" })).toBe(false);
  });

  it("F-011-AC22 F-011-AC27 l'acceptation exige un champ jeton de type chaîne, et lui seul", () => {
    expect(accepte(schemaCorpsAcceptation, { jeton: "mal formé" })).toBe(true);
    expect(accepte(schemaCorpsAcceptation, {})).toBe(false);
    expect(accepte(schemaCorpsAcceptation, { jeton: 43 })).toBe(false);
    expect(accepte(schemaCorpsAcceptation, { jeton: JETON, role: "editeur" })).toBe(false);
  });
});

describe("schémas des réponses", () => {
  it("F-011-AC14 la liste vue par un non-propriétaire refuse le courriel", () => {
    const membre = { idCompte: ID, nom: "Ada", role: "editeur" };
    const avecCourriel = { ...membre, courriel: "ada@exemple.test" };

    expect(accepte(schemaListeMembres, { membres: [membre] })).toBe(true);
    expect(accepte(schemaListeMembres, { membres: [avecCourriel] })).toBe(false);
    expect(accepte(schemaListeMembresVueParUnProprietaire, { membres: [avecCourriel] })).toBe(true);
    expect(
      accepte(schemaListeMembresVueParUnProprietaire, {
        membres: [{ ...avecCourriel, emailVerified: true }],
      }),
    ).toBe(false);
  });

  it("F-011-AC20 une invitation listée ne porte ni jeton ni empreinte", () => {
    const invitation = {
      idInvitation: ID,
      role: "lecteur",
      creeLe: "2026-10-13T08:00:00.000Z",
      expireLe: "2026-10-20T08:00:00.000Z",
    };

    expect(accepte(schemaInvitation, invitation)).toBe(true);
    expect(accepte(schemaInvitation, { ...invitation, jeton: JETON })).toBe(false);
    expect(accepte(schemaInvitation, { ...invitation, empreinte: "0".repeat(64) })).toBe(false);
  });

  it("F-011-AC19 l'invitation créée porte son jeton, de la forme publiée", () => {
    const creee = {
      idInvitation: ID,
      role: "editeur",
      expireLe: "2026-10-20T08:00:00.000Z",
      jeton: JETON,
    };

    expect(accepte(schemaInvitationCreee, creee)).toBe(true);
    expect(accepte(schemaInvitationCreee, { ...creee, jeton: `${JETON}=` })).toBe(false);
  });

  it("F-011-AC4 un espace est rendu avec son identifiant, son nom et le rôle du demandeur", () => {
    expect(accepte(schemaEspace, { idEspace: ID, nom: "Équipe", role: "lecteur" })).toBe(true);
    expect(accepte(schemaEspace, { idEspace: ID, nom: "Équipe" })).toBe(false);
    expect(accepte(schemaEspace, { idEspace: ID, nom: "Équipe", role: "lecteur", n: 1 })).toBe(
      false,
    );
  });
});
