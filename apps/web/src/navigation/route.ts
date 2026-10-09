// Formes d'adresse de l'application (ADR-0007, « Routage »). Fichier de calcul pur : il ne lit ni
// n'écrit l'adresse, et n'importe que la fonction de forme (contrat `web-formes-pures`).
import { estUuidCanonique } from "../identifiants/uuid-canonique.ts";

export type Route =
  | { readonly forme: "accueil" }
  | { readonly forme: "page"; readonly idPage: string }
  | { readonly forme: "page-introuvable" };

const ACCUEIL: Route = { forme: "accueil" };
const PAGE_INTROUVABLE: Route = { forme: "page-introuvable" };
const FRAGMENT_ACCUEIL = "#/";
const PREFIXE_PAGE = "#/page/";

// Le reste du fragment est pris tel quel, sans décodage, et ne sert à rien avant d'avoir la forme
// d'un UUID canonique. Refusé, il n'est pas gardé : la route rendue ne porte pas la chaîne, qui ne
// peut donc être ni cherchée dans l'arborescence, ni affichée (F-002-AC27).
export function lireRoute(fragment: string): Route {
  if (!fragment.startsWith(PREFIXE_PAGE)) {
    return ACCUEIL;
  }
  const idPage = fragment.slice(PREFIXE_PAGE.length);
  return estUuidCanonique(idPage) ? { forme: "page", idPage } : PAGE_INTROUVABLE;
}

// Un UUID canonique n'a rien à encoder.
export function fragmentDe(route: Route): string {
  return route.forme === "page" ? `${PREFIXE_PAGE}${route.idPage}` : FRAGMENT_ACCUEIL;
}
