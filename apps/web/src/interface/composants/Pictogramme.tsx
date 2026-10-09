import type { ReactElement } from "react";

import { PICTOGRAMME } from "./pictogramme.classes.ts";

// Dessins au trait, dans les sources (F-004 H27) : décoratifs, le bouton porte le nom accessible.
const TRACES = {
  chevron: "M6 4l4 4l-4 4",
  plus: "M8 3.5v9M3.5 8h9",
  points: "M3.5 8h.01M8 8h.01M12.5 8h.01",
  tiroir: "M2.5 4.5h11M2.5 8h11M2.5 11.5h11",
  fermer: "M4 4l8 8M12 4l-8 8",
  alerte: "M8 4.5v4M8 11.25h.01",
} as const;

export type NomDePictogramme = keyof typeof TRACES;

export const NOMS_DE_PICTOGRAMME = Object.keys(TRACES) as readonly NomDePictogramme[];

export function Pictogramme({ nom }: { readonly nom: NomDePictogramme }): ReactElement {
  return (
    <svg
      className={PICTOGRAMME}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={nom === "points" ? "2" : "1.5"}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={TRACES[nom]} />
    </svg>
  );
}
