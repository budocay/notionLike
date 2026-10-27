// L'espace ouvert de l'onglet (F-032, ADR-0007) : abonné au pilote, hors duquel rien de l'espace ne
// vit. « Chargement… » tant que le pilote lit la base de l'appareil ; puis l'application, remontée en
// entier à chaque génération : rien de ce que tenait l'espace quitté (documents, synchronisation,
// canaux, repli, tiroir, saisie) ne survit au changement (AC14). `useSyncExternalStore` rend la
// mise à jour synchrone : l'ancienne coquille ne reçoit aucune frappe sur une session fermée.
import { type ReactElement, useSyncExternalStore } from "react";

import type { Compte } from "../compte/index.ts";
import type { MagasinDeLAppareil } from "../espace/appareil.ts";
import type { PiloteDeLOnglet } from "../espace/espace-ouvert.ts";
import { Application } from "./Application.tsx";
import { EcranPlein } from "./composants/Coquille.tsx";
import { Chargement } from "./composants/Etats.tsx";
import { CHARGEMENT } from "./messages.ts";
import type { FabriqueDeSynchronisation } from "./synchronisation-ouverte.ts";

interface Proprietes {
  readonly pilote: PiloteDeLOnglet;
  readonly magasin: MagasinDeLAppareil;
  readonly compte?: Compte | undefined;
  readonly synchronisation?: FabriqueDeSynchronisation | undefined;
}

export function EspaceDeLOnglet({
  pilote,
  magasin,
  compte,
  synchronisation,
}: Proprietes): ReactElement {
  const etat = useSyncExternalStore(pilote.abonner, pilote.lireEtat);
  if (etat.phase === "chargement") {
    return (
      <EcranPlein fenetre>
        <Chargement texte={CHARGEMENT} />
      </EcranPlein>
    );
  }
  return (
    <Application
      key={etat.generation}
      session={etat.session}
      compte={compte}
      synchronisation={synchronisation}
      espaces={{
        pilote,
        magasin,
        cible: etat.cible,
        droit: etat.droit,
        arrivee: etat.arrivee,
      }}
    />
  );
}
