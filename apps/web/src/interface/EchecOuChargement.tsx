// Tableau des membres ou des invitations pas encore lu : son chargement, ou l'échec de sa dernière
// lecture avec une commande pour relire (F-014-AC13, AC16, AC31).
import type { ReactElement } from "react";

import { Actions, Bouton, Texte } from "./composants/Espaces.tsx";

export function EchecOuChargement(props: {
  readonly echec: boolean;
  readonly texteDEchec: string;
  readonly chargement: string;
  readonly relire: () => void;
  readonly libelle: string;
}): ReactElement {
  if (!props.echec) {
    return <Texte>{props.chargement}</Texte>;
  }
  return (
    <>
      <Texte>{props.texteDEchec}</Texte>
      <Actions>
        <Bouton libelle={props.libelle} surActivation={props.relire} />
      </Actions>
    </>
  );
}
