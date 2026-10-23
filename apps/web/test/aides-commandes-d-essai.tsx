// Commandes d'essai du changement d'espace (F-032, bloc 4) : tant que les écrans des espaces n'ont
// pas leurs commandes « Ouvrir cet espace » (bloc 5), un test remplace la zone de compte de la barre
// par elle-même suivie de boutons qui demandent un changement par l'API que l'écran de l'espace
// ouvert offre (`useChangementOffert`). Le remplacement se fait dans le fichier de test :
//
//   vi.mock("../src/interface/ZoneDeCompte.tsx", async (reel) =>
//     (await import("./aides-commandes-d-essai.tsx")).avecLesCommandesDEssai(await reel()));
import type { ReactElement } from "react";

import type { CibleDeSession } from "../src/espace/espace-ouvert.ts";
import {
  type ChangementDEspace,
  useChangementOffert,
} from "../src/interface/changement-d-espace.ts";

export interface CommandeDEssai {
  readonly libelle: string;
  readonly cible: CibleDeSession;
  /** Le nom de l'espace choisi, tel qu'un écran des espaces l'afficherait. */
  readonly nom: string;
}

/** Les commandes rendues après la zone de compte, et la dernière API du changement vue. */
export const essai: { commandes: CommandeDEssai[]; changement: ChangementDEspace | undefined } = {
  commandes: [],
  changement: undefined,
};

type ModuleDeLaZone = typeof import("../src/interface/ZoneDeCompte.tsx");

export function avecLesCommandesDEssai(reel: ModuleDeLaZone): ModuleDeLaZone {
  function ZoneDeCompteDEssai(props: Parameters<ModuleDeLaZone["ZoneDeCompte"]>[0]): ReactElement {
    const changement = useChangementOffert();
    essai.changement = changement;
    return (
      <>
        <reel.ZoneDeCompte {...props} />
        {changement !== undefined &&
          essai.commandes.map((commande) => (
            <button
              key={commande.libelle}
              type="button"
              onClick={() => changement.demander({ cible: commande.cible, nom: commande.nom })}
            >
              {commande.libelle}
            </button>
          ))}
      </>
    );
  }
  return { ...reel, ZoneDeCompte: ZoneDeCompteDEssai };
}
