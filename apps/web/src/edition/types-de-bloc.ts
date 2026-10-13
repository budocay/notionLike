// Les types de bloc que la barre de blocs sait donner (F-003-AC8) et lire. Aucune commande n'écrit
// un nœud, un attribut ou un niveau hors du schéma (F-003-AC17).
import type { Editor } from "@tiptap/core";

import { type NiveauDeTitre, NIVEAUX_DE_TITRE } from "./schema.ts";

type NoeudDeListe = "bulletList" | "orderedList";

export type TypeDeBloc =
  | { readonly forme: "paragraphe" }
  | { readonly forme: "titre"; readonly niveau: NiveauDeTitre }
  | { readonly forme: "liste"; readonly noeud: NoeudDeListe };

export interface CommandeDeType {
  readonly nom: string;
  /** Ce que la barre montre sur le bouton. */
  readonly repere: string;
  readonly type: TypeDeBloc;
}

const ELEMENT_DE_LISTE = "listItem";
const TITRE = "heading";

export const COMMANDES_DE_TYPE: readonly CommandeDeType[] = [
  { nom: "Paragraphe", repere: "¶", type: { forme: "paragraphe" } },
  ...NIVEAUX_DE_TITRE.map((niveau): CommandeDeType => ({
    nom: `Titre ${niveau}`,
    repere: `T${niveau}`,
    type: { forme: "titre", niveau },
  })),
  { nom: "Liste à puces", repere: "•", type: { forme: "liste", noeud: "bulletList" } },
  { nom: "Liste numérotée", repere: "1.", type: { forme: "liste", noeud: "orderedList" } },
];

export function memeType(a: TypeDeBloc | undefined, b: TypeDeBloc): boolean {
  if (a === undefined) {
    return false;
  }
  if (a.forme === "titre" && b.forme === "titre") {
    return a.niveau === b.niveau;
  }
  if (a.forme === "liste" && b.forme === "liste") {
    return a.noeud === b.noeud;
  }
  return a.forme === b.forme;
}

/** `undefined` : un bloc que la barre ne sait pas nommer (titre d'un niveau hors de 1 à 3). */
export function typeDuBlocCourant(editeur: Editor): TypeDeBloc | undefined {
  const { $from } = editeur.state.selection;
  const liste = listesAutour(editeur).at(-1);
  if (liste !== undefined) {
    return { forme: "liste", noeud: liste };
  }
  if ($from.parent.type.name !== TITRE) {
    return { forme: "paragraphe" };
  }
  const niveau: unknown = $from.parent.attrs.level;
  return COMMANDES_DE_TYPE.map(({ type }) => type).find(
    (type) => type.forme === "titre" && type.niveau === niveau,
  );
}

/** Les listes qui contiennent le curseur, de la plus extérieure à la plus proche. */
function listesAutour(editeur: Editor): NoeudDeListe[] {
  const { $from } = editeur.state.selection;
  const listes: NoeudDeListe[] = [];
  for (let profondeur = 1; profondeur <= $from.depth; profondeur += 1) {
    const nom = $from.node(profondeur).type.name;
    if (nom === "bulletList" || nom === "orderedList") {
      listes.push(nom);
    }
  }
  return listes;
}

// Toute modification part par les commandes de l'éditeur, sans transaction englobante : elle entre
// ainsi dans l'historique d'annulation de la liaison (H9).
export function donnerLeType(editeur: Editor, type: TypeDeBloc): void {
  const chaine = editeur.chain();
  const listes = listesAutour(editeur);
  if (type.forme === "liste") {
    if (listes.at(-1) !== type.noeud) {
      // Un élément de liste commence par un paragraphe : un titre le redevient d'abord.
      chaine.setParagraph();
      if (type.noeud === "bulletList") {
        chaine.toggleBulletList();
      } else {
        chaine.toggleOrderedList();
      }
    }
  } else {
    // Le bloc sort de toutes les listes qui l'entourent avant de changer de type.
    listes.forEach(() => chaine.liftListItem(ELEMENT_DE_LISTE));
    if (type.forme === "titre") {
      chaine.setHeading({ level: type.niveau });
    } else {
      chaine.setParagraph();
    }
  }
  chaine.run();
}
