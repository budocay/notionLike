// Contrats des espaces, des membres, des invitations et des droits (F-011-AC31). Les chemins sont
// ceux du routeur du serveur : un segment `:nom` y est un paramètre. Tout corps de requête et de
// réponse a son schéma strict : un champ que le schéma ne nomme pas est refusé.
import { z } from "zod";

export const CHEMINS_ESPACES = {
  espaces: "/api/v1/espaces",
  espace: "/api/v1/espaces/:idEspace",
  membres: "/api/v1/espaces/:idEspace/membres",
  membre: "/api/v1/espaces/:idEspace/membres/:idCompte",
  invitations: "/api/v1/espaces/:idEspace/invitations",
  invitation: "/api/v1/espaces/:idEspace/invitations/:idInvitation",
  acceptation: "/api/v1/invitations/acceptation",
} as const;

export type Methode = "GET" | "POST" | "PATCH" | "DELETE";

export interface RouteApi {
  readonly methode: Methode;
  readonly chemin: string;
}

// Les douze routes de F-011, toutes protégées.
export const ROUTES_ESPACES: readonly RouteApi[] = [
  { methode: "POST", chemin: CHEMINS_ESPACES.espaces },
  { methode: "GET", chemin: CHEMINS_ESPACES.espaces },
  { methode: "GET", chemin: CHEMINS_ESPACES.espace },
  { methode: "PATCH", chemin: CHEMINS_ESPACES.espace },
  { methode: "DELETE", chemin: CHEMINS_ESPACES.espace },
  { methode: "GET", chemin: CHEMINS_ESPACES.membres },
  { methode: "PATCH", chemin: CHEMINS_ESPACES.membre },
  { methode: "DELETE", chemin: CHEMINS_ESPACES.membre },
  { methode: "POST", chemin: CHEMINS_ESPACES.invitations },
  { methode: "GET", chemin: CHEMINS_ESPACES.invitations },
  { methode: "DELETE", chemin: CHEMINS_ESPACES.invitation },
  { methode: "POST", chemin: CHEMINS_ESPACES.acceptation },
];

// F-011-AC8, H15 : la liste fermée des routes sous `/api/v1/` qui répondent sans session. Elle est
// vide tant qu'aucune feature n'y inscrit de route (F-026-AC30 y inscrira les trois premières).
export const ROUTES_PUBLIQUES: readonly RouteApi[] = [];

// F-011 H1 : la liste fermée des rôles, et ceux qu'une invitation peut donner.
export const ROLES = ["proprietaire", "editeur", "lecteur"] as const;
export const ROLES_INVITABLES = ["editeur", "lecteur"] as const;

export type Role = (typeof ROLES)[number];
export type RoleInvitable = (typeof ROLES_INVITABLES)[number];

// F-011-AC10 : les actions sur un espace, et les rôles qui permettent chacune. `lire-contenu` et
// `ecrire-contenu` ne sont exercées par aucune route de F-011 : F-012 les applique aux documents.
export const ACTIONS = [
  "lire-espace",
  "lister-membres",
  "lire-contenu",
  "quitter-espace",
  "ecrire-contenu",
  "renommer-espace",
  "supprimer-espace",
  "inviter",
  "retirer-membre",
  "changer-role",
] as const;

export type Action = (typeof ACTIONS)[number];

const TOUS: readonly Role[] = ["proprietaire", "editeur", "lecteur"];
const ECRIVAINS: readonly Role[] = ["proprietaire", "editeur"];
const PROPRIETAIRE: readonly Role[] = ["proprietaire"];

export const MATRICE_DES_DROITS: Readonly<Record<Action, readonly Role[]>> = {
  "lire-espace": TOUS,
  "lister-membres": TOUS,
  "lire-contenu": TOUS,
  "quitter-espace": TOUS,
  "ecrire-contenu": ECRIVAINS,
  "renommer-espace": PROPRIETAIRE,
  "supprimer-espace": PROPRIETAIRE,
  inviter: PROPRIETAIRE,
  "retirer-membre": PROPRIETAIRE,
  "changer-role": PROPRIETAIRE,
};

// F-011-AC7, AC24, H8.
export const QUOTAS = {
  espacesPossedesParCompte: 20,
  membresParEspace: 50,
  invitationsEnAttenteParEspace: 20,
} as const;

export const NOM_D_ESPACE_MAX = 100;

