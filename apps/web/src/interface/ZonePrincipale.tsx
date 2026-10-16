import type { PageLue } from "@notionlike/document";
import type { ReactElement, Ref } from "react";

import { EditeurDePage } from "../edition/index.ts";
import type { EtatSessionPage } from "../page/session-page.ts";
import { Principale } from "./composants/Coquille.tsx";
import { CorpsDePage, NoteDePage } from "./composants/Edition.tsx";
import { Chargement, EntetePage } from "./composants/Etats.tsx";
import {
  CHARGEMENT_DE_LA_PAGE,
  EXPLICATION_PAGE_INTROUVABLE,
  INVITATION_CHOISIR_UNE_PAGE,
  INVITATION_PREMIERE_PAGE,
  NOM_APPLICATION,
  PAGE_DE_VERSION_NON_PRISE_EN_CHARGE,
  PAGE_INTROUVABLE,
  titreAffiche,
  titreEstVide,
} from "./messages.ts";
import { estUnClicAvecMod } from "./clic.ts";
import { cleAria, estLaFrappe, RACCOURCIS } from "./raccourcis.ts";

/** Ce que l'adresse désigne, confronté à l'arborescence lue. */
export type Selection =
  | { readonly type: "accueil" }
  | { readonly type: "page"; readonly page: PageLue }
  | { readonly type: "introuvable" };

interface Proprietes {
  readonly selection: Selection;
  readonly espaceVide: boolean;
  /** État de la session de la page sélectionnée ; `undefined` quand aucune page ne l'est. */
  readonly page: EtatSessionPage | undefined;
  /** Le focus y est porté quand une page est choisie dans le tiroir (F-004-AC42). */
  readonly ref?: Ref<HTMLElement> | undefined;
  /** Vrai : l'espace est ouvert en lecture seule, l'éditeur n'est pas modifiable (F-013-AC25). */
  readonly lectureSeule?: boolean | undefined;
}

const PAGE_REFUSEE = (
  <EntetePage titre={PAGE_INTROUVABLE} explication={EXPLICATION_PAGE_INTROUVABLE} />
);

// La clé rejoue l'apparition du contenu quand la page sélectionnée change (F-004-AC14).
function entete({ selection, espaceVide, page }: Proprietes): ReactElement {
  if (selection.type === "page" && page?.phase !== "introuvable") {
    return (
      <EntetePage
        key={selection.page.id}
        titre={titreAffiche(selection.page.titre)}
        vide={titreEstVide(selection.page.titre)}
      />
    );
  }
  if (selection.type !== "accueil") {
    return PAGE_REFUSEE;
  }
  return (
    <EntetePage
      titre={NOM_APPLICATION}
      explication={espaceVide ? INVITATION_PREMIERE_PAGE : INVITATION_CHOISIR_UNE_PAGE}
    />
  );
}

function meneALaBarreDeBlocs(frappe: Parameters<typeof estLaFrappe>[0]): boolean {
  return estLaFrappe(frappe, RACCOURCIS.barreDeBlocs);
}

function ouvreLePanneauDeLien(frappe: Parameters<typeof estLaFrappe>[0]): boolean {
  return estLaFrappe(frappe, RACCOURCIS.lien);
}

// Alt+Maj+Flèche haut ou bas dans la zone de saisie : le bloc du curseur monte ou descend
// (F-006-AC18).
function deplacementDuBloc(
  frappe: Parameters<typeof estLaFrappe>[0],
): "monter" | "descendre" | undefined {
  if (estLaFrappe(frappe, RACCOURCIS.monterLeBloc)) {
    return "monter";
  }
  return estLaFrappe(frappe, RACCOURCIS.descendreLeBloc) ? "descendre" : undefined;
}

const RACCOURCIS_DU_BLOC = [RACCOURCIS.monterLeBloc, RACCOURCIS.descendreLeBloc]
  .map((combinaison) => cleAria(combinaison))
  .join(" ");

// Sous le titre, dans la même colonne : l'éditeur de la page, ou ce qui en tient lieu tant que son
// document n'est pas relu ou que sa version n'est pas prise en charge (F-003-AC1, AC4, AC19).
function corps(
  idPage: string,
  page: EtatSessionPage,
  lectureSeule: boolean | undefined,
): ReactElement | null {
  switch (page.phase) {
    case "introuvable":
      return null;
    case "chargement":
      return <Chargement texte={CHARGEMENT_DE_LA_PAGE} />;
    case "version-non-prise-en-charge":
      return <NoteDePage texte={PAGE_DE_VERSION_NON_PRISE_EN_CHARGE} />;
    case "pret":
      return (
        <EditeurDePage
          key={idPage}
          contenu={page.contenu}
          garderVersion={page.garderVersion}
          preparerLaVersion={page.preparerLaVersion}
          meneALaBarre={meneALaBarreDeBlocs}
          ouvreLePanneauDeLien={ouvreLePanneauDeLien}
          ouvreLAdresse={estUnClicAvecMod}
          deplacementDuBloc={deplacementDuBloc}
          raccourcisDuBloc={RACCOURCIS_DU_BLOC}
          lectureSeule={lectureSeule}
        />
      );
  }
}

export function ZonePrincipale(props: Proprietes): ReactElement {
  const { selection, page } = props;
  const contenu =
    selection.type === "page" && page !== undefined
      ? corps(selection.page.id, page, props.lectureSeule)
      : null;
  return (
    <Principale ref={props.ref}>
      {entete(props)}
      {contenu !== null && <CorpsDePage>{contenu}</CorpsDePage>}
    </Principale>
  );
}
