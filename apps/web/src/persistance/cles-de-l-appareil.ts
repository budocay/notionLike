// Formes des clés du magasin des réglages de la base de l'appareil, et forme d'une entrée du
// registre (ADR-0008, ADR-0014, F-032-AC19). Une entrée du registre garde ses deux champs, et rien
// d'autre : ce que F-032 retient de plus (dernier nom connu, marque de première synchronisation,
// espace retenu) vit sous ses propres clés, pour qu'un onglet de la version de F-013 lise toujours
// `lu` chaque entrée. Aucune de ces valeurs ne porte de courriel, de compte ni de jeton.
import { estUuidCanonique } from "../identifiants/uuid-canonique.ts";

export type Droit = "ecriture" | "lecture";

/** Une entrée du registre : l'espace est adopté, avec le dernier droit que l'appareil a lu. */
export interface EntreeDuRegistre {
  readonly rattachement: "adopte";
  readonly droit: Droit;
}

const PREFIXE_DU_REGISTRE = "registre:";
const PREFIXE_DU_NOM = "nom:";
const PREFIXE_DE_LA_MARQUE = "premiere-synchronisation:";
/** L'espace que l'appareil rouvre au lancement ; absente : l'espace de l'appareil (F-032-AC17). */
export const CLE_ESPACE_RETENU = "espace-retenu";

export function cleDuRegistre(idEspace: string): string {
  return `${PREFIXE_DU_REGISTRE}${idEspace}`;
}

/** Le dernier nom connu de l'espace (F-032-AC3), une chaîne. */
export function cleDuNom(idEspace: string): string {
  return `${PREFIXE_DU_NOM}${idEspace}`;
}

/** La marque de première synchronisation de l'espace (F-032-AC8), qui vaut `true`. */
export function cleDeLaMarque(idEspace: string): string {
  return `${PREFIXE_DE_LA_MARQUE}${idEspace}`;
}

export function estUneEntree(valeur: unknown): valeur is EntreeDuRegistre {
  if (typeof valeur !== "object" || valeur === null) {
    return false;
  }
  const { rattachement, droit } = valeur as Record<string, unknown>;
  return (
    rattachement === "adopte" &&
    (droit === "ecriture" || droit === "lecture") &&
    Object.keys(valeur).length === 2
  );
}

export type SorteDeCle = "registre" | "nom" | "marque";

/** Une clé reconnue, avec l'espace qu'elle désigne ; une clé inconnue est ignorée. */
export interface CleLue {
  readonly sorte: SorteDeCle;
  readonly idEspace: string;
}

const PREFIXES: readonly (readonly [string, SorteDeCle])[] = [
  [PREFIXE_DU_REGISTRE, "registre"],
  [PREFIXE_DU_NOM, "nom"],
  [PREFIXE_DE_LA_MARQUE, "marque"],
];

/** La sorte et l'espace d'une clé du magasin ; `undefined` pour toute autre clé. */
export function lireLaCle(cle: unknown): CleLue | undefined {
  if (typeof cle !== "string") {
    return undefined;
  }
  for (const [prefixe, sorte] of PREFIXES) {
    const idEspace = cle.startsWith(prefixe) ? cle.slice(prefixe.length) : undefined;
    if (idEspace !== undefined && estUuidCanonique(idEspace)) {
      return { sorte, idEspace };
    }
  }
  return undefined;
}
