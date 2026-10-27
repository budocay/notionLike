// Énumération des bases de l'appareil (F-032-AC20, AC23, H7, H8) : `indexedDB.databases()`, quand
// le navigateur l'offre. Seuls comptent les noms que la fonction de nommage reconnaît ; un nom
// qu'elle ne reconnaît pas ne désigne aucune base que ce module ait pu créer, et n'est jamais rendu.
import { type DesignationDocument, designationDeLaBase } from "./nom-de-base.ts";

/** Même échéance qu'un effacement (F-007-AC21) : une énumération qui ne répond pas est un échec. */
const ECHEANCE_D_UNE_ENUMERATION_MS = 10_000;

/** Les documents dont une base est sur l'appareil ; `undefined` si rien ne le dit. */
export function enumererLesBases(
  conclure: (bases: readonly DesignationDocument[] | undefined) => void,
): void {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") {
    conclure(undefined);
    return;
  }
  let enumeration: Promise<IDBDatabaseInfo[]>;
  try {
    enumeration = indexedDB.databases();
  } catch {
    conclure(undefined);
    return;
  }
  enumeration.then(
    (bases) => {
      const designations = bases.map((base) => designationDeLaBase(base.name ?? ""));
      conclure(designations.filter((designation) => designation !== undefined));
    },
    () => conclure(undefined),
  );
}

/**
 * Les bases d'un espace, énumérées par leur nom (F-032-AC20) : celle de son document d'espace, de
 * ses pages et de ses tables, et aucune autre. `undefined` si le navigateur ne permet pas
 * l'énumération, ou si elle échoue ou ne répond pas en 10 secondes. Jamais rejetée.
 */
export function basesDeLEspace(
  idEspace: string,
): Promise<readonly DesignationDocument[] | undefined> {
  return new Promise((resoudre) => {
    let conclu = false;
    const finir = (bases: readonly DesignationDocument[] | undefined): void => {
      if (!conclu) {
        conclu = true;
        clearTimeout(echeance);
        resoudre(bases);
      }
    };
    const echeance = setTimeout(() => finir(undefined), ECHEANCE_D_UNE_ENUMERATION_MS);
    enumererLesBases((bases) =>
      finir(bases?.filter((designation) => designation.idEspace === idEspace)),
    );
  });
}
