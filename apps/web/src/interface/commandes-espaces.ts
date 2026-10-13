// Commandes des écrans des espaces et action de la matrice des droits à laquelle chacune est
// rattachée (F-014-AC26) ; la matrice est lue dans `packages/contrats`, jamais recopiée. Une commande
// que le dernier rôle donné par le serveur ne permet pas n'est pas rendue (F-014-AC27, H5).
import { type Action, permet, type Role } from "../compte/regles-espaces.ts";

export const COMMANDES = {
  "ouvrir-espace": "lire-espace",
  "voir-membres": "lister-membres",
  renommer: "renommer-espace",
  supprimer: "supprimer-espace",
  quitter: "quitter-espace",
  "changer-role": "changer-role",
  "retirer-membre": "retirer-membre",
  "voir-invitations": "inviter",
  "creer-invitation": "inviter",
  "revoquer-invitation": "inviter",
} as const satisfies Readonly<Record<string, Action>>;

export type Commande = keyof typeof COMMANDES;

export function peut(role: Role, commande: Commande): boolean {
  return permet(role, COMMANDES[commande]);
}
