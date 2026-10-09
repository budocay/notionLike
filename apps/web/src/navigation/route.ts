// Formes d'adresse de l'application (ADR-0007, « Routage ») : la page désignée, ou l'accueil.
export type Route =
  | { readonly forme: "accueil" }
  | { readonly forme: "page"; readonly idPage: string }
  | { readonly forme: "page-illisible" };

const ACCUEIL: Route = { forme: "accueil" };
const PAGE_ILLISIBLE: Route = { forme: "page-illisible" };
const FRAGMENT_ACCUEIL = "#/";
const PREFIXE_PAGE = "#/page/";

export function lireRoute(fragment: string): Route {
  if (!fragment.startsWith(PREFIXE_PAGE)) {
    return ACCUEIL;
  }
  const idPage = decoder(fragment.slice(PREFIXE_PAGE.length));
  return idPage === undefined || idPage === "" ? PAGE_ILLISIBLE : { forme: "page", idPage };
}

export function fragmentDe(route: Route): string {
  return route.forme === "page"
    ? `${PREFIXE_PAGE}${encodeURIComponent(route.idPage)}`
    : FRAGMENT_ACCUEIL;
}

// Un identifiant mal encodé ne désigne aucune page : il ne ramène pas à l'accueil.
function decoder(texte: string): string | undefined {
  try {
    return decodeURIComponent(texte);
  } catch {
    return undefined;
  }
}
