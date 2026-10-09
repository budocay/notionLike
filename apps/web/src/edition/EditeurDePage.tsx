import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { type ReactElement, useEffect, useState } from "react";
import type * as Y from "yjs";

import { BarreDeBlocs } from "./BarreDeBlocs.tsx";
import { extensionsDeLEditeur } from "./extensions.ts";
import { NOM_DE_LA_ZONE_DE_SAISIE, TEXTE_D_INVITE } from "./libelles.ts";

export interface ProprietesEditeurDePage {
  readonly contenu: Y.XmlFragment;
  readonly garderVersion: (rappel: () => void) => () => void;
}

export function EditeurDePage({ contenu, garderVersion }: ProprietesEditeurDePage): ReactElement {
  const editeur = useEditeur(contenu, garderVersion);
  const vide = useEstVide(editeur);
  return (
    <div className="edition">
      <BarreDeBlocs editeur={editeur} />
      <div className="edition-saisie">
        {vide && (
          <p className="edition-invite" aria-hidden="true">
            {TEXTE_D_INVITE}
          </p>
        )}
        <EditorContent editor={editeur} />
      </div>
    </div>
  );
}

// Pas de `useEditor` : sous `StrictMode` il laisse vivre un instant une seconde liaison, que la
// garde ne détruit pas et qui retire du document tout nœud inconnu. Ici, un éditeur par passage
// de l'effet, la garde posée avant tout autre observateur de la liaison, et sa destruction dans
// le nettoyage (F-003-AC29).
function useEditeur(
  contenu: Y.XmlFragment,
  garderVersion: ProprietesEditeurDePage["garderVersion"],
): Editor | null {
  const [editeur, setEditeur] = useState<Editor | null>(null);
  useEffect(() => {
    // La garde est posée avant que la liaison n'existe, et détruit l'éditeur dans l'observateur.
    let cree: Editor | undefined = undefined;
    const cesserDeGarder = garderVersion(() => {
      cree?.destroy();
      setEditeur(null);
    });
    cree = new Editor({
      extensions: extensionsDeLEditeur(contenu),
      editorProps: {
        attributes: {
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": NOM_DE_LA_ZONE_DE_SAISIE,
        },
      },
    });
    setEditeur(cree);
    return () => {
      cesserDeGarder();
      cree?.destroy();
      setEditeur(null);
    };
  }, [contenu, garderVersion]);
  return editeur;
}

// Le texte d'invite ne fait pas partie du contenu : React l'affiche tant que l'éditeur est vide.
function useEstVide(editeur: Editor | null): boolean {
  const [vide, setVide] = useState(true);
  useEffect(() => {
    if (editeur === null) {
      return undefined;
    }
    const relire = (): void => setVide(editeur.isEmpty);
    relire();
    editeur.on("transaction", relire);
    return () => void editeur.off("transaction", relire);
  }, [editeur]);
  return vide;
}
