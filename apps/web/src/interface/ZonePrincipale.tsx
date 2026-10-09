import type { PageLue } from "@notionlike/document";
import type { ReactElement } from "react";

import { COQUILLE } from "./composants/coquille.classes.ts";
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
  return <main className={COQUILLE.principale}>{entete(props)}</main>;
}
