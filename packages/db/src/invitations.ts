// Invitations (F-011-AC19 à AC24) : les seules requêtes du dépôt qui écrivent une invitation, et
// l'acceptation, qui crée une adhésion. Leurs appelants sont énumérés par
// `test/couture-espaces.test.ts`.
import { createHash } from "node:crypto";

import { and, count, eq, gt, isNull, type SQL } from "drizzle-orm";

import type { EspaceDuMembre } from "./espaces.ts";
import { estUnUuid, sansFuite, verrouillerEspace, type Db } from "./requetes.ts";
import { adhesion, espace, invitation, type ROLES_INVITABLES } from "./schema.ts";

export type RoleInvitable = (typeof ROLES_INVITABLES)[number];

// Ni jeton ni empreinte (F-011-AC20).
export interface InvitationLue {
  readonly idInvitation: string;
  readonly role: RoleInvitable;
  readonly creeLe: Date;
  readonly expireLe: Date;
}

export interface CreationInvitation {
  readonly idEspace: string;
  readonly role: RoleInvitable;
  // Le jeton tiré par le serveur (F-011-AC19) : seule son empreinte est écrite.
  readonly jeton: string;
  // Dates de l'horloge de l'appelant, injectable (F-011 H10).
  readonly creeLe: Date;
  readonly expireLe: Date;
  // Invitations en attente par espace (F-011-AC24), publié par `packages/contrats`.
  readonly plafondInvitationsEnAttente: number;
}

export type IssueCreationInvitation =
  | { readonly issue: "creee"; readonly invitation: InvitationLue }
  | { readonly issue: "espace-introuvable" }
  | { readonly issue: "quota-atteint" };

export interface Acceptation {
  readonly jeton: string;
  readonly idCompte: string;
  readonly maintenant: Date;
  // Membres par espace (F-011-AC24), publié par `packages/contrats`.
  readonly plafondMembres: number;
}

export type IssueAcceptation =
  | { readonly issue: "acceptee"; readonly espace: EspaceDuMembre; readonly idInvitation: string }
  | { readonly issue: "invitation-invalide" }
  | { readonly issue: "deja-membre" }
  | { readonly issue: "quota-atteint" };

// SHA-256 des caractères du jeton tels qu'ils sont transmis, sans décodage (F-011-AC19, H13).
export function empreinteDuJeton(jeton: string): string {
  return createHash("sha256").update(jeton, "utf8").digest("hex");
}

const colonnesDeLInvitation = {
  idInvitation: invitation.id,
  role: invitation.role,
  creeLe: invitation.creeLe,
  expireLe: invitation.expireLe,
};

function enAttente(maintenant: Date): SQL | undefined {
  return and(
    isNull(invitation.accepteeLe),
    isNull(invitation.revoqueeLe),
    gt(invitation.expireLe, maintenant),
  );
}

async function nombreEnAttente(transaction: Db, idEspace: string, maintenant: Date) {
  const [compte] = await transaction
    .select({ nombre: count() })
    .from(invitation)
    .where(and(eq(invitation.idEspace, idEspace), enAttente(maintenant)));
  return compte?.nombre ?? 0;
}

// Crée l'invitation sous le verrou de l'espace, sauf si le plafond est atteint (F-011-AC24).
export function creerInvitation(
  db: Db,
  creation: CreationInvitation,
): Promise<IssueCreationInvitation> {
  const { idEspace, role, creeLe, expireLe } = creation;
  if (!estUnUuid(idEspace)) {
    return Promise.resolve({ issue: "espace-introuvable" });
  }
  return sansFuite(() =>
    db.transaction(async (transaction): Promise<IssueCreationInvitation> => {
      if (!(await verrouillerEspace(transaction, idEspace))) {
        return { issue: "espace-introuvable" };
      }
      const attente = await nombreEnAttente(transaction, idEspace, creeLe);
      if (attente >= creation.plafondInvitationsEnAttente) {
        return { issue: "quota-atteint" };
      }
      const [creee] = await transaction
        .insert(invitation)
        .values({ idEspace, role, creeLe, expireLe, empreinte: empreinteDuJeton(creation.jeton) })
        .returning(colonnesDeLInvitation);
      return creee === undefined
        ? { issue: "espace-introuvable" }
        : { issue: "creee", invitation: creee };
    }),
  );
}

// Les invitations en attente de l'espace (F-011-AC20), de la plus ancienne à la plus récente.
export function listerInvitationsEnAttente(
  db: Db,
  idEspace: string,
  maintenant: Date,
): Promise<InvitationLue[]> {
  if (!estUnUuid(idEspace)) {
    return Promise.resolve([]);
  }
  return sansFuite(() =>
    db
      .select(colonnesDeLInvitation)
      .from(invitation)
      .where(and(eq(invitation.idEspace, idEspace), enAttente(maintenant)))
      .orderBy(invitation.creeLe, invitation.id),
  );
}

