import { estUuidCanonique } from "../identifiants/uuid-canonique.ts";

export type DesignationDocument =
  | { readonly type: "espace"; readonly idEspace: string }
  | { readonly type: "page"; readonly idEspace: string; readonly idPage: string }
  | { readonly type: "table"; readonly idEspace: string; readonly idTable: string };

type CodeErreurPersistance = "identifiant-invalide";

const PREFIXE_DES_BASES_D_ESPACE = "notionlike:espace:";
const SEPARATEUR = ":";
const PARTIES_D_UN_ESPACE = 3;
const PARTIES_D_UN_DOCUMENT = 4;

export class ErreurPersistance extends Error {
  readonly code: CodeErreurPersistance;

  constructor(code: CodeErreurPersistance, message: string) {
    super(message);
    this.name = "ErreurPersistance";
    this.code = code;
  }
}

// Seule fonction d'apps/web qui assemble un nom de base (F-002-AC25). Chaque identifiant qu'elle
// reçoit passe par le contrôle de forme avant d'entrer dans le nom (F-002-AC28) : le préfixe de
// l'espace est de longueur fixe et sans autre « : », et aucun identifiant de page ou de table ne
// porte de « : ».
export function nomDeBase(designation: DesignationDocument): string {
  const idEspace = exigerUuidCanonique(designation.idEspace);
  switch (designation.type) {
    case "espace":
      return `${PREFIXE_DES_BASES_D_ESPACE}${idEspace}`;
    case "page":
      return `notionlike:page:${idEspace}:${exigerUuidCanonique(designation.idPage)}`;
    case "table":
      return `notionlike:table:${idEspace}:${exigerUuidCanonique(designation.idTable)}`;
  }
}

/**
 * Le document dont ce nom est celui de la base, lu par la fonction de nommage elle-même : le nom
 * reconstruit depuis la désignation doit être ce nom, caractère pour caractère, et chaque
 * identifiant passer le contrôle de forme. `undefined` pour tout autre nom, que rien n'efface
 * (F-032-AC20, H8) : aucune comparaison de préfixe sur le nom brut.
 */
export function designationDeLaBase(nom: string): DesignationDocument | undefined {
  const designation = designationLue(nom.split(SEPARATEUR));
  if (designation === undefined) {
    return undefined;
  }
  try {
    return nomDeBase(designation) === nom ? designation : undefined;
  } catch {
    return undefined;
  }
}

function designationLue(parties: readonly string[]): DesignationDocument | undefined {
  const [, type, idEspace = "", idDocument = ""] = parties;
  if (type === "espace" && parties.length === PARTIES_D_UN_ESPACE) {
    return { type, idEspace };
  }
  if (parties.length !== PARTIES_D_UN_DOCUMENT) {
    return undefined;
  }
  if (type === "page") {
    return { type, idEspace, idPage: idDocument };
  }
  return type === "table" ? { type, idEspace, idTable: idDocument } : undefined;
}

// Le message ne cite pas l'identifiant refusé : sa forme est inconnue (ADR-0008).
function exigerUuidCanonique(identifiant: string): string {
  if (!estUuidCanonique(identifiant)) {
    throw new ErreurPersistance(
      "identifiant-invalide",
      "Un identifiant n'est pas un UUID canonique : aucune base n'est ouverte.",
    );
  }
  return identifiant;
}
