// Ce que le geste survole, partagé entre la liste et ses éléments : la rangée qui porte le repère de
// dépôt, et la zone. `undefined` hors de toute zone admise.
import { createContext } from "react";

import type { ZoneDeDepot } from "./zone.ts";

export interface Survol {
  readonly actif: string;
  readonly cible: string;
  readonly zone: ZoneDeDepot;
  /** La pile de la cible, pour des éléments répartis en plusieurs conteneurs (F-020-AC25). */
  readonly pile?: string;
}

export const ContexteDuSurvol = createContext<Survol | undefined>(undefined);