// Révoque une invitation en attente de cet espace (F-011-AC20) ; `undefined`, sans rien modifier,
// pour une invitation d'un autre espace, inconnue ou qui n'est plus en attente (AC13, H12).
export function revoquerInvitation(
  db: Db,
  visee: { readonly idEspace: string; readonly idInvitation: string; readonly maintenant: Date },
): Promise<InvitationLue | undefined> {
  if (!estUnUuid(visee.idEspace) || !estUnUuid(visee.idInvitation)) {
    return Promise.resolve(undefined);
  }
  return sansFuite(async () => {
    const [revoquee] = await db
      .update(invitation)
      .set({ revoqueeLe: visee.maintenant })
      .where(
        and(
          eq(invitation.id, visee.idInvitation),
          eq(invitation.idEspace, visee.idEspace),
          enAttente(visee.maintenant),
        ),
      )
      .returning(colonnesDeLInvitation);
    return revoquee;
  });
}

async function nombreDeMembres(transaction: Db, idEspace: string): Promise<number> {
  const [compte] = await transaction
    .select({ nombre: count() })
    .from(adhesion)
    .where(eq(adhesion.idEspace, idEspace));
  return compte?.nombre ?? 0;
}

async function estMembre(transaction: Db, idEspace: string, idCompte: string): Promise<boolean> {
  const lignes = await transaction
    .select({ role: adhesion.role })
    .from(adhesion)
    .where(and(eq(adhesion.idEspace, idEspace), eq(adhesion.idCompte, idCompte)));
  return lignes.length > 0;
}

// Sous les verrous de l'espace puis de l'invitation, dans cet ordre, celui de la suppression d'un
// espace : l'invitation est relue en attente, puis l'adhésion créée et l'invitation marquée
// acceptée dans la même transaction (F-011-AC21). Deux acceptations du même jeton se suivent :
// la seconde relit l'invitation acceptée et reçoit `invitation-invalide` (AC22).
async function accepterSousLesVerrous(
  transaction: Db,
  acceptation: Acceptation,
  idEspace: string,
  empreinte: string,
): Promise<IssueAcceptation> {
  if (!(await verrouillerEspace(transaction, idEspace))) {
    return { issue: "invitation-invalide" };
  }
  const [visee] = await transaction
    .select({ id: invitation.id, role: invitation.role, nom: espace.nom })
    .from(invitation)
    .innerJoin(espace, eq(espace.id, invitation.idEspace))
    .where(and(eq(invitation.empreinte, empreinte), enAttente(acceptation.maintenant)))
    .for("update", { of: invitation });
  if (visee === undefined) {
    return { issue: "invitation-invalide" };
  }
  if (await estMembre(transaction, idEspace, acceptation.idCompte)) {
    return { issue: "deja-membre" };
  }
  if ((await nombreDeMembres(transaction, idEspace)) >= acceptation.plafondMembres) {
    return { issue: "quota-atteint" };
  }
  await transaction
    .insert(adhesion)
    .values({ idEspace, idCompte: acceptation.idCompte, role: visee.role });
  await transaction
    .update(invitation)
    .set({ accepteeLe: acceptation.maintenant })
    .where(eq(invitation.id, visee.id));
  return {
    issue: "acceptee",
    espace: { idEspace, nom: visee.nom, role: visee.role },
    idInvitation: visee.id,
  };
}

// Accepte l'invitation du jeton pour ce compte. Aucun rôle n'est lu ailleurs que dans l'invitation.
// Un jeton inconnu ou qui n'est plus en attente : `invitation-invalide`, sans rien écrire (AC22) ;
// un compte déjà membre ou un espace plein laisse l'invitation en attente (AC23, AC24).
export function accepterInvitation(db: Db, acceptation: Acceptation): Promise<IssueAcceptation> {
  if (!estUnUuid(acceptation.idCompte)) {
    return Promise.resolve({ issue: "invitation-invalide" });
  }
  const empreinte = empreinteDuJeton(acceptation.jeton);
  return sansFuite(() =>
    db.transaction(async (transaction): Promise<IssueAcceptation> => {
      const [trouvee] = await transaction
        .select({ idEspace: invitation.idEspace })
        .from(invitation)
        .where(eq(invitation.empreinte, empreinte));
      return trouvee === undefined
        ? { issue: "invitation-invalide" }
        : accepterSousLesVerrous(transaction, acceptation, trouvee.idEspace, empreinte);
    }),
  );
}
