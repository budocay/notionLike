import {
  type Arborescence,
  type CodeErreurDocument,
  type Emplacement,
  ErreurDocument,
  type IdPage,
  type PageLue,
  type TypeDePage,
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
import type { TablesOuvertes } from "../table/tables-ouvertes.ts";
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
import { placeApres } from "./destination-de-page.ts";
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
  pageDeplacee,
  TITRE_CONTEXTE_NON_SECURISE,
  TITRE_VERSION_NON_PRISE_EN_CHARGE,
  titreAffiche,
  titreOnglet,
} from "./messages.ts";
import { ESPACES } from "./messages-espaces.ts";
import {
  DOCUMENT_D_ESPACE,
  EFFACEMENT_DANS_UN_AUTRE_ONGLET,
  EFFACER_LA_COPIE_LOCALE,
  LECTURE_SEULE,
} from "./messages-synchronisation.ts";
import { type NavigationDeLEspace, useNavigationDeLEspace } from "./navigation-espaces.ts";
import { usePageOuverte, usePagesOuvertes } from "./page-ouverte.ts";
import { type EtatDeLaTable, useTableOuverte, useTablesOuvertes } from "./table-ouverte.ts";
import { estDansLaDescendance, trouverPage } from "./pages.ts";
import type { ActionsBarre, EcranBarre } from "./RangeePage.tsx";
import { useRepli } from "./repli.ts";
import { type Tiroir, useTiroir } from "./tiroir.ts";
import { ZoneDeCompte } from "./ZoneDeCompte.tsx";
import { ZoneDesEspaces } from "./ZoneDesEspaces.tsx";
import { type Selection, ZonePrincipale } from "./ZonePrincipale.tsx";
import { idsDesPages } from "../synchronisation/index.ts";
import {
  type FabriqueDeSynchronisation,
  type SynchronisationDeLEspace,
  useSynchronisationDeLEspace,
} from "./synchronisation-ouverte.ts";
import { ZoneDeSynchronisation } from "./ZoneDeSynchronisation.tsx";

type Saisie = EcranBarre["saisie"];

const ACCUEIL: Route = { forme: "accueil" };

interface ProprietesApplication {
  readonly session: SessionEspace;
  /** État du compte et client d'authentification (F-010) ; absent, ni zone ni écrans de compte. */
  readonly compte?: Compte | undefined;
  /** Synchronisation de l'espace ouvert (F-013) ; absente, rien ne part et aucune zone n'est rendue. */
  readonly synchronisation?: FabriqueDeSynchronisation | undefined;
}

export function Application({
  session,
  compte,
  synchronisation,
}: ProprietesApplication): ReactElement {
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
      return (
        <EspacePret etat={etat} compte={compte} session={session} fabrique={synchronisation} />
      );
  }
}

// L'espace ouvert : la coquille reçoit la fenêtre entière, la barre latérale et le reste
// (avertissement, barre du haut, zone principale). Un écran de compte prend la place de la zone
// principale ; tout le reste demeure, arborescence et repli compris (F-010-AC3).
interface ProprietesEspacePret {
  readonly etat: EtatPret;
  readonly compte: Compte | undefined;
  readonly session: SessionEspace;
  readonly fabrique: FabriqueDeSynchronisation | undefined;
}

// Ce que l'écran de l'espace tient : navigation, sélection, page ouverte, synchronisation.
function useEspacePret(props: ProprietesEspacePret) {
  const { etat, compte } = props;
  const navigation = useNavigationDeLEspace(compte);
  const selection = selectionDe(navigation.route, etat.arborescence);
  useTitreOnglet(selection);
  const page = selection.type === "page" ? selection.page : undefined;
  // F-018-AC12, AC9 : une table n'ouvre que son document de table, jamais un document de page.
  const table = page?.type === "table" ? page : undefined;
  const pages = usePagesOuvertes();
  const etatDeLaPage = usePageOuverte(
    pages,
    etat.idEspace,
    table === undefined ? page?.id : undefined,
  );
  const tables = useTablesOuvertes();
  const etatDeLaTable = useTableOuverte(tables, etat.idEspace, table?.id);
  const synchronisation = useSynchronisationDeLEspace(
    {
      fabrique: props.fabrique,
      idEspace: etat.idEspace,
      doc: props.session.doc,
      idPage: table === undefined ? page?.id : undefined,
      page: etatDeLaPage,
      lirePages: () => pagesDeLaSession(props.session),
      fermerLesPages: (idPages) => void pages.effacer(undefined, idPages),
      toutFermer: () => toutFermer({ pages, tables }, props.session),
    },
    LECTURE_SEULE,
  );
  const barre = useBarreLaterale(etat, navigation.route, selection, synchronisation.lectureSeule);
  const documents: Documents = { pages, tables };
  return {
    navigation,
    selection,
    page,
    documents,
    etatDeLaPage,
    etatDeLaTable,
    synchronisation,
    barre,
  };
}

