// Autorisation des documents synchronisés (F-012-AC5 à AC9, AC12 à AC15, H6, H14) : la décision
// d'ouverture, prise à chaque ouverture par le module d'autorisation de F-011, et la réévaluation des
// ouvertures vivantes, sur signal du module des adhésions ou par la revérification périodique.
import {
  LONGUEUR_MAX_DU_NOM_DE_DOCUMENT,
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

export const FERMETURE_D_OUVERTURE = 1000;

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
  reverifier(connexions: ReadonlySet<Connexion>): Promise<void>;
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

  function fermer(ouverture: OuvertureVivante, motif: string, erreur?: unknown): void {
    const { connexion, ouverture: decision } = ouverture.context;
    journal.evenementDeSynchro({
      type: "acces-retire",
      adresse: connexion.adresse,
      idCompte: connexion.idCompte,
      document: decision === undefined ? undefined : nomDeDocument(decision.document),
      motif,
      erreur,
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

  // Le nom d'un refus est écrit au plus sur la longueur d'un nom conforme (F-012-AC26).
  function refuser(connexion: Connexion, nom: string, motif: string, erreur?: unknown): never {
    journal.evenementDeSynchro({
      type: "ouverture-refusee",
      adresse: connexion.adresse,
      idCompte: connexion.idCompte,
      document:
        nom.length > LONGUEUR_MAX_DU_NOM_DE_DOCUMENT
          ? `${nom.slice(0, LONGUEUR_MAX_DU_NOM_DE_DOCUMENT)}…`
          : nom,
      motif,
      erreur,
    });
    throw refus(motif);
  }

  // Le droit d'écrire du compte sur l'espace : vrai, faux, ou `undefined` pour un non-membre.
  async function droitDEcrire(idEspace: string, idCompte: string): Promise<boolean | undefined> {
    const issue = await decider(base, { idEspace, idCompte, action: "ecrire-contenu" });
    return issue.issue === "introuvable" ? undefined : issue.issue === "autorisee";
  }

  function appliquer(ouverture: OuvertureVivante, ecrit: boolean | undefined): void {
    if (ecrit === undefined) {
      fermer(ouverture, "acces-refuse");
    } else if (ecrit === ouverture.readOnly) {
      changerLeDroit(ouverture, ecrit);
    }
  }

  // Une lecture par espace et par compte ; son issue vaut pour chaque ouverture du groupe.
  async function reverifierLeGroupe(groupe: readonly OuvertureVivante[]): Promise<void> {
    const [premiere] = groupe;
    const decision = premiere?.context.ouverture;
    if (premiere === undefined || decision === undefined) {
      return;
    }
    try {
      const ecrit = await droitDEcrire(
        decision.document.idEspace,
        premiere.context.connexion.idCompte,
      );
      for (const ouverture of groupe) {
        appliquer(ouverture, ecrit);
      }
    } catch (erreur) {
      for (const ouverture of groupe) {
        fermer(ouverture, "erreur-interne", erreur);
      }
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
      // F-012-AC24 : la place est réservée avant toute attente, rendue sur refus ou erreur ; un
      // accord la garde jusqu'à son envoi, que le relais observe.
      connexion.accordeesEnVol += 1;
      const rendre = (): void => {
        connexion.accordeesEnVol = Math.max(0, connexion.accordeesEnVol - 1);
      };
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
        rendre();
        return refuser(connexion, nom, "erreur-interne", erreur);
      }
      if (decision.issue !== "autorisee" || connexion.fermee) {
        rendre();
        return refuser(connexion, nom, "acces-refuse");
      }
      accorder(!permet(decision.adhesion.role, "ecrire-contenu"));
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
    // F-012-AC14, AC15 : le filet, pour les connexions dont la session vit encore. Les ouvertures
    // sont groupées par espace et par compte : une seule lecture du rôle par groupe.
    async reverifier(connexions) {
      const groupes = new Map<string, OuvertureVivante[]>();
      for (const ouverture of dependances.ouvertures()) {
        const { connexion, ouverture: decision } = ouverture.context;
        if (decision !== undefined && connexions.has(connexion)) {
          const cle = cleDesDroits(decision.document.idEspace, connexion.idCompte);
          groupes.set(cle, [...(groupes.get(cle) ?? []), ouverture]);
        }
      }
      await Promise.all([...groupes.values()].map(reverifierLeGroupe));
    },
  };
}
