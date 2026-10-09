import type { PageLue } from "@notionlike/document";
import type { ReactElement } from "react";

import { FilAriane } from "./composants/BarreDuHaut.tsx";
import { useFlottant } from "./flottant.ts";
import { AFFICHER_LES_PAGES_INTERMEDIAIRES, NOM_FIL_D_ARIANE, titreAffiche } from "./messages.ts";
import { adresseDePage, ancetresDe } from "./pages.ts";

/** Au-delà, la place manque : les ancêtres intermédiaires passent derrière une commande. */
const ANCETRES_AFFICHES_AU_PLUS = { large: 3, etroit: 1 } as const;

interface Proprietes {
  readonly racines: readonly PageLue[];
  /** Page sélectionnée ; le fil n'est pas rendu sans elle. */
  readonly page: PageLue;
  readonly etroit: boolean;
}

// Chaque ancêtre est un lien vers l'adresse de sa page, bâtie comme celle du lien de sa rangée
// (F-004-AC39). La liste ouverte est un état du fil : monté avec une clé, il la referme quand la
// page change.
export function FilDAriane({ racines, page, etroit }: Proprietes): ReactElement {
  const liste = useFlottant<HTMLUListElement>();
  const ancetres = ancetresDe(racines, page.id).map((ancetre) => ({
    titre: titreAffiche(ancetre.titre),
    adresse: adresseDePage(ancetre.id),
  }));
  const repli =
    ancetres.length > ANCETRES_AFFICHES_AU_PLUS[etroit ? "etroit" : "large"]
      ? {
          nom: AFFICHER_LES_PAGES_INTERMEDIAIRES,
          ouvert: liste.ouvert,
          surBascule: liste.basculer,
          refCommande: liste.commande,
          refListe: liste.surface,
        }
      : undefined;
  return (
    <FilAriane
      nom={NOM_FIL_D_ARIANE}
      ancetres={ancetres}
      courante={titreAffiche(page.titre)}
      repli={repli}
    />
  );
}
