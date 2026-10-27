// Commandes du calendrier qui écrivent dans le document de table (F-021-AC10 à AC14, AC24) : chacune
// par une seule opération de la façade (`commandes-calendrier.ts`), son refus dit en français, le
// focus et l'annonce décidés ici. En lecture seule, aucune n'écrit (AC26).
import type { DocumentTable, LigneLue } from "@notionlike/document";

import {
  creerUneLigneDuJour,
  ecrireLaDate,
  jourVise,
  type PasDeJours,
  supprimerLaLigne,
} from "./commandes-calendrier.ts";
import { decomposer } from "./jours.ts";
import type { ModeleDuCalendrier } from "./modele-calendrier.ts";
import { jourDeLaLigne } from "./repartition.ts";
import { annonceDeplacee, annonceSansDate, HORS_DES_BORNES } from "./textes-calendrier.ts";
import type { NavigationDuCalendrier } from "./use-navigation-du-calendrier.ts";
import { type Saisie, useSaisieDuTitre } from "./use-saisie-du-titre.ts";
import type { SuiviDuFocus } from "./use-suivi-du-focus.ts";

export interface EcrituresDuCalendrier {
  /** Écrit le jour (ou le retire avec `null`) ; rend le refus du document, s'il y en a un. */
  readonly fixerLaDate: (ligne: LigneLue, jour: string | null) => string | undefined;
  readonly retirerLaDate: (ligne: LigneLue) => void;
  readonly deplacer: (ligne: LigneLue, pas: PasDeJours) => void;
  readonly nouvelleLigne: (jour: string) => void;
  readonly supprimer: (ligne: LigneLue) => void;
}

interface Moyens {
  readonly table: DocumentTable;
  readonly modele: ModeleDuCalendrier;
  readonly navigation: NavigationDuCalendrier;
  readonly saisie: Saisie;
  readonly suivi: SuiviDuFocus;
  readonly lectureSeule: string | undefined;
  readonly annoncer: (texte: string) => void;
  readonly signaler: (message: string | undefined) => void;
}

type MoyensDEdition = Omit<Moyens, "saisie">;

/** La saisie du titre et les écritures, qui se rendent le focus l'une à l'autre. */
export function useEditionDuCalendrier(moyens: MoyensDEdition): {
  readonly saisie: Saisie;
  readonly ecritures: EcrituresDuCalendrier;
} {
  const { table, modele, lectureSeule, suivi, signaler } = moyens;
  const saisie = useSaisieDuTitre({ table, modele, lectureSeule, suivi, signaler });
  return { saisie, ecritures: useEcrituresDuCalendrier({ ...moyens, saisie }) };
}

function useEcrituresDuCalendrier(moyens: Moyens): EcrituresDuCalendrier {
  const { table, modele, navigation, suivi, lectureSeule, annoncer, signaler } = moyens;
  const { dateVisee } = modele;
  const fixerLaDate = (ligne: LigneLue, jour: string | null): string | undefined => {
    if (dateVisee === undefined || lectureSeule !== undefined) {
      return lectureSeule;
    }
    const refus = ecrireLaDate(table, ligne, dateVisee, jour);
    if (refus !== undefined) {
      return refus;
    }
    const libelle = modele.libelleDe(ligne);
    const decompose = jour === null ? undefined : decomposer(jour);
    if (jour === null) {
      suivi.suivre({ sorte: "panneau", ligne: ligne.id });
      annoncer(annonceSansDate(libelle));
    } else {
      if (decompose !== undefined && !modele.grille.includes(jour)) {
        navigation.montrerLeMois({ annee: decompose.annee, mois: decompose.mois });
      }
      suivi.suivre({ sorte: "entree", ligne: ligne.id, jour });
      annoncer(annonceDeplacee(libelle, jour));
    }
    return undefined;
  };
  return {
    fixerLaDate,
    retirerLaDate: (ligne) => signaler(fixerLaDate(ligne, null)),
    deplacer: (ligne, pas) => {
      const jour = dateVisee === undefined ? undefined : jourVise(ligne, dateVisee, pas);
      if (lectureSeule !== undefined || dateVisee === undefined) {
        return;
      }
      if (jour === undefined) {
        annoncer(HORS_DES_BORNES);
        return;
      }
      signaler(fixerLaDate(ligne, jour));
    },
    nouvelleLigne: (jour) => creerEtSaisir(moyens, jour),
    supprimer: (ligne) => supprimerEtRendreLeFocus(moyens, ligne),
  };
}

function creerEtSaisir(
  { table, modele, saisie, suivi, lectureSeule, signaler }: Moyens,
  jour: string,
): void {
  if (modele.dateVisee === undefined || lectureSeule !== undefined) {
    return;
  }
  const issue = creerUneLigneDuJour(table, modele.dateVisee, jour);
  signaler("refus" in issue ? issue.refus : undefined);
  if ("ligne" in issue) {
    suivi.suivre({ sorte: "entree", ligne: issue.ligne, jour });
    if (modele.rangDuTitre >= 0) {
      saisie.ouvrirNeuve(issue.ligne);
    }
  }
}

function supprimerEtRendreLeFocus(
  { table, modele, suivi, lectureSeule, signaler }: Moyens,
  ligne: LigneLue,
): void {
  if (lectureSeule !== undefined) {
    return;
  }
  const jour =
    modele.dateVisee === undefined ? undefined : jourDeLaLigne(ligne, modele.dateVisee.rang);
  const refus = supprimerLaLigne(table, ligne.id);
  signaler(refus);
  if (refus === undefined && jour !== undefined) {
    suivi.suivre({ sorte: "case", jour });
  }
}
