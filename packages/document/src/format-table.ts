// Format du document de table, version 1 (ADR-0016) : seul fichier qui connaît les noms des types
// racine et des champs. La lecture n'écrit jamais ; le module n'écrit que les champs qu'il nomme et
// ne retire jamais rien d'autre qu'une clé de cellule.
import * as Y from "yjs";

import { ErreurDocument } from "./erreurs.ts";
import { lireFormeStockee, typeDesVersions } from "./format-page.ts";
import { estUnRang, LONGUEUR_MAX_RANG } from "./rang.ts";
import {
  type EntreeColonne,
  type EntreeLigne,
  type EntreeOption,
  estUnLibelleAdmis,
  estUnNomAdmis,
  estUnTypeDeColonne,
  type IdColonne,
  type IdLigne,
  type IdOption,
  type TypeDeColonne,
  type ValeurDeCellule,
} from "./table.ts";

/** Constante interne, non exportée par le paquet : pas de table des versions (ADR-0016). */
const VERSION_TABLE_PRISE_EN_CHARGE = 1;

const TYPE_COLONNES = "colonnes";
const TYPE_LIGNES = "lignes";
// Même nom, même forme et même lecture que dans le document de page (`format-page.ts`, ADR-0009).
const TYPE_VERSIONS = "versions";
/** Liste blanche des types racine (ADR-0016, « Reconnaissance ») : rien d'autre dans `doc.share`. */
const TYPES_RACINE: ReadonlySet<string> = new Set([TYPE_COLONNES, TYPE_LIGNES, TYPE_VERSIONS]);

const CHAMP_NOM = "nom";
const CHAMP_TYPE = "type";
const CHAMP_RANG = "rang";
const CHAMP_SUPPRIMEE = "supprimee";
const CHAMP_OPTIONS = "options";
const CHAMP_LIBELLE = "libelle";
const CHAMP_CELLULES = "cellules";

export type RefusDuDocument = "version-non-prise-en-charge" | "pas-un-document-de-table";

declare const rangAdmis: unique symbol;
/** Rang admis par F-029 : seule `admettreRang` en produit un (même parade que `PlaceAdmise`). */
export type RangAdmis = string & { readonly [rangAdmis]: true };

/** Ce qu'une écriture vise : une colonne, une ligne, ou une option d'une colonne. */
export type Cible =
  | { readonly sorte: "colonne"; readonly id: IdColonne }
  | { readonly sorte: "ligne"; readonly id: IdLigne }
  | { readonly sorte: "option"; readonly colonne: IdColonne; readonly id: IdOption };

interface NouvelleColonne {
  readonly id: IdColonne;
  readonly nom: string;
  readonly type: TypeDeColonne;
  readonly rang: RangAdmis;
}

interface NouvelleOption {
  readonly id: IdOption;
  readonly libelle: string;
  readonly rang: RangAdmis;
}

interface NouvelleLigne {
  readonly id: IdLigne;
  readonly rang: RangAdmis;
  readonly cellules: ReadonlyMap<IdColonne, ValeurDeCellule>;
}

export interface EntreesDeTable {
  readonly colonnes: readonly EntreeColonne[];
  readonly lignes: readonly EntreeLigne[];
}

// Yjs lève quand un type racine a déjà été lu sous un autre type partagé.
function essayer<T>(lire: () => T): T | undefined {
  try {
    return lire();
  } catch {
    return undefined;
  }
}

// Un type racine absent n'est pas créé : un document refusé ne reçoit rien du module.
function racinePresente(doc: Y.Doc, nom: string): Y.Map<unknown> | undefined {
  return doc.share.has(nom) ? essayer(() => doc.getMap<unknown>(nom)) : undefined;
}

function refusDeLaVersion(doc: Y.Doc): RefusDuDocument | undefined {
  if (!doc.share.has(TYPE_VERSIONS)) {
    return undefined;
  }
  const versions = typeDesVersions(doc);
  if (versions === undefined) {
    return "pas-un-document-de-table";
  }
  const forme = lireFormeStockee(versions);
  return forme.admise && forme.version <= VERSION_TABLE_PRISE_EN_CHARGE
    ? undefined
    : "version-non-prise-en-charge";
}

