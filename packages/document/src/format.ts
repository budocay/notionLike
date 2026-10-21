// Format du document d'espace, versions 1 et 2 (ADR-0002, « Structure Yjs », amendement F-018) :
// seul fichier qui connaît les noms des types racines et des champs.
import * as Y from "yjs";

import type { EntreePage, IdPage, TypeDePage } from "./arbre.ts";
import { ErreurDocument } from "./erreurs.ts";
import { type FormeStockee, lireFormeStockee, typeDesVersions } from "./format-page.ts";
import { estUnRang } from "./rang.ts";

export const LONGUEUR_MAX_TITRE = 200;

/** Version écrite par `creerDocumentEspace` : un espace sans table reste en version 1 (F-018-AC8). */
const VERSION_INITIALE = 1;
/** Version qu'inscrit la première table (F-018-AC3) ; constante interne, non exportée. */
const VERSION_DES_TABLES = 2;
const VERSION_PRISE_EN_CHARGE = VERSION_DES_TABLES;
const TYPE_META = "meta";
const CLE_VERSION = "version";
const TYPE_PAGES = "pages";
// Même nom, même forme et même lecture que dans le document de page (`format-page.ts`, ADR-0009) ;
// nommé ici pour savoir, sans le créer, s'il est présent.
const TYPE_VERSIONS = "versions";
const CHAMP_TITRE = "titre";
const CHAMP_PLACE = "place";
const CHAMP_CORBEILLE = "corbeille";
const CHAMP_TYPE = "type";
// Valeurs admises du champ `type` ; un champ absent vaut `page`, règle permanente (F-018-AC2).
const TYPES_DE_PAGE: ReadonlySet<unknown> = new Set<TypeDePage>(["page", "table"]);

export interface Place {
  readonly parent: IdPage | null;
  readonly rang: string;
}

declare const placeAdmise: unique symbol;
/** Place dont le rang est admis : seule `admettrePlace` en produit une (F-029-AC6). */
export type PlaceAdmise = Place & { readonly [placeAdmise]: true };

interface NouvellePage {
  readonly id: IdPage;
  readonly titre: string;
  readonly type: TypeDePage;
  readonly place: PlaceAdmise;
}

export function ecrireVersion(doc: Y.Doc): void {
  doc.getMap(TYPE_META).set(CLE_VERSION, VERSION_INITIALE);
}

/**
 * Élévation à la version des tables (amendement F-018, « Élévation »), à appeler dans la
 * transaction qui inscrit une table, avant l'entrée : `meta.version` est la barrière des
 * applications de version 1, `versions` porte le maximum que la lecture retient. Chaque forme n'est
 * écrite que si elle ne porte pas déjà la version : la première table écrit les deux, une suivante
 * ne répare que celle qui manquerait.
 */
export function eleverPourLesTables(doc: Y.Doc): void {
  const meta = doc.getMap(TYPE_META);
  if (meta.get(CLE_VERSION) !== VERSION_DES_TABLES) {
    meta.set(CLE_VERSION, VERSION_DES_TABLES);
  }
  const versions = typeDesVersions(doc);
  if (versions !== undefined && lireFormeStockee(versions).version < VERSION_DES_TABLES) {
    versions.push([VERSION_DES_TABLES]);
  }
}

/**
 * Seul point de contrôle du rang écrit (F-029-AC6) : toute écriture de `place` exige une
 * `PlaceAdmise`, obtenue ici avant l'ouverture de la transaction. Un rang non admis est refusé par
 * `rang-indisponible`, sans rien écrire.
 */
export function admettrePlace(place: Place, longueurMaxRang: number): PlaceAdmise {
  if (!estUnRang(place.rang, longueurMaxRang)) {
    throw new ErreurDocument(
      "rang-indisponible",
      "Aucun rang admis ne permet de placer la page à cet endroit.",
    );
  }
  return { parent: place.parent, rang: place.rang } as PlaceAdmise;
}

