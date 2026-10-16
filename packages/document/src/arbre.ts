// Lecture du document d'espace (ADR-0002, « Lecture ») : des entrées de page à l'arborescence lue.
export type IdPage = string;

/** Type d'une page (F-018, ADR-0002 amendement F-018) : fixé à la création, jamais changé. */
export type TypeDePage = "page" | "table";

export interface PageLue {
  readonly id: IdPage;
  readonly titre: string;
  /** Présent pour une table seulement : une page lue n'a pas ce champ (F-018-AC2). */
  readonly type?: "table";
  readonly enfants: readonly PageLue[];
}

export interface Arborescence {
  readonly racines: readonly PageLue[];
  readonly corbeille: readonly PageLue[];
}

export interface EntreePage {
  readonly id: IdPage;
  readonly titre: string;
  readonly type: TypeDePage;
  readonly parent: IdPage | null;
  readonly rang: string;
  readonly corbeille: boolean;
}

export interface ArbreLu {
  readonly arborescence: Arborescence;
  /** Pages exposées à la racine parce qu'elles coupent un cycle, leur parent enregistré restant autre. */
  readonly pagesCoupees: ReadonlySet<IdPage>;
}

type Entrees = ReadonlyMap<IdPage, EntreePage>;
type Parents = ReadonlyMap<IdPage, IdPage | null>;
type Fratries = ReadonlyMap<IdPage | null, readonly EntreePage[]>;

export function lireArbre(entrees: Entrees): ArbreLu {
  const parents = parentsPresents(entrees);
  const pagesCoupees = pagesCoupantUnCycle(parents);
  const fratries = grouperParParent(entrees, (id) =>
    pagesCoupees.has(id) ? null : (parents.get(id) ?? null),
  );
  return { arborescence: construireArborescence(fratries), pagesCoupees };
}

// Les parcours sont itératifs : la profondeur d'un arbre reçu n'est pas bornée.
export function trouverPage(pages: readonly PageLue[], id: IdPage): PageLue | undefined {
  const aVoir = [...pages];
  for (const page of aVoir) {
    if (page.id === id) {
      return page;
    }
    page.enfants.forEach((enfant) => aVoir.push(enfant));
  }
  return undefined;
}

export function memeArborescence(a: Arborescence, b: Arborescence): boolean {
  return memesPages(a.racines, b.racines) && memesPages(a.corbeille, b.corbeille);
}

export function estDansLeSousArbre(racine: PageLue, id: IdPage): boolean {
  return trouverPage([racine], id) !== undefined;
}

// Un parent enregistré qui ne désigne aucune entrée vaut la racine.
function parentsPresents(entrees: Entrees): Map<IdPage, IdPage | null> {
  const parents = new Map<IdPage, IdPage | null>();
  for (const { id, parent } of entrees.values()) {
    parents.set(id, parent !== null && entrees.has(parent) ? parent : null);
  }
  return parents;
}

// Chaque page n'a qu'un parent : les cycles sont disjoints, et chacun est coupé à sa page de plus
// petit identifiant.
function pagesCoupantUnCycle(parents: Parents): Set<IdPage> {
  const coupees = new Set<IdPage>();
  const dejaSuivies = new Set<IdPage>();
  for (const depart of parents.keys()) {
    const { chemin, arrivee } = remonter(parents, dejaSuivies, depart);
    const debutDuCycle = arrivee === null ? -1 : chemin.indexOf(arrivee);
    if (debutDuCycle >= 0) {
      coupees.add(plusPetitIdentifiant(chemin.slice(debutDuCycle)));
    }
    chemin.forEach((id) => dejaSuivies.add(id));
  }
  return coupees;
}

