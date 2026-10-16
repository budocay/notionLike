// Marque de lien (F-028-AC15, AC16, AC24, AC31, AC32, H5, H6, H11) : l'extension de lien de Tiptap,
// réduite à l'attribut `href` et privée de tout ce qui pose ou ouvre un lien de lui-même (liaison
// automatique, collage, règles, ouverture au clic). La règle des adresses lui est fournie comme
// validation, et décide aussi, par sa propre fonction, de la lecture d'un collage et du rendu.
import { Link } from "@tiptap/extension-link";

import { adresseAcceptee, estUneAdresseNormalisee } from "./adresses.ts";

export const NOM_DE_LA_MARQUE_DE_LIEN = "link";
/** Fixés par l'application, jamais lus dans le document (F-028-AC16). */
export const ATTRIBUTS_IMPOSES = { rel: "noopener noreferrer", target: "_blank" } as const;
/** Porté par le rendu d'un lien neutralisé, qui n'est pas un élément `a` (F-028-AC15). */
export const ATTRIBUT_DU_LIEN_NEUTRALISE = "data-lien-neutralise";

export const Lien = Link.extend({
  // Le format ne porte que `href` (F-028-AC24) : un autre attribut écrit par un autre client
  // n'atteint ni le contenu lu ni le rendu.
  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: (element: HTMLElement) => adresseAcceptee(element.getAttribute("href")) ?? null,
      },
    };
  },

  // Un élément `a` collé ou déposé ne devient un lien que si son adresse est acceptée ; il porte
  // alors sa forme normalisée et rien d'autre (F-028-AC13).
  parseHTML() {
    return [
      {
        tag: "a[href]",
        getAttrs: (element: HTMLElement) =>
          adresseAcceptee(element.getAttribute("href")) === undefined ? false : null,
      },
    ];
  },

  // Une adresse refusée, absente ou qui n'est pas une chaîne est rendue comme un texte sans cible :
  // ni `a`, ni `href`, ni `target`, ni `rel` (F-028-AC15, H5).
  renderHTML({ mark }) {
    const adresse = adresseAcceptee(mark.attrs.href);
    return adresse === undefined
      ? ["span", { [ATTRIBUT_DU_LIEN_NEUTRALISE]: "" }, 0]
      : ["a", { href: adresse, ...ATTRIBUTS_IMPOSES }, 0];
  },

  // Les commandes `toggleLink` et `setMark` de la bibliothèque rendent `true` même quand la garde
  // des liens (`marques.ts`, `filterTransaction`) écarte leur transaction : leur rendu ne dit pas
  // qu'un lien a été posé, et aucun appelant ne doit s'y fier. `setLink` valide l'adresse par la
  // règle et rend `false` sur un refus (F-028-AC32).

  // Aucun lien automatique : ni à la saisie, ni au collage d'un texte (F-028-AC31, H11).
  addInputRules() {
    return [];
  },
  addPasteRules() {
    return [];
  },
}).configure({
  autolink: false,
  linkOnPaste: false,
  markdownLinks: false,
  openOnClick: false,
  enableClickSelection: false,
  protocols: [],
  HTMLAttributes: { ...ATTRIBUTS_IMPOSES, class: null },
  isAllowedUri: (adresse) => estUneAdresseNormalisee(adresse),
  shouldAutoLink: () => false,
});
