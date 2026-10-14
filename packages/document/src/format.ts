// Format du document d'espace, version 1 (ADR-0002, « Structure Yjs ») : seul fichier qui connaît
// les noms des types racines et des champs.
import * as Y from "yjs";

import type { EntreePage, IdPage } from "./arbre.ts";
import { ErreurDocument } from "./erreurs.ts";
import { estUnRang } from "./rang.ts";

export const LONGUEUR_MAX_TITRE = 200;

const VERSION_DE_FORMAT = 1;
const TYPE_META = "meta";
const CLE_VERSION = "version";
const TYPE_PAGES = "pages";
const CHAMP_TITRE = "titre";
const CHAMP_PLACE = "place";
const CHAMP_CORBEILLE = "corbeille";

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
  readonly place: PlaceAdmise;
}

export function ecrireVersion(doc: Y.Doc): void {
  doc.getMap(TYPE_META).set(CLE_VERSION, VERSION_DE_FORMAT);
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

export function ecrireNouvellePage(doc: Y.Doc, { id, titre, place }: NouvellePage): void {
  const champs = new Y.Map<unknown>();
  champs.set(CHAMP_TITRE, titre);
  champs.set(CHAMP_PLACE, place);
  champs.set(CHAMP_CORBEILLE, false);
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

// Une clé `version` absente vaut la version 1 : règle permanente du format (ADR-0002, étape 1).
export function estDeVersionPriseEnCharge(doc: Y.Doc): boolean {
  const meta = doc.getMap(TYPE_META);
  return !meta.has(CLE_VERSION) || meta.get(CLE_VERSION) === VERSION_DE_FORMAT;
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
  if (!estUnTitreAdmis(titre) || typeof corbeille !== "boolean" || place === undefined) {
    return undefined;
  }
  return { id, titre, parent: place.parent, rang: place.rang, corbeille };
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