/**
 * Reconnaissance, sans rien écrire (F-017-AC22, AC23) : la version d'abord, puis la liste blanche
 * des types racine, enfin la nature des racines présentes. Un document vierge est une table.
 */
export function refusDuDocument(doc: Y.Doc): RefusDuDocument | undefined {
  const refus = refusDeLaVersion(doc);
  if (refus !== undefined) {
    return refus;
  }
  const etranger = [...doc.share.keys()].some((nom) => !TYPES_RACINE.has(nom));
  const autreNature = [TYPE_COLONNES, TYPE_LIGNES].some(
    (nom) => doc.share.has(nom) && racinePresente(doc, nom) === undefined,
  );
  return etranger || autreNature ? "pas-un-document-de-table" : undefined;
}

function estUnRangAdmis(valeur: unknown): valeur is string {
  return typeof valeur === "string" && estUnRang(valeur, LONGUEUR_MAX_RANG);
}

interface ChampsCommuns {
  readonly rang: string;
  readonly supprimee: boolean;
}

// Une entrée mal formée est ignorée, sans exception (F-017-AC20). Un champ peut manquer un temps
// sans que personne n'ait mal écrit : mise à jour retenue par Yjs (veille, constat 5).
function champsCommuns(valeur: Y.Map<unknown>): ChampsCommuns | undefined {
  const rang = valeur.get(CHAMP_RANG);
  const supprimee = valeur.get(CHAMP_SUPPRIMEE);
  return estUnRangAdmis(rang) && typeof supprimee === "boolean" ? { rang, supprimee } : undefined;
}

function lireOption(id: IdOption, valeur: unknown): EntreeOption | undefined {
  if (!(valeur instanceof Y.Map)) {
    return undefined;
  }
  const communs = champsCommuns(valeur);
  const libelle = valeur.get(CHAMP_LIBELLE);
  return communs !== undefined && estUnLibelleAdmis(libelle)
    ? { id, libelle, ...communs }
    : undefined;
}

function lireOptions(valeur: unknown): EntreeOption[] | undefined {
  if (!(valeur instanceof Y.Map)) {
    return undefined;
  }
  const options: EntreeOption[] = [];
  valeur.forEach((brute, id) => {
    const option = lireOption(id, brute);
    if (option !== undefined) {
      options.push(option);
    }
  });
  return options;
}

// Une colonne `selection` sans sa carte d'options est mal formée ; ailleurs, le champ est en trop.
function lireColonne(id: IdColonne, valeur: unknown): EntreeColonne | undefined {
  if (!(valeur instanceof Y.Map)) {
    return undefined;
  }
  const communs = champsCommuns(valeur);
  const nom = valeur.get(CHAMP_NOM);
  const type = valeur.get(CHAMP_TYPE);
  if (communs === undefined || !estUnNomAdmis(nom) || !estUnTypeDeColonne(type)) {
    return undefined;
  }
  const options = type === "selection" ? lireOptions(valeur.get(CHAMP_OPTIONS)) : [];
  return options === undefined ? undefined : { id, nom, type, options, ...communs };
}

function lireLigne(id: IdLigne, valeur: unknown): EntreeLigne | undefined {
  if (!(valeur instanceof Y.Map)) {
    return undefined;
  }
  const communs = champsCommuns(valeur);
  const cellules = valeur.get(CHAMP_CELLULES);
  return communs !== undefined && cellules instanceof Y.Map
    ? { id, cellules: new Map(cellules.entries()), ...communs }
    : undefined;
}

function lireRacine<T>(
  doc: Y.Doc,
  nom: string,
  lire: (id: string, valeur: unknown) => T | undefined,
): T[] {
  const entrees: T[] = [];
  racinePresente(doc, nom)?.forEach((valeur, id) => {
    const entree = lire(id, valeur);
    if (entree !== undefined) {
      entrees.push(entree);
    }
  });
  return entrees;
}

/** Entrées bien formées d'un document reconnu comme table (`refusDuDocument` sans refus). */
export function lireEntrees(doc: Y.Doc): EntreesDeTable {
  return {
    colonnes: lireRacine(doc, TYPE_COLONNES, lireColonne),
    lignes: lireRacine(doc, TYPE_LIGNES, lireLigne),
  };
}

