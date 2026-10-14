// Autorisation des documents synchronisés (F-012-AC5 à AC9, AC12 à AC15, H6, H14) : la décision
// d'ouverture, prise à chaque ouverture par le module d'autorisation de F-011, et la réévaluation des
// ouvertures vivantes, sur signal du module des adhésions ou par la revérification périodique.
import {
  nomDeDocument,
  schemaNomDeDocument,
  type DocumentNomme,
  type Role,
} from "@notionlike/contrats";
import type { Base } from "@notionlike/db";

import type { ChangementDAdhesion } from "./adhesions.ts";
import { decider, permet } from "./autorisation.ts";
import type { Journal } from "./journal.ts";
import { ouvertesDe, type Connexion } from "./synchro-relais.ts";
import { refus } from "./synchro-stockage.ts";

// Ce que la décision ajoute au contexte d'une ouverture (copié par la bibliothèque pour chacune).
export interface DecisionDOuverture {
  readonly document: DocumentNomme;
  // L'époque des droits du compte sur l'espace au moment de la décision.
  readonly epoque: number;
}

export interface Contexte {
  readonly connexion: Connexion;
  readonly ouverture?: DecisionDOuverture;
}

// Ce que le module voit d'une ouverture de la bibliothèque (`Connection`).
export interface OuvertureVivante {
  readonly context: Contexte;
  readOnly: boolean;
  close(evenement: { code: number; reason: string }): void;
}

const FERMETURE_D_OUVERTURE = 1000;

interface Dependances {
  readonly base: Base;
  readonly journal: Journal;
  readonly documentsParConnexion: number;
  // Les ouvertures vivantes de la bibliothèque, tous documents confondus.
  ouvertures(): Iterable<OuvertureVivante>;
}

export interface Acces {
  decider(
    nom: string,
    contexte: Contexte,
    accorder: (lectureSeule: boolean) => void,
  ): Promise<{
    ouverture: DecisionDOuverture;
  }>;
  // Une ouverture établie après un changement de droits survenu pendant sa décision est refermée.
  verifierLEtablissement(ouverture: OuvertureVivante): void;
  surChangementDAdhesion(changement: ChangementDAdhesion): void;
  reverifier(connexion: Connexion): Promise<void>;
}

function cleDesDroits(idEspace: string, idCompte: string): string {
  return `${idEspace} ${idCompte}`;
}

