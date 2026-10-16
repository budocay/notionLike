// Format du document de page (F-003 H3, H4) : seul fichier qui connaît les noms de ses types racine,
// la forme stockée de sa version et la table des versions.
import type * as Y from "yjs";

export interface LigneDeVersionPage {
  readonly version: number;
  /** Nom de chaque nœud du schéma, avec les noms de ses attributs, triés. */
  readonly noeuds: Readonly<Record<string, readonly string[]>>;
  readonly marques: readonly string[];
  /** Types partagés du document ajoutés à côté du fragment du contenu. */
  readonly typesPartages: readonly string[];
}

const PREMIERE_VERSION = 1;

/**
 * Table des versions du document de page (F-003-AC22), seule liste attendue du format. Une feature
 * qui étend le schéma, ou qui ajoute un type partagé, y ajoute une ligne et ne retouche aucune
 * ligne existante.
 */
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
  // F-028 : gras, italique et lien, ce dernier avec le seul attribut `href` (F-028-AC19, AC24).
  {
    version: 2,
    noeuds: {
      bulletList: [],
      doc: [],
      heading: ["level"],
      listItem: [],
      orderedList: ["start", "type"],
      paragraph: [],
      text: [],
    },
    marques: ["bold", "italic", "link"],
    typesPartages: [],
  },
];

/** Numéro de la dernière ligne de la table. */
export const VERSION_PAGE_PRISE_EN_CHARGE: number =
  TABLE_DES_VERSIONS_PAGE.at(-1)?.version ?? PREMIERE_VERSION;

const TYPE_CONTENU = "contenu";
// Une entrée par version atteinte, jamais retirée : la version lue en est le maximum, quel que soit
// l'ordre des mises à jour (F-003-AC31). Type racine distinct du fragment : l'historique
// d'annulation de l'éditeur, qui ne suit que le fragment, ne défait jamais une version (H4).
const TYPE_VERSIONS = "versions";

export interface FormeStockee {
  /** La plus haute version entière supérieure ou égale à 1 inscrite ; 1 s'il n'y en a aucune. */
  readonly version: number;
  /** Faux si la forme stockée porte autre chose que des versions entières à partir de 1. */
  readonly admise: boolean;
}

export function estUneVersion(valeur: unknown): valeur is number {
  return typeof valeur === "number" && Number.isInteger(valeur) && valeur >= PREMIERE_VERSION;
}

/** `undefined` si ce type racine a déjà été lu sous un autre type partagé. */
export function fragmentDuContenu(doc: Y.Doc): Y.XmlFragment | undefined {
  return lireTypeRacine(() => doc.getXmlFragment(TYPE_CONTENU));
}

/** `undefined` si ce type racine a déjà été lu sous un autre type partagé. */
export function typeDesVersions(doc: Y.Doc): Y.Array<unknown> | undefined {
  return lireTypeRacine(() => doc.getArray<unknown>(TYPE_VERSIONS));
}

// Rien n'est inscrit pour la version 1 : un type vide vaut 1, règle permanente du format (H4). Des
// entrées nommées, qu'un tableau ne porte jamais, sont l'écriture d'un autre type sous ce nom.
export function lireFormeStockee(versions: Y.Array<unknown>): FormeStockee {
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

export function estPriseEnCharge(forme: FormeStockee): boolean {
  return forme.admise && forme.version <= VERSION_PAGE_PRISE_EN_CHARGE;
}

/** Ajout seul : aucune version inscrite n'est jamais retirée ni remplacée. */
export function inscrireVersion(versions: Y.Array<unknown>, version: number): void {
  versions.push([version]);
}

// Yjs lève quand un type racine a déjà été lu sous un autre type partagé.
function lireTypeRacine<T>(lire: () => T): T | undefined {
  try {
    return lire();
  } catch {
    return undefined;
  }
}
