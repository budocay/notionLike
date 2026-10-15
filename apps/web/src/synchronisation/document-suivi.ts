// Un document que l'onglet garde synchronisé d'une connexion à l'autre : le document d'espace, et
// la réplique de la page affichée. Il rouvre lui-même ce que le serveur a fermé, quand une
// réouverture est prévue (F-013-AC22, AC26, AC30, AC45), et retient pourquoi il ne transmet pas.
import type { HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import type * as Y from "yjs";

import type { Droit } from "./stockage.ts";
import { causeDuMotif, conduiteDOuverture, motifDe } from "./conduites.ts";
import type { Horloge } from "./environnement.ts";
import type { CauseDErreur, DocumentEnErreur } from "./etat.ts";
import { ouvrir, type Ouverture } from "./ouverture.ts";
import { attenteApres } from "./reprise.ts";

/** Ce que le document demande à l'orchestre. */
export interface ContexteDuDocument {
  prise(): HocuspocusProviderWebsocket | undefined;
  readonly horloge: Horloge;
  readonly alea: () => number;
  /** Interroge l'espace une fois (F-013-AC22) : membre, espace détaché, ou requête sans issue. */
  verifierLEspace(): Promise<"membre" | "detache" | "sans-issue">;
  surAcquise(document: DocumentSuivi, droit: Droit): void;
  surChangement(): void;
  /**
   * Un envoi bloqué le reste jusqu'à un geste ou au rechargement, même quand la page est quittée
   * puis reprise (F-013-AC28, AC29, AC47) : l'orchestre le retient par page.
   */
  blocage(idPage: string | undefined): CauseDErreur | undefined;
  noterLeBlocage(idPage: string | undefined, cause: CauseDErreur | undefined): void;
}

export class DocumentSuivi {
  readonly nom: string;
  readonly idPage: string | undefined;
  readonly doc: Y.Doc;
  readonly #contexte: ContexteDuDocument;
  #ouverture: Ouverture | undefined;
  #bloque: CauseDErreur | undefined;
  #erreur: CauseDErreur | undefined;
  #droitsRouverts = false;
  #accesVerifie = false;
  #echecs = 0;
  #annulerLaReouverture: (() => void) | undefined;
  #ferme = false;

  constructor(nom: string, idPage: string | undefined, doc: Y.Doc, contexte: ContexteDuDocument) {
    this.nom = nom;
    this.idPage = idPage;
    this.doc = doc;
    this.#contexte = contexte;
    this.#bloque = contexte.blocage(idPage);
  }

  /** Ouvre le document sur la connexion établie, sauf s'il est bloqué ou déjà ouvert. */
  ouvrir(): void {
    const prise = this.#contexte.prise();
    if (this.#ferme || this.#bloque !== undefined || this.#ouverture !== undefined || !prise) {
      return;
    }
    this.#annulerLaReouverture?.();
    this.#annulerLaReouverture = undefined;
    const ouverture = ouvrir({
      prise,
      horloge: this.#contexte.horloge,
      nom: this.nom,
      doc: this.doc,
      surChangement: () => this.#surOuverture(ouverture),
    });
    this.#ouverture = ouverture;
  }

  /** La connexion est perdue : l'ouverture n'existe plus ; rien n'est émis sur une prise morte. */
  defaire(): void {
    this.#annulerLaReouverture?.();
    this.#annulerLaReouverture = undefined;
    this.#ouverture?.fermer();
    this.#ouverture = undefined;
  }

  fermer(): void {
    this.defaire();
    this.#ferme = true;
  }

  /** Envoi bloqué (F-013-AC28, AC29, AC47) : l'ouverture est refermée, rien n'est effacé. */
  bloquer(cause: CauseDErreur): void {
    this.#retenirLeBlocage(cause);
    this.#erreur = undefined;
    this.defaire();
    this.#contexte.surChangement();
  }

  /** Geste de l'utilisateur : le document est rouvert, même bloqué. */
  reessayer(): void {
    this.#retenirLeBlocage(undefined);
    this.#accesVerifie = false;
    this.#droitsRouverts = false;
    this.defaire();
    this.ouvrir();
    this.#contexte.surChangement();
  }

  estAcquis(): boolean {
    return this.#ouverture?.issue().sorte === "acquise";
  }

  aDesModificationsEnAttente(): boolean {
    return this.#ouverture?.aDesModificationsEnAttente() === true;
  }

  estDivergent(): boolean {
    return this.#ouverture?.estDivergente() === true;
  }

  estRecue(origine: unknown): boolean {
    return this.#ouverture?.estSonOrigine(origine) === true;
  }

  /** Vrai : une ouverture est demandée et n'est ni acquise, ni réglée par le serveur. */
  estEnCoursDOuverture(): boolean {
    return this.#ouverture?.issue().sorte === "attente";
  }

  erreur(): DocumentEnErreur | undefined {
    if (this.#bloque !== undefined) {
      return { idPage: this.idPage, cause: this.#bloque, reessayable: true };
    }
    return this.#erreur === undefined
      ? undefined
      : { idPage: this.idPage, cause: this.#erreur, reessayable: false };
  }

  #surOuverture(ouverture: Ouverture): void {
    if (this.#ouverture !== ouverture) {
      return;
    }
    const issue = ouverture.issue();
    if (issue.sorte === "acquise") {
      this.#droitsRouverts = false;
      this.#accesVerifie = false;
      this.#echecs = 0;
      this.#erreur = undefined;
      this.#contexte.surAcquise(this, issue.droit);
    } else if (issue.sorte === "fermee-par-le-serveur") {
      // Aucun message de fermeture pour ce document : l'ouverture est retirée sans être détachée.
      ouverture.fermer();
      this.#ouverture = undefined;
      this.#suivre(issue.motif, issue.refus);
    }
    this.#contexte.surChangement();
  }

  #suivre(raison: string, refus: boolean): void {
    switch (conduiteDOuverture(raison, refus)) {
      case "rouvrir-aussitot":
        this.#rouvrirApresDroitsModifies();
        return;
      case "verifier-l-espace":
        this.#verifierLAcces();
        return;
      case "rouvrir-avec-delai":
        this.#rouvrirAvecDelai(causeDuMotif(raison));
        return;
      default:
        this.#retenirLeBlocage(causeDuMotif(motifDe(raison)));
    }
  }

  #retenirLeBlocage(cause: CauseDErreur | undefined): void {
    this.#bloque = cause;
    this.#contexte.noterLeBlocage(this.idPage, cause);
  }

  // Une seule réouverture par fermeture (F-013-AC26) ; une seconde avant l'acquisition est reprise
  // selon les délais de la reprise.
  #rouvrirApresDroitsModifies(): void {
    if (this.#droitsRouverts) {
      this.#rouvrirAvecDelai("erreur-interne");
      return;
    }
    this.#droitsRouverts = true;
    this.ouvrir();
  }

  #verifierLAcces(): void {
    if (this.#accesVerifie) {
      this.#retenirLeBlocage("acces-refuse");
      return;
    }
    this.#erreur = "acces-refuse";
    void this.#contexte.verifierLEspace().then((verdict) => {
      if (this.#ferme || this.#ouverture !== undefined) {
        return;
      }
      if (verdict === "membre") {
        this.#accesVerifie = true;
        this.ouvrir();
      } else if (verdict === "sans-issue") {
        this.#rouvrirAvecDelai("acces-refuse");
      }
      this.#contexte.surChangement();
    });
  }

  #rouvrirAvecDelai(cause: CauseDErreur): void {
    this.#erreur = cause;
    this.#annulerLaReouverture?.();
    this.#annulerLaReouverture = this.#contexte.horloge.programmer(
      () => {
        this.#annulerLaReouverture = undefined;
        this.ouvrir();
        this.#contexte.surChangement();
      },
      attenteApres(this.#echecs, this.#contexte.alea()),
    );
    this.#echecs += 1;
  }
}
