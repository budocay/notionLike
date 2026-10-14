// Formes d'adresse de l'application (ADR-0007, « Routage »). Fichier de calcul pur : il ne lit ni
// n'écrit l'adresse, et n'importe que la fonction de forme (contrat `web-formes-pures`).
import { estUuidCanonique } from "../identifiants/uuid-canonique.ts";

export type Route =
  | { readonly forme: "accueil" }
  | { readonly forme: "page"; readonly idPage: string }
  | { readonly forme: "page-introuvable" }
  // Écrans de compte (F-010 H2) : deux adresses exactes, sans aucun paramètre.
  | { readonly forme: "connexion" }
  | { readonly forme: "inscription" };

const ACCUEIL: Route = { forme: "accueil" };
const PAGE_INTROUVABLE: Route = { forme: "page-introuvable" };
const FRAGMENT_ACCUEIL = "#/";
const PREFIXE_PAGE = "#/page/";
const ECRANS_DE_COMPTE: ReadonlyMap<string, Route> = new Map<string, Route>([
  ["#/connexion", { forme: "connexion" }],
  ["#/inscription", { forme: "inscription" }],
]);

// Le reste du fragment est pris tel quel, sans décodage, et ne sert à rien avant d'avoir la forme
// d'un UUID canonique. Refusé, il n'est pas gardé : la route rendue ne porte pas la chaîne, qui ne
// peut donc être ni cherchée dans l'arborescence, ni affichée (F-002-AC27).
export function lireRoute(fragment: string): Route {
  if (!fragment.startsWith(PREFIXE_PAGE)) {
    return ECRANS_DE_COMPTE.get(fragment) ?? ACCUEIL;
  }
  const idPage = fragment.slice(PREFIXE_PAGE.length);
  return estUuidCanonique(idPage) ? { forme: "page", idPage } : PAGE_INTROUVABLE;
}

// Un UUID canonique n'a rien à encoder.
export function fragmentDe(route: Route): string {
  switch (route.forme) {
    case "page":
      return `${PREFIXE_PAGE}${route.idPage}`;
    case "connexion":
    case "inscription":
      return `#/${route.forme}`;
    default:
      return FRAGMENT_ACCUEIL;
  }
}

// Écran du compte (F-027-AC21) : une adresse exacte, sans aucun paramètre. Il n'est jamais pris pour
// une page : `lireRoute` le rend comme l'accueil, et l'écran se lit ici, à part, comme ceux des
// espaces (F-027-AC27). Toute variante (`#/compte/`, `#/compte?x`, `#/Compte`) n'est pas cet écran.
export const FRAGMENT_DU_COMPTE = "#/compte";

export function estLEcranDuCompte(fragment: string): boolean {
  return fragment === FRAGMENT_DU_COMPTE;
}

// Écrans des espaces (F-014) : la liste, un espace, l'invitation. Ils ne sont jamais pris pour une
// page : `lireRoute` les rend comme l'accueil, sans sélection, et l'écran se lit ici, à part
// (F-014-AC38). Le jeton d'un lien d'invitation est rendu brut, sans décodage ; sa forme est
// contrôlée par l'interface, d'après le contrat (F-014-AC21). Aucune forme écrite par
// `fragmentDEcran` ne porte de jeton : l'écran d'invitation s'écrit `#/invitation`.
export type EcranDEspaces =
  | { readonly ecran: "espaces" }
  | { readonly ecran: "espace"; readonly idEspace: string }
  | { readonly ecran: "invitation" }
  | { readonly ecran: "lien-d-invitation"; readonly brut: string };

const FRAGMENT_ESPACES = "#/espaces";
const PREFIXE_ESPACE = "#/espaces/";
const FRAGMENT_INVITATION = "#/invitation";
const PREFIXE_INVITATION = "#/invitation/";

export function lireEcranDEspaces(fragment: string): EcranDEspaces | undefined {
  if (fragment === FRAGMENT_ESPACES) {
    return { ecran: "espaces" };
  }
  if (fragment.startsWith(PREFIXE_ESPACE)) {
    const idEspace = fragment.slice(PREFIXE_ESPACE.length);
    return estUuidCanonique(idEspace) ? { ecran: "espace", idEspace } : { ecran: "espaces" };
  }
  if (fragment === FRAGMENT_INVITATION) {
    return { ecran: "invitation" };
  }
  if (fragment.startsWith(PREFIXE_INVITATION)) {
    return { ecran: "lien-d-invitation", brut: fragment.slice(PREFIXE_INVITATION.length) };
  }
  return undefined;
}

export function fragmentDEcran(ecran: EcranDEspaces): string {
  switch (ecran.ecran) {
    case "espaces":
      return FRAGMENT_ESPACES;
    case "espace":
      return `${PREFIXE_ESPACE}${ecran.idEspace}`;
    default:
      return FRAGMENT_INVITATION;
  }
}

/** Lien d'invitation : `<origine>/#/invitation/<jeton>`, le jeton placé tel quel (F-011-AC19, H4). */
export function lienDInvitation(origine: string, jeton: string): string {
  return `${origine}/${PREFIXE_INVITATION}${jeton}`;
}

// Destination de retour après une inscription ou une connexion (F-014-AC41) : une valeur d'une liste
// fermée, tenue en mémoire par l'application, jamais une adresse. Une feature n'en ajoute une que par
// une ligne de cette liste.
export const DESTINATIONS = ["page-selectionnee", "invitation"] as const;

export type Destination = (typeof DESTINATIONS)[number];

/** Fragment du retour : celui de la destination si elle est de la liste, sinon la page donnée. */
export function fragmentDeRetour(destination: unknown, page: Route): string {
  return destination === "invitation" ? fragmentDEcran({ ecran: "invitation" }) : fragmentDe(page);
}
