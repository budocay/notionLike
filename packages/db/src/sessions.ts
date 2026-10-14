// Suppression de sessions (F-009-AC33) : la seule requête du dépôt qui efface une ligne de
// `session`. Son seul appelant est la fonction de suppression de session d'`apps/server`, qui
// prévient ses abonnés ; rien d'autre ne doit l'appeler.
import { and, eq, ne } from "drizzle-orm";

import type { Base } from "./acces.ts";
import { ErreurBase } from "./erreurs.ts";
import { session } from "./schema.ts";

// Une session, ou toutes celles d'un compte, expirées comprises, sauf au besoin l'une d'elles : la
// session courante, que le changement de mot de passe et la révocation des autres sessions gardent
// (F-027-AC4, AC12). Sans `sauf`, toutes les sessions du compte, comme avant F-027.
export type SessionsVisees =
  { readonly idSession: string } | { readonly idCompte: string; readonly sauf?: string };

function conditionDe(visees: SessionsVisees) {
  if ("idSession" in visees) {
    return eq(session.id, visees.idSession);
  }
  const duCompte = eq(session.userId, visees.idCompte);
  return visees.sauf === undefined ? duCompte : and(duCompte, ne(session.id, visees.sauf));
}

// Ce que le signal porte : jamais le jeton.
export interface SessionSupprimee {
  readonly idSession: string;
  readonly idCompte: string;
}

// Supprime les sessions visées et rend celles qui l'ont été ; aucune ligne visée, liste vide.
// `db` est l'accès de la base ou une transaction en cours (`base.db.transaction`) : dans une
// transaction, la suppression n'est acquise qu'à sa validation, et l'erreur levée ici l'annule si
// l'appelant la laisse sortir. L'erreur de Drizzle porte le texte SQL et ses paramètres
// (F-009-AC19) : elle n'est ni transmise ni gardée en `cause`.
export async function supprimerSessions(
  db: Base["db"],
  visees: SessionsVisees,
): Promise<SessionSupprimee[]> {
  try {
    return await db
      .delete(session)
      .where(conditionDe(visees))
      .returning({ idSession: session.id, idCompte: session.userId });
  } catch {
    throw new ErreurBase("requete-echouee");
  }
}
