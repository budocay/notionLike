import {
  type Arborescence,
  type CodeErreurDocument,
  ErreurDocument,
  type IdPage,
  type PageLue,
} from "@notionlike/document";
import {
  type ReactElement,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { EtatSession, SessionEspace } from "../espace/session-espace.ts";
import { abonnerAuFragment, allerA, lireFragment } from "../navigation/fragment.ts";
import { lireRoute, type Route } from "../navigation/route.ts";
import { BarreLaterale } from "./BarreLaterale.tsx";
import { BarreDuHaut, ZoneEtat } from "./composants/BarreDuHaut.tsx";
import { COQUILLE } from "./composants/coquille.classes.ts";
import { Avertissement, Chargement, EcranBloquant } from "./composants/Etats.tsx";
import { FilDAriane } from "./FilDAriane.tsx";
import {
  AVERTISSEMENT_NON_ENREGISTRE,
  CHARGEMENT,
  EXPLICATION_CONTEXTE_NON_SECURISE,
  EXPLICATION_VERSION_NON_PRISE_EN_CHARGE,
  messageErreur,
  NON_ENREGISTRE,
  TITRE_CONTEXTE_NON_SECURISE,
  TITRE_VERSION_NON_PRISE_EN_CHARGE,
  titreAffiche,
  titreOnglet,
} from "./messages.ts";
import { estDansLaDescendance, trouverPage } from "./pages.ts";
import type { ActionsBarre, EcranBarre } from "./RangeePage.tsx";
import { useRepli } from "./repli.ts";
import { type Selection, ZonePrincipale } from "./ZonePrincipale.tsx";

type EtatPret = Extract<EtatSession, { phase: "pret" }>;
type Saisie = EcranBarre["saisie"];

const ACCUEIL: Route = { forme: "accueil" };

export function Application({ session }: { readonly session: SessionEspace }): ReactElement {
  const etat = useSyncExternalStore(session.abonner, session.lireEtat);
  switch (etat.phase) {
    case "contexte-non-securise":
      return (
        <EcranPlein>
          <EcranBloquant
            titre={TITRE_CONTEXTE_NON_SECURISE}
            explication={EXPLICATION_CONTEXTE_NON_SECURISE}
          />
        </EcranPlein>
      );
    case "version-non-prise-en-charge":
      return (
        <EcranPlein>
          <EcranBloquant
            titre={TITRE_VERSION_NON_PRISE_EN_CHARGE}
            explication={EXPLICATION_VERSION_NON_PRISE_EN_CHARGE}
          />
        </EcranPlein>
      );
    case "chargement":
      return (
        <EcranPlein>
          <Chargement texte={CHARGEMENT} />
        </EcranPlein>
      );
    case "pret":
      return <Coquille etat={etat} />;
  }
}

function EcranPlein({ children }: { readonly children: ReactNode }): ReactElement {
  return <main className={COQUILLE.ecranPlein}>{children}</main>;
}

// Une seule structure : la barre latérale, puis le reste (avertissement, barre du haut, zone
// principale). La zone d'état lit l'état de la session, sans autre abonné (F-004-AC40).
function Coquille({ etat }: { readonly etat: EtatPret }): ReactElement {
  const { racines } = etat.arborescence;
  const route = lireRoute(useSyncExternalStore(abonnerAuFragment, lireFragment));
  const selection = selectionDe(route, etat.arborescence);
  const barre = useBarreLaterale(etat, route, selection);
  useTitreOnglet(selection);
  const fil =
    selection.type === "page" ? (
      <FilDAriane key={selection.page.id} racines={racines} page={selection.page} />
    ) : undefined;

  return (
    <div className={COQUILLE.cadre}>
      <div className={COQUILLE.barre}>
        <BarreLaterale
          racines={racines}
          ecran={barre.ecran}
          actions={barre.actions}
          erreur={barre.erreur}
          boutonNouvellePage={barre.boutonNouvellePage}
        />
      </div>
      <div className={COQUILLE.reste}>
        {!etat.enregistre && <Avertissement>{AVERTISSEMENT_NON_ENREGISTRE}</Avertissement>}
        <BarreDuHaut
          fil={fil}
          etat={<ZoneEtat echec={etat.enregistre ? undefined : NON_ENREGISTRE} />}
        />
        <ZonePrincipale selection={selection} espaceVide={racines.length === 0} />
      </div>
    </div>
  );
}

// La sélection n'est pas un état : elle se déduit de la route et de l'arborescence lue.
function selectionDe(route: Route, arborescence: Arborescence): Selection {
  if (route.forme === "accueil") {
    return { type: "accueil" };
  }
  const page = route.forme === "page" ? trouverPage(arborescence.racines, route.idPage) : undefined;
  return page === undefined ? { type: "introuvable" } : { type: "page", page };
}

function useTitreOnglet(selection: Selection): void {
  const titre = selection.type === "page" ? titreAffiche(selection.page.titre) : undefined;
  useEffect(() => {
    document.title = titreOnglet(titre);
  }, [titre]);
}

interface Barre {
  readonly ecran: EcranBarre;
  readonly actions: ActionsBarre;
  readonly erreur: string | undefined;
  readonly boutonNouvellePage: RefObject<HTMLButtonElement | null>;
}

/** Ce dont une action de la barre a besoin pour écrire dans le document et dire son refus. */
interface Moyens {
  readonly operations: EtatPret["operations"];
  readonly setSaisie: (saisie: Saisie) => void;
  readonly setErreur: (erreur: string | undefined) => void;
  readonly deplier: (pages: readonly IdPage[]) => void;
}

// État d'écran de la barre : pages repliées, saisie ouverte, dernier refus. Le menu ouvert, le
// tiroir et le repli du fil d'Ariane n'y entrent pas : chacun vit dans son composant (F-004-AC58).
function useBarreLaterale(etat: EtatPret, route: Route, selection: Selection): Barre {
  const idPageCourante = selection.type === "page" ? selection.page.id : undefined;
  const idPageDesignee = route.forme === "page" ? route.idPage : undefined;
  const repli = useRepli(etat.arborescence.racines, idPageDesignee);
  const [saisie, setSaisie] = useState<Saisie>(undefined);
  const [erreur, setErreur] = useState<string | undefined>(undefined);
  const boutonNouvellePage = useRef<HTMLButtonElement>(null);
  const moyens: Moyens = {
    operations: etat.operations,
    setSaisie,
    setErreur,
    deplier: repli.deplier,
  };

  const actions: ActionsBarre = {
    creerPage: (parent) => creerPage(moyens, parent),
    ouvrirSaisie: (idPage) => {
      setErreur(undefined);
      setSaisie({ idPage, erreur: undefined });
    },
    validerTitre: (idPage, titre) => validerTitre(moyens, idPage, titre),
    annulerSaisie: () => setSaisie(undefined),
    mettreALaCorbeille: (page) => {
      if (mettreALaCorbeille(moyens, page, idPageCourante)) {
        boutonNouvellePage.current?.focus();
      }
    },
    basculerRepli: repli.basculer,
  };

  return {
    ecran: { idPageCourante, repliees: repli.repliees, saisie },
    actions,
    erreur,
    boutonNouvellePage,
  };
}

function creerPage(moyens: Moyens, parent: IdPage | null): void {
  const resultat = tenter(() => moyens.operations.creerPage("", { parent }));
  if (resultat.refus !== undefined) {
    moyens.setErreur(messageErreur(resultat.refus));
    return;
  }
  moyens.setErreur(undefined);
  moyens.deplier(parent === null ? [] : [parent]);
  moyens.setSaisie({ idPage: resultat.valeur, erreur: undefined });
  allerA({ forme: "page", idPage: resultat.valeur });
}

/** Rend vrai si la saisie est close : le titre est accepté, ou la page n'existe plus. */
function validerTitre(moyens: Moyens, idPage: IdPage, titre: string): boolean {
  const { refus } = tenter(() => moyens.operations.renommerPage(idPage, titre));
  if (refus === "titre-trop-long") {
    moyens.setSaisie({ idPage, erreur: messageErreur(refus) });
    return false;
  }
  moyens.setSaisie(undefined);
  moyens.setErreur(refus === undefined ? undefined : messageErreur(refus));
  return true;
}

/** Rend vrai si la page est partie à la corbeille ; l'accueil remplace la page courante emportée. */
function mettreALaCorbeille(
  moyens: Moyens,
  page: PageLue,
  idPageCourante: IdPage | undefined,
): boolean {
  const emporteLaPageCourante =
    idPageCourante !== undefined && estDansLaDescendance(page, idPageCourante);
  const { refus } = tenter(() => moyens.operations.mettreALaCorbeille(page.id));
  if (refus !== undefined) {
    moyens.setErreur(messageErreur(refus));
    return false;
  }
  moyens.setErreur(undefined);
  if (emporteLaPageCourante) {
    allerA(ACCUEIL);
  }
  return true;
}

type Tentative<T> =
  { readonly valeur: T; readonly refus: undefined } | { readonly refus: CodeErreurDocument };

// Seule une erreur typée du document est rattrapée ; toute autre exception est un défaut.
function tenter<T>(operation: () => T): Tentative<T> {
  try {
    return { valeur: operation(), refus: undefined };
  } catch (erreur) {
    if (erreur instanceof ErreurDocument) {
      return { refus: erreur.code };
    }
    throw erreur;
  }
}
