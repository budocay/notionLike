import {
  type Arborescence,
  type CodeErreurDocument,
  ErreurDocument,
  type IdPage,
} from "@notionlike/document";
import {
  type ReactElement,
  type RefObject,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { EtatSession, SessionEspace } from "../espace/session-espace.ts";
import { abonnerAuFragment, allerA, lireFragment } from "../navigation/fragment.ts";
import { lireRoute, type Route } from "../navigation/route.ts";
import { type EtatSessionPage, ouvrirSessionPage, type SessionPage } from "../page/session-page.ts";
import { BarreLaterale } from "./BarreLaterale.tsx";
import {
  AVERTISSEMENT_NON_ENREGISTRE,
  CHARGEMENT,
  EXPLICATION_CONTEXTE_NON_SECURISE,
  EXPLICATION_VERSION_NON_PRISE_EN_CHARGE,
  messageErreur,
  TITRE_CONTEXTE_NON_SECURISE,
  TITRE_VERSION_NON_PRISE_EN_CHARGE,
  titreAffiche,
  titreOnglet,
} from "./messages.ts";
import { ancetresDe, estDansLaDescendance, trouverPage } from "./pages.ts";
import type { ActionsBarre, EcranBarre } from "./RangeePage.tsx";
import { type Selection, ZonePrincipale } from "./ZonePrincipale.tsx";

type EtatPret = Extract<EtatSession, { phase: "pret" }>;
type Saisie = EcranBarre["saisie"];

const ACCUEIL: Route = { forme: "accueil" };
const AUCUNE_PAGE: ReadonlySet<IdPage> = new Set();

export function Application({ session }: { readonly session: SessionEspace }): ReactElement {
  const etat = useSyncExternalStore(session.abonner, session.lireEtat);
  switch (etat.phase) {
    case "contexte-non-securise":
      return (
        <EcranBloquant
          titre={TITRE_CONTEXTE_NON_SECURISE}
          explication={EXPLICATION_CONTEXTE_NON_SECURISE}
        />
      );
    case "version-non-prise-en-charge":
      return (
        <EcranBloquant
          titre={TITRE_VERSION_NON_PRISE_EN_CHARGE}
          explication={EXPLICATION_VERSION_NON_PRISE_EN_CHARGE}
        />
      );
    case "chargement":
      return (
        <main className="ecran-plein">
          <p role="status">{CHARGEMENT}</p>
        </main>
      );
    case "pret":
      return <Coquille etat={etat} />;
  }
}

function EcranBloquant(props: {
  readonly titre: string;
  readonly explication: string;
}): ReactElement {
  return (
    <main className="ecran-plein">
      <div role="alert">
        <h1>{props.titre}</h1>
        <p>{props.explication}</p>
      </div>
    </main>
  );
}

function Coquille({ etat }: { readonly etat: EtatPret }): ReactElement {
  const { racines } = etat.arborescence;
  const route = lireRoute(useSyncExternalStore(abonnerAuFragment, lireFragment));
  const selection = selectionDe(route, etat.arborescence);
  const barre = useBarreLaterale(etat, route, selection);
  const etatPage = useEtatDeLaPage(
    etat.idEspace,
    selection.type === "page" ? selection.page.id : undefined,
  );
  const pageEnregistree = etatPage?.phase !== "pret" || etatPage.enregistre;
  useTitreOnglet(selection);

  return (
    <div className="coquille">
      {!(etat.enregistre && pageEnregistree) && (
        <p role="alert" className="avertissement">
          {AVERTISSEMENT_NON_ENREGISTRE}
        </p>
      )}
      <div className="colonnes">
        <BarreLaterale
          racines={racines}
          ecran={barre.ecran}
          actions={barre.actions}
          erreur={barre.erreur}
          boutonNouvellePage={barre.boutonNouvellePage}
        />
        <ZonePrincipale
          selection={selection}
          etatPage={etatPage}
          espaceVide={racines.length === 0}
        />
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

interface PageOuverte {
  readonly idPage: IdPage;
  readonly session: SessionPage;
}

const PAGE_EN_CHARGEMENT: EtatSessionPage = { phase: "chargement" };
const lirePageEnChargement = (): EtatSessionPage => PAGE_EN_CHARGEMENT;
const abonnerARien = (): (() => void) => () => undefined;

// Au plus un document de page ouvert : la session s'ouvre quand la page est sélectionnée et se
// ferme quand on la quitte (F-003-AC5, AC6). Tant que la session ouverte n'est pas celle de la
// page désignée, l'état rendu est le chargement : jamais le contenu de la page précédente.
function useEtatDeLaPage(
  idEspace: string,
  idPage: IdPage | undefined,
): EtatSessionPage | undefined {
  const [ouverte, setOuverte] = useState<PageOuverte | undefined>(undefined);
  useEffect(() => {
    if (idPage === undefined) {
      return undefined;
    }
    const session = ouvrirSessionPage(idEspace, idPage);
    setOuverte({ idPage, session });
    return () => {
      session.fermer();
      setOuverte(undefined);
    };
  }, [idEspace, idPage]);

  const session = ouverte !== undefined && ouverte.idPage === idPage ? ouverte.session : undefined;
  const etat = useSyncExternalStore(
    session?.abonner ?? abonnerARien,
    session?.lireEtat ?? lirePageEnChargement,
  );
  return idPage === undefined ? undefined : etat;
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

function useBarreLaterale(etat: EtatPret, route: Route, selection: Selection): Barre {
  const { operations } = etat;
  const { racines } = etat.arborescence;
  const idPageCourante = selection.type === "page" ? selection.page.id : undefined;
  const [repliees, setRepliees] = useState(AUCUNE_PAGE);
  const [saisie, setSaisie] = useState<Saisie>(undefined);
  const [erreur, setErreur] = useState<string | undefined>(undefined);
  const boutonNouvellePage = useRef<HTMLButtonElement>(null);

  // Les ancêtres se déplient quand la page désignée change, pas quand l'arbre change.
  const idPageDesignee = route.forme === "page" ? route.idPage : undefined;
  useEffect(() => {
    if (idPageDesignee !== undefined) {
      const ancetres = ancetresDe(racines, idPageDesignee);
      setRepliees((avant) => sansLesPages(avant, ancetres));
    }
  }, [idPageDesignee]);

  const actions: ActionsBarre = {
    creerPage: (parent) => {
      const resultat = tenter(() => operations.creerPage("", { parent }));
      if (resultat.refus !== undefined) {
        setErreur(messageErreur(resultat.refus));
        return;
      }
      setErreur(undefined);
      setRepliees((avant) => sansLesPages(avant, parent === null ? [] : [parent]));
      setSaisie({ idPage: resultat.valeur, erreur: undefined });
      allerA({ forme: "page", idPage: resultat.valeur });
    },
    ouvrirSaisie: (idPage) => {
      setErreur(undefined);
      setSaisie({ idPage, erreur: undefined });
    },
    validerTitre: (idPage, titre) => {
      const { refus } = tenter(() => operations.renommerPage(idPage, titre));
      if (refus === "titre-trop-long") {
        setSaisie({ idPage, erreur: messageErreur(refus) });
        return false;
      }
      setSaisie(undefined);
      setErreur(refus === undefined ? undefined : messageErreur(refus));
      return true;
    },
    annulerSaisie: () => setSaisie(undefined),
    mettreALaCorbeille: (page) => {
      const emporteLaPageCourante =
        idPageCourante !== undefined && estDansLaDescendance(page, idPageCourante);
      const { refus } = tenter(() => operations.mettreALaCorbeille(page.id));
      if (refus !== undefined) {
        setErreur(messageErreur(refus));
        return;
      }
      setErreur(undefined);
      if (emporteLaPageCourante) {
        allerA(ACCUEIL);
      }
      boutonNouvellePage.current?.focus();
    },
    basculerRepli: (idPage) => setRepliees((avant) => avecBascule(avant, idPage)),
  };

  return { ecran: { idPageCourante, repliees, saisie }, actions, erreur, boutonNouvellePage };
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

function sansLesPages(
  repliees: ReadonlySet<IdPage>,
  pages: readonly IdPage[],
): ReadonlySet<IdPage> {
  if (!pages.some((id) => repliees.has(id))) {
    return repliees;
  }
  const restantes = new Set(repliees);
  pages.forEach((id) => restantes.delete(id));
  return restantes;
}

function avecBascule(repliees: ReadonlySet<IdPage>, id: IdPage): ReadonlySet<IdPage> {
  const suivantes = new Set(repliees);
  if (!suivantes.delete(id)) {
    suivantes.add(id);
  }
  return suivantes;
}
