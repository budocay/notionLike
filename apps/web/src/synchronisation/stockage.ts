// Seul fichier du module de synchronisation qui atteint le module de persistance (F-013-AC40) :
// noms de bases, base d'un document traité hors de l'écran (passe de fond, réplique d'une page de
// version refusée), registre de l'appareil, effacement des bases d'un espace et des pages supprimées
// ailleurs. Chaque appel passe par l'interface de la persistance, avec l'identifiant de l'espace.
import {
  type DesignationDocument,
  type Droit,
  effacerBaseDeDocument,
  effacerBaseDePage,
  type EntreeDuRegistre,
  inscrireAuRegistre,
  type IssueDEffacement,
  type LectureDuRegistre,
  lireLeRegistre,
  nomDeBase,
  ouvrirPersistance,
  type Persistance,
  retirerDuRegistre,
} from "../persistance/index.ts";
import type * as Y from "yjs";

export type { DesignationDocument, Droit, EntreeDuRegistre, IssueDEffacement, Persistance };

/** Le nom de la base d'un document, par la fonction de nommage de la persistance (AC16). */
export function nomDeLaBase(designation: DesignationDocument): string {
  return nomDeBase(designation);
}

/** La base d'un document, sans juge de version : ce qu'elle porte est relu tel quel (AC35). */
export function ouvrirLaBase(doc: Y.Doc, designation: DesignationDocument): Persistance {
  return ouvrirPersistance(doc, designation);
}

export function lireLEntree(idEspace: string): Promise<LectureDuRegistre> {
  return lireLeRegistre(idEspace);
}

export function inscrireLEntree(idEspace: string, entree: EntreeDuRegistre): Promise<boolean> {
  return inscrireAuRegistre(idEspace, entree);
}

/** Pages supprimées ailleurs (AC37) : une base qui résiste reste orpheline, sans nouvel essai. */
export async function effacerLesPages(idEspace: string, idPages: readonly string[]): Promise<void> {
  await Promise.all(idPages.map((idPage) => effacerBaseDePage({ idEspace, idPage })));
}

/**
 * Copie locale d'un espace (AC24) : la base du document d'espace et celle de chaque page de son
 * arborescence et de sa corbeille, désignées par l'identifiant de cet espace et jamais par le seul
 * identifiant de la page (AC44) ; puis, avec `oublier`, l'entrée du registre et l'identifiant de
 * l'espace local : le lancement suivant est un premier lancement. Jamais rejetée.
 */
export async function effacerLaCopie(
  idEspace: string,
  idPages: readonly string[],
  oublier: boolean,
): Promise<IssueDEffacement> {
  const issues = await Promise.all([
    effacerBaseDeDocument({ type: "espace", idEspace }),
    ...[...new Set(idPages)].map((idPage) => effacerBaseDePage({ idEspace, idPage })),
  ]);
  const retire = oublier ? await retirerDuRegistre(idEspace, true) : true;
  return retire && issues.every((issue) => issue === "effacee") ? "effacee" : "echec";
}
