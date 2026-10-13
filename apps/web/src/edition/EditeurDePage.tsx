import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { type KeyboardEvent, type ReactElement, useEffect, useRef, useState } from "react";
import type * as Y from "yjs";

import {
  BarreDeBlocs,
  type CommandeDeBloc,
  ZoneDEdition,
  ZoneDeSaisie,
} from "../interface/composants/Edition.tsx";
import { NOM_DE_LA_BARRE_DE_BLOCS, NOM_DE_LA_ZONE_DE_SAISIE } from "../interface/messages.ts";
import { type Barre, useBarre } from "./barre.ts";
import { extensionsDeLEditeur } from "./schema.ts";
import { COMMANDES_DE_TYPE, donnerLeType, memeType } from "./types-de-bloc.ts";

export interface ProprietesEditeurDePage {
  /** Fragment du document de page, fourni par sa façade : seul type où l'éditeur écrit. */
  readonly contenu: Y.XmlFragment;
  /** Garde de version : son rappel détruit l'éditeur et sa liaison (F-003-AC29). */
  readonly garderVersion: (rappel: () => void) => () => void;
  /** Vrai si la frappe est le raccourci déclaré qui mène à la barre de blocs (F-003-AC42). */
  readonly meneALaBarre: (frappe: KeyboardEvent<HTMLElement>) => boolean;
}

export function EditeurDePage(props: ProprietesEditeurDePage): ReactElement {
  const editeur = useEditeur(props.contenu, props.garderVersion);
  const zone = useRef<HTMLDivElement>(null);
  const refBarre = useRef<HTMLDivElement>(null);
  const barre = useBarre(editeur, { zone, barre: refBarre });
  const allerALaBarre = (frappe: KeyboardEvent<HTMLElement>): void => {
    if (barre.affichee && props.meneALaBarre(frappe)) {
      frappe.preventDefault();
      refBarre.current?.querySelector("button")?.focus();
    }
  };
  return (
    <ZoneDEdition
      ref={zone}
      surFocus={barre.surFocus}
      surPerteDeFocus={barre.surPerteDeFocus}
      surTouche={allerALaBarre}
    >
      <ZoneDeSaisie>
        <EditorContent editor={editeur} />
      </ZoneDeSaisie>
      {editeur !== null && barre.affichee && (
        <BarreDeBlocs
          ref={refBarre}
          nom={NOM_DE_LA_BARRE_DE_BLOCS}
          commandes={commandesDe(editeur, barre)}
          position={barre.placement}
          surAbandon={() => editeur.view.focus()}
        />
      )}
    </ZoneDEdition>
  );
}

// L'activation applique le type, puis rend le focus à la zone de saisie, tout de suite : la
// commande `focus()` de la bibliothèque le rendrait à l'image suivante (F-003-AC42).
function commandesDe(editeur: Editor, barre: Barre): CommandeDeBloc[] {
  return COMMANDES_DE_TYPE.map(({ nom, repere, type }) => ({
    nom,
    repere,
    active: memeType(barre.courant, type),
    surActivation: () => {
      donnerLeType(editeur, type);
      editeur.view.focus();
    },
  }));
}

function creerLEditeur(contenu: Y.XmlFragment): Editor {
  return new Editor({
    extensions: extensionsDeLEditeur(contenu),
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": NOM_DE_LA_ZONE_DE_SAISIE,
      },
    },
  });
}

// Pas de `useEditor` : sous `StrictMode` il laisserait vivre un instant une seconde liaison, que la
// garde ne détruirait pas et qui retirerait du document tout nœud inconnu. Ici, un éditeur par
// passage de l'effet, la garde posée avant que la liaison n'existe, et sa destruction dans le
// nettoyage (F-003-AC29, AC33).
function useEditeur(
  contenu: Y.XmlFragment,
  garderVersion: ProprietesEditeurDePage["garderVersion"],
): Editor | null {
  const [editeur, setEditeur] = useState<Editor | null>(null);
  useEffect(() => {
    let cree: Editor | undefined = undefined;
    const detruire = (): void => {
      if (cree?.isDestroyed === false) {
        cree.destroy();
      }
      setEditeur(null);
    };
    const cesserDeGarder = garderVersion(detruire);
    cree = creerLEditeur(contenu);
    setEditeur(cree);
    return () => {
      cesserDeGarder();
      detruire();
    };
  }, [contenu, garderVersion]);
  return editeur;
}
