// Destination d'un déplacement de page (F-006-AC4, AC11, H4) : un calcul pur sur l'arborescence lue,
// sans DOM ni bibliothèque. La position est comptée parmi les sœurs lues de la destination, page
// déplacée exclue, comme l'opération de déplacement du document la lit (ADR-0003). Le lâcher d'un geste et les quatre
// commandes au clavier passent par ces deux fonctions ; la zone admise d'un geste et l'état
// « indisponible » d'une commande en sont dérivés, sans second calcul. Les types sont ceux de
// l'arborescence lue et de l'emplacement de l'opération de déplacement, décrits par leur forme : ce calcul
// n'importe rien.

/** Une page lue : son identifiant et ses sous-pages, dans l'ordre. */
export interface PageDeLArbre {
  readonly id: string;
  readonly enfants: readonly PageDeLArbre[];
}

type IdPage = string;

/** L'emplacement passé à l'opération de déplacement du document (ADR-0003) : position absente, la dernière place. */
export interface Emplacement {
  readonly parent: IdPage | null;
  readonly position?: number;
}

/** Où la page est lâchée par rapport à la rangée cible. */
export type ZoneDeLaCible = "avant" | "apres" | "dans";

/** Les quatre commandes relatives d'une rangée (F-006-AC10, H5). */
export type CommandeDeDeplacement = "monter" | "descendre" | "sous-la-precedente" | "sortir";

export const COMMANDES_DE_DEPLACEMENT: readonly CommandeDeDeplacement[] = [
  "monter",
  "descendre",
  "sous-la-precedente",
  "sortir",
];

/**
 * `deplacer` : l'emplacement à passer à l'opération de déplacement ; `sans-effet` : la page y est déjà, ou la
 * commande n'a pas de destination ; `refusee` : la cible est la page, une de ses descendantes, ou
 * l'une des deux n'est plus dans l'arborescence lue.
 */
export type Destination =
  | { readonly sorte: "deplacer"; readonly ou: Emplacement }
  | { readonly sorte: "sans-effet" }
  | { readonly sorte: "refusee" };

const SANS_EFFET: Destination = { sorte: "sans-effet" };
const REFUSEE: Destination = { sorte: "refusee" };

/** Où se trouve une page : sa mère (`null` à la racine), sa fratrie lue et son rang dans celle-ci. */
interface Place {
  readonly page: PageDeLArbre;
  readonly parent: PageDeLArbre | undefined;
  readonly soeurs: readonly PageDeLArbre[];
  readonly rang: number;
}

// Parcours itératif, en largeur : la profondeur reçue n'est pas bornée.
function placeDe(racines: readonly PageDeLArbre[], id: IdPage): Place | undefined {
  const aVoir: {
    readonly soeurs: readonly PageDeLArbre[];
    readonly parent: PageDeLArbre | undefined;
  }[] = [{ soeurs: racines, parent: undefined }];
  for (const { soeurs, parent } of aVoir) {
    const rang = soeurs.findIndex((soeur) => soeur.id === id);
    const page = soeurs[rang];
    if (page !== undefined) {
      return { page, parent, soeurs, rang };
    }
    soeurs.forEach((soeur) => aVoir.push({ soeurs: soeur.enfants, parent: soeur }));
  }
  return undefined;
}

function idDe(parent: PageDeLArbre | undefined): IdPage | null {
  return parent === undefined ? null : parent.id;
}

/**
 * Place la page à `position` parmi les sœurs de `parent`, elle exclue ; sans effet si elle y est
 * déjà, c'est-à-dire sous ce même parent, à ce même rang.
 */
function versLaPosition(deplacee: Place, parent: IdPage | null, position: number): Destination {
  if (idDe(deplacee.parent) === parent && deplacee.rang === position) {
    return SANS_EFFET;
  }
  return { sorte: "deplacer", ou: { parent, position } };
}

/** Dernière sous-page de `parent` : sans effet si la page l'est déjà. */
function versLaFin(deplacee: Place, parent: PageDeLArbre): Destination {
  const derniere = parent.enfants.at(-1);
  if (derniere?.id === deplacee.page.id) {
    return SANS_EFFET;
  }
  return { sorte: "deplacer", ou: { parent: parent.id } };
}

