// Ce que l'éditeur fait des marques au-delà des extensions : il élève la version du document avant
// d'y inscrire un élément d'une version supérieure (F-028-AC21), refuse tout lien d'adresse refusée
// demandé par une commande et sort de tout lien refusé le texte saisi dans son étendue (F-028-AC18,
// AC32, H5), pose un lien au collage d'une adresse seule sur une sélection (F-028-AC9) et ouvre un
// lien au clic avec Mod (F-028-AC10).
import { Extension, getMarkRange } from "@tiptap/core";
import type {
  Fragment,
  Mark,
  Node as NoeudProseMirror,
  ResolvedPos,
  Slice,
} from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { AddMarkStep, AddNodeMarkStep, ReplaceAroundStep, ReplaceStep } from "@tiptap/pm/transform";

import { adresseAcceptee, estUneAdresseNormalisee, estUneAdresseWeb } from "./adresses.ts";
import { ATTRIBUTS_IMPOSES, NOM_DE_LA_MARQUE_DE_LIEN } from "./lien.ts";

/** Noms des nœuds et des marques qu'une modification s'apprête à inscrire dans le document. */
export interface ElementsInscrits {
  readonly noeuds: readonly string[];
  readonly marques: readonly string[];
}

export interface OptionsDesMarques {
  /**
   * Élève la version du document, s'il le faut, avant l'inscription de ces éléments ; faux si elle
   * ne peut pas l'être : la modification n'est alors pas faite.
   */
  readonly preparerLaVersion: (elements: ElementsInscrits) => boolean;
  /** Vrai pour un clic qui ouvre l'adresse d'un lien : Mod enfoncé (F-028-AC10). */
  readonly ouvreLAdresse: (clic: MouseEvent) => boolean;
}

// Clé de la liaison Yjs (`new PluginKey("y-sync")`) : une transaction qui la porte avec
// `isChangeOrigin` applique au document de l'éditeur ce que Yjs a reçu ou annulé ; elle n'inscrit
// rien de local.
const CLE_DE_LA_LIAISON = "y-sync$";

export function estAppliqueeDepuisYjs(transaction: Transaction): boolean {
  const meta: unknown = transaction.getMeta(CLE_DE_LA_LIAISON);
  return typeof meta === "object" && meta !== null && "isChangeOrigin" in meta
    ? meta.isChangeOrigin === true
    : false;
}

function estUnLien(marque: Mark): boolean {
  return marque.type.name === NOM_DE_LA_MARQUE_DE_LIEN;
}

function estUnLienRefuse(marque: Mark): boolean {
  return estUnLien(marque) && !estUneAdresseNormalisee(marque.attrs.href);
}

function contenuInsere(etape: unknown): Slice | undefined {
  return etape instanceof ReplaceStep || etape instanceof ReplaceAroundStep
    ? etape.slice
    : undefined;
}

function marqueAjoutee(etape: unknown): Mark | undefined {
  return etape instanceof AddMarkStep || etape instanceof AddNodeMarkStep ? etape.mark : undefined;
}

function marquesDuDocument(document: NoeudProseMirror, filtre: (marque: Mark) => boolean): Mark[] {
  const trouvees: Mark[] = [];
  document.descendants((noeud) => {
    trouvees.push(...noeud.marks.filter(filtre));
  });
  return trouvees;
}

// Un lien d'adresse refusée n'entre dans le document par aucune commande (F-028-AC18, AC32). Seul
// passe celui qui y était déjà, reçu d'un autre client et neutralisé au rendu (H5) : le déplacer ne
// le crée pas, et le texte saisi dans son étendue en sort aussitôt (`texteHorsDesLiensRefuses`).
function liensAdmis(transaction: Transaction): boolean {
  if ((transaction.storedMarks ?? []).some(estUnLienRefuse)) {
    return false;
  }
  const inseres: Mark[] = [];
  for (const etape of transaction.steps) {
    const ajoutee = marqueAjoutee(etape);
    if (ajoutee !== undefined && estUnLienRefuse(ajoutee)) {
      return false;
    }
    contenuInsere(etape)?.content.descendants((noeud) => {
      inseres.push(...noeud.marks.filter(estUnLienRefuse));
    });
  }
  if (inseres.length === 0) {
    return true;
  }
  const presents = marquesDuDocument(transaction.before, estUnLienRefuse);
  return inseres.every((insere) => presents.some((present) => present.eq(insere)));
}