/** Les documents de page et de table que l'onglet tient pour l'espace ouvert. */
interface Documents {
  readonly pages: PagesOuvertes;
  readonly tables: TablesOuvertes;
}

function EspacePret(props: ProprietesEspacePret): ReactElement {
  const { etat, compte } = props;
  const { racines } = etat.arborescence;
  const espace = useEspacePret(props);
  const { navigation, selection, page, documents, synchronisation, barre } = espace;
  const tiroir = useTiroir();
  const idBarre = useId();
  const enregistrement = etatAvecLaPage(etat, espace.etatDeLaPage ?? espace.etatDeLaTable);
  if (synchronisation.effaceeAilleurs) {
    return <EffaceeAilleurs />;
  }
  const zone = zoneDeSynchronisation(synchronisation, etat, enregistrement.enregistre, () =>
    toutFermer(documents, props.session),
  );
  return (
    <Coquille
      fenetre
      tiroir={attributsDuTiroir(tiroir, idBarre)}
      barre={barreLateraleDe(barre, tiroir, compte, navigation.corbeille, zone)}
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
        documents={documents}
        selection={selection}
        page={espace.etatDeLaPage}
        table={espace.etatDeLaTable}
        lectureSeule={synchronisation.lectureSeule}
        etroit={tiroir.etroit}
      />
    </Coquille>
  );
}

// La session est seule abonnée de la façade du document d'espace (ADR-0007) : la synchronisation
// lit les pages dans son état, déjà relu quand une mise à jour reçue lui parvient.
function pagesDeLaSession(session: SessionEspace): ReadonlySet<string> | undefined {
  const lu = session.lireEtat();
  return lu.phase === "pret" ? idsDesPages(lu.arborescence) : undefined;
}

// Avant l'effacement de la copie locale, plus rien de l'onglet ne tient une base (AC24).
function toutFermer({ pages, tables }: Documents, session: SessionEspace): void {
  pages.fermer();
  tables.fermer();
  session.fermer();
}

function EffaceeAilleurs(): ReactElement {
  return (
    <EcranPlein fenetre>
      <EcranBloquant
        titre={EFFACER_LA_COPIE_LOCALE}
        explication={EFFACEMENT_DANS_UN_AUTRE_ONGLET}
      />
    </EcranPlein>
  );
}

/** Toutes les pages de l'espace, arborescence et corbeille, à toute profondeur. */
function toutesLesPages(etat: EtatPret): PageLue[] {
  const aVoir = [...etat.arborescence.racines, ...etat.arborescence.corbeille];
  for (const vue of aVoir) {
    aVoir.push(...vue.enfants);
  }
  return aVoir;
}

// La zone de synchronisation (F-013), à côté de la zone de compte : absente sans synchronisation.
function zoneDeSynchronisation(
  synchronisation: SynchronisationDeLEspace,
  etat: EtatPret,
  stockageDisponible: boolean,
  avantLEffacement: () => void,
): ReactElement | undefined {
  const { synchro, etat: etatSynchro } = synchronisation;
  if (synchro === undefined || etatSynchro === undefined) {
    return undefined;
  }
  const pagesLues = toutesLesPages(etat);
  return (
    <ZoneDeSynchronisation
      synchro={synchro}
      etat={etatSynchro}
      titreDe={(idPage) =>
        idPage === undefined
          ? DOCUMENT_D_ESPACE
          : (pagesLues.find((lue) => lue.id === idPage)?.titre ?? "")
      }
      nombreDePages={pagesLues.length}
      stockageDisponible={stockageDisponible}
      avantLEffacement={avantLEffacement}
    />
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
  readonly documents: Documents;
  readonly selection: Selection;
  readonly page: ReturnType<typeof usePageOuverte>;
  /** État de la table sélectionnée (F-018-AC12) ; `undefined` si la sélection n'en est pas une. */
  readonly table: EtatDeLaTable;
  readonly lectureSeule: string | undefined;
  /** Écran étroit : pas de poignée de bloc, le geste à la souris est celui d'un écran large. */
  readonly etroit: boolean;
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
          operations={operationsDeLaCorbeille(etat, props.documents, props.lectureSeule)}
          lectureSeule={props.lectureSeule}
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
      table={props.table}
      idEspace={etat.idEspace}
      raisonDeLectureSeule={props.lectureSeule}
      lectureSeule={props.lectureSeule !== undefined}
      poignees={!props.etroit}
    />
  );
}

