// Format du document d'espace, version 1 (ADR-0002, « Structure Yjs ») : seul fichier qui connaît
// les noms des types racines et des champs.
import * as Y from "yjs";

import type { EntreePage, IdPage } from "./arbre.ts";
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

type NouvellePage = Omit<EntreePage, "corbeille">;

export function ecrireVersion(doc: Y.Doc): void {
  doc.getMap(TYPE_META).set(CLE_VERSION, VERSION_DE_FORMAT);
}

export function ecrireNouvellePage(doc: Y.Doc, { id, titre, parent, rang }: NouvellePage): void {
  const place: Place = { parent, rang };
  const champs = new Y.Map<unknown>();
  champs.set(CHAMP_TITRE, titre);
  champs.set(CHAMP_PLACE, place);
  champs.set(CHAMP_CORBEILLE, false);
  doc.getMap(TYPE_PAGES).set(id, champs);
}

export function ecrireTitre(doc: Y.Doc, id: IdPage, titre: string): void {
  champsDe(doc, id)?.set(CHAMP_TITRE, titre);
}

export function ecrirePlace(doc: Y.Doc, id: IdPage, place: Place): void {
  champsDe(doc, id)?.set(CHAMP_PLACE, place);
}

export function ecrireMiseALaCorbeille(doc: Y.Doc, id: IdPage): void {
  champsDe(doc, id)?.set(CHAMP_CORBEILLE, true);
}

// Une clé `version` absente vaut la version 1 : règle permanente du format (ADR-0002, étape 1).
export function estDeVersionPriseEnCharge(doc: Y.Doc): boolean {
  const meta = doc.getMap(TYPE_META);
  return !meta.has(CLE_VERSION) || meta.get(CLE_VERSION) === VERSION_DE_FORMAT;
}

// Une entrée mal formée est ignorée, sans exception (ADR-0002, étape 2). Un champ peut manquer sans
// que personne n'ait mal écrit : quand Yjs retient une mise à jour qui remplace un champ, l'ancienne
// valeur est déjà supprimée et la nouvelle n'est pas encore là.
export function lireEntrees(doc: Y.Doc): Map<IdPage, EntreePage> {
  const entrees = new Map<IdPage, EntreePage>();
  doc.getMap(TYPE_PAGES).forEach((valeur, id) => {
    const entree = lireEntree(id, valeur);
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

function lireEntree(id: IdPage, valeur: unknown): EntreePage | undefined {
  if (!(valeur instanceof Y.Map)) {
    return undefined;
  }
  const titre: unknown = valeur.get(CHAMP_TITRE);
  const corbeille: unknown = valeur.get(CHAMP_CORBEILLE);
  const place = lirePlace(valeur.get(CHAMP_PLACE));
  if (!estUnTitreAdmis(titre) || typeof corbeille !== "boolean" || place === undefined) {
    return undefined;
  }
  return { id, titre, parent: place.parent, rang: place.rang, corbeille };
}

function estUnTitreAdmis(valeur: unknown): valeur is string {
  return typeof valeur === "string" && valeur.length <= LONGUEUR_MAX_TITRE;
}

function lirePlace(valeur: unknown): Place | undefined {
  if (!estUnObjet(valeur)) {
    return undefined;
  }
  const { parent, rang } = valeur;
  if ((parent !== null && typeof parent !== "string") || typeof rang !== "string") {
    return undefined;
  }
  return estUnRang(rang) ? { parent, rang } : undefined;
}

// Un tableau ou un type partagé Yjs passent ici, et sont écartés ensuite : ni l'un ni l'autre ne
// porte à la fois un `parent` et un `rang` admis.
function estUnObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null;
}
