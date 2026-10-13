// Suppression de sessions (F-009-AC33) : la seule requête du dépôt qui efface une ligne de
// `session`. Son seul appelant est la fonction de suppression de session d'`apps/server`, qui
// prévient ses abonnés ; rien d'autre ne doit l'appeler.
import { eq } from "drizzle-orm";

import type { Base } from "./acces.ts";
import { ErreurBase } from "./erreurs.ts";
import { session } from "./schema.ts";

// Une session, ou toutes celles d'un compte.
export type SessionsVisees = { readonly idSession: string } | { readonly idCompte: string };

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
  const condition =
    "idSession" in visees ? eq(session.id, visees.idSession) : eq(session.userId, visees.idCompte);
  try {
    return await db
      .delete(session)
      .where(condition)
      .returning({ idSession: session.id, idCompte: session.userId });
  } catch {
    throw new ErreurBase("requete-echouee");
  }
}
