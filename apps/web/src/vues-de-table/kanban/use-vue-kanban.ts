// État et commandes de la vue kanban (F-020) : les piles calculées depuis la table lue, le focus des
// cartes, la saisie d'un titre, le menu des actions, la suppression, les annonces. Le document n'est
// écrit que par `actions-de-carte.ts`, `use-titre-de-carte.ts` et `supprimerUneLigne`.
import type { ColonneLue, DocumentTable, IdLigne, LigneLue, TableLue } from "@notionlike/document";
import { type RefObject, useEffect, useId, useMemo, useRef, useState } from "react";

import type { AnnoncesDesPiles } from "../../glisser/index.ts";
import { type MenuDeGrille, useMenuDeGrille } from "../menu-de-grille.ts";
import type { Surveillance } from "../ecritures.ts";
import { useAnnonce } from "../use-annonce.ts";
import { type ActionsDeCarte, actionsDeCarte, supprimerUneCarte } from "./actions-de-carte.ts";
import { annoncesDuKanban } from "./annonces.ts";
import { destinationDeLaCommande, placeDeLaCarte } from "./destination.ts";
import type { CommandesDeCarte } from "./entrees.ts";
import { idDeCarte, idDePile } from "./identifiants.ts";
import type { MoyensDuKanban } from "./moyens.ts";
import type { Parcours } from "./navigation.ts";
import { type Pile, regrouper } from "./piles.ts";
import { type FocusDesCartes, useFocusDesCartes } from "./use-focus-des-cartes.ts";
import { type LimitesDesPiles, useLimites } from "./use-limites.ts";
import { type TitreDeCarte, useTitreDeCarte } from "./use-titre-de-carte.ts";

export interface ProprietesDuPlateau {
  readonly table: DocumentTable;
  readonly lue: TableLue;
  readonly lignes: readonly LigneLue[];
  readonly regroupement: ColonneLue;
  readonly lectureSeule: string | undefined;
  readonly surveillance: Surveillance;
}

export interface SuppressionDeCarte {
  readonly carte: IdLigne | undefined;
  readonly demander: (carte: IdLigne) => void;
  /** Ferme la confirmation ; le focus revient à la carte qui l'a ouverte si `rendre`. */
  readonly fermer: (rendre: boolean) => void;
}

export interface VueKanban {
  readonly piles: readonly Pile[];
  readonly limites: LimitesDesPiles;
  readonly focus: FocusDesCartes;
  /** Les arrêts du plateau : cartes présentées, commandes de pile (AC15). */
  readonly parcours: Parcours;
  readonly titre: TitreDeCarte;
  readonly menu: MenuDeGrille;
  readonly suppression: SuppressionDeCarte;
  readonly actions: ActionsDeCarte;
  readonly cadre: RefObject<HTMLDivElement | null>;
  readonly annonce: string;
  readonly alerte: string | undefined;
  readonly idAlerte: string;
  readonly annonces: AnnoncesDesPiles;
  /** Les identifiants des cartes et des piles présentées : un geste dont l'un a disparu n'écrit rien. */
  readonly identifiants: readonly string[];
  /** Vrai : aucun geste ne démarre (lecture seule, saisie ouverte). */
  readonly desactivee: boolean;
  readonly proprietes: ProprietesDuPlateau;
  /** Ce que les actions de la vue demandent à son environnement. */
  readonly moyens: MoyensDuKanban;
  readonly commandesDe: (carte: IdLigne, titre: string) => CommandesDeCarte;
  readonly saisirLeTitre: (carte: IdLigne) => void;
  readonly confirmerLaSuppression: () => void;
}

// La confirmation d'une suppression rend le focus à la carte qui l'a ouverte, sauf si elle l'a
// supprimée (F-018-AC21 : commande d'origine).
function useSuppression(menu: MenuDeGrille): SuppressionDeCarte {
  const [carte, setCarte] = useState<IdLigne | undefined>(undefined);
  const aRendre = useRef(false);
  const origine = menu.origine;
  useEffect(() => {
    if (carte === undefined && aRendre.current) {
      aRendre.current = false;
      origine.current?.focus();
    }
  }, [carte, origine]);
  return {
    carte,
    demander: setCarte,
    fermer: (rendre) => {
      aRendre.current = rendre;
      setCarte(undefined);
    },
  };
}

function identifiantsDe(piles: readonly Pile[], limites: LimitesDesPiles): readonly string[] {
  return piles.flatMap((pile) => [
    idDePile(pile.option),
    ...pile.cartes.slice(0, limites.limiteDe(pile)).map(({ id }) => idDeCarte(id)),
  ]);
}

