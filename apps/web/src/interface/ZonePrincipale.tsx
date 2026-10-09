import type { PageLue } from "@notionlike/document";
import type { ReactElement } from "react";

import { EditeurDePage } from "../edition/index.ts";
import type { EtatSessionPage } from "../page/session-page.ts";
import {
  CHARGEMENT,
  EXPLICATION_PAGE_INTROUVABLE,
  EXPLICATION_PAGE_VERSION_NON_PRISE_EN_CHARGE,
  INVITATION_CHOISIR_UNE_PAGE,
  INVITATION_PREMIERE_PAGE,
  NOM_APPLICATION,
  PAGE_INTROUVABLE,
  TITRE_PAGE_VERSION_NON_PRISE_EN_CHARGE,
  titreAffiche,
} from "./messages.ts";

/** Ce que l'adresse désigne, confronté à l'arborescence lue. */
export type Selection =
  | { readonly type: "accueil" }
  | { readonly type: "page"; readonly page: PageLue }
  | { readonly type: "introuvable" };

interface Proprietes {
  readonly selection: Selection;
  /** État de la session de la page sélectionnée ; absent quand aucune page ne l'est. */
  readonly etatPage: EtatSessionPage | undefined;
  readonly espaceVide: boolean;
}

export function ZonePrincipale({ selection, etatPage, espaceVide }: Proprietes): ReactElement {
  if (selection.type === "page") {
    return (
      <main className="zone-principale">
        <h1>{titreAffiche(selection.page.titre)}</h1>
        {etatPage !== undefined && <ContenuDePage idPage={selection.page.id} etat={etatPage} />}
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

function ContenuDePage(props: {
  readonly idPage: string;
  readonly etat: EtatSessionPage;
}): ReactElement {
  const { etat } = props;
  switch (etat.phase) {
    case "chargement":
      return <p role="status">{CHARGEMENT}</p>;
    case "version-non-prise-en-charge":
      return (
        <div role="alert">
          <p>
            <strong>{TITRE_PAGE_VERSION_NON_PRISE_EN_CHARGE}</strong>
          </p>
          <p>{EXPLICATION_PAGE_VERSION_NON_PRISE_EN_CHARGE}</p>
        </div>
      );
    case "pret":
      // Un éditeur par page : la clé interdit qu'un éditeur survive au changement de page.
      return (
        <EditeurDePage
          key={props.idPage}
          contenu={etat.page.contenu}
          garderVersion={etat.page.garderVersion}
        />
      );
  }
}
