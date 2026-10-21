import type { IdPage, PageLue } from "@notionlike/document";
import type { ReactElement, ReactNode, RefObject } from "react";

import {
  type AnnoncesDuGlisser,
  ListeGlissable,
  type ProprietesListeGlissable,
  type ZoneDeDepot,
} from "../glisser/index.ts";
import { allerALaCorbeille } from "../navigation/fragment.ts";
import { CadreDeBarre, TeteDeBarre } from "./composants/CadreDeBarre.tsx";
import { ActionDeCompte } from "./composants/Compte.tsx";
import { destinationDuDepot } from "./destination-de-page.ts";
import {
  deplacementAbandonne,
  INSTRUCTIONS_DU_GLISSER,
  lieuDuDepot,
  NOM_APPLICATION,
  NOM_BARRE_LATERALE,
  NOUVELLE_PAGE,
  pageAuDessus,
  pageDeposee,
  pageSaisie,
  titreAffiche,
} from "./messages.ts";
import { ENTREE_CORBEILLE } from "./messages-corbeille.ts";
import { rangeesVisibles, trouverPage } from "./pages.ts";
import { TOUCHES_DU_GLISSER } from "./raccourcis.ts";
import { type ActionsBarre, type EcranBarre, RangeePage } from "./RangeePage.tsx";

interface Proprietes {
  readonly racines: readonly PageLue[];
  readonly ecran: EcranBarre;
  readonly actions: ActionsBarre;
  /** Message de la dernière opération refusée par le document. */
  readonly erreur: string | undefined;
  /** Dernière annonce d'un déplacement au clavier (F-006-AC12). */
  readonly annonce?: string | undefined;
  readonly boutonNouvellePage: RefObject<HTMLButtonElement | null>;
  /** Bouton de fermeture, quand la barre est ouverte en tiroir. */
  readonly fermeture?: ReactNode | undefined;
  /** Zone de compte (F-010), dans la tête, après « Nouvelle page ». */
  readonly compte?: ReactNode | undefined;
  /** Zone de synchronisation (F-013), à côté de la zone de compte. */
  readonly synchronisation?: ReactNode | undefined;
  /** Vrai quand l'écran de la corbeille est affiché : son entrée est marquée courante (F-007-AC1). */
  readonly corbeilleCourante?: boolean | undefined;
}

// Tête : le sceau et « Nouvelle page ». « Rechercher » y vient avec F-024 : aucune entrée sans effet
// d'ici là (F-004-AC29). Pied : l'entrée « Corbeille », et nulle part ailleurs (F-004-AC30, F-007-AC1).
export function BarreLaterale(props: Proprietes): ReactElement {
  const { racines, ecran, actions } = props;
  const tete = (
    <>
      <TeteDeBarre
        nomEspace={NOM_APPLICATION}
        libelleNouvellePage={NOUVELLE_PAGE}
        surNouvellePage={() => actions.creerPage(null)}
        boutonNouvellePage={props.boutonNouvellePage}
        raisonNouvellePage={ecran.lectureSeule}
        fermeture={props.fermeture}
      />
      {props.compte}
      {props.synchronisation}
    </>
  );
  return (
    <ListeGlissable {...proprietesDuGlisser(props)}>
      <CadreDeBarre
        nom={NOM_BARRE_LATERALE}
        tete={tete}
        erreur={props.erreur}
        annonce={props.annonce}
        pied={
          <ActionDeCompte
            libelle={ENTREE_CORBEILLE}
            surActivation={allerALaCorbeille}
            courante={props.corbeilleCourante === true}
          />
        }
      >
        {racines.length === 0
          ? undefined
          : rangeesVisibles(racines, ecran.repliees).map(({ page, niveau, mere }) => (
              <RangeePage
                key={page.id}
                page={page}
                niveau={niveau}
                mere={mere}
                racines={racines}
                ecran={ecran}
                actions={actions}
              />
            ))}
      </CadreDeBarre>
    </ListeGlissable>
  );
}

// Les rangées visibles sont glissables (F-006) : un geste ne démarre ni en lecture seule, ni pendant
// la saisie d'un titre. La zone admise et le lâcher sont ceux de la destination, calculée sur
// l'arborescence lue au moment même (F-006-AC4 à AC8). La région d'annonces et les instructions du
// geste sont rendues après la barre, hors de sa liste.
function proprietesDuGlisser(props: Proprietes): Omit<ProprietesListeGlissable, "children"> {
  const { racines, ecran, actions } = props;
  return {
    identifiants: rangeesVisibles(racines, ecran.repliees).map(({ page }) => page.id),
    desactivee: ecran.lectureSeule !== undefined || ecran.saisie !== undefined,
    zoneAdmise: (actif, cible, zone) =>
      destinationDuDepot(racines, actif, cible, zone).sorte === "deplacer",
    surLacher: (actif, cible, zone) => {
      const destination = destinationDuDepot(racines, actif, cible, zone);
      if (destination.sorte === "deplacer") {
        actions.deplacer(actif, destination.ou, false);
      }
    },
    annonces: annoncesDe(racines),
    touches: TOUCHES_DU_GLISSER,
  };
}

// Les annonces du geste nomment chaque page par son titre, en français (F-006-AC36).
function annoncesDe(racines: readonly PageLue[]): AnnoncesDuGlisser {
  const titre = (id: IdPage): string => titreAffiche(trouverPage(racines, id)?.titre ?? "");
  const lieu = (cible: string | undefined, zone: ZoneDeDepot | undefined): string | undefined =>
    cible === undefined || zone === undefined ? undefined : lieuDuDepot(zone, titre(cible));
  return {
    instructions: INSTRUCTIONS_DU_GLISSER,
    saisie: (actif) => pageSaisie(titre(actif)),
    survol: (actif, cible, zone) => pageAuDessus(titre(actif), lieu(cible, zone)),
    depot: (actif, cible, zone) => pageDeposee(titre(actif), lieu(cible, zone)),
    abandon: (actif) => deplacementAbandonne(titre(actif)),
  };
}
