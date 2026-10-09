import type { IdPage, PageLue } from "@notionlike/document";
import { type KeyboardEvent, type ReactElement, type RefObject, useEffect, useRef } from "react";

import { type EntreeDeMenu, MenuActions } from "./composants/MenuActions.tsx";
import { Rangee, type Repli } from "./composants/Rangee.tsx";
import { useFlottant } from "./flottant.ts";
import {
  AJOUTER_UNE_SOUS_PAGE,
  descriptionDeSousPage,
  METTRE_A_LA_CORBEILLE,
  nomActionsDeLaPage,
  nomAjouterSousPage,
  nomSousPages,
  RENOMMER,
  titreAffiche,
} from "./messages.ts";
import { adresseDePage } from "./pages.ts";
import { afficherTouches, cleAria, estLaFrappe, RACCOURCIS } from "./raccourcis.ts";
import { SaisieTitre } from "./SaisieTitre.tsx";

/** État d'écran de la barre latérale : il vit dans `Application`, hors du document d'espace. */
export interface EcranBarre {
  readonly idPageCourante: IdPage | undefined;
  readonly repliees: ReadonlySet<IdPage>;
  readonly saisie: { readonly idPage: IdPage; readonly erreur: string | undefined } | undefined;
}

export interface ActionsBarre {
  readonly creerPage: (parent: IdPage | null) => void;
  readonly ouvrirSaisie: (id: IdPage) => void;
  readonly validerTitre: (id: IdPage, titre: string) => boolean;
  readonly annulerSaisie: () => void;
  readonly mettreALaCorbeille: (page: PageLue) => void;
  readonly basculerRepli: (id: IdPage) => void;
}

interface Proprietes {
  readonly page: PageLue;
  /** Profondeur de la page dans l'arbre, 1 à la racine. */
  readonly niveau: number;
  /** Page mère ; absente à la racine. */
  readonly mere: PageLue | undefined;
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
  const menu = useFlottant<HTMLDivElement>();
  const renommer = (): void => {
    menu.fermer();
    actions.ouvrirSaisie(page.id);
  };
  const surTouche = (evenement: KeyboardEvent<HTMLElement>): void => {
    if (!enSaisie && estLaFrappe(evenement, RACCOURCIS.renommer)) {
      evenement.preventDefault();
      renommer();
    }
  };
  const entrees = entreesDuMenu({
    renommer,
    ajouter: () => actions.creerPage(page.id),
    jeter: () => actions.mettreALaCorbeille(page),
  });
  return (
    <Rangee
      niveau={niveau}
      titre={titre}
      adresse={adresseDePage(page.id)}
      courante={ecran.idPageCourante === page.id}
      description={mere === undefined ? undefined : descriptionDeSousPage(niveau, mere.titre)}
      repli={repliDe(page, titre, ecran, actions)}
      ajout={{ nom: nomAjouterSousPage(titre), surActivation: () => actions.creerPage(page.id) }}
      actions={{ nom: nomActionsDeLaPage(titre), surActivation: menu.basculer }}
      menuOuvert={menu.ouvert}
      refLien={lien}
      refActions={menu.commande}
      surDoubleClic={renommer}
      surTouche={surTouche}
      saisie={enSaisie ? <SaisieDeRangee {...props} /> : undefined}
      menu={
        menu.ouvert ? (
          <MenuActions ref={menu.surface} nom={nomActionsDeLaPage(titre)} entrees={entrees} />
        ) : undefined
      }
    />
  );
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
): Repli | undefined {
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
  readonly jeter: () => void;
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
    },
    { libelle: AJOUTER_UNE_SOUS_PAGE, surActivation: effets.ajouter },
    { libelle: METTRE_A_LA_CORBEILLE, surActivation: effets.jeter },
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