/** Un texte qui porte un lien refusé, et sa place dans un document. */
interface TexteSousUnLienRefuse {
  readonly de: number;
  readonly a: number;
  readonly texte: string;
  readonly lien: Mark;
}

function textesSousUnLienRefuse(contenu: Fragment, debut: number): TexteSousUnLienRefuse[] {
  const trouves: TexteSousUnLienRefuse[] = [];
  contenu.descendants((noeud, position) => {
    const lien = noeud.isText ? noeud.marks.find(estUnLienRefuse) : undefined;
    if (lien !== undefined) {
      const de = debut + position;
      trouves.push({ de, a: de + noeud.nodeSize, texte: noeud.text ?? "", lien });
    }
  });
  return trouves;
}

// Les textes qu'une transaction inscrit sous un lien refusé, placés dans le document qu'elle
// produit ; sauf ceux qu'elle déplace, retirés sous le même lien par la même transaction (H5).
function textesNouveauxSousUnLienRefuse(transaction: Transaction): TexteSousUnLienRefuse[] {
  const retires: TexteSousUnLienRefuse[] = [];
  const inscrits: TexteSousUnLienRefuse[] = [];
  transaction.steps.forEach((etape, rang) => {
    const avant = transaction.docs[rang];
    if (!(etape instanceof ReplaceStep) || avant === undefined) {
      return;
    }
    retires.push(...textesSousUnLienRefuse(avant.slice(etape.from, etape.to).content, 0));
    const suite = transaction.mapping.slice(rang + 1);
    const debut = etape.from - etape.slice.openStart;
    for (const inscrit of textesSousUnLienRefuse(etape.slice.content, debut)) {
      inscrits.push({ ...inscrit, de: suite.map(inscrit.de, 1), a: suite.map(inscrit.a, -1) });
    }
  });
  const deplace = (inscrit: TexteSousUnLienRefuse): boolean =>
    retires.some(({ lien, texte }) => lien.eq(inscrit.lien) && texte === inscrit.texte);
  return inscrits.filter((inscrit) => !deplace(inscrit));
}

/**
 * Le texte qu'une modification locale inscrit dans l'étendue d'un lien refusé reçu en hériterait
 * (F-028-AC18, H5) : il en sort, avant que la liaison n'écrive dans Yjs, et le lien garde son
 * étendue d'origine. Rend la transaction qui l'en sort, ou `null` s'il n'y a rien à sortir.
 */
export function texteHorsDesLiensRefuses(
  transactions: readonly Transaction[],
  etat: EditorState,
): Transaction | null {
  const sortie = etat.tr;
  transactions.forEach((transaction, rang) => {
    if (estAppliqueeDepuisYjs(transaction) || !transaction.docChanged) {
      return;
    }
    const suivantes = transactions.slice(rang + 1);
    for (const { de, a, lien } of textesNouveauxSousUnLienRefuse(transaction)) {
      const [debut, fin] = suivantes.reduce(
        ([d, f], une) => [une.mapping.map(d, 1), une.mapping.map(f, -1)],
        [de, a],
      );
      if (debut < fin) {
        sortie.removeMark(debut, fin, lien);
      }
    }
  });
  return sortie.docChanged ? sortie : null;
}

/** Nœuds et marques que les étapes d'une transaction inscrivent. */
export function elementsInscrits(transaction: Transaction): ElementsInscrits {
  const noeuds = new Set<string>();
  const marques = new Set<string>();
  for (const etape of transaction.steps) {
    const ajoutee = marqueAjoutee(etape);
    if (ajoutee !== undefined) {
      marques.add(ajoutee.type.name);
    }
    contenuInsere(etape)?.content.descendants((noeud) => {
      noeuds.add(noeud.type.name);
      noeud.marks.forEach((marque) => marques.add(marque.type.name));
    });
  }
  return { noeuds: [...noeuds].sort(), marques: [...marques].sort() };
}

/** Le lien qui contient le curseur ou la sélection, avec son étendue ; `undefined` hors d'un lien. */
export interface LienCourant {
  readonly de: number;
  readonly a: number;
  /** L'adresse enregistrée, telle quelle : refusée peut-être, jamais interprétée. */
  readonly adresse: unknown;
}

