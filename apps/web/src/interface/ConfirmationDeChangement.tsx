// Confirmations d'un changement d'espace (F-032-AC12, AC13, AC29) : boîtes de dialogue d'alerte,
// focus sur « Rester sur cet espace » à l'ouverture et retenu dans la boîte ; Échap vaut « Rester » ;
// le focus revient à la commande d'origine, rendu par le crochet du changement.
import { type ReactElement, useRef } from "react";

import type { ConfirmationOuverte } from "./changement-d-espace.ts";
import { Actions, BoiteDeDialogue, Bouton } from "./composants/Espaces.tsx";
import {
  CHANGER_D_ESPACE,
  CHANGER_QUAND_MEME,
  modificationsEnregistreesNullePart,
  modificationsNonTransmises,
  RESTER_SUR_CET_ESPACE,
  TITRE_DU_CHANGEMENT,
} from "./messages-espaces.ts";
import { touchesDeBoite } from "./outils-espaces.ts";

export function ConfirmationDeChangement({
  confirmation,
}: {
  readonly confirmation: ConfirmationOuverte;
}): ReactElement {
  const rester = useRef<HTMLButtonElement>(null);
  const nullePart = confirmation.sorte === "nulle-part";
  return (
    <BoiteDeDialogue
      alerte
      titre={TITRE_DU_CHANGEMENT}
      phrases={[
        nullePart
          ? modificationsEnregistreesNullePart(confirmation.nomOuvert)
          : modificationsNonTransmises(confirmation.nomOuvert),
      ]}
      initial={rester}
      surTouche={touchesDeBoite(confirmation.rester)}
    >
      <Actions>
        <Bouton
          refBouton={rester}
          libelle={RESTER_SUR_CET_ESPACE}
          surActivation={confirmation.rester}
        />
        <Bouton
          libelle={nullePart ? CHANGER_QUAND_MEME : CHANGER_D_ESPACE}
          surActivation={confirmation.changer}
        />
      </Actions>
    </BoiteDeDialogue>
  );
}
