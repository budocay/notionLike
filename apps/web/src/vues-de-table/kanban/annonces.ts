// Textes que le module de glisser-déposer adresse aux technologies d'assistance (F-020-AC21) : en
// français, ils nomment la carte et la pile. Le libellé d'une carte ou d'une option est inséré comme
// du texte (F-020-AC22).
import type { AnnoncesDesPiles, DepotSurUnePile } from "../../glisser/index.ts";
import { afficherTouches, TOUCHES_DE_LA_CARTE } from "../../interface/raccourcis.ts";
import { carteDeLIdentifiant, pileDeLIdentifiant } from "./identifiants.ts";
import { placeDeLaCarte } from "./destination.ts";
import type { Pile } from "./piles.ts";
import {
  carteAuDessus,
  carteDansLaPile,
  carteDeposee,
  carteRelachee,
  carteSaisie,
  deplacementAbandonne,
  instructionsDuKanban,
} from "./textes.ts";

function touches(...combinaisons: Parameters<typeof afficherTouches>[0][]): string {
  return combinaisons.map((combinaison) => afficherTouches(combinaison).join("+")).join(" ou ");
}

function pileDeLIdentifiantOuSans(piles: readonly Pile[], id: string): Pile | undefined {
  const option = pileDeLIdentifiant(id)?.option;
  return option === undefined ? undefined : piles.find((pile) => pile.option === option);
}

function libelleDe(pile: Pile | undefined): string | null {
  return pile === undefined || pile.option === null ? null : pile.libelle;
}

export function annoncesDuKanban(piles: readonly Pile[]): AnnoncesDesPiles {
  const cartes = piles.flatMap((pile) => pile.cartes);
  const titreDe = (id: string | undefined): string =>
    cartes.find((carte) => carte.id === carteDeLIdentifiant(id ?? ""))?.titre ?? "";
  const pileDe = (depot: DepotSurUnePile): Pile | undefined =>
    pileDeLIdentifiantOuSans(piles, depot.pile);
  return {
    instructions: instructionsDuKanban({
      piles: touches(TOUCHES_DE_LA_CARTE.pilePrecedente, TOUCHES_DE_LA_CARTE.pileSuivante),
      places: touches(TOUCHES_DE_LA_CARTE.monter, TOUCHES_DE_LA_CARTE.descendre),
      menu: touches(TOUCHES_DE_LA_CARTE.menu, TOUCHES_DE_LA_CARTE.menuAutrement),
    }),
    saisie: (actif) => {
      const id = carteDeLIdentifiant(actif);
      const place = id === undefined ? undefined : placeDeLaCarte(piles, id);
      const pile = piles[place?.pile ?? -1];
      return carteSaisie(
        titreDe(actif),
        libelleDe(pile),
        (place?.rang ?? 0) + 1,
        pile?.cartes.length ?? 0,
      );
    },
    survol: (actif, depot) => {
      if (depot === undefined) {
        return carteRelachee(titreDe(actif));
      }
      const libelle = libelleDe(pileDe(depot));
      return depot.sorte === "pile"
        ? carteDansLaPile(titreDe(actif), libelle)
        : carteAuDessus(titreDe(actif), libelle, titreDe(depot.cible), depot.zone === "avant");
    },
    depot: (actif, depot) =>
      depot === undefined
        ? carteRelachee(titreDe(actif))
        : carteDeposee(titreDe(actif), libelleDe(pileDe(depot))),
    abandon: (actif) => deplacementAbandonne(titreDe(actif)),
  };
}
