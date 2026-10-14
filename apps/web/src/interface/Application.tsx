import {
  type Arborescence,
  type CodeErreurDocument,
  ErreurDocument,
  type IdPage,
  type PageLue,
} from "@notionlike/document";
import {
  type ReactElement,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { Compte } from "../compte/index.ts";
import type { EtatPret, SessionEspace } from "../espace/session-espace.ts";
import type { PagesOuvertes } from "../page/pages-ouvertes.ts";
import { allerA } from "../navigation/fragment.ts";
import { fragmentDEcran, type Route } from "../navigation/route.ts";
import { BarreLaterale } from "./BarreLaterale.tsx";
import { BarreDuHaut } from "./composants/BarreDuHaut.tsx";
import { BoutonIcone } from "./composants/BoutonIcone.tsx";
import { ActionDeCompte } from "./composants/Compte.tsx";
import { Coquille, EcranPlein, Principale, type TiroirDeCoquille } from "./composants/Coquille.tsx";
import { Chargement, EcranBloquant } from "./composants/Etats.tsx";
import { EcranDeCompte } from "./EcranDeCompte.tsx";
import {
  EcranDeLaCorbeille,
  type IssueDeSuppression,
  type OperationsDeLaCorbeille,
} from "./EcranDeLaCorbeille.tsx";
import { EcranDuCompte } from "./EcranDuCompte.tsx";
import { AvertissementDEnregistrement, ZoneDEnregistrement } from "./Enregistrement.tsx";
import { etatAvecLaPage } from "./etat-d-enregistrement.ts";
import { FilDAriane } from "./FilDAriane.tsx";
import {
  CHARGEMENT,
  EXPLICATION_CONTEXTE_NON_SECURISE,
  EXPLICATION_VERSION_NON_PRISE_EN_CHARGE,
  FERMER_LA_BARRE_LATERALE,
  messageErreur,
  MODIFICATIONS_NON_ENREGISTREES_PERDUES,
  NOM_DU_TIROIR,
  OUVRIR_LA_BARRE_LATERALE,
  TITRE_CONTEXTE_NON_SECURISE,
  TITRE_VERSION_NON_PRISE_EN_CHARGE,
  titreAffiche,
  titreOnglet,
} from "./messages.ts";
import { ESPACES } from "./messages-espaces.ts";
import { type NavigationDeLEspace, useNavigationDeLEspace } from "./navigation-espaces.ts";
import { usePageOuverte, usePagesOuvertes } from "./page-ouverte.ts";
import { estDansLaDescendance, trouverPage } from "./pages.ts";
import type { ActionsBarre, EcranBarre } from "./RangeePage.tsx";
import { useRepli } from "./repli.ts";
import { type Tiroir, useTiroir } from "./tiroir.ts";
import { ZoneDeCompte } from "./ZoneDeCompte.tsx";
import { ZoneDesEspaces } from "./ZoneDesEspaces.tsx";
import { type Selection, ZonePrincipale } from "./ZonePrincipale.tsx";

type Saisie = EcranBarre["saisie"];

const ACCUEIL: Route = { forme: "accueil" };

interface ProprietesApplication {
  readonly session: SessionEspace;
  /** État du compte et client d'authentification (F-010) ; absent, ni zone ni écrans de compte. */
  readonly compte?: Compte | undefined;
}

export function Application({ session, compte }: ProprietesApplication): ReactElement {
  const etat = useSyncExternalStore(session.abonner, session.lireEtat);
  switch (etat.phase) {
    case "contexte-non-securise":
      return (
        <EcranPlein fenetre>
          <EcranBloquant
            titre={TITRE_CONTEXTE_NON_SECURISE}
            explication={EXPLICATION_CONTEXTE_NON_SECURISE}
          />
        </EcranPlein>
      );
    case "version-non-prise-en-charge":
      return (
        <EcranPlein fenetre>
          <EcranBloquant
            titre={TITRE_VERSION_NON_PRISE_EN_CHARGE}
            explication={EXPLICATION_VERSION_NON_PRISE_EN_CHARGE}
            precision={
              etat.modificationsPerdues ? MODIFICATIONS_NON_ENREGISTREES_PERDUES : undefined
            }
          />
        </EcranPlein>
      );
    case "chargement":
      return (
        <EcranPlein fenetre>
          <Chargement texte={CHARGEMENT} />
        </EcranPlein>
      );
    case "pret":
      return <EspacePret etat={etat} compte={compte} />;
  }
}

// L'espace ouvert : la coquille reçoit la fenêtre entière, la barre latérale et le reste
// (avertissement, barre du haut, zone principale). Un écran de compte prend la place de la zone
// principale ; tout le reste demeure, arborescence et repli compris (F-010-AC3).
function EspacePret(props: {
  readonly etat: EtatPret;
  readonly compte: Compte | undefined;
}): ReactElement {
  const { etat, compte } = props;
  const { racines } = etat.arborescence;
  const navigation = useNavigationDeLEspace(compte);
  const { route } = navigation;
  const selection = selectionDe(route, etat.arborescence);
  const barre = useBarreLaterale(etat, route, selection);
  const tiroir = useTiroir();
  const idBarre = useId();
  useTitreOnglet(selection);
  const page = selection.type === "page" ? selection.page : undefined;
  const pages = usePagesOuvertes();
  const etatDeLaPage = usePageOuverte(pages, etat.idEspace, page?.id);
  const enregistrement = etatAvecLaPage(etat, etatDeLaPage);

  return (
    <Coquille
      fenetre
      tiroir={attributsDuTiroir(tiroir, idBarre)}
      barre={barreLateraleDe(barre, tiroir, compte, navigation.corbeille)}
    >
      <AvertissementDEnregistrement etat={enregistrement} zonePrincipale={tiroir.zonePrincipale} />
      <BarreDuHaut
        ouverture={
          tiroir.etroit ? <BoutonDOuverture tiroir={tiroir} idBarre={idBarre} /> : undefined
        }
        fil={
          page === undefined ? undefined : (
            <FilDAriane key={page.id} racines={racines} page={page} etroit={tiroir.etroit} />
          )
        }
        etat={<ZoneDEnregistrement etat={enregistrement} />}
      />
      <ZoneAffichee
        zone={tiroir.zonePrincipale}
        etat={etat}
        compte={compte}
        navigation={navigation}
        pages={pages}
        selection={selection}
        page={etatDeLaPage}
      />
    </Coquille>
  );
}

/**
 * À la place de la page : un écran de compte (F-010), du compte (F-027) ou des espaces (F-014), ou
 * l'écran de la corbeille (F-007) ; sinon la zone principale de la page sélectionnée.
 */
function ZoneAffichee(props: {
  readonly zone: Tiroir["zonePrincipale"];
  readonly etat: EtatPret;
  readonly compte: Compte | undefined;
  readonly navigation: NavigationDeLEspace;
  readonly pages: PagesOuvertes;
  readonly selection: Selection;
  readonly page: ReturnType<typeof usePageOuverte>;
}): ReactElement {
  const { zone, etat, compte, navigation } = props;
  if (compte !== undefined && navigation.ecran !== undefined) {
    return (
      <Principale ref={zone}>
        <EcranAffiche compte={compte} navigation={navigation} />
      </Principale>
    );
  }
  if (navigation.corbeille) {
    return (
      <Principale ref={zone}>
        <EcranDeLaCorbeille
          corbeille={etat.arborescence.corbeille}
          operations={operationsDeLaCorbeille(etat, props.pages)}
        />
      </Principale>
    );
  }
  return (
    <ZonePrincipale
      ref={zone}
      selection={props.selection}
      espaceVide={etat.arborescence.racines.length === 0}
      page={props.page}
    />
  );
}

/** Opérations de l'écran de la corbeille (F-007) : refus traduits, puis effacement des bases. */
function operationsDeLaCorbeille(etat: EtatPret, pages: PagesOuvertes): OperationsDeLaCorbeille {
  return {
    restaurer: (page) => {
      const { refus } = essayer(() => etat.operations.restaurerPage(page.id));
      return refus === undefined ? undefined : messageErreur(refus);
    },
    supprimer: (page) => supprimerDefinitivement(etat, pages, page.id),
  };
}

// La suppression reste faite quoi qu'il advienne de l'effacement (F-007 H8). Pendant une coupure
// de la persistance de l'espace, ou tant que l'espace est inconnu, l'effacement n'est pas tenté :
// son issue est un échec, que l'écran signale (F-007-AC21).
function supprimerDefinitivement(
  etat: EtatPret,
  pages: PagesOuvertes,
  id: IdPage,
): IssueDeSuppression {
  const essai = essayer(() => etat.operations.supprimerDefinitivement(id));
  if (essai.refus !== undefined) {
    return { refus: messageErreur(essai.refus) };
  }
  const effacement: Promise<"effacee" | "echec"> =
    etat.enregistre && etat.idEspace !== undefined
      ? pages.effacer(etat.idEspace, essai.valeur)
      : Promise.resolve("echec");
  return { refus: undefined, effacement };
}

function barreLateraleDe(
  barre: Barre,
  tiroir: Tiroir,
  compte: Compte | undefined,
  corbeilleCourante: boolean,
): ReactElement {
  return (
    <BarreLaterale
      corbeilleCourante={corbeilleCourante}
      racines={barre.racines}
      ecran={barre.ecran}
      actions={barre.actions}
      erreur={barre.erreur}
      boutonNouvellePage={barre.boutonNouvellePage}
      fermeture={tiroir.ouvert ? <BoutonDeFermeture tiroir={tiroir} /> : undefined}
      compte={
        compte === undefined ? undefined : (
          <>
            <ZoneDeCompte compte={compte} />
            <ActionDeCompte libelle={ESPACES} adresse={fragmentDEcran({ ecran: "espaces" })} />
          </>
        )
      }
    />
  );
}

/** Écran de compte (F-010), du compte (F-027) ou des espaces (F-014), à la place de la page. */
function EcranAffiche(props: {
  readonly compte: Compte;
  readonly navigation: NavigationDeLEspace;
}): ReactElement | null {
  const { compte, navigation } = props;
  const { ecran } = navigation;
  if (ecran === undefined) {
    return null;
  }
  switch (ecran.sorte) {
    case "compte":
      return (
        <EcranDeCompte
          key={ecran.ecran}
          sorte={ecran.ecran}
          compte={compte}
          retour={navigation.retour}
          application={navigation.application}
        />
      );
    case "gestion":
      return <EcranDuCompte compte={compte} />;
    case "espaces":
      return <ZoneDesEspaces compte={compte} ecran={ecran.ecran} navigation={navigation} />;
  }
}

function attributsDuTiroir(tiroir: Tiroir, id: string): TiroirDeCoquille {
  return {
    id,
    ouvert: tiroir.ouvert,
    nom: NOM_DU_TIROIR,
    surClic: tiroir.surClic,
    surVoile: tiroir.abandonner,
  };
}

function BoutonDOuverture(props: {
  readonly tiroir: Tiroir;
  readonly idBarre: string;
}): ReactElement {
  return (
    <BoutonIcone
      ref={props.tiroir.boutonDOuverture}
      nom={OUVRIR_LA_BARRE_LATERALE}
      pictogramme="tiroir"
      lieu="barre"
      aria-expanded={props.tiroir.ouvert}
      aria-controls={props.idBarre}
      onClick={props.tiroir.ouvrir}
    />
  );
}

function BoutonDeFermeture({ tiroir }: { readonly tiroir: Tiroir }): ReactElement {
  return (
    <BoutonIcone
      ref={tiroir.boutonDeFermeture}
      nom={FERMER_LA_BARRE_LATERALE}
      pictogramme="fermer"
      lieu="barre"
      onClick={tiroir.abandonner}
    />
  );
}

// La sélection n'est pas un état : elle se déduit de la route et de l'arborescence lue. Une route
// qui n'est ni une page ni une page refusée (accueil, écran de compte) n'en désigne aucune.
function selectionDe(route: Route, arborescence: Arborescence): Selection {
  if (route.forme === "page-introuvable") {
    return { type: "introuvable" };
  }
  if (route.forme !== "page") {
    return { type: "accueil" };
  }
  const page = trouverPage(arborescence.racines, route.idPage);
  return page === undefined ? { type: "introuvable" } : { type: "page", page };
}

function useTitreOnglet(selection: Selection): void {
  const titre = selection.type === "page" ? titreAffiche(selection.page.titre) : undefined;
  useEffect(() => {
    document.title = titreOnglet(titre);
  }, [titre]);
}

interface Barre {
  readonly racines: readonly PageLue[];
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
    racines: etat.arborescence.racines,
    ecran: { idPageCourante, repliees: repli.repliees, saisie },
    actions,
    erreur,
    boutonNouvellePage,
  };
}

function creerPage(moyens: Moyens, parent: IdPage | null): void {
  const resultat = essayer(() => moyens.operations.creerPage("", { parent }));
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
  const { refus } = essayer(() => moyens.operations.renommerPage(idPage, titre));
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
  const { refus } = essayer(() => moyens.operations.mettreALaCorbeille(page.id));
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

type Essai<T> =
  { readonly valeur: T; readonly refus: undefined } | { readonly refus: CodeErreurDocument };

// Seule une erreur typée du document est rattrapée ; toute autre exception est un défaut.
function essayer<T>(operation: () => T): Essai<T> {
  try {
    return { valeur: operation(), refus: undefined };
  } catch (erreur) {
    if (erreur instanceof ErreurDocument) {
      return { refus: erreur.code };
    }
    throw erreur;
  }
}
