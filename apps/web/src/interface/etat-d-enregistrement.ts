// Ce que l'écran dit de l'enregistrement quand une page ou une table est ouverte (F-003-AC18,
// F-018-AC14) : l'espace et le document ouvert ont chacun leur base, et l'avertissement de
// F-002-AC16 vaut pour l'un comme pour l'autre.
import type { EtatPret } from "../espace/session-espace.ts";
import type { EtatSessionPage } from "../page/session-page.ts";
import type { EtatSessionTable } from "../table/session-table.ts";

/** L'état de la session d'une page ou d'une table ouverte. */
export type EtatDuDocumentOuvert = EtatSessionPage | EtatSessionTable;

/** L'état de l'espace, où l'enregistrement n'est affirmé que si le document ouvert l'est aussi. */
export function etatAvecLeDocumentOuvert(
  etat: EtatPret,
  ouvert: EtatDuDocumentOuvert | undefined,
): EtatPret {
  if (ouvert?.phase !== "pret") {
    return etat;
  }
  return {
    ...etat,
    enregistre: etat.enregistre && ouvert.enregistre,
    baseRelue: etat.baseRelue && (ouvert.enregistre || ouvert.baseRelue),
    reessayer: () => {
      etat.reessayer();
      ouvert.reessayer();
    },
  };
}
