// Contrôle de l'origine des écritures (F-011-AC26), partagé par les routes des espaces (F-011) et
// celles de la gestion du compte (F-027-AC16) : une écriture dont l'en-tête `Origin` n'est ni l'URL
// publique ni une origine autorisée est refusée ; une requête sans `Origin` (client hors
// navigateur) n'en annonce aucune. Aucun en-tête d'ouverture entre origines n'est émis (F-009-AC32).
import type { Request } from "express";

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