// F-011-AC19, H13 : 32 octets en base64url sans remplissage, soit 43 caractères de cet alphabet.
// Le client applique cette forme avant tout envoi.
export const LONGUEUR_DU_JETON = 43;
export const FORME_DU_JETON = /^[A-Za-z0-9_-]{43}$/;

export const schemaJetonInvitation = z.string().regex(FORME_DU_JETON);

// F-011-AC1 : la forme canonique, en minuscules.
const UUID_CANONIQUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const identifiant = z.string().regex(UUID_CANONIQUE);

// La longueur se compte en caractères, comme `char_length` en base, et non en unités UTF-16.
function aUneLongueurPermise(texte: string): boolean {
  const longueur = [...texte].length;
  return longueur >= 1 && longueur <= NOM_D_ESPACE_MAX;
}

function porteAutreChoseQueDesBlancs(texte: string): boolean {
  return texte.trim() !== "";
}

const nomDEspace = z.string().refine(aUneLongueurPermise).refine(porteAutreChoseQueDesBlancs);

const role = z.enum(ROLES);
const roleInvitable = z.enum(ROLES_INVITABLES);
const instant = z.iso.datetime();

// Corps des requêtes.
export const schemaCorpsCreationEspace = z.strictObject({ idEspace: identifiant, nom: nomDEspace });
export const schemaCorpsRenommage = z.strictObject({ nom: nomDEspace });
export const schemaCorpsChangementDeRole = z.strictObject({ role });
export const schemaCorpsCreationInvitation = z.strictObject({ role: roleInvitable });
// Le jeton n'est qu'une chaîne ici : sa forme est contrôlée ensuite, et une chaîne d'une autre
// forme reçoit `invitation-invalide`, pas `requete-invalide` (F-011-AC22).
export const schemaCorpsAcceptation = z.strictObject({ jeton: z.string() });

export type CorpsCreationEspace = z.infer<typeof schemaCorpsCreationEspace>;
export type CorpsRenommage = z.infer<typeof schemaCorpsRenommage>;
export type CorpsChangementDeRole = z.infer<typeof schemaCorpsChangementDeRole>;
export type CorpsCreationInvitation = z.infer<typeof schemaCorpsCreationInvitation>;
export type CorpsAcceptation = z.infer<typeof schemaCorpsAcceptation>;

// Corps des réponses. Un espace est toujours vu par l'un de ses membres, avec son rôle.
export const schemaEspace = z.strictObject({ idEspace: identifiant, nom: nomDEspace, role });
export const schemaListeEspaces = z.strictObject({ espaces: z.array(schemaEspace) });

// F-011-AC14, H7 : le courriel d'un membre n'est montré qu'à un propriétaire.
export const schemaMembre = z.strictObject({ idCompte: identifiant, nom: z.string().min(1), role });
export const schemaMembreVuParUnProprietaire = schemaMembre.extend({ courriel: z.string().min(1) });
export const schemaListeMembres = z.strictObject({ membres: z.array(schemaMembre) });
export const schemaListeMembresVueParUnProprietaire = z.strictObject({
  membres: z.array(schemaMembreVuParUnProprietaire),
});

// F-011-AC19 : le jeton n'est rendu que par la réponse à la création.
export const schemaInvitationCreee = z.strictObject({
  idInvitation: identifiant,
  role: roleInvitable,
  expireLe: instant,
  jeton: schemaJetonInvitation,
});

// F-011-AC20 : ni jeton ni empreinte.
export const schemaInvitation = z.strictObject({
  idInvitation: identifiant,
  role: roleInvitable,
  creeLe: instant,
  expireLe: instant,
});
export const schemaListeInvitations = z.strictObject({ invitations: z.array(schemaInvitation) });

export type Espace = z.infer<typeof schemaEspace>;
export type ListeEspaces = z.infer<typeof schemaListeEspaces>;
export type Membre = z.infer<typeof schemaMembre>;
export type MembreVuParUnProprietaire = z.infer<typeof schemaMembreVuParUnProprietaire>;
export type ListeMembres = z.infer<typeof schemaListeMembres>;
export type ListeMembresVueParUnProprietaire = z.infer<
  typeof schemaListeMembresVueParUnProprietaire
>;
export type InvitationCreee = z.infer<typeof schemaInvitationCreee>;
export type Invitation = z.infer<typeof schemaInvitation>;
export type ListeInvitations = z.infer<typeof schemaListeInvitations>;
