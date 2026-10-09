import type { Editor } from "@tiptap/core";
import { type ReactElement, useEffect, useState } from "react";

import type { NiveauDeTitre } from "./extensions.ts";
import { NOM_DE_LA_BARRE_DE_BLOCS } from "./libelles.ts";

type TypeDeBloc =
  | { readonly forme: "paragraphe" }
  | { readonly forme: "titre"; readonly niveau: NiveauDeTitre }
  | { readonly forme: "liste"; readonly noeud: NoeudDeListe };
type NoeudDeListe = "bulletList" | "orderedList";

interface Commande {
  readonly nom: string;
  readonly type: TypeDeBloc;
}

const ELEMENT_DE_LISTE = "listItem";
const NIVEAU_TROIS = 3;

// Les six commandes de F-003-AC8 : aucune n'écrit un nœud, un attribut ou un niveau hors du schéma.
const COMMANDES: readonly Commande[] = [
  { nom: "Paragraphe", type: { forme: "paragraphe" } },
  { nom: "Titre 1", type: { forme: "titre", niveau: 1 } },
  { nom: "Titre 2", type: { forme: "titre", niveau: 2 } },
  { nom: "Titre 3", type: { forme: "titre", niveau: NIVEAU_TROIS } },
  { nom: "Liste à puces", type: { forme: "liste", noeud: "bulletList" } },
  { nom: "Liste numérotée", type: { forme: "liste", noeud: "orderedList" } },
];

export function BarreDeBlocs({ editeur }: { readonly editeur: Editor | null }): ReactElement {
  const courant = useTypeCourant(editeur);
  return (
    <div className="barre-de-blocs" role="toolbar" aria-label={NOM_DE_LA_BARRE_DE_BLOCS}>
      {COMMANDES.map((commande) => (
        <button
          key={commande.nom}
          type="button"
          aria-pressed={courant !== undefined && memeType(courant, commande.type)}
          disabled={editeur === null}
          // Le clic à la souris ne retire pas le curseur de la zone de saisie.
          onMouseDown={(evenement) => evenement.preventDefault()}
          onClick={() => {
            if (editeur !== null) {
              donnerLeType(editeur, commande.type);
            }
          }}
        >
          {commande.nom}
        </button>
      ))}
    </div>
  );
}

// Le type marqué est celui du bloc où se trouve le curseur : il se relit à chaque transaction.
function useTypeCourant(editeur: Editor | null): TypeDeBloc | undefined {
  const [courant, setCourant] = useState<TypeDeBloc | undefined>(undefined);
  useEffect(() => {
    if (editeur === null) {
      setCourant(undefined);
      return undefined;
    }
    const relire = (): void => {
      const lu = typeDuBlocCourant(editeur);
      setCourant((avant) =>
        avant !== undefined && lu !== undefined && memeType(avant, lu) ? avant : lu,
      );
    };
    relire();
    editeur.on("transaction", relire);
    return () => void editeur.off("transaction", relire);
  }, [editeur]);
  return courant;
}

function memeType(a: TypeDeBloc, b: TypeDeBloc): boolean {
  if (a.forme === "titre" && b.forme === "titre") {
    return a.niveau === b.niveau;
  }
  if (a.forme === "liste" && b.forme === "liste") {
    return a.noeud === b.noeud;
  }
  return a.forme === b.forme;
}

// `undefined` : un bloc que la barre ne sait pas nommer (titre d'un niveau hors de 1 à 3).
function typeDuBlocCourant(editeur: Editor): TypeDeBloc | undefined {
  const { $from } = editeur.state.selection;
  const liste = listesAutour(editeur).at(-1);
  if (liste !== undefined) {
    return { forme: "liste", noeud: liste };
  }
  if ($from.parent.type.name !== "heading") {
    return { forme: "paragraphe" };
  }
  const commande = COMMANDES.find(
    ({ type }) => type.forme === "titre" && type.niveau === $from.parent.attrs.level,
  );
  return commande?.type;
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

// Toute modification part par les commandes de l'éditeur, sans transaction englobante : elle
// entre ainsi dans l'historique d'annulation de la liaison (spec H9).
function donnerLeType(editeur: Editor, type: TypeDeBloc): void {
  // Le focus revient à la zone de saisie tout de suite. La commande `focus()` de Tiptap le rend à
  // l'image suivante : elle le reprenait au bouton rejoint au clavier entre-temps, et la touche
  // d'activation partait alors dans le texte (F-003-AC16).
  editeur.view.focus();
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
