// Menu « ⋯ » d'une case ou d'une entrée du calendrier (F-021-AC11, AC12) : les commandes du menu sont
// celles de la vue, la surface flottante est ancrée sur le bouton qui l'a ouvert.
import type { LigneLue } from "@notionlike/document";
import type { ReactElement } from "react";

import { type EntreeDeMenu, MenuActions } from "../interface/composants/MenuActions.tsx";
import { SurfaceFlottante } from "../interface/composants/Table.tsx";
import { afficherTouches, cleAria, TOUCHES_DE_L_ENTREE } from "../interface/raccourcis.ts";
import { jourVise } from "./ecritures-du-calendrier.ts";
import { PAS } from "./pas-du-calendrier.ts";
import {
  autresEntrees,
  CHANGER_LA_DATE,
  commandeSurLEntree,
  HORS_DES_BORNES,
  MODIFIER_LE_TITRE,
  nomDesAutres,
  nomDuMenuDeLaCase,
  nomDuMenuDeLEntree,
  nomNouvelleLigne,
  NOUVELLE_LIGNE_DU_JOUR,
  PAS_DE_COLONNE_DE_TITRE,
  RETIRER_LA_DATE,
} from "./textes-calendrier.ts";
import { SUPPRIMER_LA_LIGNE } from "./textes.ts";
import { ENTREES_PAR_CASE, type VueCalendrier as Vue } from "./use-vue-calendrier.ts";

function deplacementsDeLEntree(vue: Vue, ligne: LigneLue): EntreeDeMenu[] {
  const { commandes, menu } = vue;
  const date = vue.modele.dateVisee;
  const libelle = vue.modele.libelleDe(ligne);
  return PAS.map(({ pas, libelle: commande, touche }) => {
    const horsDesBornes = date === undefined || jourVise(ligne, date, pas) === undefined;
    const raison = vue.proprietes.lectureSeule ?? (horsDesBornes ? HORS_DES_BORNES : undefined);
    return {
      libelle: commande,
      nom: commandeSurLEntree(commande, libelle),
      touches: afficherTouches(TOUCHES_DE_L_ENTREE[touche]),
      raccourci: raison === undefined ? cleAria(TOUCHES_DE_L_ENTREE[touche]) : undefined,
      raison,
      surActivation: () => {
        menu.fermer();
        commandes.deplacer(ligne, pas);
      },
    };
  });
}

function entreesDuMenuDeLEntree(vue: Vue, id: string): EntreeDeMenu[] {
  const ligne = vue.proprietes.lignes.find((une) => une.id === id);
  if (ligne === undefined || vue.modele.dateVisee === undefined) {
    return [];
  }
  const { commandes, menu } = vue;
  const lectureSeule = vue.proprietes.lectureSeule;
  const libelle = vue.modele.libelleDe(ligne);
  const agir = (effet: () => void) => () => {
    menu.fermer();
    effet();
  };
  return [
    {
      libelle: MODIFIER_LE_TITRE,
      nom: commandeSurLEntree(MODIFIER_LE_TITRE, libelle),
      touches: afficherTouches(TOUCHES_DE_L_ENTREE.modifierLeTitre),
      raison: lectureSeule ?? (vue.modele.rangDuTitre >= 0 ? undefined : PAS_DE_COLONNE_DE_TITRE),
      surActivation: agir(() => commandes.ouvrirLaSaisie(ligne)),
    },
    ...deplacementsDeLEntree(vue, ligne),
    {
      libelle: CHANGER_LA_DATE,
      nom: commandeSurLEntree(CHANGER_LA_DATE, libelle),
      raison: lectureSeule,
      surActivation: agir(() => commandes.ouvrirUneBoite({ sorte: "date", ligne: id })),
    },
    {
      libelle: RETIRER_LA_DATE,
      nom: commandeSurLEntree(RETIRER_LA_DATE, libelle),
      raison: lectureSeule,
      surActivation: agir(() => commandes.retirerLaDate(ligne)),
    },
    {
      libelle: SUPPRIMER_LA_LIGNE,
      nom: commandeSurLEntree(SUPPRIMER_LA_LIGNE, libelle),
      raison: lectureSeule,
      surActivation: agir(() => commandes.ouvrirUneBoite({ sorte: "supprimer", ligne: id })),
    },
  ];
}

function entreesDuMenuDeLaCase(vue: Vue, jour: string): EntreeDeMenu[] {
  const { commandes, menu } = vue;
  const total = vue.modele.repartition.parJour.get(jour)?.length ?? 0;
  const restantes = vue.navigation.depliees.has(jour) ? 0 : total - ENTREES_PAR_CASE;
  return [
    {
      libelle: NOUVELLE_LIGNE_DU_JOUR,
      nom: nomNouvelleLigne(jour),
      raison: vue.proprietes.lectureSeule,
      surActivation: () => {
        menu.fermer();
        commandes.nouvelleLigne(jour);
      },
    },
    ...(restantes > 0
      ? [
          {
            libelle: autresEntrees(restantes),
            nom: nomDesAutres(restantes, jour),
            surActivation: () => {
              menu.fermer();
              commandes.deplier(jour);
              vue.suivi.suivre({ sorte: "case", jour });
            },
          },
        ]
      : []),
  ];
}

export function MenuOuvert({ vue }: { readonly vue: Vue }): ReactElement | null {
  const ouvert = vue.menu.ouvert;
  if (ouvert === undefined) {
    return null;
  }
  const { cible, ancre } = ouvert;
  const ligne =
    cible.sorte === "entree"
      ? vue.proprietes.lignes.find((une) => une.id === cible.ligne)
      : undefined;
  if (cible.sorte === "entree" && ligne === undefined) {
    return null;
  }
  const nom =
    ligne === undefined
      ? nomDuMenuDeLaCase(cible.jour)
      : nomDuMenuDeLEntree(vue.modele.libelleDe(ligne));
  const entrees =
    cible.sorte === "entree"
      ? entreesDuMenuDeLEntree(vue, cible.ligne)
      : entreesDuMenuDeLaCase(vue, cible.jour);
  return (
    <SurfaceFlottante x={ancre.x} y={ancre.y} largeur={ancre.largeur} hauteur={ancre.hauteur}>
      <MenuActions ref={vue.menu.surface} nom={nom} entrees={entrees} />
    </SurfaceFlottante>
  );
}