// Remonte de parent en parent jusqu'à la racine, une page déjà suivie, ou une page du chemin lui-même.
function remonter(
  parents: Parents,
  dejaSuivies: ReadonlySet<IdPage>,
  depart: IdPage,
): { chemin: IdPage[]; arrivee: IdPage | null } {
  const chemin: IdPage[] = [];
  const surLeChemin = new Set<IdPage>();
  let courante: IdPage | null = depart;
  while (courante !== null && !dejaSuivies.has(courante) && !surLeChemin.has(courante)) {
    chemin.push(courante);
    surLeChemin.add(courante);
    courante = parents.get(courante) ?? null;
  }
  return { chemin, arrivee: courante };
}

function plusPetitIdentifiant(identifiants: readonly IdPage[]): IdPage {
  return identifiants.reduce((plusPetit, id) => (id < plusPetit ? id : plusPetit));
}

// Les entrées sont triées avant d'être réparties : chaque fratrie est donc déjà dans l'ordre lu.
function grouperParParent(entrees: Entrees, parentLu: (id: IdPage) => IdPage | null): Fratries {
  const fratries = new Map<IdPage | null, EntreePage[]>();
  for (const entree of [...entrees.values()].sort(parRangPuisIdentifiant)) {
    const parent = parentLu(entree.id);
    const fratrie = fratries.get(parent);
    if (fratrie === undefined) {
      fratries.set(parent, [entree]);
    } else {
      fratrie.push(entree);
    }
  }
  return fratries;
}

function parRangPuisIdentifiant(a: EntreePage, b: EntreePage): number {
  return comparerParUnitesDeCode(a.rang, b.rang) || comparerParUnitesDeCode(a.id, b.id);
}

function comparerParUnitesDeCode(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

function memesPages(a: readonly PageLue[], b: readonly PageLue[]): boolean {
  const aComparer = [[a, b] as const];
  for (const [unes, autres] of aComparer) {
    if (unes.length !== autres.length) {
      return false;
    }
    for (const [indice, une] of unes.entries()) {
      const autre = autres[indice];
      if (
        autre === undefined ||
        une.id !== autre.id ||
        une.titre !== autre.titre ||
        une.type !== autre.type
      ) {
        return false;
      }
      aComparer.push([une.enfants, autre.enfants]);
    }
  }
  return true;
}

function enfantsDe(fratries: Fratries, parent: IdPage | null): readonly EntreePage[] {
  return fratries.get(parent) ?? [];
}

interface PageEnConstruction extends PageLue {
  readonly enfants: PageLue[];
}

interface Noeud {
  readonly entree: EntreePage;
  readonly page: PageEnConstruction;
  readonly jete: boolean;
}

// Une page lue ne porte le champ `type` que pour une table (F-018-AC2).
function pageVide({ id, titre, type }: EntreePage): PageEnConstruction {
  return type === "table" ? { id, titre, type, enfants: [] } : { id, titre, enfants: [] };
}

// Corbeille (étape 5) et ordre (étape 6). Une page est jetée par son drapeau ou par une ancêtre ;
// une racine de la corbeille est une page jetée dont le parent ne l'est pas.
function construireArborescence(fratries: Fratries): Arborescence {
  const racines: PageLue[] = [];
  const racinesJetees: Noeud[] = [];
  const aDescendre: Noeud[] = [];
  const ranger = (entree: EntreePage, parent: Noeud | undefined): void => {
    const parentJete = parent?.jete === true;
    const page = pageVide(entree);
    const noeud = { entree, page, jete: parentJete || entree.corbeille };
    aDescendre.push(noeud);
    if (noeud.jete && !parentJete) {
      racinesJetees.push(noeud);
    } else {
      (parent?.page.enfants ?? racines).push(page);
    }
  };
  enfantsDe(fratries, null).forEach((entree) => ranger(entree, undefined));
  for (const noeud of aDescendre) {
    enfantsDe(fratries, noeud.entree.id).forEach((entree) => ranger(entree, noeud));
  }
  const corbeille = racinesJetees
    .sort((a, b) => parRangPuisIdentifiant(a.entree, b.entree))
    .map((noeud) => noeud.page);
  return { racines, corbeille };
}
