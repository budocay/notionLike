// Lancement des migrations (ADR-0005). Le serveur n'importe jamais ce fichier : il n'applique
// aucune migration (H7).
import { fileURLToPath } from "node:url";

import type { Pilote } from "./acces.ts";

// Trouvé à partir de l'emplacement de ce fichier, jamais du dossier courant.
export const DOSSIER_MIGRATIONS = fileURLToPath(new URL("../migrations", import.meta.url));

const PHRASE_D_ECHEC = "La migration a échoué : aucune migration de ce lancement n'est appliquée.";
const CAUSES_ECRITES_AU_PLUS = 5;

// Les messages de la chaîne des `cause`, chacun ramené à une ligne. Jamais l'objet d'erreur :
// celui du pilote `pg` peut porter le client, donc le mot de passe.
function messagesDeLaChaine(erreur: unknown): string[] {
  const messages: string[] = [];
  let maillon = erreur;
  while (maillon instanceof Error && messages.length < CAUSES_ECRITES_AU_PLUS) {
    messages.push(maillon.message.replace(/\s+/g, " ").trim());
    maillon = maillon.cause;
  }
  return messages;
}

// Applique les migrations en attente du dossier et rend le code de sortie de la commande :
// 0 quand tout est appliqué ou qu'il n'y avait rien à faire, 1 dans tous les autres cas.
export async function lancerMigration(
  pilote: Pilote,
  dossier: string,
  ecrire: (ligne: string) => void,
): Promise<number> {
  try {
    await pilote.appliquerMigrations(dossier);
    return 0;
  } catch (erreur) {
    [PHRASE_D_ECHEC, ...messagesDeLaChaine(erreur)].forEach((ligne) => {
      ecrire(ligne);
    });
    return 1;
  }
}
