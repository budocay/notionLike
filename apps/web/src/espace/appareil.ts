// Magasin de l'appareil (F-032) : ce que l'onglet sait des espaces de l'appareil, lu dans la base de
// l'appareil par la persistance et tenu à jour entre les onglets du même navigateur (AC22). Rien
// n'y est jamais rejeté ni levé (AC31) : chaque opération de la persistance a son échéance de
// 10 secondes et rend son issue d'échec ; le canal entre onglets n'est qu'un signal de relecture.
import {
  ajouterALAppareil,
  type Droit,
  type EntreeDuRegistre,
  inscrireLEspaceRetenu,
  type IssueDuRetrait,
  type LectureDeLAppareil,
  lireLAppareil,
  noterLesNoms,
  releverLaBase,
  retirerLaMarque,
} from "../persistance/index.ts";
import { arborescenceDuTemoin } from "./garde-version.ts";

export type { Droit, EntreeDuRegistre, IssueDuRetrait };

/** Canal entre onglets du magasin : une écriture faite ici fait relire les autres onglets. */
export const CANAL_DE_L_APPAREIL = "espaces-de-l-appareil";

/** Le canal entre onglets, tel que `BroadcastChannel` le donne. */
export interface CanalDeLAppareil {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((evenement: MessageEvent) => void) | null;
}

/** Un espace de l'appareil, avec ce que l'appareil retient de lui. */
export interface EspaceDeLAppareil {
  readonly idEspace: string;
  /** Son entrée au registre ; absente pour l'espace de l'appareil `local` (F-013). */
  readonly entree: EntreeDuRegistre | undefined;
  /**
   * Dernier nom connu (F-032-AC3) : celui reçu dans l'onglet en dernier, sinon celui que l'appareil
   * a retenu ; sa forme est jugée par qui l'affiche.
   */
  readonly nom: string | undefined;
  /** Vrai : la marque de première synchronisation est présente (F-032-AC8). */
  readonly marque: boolean;
}

export interface EtatDeLAppareil {
  /** Faux tant qu'aucune lecture de la base de l'appareil n'a abouti dans l'onglet. */
  readonly lu: boolean;
  /** L'espace de l'appareil, quand la base de l'appareil a dit son identifiant. */
  readonly espaceDeLAppareil: EspaceDeLAppareil | undefined;
  /** Les autres espaces de l'appareil, inscrits au registre, dans l'ordre de leurs clés. */
  readonly autres: readonly EspaceDeLAppareil[];
  /** L'espace retenu ; absent : l'espace de l'appareil (F-032-AC17, retouche R1). */
  readonly retenu: string | undefined;
}

/** Retire un espace de l'appareil (F-032-AC20) : fourni par la synchronisation, par l'entrée. */
export type FonctionDeRetrait = (idEspace: string) => Promise<IssueDuRetrait>;

export interface MagasinDeLAppareil {
  lireEtat(): EtatDeLAppareil;
  abonner(rappel: () => void): () => void;
  /** Relit la base de l'appareil ; rend l'état qui en résulte. Jamais rejetée. */
  relire(): Promise<EtatDeLAppareil>;
  /** Ajout à l'appareil (F-032-AC5) : entrée, nom et marque ; vrai si c'est inscrit. */
  ajouter(idEspace: string, entree: EntreeDuRegistre, nom: string): Promise<boolean>;
  /**
   * Noms rendus par le serveur (F-032-AC3) : montrés tout de suite dans l'onglet pour les espaces de
   * l'appareil, puis inscrits sans attendre, sans avertissement ni nouvel essai.
   */
  noterLesNoms(noms: ReadonlyMap<string, string>): void;
  /** Retire la marque de première synchronisation (F-032-AC8). Jamais rejetée. */
  retirerLaMarque(idEspace: string): Promise<void>;
  /**
   * Inscrit l'espace retenu ; `undefined` le retire (F-032-AC17). Rend vrai si c'est fait ; un
   * échec ou une échéance ne changent rien dans l'onglet.
   */
  retenir(idEspace: string | undefined): Promise<boolean>;
  /** Retire un espace de l'appareil qui n'est pas l'espace de l'appareil (F-032-AC20). */
  retirer(idEspace: string): Promise<IssueDuRetrait>;
  /** Fait relire les autres onglets (F-032-AC21, AC22) ; sans effet une fois fermé. */
  prevenir(): void;
  /** Ferme le canal et oublie les abonnés ; sans effet la seconde fois. */
  fermer(): void;
}

export interface DependancesDuMagasin {
  /** Ouvre le canal entre onglets ; absent, l'onglet ne prévient ni n'est prévenu. */
  readonly ouvrirUnCanal?: ((nom: string) => CanalDeLAppareil) | undefined;
  /** Absent : aucun retrait possible, chaque demande rend un échec. */
  readonly retirerDeLAppareil?: FonctionDeRetrait | undefined;
}

const SIGNALEMENT_D_UN_ABONNE =
  "@notionlike/web : un abonné du magasin de l'appareil a levé pendant la diffusion d'un changement.";

