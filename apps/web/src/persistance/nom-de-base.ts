export type DesignationDocument =
  | { readonly type: "espace"; readonly idEspace: string }
  | { readonly type: "page"; readonly idEspace: string; readonly idPage: string }
  | { readonly type: "table"; readonly idEspace: string; readonly idTable: string };

export type CodeErreurPersistance = "identifiant-espace-invalide";

export class ErreurPersistance extends Error {
  readonly code: CodeErreurPersistance;

  constructor(code: CodeErreurPersistance, message: string) {
    super(message);
    this.name = "ErreurPersistance";
    this.code = code;
  }
}

// Forme de longueur fixe et sans « : » : aucun identifiant de page ou de table, quel qu'il soit,
// ne fait sortir du préfixe de l'espace demandé (ADR-0008).
const UUID_CANONIQUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function nomDeBase(designation: DesignationDocument): string {
  const idEspace = exigerUuidCanonique(designation.idEspace);
  switch (designation.type) {
    case "espace":
      return `notionlike:espace:${idEspace}`;
    case "page":
      return `notionlike:page:${idEspace}:${designation.idPage}`;
    case "table":
      return `notionlike:table:${idEspace}:${designation.idTable}`;
  }
}

function exigerUuidCanonique(idEspace: string): string {
  if (!UUID_CANONIQUE.test(idEspace)) {
    throw new ErreurPersistance(
      "identifiant-espace-invalide",
      "L'identifiant d'espace n'est pas un UUID canonique : aucune base n'est ouverte.",
    );
  }
  return idEspace;
}
