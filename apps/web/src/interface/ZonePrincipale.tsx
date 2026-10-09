import type { PageLue } from "@notionlike/document";
import type { ReactElement, Ref } from "react";

import { Principale } from "./composants/Coquille.tsx";
import { EntetePage } from "./composants/Etats.tsx";
import {
  EXPLICATION_PAGE_INTROUVABLE,
  INVITATION_CHOISIR_UNE_PAGE,
  INVITATION_PREMIERE_PAGE,
  NOM_APPLICATION,
  PAGE_INTROUVABLE,
  titreAffiche,
} from "./messages.ts";

/** Ce que l'adresse désigne, confronté à l'arborescence lue. */
export type Selection =
  | { readonly type: "accueil" }
  | { readonly type: "page"; readonly page: PageLue }
  | { readonly type: "introuvable" };

interface Proprietes {
  readonly selection: Selection;
  readonly espaceVide: boolean;
  /** Le focus y est porté quand une page est choisie dans le tiroir (F-004-AC42). */
  readonly ref?: Ref<HTMLElement> | undefined;
}

// La clé rejoue l'apparition du contenu quand la page sélectionnée change (F-004-AC14).
function entete({ selection, espaceVide }: Proprietes): ReactElement {
  if (selection.type === "page") {
    return <EntetePage key={selection.page.id} titre={titreAffiche(selection.page.titre)} />;
  }
  if (selection.type === "introuvable") {
    return <EntetePage titre={PAGE_INTROUVABLE} explication={EXPLICATION_PAGE_INTROUVABLE} />;
  }
  return (
    <EntetePage
      titre={NOM_APPLICATION}
      explication={espaceVide ? INVITATION_PREMIERE_PAGE : INVITATION_CHOISIR_UNE_PAGE}
    />
  );
}

export function ZonePrincipale(props: Proprietes): ReactElement {
  return <Principale ref={props.ref}>{entete(props)}</Principale>;
}