const NON_LU: EtatDeLAppareil = {
  lu: false,
  espaceDeLAppareil: undefined,
  autres: [],
  retenu: undefined,
};

type MessageDuMagasin = { readonly sorte: "change" };
const CHANGE: MessageDuMagasin = { sorte: "change" };

export function ouvrirLeMagasinDeLAppareil(
  dependances: DependancesDuMagasin = {},
): MagasinDeLAppareil {
  return new Magasin(dependances).exposer();
}

class Magasin {
  readonly #dependances: DependancesDuMagasin;
  readonly #abonnes = new Set<() => void>();
  /** Noms reçus dans l'onglet dont l'inscription n'a pas (encore) abouti (F-032-AC3). */
  readonly #nomsRecus = new Map<string, string>();
  #lecture: LectureDeLAppareil | undefined;
  #etat: EtatDeLAppareil = NON_LU;
  #canal: CanalDeLAppareil | undefined;
  #numeroDeLecture = 0;
  #fermee = false;

  constructor(dependances: DependancesDuMagasin) {
    this.#dependances = dependances;
    try {
      const canal = dependances.ouvrirUnCanal?.(CANAL_DE_L_APPAREIL);
      if (canal !== undefined) {
        canal.onmessage = (evenement) => this.#surMessage(evenement.data);
      }
      this.#canal = canal;
    } catch {
      this.#canal = undefined;
    }
  }

  exposer(): MagasinDeLAppareil {
    return {
      lireEtat: () => this.#etat,
      abonner: this.#abonner,
      relire: this.#relire,
      ajouter: this.#ajouter,
      noterLesNoms: this.#noterLesNoms,
      retirerLaMarque: this.#retirerLaMarque,
      retenir: this.#retenir,
      retirer: this.#retirer,
      prevenir: this.#prevenir,
      fermer: this.#fermer,
    };
  }

  readonly #abonner = (rappel: () => void): (() => void) => {
    if (this.#fermee) {
      return () => undefined;
    }
    const notifier = (): void => rappel();
    this.#abonnes.add(notifier);
    return () => void this.#abonnes.delete(notifier);
  };

  // Seule la dernière lecture demandée fait foi : une lecture plus ancienne qui finit après elle
  // ne remplace pas ce qu'elle a lu. Une lecture en échec garde ce qui a été lu avant.
  readonly #relire = async (): Promise<EtatDeLAppareil> => {
    this.#numeroDeLecture += 1;
    const numero = this.#numeroDeLecture;
    const lecture = await lireLAppareil();
    if (!this.#fermee && numero === this.#numeroDeLecture && lecture.issue === "lue") {
      this.#lecture = lecture;
      this.#oublierLesNomsHorsDeLAppareil(lecture);
      this.#recalculer();
    }
    return this.#etat;
  };

  // Un nom reçu avant la première lecture n'est gardé en mémoire que pour un espace de l'appareil.
  #oublierLesNomsHorsDeLAppareil(lecture: Extract<LectureDeLAppareil, { issue: "lue" }>): void {
    const deLAppareil = new Set([
      lecture.idEspaceLocal,
      ...lecture.inscrits.map((un) => un.idEspace),
    ]);
    for (const idEspace of [...this.#nomsRecus.keys()]) {
      if (!deLAppareil.has(idEspace)) {
        this.#nomsRecus.delete(idEspace);
      }
    }
  }

  readonly #ajouter = async (
    idEspace: string,
    entree: EntreeDuRegistre,
    nom: string,
  ): Promise<boolean> => {
    const inscrit = await ajouterALAppareil(idEspace, entree, nom);
    if (inscrit) {
      this.#nomsRecus.delete(idEspace);
      await this.#apresUneEcriture();
    }
    return inscrit;
  };

  readonly #noterLesNoms = (noms: ReadonlyMap<string, string>): void => {
    // Avant la première lecture, rien ne dit quels espaces sont de l'appareil : la persistance
    // n'inscrit que ceux qui ont une entrée au registre, relue dans sa transaction.
    const deLAppareil = this.#etat.lu
      ? [...noms].filter(([idEspace]) => this.#estDeLAppareil(idEspace))
      : [...noms];
    if (this.#fermee || deLAppareil.length === 0) {
      return;
    }
    deLAppareil.forEach(([idEspace, nom]) => this.#nomsRecus.set(idEspace, nom));
    this.#recalculer();
    void noterLesNoms(new Map(deLAppareil)).then(async (inscrits) => {
      if (!inscrits) {
        return;
      }
      // Un nom reçu depuis reste montré tel quel : seul celui qui vient d'être inscrit cède la place
      // à la valeur relue.
      deLAppareil.forEach(([idEspace, nom]) => {
        if (this.#nomsRecus.get(idEspace) === nom) {
          this.#nomsRecus.delete(idEspace);
        }
      });
      await this.#apresUneEcriture();
    });
  };

  readonly #retirerLaMarque = async (idEspace: string): Promise<void> => {
    if (await retirerLaMarque(idEspace)) {
      await this.#apresUneEcriture();
    }
  };

  readonly #retenir = async (idEspace: string | undefined): Promise<boolean> => {
    const inscrit = await inscrireLEspaceRetenu(idEspace);
    if (inscrit && !this.#fermee && this.#lecture?.issue === "lue") {
      this.#lecture = { ...this.#lecture, retenu: idEspace };
      this.#recalculer();
    }
    return inscrit;
  };

  readonly #retirer = async (idEspace: string): Promise<IssueDuRetrait> => {
    const { retirerDeLAppareil } = this.#dependances;
    if (retirerDeLAppareil === undefined || idEspace === this.#etat.espaceDeLAppareil?.idEspace) {
      return "echec";
    }
    let issue: IssueDuRetrait;
    try {
      issue = await retirerDeLAppareil(idEspace);
    } catch {
      issue = "echec";
    }
    this.#nomsRecus.delete(idEspace);
    // L'entrée est retirée même quand un effacement échoue (F-032-AC20) : la liste se relit.
    await this.#apresUneEcriture();
    return issue;
  };

  readonly #prevenir = (): void => {
    if (this.#fermee) {
      return;
    }
    // Un envoi sur un canal fermé lève de façon synchrone (veille F-032, point 7).
    try {
      this.#canal?.postMessage(CHANGE);
    } catch {
      return;
    }
  };

  readonly #fermer = (): void => {
    if (this.#fermee) {
      return;
    }
    this.#fermee = true;
    this.#abonnes.clear();
    const canal = this.#canal;
    this.#canal = undefined;
    try {
      canal?.close();
    } catch {
      return;
    }
  };

  async #apresUneEcriture(): Promise<void> {
    this.#prevenir();
    await this.#relire();
  }

  #surMessage(donnee: unknown): void {
    if (!this.#fermee && (donnee as Partial<MessageDuMagasin> | null)?.sorte === "change") {
      void this.#relire();
    }
  }

  #estDeLAppareil(idEspace: string): boolean {
    const { espaceDeLAppareil, autres } = this.#etat;
    return (
      espaceDeLAppareil?.idEspace === idEspace ||
      autres.some((espace) => espace.idEspace === idEspace)
    );
  }

  #recalculer(): void {
    if (this.#fermee) {
      return;
    }
    this.#etat = etatDe(this.#lecture, this.#nomsRecus);
    for (const notifier of [...this.#abonnes]) {
      try {
        notifier();
      } catch (exception) {
        console.error(SIGNALEMENT_D_UN_ABONNE, exception);
      }
    }
  }
}

