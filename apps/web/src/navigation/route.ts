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
