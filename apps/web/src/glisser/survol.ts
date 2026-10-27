// Ce que le geste survole, partagé entre la liste et ses éléments : la rangée qui porte le repère de
// dépôt, et la zone. `undefined` hors de toute zone admise.
import { createContext } from "react";

import type { ZoneDeDepot } from "./zone.ts";

export interface Survol {
  readonly actif: string;
  readonly cible: string;
  readonly zone: ZoneDeDepot;
}

export const ContexteDuSurvol = createContext<Survol | undefined>(undefined);
