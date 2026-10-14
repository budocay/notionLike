// Navigation de l'espace ouvert (F-010, F-014) : la route des pages, l'écran de compte ou d'espaces
// affiché, la destination de retour et le jeton d'invitation. Tout est tenu en mémoire et perdu au
// rechargement (F-014-AC25, AC41) ; rien n'est lu dans un stockage ni dans une réponse du serveur.
import { useEffect, useState, useSyncExternalStore } from "react";

import type { Compte } from "../compte/index.ts";
import { estUnJetonDInvitation } from "../compte/regles-espaces.ts";
import { abonnerAuFragment, lireFragment, remplacerParLEcran } from "../navigation/fragment.ts";
import {
  type Destination,
  type EcranDEspaces,
  fragmentDe,
  fragmentDeRetour,
  lireEcranDEspaces,
  lireRoute,
  type Route,
} from "../navigation/route.ts";
import type { SorteDEcran } from "./EcranDeCompte.tsx";

/** Jeton d'invitation reçu par l'adresse, gardé en mémoire seulement (F-014-AC21, AC25). */
export type InvitationEnMemoire =
  | { readonly statut: "aucune" }
  | { readonly statut: "invalide" }
  | { readonly statut: "jeton"; readonly jeton: string };

export type EcranAffiche =
  | { readonly sorte: "compte"; readonly ecran: SorteDEcran }
  | {
      readonly sorte: "espaces";
      readonly ecran: Exclude<EcranDEspaces, { ecran: "lien-d-invitation" }>;
    }
  | undefined;

export interface NavigationDeLEspace {
  /** Route des pages : sur un écran de compte, la page sélectionnée avant le détour. */
  readonly route: Route;
  readonly ecran: EcranAffiche;
  /** Fragment où revenir après un succès sur un écran de compte (F-014-AC41). */
  readonly retour: string;
  /** Fragment de la page sélectionnée, pour revenir à l'application. */
  readonly application: string;
  readonly invitation: InvitationEnMemoire;
  readonly effacerLInvitation: () => void;
  /** Posée par l'application seule, au moment où elle mène à un écran de compte. */
  readonly poserLaDestination: (destination: Destination) => void;
}

interface Memoire {
  readonly fragment: string | undefined;
  /** Dernière route des pages, hors écrans de compte et d'espaces : le retour par défaut. */
  readonly page: Route;
  readonly destination: Destination | undefined;
  readonly invitation: InvitationEnMemoire;
}

const AUCUNE: InvitationEnMemoire = { statut: "aucune" };
const INVALIDE: InvitationEnMemoire = { statut: "invalide" };
const DEPART: Memoire = {
  fragment: undefined,
  page: { forme: "accueil" },
  destination: undefined,
  invitation: AUCUNE,
};

export function useNavigationDeLEspace(compte: Compte | undefined): NavigationDeLEspace {
  const fragment = useSyncExternalStore(abonnerAuFragment, lireFragment);
  const [memoire, setMemoire] = useState<Memoire>(DEPART);
  const avecCompte = compte !== undefined;
  // Le fragment est traité ici, à son changement, et non sur l'événement `hashchange` qu'un
  // remplacement émettrait : lire le jeton, le tenir en mémoire, afficher l'écran (H4).
  const courante =
    memoire.fragment === fragment ? memoire : suivante(memoire, fragment, avecCompte);
  if (courante !== memoire) {
    setMemoire(courante);
  }
  const lu = lireEcranDEspaces(fragment);
  const porteUnJeton = lu?.ecran === "lien-d-invitation";
  // Puis remplacer l'adresse : le jeton n'y reste pas, le précédent n'y ramène pas (F-014-AC21).
  useEffect(() => {
    if (porteUnJeton) {
      remplacerParLEcran({ ecran: "invitation" });
    }
  }, [porteUnJeton, fragment]);
  const route = lireRoute(fragment);
  const surCompte = avecCompte && estUnEcranDeCompte(route);
  return {
    route: surCompte ? courante.page : route,
    ecran: ecranAffiche(route, lu, surCompte, avecCompte),
    retour: fragmentDeRetour(courante.destination, courante.page),
    application: fragmentDe(courante.page),
    invitation: courante.invitation,
    effacerLInvitation: () => setMemoire((avant) => ({ ...avant, invitation: AUCUNE })),
    poserLaDestination: (destination) => setMemoire((avant) => ({ ...avant, destination })),
  };
}

function suivante(avant: Memoire, fragment: string, avecCompte: boolean): Memoire {
  const route = lireRoute(fragment);
  const lu = lireEcranDEspaces(fragment);
  const surCompte = avecCompte && estUnEcranDeCompte(route);
  return {
    fragment,
    page: lu === undefined && !estUnEcranDeCompte(route) ? route : avant.page,
    // Conservée d'un écran de compte à l'autre, effacée dès qu'on les quitte (F-014-AC41).
    destination: surCompte ? avant.destination : undefined,
    invitation: invitationSuivante(avant.invitation, lu, surCompte),
  };
}

/** Le jeton est lu tel qu'il figure dans le fragment, sans décodage ; une autre forme est refusée. */
function invitationSuivante(
  avant: InvitationEnMemoire,
  lu: EcranDEspaces | undefined,
  surCompte: boolean,
): InvitationEnMemoire {
  if (lu?.ecran === "lien-d-invitation") {
    return estUnJetonDInvitation(lu.brut) ? { statut: "jeton", jeton: lu.brut } : INVALIDE;
  }
  return lu?.ecran === "invitation" || surCompte ? avant : AUCUNE;
}

function ecranAffiche(
  route: Route,
  lu: EcranDEspaces | undefined,
  surCompte: boolean,
  avecCompte: boolean,
): EcranAffiche {
  if (surCompte && estUnEcranDeCompte(route)) {
    return { sorte: "compte", ecran: route.forme };
  }
  if (!avecCompte || lu === undefined) {
    return undefined;
  }
  return {
    sorte: "espaces",
    ecran: lu.ecran === "lien-d-invitation" ? { ecran: "invitation" } : lu,
  };
}

function estUnEcranDeCompte(route: Route): route is { readonly forme: SorteDEcran } {
  return route.forme === "connexion" || route.forme === "inscription";
}
