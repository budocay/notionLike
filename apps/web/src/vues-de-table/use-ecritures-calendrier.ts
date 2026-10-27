// Commandes du calendrier qui écrivent dans le document de table (F-021-AC10 à AC14, AC24) : chacune
// par une seule opération de la façade (`ecritures-du-calendrier.ts`), son refus dit en français, le
// focus et l'annonce décidés ici. En lecture seule, aucune n'écrit (AC26).
import type { DocumentTable, LigneLue, TypeDeColonne } from "@notionlike/document";

import { creerUneColonne } from "./actions.ts";
import {
  creerUneLigneDuJour,
  dateDejaEcrite,
  ecrireLaDate,
  jourVise,
  type PasDeJours,
  supprimerLaLigne,
} from "./ecritures-du-calendrier.ts";
import type { Surveillance } from "./ecritures.ts";
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
  /** Crée la colonne ; rend le refus, sinon `undefined`. */
  readonly ajouterUneColonne: (nom: string, type: TypeDeColonne) => string | undefined;
}

interface Moyens {
  readonly table: DocumentTable;
  readonly modele: ModeleDuCalendrier;
  readonly navigation: NavigationDuCalendrier;
  readonly saisie: Saisie;
  readonly suivi: SuiviDuFocus;
  readonly lectureSeule: string | undefined;
  /** L'affichage figé est prévenu des écritures de l'onglet (F-019-AC17). */
  readonly surveillance: Surveillance;
  readonly annoncer: (texte: string) => void;
  readonly signaler: (message: string | undefined) => void;
}

type MoyensDEdition = Omit<Moyens, "saisie">;

/** La saisie du titre et les écritures, qui se rendent le focus l'une à l'autre. */
export function useEditionDuCalendrier(moyens: MoyensDEdition): {
  readonly saisie: Saisie;
  readonly ecritures: EcrituresDuCalendrier;
} {
  const { table, modele, lectureSeule, suivi, signaler, surveillance } = moyens;
  const saisie = useSaisieDuTitre({ table, modele, lectureSeule, suivi, signaler, surveillance });
  return { saisie, ecritures: ecrituresDuCalendrier({ ...moyens, saisie }) };
}

/** Après une écriture de date : où va le focus, quel mois paraît, et l'annonce si la date a changé. */
function apresLaDate(moyens: Moyens, ligne: LigneLue, jour: string | null, ecrite: boolean): void {
  const { modele, navigation, suivi, annoncer } = moyens;
  const libelle = modele.libelleDe(ligne);
  if (jour === null) {
    suivi.suivre({ sorte: "panneau", ligne: ligne.id });
    if (ecrite) {
      annoncer(annonceSansDate(libelle));
    }
    return;
  }
  const decompose = decomposer(jour);
  if (decompose !== undefined && !modele.grille.includes(jour)) {
    navigation.montrerLeMois({ annee: decompose.annee, mois: decompose.mois });
  }
  suivi.suivre({ sorte: "entree", ligne: ligne.id, jour });
  if (ecrite) {
    annoncer(annonceDeplacee(libelle, jour));
  }
}

function fixerLaDate(moyens: Moyens, ligne: LigneLue, jour: string | null): string | undefined {
  const { table, modele, lectureSeule, surveillance } = moyens;
  const { dateVisee } = modele;
  if (dateVisee === undefined || lectureSeule !== undefined) {
    return lectureSeule;
  }
  const inchangee = dateDejaEcrite(ligne, dateVisee, jour);
  const refus = ecrireLaDate(table, ligne, dateVisee, jour, surveillance);
  if (refus === undefined) {
    apresLaDate(moyens, ligne, jour, !inchangee);
  }
  return refus;
}

function deplacer(moyens: Moyens, ligne: LigneLue, pas: PasDeJours): void {
  const { modele, lectureSeule, annoncer, signaler } = moyens;
  if (lectureSeule !== undefined || modele.dateVisee === undefined) {
    return;
  }
  const jour = jourVise(ligne, modele.dateVisee, pas);
  if (jour === undefined) {
    annoncer(HORS_DES_BORNES);
    return;
  }
  signaler(fixerLaDate(moyens, ligne, jour));
}

function ajouterUneColonne(
  { table, lectureSeule, signaler }: Moyens,
  nom: string,
  type: TypeDeColonne,
): string | undefined {
  const issue = creerUneColonne({ table, lectureSeule }, nom, type);
  if ("refus" in issue) {
    return issue.refus;
  }
  signaler(undefined);
  return undefined;
}

function ecrituresDuCalendrier(moyens: Moyens): EcrituresDuCalendrier {
  return {
    fixerLaDate: (ligne, jour) => fixerLaDate(moyens, ligne, jour),
    retirerLaDate: (ligne) => moyens.signaler(fixerLaDate(moyens, ligne, null)),
    deplacer: (ligne, pas) => deplacer(moyens, ligne, pas),
    nouvelleLigne: (jour) => creerEtSaisir(moyens, jour),
    supprimer: (ligne) => supprimerEtRendreLeFocus(moyens, ligne),
    ajouterUneColonne: (nom, type) => ajouterUneColonne(moyens, nom, type),
  };
}

function creerEtSaisir(
  { table, modele, saisie, suivi, lectureSeule, signaler, surveillance }: Moyens,
  jour: string,
): void {
  if (modele.dateVisee === undefined || lectureSeule !== undefined) {
    return;
  }
  const issue = creerUneLigneDuJour(table, modele.dateVisee, jour, surveillance);
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
