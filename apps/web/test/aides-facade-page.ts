// Seul fichier de test d'apps/web qui ouvre une façade de document de page (F-003-AC35). Chaque
// façade ouverte ici est suivie et fermée en fin de test ; la preuve de la fermeture est le nombre
// d'écouteurs et d'observateurs de chaque `Y.Doc` revenu à sa valeur de départ.
import { type DocumentPage, ouvrirDocumentPage } from "@notionlike/document";
import { afterEach, expect } from "vitest";
import * as Y from "yjs";

// Seul fichier de test d'apps/web qui nomme le type racine du contenu d'une page : ce que la façade
// refuse d'ouvrir (version non prise en charge) y est lu et écrit à la main, comme le ferait une
// réplique plus récente ou forgée.
const TYPE_DU_CONTENU_DE_PAGE = "contenu";

/** Le fragment du contenu, sans passer par la façade : lisible même si la version est refusée. */
export function fragmentBrut(doc: Y.Doc): Y.XmlFragment {
  return doc.getXmlFragment(TYPE_DU_CONTENU_DE_PAGE);
}

/** Un document dont le fragment porte ces blocs, écrits sans façade ni éditeur. */
export function documentForge(...blocs: Y.XmlElement[]): Y.Doc {
  const doc = new Y.Doc();
  fragmentBrut(doc).insert(0, blocs);
  return doc;
}

const departsDesPages = new Map<Y.Doc, number>();
const pagesOuvertes: DocumentPage[] = [];

/** Écouteurs du document et observateurs, simples et profonds, de chacun de ses types racine. */
export function observateursDuDocument(doc: Y.Doc): number {
  let compte = 0;
  doc._observers.forEach((ecouteurs) => {
    compte += ecouteurs.size;
  });
  doc.share.forEach((type) => {
    compte += type._eH.l.length + type._dEH.l.length;
  });
  return compte;
}

/** Note le compte de départ d'un document, avant tout ce qu'un test y pose. */
export function suivreLeDocument(doc: Y.Doc): void {
  if (!departsDesPages.has(doc)) {
    departsDesPages.set(doc, observateursDuDocument(doc));
  }
}

export function ouvrirFacadeDePage(doc: Y.Doc): DocumentPage {
  suivreLeDocument(doc);
  const page = ouvrirDocumentPage(doc);
  pagesOuvertes.push(page);
  return page;
}

/** Contenu lu d'un document de page : la suite de ses blocs, types, niveaux, imbrication et texte. */
export function contenuLu(doc: Y.Doc): string {
  return ouvrirFacadeDePage(doc).contenu.toString();
}

/**
 * Une réplique partie de l'état courant du document, modifiée par sa façade, et la mise à jour
 * qu'elle émet : ce qu'une autre application enverrait.
 */
export function miseAJourDUneReplique(
  doc: Y.Doc,
  modifier: (replique: DocumentPage) => void,
): Uint8Array {
  const replique = new Y.Doc();
  Y.applyUpdate(replique, Y.encodeStateAsUpdate(doc));
  const etatAvant = Y.encodeStateVector(replique);
  const facade = ouvrirDocumentPage(replique);
  try {
    modifier(facade);
  } finally {
    facade.fermer();
  }
  return Y.encodeStateAsUpdate(replique, etatAvant);
}

/** Un bloc de ce nom, avec ce texte, tel qu'une réplique l'écrit dans le fragment. */
export function bloc(
  nom: string,
  texte: string,
  attributs: Record<string, string | number> = {},
): Y.XmlElement {
  const element = new Y.XmlElement<Record<string, string | number>>(nom);
  Object.entries(attributs).forEach(([cle, valeur]) => element.setAttribute(cle, valeur));
  if (texte !== "") {
    element.insert(0, [new Y.XmlText(texte)]);
  }
  return element as Y.XmlElement;
}

/** Ajoute des blocs à la fin du contenu d'une réplique. */
export function ajouter(replique: DocumentPage, ...blocs: Y.XmlElement[]): void {
  replique.contenu.insert(replique.contenu.length, blocs);
}

export interface Inventaire {
  /** Nom de chaque nœud inscrit dans le fragment, avec les attributs qu'il y porte, triés. */
  readonly noeuds: Readonly<Record<string, readonly string[]>>;
  /** Noms des marques : les attributs de mise en forme portés par un texte. */
  readonly marques: readonly string[];
}

/** Tout ce que le fragment du contenu porte : nœuds, attributs et marques, sans le texte. */
export function inventaireDuContenu(doc: Y.Doc): Inventaire {
  const noeuds = new Map<string, Set<string>>();
  const marques = new Set<string>();
  const visiter = (element: Y.XmlElement | Y.XmlText | Y.XmlHook): void => {
    if (element instanceof Y.XmlText) {
      const morceaux = element.toDelta() as { attributes?: Record<string, unknown> }[];
      morceaux.forEach(({ attributes }) =>
        Object.keys(attributes ?? {}).forEach((marque) => marques.add(marque)),
      );
    } else if (element instanceof Y.XmlElement) {
      const attributs = noeuds.get(element.nodeName) ?? new Set<string>();
      Object.keys(element.getAttributes()).forEach((attribut) => attributs.add(attribut));
      noeuds.set(element.nodeName, attributs);
      element.toArray().forEach(visiter);
    }
  };
  fragmentBrut(doc).toArray().forEach(visiter);
  return {
    noeuds: Object.fromEntries(
      [...noeuds]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([nom, attributs]) => [nom, [...attributs].sort()]),
    ),
    marques: [...marques].sort(),
  };
}

/** Observateurs que les documents suivis portent en plus de leur compte de départ. */
export function observateursRestants(): number {
  let restants = 0;
  for (const [doc, depart] of departsDesPages) {
    restants += Math.max(0, observateursDuDocument(doc) - depart);
  }
  return restants;
}

/** Ferme les façades de page ouvertes par cette aide, et rend ce qui reste observé malgré cela. */
export function fermerLesFacadesDePage(): number {
  pagesOuvertes.splice(0).forEach((page) => page.fermer());
  const restants = observateursRestants();
  departsDesPages.clear();
  return restants;
}

afterEach(() => {
  expect(fermerLesFacadesDePage()).toBe(0);
});
