// Section `kanban` des réglages de vue (F-020-AC4, AC27, H7) : la colonne de regroupement choisie,
// par identifiant de colonne, sur l'appareil seul. Une section mal formée vaut « aucun choix » ; un
// choix explicite est enregistré même s'il désigne la colonne par défaut (l'ordre des colonnes peut
// changer ensuite sans changer le regroupement), et les clés que cette version ne connaît pas sont
// gardées (F-018-AC41). Rien n'en entre dans un document Yjs (F-018-AC42).
import type { IdColonne } from "@notionlike/document";

export const SECTION_KANBAN = "kanban";
const CLE_DU_REGROUPEMENT = "regroupement";

function enregistrement(valeur: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur)
    ? (valeur as Readonly<Record<string, unknown>>)
    : undefined;
}

/** La colonne de regroupement enregistrée, s'il y en a une de bien formée. */
export function regroupementLu(section: unknown): IdColonne | undefined {
  const choisie = enregistrement(section)?.[CLE_DU_REGROUPEMENT];
  return typeof choisie === "string" && choisie !== "" ? choisie : undefined;
}

/** La section à écrire : le choix remplace la clé `regroupement` et garde les autres. */
export function sectionDuKanban(
  choisie: IdColonne,
  sectionLue: unknown,
): Readonly<Record<string, unknown>> {
  const autres = Object.entries(enregistrement(sectionLue) ?? {}).filter(
    ([cle]) => cle !== CLE_DU_REGROUPEMENT,
  );
  return Object.fromEntries([...autres, [CLE_DU_REGROUPEMENT, choisie]]);
}