/**
 * Seul point de contrôle du rang écrit (F-029-AC6, ADR-0016) : toute écriture de `rang` exige un
 * `RangAdmis`, obtenu ici avant l'ouverture de la transaction. Un rang non admis est refusé par
 * `rang-indisponible`, sans rien écrire.
 */
export function admettreRang(rang: string): RangAdmis {
  if (!estUnRang(rang, LONGUEUR_MAX_RANG)) {
    throw new ErreurDocument(
      "rang-indisponible",
      "Aucun rang admis ne permet de placer l'élément à cet endroit.",
    );
  }
  return rang as RangAdmis;
}

function champsDe(doc: Y.Doc, cible: Cible): Y.Map<unknown> | undefined {
  const parent =
    cible.sorte === "option"
      ? champsDe(doc, { sorte: "colonne", id: cible.colonne })?.get(CHAMP_OPTIONS)
      : doc.getMap<unknown>(cible.sorte === "colonne" ? TYPE_COLONNES : TYPE_LIGNES);
  const champs = parent instanceof Y.Map ? parent.get(cible.id) : undefined;
  return champs instanceof Y.Map ? champs : undefined;
}

function nouvellesEntrees(rang: RangAdmis): Y.Map<unknown> {
  const champs = new Y.Map<unknown>();
  champs.set(CHAMP_RANG, rang);
  champs.set(CHAMP_SUPPRIMEE, false);
  return champs;
}

// La carte d'options naît avec la colonne et n'est jamais recréée (veille, constat 1).
export function ecrireNouvelleColonne(doc: Y.Doc, { id, nom, type, rang }: NouvelleColonne): void {
  const champs = nouvellesEntrees(rang);
  champs.set(CHAMP_NOM, nom);
  champs.set(CHAMP_TYPE, type);
  if (type === "selection") {
    champs.set(CHAMP_OPTIONS, new Y.Map<unknown>());
  }
  doc.getMap<unknown>(TYPE_COLONNES).set(id, champs);
}

export function ecrireNouvelleOption(
  doc: Y.Doc,
  colonne: IdColonne,
  { id, libelle, rang }: NouvelleOption,
): void {
  const options = champsDe(doc, { sorte: "colonne", id: colonne })?.get(CHAMP_OPTIONS);
  if (options instanceof Y.Map) {
    const champs = nouvellesEntrees(rang);
    champs.set(CHAMP_LIBELLE, libelle);
    options.set(id, champs);
  }
}

// La carte des cellules naît avec la ligne et n'est jamais recréée (veille, constat 1 ; F-017-AC11).
export function ecrireNouvelleLigne(doc: Y.Doc, { id, rang, cellules }: NouvelleLigne): void {
  const champs = nouvellesEntrees(rang);
  const valeurs = new Y.Map<unknown>();
  cellules.forEach((valeur, colonne) => valeurs.set(colonne, valeur));
  champs.set(CHAMP_CELLULES, valeurs);
  doc.getMap<unknown>(TYPE_LIGNES).set(id, champs);
}

export function ecrireRang(doc: Y.Doc, cible: Cible, rang: RangAdmis): void {
  champsDe(doc, cible)?.set(CHAMP_RANG, rang);
}

/** Pose le drapeau (F-017 H5) : rien n'est effacé, la cible reste dans le document. */
export function ecrireSuppression(doc: Y.Doc, cible: Cible): void {
  champsDe(doc, cible)?.set(CHAMP_SUPPRIMEE, true);
}

/** Le nom d'une colonne, ou le libellé d'une option. */
export function ecrireNom(
  doc: Y.Doc,
  cible: Exclude<Cible, { readonly sorte: "ligne" }>,
  texte: string,
): void {
  champsDe(doc, cible)?.set(cible.sorte === "option" ? CHAMP_LIBELLE : CHAMP_NOM, texte);
}

/** `null` vide la cellule en retirant sa clé : seul retrait du module (ADR-0016). */
export function ecrireCellule(
  doc: Y.Doc,
  ligne: IdLigne,
  colonne: IdColonne,
  valeur: ValeurDeCellule | null,
): void {
  const cellules = champsDe(doc, { sorte: "ligne", id: ligne })?.get(CHAMP_CELLULES);
  if (!(cellules instanceof Y.Map)) {
    return;
  }
  if (valeur === null) {
    cellules.delete(colonne);
  } else {
    cellules.set(colonne, valeur);
  }
}