// Une page s'écrit comme en version 1, sans champ `type` ; seule une table le porte (F-018-AC2).
export function ecrireNouvellePage(doc: Y.Doc, { id, titre, type, place }: NouvellePage): void {
  const champs = new Y.Map<unknown>();
  champs.set(CHAMP_TITRE, titre);
  champs.set(CHAMP_PLACE, place);
  champs.set(CHAMP_CORBEILLE, false);
  if (type === "table") {
    champs.set(CHAMP_TYPE, type);
  }
  doc.getMap(TYPE_PAGES).set(id, champs);
}

export function ecrireTitre(doc: Y.Doc, id: IdPage, titre: string): void {
  champsDe(doc, id)?.set(CHAMP_TITRE, titre);
}

export function ecrirePlace(doc: Y.Doc, id: IdPage, place: PlaceAdmise): void {
  champsDe(doc, id)?.set(CHAMP_PLACE, place);
}

export function ecrireMiseALaCorbeille(doc: Y.Doc, id: IdPage): void {
  champsDe(doc, id)?.set(CHAMP_CORBEILLE, true);
}

export function ecrireRestauration(doc: Y.Doc, id: IdPage): void {
  champsDe(doc, id)?.set(CHAMP_CORBEILLE, false);
}

/**
 * Retire l'entrée de la page (F-007 H2) : la clé quitte `pages`, et le ramasse-miettes de Yjs, actif
 * sur tout document d'espace (F-007 H14), libère son contenu du document tenu en mémoire.
 */
export function retirerEntree(doc: Y.Doc, id: IdPage): void {
  doc.getMap(TYPE_PAGES).delete(id);
}

/**
 * Lecture, étape 1 (amendement F-018) : le plus grand de `meta.version` et des entrées de
 * `versions`, chacun valant 1 en son absence (règle permanente du format). `admise` est faux si
 * `meta.version` est présente sans être un entier supérieur ou égal à 1, si `meta` est d'une autre
 * nature qu'un `Y.Map` (déjà lu sous un autre type partagé, ou porteur d'un contenu de liste : un
 * tableau, un texte ou un fragment écrit sous ce nom), ou si `versions` a été défini sous un autre
 * type partagé ou porte autre chose que de tels entiers (même règle que le serveur, décision du dev
 * du 2026-10-19). Rien n'est écrit : ni `meta` ni `versions` ne sont créés s'ils sont absents.
 */
export function lireLaVersion(doc: Y.Doc): FormeStockee {
  const parMeta = formeDeMeta(doc);
  const parVersions = formeDesVersions(doc);
  return {
    version: Math.max(parMeta.version, parVersions.version),
    admise: parMeta.admise && parVersions.admise,
  };
}

// Un type racine absent vaut la version 1 et n'est pas créé. `meta` n'a qu'une nature, `Y.Map` :
// un contenu de liste sous ce nom (`_start`) ou un type déjà lu sous un autre type partagé (Yjs
// lève) n'est pas admis.
function formeDeMeta(doc: Y.Doc): FormeStockee {
  if (!doc.share.has(TYPE_META)) {
    return { version: VERSION_INITIALE, admise: true };
  }
  const meta = mapRacine(doc, TYPE_META);
  if (meta === undefined || meta._start !== null) {
    return { version: VERSION_INITIALE, admise: false };
  }
  const valeur: unknown = meta.has(CLE_VERSION) ? meta.get(CLE_VERSION) : VERSION_INITIALE;
  return estUneVersionEntiere(valeur)
    ? { version: valeur, admise: true }
    : { version: VERSION_INITIALE, admise: false };
}

function mapRacine(doc: Y.Doc, nom: string): Y.Map<unknown> | undefined {
  try {
    return doc.getMap<unknown>(nom);
  } catch {
    return undefined;
  }
}

