// Membres d'un espace (F-011-AC14 à AC18) : les seules requêtes du dépôt qui changent le rôle d'une
// adhésion ou la suppriment hors de la suppression d'un espace. Leurs appelants sont énumérés par
// `test/couture-espaces.test.ts`.
import { and, count, eq } from "drizzle-orm";

import type { AdhesionSupprimee, Role } from "./espaces.ts";
import { estUnUuid, sansFuite, verrouillerEspace, type Db } from "./requetes.ts";
import { adhesion, user } from "./schema.ts";

// Un membre tel qu'un autre membre le voit. Le courriel n'est lu que sur demande (F-011-AC14, H7) :
// la réponse faite à un `editeur` ou à un `lecteur` ne peut pas le porter par oubli.
export interface MembreLu {
  readonly idCompte: string;
  readonly nom: string;
  readonly role: Role;
  readonly courriel?: string;
}

export interface MembreVise {
  readonly idEspace: string;
  readonly idCompte: string;
}

export type IssueChangementDeRole =
  | { readonly issue: "fait"; readonly membre: MembreLu; readonly roleAvant: Role }
  | { readonly issue: "espace-introuvable" }
  | { readonly issue: "membre-introuvable" }
  | { readonly issue: "dernier-proprietaire" };

export type IssueRetrait =
  | { readonly issue: "fait"; readonly adhesion: AdhesionSupprimee }
  | { readonly issue: "espace-introuvable" }
  | { readonly issue: "membre-introuvable" }
  | { readonly issue: "dernier-proprietaire" };

const colonnesDuMembre = { idCompte: user.id, nom: user.name, role: adhesion.role };
const colonnesAvecCourriel = { ...colonnesDuMembre, courriel: user.email };

// Les membres de l'espace, par nom puis identifiant ; liste vide pour un espace inconnu.
export function listerMembres(
  db: Db,
  idEspace: string,
  { avecCourriel }: { readonly avecCourriel: boolean },
): Promise<MembreLu[]> {
  if (!estUnUuid(idEspace)) {
    return Promise.resolve([]);
  }
  return sansFuite(() =>
    db
      .select(avecCourriel ? colonnesAvecCourriel : colonnesDuMembre)
      .from(adhesion)
      .innerJoin(user, eq(user.id, adhesion.idCompte))
      .where(eq(adhesion.idEspace, idEspace))
      .orderBy(user.name, user.id),
  );
}

async function lireMembre(transaction: Db, vise: MembreVise): Promise<MembreLu | undefined> {
  const [membre] = await transaction
    .select(colonnesAvecCourriel)
    .from(adhesion)
    .innerJoin(user, eq(user.id, adhesion.idCompte))
    .where(and(eq(adhesion.idEspace, vise.idEspace), eq(adhesion.idCompte, vise.idCompte)));
  return membre;
}

async function nombreDeProprietaires(transaction: Db, idEspace: string): Promise<number> {
  const [compte] = await transaction
    .select({ nombre: count() })
    .from(adhesion)
    .where(and(eq(adhesion.idEspace, idEspace), eq(adhesion.role, "proprietaire")));
  return compte?.nombre ?? 0;
}

// Vrai si ce membre, perdant le rôle `proprietaire`, laisserait l'espace sans propriétaire.
async function estLeDernierProprietaire(transaction: Db, membre: MembreVise & { role: Role }) {
  return (
    membre.role === "proprietaire" &&
    (await nombreDeProprietaires(transaction, membre.idEspace)) <= 1
  );
}

type IssueSansMembre =
  { readonly issue: "espace-introuvable" } | { readonly issue: "membre-introuvable" };

// Ouvre la transaction qui verrouille l'espace (F-011-AC17), lit le membre visé, et ne passe la
// main qu'à un membre existant : vérification et écriture se font sous le même verrou.
function sousLeVerrou<T>(
  db: Db,
  vise: MembreVise,
  ecrire: (transaction: Db, membre: MembreLu) => Promise<T>,
): Promise<T | IssueSansMembre> {
  if (!estUnUuid(vise.idEspace) || !estUnUuid(vise.idCompte)) {
    return Promise.resolve({ issue: "membre-introuvable" });
  }
  return sansFuite(() =>
    db.transaction(async (transaction) => {
      if (!(await verrouillerEspace(transaction, vise.idEspace))) {
        return { issue: "espace-introuvable" } as const;
      }
      const membre = await lireMembre(transaction, vise);
      return membre === undefined
        ? ({ issue: "membre-introuvable" } as const)
        : ecrire(transaction, membre);
    }),
  );
}

// Enregistre le rôle du membre (F-011-AC15), sauf s'il laisserait l'espace sans propriétaire (AC17).
export function changerRole(
  db: Db,
  vise: MembreVise & { readonly role: Role },
): Promise<IssueChangementDeRole> {
  return sousLeVerrou(db, vise, async (transaction, membre): Promise<IssueChangementDeRole> => {
    const quitteLaPropriete = vise.role !== "proprietaire";
    if (
      quitteLaPropriete &&
      (await estLeDernierProprietaire(transaction, { ...vise, role: membre.role }))
    ) {
      return { issue: "dernier-proprietaire" };
    }
    await transaction
      .update(adhesion)
      .set({ role: vise.role })
      .where(and(eq(adhesion.idEspace, vise.idEspace), eq(adhesion.idCompte, vise.idCompte)));
    return { issue: "fait", membre: { ...membre, role: vise.role }, roleAvant: membre.role };
  });
}

// Supprime l'adhésion (F-011-AC16, AC18), sauf si elle laisserait l'espace sans propriétaire (AC17).
// Le compte et ses sessions ne sont pas touchés.
export function retirerMembre(db: Db, vise: MembreVise): Promise<IssueRetrait> {
  return sousLeVerrou(db, vise, async (transaction, membre): Promise<IssueRetrait> => {
    if (await estLeDernierProprietaire(transaction, { ...vise, role: membre.role })) {
      return { issue: "dernier-proprietaire" };
    }
    await transaction
      .delete(adhesion)
      .where(and(eq(adhesion.idEspace, vise.idEspace), eq(adhesion.idCompte, vise.idCompte)));
    return {
      issue: "fait",
      adhesion: { idEspace: vise.idEspace, idCompte: vise.idCompte, role: membre.role },
    };
  });
}
