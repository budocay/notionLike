// Confirmation de l'effacement de la copie locale (F-013-AC24) : boîte d'alerte qui cite le nombre
// de pages, dit que l'effacement est irréversible sur cet appareil et que les modifications non
// transmises seront perdues ; le focus est sur « Annuler ». Une fois confirmé, l'application est
// rouverte ; un effacement incomplet est signalé (F-007-AC21).
import { type ReactElement, useRef, useState } from "react";

import type { IssueDeLEffacement } from "../synchronisation/index.ts";
import { Actions, Alerte, BoiteDeDialogue, Bouton } from "./composants/Espaces.tsx";
import {
  ANNULER,
  EFFACEMENT_EN_COURS,
  EFFACEMENT_INCOMPLET,
  EFFACER_LA_COPIE_LOCALE,
  RECHARGER,
  texteDeLEffacement,
} from "./messages-synchronisation.ts";
import { touchesDeBoite } from "./outils-espaces.ts";

interface Proprietes {
  readonly pages: number;
  readonly fermer: () => void;
  readonly effacer: () => Promise<IssueDeLEffacement>;
}

type Etape = "confirmation" | "en-cours" | "incomplet";

function recharger(): void {
  window.location.reload();
}

export function EffacementDeLaCopie({ pages, fermer, effacer }: Proprietes): ReactElement {
  const annuler = useRef<HTMLButtonElement>(null);
  const [etape, setEtape] = useState<Etape>("confirmation");
  const confirmer = async (): Promise<void> => {
    if (etape !== "confirmation") {
      return;
    }
    setEtape("en-cours");
    const issue = await effacer();
    if (issue === "effacee") {
      recharger();
    } else {
      setEtape("incomplet");
    }
  };
  return (
    <BoiteDeDialogue
      alerte
      titre={EFFACER_LA_COPIE_LOCALE}
      phrases={texteDeLEffacement(pages)}
      initial={annuler}
      surTouche={touchesDeBoite(etape === "confirmation" ? fermer : () => undefined)}
    >
      {etape === "incomplet" && <Alerte phrases={[EFFACEMENT_INCOMPLET]} />}
      <Actions>
        {etape === "incomplet" ? (
          <Bouton libelle={RECHARGER} surActivation={recharger} />
        ) : (
          <>
            <Bouton
              libelle={EFFACER_LA_COPIE_LOCALE}
              raison={etape === "en-cours" ? EFFACEMENT_EN_COURS : undefined}
              surActivation={() => void confirmer()}
            />
            <Bouton
              refBouton={annuler}
              libelle={ANNULER}
              desactive={etape === "en-cours"}
              surActivation={fermer}
            />
          </>
        )}
      </Actions>
    </BoiteDeDialogue>
  );
}