/**
 * Opérations de l'écran de la corbeille (F-007) : refus traduits, puis effacement des bases. En
 * lecture seule (F-013-AC25), chacune est refusée avec sa raison, quel que soit le chemin qui y mène
 * (une confirmation ouverte avant le changement de droit comprise) : le bouton désactivé n'est pas
 * la seule garde.
 */
function operationsDeLaCorbeille(
  etat: EtatPret,
  documents: Documents,
  lectureSeule: string | undefined,
): OperationsDeLaCorbeille {
  if (lectureSeule !== undefined) {
    return { restaurer: () => lectureSeule, supprimer: () => ({ refus: lectureSeule }) };
  }
  return {
    restaurer: (page) => {
      const { refus } = essayer(() => etat.operations.restaurerPage(page.id));
      return refus === undefined ? undefined : messageErreur(refus);
    },
    supprimer: (page) => supprimerDefinitivement(etat, documents, page.id),
  };
}

// La suppression reste faite quoi qu'il advienne de l'effacement (F-007 H8). Pendant une coupure
// de la persistance de l'espace, ou tant que l'espace est inconnu, l'effacement des bases n'est pas
// tenté : son issue est un échec, que l'écran signale (F-007-AC21).
function supprimerDefinitivement(
  etat: EtatPret,
  { pages, tables }: Documents,
  id: IdPage,
): IssueDeSuppression {
  const essai = essayer(() => etat.operations.supprimerDefinitivement(id));
  if (essai.refus !== undefined) {
    return { refus: messageErreur(essai.refus) };
  }
  // Les documents des pages retirées sont fermés et détruits dans tous les cas ; seul l'effacement
  // des bases est omis quand il ne peut pas être tenté.
  const idEspace = etat.enregistre ? etat.idEspace : undefined;
  // F-018-AC49 : quel que soit son type, chaque identifiant retiré perd sa base de page, sa base de
  // table et ses réglages de vue ; le type d'une entrée retirée n'est plus lisible (H11).
  return {
    refus: undefined,
    effacement: Promise.all([
      pages.effacer(idEspace, essai.valeur),
      tables.effacer(idEspace, essai.valeur),
    ]).then((issues) => (issues.every((issue) => issue === "effacee") ? "effacee" : "echec")),
  };
}

