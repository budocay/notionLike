// Commandes des écrans des espaces et action de la matrice des droits à laquelle chacune est
// rattachée (F-014-AC26) ; la matrice est lue dans `packages/contrats`, jamais recopiée. Une commande
// que le dernier rôle donné par le serveur ne permet pas n'est pas rendue (F-014-AC27, H5).
import { type Action, permet, type Role } from "../compte/regles-espaces.ts";
import { OUVRIR_CET_ESPACE, RETIRER_DE_CET_APPAREIL } from "./messages-espaces.ts";

export const COMMANDES = {
  // F-032-AC28 : aussi « Ouvrir cet espace » d'un espace du serveur que l'appareil ne détient pas.
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

/**
 * Commandes de l'appareil (F-032-AC28) : elles n'agissent que sur l'appareil, sans requête, et ne
 * sont rattachées à aucune action de la matrice. Liste fermée.
 */
export const COMMANDES_DE_L_APPAREIL = ["ouvrir-sur-l-appareil", "retirer-de-l-appareil"] as const;

export type CommandeDeLAppareil = (typeof COMMANDES_DE_L_APPAREIL)[number];

const LIBELLES_DE_L_APPAREIL: Readonly<Record<CommandeDeLAppareil, string>> = {
  "ouvrir-sur-l-appareil": OUVRIR_CET_ESPACE,
  "retirer-de-l-appareil": RETIRER_DE_CET_APPAREIL,
};

/** Le libellé visible d'une commande de l'appareil ; c'est par lui qu'un écran la rend. */
export function libelleDeLAppareil(commande: CommandeDeLAppareil): string {
  return LIBELLES_DE_L_APPAREIL[commande];
}
