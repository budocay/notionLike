// Largeur de la fenêtre : seul module qui l'interroge (F-004-AC41). Le seuil étroit n'est écrit
// qu'une fois, dans le fichier des jetons ; il est lu ici sur la racine du document, où la feuille
// compilée le pose, et sert à bâtir la requête que les classes `etroit:` emploient elles aussi.
import { useSyncExternalStore } from "react";

const JETON_DU_SEUIL = "--breakpoint-etroit";
const CHANGEMENT = "change";

// Sans le jeton (feuille non chargée) ou sans `matchMedia`, aucune requête : l'écran est tenu pour
// large, et la barre latérale reste permanente.
function requeteDEcranLarge(): MediaQueryList | undefined {
  const seuil = getComputedStyle(document.documentElement).getPropertyValue(JETON_DU_SEUIL).trim();
  if (seuil === "" || typeof window.matchMedia !== "function") {
    return undefined;
  }
  return window.matchMedia(`(width >= ${seuil})`);
}

function abonner(rappel: () => void): () => void {
  const requete = requeteDEcranLarge();
  requete?.addEventListener(CHANGEMENT, rappel);
  return () => requete?.removeEventListener(CHANGEMENT, rappel);
}

function estEtroit(): boolean {
  return requeteDEcranLarge()?.matches === false;
}

/** Vrai tant que la fenêtre est plus étroite que le seuil étroit. */
export function useEcranEtroit(): boolean {
  return useSyncExternalStore(abonner, estEtroit);
}
