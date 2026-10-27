// Commandes de la grille sur les colonnes, les lignes et les cases (F-018-AC18, AC20, AC21, AC23 à
// AC25, AC29, AC33) : chacune par une seule opération du document de table, son refus dit en
// français (AC37), sa nouvelle place annoncée. En lecture seule, aucune n'écrit (F-018-AC52).
import type {
  ColonneLue,
  DocumentTable,
  IdColonne,
  IdLigne,
  LigneLue,
  TableLue,
  TypeDeColonne,
} from "@notionlike/document";

import { estCochee } from "./affichage.ts";
import type { Courante } from "./courante.ts";
import { ecrire, type Surveillance } from "./ecritures.ts";
import { positionDeDeplacement } from "./positions.ts";
import {
  colonneDeplacee,
  DEJA_LA_DERNIERE_COLONNE,
  DEJA_LA_DERNIERE_LIGNE,
  DEJA_LA_PREMIERE_COLONNE,
  DEJA_LA_PREMIERE_LIGNE,
  LONGUEUR_MAX_NOM_DE_COLONNE,
  ligneDeplacee,
  NOM_TROP_LONG,
  TRI_ACTIF,
} from "./textes.ts";
import { ecrireLaValeur, valeurDe } from "./valider.ts";

/** Ce dont une commande a besoin : la table, sa lecture, et où dire, focaliser et annoncer. */
export interface Moyens {
  readonly table: DocumentTable;
  readonly lue: TableLue;
  readonly lignes: readonly LigneLue[];
  readonly lectureSeule: string | undefined;
  /** Un tri a un effet : « Monter » et « Descendre » sont indisponibles (F-019-AC19). */
  readonly triActif: boolean;
  /** L'affichage figé est prévenu des écritures de l'onglet (F-019-AC17). */
  readonly surveillance: Surveillance;
  readonly allerVers: (vers: Courante) => void;
  readonly annoncer: (texte: string) => void;
  readonly signaler: (message: string | undefined) => void;
  /** Le focus va à l'invitation : la table n'a plus de colonne (AC21, AC35). */
  readonly focaliserLInvitation: () => void;
}

export type Sens = -1 | 1;

function enTete(colonne: IdColonne, rang: number): Courante {
  return { ligne: null, colonne, place: { rang: 0, colonne: rang + 1 } };
}

/** Rend `undefined` si la colonne est créée, sinon le message du refus (garde la boîte ouverte). */
export function ajouterUneColonne(
  moyens: Moyens,
  nom: string,
  type: TypeDeColonne,
): string | undefined {
  if (moyens.lectureSeule !== undefined) {
    return moyens.lectureSeule;
  }
  if (nom.length > LONGUEUR_MAX_NOM_DE_COLONNE) {
    return NOM_TROP_LONG;
  }
  const issue = ecrire(() => moyens.table.creerColonne(nom, type));
  if (!issue.reussie) {
    return issue.message;
  }
  moyens.signaler(undefined);
  moyens.allerVers(enTete(issue.valeur, moyens.lue.colonnes.length));
  return undefined;
}

export function deplacerUneColonne(moyens: Moyens, colonne: ColonneLue, sens: Sens): void {
  const { colonnes } = moyens.lue;
  const rang = colonnes.findIndex(({ id }) => id === colonne.id);
  const vers = rang + sens;
  if (moyens.lectureSeule !== undefined || rang < 0) {
    return;
  }
  if (vers < 0 || vers >= colonnes.length) {
    moyens.annoncer(sens < 0 ? DEJA_LA_PREMIERE_COLONNE : DEJA_LA_DERNIERE_COLONNE);
    return;
  }
  const issue = ecrire(() => moyens.table.deplacerColonne(colonne.id, vers));
  moyens.signaler(issue.reussie ? undefined : issue.message);
  if (issue.reussie) {
    moyens.allerVers(enTete(colonne.id, vers));
    moyens.annoncer(colonneDeplacee(colonne.nom, vers + 1, colonnes.length));
  }
}

export function supprimerUneColonne(moyens: Moyens, colonne: ColonneLue): void {
  const { colonnes } = moyens.lue;
  const rang = colonnes.findIndex(({ id }) => id === colonne.id);
  const voisine = colonnes[rang + 1] ?? colonnes[rang - 1];
  if (moyens.lectureSeule !== undefined) {
    return;
  }
  const issue = ecrire(() => moyens.table.supprimerColonne(colonne.id));
  moyens.signaler(issue.reussie ? undefined : issue.message);
  if (!issue.reussie) {
    return;
  }
  if (voisine === undefined) {
    moyens.focaliserLInvitation();
  } else {
    moyens.allerVers(enTete(voisine.id, rang + 1 < colonnes.length ? rang : rang - 1));
  }
}

