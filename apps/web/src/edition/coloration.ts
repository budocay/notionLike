// Coloration du bloc code (F-033-AC1 à AC12, H1, H5) : un greffon de décorations de l'éditeur, seul
// importateur de la bibliothèque de coloration et de ses grammaires (F-033-AC25). La coloration ne
// vit que dans la vue : rien n'est écrit dans le document, aucune mise à jour Yjs n'en part
// (F-033-AC5). Seules les classes de rôle de la liste fermée sont posées, choisies par la table des
// portées ; le nom de portée de la bibliothèque n'est jamais recopié (F-033-AC6).
import { Extension } from "@tiptap/core";
import type { Node as NoeudProseMirror } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { createLowlight } from "lowlight";

import { CLASSES_DE_ROLE, type RoleSyntaxique } from "../interface/composants/Edition.tsx";
import { raisonSansColoration } from "./colorable.ts";
import { BLOC_CODE } from "./commandes-de-bloc.ts";
import { type Langage, langageAdmis } from "./langages.ts";

// Une grammaire par identifiant de la liste, importée une à une (H1, H7) : `html` est un alias de
// la grammaire `xml`. Aucune détection automatique n'est jamais appelée (F-033-AC2).
const bibliotheque = createLowlight({
  bash,
  css,
  javascript,
  json,
  markdown,
  python,
  sql,
  typescript,
  xml,
  yaml,
});

/** Table des portées (H5) : la portée de la bibliothèque, entière ou par préfixe, vers son rôle. */
const TABLE_DES_PORTEES: Readonly<Record<string, RoleSyntaxique>> = {
  keyword: "motCle",
  built_in: "motCle",
  meta: "motCle",
  "selector-tag": "motCle",
  name: "motCle",
  section: "motCle",
  bullet: "motCle",
  string: "chaine",
  regexp: "chaine",
  symbol: "chaine",
  link: "chaine",
  code: "chaine",
  number: "nombre",
  literal: "nombre",
  comment: "commentaire",
  doctag: "commentaire",
  quote: "commentaire",
  "title.function": "fonction",
  "title.class": "type",
  type: "type",
  emphasis: "type",
  strong: "type",
  attr: "propriete",
  attribute: "propriete",
  property: "propriete",
  variable: "propriete",
  "selector-class": "propriete",
  "selector-id": "propriete",
  "selector-pseudo": "propriete",
  "selector-attr": "propriete",
};

/** Une portion du texte d'un bloc, en unités UTF-16 depuis son début, et son rôle. */
interface Portion {
  readonly de: number;
  readonly a: number;
  readonly role: RoleSyntaxique;
}

/** Ce que la mémoire retient d'un texte : ses portions, ou rien à colorer (trop long, échec). */
type Coloration = readonly Portion[];
const SANS_COLORATION: Coloration = [];

/** Un nœud de l'arbre que rend la bibliothèque, lu par sa forme seule. */
interface NoeudDeLArbre {
  readonly type: string;
  readonly value?: string;
  readonly properties?: { readonly className?: unknown };
  readonly children?: readonly NoeudDeLArbre[];
}

const ENTREES_DE_LA_MEMOIRE = 200;
const PREFIXE_DE_PORTEE = "hljs-";
const SUFFIXE_DE_SOUS_PORTEE = "_";
const SUFFIXE_IGNORE = "__";
const MESSAGE_D_ECHEC = "Coloration du bloc code impossible : bloc affiché sans coloration";

/**
 * La portée d'un élément, d'après ses classes : `hljs-<x>` donne `x`, chaque classe suivante
 * `<y>_` ajoute `.y`, les classes `<z>__` sont ignorées (`['hljs-title', 'function_']` donne
 * `title.function`).
 */
function porteeDe(classes: unknown): string | undefined {
  if (!Array.isArray(classes)) {
    return undefined;
  }
  const [premiere, ...suivantes] = classes.map(String);
  if (premiere?.startsWith(PREFIXE_DE_PORTEE) !== true) {
    return undefined;
  }
  const sousPortees = suivantes
    .filter((classe) => classe.endsWith(SUFFIXE_DE_SOUS_PORTEE) && !classe.endsWith(SUFFIXE_IGNORE))
    .map((classe) => classe.slice(0, -SUFFIXE_DE_SOUS_PORTEE.length));
  return [premiere.slice(PREFIXE_DE_PORTEE.length), ...sousPortees].join(".");
}

/** Le rôle d'une portée, cherché par la portée entière puis par ses préfixes. */
function roleDeLaPortee(portee: string | undefined): RoleSyntaxique | undefined {
  const parties = portee?.split(".") ?? [];
  for (let longueur = parties.length; longueur > 0; longueur -= 1) {
    const role = TABLE_DES_PORTEES[parties.slice(0, longueur).join(".")];
    if (role !== undefined) {
      return role;
    }
  }
  return undefined;
}

/**
 * Les portions de l'arbre, et son texte mis bout à bout. Un élément prend le rôle de l'ancêtre le
 * plus proche que la table connaît : une portée absente de la table ne change pas le rôle hérité.
 */