export function creerAcces(dependances: Dependances): Acces {
  const { base, journal } = dependances;
  const epoques = new Map<string, number>();

  function epoqueDe(idEspace: string, idCompte: string): number {
    return epoques.get(cleDesDroits(idEspace, idCompte)) ?? 0;
  }

  function fermer(ouverture: OuvertureVivante, motif: string): void {
    const { connexion, ouverture: decision } = ouverture.context;
    journal.evenementDeSynchro({
      type: "acces-retire",
      adresse: connexion.adresse,
      idCompte: connexion.idCompte,
      document: decision === undefined ? undefined : nomDeDocument(decision.document),
      motif,
    });
    ouverture.close({ code: FERMETURE_D_OUVERTURE, reason: motif });
  }

  // F-012-AC13, H14 : la lecture seule d'abord, sur l'ouverture vivante, puis la fermeture qui
  // avertit le client ; une promotion ferme sans jamais accorder l'écriture à l'ouverture vivante.
  function changerLeDroit(ouverture: OuvertureVivante, peutEcrire: boolean): void {
    if (!peutEcrire) {
      ouverture.readOnly = true;
    }
    fermer(ouverture, "droits-modifies");
  }

  function* ouverturesDu(idEspace: string, idCompte: string): Generator<OuvertureVivante> {
    for (const ouverture of dependances.ouvertures()) {
      const { connexion, ouverture: decision } = ouverture.context;
      if (decision?.document.idEspace === idEspace && connexion.idCompte === idCompte) {
        yield ouverture;
      }
    }
  }

  function refuser(connexion: Connexion, nom: string, motif: string): never {
    journal.evenementDeSynchro({
      type: "ouverture-refusee",
      adresse: connexion.adresse,
      idCompte: connexion.idCompte,
      document: nom,
      motif,
    });
    throw refus(motif);
  }

  async function reverifierLOuverture(ouverture: OuvertureVivante): Promise<void> {
    const { connexion, ouverture: decision } = ouverture.context;
    if (decision === undefined) {
      return;
    }
    let ecrit: boolean | undefined;
    try {
      const issue = await decider(base, {
        idEspace: decision.document.idEspace,
        idCompte: connexion.idCompte,
        action: "ecrire-contenu",
      });
      ecrit = issue.issue === "introuvable" ? undefined : issue.issue === "autorisee";
    } catch {
      fermer(ouverture, "erreur-interne");
      return;
    }
    if (ecrit === undefined) {
      fermer(ouverture, "acces-refuse");
    } else if (ecrit === ouverture.readOnly) {
      changerLeDroit(ouverture, ecrit);
    }
  }

  return {
    async decider(nom, { connexion }, accorder) {
      const lu = schemaNomDeDocument.safeParse(nom);
      if (!lu.success) {
        return refuser(connexion, nom, "nom-de-document-invalide");
      }
      if (ouvertesDe(connexion) + connexion.accordeesEnVol >= dependances.documentsParConnexion) {
        return refuser(connexion, nom, "quota-atteint");
      }
      const { idEspace } = lu.data;
      const epoque = epoqueDe(idEspace, connexion.idCompte);
      let decision: Awaited<ReturnType<typeof decider>>;
      try {
        decision = await decider(base, {
          idEspace,
          idCompte: connexion.idCompte,
          action: "lire-contenu",
        });
      } catch (erreur) {
        journal.evenementDeSynchro({
          type: "ouverture-refusee",
          adresse: connexion.adresse,
          idCompte: connexion.idCompte,
          document: nom,
          motif: "erreur-interne",
          erreur,
        });
        throw refus("erreur-interne");
      }
      if (decision.issue !== "autorisee" || connexion.fermee) {
        return refuser(connexion, nom, "acces-refuse");
      }
      accorder(!permet(decision.adhesion.role, "ecrire-contenu"));
      connexion.accordeesEnVol += 1;
      return { ouverture: { document: lu.data, epoque } };
    },
    verifierLEtablissement(ouverture) {
      const { connexion, ouverture: decision } = ouverture.context;
      if (decision === undefined) {
        return;
      }
      if (epoqueDe(decision.document.idEspace, connexion.idCompte) !== decision.epoque) {
        fermer(ouverture, "droits-modifies");
      }
    },
    // F-012-AC12, AC13 : appelé dans le même tour que le signal. Un changement entre `editeur` et
    // `proprietaire` ne change pas le droit sur le contenu et ne ferme rien.
    surChangementDAdhesion(changement) {
      if (changement.type === "creee") {
        return;
      }
      const { idEspace, idCompte } = changement;
      const peutEcrire = (role: Role) => permet(role, "ecrire-contenu");
      if (changement.type === "role-change") {
        const apres = peutEcrire(changement.role);
        if (apres === peutEcrire(changement.roleAvant)) {
          return;
        }
        epoques.set(cleDesDroits(idEspace, idCompte), epoqueDe(idEspace, idCompte) + 1);
        for (const ouverture of [...ouverturesDu(idEspace, idCompte)]) {
          changerLeDroit(ouverture, apres);
        }
        return;
      }
      epoques.set(cleDesDroits(idEspace, idCompte), epoqueDe(idEspace, idCompte) + 1);
      for (const ouverture of [...ouverturesDu(idEspace, idCompte)]) {
        fermer(ouverture, "acces-refuse");
      }
    },
    // F-012-AC14, AC15 : le filet. La session d'abord : sans elle, la connexion entière est fermée
    // par l'appelant ; puis le rôle sur l'espace de chaque ouverture de la connexion.
    async reverifier(connexion) {
      const siennes = [...dependances.ouvertures()].filter(
        (ouverture) => ouverture.context.connexion === connexion,
      );
      for (const ouverture of siennes) {
        await reverifierLOuverture(ouverture);
      }
    },
  };
}