export function ajouterUneLigne(moyens: Moyens): void {
  const premiere = moyens.lue.colonnes[0];
  if (moyens.lectureSeule !== undefined || premiere === undefined) {
    return;
  }
  const issue = ecrire(() => moyens.table.creerLigne(), moyens.surveillance);
  moyens.signaler(issue.reussie ? undefined : issue.message);
  if (issue.reussie) {
    moyens.surveillance.creee(issue.valeur);
    const rang = moyens.lignes.length + 1;
    moyens.allerVers({ ligne: issue.valeur, colonne: premiere.id, place: { rang, colonne: 1 } });
  }
}

/**
 * Déplace la ligne d'une place parmi les lignes affichées ; la cellule courante la suit (AC24). Sous
 * un tri, rien n'est écrit (F-019-AC19) ; sous des filtres seuls, la ligne passe avant la précédente
 * affichée ou après la suivante dans l'ordre manuel, par une seule opération.
 */
export function deplacerUneLigne(
  moyens: Moyens,
  ligne: IdLigne,
  sens: Sens,
  courante: Courante,
): void {
  const { lignes } = moyens;
  const rang = lignes.findIndex(({ id }) => id === ligne);
  const voisine = lignes[rang + sens];
  if (moyens.lectureSeule !== undefined || rang < 0) {
    return;
  }
  if (moyens.triActif) {
    moyens.annoncer(TRI_ACTIF);
    return;
  }
  const position = positionDeDeplacement(moyens.lue.lignes, lignes, ligne, sens);
  if (voisine === undefined || position === undefined) {
    moyens.annoncer(sens < 0 ? DEJA_LA_PREMIERE_LIGNE : DEJA_LA_DERNIERE_LIGNE);
    return;
  }
  const issue = ecrire(() => moyens.table.deplacerLigne(ligne, position));
  moyens.signaler(issue.reussie ? undefined : issue.message);
  if (issue.reussie) {
    // Sous un affichage figé, la ligne prend la place de la voisine affichée (F-019-AC19).
    moyens.surveillance.deplacee(ligne, voisine.id);
    const place = { ...courante.place, rang: rang + sens + 1 };
    moyens.allerVers({ ...courante, ligne, place });
    moyens.annoncer(ligneDeplacee(rang + sens + 1, lignes.length));
  }
}

/** Supprime la ligne ; la cellule courante passe à la même colonne de la suivante (AC25). */
export function supprimerUneLigne(moyens: Moyens, ligne: IdLigne, colonne: IdColonne | null): void {
  const { lignes } = moyens;
  const rang = lignes.findIndex(({ id }) => id === ligne);
  const voisine = lignes[rang + 1] ?? lignes[rang - 1];
  if (moyens.lectureSeule !== undefined) {
    return;
  }
  const issue = ecrire(() => moyens.table.supprimerLigne(ligne));
  moyens.signaler(issue.reussie ? undefined : issue.message);
  if (!issue.reussie) {
    return;
  }
  const rangDeColonne = moyens.lue.colonnes.findIndex(({ id }) => id === colonne) + 1;
  const vers = voisine === undefined ? 0 : rang + 1 < lignes.length ? rang + 1 : rang;
  moyens.allerVers({
    ligne: voisine?.id ?? null,
    colonne,
    place: { rang: vers, colonne: rangDeColonne },
  });
}

/** Coche ou décoche la case, sans mode édition (AC29). */
export function basculerUneCase(moyens: Moyens, ligne: LigneLue, rangDeColonne: number): void {
  const colonne = moyens.lue.colonnes[rangDeColonne];
  if (moyens.lectureSeule !== undefined || colonne?.type !== "case") {
    return;
  }
  const avant = valeurDe(ligne, rangDeColonne);
  moyens.signaler(
    ecrireLaValeur(
      moyens.table,
      { ligne: ligne.id, colonne, avant },
      !estCochee(avant),
      moyens.surveillance,
    ),
  );
}

/** Vide la cellule (Suppr, Retour arrière, AC33) ; rien n'est écrit si elle l'est déjà (AC32). */
export function viderUneCellule(moyens: Moyens, ligne: LigneLue, rangDeColonne: number): void {
  const colonne = moyens.lue.colonnes[rangDeColonne];
  if (moyens.lectureSeule !== undefined || colonne === undefined) {
    return;
  }
  const avant = valeurDe(ligne, rangDeColonne);
  moyens.signaler(
    ecrireLaValeur(moyens.table, { ligne: ligne.id, colonne, avant }, null, moyens.surveillance),
  );
}
