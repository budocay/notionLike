// Requêtes de la gestion du compte (F-027, H1) : le nom, l'empreinte du mot de passe et les
// sessions d'un compte, écrits et lus hors de better-auth dans ses propres tables (F-009 H3). La
// ligne « identifiant et mot de passe » d'un compte est repérée par le triplet que better-auth lit
// à la connexion : `userId`, `providerId = "credential"`, `accountId = userId` (MEMORY/VEILLE.md).
// Aucune de ces requêtes ne supprime de session : seule `supprimerSessions` le fait (F-009-AC33).
// Chacune accepte l'accès de la base ou une transaction en cours ; un identifiant qui n'est pas un
// uuid ne désigne aucune ligne et n'est pas envoyé à la base.
import { and, desc, eq, gt } from "drizzle-orm";

import { estUnUuid, sansFuite, type Db } from "./requetes.ts";
import { account, session, user } from "./schema.ts";

const FOURNISSEUR_DU_MOT_DE_PASSE = "credential";

export interface CompteRenomme {
  readonly id: string;
  readonly nom: string;
  readonly courriel: string;
}

// Une session telle que son titulaire la voit : jamais son jeton (F-027-AC9).
export interface SessionDuCompteLue {
  readonly idSession: string;
  readonly creeLe: Date;
  // `updatedAt`, que better-auth renouvelle à chaque prolongation (F-009-AC12).
  readonly prolongeeLe: Date;
  readonly expireLe: Date;
  readonly adresseIp: string | null;
  // Tel qu'enregistré : la troncature à l'affichage est celle du contrat, appliquée par le serveur.
  readonly agentUtilisateur: string | null;
}

export interface SessionsListees {
  readonly idCompte: string;
  readonly maintenant: Date;
  readonly limite: number;
}

export interface SessionCiblee {
  readonly idCompte: string;
  readonly idSession: string;
  readonly maintenant: Date;
}

function ligneDuMotDePasse(idCompte: string) {
  return and(
    eq(account.userId, idCompte),
    eq(account.providerId, FOURNISSEUR_DU_MOT_DE_PASSE),
    eq(account.accountId, idCompte),
  );
}

// Le nom seul change ; `updatedAt` suit (`$onUpdate`). `undefined` : aucun compte de cet identifiant.
export function renommerCompte(
  db: Db,
  idCompte: string,
  nom: string,
): Promise<CompteRenomme | undefined> {
  return sansFuite(async () => {
    if (!estUnUuid(idCompte)) {
      return undefined;
    }
    const [renomme] = await db
      .update(user)
      .set({ name: nom })
      .where(eq(user.id, idCompte))
      .returning({ id: user.id, nom: user.name, courriel: user.email });
    return renomme;
  });
}

// L'empreinte stockée, telle quelle. `undefined` : pas de ligne de mot de passe, ou colonne vide.
export function lireEmpreinte(db: Db, idCompte: string): Promise<string | undefined> {
  return sansFuite(async () => {
    if (!estUnUuid(idCompte)) {
      return undefined;
    }
    const [ligne] = await db
      .select({ empreinte: account.password })
      .from(account)
      .where(ligneDuMotDePasse(idCompte))
      .limit(1);
    return ligne?.empreinte ?? undefined;
  });
}

// Remplace l'empreinte (et renouvelle `updatedAt`) ; faux si le compte n'a pas de ligne de mot de
// passe. Dans une transaction, l'écriture n'est acquise qu'à sa validation (F-027-AC4, AC17).
export function ecrireEmpreinte(db: Db, idCompte: string, empreinte: string): Promise<boolean> {
  return sansFuite(async () => {
    if (!estUnUuid(idCompte)) {
      return false;
    }
    const lignes = await db
      .update(account)
      .set({ password: empreinte })
      .where(ligneDuMotDePasse(idCompte))
      .returning({ id: account.id });
    return lignes.length > 0;
  });
}

// Les sessions non expirées du compte, de la plus récemment prolongée à la plus ancienne, `limite`
// au plus (F-027-AC9).
export function listerSessions(
  db: Db,
  { idCompte, maintenant, limite }: SessionsListees,
): Promise<SessionDuCompteLue[]> {
  return sansFuite(async () => {
    if (!estUnUuid(idCompte)) {
      return [];
    }
    return db
      .select({
        idSession: session.id,
        creeLe: session.createdAt,
        prolongeeLe: session.updatedAt,
        expireLe: session.expiresAt,
        adresseIp: session.ipAddress,
        agentUtilisateur: session.userAgent,
      })
      .from(session)
      .where(and(eq(session.userId, idCompte), gt(session.expiresAt, maintenant)))
      .orderBy(desc(session.updatedAt), desc(session.createdAt), desc(session.id))
      .limit(limite);
  });
}

// Vrai si la session existe, appartient au compte et n'a pas expiré (F-027-AC10, AC11). Dans une
// transaction, sa ligne reste verrouillée jusqu'à la fin : la suppression qui suit vise la session
// vérifiée.
export function verrouillerSessionDuCompte(
  db: Db,
  { idCompte, idSession, maintenant }: SessionCiblee,
): Promise<boolean> {
  return sansFuite(async () => {
    if (!estUnUuid(idCompte) || !estUnUuid(idSession)) {
      return false;
    }
    const lignes = await db
      .select({ id: session.id })
      .from(session)
      .where(
        and(
          eq(session.id, idSession),
          eq(session.userId, idCompte),
          gt(session.expiresAt, maintenant),
        ),
      )
      .for("update");
    return lignes.length > 0;
  });
}
