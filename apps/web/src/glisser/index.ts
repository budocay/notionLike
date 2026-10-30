// Interface du module de glisser-déposer (F-006-AC32, ADR-0015) : seul point d'entrée, et aucun
// type de la bibliothèque n'en sort. La remplacer ne touche que ce dossier.
export { type ElementGlissable, useElementGlissable, type ZoneDePile } from "./element.ts";
export {
  type AnnoncesDesPiles,
  type AnnoncesDuGlisser,
  type DepotSurUnePile,
  ListeGlissable,
  PileGlissable,
  PilesGlissables,
  type ProprietesListeGlissable,
  type ProprietesPilesGlissables,
  type TouchesDuGlisser,
} from "./ListeGlissable.tsx";
export type { ZoneDeDepot } from "./zone.ts";
