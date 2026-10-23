// Pilote de l'onglet (F-032, ADR-0007) : il tient, hors de React, l'espace ouvert de l'onglet et sa
// session d'espace. Au changement d'espace, tout ce que l'espace quitté tient est fermé avant que
// l'espace choisi soit ouvert, sur un `Y.Doc` neuf (AC14, AC15) ; l'interface est remontée en entier
// sur la génération publiée. Rien n'attend le réseau (AC18) : seule la lecture de la base de
// l'appareil retarde le lancement, sous son échéance de 10 secondes (AC17).
import {
  type Droit,
  droitInscrit,
  type EtatDeLAppareil,
  type MagasinDeLAppareil,
} from "./appareil.ts";
import type { CibleDeSession, SessionEspace } from "./session-espace.ts";

export type { CibleDeSession };

/** L'espace ouvert de l'onglet. */
export interface EspaceOuvertDeLOnglet {
  readonly phase: "ouvert";
  readonly session: SessionEspace;
  readonly cible: CibleDeSession;
  /** Le droit que le registre donnait à l'ouverture ; `undefined` : aucune entrée lue. */
  readonly droit: Droit | undefined;
  /** Change à chaque ouverture : l'interface est remontée sur elle. */
  readonly generation: number;
  /** Le nom à annoncer à l'arrivée (F-032-AC10) ; absent au lancement. */
  readonly arrivee: string | undefined;
}

export type EtatDuPilote = { readonly phase: "chargement" } | EspaceOuvertDeLOnglet;

export interface OptionsDuChangement {
  /** Ferme ce que l'interface tient de l'espace quitté : éditeurs, pages, tables, synchronisation. */
  readonly avant: () => void;
  /** Le nom de l'espace choisi, tel que l'écran l'affiche, pour l'annonce d'arrivée. */
  readonly nom: string;
}

export interface PiloteDeLOnglet {
  lireEtat(): EtatDuPilote;
  abonner(rappel: () => void): () => void;
  /**
   * Changement d'espace (F-032-AC10), synchrone : `avant`, fermeture de la session quittée, session
   * neuve de l'espace choisi, publication ; l'espace retenu est inscrit une fois la session prête.
   * Sans effet pendant le chargement, après la fermeture, ou vers l'espace déjà ouvert.
   */
  changer(cible: CibleDeSession, options: OptionsDuChangement): void;
  /** Ferme la session ouverte et oublie les abonnés ; sans effet la seconde fois. */
  fermer(): void;
}

export interface DependancesDuPilote {
  /** Le démarrage de la session d'espace, injecté par l'entrée (F-002-AC31, F-032-AC32). */
  readonly demarrerSession: (cible: CibleDeSession) => SessionEspace;
  readonly magasin: MagasinDeLAppareil;
}

const CHARGEMENT: EtatDuPilote = { phase: "chargement" };
const ESPACE_DE_L_APPAREIL: CibleDeSession = { sorte: "appareil" };

const SIGNALEMENT_D_UN_ABONNE =
  "@notionlike/web : un abonné du pilote de l'onglet a levé pendant la diffusion d'un changement.";
const SIGNALEMENT_D_UNE_FERMETURE =
  "@notionlike/web : la fermeture de l'espace quitté a levé ; le changement d'espace a lieu quand même.";

export function piloterLOnglet(dependances: DependancesDuPilote): PiloteDeLOnglet {
  return new Pilote(dependances).exposer();
}

class Pilote {
  readonly #dependances: DependancesDuPilote;
  readonly #abonnes = new Set<() => void>();
  #etat: EtatDuPilote = CHARGEMENT;
  #generation = 0;
  #cesserDAttendreLaSession: (() => void) | undefined;
  #fermee = false;

  constructor(dependances: DependancesDuPilote) {
    this.#dependances = dependances;
    this.#lancer();
  }

  exposer(): PiloteDeLOnglet {
    return {
      lireEtat: () => this.#etat,
      abonner: this.#abonner,
      changer: this.#changer,
      fermer: this.#fermer,
    };
  }

