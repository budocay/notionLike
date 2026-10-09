import { type ComponentProps, type ReactElement, useId } from "react";

import { CHAMP } from "./champ.classes.ts";

interface Proprietes extends Omit<ComponentProps<"input">, "className" | "type" | "aria-label"> {
  /** Nom accessible du champ. */
  readonly nom: string;
  /** Message du dernier refus, affiché sous le champ resté ouvert. */
  readonly erreur: string | undefined;
}

export function ChampTitre({ nom, erreur, ...natives }: Proprietes): ReactElement {
  const idErreur = useId();
  return (
    <span className={CHAMP.cadre}>
      <input
        type="text"
        className={erreur === undefined ? CHAMP.valide : CHAMP.enErreur}
        aria-label={nom}
        aria-invalid={erreur !== undefined}
        aria-describedby={erreur === undefined ? undefined : idErreur}
        {...natives}
      />
      {erreur !== undefined && (
        <span role="alert" id={idErreur} className={CHAMP.erreur}>
          {erreur}
        </span>
      )}
    </span>
  );
}