function lienA(position: ResolvedPos): LienCourant | undefined {
  const voisins = [position.nodeAfter, position.nodeBefore];
  const marque = voisins.flatMap((noeud) => noeud?.marks ?? []).find(estUnLien);
  if (marque === undefined) {
    return undefined;
  }
  const etendue = getMarkRange(position, marque.type, marque.attrs);
  return etendue === undefined
    ? undefined
    : { de: etendue.from, a: etendue.to, adresse: marque.attrs.href };
}

/** Le lien sous le curseur, ou le seul lien d'une sélection contenue dans son étendue. */
export function lienCourant(etat: EditorState): LienCourant | undefined {
  const { $from, $to, empty } = etat.selection;
  const lien = lienA($from);
  if (lien === undefined || (!empty && $to.pos > lien.a)) {
    return undefined;
  }
  return lien;
}

function lienSousLeClic(etat: EditorState, position: number): LienCourant | undefined {
  return lienA(etat.doc.resolve(position));
}

/** Ouvre l'adresse par l'activation d'un élément `a` aux attributs imposés, et rien d'autre. */
export function ouvrirLAdresse(document: Document, adresse: string): void {
  const element = document.createElement("a");
  element.href = adresse;
  element.rel = ATTRIBUTS_IMPOSES.rel;
  element.target = ATTRIBUTS_IMPOSES.target;
  element.click();
}

// Le texte collé, tel que le presse-papiers le donne ; à défaut, celui du contenu lu.
function texteColle(evenement: ClipboardEvent, contenu: Slice): string {
  const brut = evenement.clipboardData?.getData("text/plain") ?? "";
  return brut === "" ? contenu.content.textBetween(0, contenu.content.size, "\n") : brut;
}

/** L'adresse web écrite en toutes lettres qu'est ce texte, seule ; `undefined` sinon (F-028-AC9). */
export function adresseSeuleCollee(texte: string): string | undefined {
  const seule = texte.trim();
  if (/\s/.test(seule) || !/^https?:/i.test(seule)) {
    return undefined;
  }
  const adresse = adresseAcceptee(seule);
  return adresse !== undefined && estUneAdresseWeb(adresse) ? adresse : undefined;
}

/** Vrai si la sélection n'est pas vide et tient dans un seul bloc de texte. */
export function selectionDansUnBloc(etat: EditorState): boolean {
  const { $from, $to, empty } = etat.selection;
  return !empty && $from.sameParent($to) && $from.parent.isTextblock;
}

export function marquesDeLEditeur(options: OptionsDesMarques): Extension {
  return Extension.create({
    name: "marquesDeLEditeur",
    addProseMirrorPlugins() {
      const { editor } = this;
      return [
        new Plugin({
          key: new PluginKey("marquesDeLEditeur"),
          // Appelé avant que la transaction ne soit appliquée, donc avant que la liaison n'écrive
          // dans Yjs : l'élévation part dans sa propre transaction Yjs, avant celle de la marque,
          // et n'englobe jamais l'inscription (F-028-AC21, H3).
          filterTransaction: (transaction) => {
            if (estAppliqueeDepuisYjs(transaction)) {
              return true;
            }
            if (!liensAdmis(transaction)) {
              return false;
            }
            return (
              !transaction.docChanged || options.preparerLaVersion(elementsInscrits(transaction))
            );
          },
          // Passe après chaque modification et avant la vue, donc avant que la liaison n'écrive
          // dans Yjs : aucune mise à jour ne porte le texte saisi sous un lien refusé.
          appendTransaction: (transactions, _avant, etat) =>
            texteHorsDesLiensRefuses(transactions, etat),
          props: {
            handlePaste: (vue, evenement, contenu) => {
              if (!selectionDansUnBloc(vue.state)) {
                return false;
              }
              const adresse = adresseSeuleCollee(texteColle(evenement, contenu));
              return adresse !== undefined && editor.commands.setLink({ href: adresse });
            },
            handleClick: (vue, position, evenement) => {
              if (!options.ouvreLAdresse(evenement)) {
                return false;
              }
              const adresse = adresseAcceptee(lienSousLeClic(vue.state, position)?.adresse);
              if (adresse === undefined) {
                return false;
              }
              ouvrirLAdresse(vue.dom.ownerDocument, adresse);
              return true;
            },
          },
        }),
      ];
    },
  });
}