  // La session de l'espace de l'appareil démarre tout de suite, et la lecture de l'appareil part
  // dans le même tour : en série, une base de l'appareil qui ne répond pas ferait attendre deux
  // échéances, et F-002-AC24 tomberait (conception, retouche R6).
  #lancer(): void {
    const { demarrerSession, magasin } = this.#dependances;
    const deLAppareil = demarrerSession(ESPACE_DE_L_APPAREIL);
    void magasin.relire().then((lu) => {
      if (this.#fermee) {
        deLAppareil.fermer();
        return;
      }
      const retenu = espaceRetenuOuvrable(lu);
      if (retenu === undefined) {
        this.#ouvrir(deLAppareil, ESPACE_DE_L_APPAREIL, lu, undefined);
        return;
      }
      deLAppareil.fermer();
      const cible: CibleDeSession = { sorte: "ajoute", idEspace: retenu };
      this.#ouvrir(demarrerSession(cible), cible, lu, undefined);
    });
  }

  readonly #changer = (cible: CibleDeSession, { avant, nom }: OptionsDuChangement): void => {
    const ouvert = this.#etat;
    if (this.#fermee || ouvert.phase !== "ouvert" || memeCible(ouvert.cible, cible)) {
      return;
    }
    this.#cesserDAttendreLaSession?.();
    this.#cesserDAttendreLaSession = undefined;
    try {
      avant();
    } catch (exception) {
      console.error(SIGNALEMENT_D_UNE_FERMETURE, exception);
    }
    ouvert.session.fermer();
    const { demarrerSession, magasin } = this.#dependances;
    const session = demarrerSession(cible);
    this.#ouvrir(session, cible, magasin.lireEtat(), nom);
    this.#retenirUneFoisPrete(session, cible);
  };

  readonly #abonner = (rappel: () => void): (() => void) => {
    if (this.#fermee) {
      return () => undefined;
    }
    const notifier = (): void => rappel();
    this.#abonnes.add(notifier);
    return () => void this.#abonnes.delete(notifier);
  };

  readonly #fermer = (): void => {
    if (this.#fermee) {
      return;
    }
    this.#fermee = true;
    this.#cesserDAttendreLaSession?.();
    this.#cesserDAttendreLaSession = undefined;
    if (this.#etat.phase === "ouvert") {
      this.#etat.session.fermer();
    }
    this.#abonnes.clear();
  };

  #ouvrir(
    session: SessionEspace,
    cible: CibleDeSession,
    appareil: EtatDeLAppareil,
    arrivee: string | undefined,
  ): void {
    this.#generation += 1;
    this.#etat = {
      phase: "ouvert",
      session,
      cible,
      droit: droitInscrit(appareil, cible.sorte === "appareil" ? undefined : cible.idEspace),
      generation: this.#generation,
      arrivee,
    };
    for (const notifier of [...this.#abonnes]) {
      try {
        notifier();
      } catch (exception) {
        console.error(SIGNALEMENT_D_UN_ABONNE, exception);
      }
    }
  }

  // L'espace retenu n'est inscrit qu'une fois la session de l'espace choisi prête, son arborescence
  // affichée, en mémoire comprise ; jamais pour un document d'une version non prise en charge, qui
  // laisse l'espace retenu d'avant (F-032-AC17, AC35). L'inscription n'est pas attendue : un échec
  // ou une échéance ne changent rien dans l'onglet.
  #retenirUneFoisPrete(session: SessionEspace, cible: CibleDeSession): void {
    let desabonner: (() => void) | undefined;
    let fini = false;
    const cesser = (): void => {
      fini = true;
      desabonner?.();
      desabonner = undefined;
    };
    const examiner = (): void => {
      if (fini) {
        return;
      }
      const { phase } = session.lireEtat();
      if (phase === "pret") {
        cesser();
        void this.#dependances.magasin.retenir(
          cible.sorte === "appareil" ? undefined : cible.idEspace,
        );
      } else if (phase !== "chargement") {
        cesser();
      }
    };
    desabonner = session.abonner(examiner);
    this.#cesserDAttendreLaSession = cesser;
    examiner();
  }
}

/**
 * L'espace retenu que le lancement ouvre : lisible, UUID canonique (la lecture de l'appareil n'en
 * rend pas d'autre), autre que l'espace de l'appareil et inscrit au registre. Sinon `undefined` :
 * l'espace de l'appareil s'ouvre comme avant F-032 (F-032-AC17).
 */
export function espaceRetenuOuvrable(appareil: EtatDeLAppareil): string | undefined {
  const { retenu, espaceDeLAppareil, autres } = appareil;
  if (
    retenu === undefined ||
    retenu === espaceDeLAppareil?.idEspace ||
    !autres.some((espace) => espace.idEspace === retenu)
  ) {
    return undefined;
  }
  return retenu;
}

/** Vrai si les deux cibles désignent le même espace de l'appareil. */
export function memeCible(une: CibleDeSession, autre: CibleDeSession): boolean {
  if (une.sorte === "appareil" || autre.sorte === "appareil") {
    return une.sorte === autre.sorte;
  }
  return une.idEspace === autre.idEspace;
}
