import type { ReactElement } from "react";

import { RACCOURCI, TOUCHE } from "./raccourci.classes.ts";

/** Combinaison de touches affichée à côté d'une commande ; elle n'entre pas dans le nom accessible. */
export function Raccourci({ touches }: { readonly touches: readonly string[] }): ReactElement {
  return (
    <kbd className={RACCOURCI} aria-hidden="true">
      {touches.map((touche) => (
        <kbd key={touche} className={TOUCHE}>
          {touche}
        </kbd>
      ))}
    </kbd>
  );
}
