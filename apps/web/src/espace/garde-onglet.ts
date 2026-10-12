// Signaux de l'onglet dont dépend la reprise de la persistance (F-030) : la session les suit tant
// qu'elle est ouverte, et cesse à sa fermeture.
import type { Persistance } from "../persistance/index.ts";

const VISIBILITE = "visibilitychange";
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
export function suivreLOnglet(persistance: Persistance): () => void {
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
  const ajusterLaConfirmation = (): void => {
    const ouverte = persistance.lireEtat() !== "fermee";
    if (ouverte && persistance.aDesModificationsNonEnregistrees()) {
      window.addEventListener(AVANT_DE_QUITTER, demanderConfirmation);
    } else {
      window.removeEventListener(AVANT_DE_QUITTER, demanderConfirmation);
    }
  };
  const desabonner = persistance.abonner(ajusterLaConfirmation);
  document.addEventListener(VISIBILITE, surVisibilite);
  window.addEventListener(DEPART, surDepart);
  return () => {
    desabonner();
    document.removeEventListener(VISIBILITE, surVisibilite);
    window.removeEventListener(DEPART, surDepart);
    window.removeEventListener(AVANT_DE_QUITTER, demanderConfirmation);
  };
}
