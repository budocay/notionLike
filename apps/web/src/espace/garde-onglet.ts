// Signaux de l'onglet dont dépend la reprise de la persistance (F-030) : la session les suit tant
// qu'elle est ouverte, et cesse à sa fermeture.
import type { Persistance } from "../persistance/index.ts";

const VISIBILITE = "visibilitychange";

/**
 * Demande une tentative dès que l'onglet redevient visible (F-030-AC2) : la persistance n'en lance
 * une que si elle est coupée et n'en a pas en cours. Rend de quoi cesser de suivre l'onglet.
 */
export function suivreLOnglet(persistance: Persistance): () => void {
  const surVisibilite = (): void => {
    if (document.visibilityState === "visible") {
      persistance.reessayer();
    }
  };
  document.addEventListener(VISIBILITE, surVisibilite);
  return () => document.removeEventListener(VISIBILITE, surVisibilite);
}
