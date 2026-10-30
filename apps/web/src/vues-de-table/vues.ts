// Liste ordonnée des vues livrées (F-018-AC44), tenue en ce seul endroit : F-020 (kanban) et F-021
// (calendrier) y ajoutent la leur. Le sélecteur de vues paraît dès qu'elle en compte deux.
import { LIBELLE_KANBAN } from "./kanban/textes.ts";
import { TABLEAU } from "./textes.ts";

export interface VueLivree {
  /** Identifiant enregistré dans la section `vue` des réglages. */
  readonly id: string;
  readonly libelle: string;
}

/** Identifiant de la vue kanban dans la section `vue` des réglages (F-020-AC27). */
export const VUE_KANBAN = "kanban";

export const VUES: readonly VueLivree[] = [
  { id: "tableau", libelle: TABLEAU },
  { id: VUE_KANBAN, libelle: LIBELLE_KANBAN },
];

export const IDS_DES_VUES: readonly string[] = VUES.map(({ id }) => id);

/** Vrai dès que la liste compte au moins deux vues. */
export function avecSelecteur(vues: readonly VueLivree[] = VUES): boolean {
  return vues.length >= 2;
}
