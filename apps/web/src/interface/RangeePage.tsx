import type { Emplacement, IdPage, PageLue } from "@notionlike/document";
import {
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";

import { useElementGlissable } from "../glisser/index.ts";
import { type EntreeDeMenu, MenuActions } from "./composants/MenuActions.tsx";
import { Rangee, type RepliDeRangee } from "./composants/Rangee.tsx";
import { type CommandeDeDeplacement, destinationDeLaCommande } from "./destination-de-page.ts";
import { useFlottant } from "./flottant.ts";
import {
  AJOUTER_UNE_SOUS_PAGE,
  AUCUNE_PAGE_PRECEDENTE,
  commandeIndisponible,
  DEJA_A_LA_RACINE,
  DEJA_DERNIERE,
  DEJA_PREMIERE,
  DESCENDRE,
  descriptionDeSousPage,
  METTRE_A_LA_CORBEILLE,
  METTRE_SOUS_LA_PAGE_PRECEDENTE,
  MONTER,
  nomActionsDeLaPage,
  nomAjouterSousPage,
  nomSousPages,
  RENOMMER,
  SORTIR_D_UN_NIVEAU,
  titreAffiche,
} from "./messages.ts";
import { adresseDePage } from "./pages.ts";
import {
  afficherTouches,
  cleAria,
  type Combinaison,
  estLaFrappe,
  RACCOURCIS,
} from "./raccourcis.ts";
import { AJOUTER_UNE_TABLE, MARQUE_DE_TABLE } from "./messages-tables.ts";
import { SaisieTitre } from "./SaisieTitre.tsx";

/** État d'écran de la barre latérale : pages repliées (`repli.ts`) et saisie ouverte
 * (`Application`), hors du document d'espace. */
export interface EcranBarre {
  readonly idPageCourante: IdPage | undefined;
  readonly repliees: ReadonlySet<IdPage>;
  readonly saisie: { readonly idPage: IdPage; readonly erreur: string | undefined } | undefined;
  /**
   * Raison qui désactive chaque action qui écrit dans le document d'espace (F-013-AC25) ;
   * `undefined` : l'espace est modifiable.
   */
  readonly lectureSeule?: string | undefined;
}

export interface ActionsBarre {
  readonly creerPage: (parent: IdPage | null) => void;
  /** Crée une table au titre vide en dernière position sous ce parent (F-018-AC10). */
  readonly creerTable: (parent: IdPage | null) => void;
  readonly ouvrirSaisie: (id: IdPage) => void;
  readonly validerTitre: (id: IdPage, titre: string) => boolean;
  readonly annulerSaisie: () => void;
  readonly mettreALaCorbeille: (page: PageLue) => void;
  /**
   * Déplace la page (F-006) ; `auClavier` : la nouvelle place est annoncée (F-006-AC12). Rend vrai
   * si la page a été déplacée.
   */
  readonly deplacer: (id: IdPage, ou: Emplacement, auClavier: boolean) => boolean;
  readonly basculerRepli: (id: IdPage) => void;
  /** Dit ce texte dans la région d'état de la barre : commande sans destination (F-006-AC11). */
  readonly annoncer: (texte: string) => void;
}

interface Proprietes {
  readonly page: PageLue;
  /** Profondeur de la page dans l'arbre, 1 à la racine. */
  readonly niveau: number;
  /** Page mère ; absente à la racine. */
  readonly mere: PageLue | undefined;
  /** Arborescence lue : celle où se calcule la destination d'une commande de déplacement. */
  readonly racines: readonly PageLue[];
  readonly ecran: EcranBarre;
  readonly actions: ActionsBarre;
}

// Une rangée ne rend pas ses sous-pages : la liste est plate, la hiérarchie est portée par
// `aria-level`, par le retrait et par la description du lien. Un rendu imbriqué fait déborder la
// pile du navigateur dès 1 000 niveaux (mesuré dans Chromium), et une arborescence reçue n'a pas de
// profondeur bornée. Le menu ouvert est un état de la rangée, pas de la barre.
export function RangeePage(props: Proprietes): ReactElement {
  const { page, niveau, mere, ecran, actions } = props;
  const titre = titreAffiche(page.titre);
  const enSaisie = ecran.saisie?.idPage === page.id;
  const lien = useLienRefocalise(enSaisie);
  const raison = ecran.lectureSeule;
  const deplacement = useDeplacementAuClavier(props);
  const { menu, renommer, entrees } = useMenuDeRangee(props, deplacement);
  const glisser = useElementGlissable(page.id);
  const surTouche = (evenement: KeyboardEvent<HTMLElement>): void => {
    if (enSaisie) {
      return;
    }
    if (estLaFrappe(evenement, RACCOURCIS.renommer)) {
      evenement.preventDefault();
      renommer();
      return;
    }
    deplacement.surRaccourci(evenement);
  };
  return (
    <Rangee
      niveau={niveau}
      titre={titre}
      adresse={adresseDePage(page.id)}
      courante={ecran.idPageCourante === page.id}
      description={mere === undefined ? undefined : descriptionDeSousPage(niveau, mere.titre)}
      repli={repliDe(page, titre, ecran, actions)}
      ajout={{
        nom: nomAjouterSousPage(titre),
        surActivation: () => actions.creerPage(page.id),
        raison,
      }}
      actions={{ nom: nomActionsDeLaPage(titre), surActivation: menu.basculer }}
      menuOuvert={menu.ouvert}
      refLien={lien}
      refActions={menu.commande}
      surDoubleClic={renommer}
      surTouche={surTouche}
      glisser={glisser}
      marqueDeTable={page.type === "table" ? MARQUE_DE_TABLE : undefined}
      saisie={enSaisie ? <SaisieDeRangee {...props} /> : undefined}
      menu={
        menu.ouvert ? (
          <MenuActions ref={menu.surface} nom={nomActionsDeLaPage(titre)} entrees={entrees} />
        ) : undefined
      }
    />
  );
}

// Une entrée ferme le menu avant d'agir, et rend le focus au bouton « ⋯ » : il y reste si
// l'opération est refusée, sous son message ; sinon l'action le porte où elle l'entend. En lecture
// seule, chaque entrée qui écrit est désactivée, et le renommage n'ouvre aucune saisie (F-013-AC25).
function useMenuDeRangee(props: Proprietes, deplacement: DeplacementAuClavier) {
  const { page, actions } = props;
  const raison = props.ecran.lectureSeule;
  const menu = useFlottant<HTMLDivElement>();
  const renommer = (): void => {
    menu.fermer();
    if (raison === undefined) {
      actions.ouvrirSaisie(page.id);
    }
  };
  const depuisLeMenu = (effet: () => void) => (): void => {
    menu.fermer();
    menu.commande.current?.focus();
    effet();
  };
  // Les entrées ne se calculent que menu ouvert : chaque commande de déplacement lit l'arborescence.
  const entrees = menu.ouvert
    ? [
        ...entreesDuMenu({
          renommer,
          ajouter: depuisLeMenu(() => actions.creerPage(page.id)),
          ajouterUneTable: depuisLeMenu(() => actions.creerTable(page.id)),
          jeter: depuisLeMenu(() => actions.mettreALaCorbeille(page)),
          raison,
        }),
        ...deplacement.entrees((commande) => {
          menu.fermer();
          menu.commande.current?.focus();
          deplacement.deplacer(commande, menu.commande.current);
        }),
      ]
    : [];
  return { menu, renommer, entrees };
}

interface CommandeDeRangee {
  readonly commande: CommandeDeDeplacement;
  readonly libelle: string;
  readonly combinaison: Combinaison;
  /** Raison donnée quand la commande n'a pas de destination (F-006-AC11). */
  readonly indisponible: string;
}

// Les quatre commandes de déplacement (F-006-AC10), dans l'ordre du menu.
const COMMANDES_DE_LA_RANGEE: readonly CommandeDeRangee[] = [
  {
    commande: "monter",
    libelle: MONTER,
    combinaison: RACCOURCIS.monterLaPage,
    indisponible: DEJA_PREMIERE,
  },
  {
    commande: "descendre",
    libelle: DESCENDRE,
    combinaison: RACCOURCIS.descendreLaPage,
    indisponible: DEJA_DERNIERE,
  },
  {
    commande: "sous-la-precedente",
    libelle: METTRE_SOUS_LA_PAGE_PRECEDENTE,
    combinaison: RACCOURCIS.mettreSousLaPagePrecedente,
    indisponible: AUCUNE_PAGE_PRECEDENTE,
  },
  {
    commande: "sortir",
    libelle: SORTIR_D_UN_NIVEAU,
    combinaison: RACCOURCIS.sortirDUnNiveau,
    indisponible: DEJA_A_LA_RACINE,
  },
];

interface DeplacementAuClavier {
  /** Entrées du menu, désactivées avec leur raison quand elles sont sans destination. */
  readonly entrees: (activer: (commande: CommandeDeDeplacement) => void) => EntreeDeMenu[];
  readonly deplacer: (commande: CommandeDeDeplacement, focus: HTMLElement | null) => void;
  /** Alt+Maj+Flèche dans la rangée, hors de son menu (F-006-AC10). */
  readonly surRaccourci: (evenement: KeyboardEvent<HTMLElement>) => void;
}

// Après un déplacement au clavier, le focus est rendu à l'élément de la rangée qui l'avait : la
// liste a déplacé le nœud de la rangée, et un nœud retiré puis réinséré perd le focus (F-006-AC12).
// Aucun test n'échoue sans cette reprise : React déplace la rangée par `insertBefore`, et jsdom
// comme Chromium gardent alors le focus du nœud déplacé. Elle est gardée parce que ce maintien
// n'est pas garanti par la spécification du DOM (un nœud retiré perd le focus) ni par tous les
// navigateurs : sans elle, le focus retomberait sur le corps du document, hors de la barre.
function useFocusRendu(): RefObject<HTMLElement | null> {
  const aRefocaliser = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const cible = aRefocaliser.current;
    aRefocaliser.current = null;
    if (cible !== null && cible.isConnected && document.activeElement !== cible) {
      cible.focus();
    }
  });
  return aRefocaliser;
}

