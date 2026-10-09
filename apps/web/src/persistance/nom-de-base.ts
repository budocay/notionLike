import { estUuidCanonique } from "../identifiants/uuid-canonique.ts";

export type DesignationDocument =
  | { readonly type: "espace"; readonly idEspace: string }
  | { readonly type: "page"; readonly idEspace: string; readonly idPage: string }
  | { readonly type: "table"; readonly idEspace: string; readonly idTable: string };

type CodeErreurPersistance = "identifiant-invalide";

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
      return `notionlike:espace:${idEspace}`;
    case "page":
      return `notionlike:page:${idEspace}:${exigerUuidCanonique(designation.idPage)}`;
    case "table":
      return `notionlike:table:${idEspace}:${exigerUuidCanonique(designation.idTable)}`;
  }
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
