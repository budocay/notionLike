// Outils communs aux requêtes des espaces, des adhésions et des invitations (F-011).
import { eq } from "drizzle-orm";

import type { Base } from "./acces.ts";
import { ErreurBase } from "./erreurs.ts";
import { espace } from "./schema.ts";

export type Db = Base["db"];

// La forme canonique, en minuscules (F-011-AC1). Une autre valeur ne désigne aucune ligne : elle
// n'est pas envoyée à la base, où le type `uuid` la refuserait par une erreur (F-011-AC12).
const UUID_CANONIQUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function estUnUuid(valeur: string): boolean {
  return UUID_CANONIQUE.test(valeur);
}

// L'erreur de Drizzle porte le texte SQL et ses paramètres (F-009-AC19) : elle n'est ni transmise
// ni gardée en `cause`. Levée dans une transaction, elle l'annule.
export async function sansFuite<T>(travail: () => Promise<T>): Promise<T> {
  try {
    return await travail();
  } catch (erreur) {
    throw erreur instanceof ErreurBase ? erreur : new ErreurBase("requete-echouee");
  }
}

// Verrouille la ligne de l'espace jusqu'à la fin de la transaction : toute écriture d'adhésion ou
// d'invitation d'un espace passe par ce verrou, pris avant tout autre (F-011-AC17, AC22, AC24).
// Rend faux si l'espace n'existe pas (supprimé entre-temps).
export async function verrouillerEspace(transaction: Db, idEspace: string): Promise<boolean> {
  const lignes = await transaction
    .select({ id: espace.id })
    .from(espace)
    .where(eq(espace.id, idEspace))
    .for("update");
  return lignes.length > 0;
}
