// Écritures d'adhésion (F-011-AC32) : le seul module du serveur qui crée, change ou supprime une
// adhésion. Chaque changement validé en base est signalé aux abonnés du processus (F-012 s'y
// abonnera pour couper les connexions d'un membre retiré).
import type { Role } from "@notionlike/contrats";
import {
  accepterInvitation,
  changerRole,
  creerEspace,
  retirerMembre,
  supprimerEspace,
  type Acceptation,
  type AdhesionSupprimee,
  type Base,
  type CreationEspace,
  type IssueAcceptation,
  type IssueChangementDeRole,
  type IssueCreationEspace,
  type IssueRetrait,
  type MembreVise,
} from "@notionlike/db";

import type { Journal } from "./journal.ts";

export type ChangementDAdhesion =
  | {
      readonly type: "creee";
      readonly idEspace: string;
      readonly idCompte: string;
      readonly role: Role;
    }
  | {
      readonly type: "role-change";
      readonly idEspace: string;
      readonly idCompte: string;
      readonly role: Role;
      readonly roleAvant: Role;
    }
  | {
      readonly type: "supprimee";
      readonly idEspace: string;
      readonly idCompte: string;
      readonly role: Role;
    };

type Abonne = (changement: ChangementDAdhesion) => void | Promise<void>;

export interface Adhesions {
  creerEspace(creation: CreationEspace): Promise<IssueCreationEspace>;
  supprimerEspace(idEspace: string): Promise<AdhesionSupprimee[] | undefined>;
  changerRole(vise: MembreVise & { readonly role: Role }): Promise<IssueChangementDeRole>;
  retirerMembre(vise: MembreVise): Promise<IssueRetrait>;
  accepterInvitation(acceptation: Acceptation): Promise<IssueAcceptation>;
  abonner(abonne: Abonne): void;
}

function supprimee(adhesion: AdhesionSupprimee): ChangementDAdhesion {
  return { type: "supprimee", ...adhesion };
}

export function creerAdhesions(base: Base, journal: Journal): Adhesions {
  const abonnes: Abonne[] = [];

  // Un abonné qui échoue n'empêche ni les autres d'être prévenus ni l'écriture de tenir.
  async function prevenir(changements: readonly ChangementDAdhesion[]): Promise<void> {
    await Promise.all(
      changements.flatMap((changement) =>
        abonnes.map(async (abonne) => {
          try {
            await abonne(changement);
          } catch (erreur) {
            journal.echecSansDonnee("abonne-en-echec", erreur);
          }
        }),
      ),
    );
  }

  return {
    async creerEspace(creation) {
      const issue = await creerEspace(base.db, creation);
      if (issue.issue === "cree") {
        const { idEspace, role } = issue.espace;
        await prevenir([{ type: "creee", idEspace, idCompte: creation.idCompte, role }]);
      }
      return issue;
    },
    async supprimerEspace(idEspace) {
      const supprimees = await supprimerEspace(base.db, idEspace);
      await prevenir((supprimees ?? []).map(supprimee));
      return supprimees;
    },
    async changerRole(vise) {
      const issue = await changerRole(base.db, vise);
      if (issue.issue === "fait") {
        const { idEspace, idCompte, role } = vise;
        await prevenir([
          { type: "role-change", idEspace, idCompte, role, roleAvant: issue.roleAvant },
        ]);
      }
      return issue;
    },
    async retirerMembre(vise) {
      const issue = await retirerMembre(base.db, vise);
      if (issue.issue === "fait") {
        await prevenir([supprimee(issue.adhesion)]);
      }
      return issue;
    },
    async accepterInvitation(acceptation) {
      const issue = await accepterInvitation(base.db, acceptation);
      if (issue.issue === "acceptee") {
        const { idEspace, role } = issue.espace;
        await prevenir([{ type: "creee", idEspace, idCompte: acceptation.idCompte, role }]);
      }
      return issue;
    },
    abonner: (abonne) => {
      abonnes.push(abonne);
    },
  };
}