function useDeplacementAuClavier(props: Proprietes): DeplacementAuClavier {
  const { page, racines, actions } = props;
  const raison = props.ecran.lectureSeule;
  const aRefocaliser = useFocusRendu();
  const raisonDe = (commande: CommandeDeRangee): string | undefined =>
    raison ??
    (destinationDeLaCommande(racines, page.id, commande.commande).sorte === "deplacer"
      ? undefined
      : commande.indisponible);
  const deplacer = (commande: CommandeDeDeplacement, focus: HTMLElement | null): void => {
    const destination = destinationDeLaCommande(racines, page.id, commande);
    if (raison === undefined && destination.sorte === "deplacer") {
      if (actions.deplacer(page.id, destination.ou, true)) {
        aRefocaliser.current = focus;
      }
      return;
    }
    const visee = COMMANDES_DE_LA_RANGEE.find((une) => une.commande === commande);
    if (visee !== undefined) {
      actions.annoncer(commandeIndisponible(visee.libelle, raisonDe(visee)));
    }
  };
  return {
    entrees: (activer) =>
      COMMANDES_DE_LA_RANGEE.map((commande) => ({
        libelle: commande.libelle,
        touches: afficherTouches(commande.combinaison),
        raccourci: cleAria(commande.combinaison),
        surActivation: () => activer(commande.commande),
        raison: raisonDe(commande),
      })),
    deplacer,
    surRaccourci: (evenement) => {
      const visee = COMMANDES_DE_LA_RANGEE.find(({ combinaison }) =>
        estLaFrappe(evenement, combinaison),
      );
      const cible = evenement.target;
      if (
        visee === undefined ||
        !(cible instanceof HTMLElement) ||
        cible.closest('[role="menu"]')
      ) {
        return;
      }
      evenement.preventDefault();
      deplacer(visee.commande, cible);
    },
  };
}

