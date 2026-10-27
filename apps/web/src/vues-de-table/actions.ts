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
import { ecrire } from "./ecritures.ts";
import {
  colonneDeplacee,
  DEJA_LA_DERNIERE_COLONNE,
  DEJA_LA_DERNIERE_LIGNE,
  DEJA_LA_PREMIERE_COLONNE,
  DEJA_LA_PREMIERE_LIGNE,
  LONGUEUR_MAX_NOM_DE_COLONNE,
  ligneDeplacee,
  NOM_TROP_LONG,
} from "./textes.ts";
import { ecrireLaValeur, valeurDe } from "./valider.ts";

/** Ce dont une commande a besoin : la table, sa lecture, et où dire, focaliser et annoncer. */
export interface Moyens {
  readonly table: DocumentTable;
  readonly lue: TableLue;
  readonly lignes: readonly LigneLue[];
  readonly lectureSeule: string | undefined;
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

/** Crée la colonne en dernière position ; son identifiant, ou le message du refus. */
export function creerUneColonne(
  moyens: Pick<Moyens, "table" | "lectureSeule">,
  nom: string,
  type: TypeDeColonne,
): { readonly colonne: IdColonne } | { readonly refus: string } {
  if (moyens.lectureSeule !== undefined) {
    return { refus: moyens.lectureSeule };
  }
  if (nom.length > LONGUEUR_MAX_NOM_DE_COLONNE) {
    return { refus: NOM_TROP_LONG };
  }
  const issue = ecrire(() => moyens.table.creerColonne(nom, type));
  return issue.reussie ? { colonne: issue.valeur } : { refus: issue.message };
}

/** Rend `undefined` si la colonne est créée, sinon le message du refus (garde la boîte ouverte). */
export function ajouterUneColonne(
  moyens: Moyens,
  nom: string,
  type: TypeDeColonne,
): string | undefined {
  const issue = creerUneColonne(moyens, nom, type);
  if ("refus" in issue) {
    return issue.refus;
  }
  moyens.signaler(undefined);
  moyens.allerVers(enTete(issue.colonne, moyens.lue.colonnes.length));
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
  const issue = ecrire(() => moyens.table.creerLigne());
  moyens.signaler(issue.reussie ? undefined : issue.message);
  if (issue.reussie) {
    const rang = moyens.lignes.length + 1;
    moyens.allerVers({ ligne: issue.valeur, colonne: premiere.id, place: { rang, colonne: 1 } });
  }
}

/** Déplace la ligne d'une place parmi les lignes affichées ; la cellule courante la suit (AC24). */
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
  if (voisine === undefined) {
    moyens.annoncer(sens < 0 ? DEJA_LA_PREMIERE_LIGNE : DEJA_LA_DERNIERE_LIGNE);
    return;
  }
  const position = moyens.lue.lignes.findIndex(({ id }) => id === voisine.id);
  const issue = ecrire(() => moyens.table.deplacerLigne(ligne, position));
  moyens.signaler(issue.reussie ? undefined : issue.message);
  if (issue.reussie) {
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
    ecrireLaValeur(moyens.table, { ligne: ligne.id, colonne, avant }, !estCochee(avant)),
  );
}

/** Vide la cellule (Suppr, Retour arrière, AC33) ; rien n'est écrit si elle l'est déjà (AC32). */
export function viderUneCellule(moyens: Moyens, ligne: LigneLue, rangDeColonne: number): void {
  const colonne = moyens.lue.colonnes[rangDeColonne];
  if (moyens.lectureSeule !== undefined || colonne === undefined) {
    return;
  }
  const avant = valeurDe(ligne, rangDeColonne);
  moyens.signaler(ecrireLaValeur(moyens.table, { ligne: ligne.id, colonne, avant }, null));
}