// Le voisin d'une carte supprimée : la suivante de sa pile, sinon la précédente.
function voisineDe(piles: readonly Pile[], carte: IdLigne): IdLigne | undefined {
  const place = placeDeLaCarte(piles, carte);
  if (place === undefined) {
    return undefined;
  }
  const cartes = piles[place.pile]?.cartes ?? [];
  return (cartes[place.rang + 1] ?? cartes[place.rang - 1])?.id;
}

function titreBrut(piles: readonly Pile[], carte: IdLigne): string {
  return piles.flatMap((pile) => pile.cartes).find(({ id }) => id === carte)?.titre ?? "";
}

// Ce que les commandes et les écrans partagent : les piles, les messages, le focus, la saisie.
function useBases(proprietes: ProprietesDuPlateau) {
  const { table, lue, lignes, regroupement, lectureSeule, surveillance } = proprietes;
  const piles = useMemo(() => regrouper(lue, lignes, regroupement), [lue, lignes, regroupement]);
  const [annonce, annoncer] = useAnnonce();
  const [alerte, signaler] = useState<string | undefined>(undefined);
  const limites = useLimites();
  const parcours = { limite: limites.limiteDe, creation: lectureSeule === undefined };
  const focus = useFocusDesCartes(piles, parcours);
  const titre = useTitreDeCarte({
    table,
    lue,
    lignes,
    lectureSeule,
    surveillance,
    signaler,
    rendre: focus.focaliser,
  });
  const menu = useMenuDeGrille();
  const suppression = useSuppression(menu);
  const idAlerte = useId();
  const cadre = useRef<HTMLDivElement>(null);
  const moyens = { table, lue, lignes, lectureSeule, surveillance, annoncer, signaler };
  return {
    piles,
    annonce,
    alerte,
    idAlerte,
    cadre,
    limites,
    parcours,
    focus,
    titre,
    menu,
    suppression,
    moyens,
  };
}

type Bases = ReturnType<typeof useBases>;

// Confirme la suppression : le focus passe à la carte voisine, ou au plateau s'il n'en reste aucune ;
// si la suppression est refusée, il revient à la carte.
function confirmer(bases: Bases): void {
  const carte = bases.suppression.carte;
  if (carte === undefined) {
    return;
  }
  const voisine = voisineDe(bases.piles, carte);
  bases.suppression.fermer(false);
  if (!supprimerUneCarte(bases.moyens, carte)) {
    bases.focus.focaliser(carte);
  } else if (voisine === undefined) {
    bases.cadre.current?.focus();
  } else {
    bases.focus.focaliser(voisine);
  }
}

// Les entrées du menu d'une carte : chacune se désactive avec sa raison (AC13, AC23).
function commandesDeLaCarte(
  bases: Bases,
  actions: ActionsDeCarte,
  saisirLeTitre: (carte: IdLigne) => void,
): VueKanban["commandesDe"] {
  const { piles, titre, suppression, moyens } = bases;
  return (carte, titreDeLaCarte) => ({
    titre: titreDeLaCarte,
    lectureSeule: moyens.lectureSeule,
    possible: (commande) => destinationDeLaCommande(piles, carte, commande) !== undefined,
    titreModifiable: titre.possible,
    fermer: bases.menu.fermer,
    deplacer: (commande) => actions.commander(carte, commande),
    modifierLeTitre: () => saisirLeTitre(carte),
    supprimer: () => suppression.demander(carte),
  });
}

export function useVueKanban(proprietes: ProprietesDuPlateau): VueKanban {
  const bases = useBases(proprietes);
  const { piles, titre, focus } = bases;
  // Entrée, F2 et la commande « Modifier le titre » : un refus (lecture seule, aucune colonne de titre)
  // est dit, la saisie ne s'ouvre pas.
  const saisirLeTitre = (carte: IdLigne): void => titre.commencer(carte, titreBrut(piles, carte));
  const actions = actionsDeCarte({
    ...bases.moyens,
    regroupement: proprietes.regroupement,
    piles,
    focaliser: focus.focaliser,
    limites: bases.limites,
    saisirLeTitre: (carte) =>
      titre.possible ? titre.commencer(carte, "") : focus.focaliser(carte),
  });
  return {
    ...bases,
    alerte: titre.saisie?.erreur ?? bases.alerte,
    actions,
    annonces: useMemo(() => annoncesDuKanban(piles), [piles]),
    identifiants: identifiantsDe(piles, bases.limites),
    desactivee: proprietes.lectureSeule !== undefined || titre.saisie !== undefined,
    proprietes,
    saisirLeTitre,
    commandesDe: commandesDeLaCarte(bases, actions, saisirLeTitre),
    confirmerLaSuppression: () => confirmer(bases),
  };
}
