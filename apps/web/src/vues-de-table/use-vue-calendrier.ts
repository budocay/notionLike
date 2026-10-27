// État et commandes de la vue calendrier (F-021) : le mois affiché (en mémoire, par onglet, AC2), le
// suivi du focus, la saisie d'un titre, la boîte ouverte, les annonces et le menu. Les écritures sont
// celles de `use-ecritures-calendrier.ts` ; le placement des lignes vient de `repartition.ts`.
import type { DocumentTable, LigneLue, TableLue } from "@notionlike/document";
import { type ReactNode, type RefObject, useId, useRef, useState } from "react";

import type { Moyens } from "./actions.ts";
import { aujourdhui } from "./aujourdhui.ts";
import { moisPrecedent, moisSuivant } from "./jours.ts";
import { type ModeleDuCalendrier, useModeleDuCalendrier } from "./modele-calendrier.ts";
import { repliDeLaCible } from "./repli-calendrier.ts";
import { useColonneChoisie } from "./reglages-calendrier.ts";
import { colonnesDeDate } from "./repartition.ts";
import { ecrireLeJour } from "./jours.ts";
import {
  type BoiteDuCalendrier,
  type CommandesDuCalendrier,
  commandesDuCalendrier,
} from "./commandes-du-calendrier.ts";
import {
  type NavigationDuCalendrier,
  useNavigationDuCalendrier,
} from "./use-navigation-du-calendrier.ts";
import { useEditionDuCalendrier } from "./use-ecritures-calendrier.ts";
import { type MenuDuCalendrier, useMenuDuCalendrier } from "./use-menu-calendrier.ts";
import type { Saisie } from "./use-saisie-du-titre.ts";
import { type SuiviDuFocus, useSuiviDuFocus } from "./use-suivi-du-focus.ts";
import { useAnnonce } from "./use-vue-tableau.ts";

export type { BoiteDuCalendrier, CommandesDuCalendrier } from "./commandes-du-calendrier.ts";
export { ENTREES_PAR_CASE } from "./use-navigation-du-calendrier.ts";

export interface ProprietesVueCalendrier {
  readonly table: DocumentTable;
  readonly lue: TableLue;
  /** Les lignes affichées, calculées par `lignesAffichees` (F-018-AC45). */
  readonly lignes: readonly LigneLue[];
  readonly titre: string;
  readonly lectureSeule?: string | undefined;
  readonly idEspace: string | undefined;
  readonly idTable: string;
  readonly selecteur?: ReactNode | undefined;
}

export interface VueCalendrier {
  readonly proprietes: ProprietesVueCalendrier;
  readonly modele: ModeleDuCalendrier;
  readonly navigation: NavigationDuCalendrier;
  readonly colonnesDeDate: ReturnType<typeof colonnesDeDate>;
  readonly aujourdhui: string;
  readonly jourFocalisable: string;
  readonly saisie: Saisie["saisie"];
  readonly boite: BoiteDuCalendrier | undefined;
  readonly menu: MenuDuCalendrier;
  readonly annonce: string;
  readonly alerte: string | undefined;
  readonly idAlerte: string;
  readonly cadre: RefObject<HTMLDivElement | null>;
  readonly suivi: SuiviDuFocus;
  readonly moyens: Moyens;
  readonly precedentDisponible: boolean;
  readonly suivantDisponible: boolean;
  readonly commandes: CommandesDuCalendrier;
}

function jourFocalisableDe(
  { grille }: ModeleDuCalendrier,
  { mois, courant }: NavigationDuCalendrier,
  aujourdhuiJour: string,
): string {
  if (courant !== undefined && grille.includes(courant)) {
    return courant;
  }
  return grille.includes(aujourdhuiJour) ? aujourdhuiJour : ecrireLeJour({ ...mois, quantieme: 1 });
}

function moyensDeLaBoite(
  proprietes: ProprietesVueCalendrier,
  annoncer: (texte: string) => void,
  signaler: (message: string | undefined) => void,
): Moyens {
  const { table, lue, lignes, lectureSeule } = proprietes;
  return {
    table,
    lue,
    lignes,
    lectureSeule,
    allerVers: () => undefined,
    annoncer,
    signaler,
    focaliserLInvitation: () => undefined,
  };
}

function reperesDuCalendrier(
  lue: ProprietesVueCalendrier["lue"],
  modele: ModeleDuCalendrier,
  navigation: NavigationDuCalendrier,
): Pick<VueCalendrier, "colonnesDeDate" | "aujourdhui" | "jourFocalisable"> {
  const jour = aujourdhui();
  return {
    colonnesDeDate: colonnesDeDate(lue.colonnes),
    aujourdhui: jour,
    jourFocalisable: jourFocalisableDe(modele, navigation, jour),
  };
}

function bornesDuMois(
  mois: NavigationDuCalendrier["mois"],
): Pick<VueCalendrier, "precedentDisponible" | "suivantDisponible"> {
  return {
    precedentDisponible: moisPrecedent(mois) !== undefined,
    suivantDisponible: moisSuivant(mois) !== undefined,
  };
}

export function useVueCalendrier(proprietes: ProprietesVueCalendrier): VueCalendrier {
  const { table, lue, lignes, lectureSeule } = proprietes;
  const [annonce, annoncer] = useAnnonce();
  const [alerte, signaler] = useState<string | undefined>(undefined);
  const idAlerte = useId();
  const [choisie, choisirLaColonne] = useColonneChoisie(proprietes);
  const navigation = useNavigationDuCalendrier(annoncer);
  const modele = useModeleDuCalendrier(lue, lignes, choisie, navigation.mois);
  const cadre = useRef<HTMLDivElement>(null);
  const suivi = useSuiviDuFocus(cadre, (cible) => repliDeLaCible(cible, modele, navigation));
  const menu = useMenuDuCalendrier();
  const edition = { table, modele, navigation, suivi, lectureSeule, annoncer, signaler };
  const { saisie, ecritures } = useEditionDuCalendrier(edition);
  const [boite, ouvrirUneBoite] = useState<BoiteDuCalendrier | undefined>(undefined);
  const commandes = commandesDuCalendrier({
    modele,
    navigation,
    saisie,
    suivi,
    menu,
    ecritures,
    cadre,
    choisirLaColonne,
    ouvrirUneBoite,
    annoncer,
  });
  return {
    proprietes,
    modele,
    navigation,
    ...reperesDuCalendrier(lue, modele, navigation),
    saisie: saisie.saisie,
    boite,
    menu,
    annonce,
    alerte: saisie.saisie?.erreur ?? alerte,
    idAlerte,
    cadre,
    suivi,
    moyens: moyensDeLaBoite(proprietes, annoncer, signaler),
    ...bornesDuMois(navigation.mois),
    commandes,
  };
}
