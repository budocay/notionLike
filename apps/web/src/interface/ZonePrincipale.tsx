import type { PageLue } from "@notionlike/document";
import type { ReactElement } from "react";

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

export function ZonePrincipale({ selection, espaceVide }: Proprietes): ReactElement {
  if (selection.type === "page") {
    return (
      <main className="zone-principale">
        <h1>{titreAffiche(selection.page.titre)}</h1>
      </main>
    );
  }
  if (selection.type === "introuvable") {
    return (
      <main className="zone-principale">
        <h1>{PAGE_INTROUVABLE}</h1>
        <p>{EXPLICATION_PAGE_INTROUVABLE}</p>
      </main>
    );
  }
  return (
    <main className="zone-principale">
      <h1>{NOM_APPLICATION}</h1>
      <p>{espaceVide ? INVITATION_PREMIERE_PAGE : INVITATION_CHOISIR_UNE_PAGE}</p>
    </main>
  );
}
