// Signaux de l'onglet dont dépend la reprise de la persistance (F-030) : la session les suit tant
// qu'elle est ouverte, et cesse à sa fermeture.
import type { Persistance } from "../persistance/index.ts";

const VISIBILITE = "visibilitychange";

/** Ce que la synchronisation dit de l'acquittement des modifications par le serveur (F-013-AC49). */
export interface SourceDAcquittement {
  /** Vrai : ce que porte ce document est acquitté par le serveur. */
  estAcquitte(doc: object): boolean;
  abonner(rappel: () => void): () => void;
}

const sources = new Set<SourceDAcquittement>();
const ajustements = new Set<() => void>();
/** Pour chaque persistance suivie : vrai si elle retient l'onglet (F-030-AC16, F-013-AC49). */
const retenues = new Set<() => boolean>();

/**
 * Vrai si la demande de confirmation avant de quitter est armée : une persistance suivie, ouverte,
 * porte une modification non enregistrée que rien n'acquitte (F-032-AC13). Lu au moment d'une
 * demande de changement d'espace.
 */
export function confirmationArmee(): boolean {
  return [...retenues].some((retient) => retient());
}

function ajusterPartout(): void {
  ajustements.forEach((ajuster) => ajuster());
}

/**
 * Branche la synchronisation sur la demande de confirmation avant de quitter (F-013-AC49) : une
 * modification non enregistrée sur l'appareil mais acquittée par le serveur ne retient plus
 * l'onglet, document par document ; la demande est réarmée à la première modification en attente.
 * Rend le débranchement.
 */
export function brancherLAcquittement(source: SourceDAcquittement): () => void {
  sources.add(source);
  const cesser = source.abonner(ajusterPartout);
  ajusterPartout();
  return () => {
    cesser();
    sources.delete(source);
    ajusterPartout();
  };
}

// Seul le document de cette persistance compte : l'acquittement d'un autre document ne lève pas la
// confirmation qu'elle demande.
function estAcquitte(doc: object | undefined): boolean {
  return doc !== undefined && [...sources].some((source) => source.estAcquitte(doc));
}
const DEPART = "pagehide";
const AVANT_DE_QUITTER = "beforeunload";

/**
 * Suit l'onglet pour une persistance, et rend de quoi cesser. Une tentative est demandée dès que
 * l'onglet redevient visible (F-030-AC2), et dès qu'il est masqué ou quitté alors qu'une
 * modification n'est pas enregistrée (F-030-AC27) : la persistance n'en lance une que si elle est
 * coupée, n'en a pas en cours, et pas plus d'une par seconde. Tant qu'une modification n'est pas
 * enregistrée, et seulement alors, le navigateur demande confirmation avant de quitter
 * (F-030-AC16).
 */
export function suivreLOnglet(persistance: Persistance, doc?: object): () => void {
  const surVisibilite = (): void => {
    if (document.visibilityState === "visible" || persistance.aDesModificationsNonEnregistrees()) {
      persistance.reessayer();
    }
  };
  const surDepart = (): void => {
    if (persistance.aDesModificationsNonEnregistrees()) {
      persistance.reessayer();
    }
  };
  // Un écouteur par persistance suivie : la reprise de l'une ne retire pas la confirmation qu'une
  // autre demande encore (F-030-AC16). `preventDefault()` suffit aux navigateurs récents ; la valeur
  // de retour reste renseignée pour ceux d'avant (F-030 H4). Le texte de la boîte est celui du
  // navigateur.
  const demanderConfirmation = (evenement: BeforeUnloadEvent): void => {
    evenement.preventDefault();
    evenement.returnValue = true;
  };
  // Inscrire deux fois le même écouteur, ou le retirer sans qu'il soit inscrit, est sans effet.
  // Une persistance fermée garde ses modifications non enregistrées sans plus rien pouvoir en
  // faire : elle ne retient pas l'onglet, qui que ce soit qui l'ait fermée (F-030-AC11).
  const retient = (): boolean =>
    persistance.lireEtat() !== "fermee" &&
    persistance.aDesModificationsNonEnregistrees() &&
    !estAcquitte(doc);
  const ajusterLaConfirmation = (): void => {
    if (retient()) {
      window.addEventListener(AVANT_DE_QUITTER, demanderConfirmation);
    } else {
      window.removeEventListener(AVANT_DE_QUITTER, demanderConfirmation);
    }
  };
  const desabonner = persistance.abonner(ajusterLaConfirmation);
  ajustements.add(ajusterLaConfirmation);
  retenues.add(retient);
  document.addEventListener(VISIBILITE, surVisibilite);
  window.addEventListener(DEPART, surDepart);
  return () => {
    desabonner();
    ajustements.delete(ajusterLaConfirmation);
    retenues.delete(retient);
    document.removeEventListener(VISIBILITE, surVisibilite);
    window.removeEventListener(DEPART, surDepart);
    window.removeEventListener(AVANT_DE_QUITTER, demanderConfirmation);
  };
}
