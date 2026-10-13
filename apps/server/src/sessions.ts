// Fonction de suppression de session (F-009-AC33, H20) : le seul appelant de `supprimerSessions`.
// Toute suppression passe par une transaction ouverte ici ; le signal part après sa validation.
import {
  supprimerSessions,
  type Base,
  type SessionSupprimee,
  type SessionsVisees,
} from "@notionlike/db";

import type { Journal } from "./journal.ts";

type Abonne = (session: SessionSupprimee) => void | Promise<void>;
type Supprimer = (visees: SessionsVisees) => Promise<SessionSupprimee[]>;
type Travail<Resultat> = (transaction: Base["db"], supprimer: Supprimer) => Promise<Resultat>;

export interface SuppressionDeSessions {
  // Une suppression seule, dans sa propre transaction.
  readonly supprimer: Supprimer;
  // Une suppression au milieu d'un travail plus large : `travail` reçoit la transaction et la
  // suppression liée à elle. S'il rejette, tout est annulé et rien n'est signalé.
  dansUneTransaction<Resultat>(travail: Travail<Resultat>): Promise<Resultat>;
  abonner(abonne: Abonne): void;
}

export function creerSuppressionDeSessions(base: Base, journal: Journal): SuppressionDeSessions {
  const abonnes: Abonne[] = [];

  // Un abonné qui échoue n'empêche ni les autres d'être prévenus ni la suppression de tenir.
  async function prevenir(abonne: Abonne, session: SessionSupprimee): Promise<void> {
    try {
      await abonne(session);
    } catch (erreur) {
      journal.echecSansDonnee("abonne-en-echec", erreur);
    }
  }

  async function dansUneTransaction<Resultat>(travail: Travail<Resultat>): Promise<Resultat> {
    const supprimees: SessionSupprimee[] = [];
    const resultat = await base.db.transaction((transaction) =>
      travail(transaction, async (visees) => {
        const lot = await supprimerSessions(transaction, visees);
        supprimees.push(...lot);
        return lot;
      }),
    );
    await Promise.all(
      supprimees.flatMap((session) => abonnes.map((abonne) => prevenir(abonne, session))),
    );
    return resultat;
  }

  return {
    supprimer: (visees) => dansUneTransaction((_transaction, supprimer) => supprimer(visees)),
    dansUneTransaction,
    abonner: (abonne) => {
      abonnes.push(abonne);
    },
  };
}