/**
 * Destination d'un lâcher sur la zone `zone` de la rangée `cible` (F-006-AC2, AC3, AC5, AC6). La
 * page elle-même et ses descendantes ne sont jamais une cible ; une page ou une cible qui a quitté
 * l'arborescence lue non plus (F-006-AC8).
 */
export function destinationDuDepot(
  racines: readonly PageDeLArbre[],
  id: IdPage,
  cible: IdPage,
  zone: ZoneDeLaCible,
): Destination {
  const deplacee = placeDe(racines, id);
  const visee = placeDe(racines, cible);
  if (deplacee === undefined || visee === undefined) {
    return REFUSEE;
  }
  if (placeDe([deplacee.page], cible) !== undefined) {
    return REFUSEE;
  }
  if (zone === "dans") {
    return versLaFin(deplacee, visee.page);
  }
  const autres = visee.soeurs.filter((soeur) => soeur.id !== id);
  const rang = autres.findIndex((soeur) => soeur.id === cible);
  return versLaPosition(deplacee, idDe(visee.parent), zone === "avant" ? rang : rang + 1);
}

type Calcul = (racines: readonly PageDeLArbre[], deplacee: Place) => Destination;

// « Sortir d'un niveau » : sœur de sa mère, juste après elle.
const sortir: Calcul = (racines, deplacee) => {
  if (deplacee.parent === undefined) {
    return SANS_EFFET;
  }
  const autour = placeDe(racines, deplacee.parent.id);
  return autour === undefined
    ? REFUSEE
    : versLaPosition(deplacee, idDe(autour.parent), autour.rang + 1);
};

const CALCULS: Readonly<Record<CommandeDeDeplacement, Calcul>> = {
  monter: (_racines, deplacee) =>
    deplacee.rang === 0
      ? SANS_EFFET
      : versLaPosition(deplacee, idDe(deplacee.parent), deplacee.rang - 1),
  descendre: (_racines, deplacee) =>
    deplacee.rang === deplacee.soeurs.length - 1
      ? SANS_EFFET
      : versLaPosition(deplacee, idDe(deplacee.parent), deplacee.rang + 1),
  "sous-la-precedente": (_racines, deplacee) => {
    const precedente = deplacee.soeurs[deplacee.rang - 1];
    return precedente === undefined ? SANS_EFFET : versLaFin(deplacee, precedente);
  },
  sortir,
};

/** Destination d'une commande au clavier (F-006-AC10, AC11). */
export function destinationDeLaCommande(
  racines: readonly PageDeLArbre[],
  id: IdPage,
  commande: CommandeDeDeplacement,
): Destination {
  const deplacee = placeDe(racines, id);
  return deplacee === undefined ? REFUSEE : CALCULS[commande](racines, deplacee);
}

/** La place qu'aura la page après un déplacement vers `ou`, lue dans l'arborescence d'avant. */
export interface PlaceApres<P extends PageDeLArbre> {
  /** Nouvelle mère ; `undefined` à la racine. */
  readonly parent: P | undefined;
  /** Rang parmi ses sœurs, à partir de 1. */
  readonly rang: number;
  /** Nombre de sœurs, elle comprise. */
  readonly total: number;
}

/** Ce que l'annonce d'un déplacement dit de la nouvelle place (F-006-AC12). */
export function placeApres<P extends PageDeLArbre>(
  racines: readonly P[],
  id: IdPage,
  ou: Emplacement,
): PlaceApres<P> | undefined {
  const parent = ou.parent === null ? undefined : placeDe(racines, ou.parent)?.page;
  if (ou.parent !== null && parent === undefined) {
    return undefined;
  }
  const autres = (parent === undefined ? racines : parent.enfants).filter(
    (soeur) => soeur.id !== id,
  );
  const position = Math.min(ou.position ?? autres.length, autres.length);
  // La mère est trouvée dans `racines` : elle est du type des pages reçues.
  return { parent: parent as P | undefined, rang: position + 1, total: autres.length + 1 };
}
