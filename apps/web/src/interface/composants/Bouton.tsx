import type { ComponentProps, ReactElement } from "react";

import { BOUTON, BOUTON_ICONE } from "./bouton.classes.ts";
import { type NomDePictogramme, Pictogramme } from "./Pictogramme.tsx";

type ProprietesNatives = Omit<ComponentProps<"button">, "className" | "type">;

interface ProprietesBouton extends ProprietesNatives {
  readonly variante: keyof typeof BOUTON;
}

export function Bouton({ variante, children, ...natives }: ProprietesBouton): ReactElement {
  return (
    <button type="button" className={BOUTON[variante]} {...natives}>
      {children}
    </button>
  );
}

interface ProprietesBoutonIcone extends Omit<ProprietesNatives, "children" | "aria-label"> {
  /** Nom accessible : le pictogramme est décoratif. */
  readonly nom: string;
  readonly pictogramme: NomDePictogramme;
  /** Où le bouton est posé : son fond de survol s'accorde à ce qui l'entoure. */
  readonly lieu: keyof typeof BOUTON_ICONE;
}

export function BoutonIcone({
  nom,
  pictogramme,
  lieu,
  ...natives
}: ProprietesBoutonIcone): ReactElement {
  return (
    <button type="button" className={BOUTON_ICONE[lieu]} aria-label={nom} {...natives}>
      <Pictogramme nom={pictogramme} />
    </button>
  );
}
