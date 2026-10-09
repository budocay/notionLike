// État d'une persistance et cadence de ses tentatives (ADR-0008, F-030). Une tentative est une
// ouverture complète de la base, sous une échéance qui couvre jusqu'à la preuve d'écriture ; la
// première est l'ouverture elle-même. La coupure n'est pas définitive : après chaque tentative qui
// échoue ou qui est abandonnée, une autre est lancée. Seul l'état fermé est définitif.
export type EtatPersistance = "relecture" | "active" | "coupee" | "fermee";

const ECHEANCE_D_UNE_TENTATIVE_MS = 10_000;
const PREMIERE_ATTENTE_MS = 2_000;
const ATTENTE_PLAFOND_MS = 60_000;
const INTERVALLE_MINIMAL_MS = 1_000;

const SIGNALEMENT_DE_L_ABONNE_FAUTIF =
  "@notionlike/web : un abonné d'une persistance a levé pendant la diffusion d'un changement d'état.";

/** Ce qu'une tentative reçoit pour avancer, et pour dire son issue. */
export interface Tentative {
  /** Faux dès que la tentative a abouti, échoué, ou a été abandonnée. */
  attendue(): boolean;
  /** La tentative échoue ; ou, après qu'elle a abouti, ce qu'elle a ouvert tombe en panne. */
  echouer(): void;
  /** La preuve d'écriture est faite : la persistance devient active. */
  aboutir(): void;
  /** À appeler quand la tentative échoue ou est abandonnée, ou quand ce qu'elle a ouvert s'arrête. */
  aLArret(arreter: () => void): void;
}

type Minuterie = ReturnType<typeof setTimeout>;

export class Suivi {
  #etat: EtatPersistance = "relecture";
  readonly #abonnes = new Set<() => void>();
  readonly #tenter: (tentative: Tentative) => void;
  /** Jeton de la tentative en cours ; puis, quand elle a abouti, de ce qu'elle a ouvert. */
  #enCours: object | undefined;
  #ouverte: object | undefined;
  #arrets: (() => void)[] = [];
  #echeance: Minuterie | undefined;
  #attente: Minuterie | undefined;
  #prochaineAttente = PREMIERE_ATTENTE_MS;
  #dernierLancement = 0;

  constructor(tenter: (tentative: Tentative) => void) {
    this.#tenter = tenter;
  }

  readonly lireEtat = (): EtatPersistance => this.#etat;

  readonly abonner = (rappel: () => void): (() => void) => {
    const notifier = (): void => rappel();
    this.#abonnes.add(notifier);
    return () => void this.#abonnes.delete(notifier);
  };

  readonly lancer = (): void => {
    const jeton = {};
    this.#enCours = jeton;
    this.#attente = undefined;
    this.#dernierLancement = Date.now();
    this.#echeance = setTimeout(() => this.#conclure(jeton, false), ECHEANCE_D_UNE_TENTATIVE_MS);
    this.#tenter({
      attendue: () => this.#enCours === jeton,
      echouer: () => this.#surEchec(jeton),
      aboutir: () => this.#conclure(jeton, true),
      aLArret: (arreter) => this.#aLArret(jeton, arreter),
    });
  };

  /** Tentative immédiate (F-030-AC2) : une par seconde au plus, jamais pendant une autre. */
  readonly reessayer = (): void => {
    const tropTot = Date.now() - this.#dernierLancement < INTERVALLE_MINIMAL_MS;
    if (this.#etat !== "coupee" || this.#enCours !== undefined || tropTot) {
      return;
    }
    clearTimeout(this.#attente);
    this.lancer();
  };

  readonly fermer = (): void => {
    if (this.#etat === "fermee") {
      return;
    }
    clearTimeout(this.#echeance);
    clearTimeout(this.#attente);
    this.#enCours = undefined;
    this.#ouverte = undefined;
    this.#arreter();
    this.#passerA("fermee");
  };

  #aLArret(jeton: object, arreter: () => void): void {
    if (this.#enCours === jeton) {
      this.#arrets.push(arreter);
    } else {
      arreter();
    }
  }

  #arreter(): void {
    this.#arrets.splice(0).forEach((arreter) => arreter());
  }

  #surEchec(jeton: object): void {
    if (this.#enCours === jeton) {
      this.#conclure(jeton, false);
    } else if (this.#ouverte === jeton) {
      this.#ouverte = undefined;
      this.#couper();
    }
  }

  #conclure(jeton: object, reussie: boolean): void {
    if (this.#enCours !== jeton) {
      return;
    }
    this.#enCours = undefined;
    clearTimeout(this.#echeance);
    if (reussie) {
      this.#ouverte = jeton;
      this.#prochaineAttente = PREMIERE_ATTENTE_MS;
      this.#passerA("active");
    } else {
      this.#couper();
    }
  }

  // L'instance en panne est détruite, jamais réutilisée (F-030 H12) ; la tentative suivante est
  // armée avant de prévenir les abonnés : l'un d'eux peut fermer la persistance, ce qui la désarme.
  #couper(): void {
    this.#arreter();
    this.#attente = setTimeout(this.lancer, this.#prochaineAttente);
    this.#prochaineAttente = Math.min(this.#prochaineAttente * 2, ATTENTE_PLAFOND_MS);
    this.#passerA("coupee");
  }

  #passerA(suivant: Exclude<EtatPersistance, "relecture">): void {
    if (this.#etat === suivant) {
      return;
    }
    this.#etat = suivant;
    this.#diffuser();
  }

  // Un abonné qui lève ne prive pas les suivants et ne remonte ni dans un gestionnaire d'IndexedDB,
  // ni dans une minuterie, ni par `fermer()` ou `reessayer()` (F-030-AC25). La copie tient à
  // l'écart les abonnés inscrits pendant la diffusion ; le test d'appartenance, ceux qu'un rappel
  // précédent vient de désabonner.
  #diffuser(): void {
    for (const notifier of [...this.#abonnes]) {
      if (this.#abonnes.has(notifier)) {
        try {
          notifier();
        } catch (exception) {
          console.error(SIGNALEMENT_DE_L_ABONNE_FAUTIF, exception);
        }
      }
    }
  }
}
