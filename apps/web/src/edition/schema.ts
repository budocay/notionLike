// Schéma fermé du document de page, dernière ligne de la table des versions (F-003-AC22, H2 ;
// F-028-AC19 ; F-005-AC23) : paquets unitaires, sans kit de départ, qui s'élargirait en silence.
// L'annulation est celle de la liaison Yjs : elle ne défait que les modifications locales (H9).
import { type Editor, type Extensions, markInputRule } from "@tiptap/core";
import { Bold, underscoreInputRegex as SOULIGNES_DU_GRAS } from "@tiptap/extension-bold";
import { Collaboration } from "@tiptap/extension-collaboration";
import { Document } from "@tiptap/extension-document";
import { Heading } from "@tiptap/extension-heading";
import { Italic, underscoreInputRegex as SOULIGNE_DE_L_ITALIQUE } from "@tiptap/extension-italic";
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { Dropcursor } from "@tiptap/extensions";
import type * as Y from "yjs";

import { CLASSE_DU_CURSEUR_DE_DEPOT } from "../interface/composants/Edition.tsx";
import { INVITE_DU_BLOC_VIDE } from "../interface/messages.ts";
import { BlocCode } from "./bloc-code.ts";
import { colorationDuBlocCode } from "./coloration.ts";
import { depotDeLEditeur, type OptionsDuDepot } from "./depot.ts";
import { inviteDuBlocVide } from "./invite.ts";
import { Lien } from "./lien.ts";
import { marquesDeLEditeur, type OptionsDesMarques } from "./marques.ts";
import { menuSlash, type OptionsDuMenu } from "./menu-slash.ts";
import { selectionDuNavigateur } from "./selection-du-navigateur.ts";
import { BLOC_CODE, NIVEAUX_DE_TITRE } from "./commandes-de-bloc.ts";
import { bornesLues } from "./types-de-bloc.ts";

// `**texte**` et `*texte*` (F-028-AC3) : « texte » non vide, sans espace en tête ni en fin. Les
// règles des extensions marquent aussi ` texte` et `texte ` : elles sont remplacées. Les variantes
// `__texte__` et `_texte_` restent celles des extensions (H6 f).
const TEXTE_SANS_ESPACE_AUX_BORDS = String.raw`[^*\s](?:[^*]*[^*\s])?`;
const GRAS_PAR_ETOILES = new RegExp(
  String.raw`(?:^|\s)(\*\*(${TEXTE_SANS_ESPACE_AUX_BORDS})\*\*)$`,
);
const ITALIQUE_PAR_ETOILES = new RegExp(
  String.raw`(?:^|\s)(\*(${TEXTE_SANS_ESPACE_AUX_BORDS})\*)$`,
);

const Gras = Bold.extend({
  addInputRules() {
    return [GRAS_PAR_ETOILES, SOULIGNES_DU_GRAS].map((find) =>
      markInputRule({ find, type: this.type }),
    );
  },
});

const Italique = Italic.extend({
  addInputRules() {
    return [ITALIQUE_PAR_ETOILES, SOULIGNE_DE_L_ITALIQUE].map((find) =>
      markInputRule({ find, type: this.type }),
    );
  },
});

function dansUnBlocCode(editeur: Editor): boolean {
  return bornesLues(editeur.state.selection).$from.parent.type.name === BLOC_CODE;
}

// Dans un bloc code d'un élément de liste, Entrée insère un saut de ligne (F-005-AC3) et Tab ne
// modifie rien (F-005-AC5, H6) : les raccourcis de l'élément de liste n'y agissent pas.
const ElementDeListe = ListItem.extend({
  addKeyboardShortcuts() {
    const raccourcis = this.parent?.() ?? {};
    return Object.fromEntries(
      Object.entries(raccourcis).map(([touche, action]) => [
        touche,
        (proprietes: Parameters<typeof action>[0]) =>
          !dansUnBlocCode(proprietes.editor) && action(proprietes),
      ]),
    );
  },
});

// Curseur de dépôt (F-006-AC15, AC37) : un trait de deux pixels, sans couleur propre ; sa couleur
// vient de la classe de l'application, donc des jetons. Ni nœud, ni attribut, ni marque.
const EPAISSEUR_DU_CURSEUR_DE_DEPOT = 2;

export function extensionsDeLEditeur(
  contenu: Y.XmlFragment,
  marques: OptionsDesMarques,
  depot: OptionsDuDepot,
  menu: OptionsDuMenu,
): Extensions {
  return [
    Document,
    Paragraph,
    Text,
    Heading.configure({ levels: [...NIVEAUX_DE_TITRE] }),
    BulletList,
    OrderedList,
    ElementDeListe,
    BlocCode,
    // F-033 : coloration du bloc code, par des décorations de la vue seule (F-033-AC5).
    colorationDuBlocCode,
    Gras,
    Italique,
    Lien,
    marquesDeLEditeur(marques),
    Collaboration.configure({ fragment: contenu }),
    inviteDuBlocVide(INVITE_DU_BLOC_VIDE),
    selectionDuNavigateur,
    Dropcursor.configure({
      color: false,
      width: EPAISSEUR_DU_CURSEUR_DE_DEPOT,
      class: CLASSE_DU_CURSEUR_DE_DEPOT,
    }),
    depotDeLEditeur(depot),
    menuSlash(menu),
  ];
}