export function estDeVersionPriseEnCharge(doc: Y.Doc): boolean {
  const { version, admise } = lireLaVersion(doc);
  return admise && version <= VERSION_PRISE_EN_CHARGE;
}

// Un type racine absent vaut la version 1 et n'est pas créé ; défini sous un autre type partagé, il
// n'est pas admis.
function formeDesVersions(doc: Y.Doc): FormeStockee {
  if (!doc.share.has(TYPE_VERSIONS)) {
    return { version: VERSION_INITIALE, admise: true };
  }
  const versions = typeDesVersions(doc);
  return versions === undefined
    ? { version: VERSION_INITIALE, admise: false }
    : lireFormeStockee(versions);
}

function estUneVersionEntiere(valeur: unknown): valeur is number {
  return typeof valeur === "number" && Number.isInteger(valeur) && valeur >= VERSION_INITIALE;
}

// Une entrée mal formée est ignorée, sans exception (ADR-0002, étape 2). Un champ peut manquer sans
// que personne n'ait mal écrit : quand Yjs retient une mise à jour qui remplace un champ, l'ancienne
// valeur est déjà supprimée et la nouvelle n'est pas encore là.
// Un rang plus long que `longueurMaxRang` rend l'entrée mal formée (F-029-AC1).
export function lireEntrees(doc: Y.Doc, longueurMaxRang: number): Map<IdPage, EntreePage> {
  const entrees = new Map<IdPage, EntreePage>();
  doc.getMap(TYPE_PAGES).forEach((valeur, id) => {
    const entree = lireEntree(id, valeur, longueurMaxRang);
    if (entree !== undefined) {
      entrees.set(id, entree);
    }
  });
  return entrees;
}

function champsDe(doc: Y.Doc, id: IdPage): Y.Map<unknown> | undefined {
  const valeur = doc.getMap(TYPE_PAGES).get(id);
  return valeur instanceof Y.Map ? valeur : undefined;
}

function lireEntree(id: IdPage, valeur: unknown, longueurMaxRang: number): EntreePage | undefined {
  if (!(valeur instanceof Y.Map)) {
    return undefined;
  }
  const titre: unknown = valeur.get(CHAMP_TITRE);
  const corbeille: unknown = valeur.get(CHAMP_CORBEILLE);
  const place = lirePlace(valeur.get(CHAMP_PLACE), longueurMaxRang);
  const type = lireType(valeur);
  if (
    !estUnTitreAdmis(titre) ||
    typeof corbeille !== "boolean" ||
    place === undefined ||
    type === undefined
  ) {
    return undefined;
  }
  return { id, titre, type, parent: place.parent, rang: place.rang, corbeille };
}

// La lecture du type ne dépend pas de la version lue (F-018-AC7) : un champ absent vaut `page`,
// toute valeur hors de `page` et `table` rend l'entrée mal formée.
function lireType(valeur: Y.Map<unknown>): TypeDePage | undefined {
  const type: unknown = valeur.get(CHAMP_TYPE);
  if (type === undefined) {
    return "page";
  }
  return TYPES_DE_PAGE.has(type) ? (type as TypeDePage) : undefined;
}

function estUnTitreAdmis(valeur: unknown): valeur is string {
  return typeof valeur === "string" && valeur.length <= LONGUEUR_MAX_TITRE;
}

function lirePlace(valeur: unknown, longueurMaxRang: number): Place | undefined {
  if (!estUnObjet(valeur)) {
    return undefined;
  }
  const { parent, rang } = valeur;
  if ((parent !== null && typeof parent !== "string") || typeof rang !== "string") {
    return undefined;
  }
  return estUnRang(rang, longueurMaxRang) ? { parent, rang } : undefined;
}

// Un tableau ou un type partagé Yjs passent ici, et sont écartés ensuite : ni l'un ni l'autre ne
// porte à la fois un `parent` et un `rang` admis.
function estUnObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null;
}