function barreLateraleDe(
  barre: Barre,
  tiroir: Tiroir,
  compte: Compte | undefined,
  corbeilleCourante: boolean,
  synchronisation: ReactElement | undefined,
): ReactElement {
  return (
    <BarreLaterale
      corbeilleCourante={corbeilleCourante}
      racines={barre.racines}
      ecran={barre.ecran}
      actions={barre.actions}
      erreur={barre.erreur}
      annonce={barre.annonce}
      boutonNouvellePage={barre.boutonNouvellePage}
      fermeture={tiroir.ouvert ? <BoutonDeFermeture tiroir={tiroir} /> : undefined}
      synchronisation={synchronisation}
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
  /** Dernière annonce d'un déplacement au clavier (F-006-AC12). */
  readonly annonce: string;
  readonly boutonNouvellePage: RefObject<HTMLButtonElement | null>;
}

/** Ce dont une action de la barre a besoin pour écrire dans le document et dire son refus. */
interface Moyens {
  readonly operations: EtatPret["operations"];
  readonly setSaisie: (saisie: Saisie) => void;
  readonly setErreur: (erreur: string | undefined) => void;
  readonly deplier: (pages: readonly IdPage[]) => void;
  /** Arborescence lue au rendu : celle où un déplacement est calculé et annoncé. */
  readonly racines: readonly PageLue[];
  readonly setAnnonce: (annonce: string) => void;
}

// État d'écran de la barre : pages repliées, saisie ouverte, dernier refus. Le menu ouvert, le
// tiroir et le repli du fil d'Ariane n'y entrent pas : chacun vit dans son composant (F-004-AC58).
function useBarreLaterale(
  etat: EtatPret,
  route: Route,
  selection: Selection,
  lectureSeule: string | undefined,
): Barre {
  const idPageCourante = selection.type === "page" ? selection.page.id : undefined;
  const idPageDesignee = route.forme === "page" ? route.idPage : undefined;
  const repli = useRepli(etat.arborescence.racines, idPageDesignee);
  const [saisie, setSaisie] = useState<Saisie>(undefined);
  const [erreur, setErreur] = useState<string | undefined>(undefined);
  const [annonce, setAnnonce] = useState("");
  const boutonNouvellePage = useRef<HTMLButtonElement>(null);
  const moyens: Moyens = {
    operations: etat.operations,
    setSaisie,
    setErreur,
    deplier: repli.deplier,
    racines: etat.arborescence.racines,
    setAnnonce,
  };

  const actions = actionsDeLaBarre(moyens, {
    lectureSeule,
    idPageCourante,
    boutonNouvellePage,
    basculerRepli: repli.basculer,
  });

  return {
    racines: etat.arborescence.racines,
    ecran: { idPageCourante, repliees: repli.repliees, saisie, lectureSeule },
    actions,
    erreur,
    annonce,
    boutonNouvellePage,
  };
}

// F-013-AC25 : en lecture seule, aucune action de la barre n'écrit, par quelque chemin qu'elle
// arrive (bouton, menu, raccourci, double-clic, saisie ouverte avant le changement de droit).
function actionsDeLaBarre(
  moyens: Moyens,
  contexte: {
    readonly lectureSeule: string | undefined;
    readonly idPageCourante: IdPage | undefined;
    readonly boutonNouvellePage: RefObject<HTMLButtonElement | null>;
    readonly basculerRepli: ActionsBarre["basculerRepli"];
  },
): ActionsBarre {
  const ecrit = contexte.lectureSeule === undefined;
  return {
    creerPage: (parent) => {
      if (ecrit) {
        creerPage(moyens, parent, "page");
      }
    },
    // F-018-AC10 : comme une page, au titre vide, en dernière position sous le parent visé.
    creerTable: (parent) => {
      if (ecrit) {
        creerPage(moyens, parent, "table");
      }
    },
    ouvrirSaisie: (idPage) => {
      if (ecrit) {
        moyens.setErreur(undefined);
        moyens.setSaisie({ idPage, erreur: undefined });
      }
    },
    validerTitre: (idPage, titre) => {
      if (ecrit) {
        return validerTitre(moyens, idPage, titre);
      }
      moyens.setSaisie(undefined);
      return true;
    },
    annulerSaisie: () => moyens.setSaisie(undefined),
    mettreALaCorbeille: (page) => {
      if (ecrit && mettreALaCorbeille(moyens, page, contexte.idPageCourante)) {
        contexte.boutonNouvellePage.current?.focus();
      }
    },
    deplacer: (idPage, ou, auClavier) => ecrit && deplacerLaPage(moyens, idPage, ou, auClavier),
    basculerRepli: contexte.basculerRepli,
    annoncer: moyens.setAnnonce,
  };
}

/**
 * Le seul appel de `deplacerPage` d'apps/web (F-006-AC30) : un geste lâché ou une commande au
 * clavier. Un refus typé est dit comme tout refus de la barre (F-002-AC15) ; un succès déplie la
 * nouvelle mère, sans toucher au repli des autres pages, ni à la page sélectionnée
 * ni à l'adresse (F-006-AC3, AC9). Au clavier, la nouvelle place est annoncée (F-006-AC12).
 */
function deplacerLaPage(
  moyens: Moyens,
  idPage: IdPage,
  ou: Emplacement,
  auClavier: boolean,
): boolean {
  const place = placeApres(moyens.racines, idPage, ou);
  const { refus } = essayer(() => moyens.operations.deplacerPage(idPage, ou));
  if (refus !== undefined) {
    moyens.setErreur(messageErreur(refus));
    return false;
  }
  moyens.setErreur(undefined);
  // Les ancêtres de la nouvelle mère sont déjà dépliés : elle était visible, cible du geste, sœur
  // précédente ou mère de la mère de la page déplacée.
  if (ou.parent !== null) {
    moyens.deplier([ou.parent]);
  }
  const page = trouverPage(moyens.racines, idPage);
  if (auClavier && place !== undefined && page !== undefined) {
    const mere = place.parent === undefined ? undefined : titreAffiche(place.parent.titre);
    moyens.setAnnonce(pageDeplacee(titreAffiche(page.titre), mere, place.rang, place.total));
  }
  return true;
}

function creerPage(moyens: Moyens, parent: IdPage | null, type: TypeDePage): void {
  const creer = type === "table" ? moyens.operations.creerTable : moyens.operations.creerPage;
  const resultat = essayer(() => creer("", { parent }));
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
