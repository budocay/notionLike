// Espaces et adhésions du demandeur (F-011-AC1 à AC7, AC9) : les seules requêtes du dépôt qui
// créent, renomment ou suppriment un espace. Leurs appelants sont énumérés par
// `test/couture-espaces.test.ts`.
import { and, count, eq } from "drizzle-orm";

import { estUnUuid, sansFuite, verrouillerEspace, type Db } from "./requetes.ts";
import { adhesion, espace, user, type ROLES } from "./schema.ts";

export type Role = (typeof ROLES)[number];

export interface EspaceLu {
  readonly idEspace: string;
  readonly nom: string;
}

// Un espace vu par l'un de ses membres : son rôle y est lu en base à chaque appel (F-011-AC9).
export interface EspaceDuMembre extends EspaceLu {
  readonly role: Role;
}

// Une adhésion qui n'existe plus : ce que le serveur signale à ses abonnés (F-011-AC32).
export interface AdhesionSupprimee {
  readonly idEspace: string;
  readonly idCompte: string;
  readonly role: Role;
}

export type IssueCreationEspace =
  | { readonly issue: "cree"; readonly espace: EspaceDuMembre }
  | { readonly issue: "existant"; readonly espace: EspaceDuMembre }
  | { readonly issue: "identifiant-indisponible" }
  | { readonly issue: "quota-atteint" };

export interface CreationEspace {
  readonly idEspace: string;
  readonly nom: string;
  readonly idCompte: string;
  // Nombre d'espaces qu'un compte peut posséder (F-011-AC7), publié par `packages/contrats`.
  readonly plafondEspacesPossedes: number;
}

const colonnesDuMembre = { idEspace: espace.id, nom: espace.nom, role: adhesion.role };

// L'adhésion du compte à l'espace, avec le nom de l'espace ; `undefined` pour un non-membre, un
// espace inconnu ou supprimé, ou un identifiant qui n'est pas un UUID canonique (F-011-AC12).
export function lireAdhesion(
  db: Db,
  idEspace: string,
  idCompte: string,
): Promise<EspaceDuMembre | undefined> {
  if (!estUnUuid(idEspace) || !estUnUuid(idCompte)) {
    return Promise.resolve(undefined);
  }
  return sansFuite(async () => {
    const [lue] = await db
      .select(colonnesDuMembre)
      .from(adhesion)
      .innerJoin(espace, eq(espace.id, adhesion.idEspace))
      .where(and(eq(adhesion.idEspace, idEspace), eq(adhesion.idCompte, idCompte)));
    return lue;
  });
}

// Les espaces dont le compte est membre, et ceux-là seuls (F-011-AC3), par nom puis identifiant.
export function listerEspaces(db: Db, idCompte: string): Promise<EspaceDuMembre[]> {
  if (!estUnUuid(idCompte)) {
    return Promise.resolve([]);
  }
  return sansFuite(() =>
    db
      .select(colonnesDuMembre)
      .from(adhesion)
      .innerJoin(espace, eq(espace.id, adhesion.idEspace))
      .where(eq(adhesion.idCompte, idCompte))
      .orderBy(espace.nom, espace.id),
  );
}

// Un identifiant déjà pris : rejouer sa propre création rend l'état actuel (F-011-AC2), sinon
// l'identifiant est indisponible, sans rien dire de plus de l'espace (H3).
async function issueDUnIdentifiantPris(
  transaction: Db,
  idEspace: string,
  idCompte: string,
): Promise<IssueCreationEspace> {
  const lue = await lireAdhesion(transaction, idEspace, idCompte);
  return lue?.role === "proprietaire"
    ? { issue: "existant", espace: lue }
    : { issue: "identifiant-indisponible" };
}

async function nombreDEspacesPossedes(transaction: Db, idCompte: string): Promise<number> {
  const [compte] = await transaction
    .select({ nombre: count() })
    .from(adhesion)
    .where(and(eq(adhesion.idCompte, idCompte), eq(adhesion.role, "proprietaire")));
  return compte?.nombre ?? 0;
}

// Crée l'espace et l'adhésion `proprietaire` de son créateur dans une même transaction (F-011-AC1).
// La ligne du compte est verrouillée (`for no key update`, qui laisse passer les vérifications de
// clé étrangère) : deux créations du même compte ne dépassent pas ensemble le plafond (AC7).
export function creerEspace(db: Db, creation: CreationEspace): Promise<IssueCreationEspace> {
  const { idEspace, nom, idCompte } = creation;
  if (!estUnUuid(idEspace) || !estUnUuid(idCompte)) {
    return Promise.resolve({ issue: "identifiant-indisponible" });
  }
  return sansFuite(() =>
    db.transaction(async (transaction) => {
      await transaction
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, idCompte))
        .for("no key update");
      const [existant] = await transaction
        .select({ id: espace.id })
        .from(espace)
        .where(eq(espace.id, idEspace));
      if (existant !== undefined) {
        return issueDUnIdentifiantPris(transaction, idEspace, idCompte);
      }
      if (
        (await nombreDEspacesPossedes(transaction, idCompte)) >= creation.plafondEspacesPossedes
      ) {
        return { issue: "quota-atteint" };
      }
      const inseres = await transaction
        .insert(espace)
        .values({ id: idEspace, nom })
        .onConflictDoNothing()
        .returning({ id: espace.id });
      if (inseres.length === 0) {
        return issueDUnIdentifiantPris(transaction, idEspace, idCompte);
      }
      await transaction.insert(adhesion).values({ idEspace, idCompte, role: "proprietaire" });
      return { issue: "cree", espace: { idEspace, nom, role: "proprietaire" } };
    }),
  );
}

// Enregistre le nom (F-011-AC5) ; `undefined` si l'espace n'existe pas.
export function renommerEspace(
  db: Db,
  idEspace: string,
  nom: string,
): Promise<EspaceLu | undefined> {
  if (!estUnUuid(idEspace)) {
    return Promise.resolve(undefined);
  }
  return sansFuite(async () => {
    const [renomme] = await db
      .update(espace)
      .set({ nom })
      .where(eq(espace.id, idEspace))
      .returning({ idEspace: espace.id, nom: espace.nom });
    return renomme;
  });
}

// Supprime dans une même transaction l'espace, ses adhésions et ses invitations (F-011-AC6) ; rend
// les adhésions supprimées, ou `undefined` si l'espace n'existe pas. Les invitations partent par la
// cascade de la clé étrangère, les adhésions sont supprimées d'abord pour être rendues.
export function supprimerEspace(
  db: Db,
  idEspace: string,
): Promise<AdhesionSupprimee[] | undefined> {
  if (!estUnUuid(idEspace)) {
    return Promise.resolve(undefined);
  }
  return sansFuite(() =>
    db.transaction(async (transaction) => {
      if (!(await verrouillerEspace(transaction, idEspace))) {
        return undefined;
      }
      const supprimees = await transaction
        .delete(adhesion)
        .where(eq(adhesion.idEspace, idEspace))
        .returning({
          idEspace: adhesion.idEspace,
          idCompte: adhesion.idCompte,
          role: adhesion.role,
        });
      await transaction.delete(espace).where(eq(espace.id, idEspace));
      return supprimees;
    }),
  );
}
