// Vue « Tableau » (F-018-AC17 à AC47) : la grille d'une table, sa barre d'outils, son invitation
// quand la table n'a pas de colonne, ses menus et ses boîtes. Sans bibliothèque de table : rôles de
// grille, tabindex itinérant et fenêtre sont écrits par le projet (H8, H9).
import type { ReactElement } from "react";

import { Bouton } from "../interface/composants/Espaces.tsx";
import { MenuActions } from "../interface/composants/MenuActions.tsx";
import {
  EcranDeTableCadre,
  Grille,
  InvitationDeTable,
  SurfaceFlottante,
} from "../interface/composants/Table.tsx";
import { ajouterUneLigne } from "./actions.ts";
import { BoiteOuverte } from "./Boites.tsx";
import { ChoixDeCellule } from "./ChoixDeCellule.tsx";
import { surToucheDeLaGrille } from "./clavier.ts";
import { RangeeDesEnTetes } from "./EnTetes.tsx";
import { HAUTEUR_DE_RANGEE, hauteurDeLaZone, LARGEUR_DES_ACTIONS } from "./grille.ts";
import { entreesDeColonne, entreesDeLigne, type Commandes } from "./menus.ts";
import { RangeesDeLaGrille } from "./Rangees.tsx";
import {
  AJOUTER_UNE_COLONNE,
  INVITATION_SANS_COLONNE,
  nomActionsDeLaColonne,
  nomActionsDeLaLigne,
  nomDeLaGrille,
  NOUVELLE_LIGNE,
} from "./textes.ts";
import {
  type ProprietesVueTableau,
  useVueTableau,
  type VueTableau as Vue,
} from "./use-vue-tableau.ts";

function commandesDe(vue: Vue): Commandes {
  return {
    moyens: vue.moyens,
    fermer: vue.menu.fermer,
    renommer: vue.edition.renommer,
    ouvrirBoite: vue.ouvrirBoite,
  };
}

function MenuOuvert({ vue }: { readonly vue: Vue }): ReactElement | null {
  const ouvert = vue.menu.ouvert;
  if (ouvert === undefined) {
    return null;
  }
  const { cible, ancre } = ouvert;
  let nom: string;
  let entrees: ReturnType<typeof entreesDeLigne>;
  if (cible.sorte === "colonne") {
    const rang = vue.colonnes.findIndex(({ id }) => id === cible.colonne);
    const colonne = vue.colonnes[rang];
    if (colonne === undefined) {
      return null;
    }
    nom = nomActionsDeLaColonne(colonne.nom);
    entrees = entreesDeColonne(commandesDe(vue), colonne, rang, vue.colonnes.length);
  } else {
    const rang = vue.proprietes.lignes.findIndex(({ id }) => id === cible.ligne) + 1;
    if (rang === 0) {
      return null;
    }
    nom = nomActionsDeLaLigne(rang);
    entrees = entreesDeLigne(commandesDe(vue), cible.ligne, rang, vue.courante.courante);
  }
  return (
    <SurfaceFlottante x={ancre.x} y={ancre.y} largeur={ancre.largeur} hauteur={ancre.hauteur}>
      <MenuActions ref={vue.menu.surface} nom={nom} entrees={entrees} />
    </SurfaceFlottante>
  );
}

function GrilleDeLaTable({ vue }: { readonly vue: Vue }): ReactElement {
  const { lignes, titre, largeurDe } = vue.proprietes;
  const largeur =
    LARGEUR_DES_ACTIONS + vue.colonnes.reduce((somme, { id }) => somme + largeurDe(id), 0);
  return (
    <Grille
      nom={nomDeLaGrille(titre)}
      nombreDeRangees={lignes.length + 1}
      nombreDeColonnes={vue.colonnes.length + 1}
      largeur={largeur}
      hauteurDuCorps={lignes.length * HAUTEUR_DE_RANGEE}
      hauteurDeLaZone={hauteurDeLaZone(lignes.length + 1)}
      refDefilement={vue.fenetre.zone}
      refCadre={vue.cadre}
      surDefilement={vue.fenetre.surDefilement}
      surTouche={(evenement) => surToucheDeLaGrille(vue, evenement)}
      enTetes={<RangeeDesEnTetes vue={vue} />}
      rangees={<RangeesDeLaGrille vue={vue} largeur={largeur} />}
      flottante={
        <>
          <MenuOuvert vue={vue} />
          <ChoixDeCellule vue={vue} />
        </>
      }
    />
  );
}

function Outils({ vue }: { readonly vue: Vue }): ReactElement | undefined {
  const raison = vue.proprietes.lectureSeule;
  if (vue.colonnes.length === 0) {
    return undefined;
  }
  return (
    <>
      <Bouton
        libelle={AJOUTER_UNE_COLONNE}
        raison={raison}
        surActivation={() => vue.ouvrirBoite({ sorte: "nouvelle-colonne" })}
      />
      <Bouton
        libelle={NOUVELLE_LIGNE}
        raison={raison}
        surActivation={() => ajouterUneLigne(vue.moyens)}
      />
    </>
  );
}

export function VueTableau(proprietes: ProprietesVueTableau): ReactElement {
  const vue = useVueTableau(proprietes);
  return (
    <EcranDeTableCadre
      outils={<Outils vue={vue} />}
      annonce={vue.annonce}
      alerte={vue.alerte}
      idAlerte={vue.idAlerte}
    >
      {vue.colonnes.length === 0 ? (
        <InvitationDeTable texte={INVITATION_SANS_COLONNE}>
          <Bouton
            refBouton={vue.invitation}
            libelle={AJOUTER_UNE_COLONNE}
            raison={proprietes.lectureSeule}
            surActivation={() => vue.ouvrirBoite({ sorte: "nouvelle-colonne" })}
          />
        </InvitationDeTable>
      ) : (
        <GrilleDeLaTable vue={vue} />
      )}
      <BoiteOuverte vue={vue} />
    </EcranDeTableCadre>
  );
}