// La saisie rouvre sur le titre enregistré, tel quel, et non sur le titre affiché (F-002-AC6).
function SaisieDeRangee({ page, ecran, actions }: Proprietes): ReactElement {
  return (
    <SaisieTitre
      titreInitial={page.titre}
      erreur={ecran.saisie?.erreur}
      surValider={(saisi) => actions.validerTitre(page.id, saisi)}
      surAnnuler={actions.annulerSaisie}
    />
  );
}

function repliDe(
  page: PageLue,
  titre: string,
  ecran: EcranBarre,
  actions: ActionsBarre,
): RepliDeRangee | undefined {
  if (page.enfants.length === 0) {
    return undefined;
  }
  return {
    nom: nomSousPages(titre),
    deplie: !ecran.repliees.has(page.id),
    surBascule: () => actions.basculerRepli(page.id),
  };
}

interface EffetsDuMenu {
  readonly renommer: () => void;
  readonly ajouter: () => void;
  readonly ajouterUneTable: () => void;
  readonly jeter: () => void;
  /** Lecture seule : chaque entrée qui écrit est désactivée avec cette raison (F-013-AC25). */
  readonly raison: string | undefined;
}

// Chaque entrée appelle la fonction de l'action de F-002 (F-004-AC26). Les features suivantes
// ajoutent leurs commandes de rangée ici, pas dans la rangée.
function entreesDuMenu(effets: EffetsDuMenu): readonly EntreeDeMenu[] {
  return [
    {
      libelle: RENOMMER,
      touches: afficherTouches(RACCOURCIS.renommer),
      raccourci: cleAria(RACCOURCIS.renommer),
      surActivation: effets.renommer,
      raison: effets.raison,
    },
    { libelle: AJOUTER_UNE_SOUS_PAGE, surActivation: effets.ajouter, raison: effets.raison },
    // F-018-AC10 : une table sous cette page, comme une sous-page.
    { libelle: AJOUTER_UNE_TABLE, surActivation: effets.ajouterUneTable, raison: effets.raison },
    { libelle: METTRE_A_LA_CORBEILLE, surActivation: effets.jeter, raison: effets.raison },
  ];
}

// Quand la saisie se ferme au clavier, le champ disparaît avec le focus : il revient au lien de la
// page. Une sortie du champ a déjà porté le focus ailleurs : il n'est pas repris.
function useLienRefocalise(enSaisie: boolean): RefObject<HTMLAnchorElement | null> {
  const lien = useRef<HTMLAnchorElement>(null);
  const etaitEnSaisie = useRef(enSaisie);
  useEffect(() => {
    const focusPerdu = document.activeElement === null || document.activeElement === document.body;
    if (etaitEnSaisie.current && !enSaisie && focusPerdu) {
      lien.current?.focus();
    }
    etaitEnSaisie.current = enSaisie;
  }, [enSaisie]);
  return lien;
}
