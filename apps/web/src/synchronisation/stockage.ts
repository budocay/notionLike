// Seul fichier du module de synchronisation qui atteint le module de persistance (F-013-AC40) :
// noms de bases, base d'un document traité hors de l'écran (passe de fond, réplique d'une page de
// version refusée), registre de l'appareil, effacement des bases d'un espace et des pages supprimées
// ailleurs, bases de table et réglages de vue compris (F-018-AC53). Chaque appel passe par l'interface de la persistance, avec l'identifiant de l'espace.
import {
  type DesignationDocument,
  type Droit,
  effacerBaseDeDocument,
  effacerBaseDePage,
  effacerReglagesDeVue,
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

/**
 * Tout ce que l'appareil porte d'un identifiant de l'espace, quel que soit son type, qu'une entrée
 * retirée ne dit plus (F-018-AC49, AC53, H11) : sa base de page, sa base de table et ses réglages
 * de vue, désignés par l'identifiant de l'espace ouvert.
 */
function effacerLesIdentifiants(
  idEspace: string,
  ids: readonly string[],
): Promise<IssueDEffacement>[] {
  effacerReglagesDeVue(idEspace, ids);
  return [...new Set(ids)].flatMap((id) => [
    effacerBaseDePage({ idEspace, idPage: id }),
    effacerBaseDeDocument({ type: "table", idEspace, idTable: id }),
  ]);
}

/** Pages supprimées ailleurs (AC37) : une base qui résiste reste orpheline, sans nouvel essai. */
export async function effacerLesPages(idEspace: string, idPages: readonly string[]): Promise<void> {
  await Promise.all(effacerLesIdentifiants(idEspace, idPages));
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
    ...effacerLesIdentifiants(idEspace, idPages),
  ]);
  const retire = oublier ? await retirerDuRegistre(idEspace, true) : true;
  return retire && issues.every((issue) => issue === "effacee") ? "effacee" : "echec";
}
