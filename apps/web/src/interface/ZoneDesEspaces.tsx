// Zone des écrans des espaces (F-014) : la liste, un espace, l'invitation. Elle garde l'annonce qui
// survit au passage d'un écran à l'autre (« Espace supprimé », « Cet espace n'est plus accessible
// avec ce compte. »), en mémoire seulement. La coquille et l'espace de l'appareil n'en dépendent pas.
import { type ReactElement, useState } from "react";

import type { Compte } from "../compte/index.ts";
import { allerALEcran } from "../navigation/fragment.ts";
import type { EcranDEspaces } from "../navigation/route.ts";
import { EcranDesEspaces } from "./EcranDesEspaces.tsx";
import { EcranDInvitation } from "./EcranDInvitation.tsx";
import { EcranDUnEspace } from "./EcranDUnEspace.tsx";
import type { NavigationDeLEspace } from "./navigation-espaces.ts";
import type { Sortie } from "./outils-espaces.ts";

interface Proprietes {
  readonly compte: Compte;
  readonly ecran: Exclude<EcranDEspaces, { ecran: "lien-d-invitation" }>;
  readonly navigation: NavigationDeLEspace;
}

const SANS_SORTIE: Sortie = { annonce: undefined, alerte: undefined };

export function ZoneDesEspaces({ compte, ecran, navigation }: Proprietes): ReactElement {
  const [sortie, setSortie] = useState<Sortie>(SANS_SORTIE);
  const [vu, setVu] = useState(ecran.ecran);
  // L'annonce ne vaut que pour le retour à la liste qui la porte.
  if (vu !== ecran.ecran) {
    setVu(ecran.ecran);
    if (ecran.ecran !== "espaces") {
      setSortie(SANS_SORTIE);
    }
  }
  const revenirALaListe = (suivante: Sortie): void => {
    setSortie(suivante);
    allerALEcran({ ecran: "espaces" });
  };
  switch (ecran.ecran) {
    case "espaces":
      return <EcranDesEspaces compte={compte} sortie={sortie} />;
    case "espace":
      return (
        <EcranDUnEspace
          key={ecran.idEspace}
          compte={compte}
          idEspace={ecran.idEspace}
          revenirALaListe={revenirALaListe}
        />
      );
    case "invitation":
      return <EcranDInvitation compte={compte} navigation={navigation} />;
  }
}
