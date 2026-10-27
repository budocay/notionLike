// Marque de première synchronisation de l'espace ouvert (F-032-AC8, H5) : tant qu'elle est présente
// sur l'appareil, la zone de synchronisation et l'accueil vide disent que des pages peuvent encore
// manquer. Au premier état « Synchronisé » atteint pour cet espace (F-013-AC32), la marque est
// retirée de l'appareil et ses textes disparaissent de l'onglet, que le retrait aboutisse ou non.
// La liste fermée des états de F-013-AC31 ne change pas.
import { useEffect, useState } from "react";

import type { EtatDeLAppareil, MagasinDeLAppareil } from "../espace/appareil.ts";
import type { CibleDeSession } from "../espace/espace-ouvert.ts";
import type { EtatDeSynchronisation } from "../synchronisation/index.ts";
import { espaceDeLaCible } from "./appareil-des-ecrans.ts";

/** Vrai tant que la marque de l'espace ouvert est présente et que « Synchronisé » n'a pas été vu. */
export function usePremiereSynchronisation(
  magasin: MagasinDeLAppareil | undefined,
  appareil: EtatDeLAppareil | undefined,
  cible: CibleDeSession | undefined,
  etat: EtatDeSynchronisation | undefined,
): boolean {
  const espace =
    appareil === undefined || cible === undefined ? undefined : espaceDeLaCible(appareil, cible);
  const marque = espace?.marque === true;
  const synchronise = etat?.affiche === "synchronise";
  const [vu, setVu] = useState(false);
  if (synchronise && !vu) {
    setVu(true);
  }
  const idEspace = espace?.idEspace;
  useEffect(() => {
    if (synchronise && marque && magasin !== undefined && idEspace !== undefined) {
      void magasin.retirerLaMarque(idEspace);
    }
  }, [synchronise, marque, magasin, idEspace]);
  return marque && !vu && !synchronise;
}
