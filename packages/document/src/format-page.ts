// Format du document de page (ADR-0009) : seul fichier qui connaît les noms des types racine, la
// forme stockée de la version et la table des versions.
import type * as Y from "yjs";

export interface LigneDeVersionPage {
  readonly version: number;
  /** Nom du nœud → noms de ses attributs, triés. */
  readonly noeuds: Readonly<Record<string, readonly string[]>>;
  readonly marques: readonly string[];
  /** Types racine ajoutés à côté du fragment du contenu. */
  readonly typesPartages: readonly string[];
}

const PREMIERE_VERSION = 1;

// Une feature qui étend le format ajoute une ligne et ne retouche aucune ligne existante.
export const TABLE_DES_VERSIONS_PAGE: readonly LigneDeVersionPage[] = [
  {
    version: PREMIERE_VERSION,
    noeuds: {
      bulletList: [],
      doc: [],
      heading: ["level"],
      listItem: [],
      orderedList: ["start", "type"],
      paragraph: [],
      text: [],
    },
    marques: [],
    typesPartages: [],
  },
];

/** Numéro de la dernière ligne de la table. */
export const VERSION_PAGE_PRISE_EN_CHARGE: number =
  TABLE_DES_VERSIONS_PAGE.at(-1)?.version ?? PREMIERE_VERSION;

const TYPE_CONTENU = "contenu";
const TYPE_VERSIONS = "versions";

export interface FormeStockee {
  /** La plus haute version entière >= 1 inscrite, 1 s'il n'y en a aucune. */
  readonly version: number;
  /** Faux si la forme stockée porte autre chose que des entiers >= 1, ou n'est pas lisible. */
  readonly admise: boolean;
}

export function estUneVersion(valeur: unknown): valeur is number {
  return typeof valeur === "number" && Number.isInteger(valeur) && valeur >= PREMIERE_VERSION;
}

/** `undefined` si le type racine `contenu` a déjà été lu avec un autre constructeur. */
export function fragmentDuContenu(doc: Y.Doc): Y.XmlFragment | undefined {
  return lireTypeRacine(() => doc.getXmlFragment(TYPE_CONTENU));
}

// Rien n'est inscrit pour la version 1 : un tableau vide vaut 1, règle permanente du format.
export function lireFormeStockee(doc: Y.Doc): FormeStockee {
  const versions = tableauDesVersions(doc);
  if (versions === undefined) {
    return { version: PREMIERE_VERSION, admise: false };
  }
  let version = PREMIERE_VERSION;
  let admise = versions._map.size === 0;
  versions.forEach((valeur) => {
    if (estUneVersion(valeur)) {
      version = Math.max(version, valeur);
    } else {
      admise = false;
    }
  });
  return { version, admise };
}

/** Ajout seul, sans transaction propre. Rend `false` si la forme stockée n'est pas lisible. */
export function inscrireVersion(doc: Y.Doc, version: number): boolean {
  const versions = tableauDesVersions(doc);
  versions?.push([version]);
  return versions !== undefined;
}

/** Observateur simple du type de version : il passe avant tout observateur profond (ADR-0009). */
export function observerVersions(doc: Y.Doc, rappel: () => void): () => void {
  const versions = tableauDesVersions(doc);
  const observateur = (): void => rappel();
  versions?.observe(observateur);
  return () => versions?.unobserve(observateur);
}

function tableauDesVersions(doc: Y.Doc): Y.Array<unknown> | undefined {
  return lireTypeRacine(() => doc.getArray<unknown>(TYPE_VERSIONS));
}

// Yjs lève quand un type racine a déjà été lu avec un autre constructeur.
function lireTypeRacine<T>(lire: () => T): T | undefined {
  try {
    return lire();
  } catch {
    return undefined;
  }
}
