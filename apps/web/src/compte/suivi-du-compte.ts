// État du compte pour toute l'application (F-010-AC28, H13) : un seul module le tient, d'après
// `GET /api/v1/moi` seulement, et le revérifie au retour de l'onglet et du réseau (F-010-AC5).
import {
  DELAI_DE_REPONSE_MS,
  demanderMoi,
  type EtatDuCompte,
  type Requeter,
  VERIFICATION,
} from "./moi.ts";

export type { EtatDuCompte } from "./moi.ts";

export interface SuiviDuCompte {
  readonly lire: () => EtatDuCompte;
  /** Rend la fonction de désabonnement. */
  readonly abonner: (rappel: () => void) => () => void;
  /** Rejoue `moi` ; des demandes simultanées partagent une seule requête et son état. */
  readonly reverifier: () => Promise<EtatDuCompte>;
  /** Retire les écouteurs de l'onglet ; plus aucun abonné n'est prévenu. */
  readonly fermer: () => void;
}

const VISIBLE = "visible";

/** Crée le suivi et lance aussitôt la première lecture de `moi`. */
export function suivreLeCompte(
  requeter: Requeter,
  delaiMs: number = DELAI_DE_REPONSE_MS,
): SuiviDuCompte {
  let etat: EtatDuCompte = VERIFICATION;
  let enCours: Promise<EtatDuCompte> | undefined;
  let ferme = false;
  const abonnes = new Set<() => void>();

  const poser = (suivant: EtatDuCompte): void => {
    if (ferme || suivant === etat) {
      return;
    }
    etat = suivant;
    abonnes.forEach((rappel) => rappel());
  };
  const reverifier = (): Promise<EtatDuCompte> => {
    if (enCours === undefined) {
      if (etat.statut === "inconnu") {
        poser(VERIFICATION);
      }
      enCours = demanderMoi(requeter, delaiMs).then((suivant) => {
        enCours = undefined;
        poser(suivant);
        return suivant;
      });
    }
    return enCours;
  };
  const cesserDEcouter = ecouterLOnglet(reverifier);
  void reverifier();
  return {
    lire: () => etat,
    abonner: (rappel) => {
      abonnes.add(rappel);
      return () => abonnes.delete(rappel);
    },
    reverifier,
    fermer: () => {
      ferme = true;
      abonnes.clear();
      cesserDEcouter();
    },
  };
}

/** Retour de l'onglet au premier plan et retour du réseau : chacun demande une revérification. */
function ecouterLOnglet(reverifier: () => Promise<EtatDuCompte>): () => void {
  const surVisibilite = (): void => {
    if (document.visibilityState === VISIBLE) {
      void reverifier();
    }
  };
  const surRetourDuReseau = (): void => void reverifier();
  document.addEventListener("visibilitychange", surVisibilite);
  window.addEventListener("online", surRetourDuReseau);
  return () => {
    document.removeEventListener("visibilitychange", surVisibilite);
    window.removeEventListener("online", surRetourDuReseau);
  };
}
