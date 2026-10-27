// Section `calendrier` des réglages de vue de l'appareil (F-021-AC6, AC30, H6) : la colonne de date
// choisie, par identifiant de colonne. Écrite seule, sans toucher aux autres sections ni aux clés que
// cette version ne connaît pas ; jamais dans un document Yjs. Le mois affiché n'y est pas : il vit en
// mémoire, par onglet (AC2).
import type { IdColonne } from "@notionlike/document";

export const SECTION_CALENDRIER = "calendrier";
const CLE_DE_LA_COLONNE = "colonne";

function estUnObjet(valeur: unknown): valeur is Readonly<Record<string, unknown>> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

/** La colonne d'une section lue ; aucune si la section est mal formée. */
export function colonneChoisieLue(section: unknown): IdColonne | undefined {
  if (!estUnObjet(section)) {
    return undefined;
  }
  const colonne = section[CLE_DE_LA_COLONNE];
  return typeof colonne === "string" && colonne !== "" ? colonne : undefined;
}

/**
 * La section à écrire : la colonne choisie remplace celle de la section lue, les autres clés sont
 * gardées ; `undefined` (section retirée) quand il ne reste aucune clé.
 */
export function sectionDuCalendrier(colonne: IdColonne | undefined, sectionLue: unknown): unknown {
  const autres = estUnObjet(sectionLue)
    ? Object.entries(sectionLue).filter(([nom]) => nom !== CLE_DE_LA_COLONNE)
    : [];
  const section = Object.fromEntries(
    colonne === undefined ? autres : [...autres, [CLE_DE_LA_COLONNE, colonne]],
  );
  return Object.keys(section).length === 0 ? undefined : section;
}
