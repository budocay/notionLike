// Orchestre de la synchronisation d'un espace dans l'onglet (F-013) : registre de l'appareil,
// connexion et sa reprise, document d'espace, page affichée, passe de fond, canal entre onglets,
// état visible. Rien de ce qu'il fait n'est sur le chemin d'une frappe (F-013-AC2) : chaque
// modification est appliquée au document et à sa base avant lui, et sans lui.
import type { HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { LIMITES_SYNCHRO, schemaNomDeDocument } from "@notionlike/contrats";
import type * as Y from "yjs";

import {
  type Droit,
  effacerLesDocuments,
  type EntreeDuRegistre,
  inscrireLEntree,
  lireLEntree,
} from "./stockage.ts";
import {
  declarerLEspace,
  droitDuRole,
  estIntrouvable,
  type IssueDAdoption,
  type ServeurDesEspaces,
} from "./adoption.ts";
import { ORIGINE_DU_CANAL, relierAuCanal } from "./canal.ts";
import { causeDuMotif, conduiteDeConnexion, conduiteDOuverture } from "./conduites.ts";
import { type Connexion, creerConnexion, type Fermeture } from "./connexion.ts";
import { type ContexteDuDocument, DocumentSuivi } from "./document-suivi.ts";
import type { CanalEntreOnglets, Environnement, Signal } from "./environnement.ts";
import {
  type CauseDErreur,
  type DocumentEnErreur,
  etatAffiche,
  type EtatDeSynchronisation,
  type StatutDuCompte,
} from "./etat.ts";
import { effacerLaCopie, type IssueDEffacement as IssueDeLEffacement } from "./stockage.ts";
import { PageSynchronisee, type PageAffichee } from "./page-affichee.ts";
import { type TableAffichee, TableSynchronisee } from "./table-affichee.ts";
import { ecart, type TypeDePage } from "./pages-de-l-espace.ts";
import { lancerLaPasse, type Passe, type Suite } from "./passe-de-fond.ts";
import { ATTENTE_APRES_TROP_DE_REQUETES_MS, creerReprise, type Reprise } from "./reprise.ts";
import { correspondance } from "./noms.ts";

export type { PageAffichee, TableAffichee };

/** Le document affiché que la synchronisation tient : la page de l'éditeur, ou la table (F-018). */
type DocumentAffiche = PageSynchronisee | TableSynchronisee;

/** L'état du compte, tenu par le module de F-010 et lu ici sans rien d'autre que son statut. */
export interface SourceDuCompte {
  lire(): StatutDuCompte;
  abonner(rappel: () => void): () => void;
  reverifier(): Promise<StatutDuCompte>;
}

export interface OptionsDeSynchronisation {
  readonly environnement: Environnement;
  readonly idEspace: string;
  /** Le document de l'espace ouvert, entièrement relu (H14). */
  readonly doc: Y.Doc;
  /**
   * Les pages de l'arborescence et de la corbeille, telles que la session d'espace les lit, seule
   * abonnée de la façade du document (ADR-0007) ; `undefined` si elle ne les lit pas (version).
   */
  readonly lirePages: () => ReadonlySet<string> | undefined;
  /**
   * Le type lu de chaque identifiant de `lirePages` (F-018-AC51, ADR-0019) : une table est échangée
   * sous son document de table. Absent, ou pour un identifiant qu'il ne lit pas : une page.
   */
  readonly typeDe?: ((id: string) => TypeDePage | undefined) | undefined;
  readonly compte: SourceDuCompte;
  readonly serveur: ServeurDesEspaces;
  /**
   * Avant l'effacement des bases des pages et des tables supprimées ailleurs : fermer leurs
   * documents (AC37, F-018-AC53).
   */
  readonly surDocumentsSupprimes?: ((ids: readonly string[]) => void) | undefined;
  /** Un autre onglet efface la copie locale de cet espace (AC24) : tout fermer, puis recharger. */
  readonly surEffacement?: ((etape: "demande" | "faite") => void) | undefined;
}

export interface Synchronisation {
  lireEtat(): EtatDeSynchronisation;
  abonner(rappel: () => void): () => void;
  /** La page affichée, entièrement relue ; `undefined` quand aucune ne l'est. */
  afficherPage(page: PageAffichee | undefined): void;
  /** La table affichée, entièrement relue (F-018-AC51) ; elle prend la place de la page affichée. */
  afficherTable(table: TableAffichee): void;
  /** Plus aucun document affiché, ni page ni table (F-018-AC51). */
  afficherAucun(): void;
  adopter(nom: string): Promise<IssueDAdoption>;
  /** « Réessayer » de la zone : connexion refusée (AC19) ou espace détaché (AC23). */
  reessayer(): void;
  /** « Réessayer » d'un document en envoi bloqué (AC29, AC47) ; `undefined` : l'espace. */
  reessayerLeDocument(idPage: string | undefined): void;
  effacerLaCopieLocale(): Promise<IssueDeLEffacement>;
  /** Vrai : toute modification de l'espace ouvert est acquittée par le serveur (AC49). */
  toutEstAcquitte(): boolean;
  /**
   * Vrai : ce que porte ce document, celui de l'espace ou celui de la page affichée, est acquitté
   * par le serveur (F-013-AC49). Un autre document n'est jamais dit acquitté.
   */
  estAcquitte(doc: Y.Doc): boolean;
  fermer(): void;
}

/** Délai de F-013-AC33 : une modification en attente au-delà ferme la connexion. */
export const ATTENTE_D_ACQUITTEMENT_MS = 30_000;
const PREMIERE_RELECTURE_DU_REGISTRE_MS = 2000;
const RELECTURE_PLAFOND_DU_REGISTRE_MS = 60_000;
const REPRISES_D_UNE_PAGE_PAR_PASSE = 3;
const DEBIT_ORDINAIRE = 0.5;
const DEBIT_RALENTI = 0.25;
const ESPACE = "";

export function demarrerSynchronisation(options: OptionsDeSynchronisation): Synchronisation {
  const orchestre = new Orchestre(options);
  return {
    lireEtat: orchestre.lireEtat,
    abonner: orchestre.abonner,
    afficherPage: orchestre.afficherPage,
    afficherTable: orchestre.afficherTable,
    afficherAucun: orchestre.afficherAucun,
    adopter: orchestre.adopter,
    reessayer: orchestre.reessayer,
    reessayerLeDocument: orchestre.reessayerLeDocument,
    effacerLaCopieLocale: orchestre.effacerLaCopieLocale,
    toutEstAcquitte: orchestre.toutEstAcquitte,
    estAcquitte: orchestre.estAcquitte,
    fermer: orchestre.fermer,
  };
}

interface Registre {
  readonly lu: boolean;
  readonly entree: EntreeDuRegistre | undefined;
}

type MessageDuRegistre = { readonly sorte: "adoption" | "effacement" | "efface" };

class Orchestre {
  readonly #options: OptionsDeSynchronisation;
  readonly #contexte: ContexteDuDocument;
  readonly #espace: DocumentSuivi;
  readonly #connexion: Connexion;
  readonly #reprise: Reprise;
  readonly #abonnes = new Set<() => void>();
  readonly #arrets: (() => void)[] = [];
  readonly #partantes = new Set<DocumentAffiche>();
  readonly #erreursDePasse = new Map<string, CauseDErreur>();
  /** Envois bloqués jusqu'à un geste ou au rechargement, par page ; `""` : le document d'espace. */
  readonly #bloques = new Map<string, CauseDErreur>();
  readonly #divergentesDePasse = new Set<string>();
  readonly #reprisesDePasse = new Map<string, number>();
  #canalDuRegistre: CanalEntreOnglets | undefined;
  #registre: Registre = { lu: false, entree: undefined };
  #relectureDuRegistreMs = PREMIERE_RELECTURE_DU_REGISTRE_MS;
  #annulerLaRelecture: (() => void) | undefined;
  #prise: HocuspocusProviderWebsocket | undefined;
  /** Le document affiché, page ou table (F-018-AC51). */
  #affiche: DocumentAffiche | undefined;
  #passe: Passe | undefined;
  #passeAchevee = false;
  #ids: ReadonlySet<string>;
  #compte: StatutDuCompte;
  #refusDeConnexion = false;
  #detache = false;
  #prudence = false;
  #debit = DEBIT_ORDINAIRE;
  #droitChange: Droit | undefined;
  #verification: Promise<"membre" | "detache" | "sans-issue"> | undefined;
  #annulerLAttente: (() => void) | undefined;
  #etat: EtatDeSynchronisation;
  #empreinte = "";
  #fermee = false;

  constructor(options: OptionsDeSynchronisation) {
    this.#options = options;
    const { environnement, idEspace, doc } = options;
    this.#contexte = {
      prise: () => this.#prise,
      horloge: environnement.horloge,
      alea: () => environnement.alea(),
      verifierLEspace: () => this.#verifierLEspace(),
      surAcquise: (document, droit) => this.#surAcquise(document, droit),
      surChangement: () => this.#publier(),
      blocage: (idPage) => this.#bloques.get(idPage ?? ESPACE),
      noterLeBlocage: (idPage, cause) => {
        if (cause === undefined) {
          this.#bloques.delete(idPage ?? ESPACE);
        } else {
          this.#bloques.set(idPage ?? ESPACE, cause);
        }
      },
    };
    this.#compte = options.compte.lire();
    this.#espace = new DocumentSuivi(
      correspondanceDeLEspace(idEspace),
      undefined,
      doc,
      this.#contexte,
    );
    this.#ids = options.lirePages() ?? new Set();
    this.#connexion = creerConnexion({
      environnement,
      limiteDeMessage: LIMITES_SYNCHRO.octetsParMessage,
      fenetreDesMessagesMs: LIMITES_SYNCHRO.fenetreDesMessagesMs,
      surEtablie: (prise) => this.#surEtablie(prise),
      surFermee: (fermeture) => this.#surFermee(fermeture),
      surMessageTropGrand: (nom) => queueMicrotask(() => this.#surMessageTropGrand(nom)),
    });
    this.#reprise = creerReprise(environnement.horloge, environnement.alea);
    this.#etat = this.#calculer();
    this.#brancher();
    this.#lireLeRegistre();
  }

  readonly lireEtat = (): EtatDeSynchronisation => this.#etat;

  // Le type lu d'un identifiant ; une page par défaut, règle permanente du format (F-018-AC2).
  #typeDe(id: string): TypeDePage {
    return this.#options.typeDe?.(id) ?? "page";
  }

  readonly abonner = (rappel: () => void): (() => void) => {
    if (this.#fermee) {
      return () => undefined;
    }
    const notifier = (): void => rappel();
    this.#abonnes.add(notifier);
    return () => void this.#abonnes.delete(notifier);
  };

  #brancher(): void {
    const { environnement, compte, doc, idEspace } = this.#options;
    // Après les observateurs de la transaction : la session a déjà relu l'arborescence.
    const surMiseAJour = (_maj: Uint8Array, origine: unknown): void => this.#surMiseAJour(origine);
    doc.on("update", surMiseAJour);
    this.#arrets.push(
      () => doc.off("update", surMiseAJour),
      compte.abonner(() => this.#surCompte()),
      environnement.ecouter((signal) => this.#surSignal(signal)),
      relierAuCanal({
        doc,
        nomDeDocument: this.#espace.nom,
        environnement,
        estRecue: (origine) => this.#espace.estRecue(origine),
      }),
    );
    try {
      const canal = environnement.ouvrirUnCanal(`registre:${idEspace}`);
      canal.onmessage = (evenement) => this.#surMessageDuRegistre(evenement.data);
      this.#canalDuRegistre = canal;
    } catch {
      this.#canalDuRegistre = undefined;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Registre de l'appareil (H3, AC4, AC15).

  #lireLeRegistre(): void {
    this.#annulerLaRelecture?.();
    this.#annulerLaRelecture = undefined;
    void lireLEntree(this.#options.idEspace).then((lecture) => {
      if (this.#fermee) {
        return;
      }
      if (lecture.issue === "illisible") {
        // La dernière entrée lue avec succès est gardée (ADR-0014) : un espace déjà lu adopté le
        // reste, avec son droit ; il n'est tenu pour local que si aucune lecture n'a encore abouti
        // dans l'onglet. L'adoption n'est pas proposée, rien n'est inscrit, la lecture est refaite.
        this.#registre = { lu: false, entree: this.#registre.entree };
        this.#programmerLaRelecture();
      } else {
        this.#relectureDuRegistreMs = PREMIERE_RELECTURE_DU_REGISTRE_MS;
        this.#registre = { lu: true, entree: lecture.entree };
      }
      this.#evaluer();
    });
  }

  #programmerLaRelecture(): void {
    const attente = this.#relectureDuRegistreMs;
    this.#relectureDuRegistreMs = Math.min(RELECTURE_PLAFOND_DU_REGISTRE_MS, attente * 2);
    this.#annulerLaRelecture = this.#options.environnement.horloge.programmer(
      () => this.#lireLeRegistre(),
      attente,
    );
  }

  #surMessageDuRegistre(donnee: unknown): void {
    const sorte = (donnee as Partial<MessageDuRegistre> | null)?.sorte;
    if (sorte === "adoption") {
      this.#lireLeRegistre();
    } else if (sorte === "effacement") {
      // Le canal survit à la fermeture : l'onglet doit encore apprendre que l'effacement est fait.
      const canal = this.#canalDuRegistre;
      this.#canalDuRegistre = undefined;
      this.fermer();
      this.#canalDuRegistre = canal;
      this.#options.surEffacement?.("demande");
    } else if (sorte === "efface") {
      this.#canalDuRegistre?.close();
      this.#canalDuRegistre = undefined;
      this.#options.surEffacement?.("faite");
    }
  }

  #diffuserAuxOnglets(message: MessageDuRegistre): void {
    try {
      this.#canalDuRegistre?.postMessage(message);
    } catch {
      return;
    }
  }

  #retenirLeDroit(droit: Droit): void {
    const avant = this.#registre.entree?.droit;
    if (avant === droit) {
      return;
    }
    if (avant !== undefined) {
      this.#droitChange = droit;
    }
    const entree: EntreeDuRegistre = { rattachement: "adopte", droit };
    this.#registre = { lu: true, entree };
    void inscrireLEntree(this.#options.idEspace, entree);
  }

  // ---------------------------------------------------------------------------------------------
  // Connexion (AC7, AC17, AC19 à AC21, AC28, AC33).

  #estActif(): boolean {
    return (
      !this.#fermee &&
      this.#registre.entree !== undefined &&
      !this.#detache &&
      this.#compte !== "deconnecte"
    );
  }

  #evaluer(): void {
    if (!this.#estActif()) {
      this.#reprise.annuler();
      this.#defaireTout();
      this.#connexion.fermer();
      this.#prise = undefined;
    } else if (this.#connexion.etat() === "absente" && !this.#reprise.estProgrammee()) {
      this.#reprise.aussitot(() => this.#tenter());
    }
    this.#publier();
  }

  // Aucune WebSocket tant que le compte n'est pas connecté (AC7) : un compte inconnu est d'abord
  // revérifié, et la tentative suivante est programmée s'il le reste (AC19, AC20).
  #tenter(): void {
    if (!this.#estActif()) {
      return;
    }
    if (this.#compte === "connecte") {
      this.#connexion.tenter();
      this.#publier();
      return;
    }
    void this.#options.compte.reverifier().then((statut) => {
      this.#compte = statut;
      if (!this.#estActif()) {
        this.#evaluer();
      } else if (statut === "connecte") {
        this.#connexion.tenter();
      } else {
        this.#reprise.programmer(() => this.#tenter());
      }
      this.#publier();
    });
  }

  #surCompte(): void {
    const statut = this.#options.compte.lire();
    if (statut === this.#compte) {
      return;
    }
    this.#compte = statut;
    // Un espace détaché est réexaminé à chaque changement d'état du compte (H5).
    this.#detache = false;
    this.#refusDeConnexion = false;
    this.#evaluer();
  }

  #surSignal(signal: Signal): void {
    // Le réseau est perdu : la connexion est tenue pour perdue sans attendre que la WebSocket le
    // dise, et la reprise suit ses délais (F-013-AC20, AC31).
    if (signal === "hors-ligne") {
      if (this.#connexion.etat() !== "absente") {
        this.#connexion.couper();
      }
      return;
    }
    if (this.#estActif() && this.#connexion.etat() === "absente") {
      this.#reprise.aussitot(() => this.#tenter());
    }
  }

  #surEtablie(prise: HocuspocusProviderWebsocket): void {
    this.#prise = prise;
    this.#reprise.reinitialiser();
    this.#refusDeConnexion = false;
    this.#passeAchevee = false;
    if (this.#prudence) {
      this.#avancerEnPrudence();
    } else {
      this.#espace.ouvrir();
      this.#affiche?.suivi.ouvrir();
    }
    this.#publier();
  }

  #surFermee(fermeture: Fermeture): void {
    const suspects = this.#suspects();
    this.#prise = undefined;
    this.#defaireTout();
    if (!this.#estActif()) {
      this.#publier();
      return;
    }
    const conduite =
      fermeture.sorte === "echec"
        ? "revoir-le-compte"
        : conduiteDeConnexion(fermeture.code, fermeture.raison);
    if (conduite === "revoir-le-compte") {
      this.#apresUnEchec();
    } else if (conduite === "ralentir") {
      this.#debit = DEBIT_RALENTI;
      this.#reprise.programmer(() => this.#tenter(), ATTENTE_APRES_TROP_DE_REQUETES_MS);
    } else {
      if (conduite === "prudence") {
        this.#apresUnMessageTropGrand(suspects);
      }
      this.#reprise.programmer(() => this.#tenter());
    }
    this.#publier();
  }

  #apresUnEchec(): void {
    void this.#options.compte.reverifier().then((statut) => {
      this.#compte = statut;
      if (!this.#estActif()) {
        this.#evaluer();
        return;
      }
      this.#refusDeConnexion = statut === "connecte";
      this.#reprise.programmer(() => this.#tenter());
      this.#publier();
    });
  }

  // Filet de F-013-AC28 : après une première fermeture 1009, les documents sont rouverts un à un ;
  // celui dont l'ouverture provoque la seconde n'est plus rouvert avant un geste ou un rechargement.
  #apresUnMessageTropGrand(suspects: readonly string[]): void {
    if (!this.#prudence) {
      this.#prudence = true;
      return;
    }
    for (const nom of suspects) {
      this.#bloquerLeDocument(nom, "trop-volumineux");
    }
  }

  #suspects(): string[] {
    const suivis = [this.#espace, this.#affiche?.suivi].filter(
      (suivi): suivi is DocumentSuivi =>
        suivi !== undefined && (suivi.estEnCoursDOuverture() || suivi.aDesModificationsEnAttente()),
    );
    const pages = this.#passe?.enCours() ?? [];
    return [
      ...suivis.map((suivi) => suivi.nom),
      ...pages.map(
        (id) => correspondance(this.#typeDe(id), this.#options.idEspace, id).nomDeDocument,
      ),
    ];
  }

  #avancerEnPrudence(): void {
    for (const suivi of [this.#espace, this.#affiche?.suivi]) {
      if (suivi === undefined || suivi.erreur()?.reessayable === true) {
        continue;
      }
      if (!suivi.estAcquis() || suivi.aDesModificationsEnAttente()) {
        suivi.ouvrir();
        return;
      }
    }
    this.#lancerLaPasse();
  }

  // Le message n'a pas été émis (AC28) : son document est en envoi bloqué, sans rien perdre.
  #surMessageTropGrand(nom: string | undefined): void {
    if (nom !== undefined && !this.#fermee) {
      this.#bloquerLeDocument(nom, "trop-volumineux");
      this.#publier();
    }
  }

  #bloquerLeDocument(nom: string, cause: CauseDErreur): void {
    const suivi = [this.#espace, this.#affiche?.suivi].find((un) => un?.nom === nom);
    if (suivi !== undefined) {
      suivi.bloquer(cause);
      return;
    }
    const lu = schemaNomDeDocument.safeParse(nom);
    // F-018-AC51 : une table de la passe se bloque comme une page.
    if (lu.success && (lu.data.type === "page" || lu.data.type === "table")) {
      const { idDocument } = lu.data;
      this.#bloques.set(idDocument, cause);
      this.#passe?.oublier([idDocument]);
    }
  }

  #defaireTout(): void {
    this.#annulerLAttente?.();
    this.#annulerLAttente = undefined;
    this.#espace.defaire();
    this.#affiche?.suivi.defaire();
    // Connexion coupée, une page quittée n'attend pas l'accusé : la passe de fond l'enverra (AC17).
    this.#partantes.forEach((partante) => partante.fermer());
    this.#partantes.clear();
    this.#passe?.arreter();
    this.#passe = undefined;
  }

  // AC33 : une modification émise en écriture, en attente 30 secondes, connexion paraissant
  // établie, ferme la connexion ; jamais pour une lecture seule ni une ouverture fermée.
  #surveillerLesAttentes(): void {
    const enAttente =
      this.#connexion.etat() === "etablie" &&
      (this.#espace.aDesModificationsEnAttente() ||
        this.#affiche?.suivi.aDesModificationsEnAttente() === true);
    if (enAttente && this.#annulerLAttente === undefined) {
      this.#annulerLAttente = this.#options.environnement.horloge.programmer(() => {
        this.#annulerLAttente = undefined;
        this.#connexion.couper();
      }, ATTENTE_D_ACQUITTEMENT_MS);
    } else if (!enAttente && this.#annulerLAttente !== undefined) {
      this.#annulerLAttente();
      this.#annulerLAttente = undefined;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Documents : droit, espace détaché, passe de fond (AC5, AC6, AC22, AC25 à AC27, AC37).

  #surAcquise(document: DocumentSuivi, droit: Droit): void {
    if (document !== this.#espace) {
      return;
    }
    // Le droit est relu à chaque ouverture acquise du document d'espace (AC26).
    this.#retenirLeDroit(droit);
    if (!this.#prudence) {
      this.#lancerLaPasse();
    }
  }

  #verifierLEspace(): Promise<"membre" | "detache" | "sans-issue"> {
    this.#verification ??= this.#options.serveur.lire(this.#options.idEspace).then((lecture) => {
      this.#verification = undefined;
      if (lecture.ok) {
        this.#retenirLeDroit(droitDuRole(lecture.valeur.role));
        return "membre";
      }
      if (estIntrouvable(lecture.erreur)) {
        this.#detacher();
        return "detache";
      }
      return "sans-issue";
    });
    return this.#verification;
  }

  // Constaté, jamais inscrit (H5) : plus rien n'est ouvert ni envoyé de cet espace jusqu'à un geste,
  // un changement d'état du compte ou un rechargement.
  #detacher(): void {
    this.#detache = true;
    this.#evaluer();
  }

  #lancerLaPasse(): void {
    const prise = this.#prise;
    if (prise === undefined || this.#passe !== undefined) {
      return;
    }
    const exclues = new Set([
      ...this.#bloques.keys(),
      ...(this.#affiche === undefined ? [] : [this.#affiche.idDocument]),
      ...[...this.#partantes].map((partante) => partante.idDocument),
    ]);
    this.#erreursDePasse.clear();
    this.#reprisesDePasse.clear();
    this.#passeAchevee = false;
    this.#passe = lancerLaPasse(
      {
        idEspace: this.#options.idEspace,
        typeDe: (id) => this.#typeDe(id),
        prise,
        horloge: this.#options.environnement.horloge,
        parallelisme: this.#prudence ? 1 : undefined,
        messagesPermis: () =>
          Math.floor(LIMITES_SYNCHRO.messagesParFenetre * this.#debit) -
          this.#connexion.messagesRecents(),
        surMotif: (idPage, motif, refus) => this.#suiteDUnePage(idPage, motif, refus),
        surPage: ({ idPage, motif, divergente }) => {
          if (divergente) {
            this.#divergentesDePasse.add(idPage);
          } else {
            this.#divergentesDePasse.delete(idPage);
          }
          if (motif === undefined) {
            this.#erreursDePasse.delete(idPage);
          }
          this.#publier();
        },
        surFin: () => {
          this.#passeAchevee = true;
          this.#publier();
        },
      },
      [...this.#ids].filter((idPage) => !exclues.has(idPage)),
    );
  }

  #suiteDUnePage(idPage: string, motif: string, refus: boolean): Suite {
    const conduite = conduiteDOuverture(motif, refus);
    const reprises = this.#reprisesDePasse.get(idPage) ?? 0;
    if (
      (conduite === "rouvrir-aussitot" || conduite === "rouvrir-avec-delai") &&
      reprises < REPRISES_D_UNE_PAGE_PAR_PASSE
    ) {
      this.#reprisesDePasse.set(idPage, reprises + 1);
      return "reprendre";
    }
    if (conduite === "verifier-l-espace") {
      this.#erreursDePasse.set(idPage, "acces-refuse");
      void this.#verifierLEspace();
      return "abandonner";
    }
    const cause = causeDuMotif(motif);
    if (conduite === "bloquer") {
      this.#bloques.set(idPage, cause);
    } else {
      this.#erreursDePasse.set(idPage, cause);
    }
    return "abandonner";
  }

  // Une mise à jour reçue (serveur ou autre onglet) qui retire des pages les efface de l'appareil
  // (AC37) ; qui en ajoute les fait échanger par la passe (AC5).
  #surMiseAJour(origine: unknown): void {
    const apres = this.#options.lirePages();
    if (apres === undefined || this.#fermee) {
      return;
    }
    const avant = this.#ids;
    this.#ids = apres;
    if (origine !== ORIGINE_DU_CANAL && !this.#espace.estRecue(origine)) {
      return;
    }
    const { ajoutees, retirees } = ecart(avant, apres);
    if (retirees.length > 0) {
      this.#effacerLesDocumentsSupprimes(retirees);
    }
    if (ajoutees.length > 0 && this.#passe !== undefined) {
      this.#passe.ajouter(ajoutees);
      this.#passeAchevee = false;
    } else if (ajoutees.length > 0) {
      this.#lancerLaPasse();
    }
  }

  #effacerLesDocumentsSupprimes(idPages: readonly string[]): void {
    this.#passe?.oublier(idPages);
    if (this.#affiche !== undefined && idPages.includes(this.#affiche.idDocument)) {
      this.#affiche.fermer();
      this.#affiche = undefined;
    }
    for (const idPage of idPages) {
      this.#erreursDePasse.delete(idPage);
      this.#divergentesDePasse.delete(idPage);
      this.#bloques.delete(idPage);
    }
    this.#options.surDocumentsSupprimes?.(idPages);
    void effacerLesDocuments(this.#options.idEspace, idPages);
    this.#publier();
  }

  // ---------------------------------------------------------------------------------------------
  // Page affichée (AC17, AC34, AC36).

  readonly afficherPage = (page: PageAffichee | undefined): void =>
    this.#afficher(page === undefined ? undefined : { id: page.idPage, doc: page.doc }, () =>
      page === undefined
        ? undefined
        : PageSynchronisee.creer({
            page,
            idEspace: this.#options.idEspace,
            environnement: this.#options.environnement,
            contexte: this.#contexte,
          }),
    );

  // F-018-AC51 : la table affichée prend la place de la page affichée, son document échangé tel
  // quel (ADR-0019).
  readonly afficherTable = (table: TableAffichee): void =>
    this.#afficher({ id: table.idTable, doc: table.doc }, () =>
      TableSynchronisee.creer({
        table,
        idEspace: this.#options.idEspace,
        environnement: this.#options.environnement,
        contexte: this.#contexte,
      }),
    );

  readonly afficherAucun = (): void => this.#afficher(undefined, () => undefined);

  #afficher(
    affiche: { readonly id: string; readonly doc: Y.Doc } | undefined,
    creer: () => DocumentAffiche | undefined,
  ): void {
    const courante = this.#affiche;
    if (this.#fermee || (courante?.idDocument === affiche?.id && courante?.lie === affiche?.doc)) {
      return;
    }
    this.#affiche = undefined;
    if (courante !== undefined) {
      this.#quitter(courante);
    }
    if (affiche !== undefined) {
      this.#suivreLeDocument(affiche.id, creer());
    }
    this.#publier();
  }

  #suivreLeDocument(id: string, suivie: DocumentAffiche | undefined): void {
    this.#affiche = suivie;
    this.#passe?.oublier([id]);
    if (this.#prudence) {
      this.#avancerEnPrudence();
    } else {
      suivie?.suivi.ouvrir();
    }
  }

  // La page quittée garde son ouverture jusqu'à l'accusé de ses modifications en attente (AC17).
  #quitter(page: DocumentAffiche): void {
    if (this.#connexion.etat() === "etablie" && page.suivi.aDesModificationsEnAttente()) {
      this.#partantes.add(page);
    } else {
      page.fermer();
    }
  }

  #congedierLesPartantes(): void {
    for (const partante of this.#partantes) {
      if (!partante.suivi.aDesModificationsEnAttente()) {
        this.#partantes.delete(partante);
        partante.fermer();
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Gestes de l'utilisateur (AC12 à AC15, AC19, AC23, AC24, AC29, AC47).

  readonly adopter = async (nom: string): Promise<IssueDAdoption> => {
    const { serveur, idEspace, compte } = this.#options;
    const issue = await declarerLEspace(serveur, idEspace, nom);
    if (issue.sorte === "adopte" && !this.#fermee) {
      const entree: EntreeDuRegistre = { rattachement: "adopte", droit: issue.droit };
      this.#registre = { lu: true, entree };
      await inscrireLEntree(idEspace, entree);
      this.#diffuserAuxOnglets({ sorte: "adoption" });
      this.#evaluer();
    } else if (
      issue.sorte === "echec" &&
      issue.erreur.type === "enveloppe" &&
      issue.erreur.code === "non-authentifie"
    ) {
      void compte.reverifier();
    }
    return issue;
  };

  readonly reessayer = (): void => {
    if (this.#detache) {
      // « Réessayer » rejoue F-013-AC22, en commençant par la requête (AC23).
      void this.#options.serveur.lire(this.#options.idEspace).then((lecture) => {
        if (lecture.ok && !this.#fermee) {
          this.#retenirLeDroit(droitDuRole(lecture.valeur.role));
          this.#detache = false;
          this.#evaluer();
        }
      });
      return;
    }
    if (this.#estActif() && this.#connexion.etat() === "absente") {
      this.#reprise.aussitot(() => this.#tenter());
    }
  };

  readonly reessayerLeDocument = (idPage: string | undefined): void => {
    if (idPage === undefined) {
      this.#espace.reessayer();
    } else if (this.#affiche?.idDocument === idPage) {
      this.#affiche.suivi.reessayer();
    } else {
      this.#bloques.delete(idPage);
      this.#erreursDePasse.delete(idPage);
      this.#passe?.ajouter([idPage]);
      this.#passeAchevee = this.#passe === undefined ? this.#passeAchevee : false;
    }
    this.#publier();
  };

  readonly effacerLaCopieLocale = async (): Promise<IssueDeLEffacement> => {
    const ids = [...this.#ids];
    const { idEspace } = this.#options;
    // Une copie divergente garde son rattachement : l'espace vide est rempli par la
    // synchronisation ; un espace détaché est oublié, et le lancement suivant est un premier
    // lancement (AC24).
    const oublier = this.#detache || this.#registre.entree === undefined;
    const canal = this.#canalDuRegistre;
    this.#canalDuRegistre = undefined;
    postSurCanal(canal, { sorte: "effacement" });
    this.fermer();
    const issue = await effacerLaCopie(idEspace, ids, oublier);
    postSurCanal(canal, { sorte: "efface" });
    canal?.close();
    return issue;
  };

  readonly toutEstAcquitte = (): boolean => {
    const page = this.#affiche?.suivi;
    return (
      this.#connexion.etat() === "etablie" &&
      this.#espace.estAcquis() &&
      !this.#espace.aDesModificationsEnAttente() &&
      (page === undefined || (page.estAcquis() && !page.aDesModificationsEnAttente())) &&
      this.#partantes.size === 0
    );
  };

  readonly estAcquitte = (doc: Y.Doc): boolean => {
    if (this.#fermee || this.#connexion.etat() !== "etablie") {
      return false;
    }
    if (doc === this.#options.doc) {
      return this.#espace.estAcquis() && !this.#espace.aDesModificationsEnAttente();
    }
    return this.#affiche?.lie === doc && this.#affiche.estAcquittee();
  };

  readonly fermer = (): void => {
    if (this.#fermee) {
      // Fermée sur la demande d'un autre onglet, elle n'écoutait plus que la fin de l'effacement.
      this.#canalDuRegistre?.close();
      this.#canalDuRegistre = undefined;
      return;
    }
    this.#fermee = true;
    this.#annulerLaRelecture?.();
    this.#reprise.annuler();
    this.#defaireTout();
    this.#affiche?.fermer();
    this.#affiche = undefined;
    this.#connexion.fermer();
    this.#espace.fermer();
    this.#arrets.splice(0).forEach((arreter) => arreter());
    this.#canalDuRegistre?.close();
    this.#canalDuRegistre = undefined;
    this.#abonnes.clear();
  };

  // ---------------------------------------------------------------------------------------------
  // État visible (AC31, AC32).

  #publier(): void {
    if (this.#fermee) {
      return;
    }
    this.#congedierLesPartantes();
    this.#surveillerLesAttentes();
    if (this.#prudence && this.#prise !== undefined) {
      this.#avancerEnPrudence();
    }
    const suivant = this.#calculer();
    const empreinte = JSON.stringify(suivant);
    if (empreinte === this.#empreinte) {
      return;
    }
    this.#empreinte = empreinte;
    this.#etat = suivant;
    for (const notifier of [...this.#abonnes]) {
      try {
        notifier();
      } catch (exception) {
        console.error("@notionlike/web : un abonné de la synchronisation a levé.", exception);
      }
    }
  }

  #documentsEnErreur(): DocumentEnErreur[] {
    const erreurs = [this.#espace.erreur(), this.#affiche?.suivi.erreur()].filter(
      (erreur): erreur is DocumentEnErreur => erreur !== undefined,
    );
    // Les pages bloquées qui ne sont pas affichées, puis les erreurs de la dernière passe.
    for (const [idPage, cause] of this.#bloques) {
      if (idPage !== ESPACE && idPage !== this.#affiche?.idDocument) {
        erreurs.push({ idPage, cause, reessayable: true });
      }
    }
    for (const [idPage, cause] of this.#erreursDePasse) {
      erreurs.push({ idPage, cause, reessayable: false });
    }
    return erreurs;
  }

  #divergentes(): (string | undefined)[] {
    const divergentes: (string | undefined)[] = [...this.#divergentesDePasse];
    if (this.#espace.estDivergent()) {
      divergentes.unshift(undefined);
    }
    if (this.#affiche?.suivi.estDivergent() === true) {
      divergentes.push(this.#affiche.idDocument);
    }
    return divergentes;
  }

  #modificationsEnAttente(): boolean {
    return (
      this.#espace.aDesModificationsEnAttente() ||
      this.#affiche?.suivi.aDesModificationsEnAttente() === true ||
      this.#partantes.size > 0
    );
  }

  #ouverturesAcquises(): boolean {
    const page = this.#affiche?.suivi;
    return this.#espace.estAcquis() && (page === undefined || page.estAcquis());
  }

  #calculer(): EtatDeSynchronisation {
    const documentsEnErreur = this.#documentsEnErreur();
    const divergentes = this.#divergentes();
    const rattachement = this.#registre.entree === undefined ? "local" : "adopte";
    const affiche = etatAffiche({
      rattachement,
      compte: this.#compte,
      connexion: this.#connexion.etat(),
      refusDeConnexion: this.#refusDeConnexion,
      detache: this.#detache,
      enErreur: documentsEnErreur.length > 0 || divergentes.length > 0,
      ouverturesAcquises: this.#ouverturesAcquises(),
      modificationsEnAttente: this.#modificationsEnAttente(),
      passeAchevee: this.#passeAchevee,
    });
    return {
      affiche,
      rattachement,
      registreLu: this.#registre.lu,
      droit: this.#registre.entree?.droit ?? "ecriture",
      compte: this.#compte,
      refusDeConnexion: this.#refusDeConnexion,
      detache: this.#detache,
      documentsEnErreur,
      divergentes,
      droitChange: this.#droitChange,
    };
  }
}

function correspondanceDeLEspace(idEspace: string): string {
  return correspondance("espace", idEspace).nomDeDocument;
}

function postSurCanal(canal: CanalEntreOnglets | undefined, message: MessageDuRegistre): void {
  try {
    canal?.postMessage(message);
  } catch {
    return;
  }
}