function portionsDe(racine: NoeudDeLArbre): { portions: Portion[]; texte: string } {
  const portions: Portion[] = [];
  const morceaux: string[] = [];
  let decalage = 0;
  const visiter = (noeud: NoeudDeLArbre, herite: RoleSyntaxique | undefined): void => {
    if (noeud.type === "text") {
      const valeur = noeud.value ?? "";
      morceaux.push(valeur);
      if (herite !== undefined && valeur.length > 0) {
        portions.push({ de: decalage, a: decalage + valeur.length, role: herite });
      }
      decalage += valeur.length;
      return;
    }
    const role =
      noeud.type === "element"
        ? (roleDeLaPortee(porteeDe(noeud.properties?.className)) ?? herite)
        : herite;
    noeud.children?.forEach((enfant) => visiter(enfant, role));
  };
  visiter(racine, undefined);
  return { portions, texte: morceaux.join("") };
}

/**
 * La coloration d'un texte : ses portions, ou rien si la bibliothèque lève ou si son texte ne
 * recolle pas au texte du bloc (F-033-AC11). L'échec est consigné par un message fixe, sans rien du
 * texte ni de l'exception, qui pourrait en citer un extrait.
 */
function colorer(langage: string, texte: string): Coloration {
  try {
    const { portions, texte: recolle } = portionsDe(bibliotheque.highlight(langage, texte));
    if (recolle === texte) {
      return portions;
    }
  } catch {
    // Rien n'est propagé : le bloc reste affiché sans coloration.
  }
  console.error(`${MESSAGE_D_ECHEC} (langage ${langage}).`);
  return SANS_COLORATION;
}

/**
 * Mémoire de coloration d'un éditeur (F-033-AC10, AC11, H6) : par langage et texte, car la liaison
 * recrée les nœuds à chaque mise à jour reçue. Elle garde au plus 200 entrées en plus de celles que
 * le passage en cours a lues, qui ne sont jamais retirées (sans quoi une page de plus de 200 blocs
 * colorables serait recolorée entière à chaque transaction) ; la moins récemment lue part d'abord.
 */
class MemoireDeColoration {
  readonly #entrees = new Map<string, Coloration>();

  /**
   * La coloration d'un texte d'un langage admis. Un texte hors des bornes (H6) n'est ni cherché ni
   * retenu : la mémoire ne garde que des textes colorables, de 10 000 unités au plus, sans quoi un
   * bloc d'un million d'unités y laisserait une clé de cette taille à chaque frappe.
   */
  lire(langage: Langage, texte: string, lues: Set<string>): Coloration {
    if (raisonSansColoration(texte) !== undefined) {
      return SANS_COLORATION;
    }
    const cle = `${langage}\0${texte}`;
    lues.add(cle);
    const connue = this.#entrees.get(cle);
    if (connue !== undefined) {
      this.#entrees.delete(cle);
      this.#entrees.set(cle, connue);
      return connue;
    }
    const nouvelle = colorer(langage, texte);
    this.#entrees.set(cle, nouvelle);
    return nouvelle;
  }

  /** Retire les entrées les plus anciennes au-delà de la borne ; celles du passage restent. */
  borner(lues: ReadonlySet<string>): void {
    for (const cle of this.#entrees.keys()) {
      if (this.#entrees.size - lues.size <= ENTREES_DE_LA_MEMOIRE || lues.has(cle)) {
        return;
      }
      this.#entrees.delete(cle);
    }
  }
}

/** Les décorations de tous les blocs code colorables du document, listes comprises. */
function decorationsDe(document: NoeudProseMirror, memoire: MemoireDeColoration): DecorationSet {
  const decorations: Decoration[] = [];
  const lues = new Set<string>();
  document.descendants((noeud, position) => {
    if (noeud.type.name !== BLOC_CODE) {
      return !noeud.isTextblock;
    }
    const langage = langageAdmis(noeud.attrs.language);
    if (langage !== null) {
      for (const { de, a, role } of memoire.lire(langage, noeud.textContent, lues)) {
        decorations.push(
          Decoration.inline(position + 1 + de, position + 1 + a, { class: CLASSES_DE_ROLE[role] }),
        );
      }
    }
    return false;
  });
  memoire.borner(lues);
  return DecorationSet.create(document, decorations);
}

/**
 * Le greffon : ses décorations sont recalculées, depuis la mémoire, à chaque transaction qui change
 * le document, dès la mise à jour de la vue qui la suit, sans minuterie (F-033-AC4).
 */
export const colorationDuBlocCode = Extension.create({
  name: "colorationDuBlocCode",

  addProseMirrorPlugins() {
    const memoire = new MemoireDeColoration();
    return [
      new Plugin<DecorationSet>({
        key: new PluginKey("colorationDuBlocCode"),
        state: {
          init: (_config, etat) => decorationsDe(etat.doc, memoire),
          apply: (transaction, avant) =>
            transaction.docChanged ? decorationsDe(transaction.doc, memoire) : avant,
        },
        props: {
          decorations(etat) {
            return this.getState(etat);
          },
        },
      }),
    ];
  },
});
