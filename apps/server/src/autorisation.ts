// Autorisation sur un espace (F-011-AC9 à AC12, AC28, AC32) : le seul module du serveur qui lit une
// adhésion pour décider. L'adhésion, puis le rôle, puis la matrice publiée par `packages/contrats`,
// lus en base à chaque requête, sans cache. Une lecture en échec lève : aucun accès par défaut.
import { MATRICE_DES_DROITS, type Action, type Role } from "@notionlike/contrats";
import { lireAdhesion, type Base, type EspaceDuMembre } from "@notionlike/db";

export type Decision =
  // Un non-membre, un espace inconnu ou supprimé, une valeur qui n'est pas un UUID : une seule
  // issue, pour ne rien révéler de l'existence d'un espace (F-011-AC12).
  | { readonly issue: "introuvable" }
  | { readonly issue: "refusee"; readonly adhesion: EspaceDuMembre }
  | { readonly issue: "autorisee"; readonly adhesion: EspaceDuMembre };

export interface Demande {
  readonly idEspace: string;
  readonly idCompte: string;
  readonly action: Action;
}

export function permet(role: Role, action: Action): boolean {
  return MATRICE_DES_DROITS[action].includes(role);
}

export async function decider(base: Base, demande: Demande): Promise<Decision> {
  const adhesion = await lireAdhesion(base.db, demande.idEspace, demande.idCompte);
  if (adhesion === undefined) {
    return { issue: "introuvable" };
  }
  return permet(adhesion.role, demande.action)
    ? { issue: "autorisee", adhesion }
    : { issue: "refusee", adhesion };
}
