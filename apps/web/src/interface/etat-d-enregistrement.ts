// Ce que l'écran dit de l'enregistrement quand une page est ouverte (F-003-AC18) : l'espace et la
// page ont chacun leur base, et l'avertissement de F-002-AC16 vaut pour l'une comme pour l'autre.
import type { EtatPret } from "../espace/session-espace.ts";
import type { EtatSessionPage } from "../page/session-page.ts";

/** L'état de l'espace, où l'enregistrement n'est affirmé que si la page ouverte l'est aussi. */
export function etatAvecLaPage(etat: EtatPret, page: EtatSessionPage | undefined): EtatPret {
  if (page?.phase !== "pret") {
    return etat;
  }
  return {
    ...etat,
    enregistre: etat.enregistre && page.enregistre,
    baseRelue: etat.baseRelue && (page.enregistre || page.baseRelue),
    reessayer: () => {
      etat.reessayer();
      page.reessayer();
    },
  };
}
