// Contrôle de l'origine des écritures (F-011-AC26), partagé par les routes des espaces (F-011) et
// celles de la gestion du compte (F-027-AC16) : une écriture dont l'en-tête `Origin` n'est ni l'URL
// publique ni une origine autorisée est refusée ; une requête sans `Origin` (client hors
// navigateur) n'en annonce aucune. Aucun en-tête d'ouverture entre origines n'est émis (F-009-AC32).
import type { Request } from "express";

import type { RequeteLue } from "./adresse.ts";

const METHODES_QUI_ECRIVENT: readonly string[] = ["POST", "PATCH", "DELETE"];

export interface OriginesAdmises {
  readonly urlPublique: string;
  readonly originesAutorisees: readonly string[];
}

export function origineAdmise(origines: OriginesAdmises, requete: Request): boolean {
  const origine = requete.get("Origin");
  return (
    !METHODES_QUI_ECRIVENT.includes(requete.method) ||
    origine === undefined ||
    origine === origines.urlPublique ||
    origines.originesAutorisees.includes(origine)
  );
}

// F-012-AC3, H1 : la demande de passage en WebSocket. Tout navigateur annonce une origine : une
// demande sans `Origin` est refusée, comme une origine qui n'est ni l'URL publique ni une origine
// autorisée, quelle que soit la valeur de `NODE_ENV`.
export function origineDuPassageAdmise(
  origines: OriginesAdmises,
  requete: Pick<RequeteLue, "get">,
): boolean {
  const origine = requete.get("Origin");
  return (
    origine !== undefined &&
    (origine === origines.urlPublique || origines.originesAutorisees.includes(origine))
  );
}
