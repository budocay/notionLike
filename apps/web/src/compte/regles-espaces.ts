// Règles des espaces lues dans `packages/contrats`, sans rien recopier (F-014-AC39) : la matrice
// des droits (F-014-AC26, AC27), les rôles, les quotas, la forme du nom d'un espace (F-014-AC8) et
// celle du jeton d'invitation (F-014-AC21). L'interface n'importe pas le paquet des contrats : elle
// passe par ce module.
import {
  type Action,
  ACTIONS,
  MATRICE_DES_DROITS,
  NOM_D_ESPACE_MAX,
  QUOTAS,
  type Role,
  type RoleInvitable,
  ROLES,
  ROLES_INVITABLES,
  schemaCorpsRenommage,
  schemaJetonInvitation,
} from "@notionlike/contrats";

export type { Action, Role, RoleInvitable };
export { ACTIONS, NOM_D_ESPACE_MAX, QUOTAS, ROLES, ROLES_INVITABLES };

/** Le rôle permet-il l'action, d'après la matrice publiée ? */
export function permet(role: Role, action: Action): boolean {
  return MATRICE_DES_DROITS[action].includes(role);
}

/**
 * La chaîne a-t-elle la forme du jeton d'invitation ? Elle est comparée telle quelle, sans décodage
 * ni correction : un caractère encodé, un blanc ou un `=` final n'ont pas la forme.
 */
export function estUnJetonDInvitation(brut: string): boolean {
  return schemaJetonInvitation.safeParse(brut).success;
}

/** Le nom est-il conforme au schéma des corps de création et de renommage ? */
export function estUnNomDEspace(nom: string): boolean {
  return schemaCorpsRenommage.safeParse({ nom }).success;
}