function etatDe(
  lecture: LectureDeLAppareil | undefined,
  nomsRecus: ReadonlyMap<string, string>,
): EtatDeLAppareil {
  if (lecture?.issue !== "lue") {
    return NON_LU;
  }
  const { idEspaceLocal, inscrits, retenu } = lecture;
  const espaces = inscrits.map(({ idEspace, entree, nom, marque }): EspaceDeLAppareil => ({
    idEspace,
    entree,
    nom: nomsRecus.get(idEspace) ?? nom,
    marque,
  }));
  const inscritLocal = espaces.find((espace) => espace.idEspace === idEspaceLocal);
  const espaceDeLAppareil =
    idEspaceLocal === undefined
      ? undefined
      : (inscritLocal ?? {
          idEspace: idEspaceLocal,
          entree: undefined,
          nom: undefined,
          marque: false,
        });
  return {
    lu: true,
    espaceDeLAppareil,
    autres: espaces.filter((espace) => espace.idEspace !== idEspaceLocal),
    retenu,
  };
}

/**
 * Le droit que le registre donne à un espace de l'appareil ; `undefined` : l'espace de l'appareil.
 * Rend `undefined` pour un espace qui n'a pas d'entrée.
 */
export function droitInscrit(
  etat: EtatDeLAppareil,
  idEspace: string | undefined,
): Droit | undefined {
  if (idEspace === undefined) {
    return etat.espaceDeLAppareil?.entree?.droit;
  }
  return etat.autres.find((espace) => espace.idEspace === idEspace)?.entree?.droit;
}

/**
 * Repli du retrait quand le navigateur ne permet pas l'énumération des bases (F-032-AC20, H7, H8) :
 * les identifiants des pages et des tables de l'arborescence et de la corbeille de l'espace, lus
 * dans sa base par un témoin que rien n'affiche, détruit aussitôt. Une base absente, illisible ou
 * d'une version refusée n'en donne aucun : seule la base du document d'espace sera effacée. Jamais
 * rejetée.
 */
export async function lireLesPagesDeLaBase(idEspace: string): Promise<readonly string[]> {
  const temoin = await releverLaBase({ type: "espace", idEspace });
  if (temoin === undefined) {
    return [];
  }
  try {
    const arborescence = arborescenceDuTemoin(temoin);
    if (arborescence === undefined) {
      return [];
    }
    const ids: string[] = [];
    const aVoir = [...arborescence.racines, ...arborescence.corbeille];
    for (const page of aVoir) {
      ids.push(page.id);
      aVoir.push(...page.enfants);
    }
    return ids;
  } catch {
    return [];
  } finally {
    temoin.destroy();
  }
}
