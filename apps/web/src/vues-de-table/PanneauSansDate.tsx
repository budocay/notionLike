// Panneau « Sans date » du calendrier (F-021-AC8, AC11) : les lignes que la grille ne place pas, avec
// leurs commandes « Définir la date » et « Retirer la date ».
import type { ReactElement } from "react";

import {
  LignesDuPanneau,
  LigneDuPanneau,
  NoteDuPanneau,
  PanneauDeCalendrier,
} from "../interface/composants/Calendrier.tsx";
import { Bouton } from "../interface/composants/Espaces.tsx";
import {
  AFFICHER_PLUS_DE_LIGNES,
  commandeSurLEntree,
  DEFINIR_LA_DATE,
  PANNEAU_VIDE,
  RETIRER_LA_DATE,
  titreDuPanneau,
} from "./textes-calendrier.ts";
import type { VueCalendrier as Vue } from "./use-vue-calendrier.ts";

export function PanneauSansDate({ vue }: { readonly vue: Vue }): ReactElement {
  const { sansDate } = vue.modele.repartition;
  const visibles = sansDate.slice(0, vue.navigation.limiteDuPanneau);
  const raison = vue.proprietes.lectureSeule;
  const { commandes } = vue;
  return (
    <PanneauDeCalendrier titre={titreDuPanneau(sansDate.length)}>
      {sansDate.length === 0 ? (
        <NoteDuPanneau texte={PANNEAU_VIDE} />
      ) : (
        <LignesDuPanneau>
          {visibles.map((ligne) => {
            const libelle = vue.modele.libelleDe(ligne);
            return (
              <LigneDuPanneau key={ligne.id} ligne={ligne.id} nom={libelle} libelle={libelle}>
                <Bouton
                  libelle={DEFINIR_LA_DATE}
                  nom={commandeSurLEntree(DEFINIR_LA_DATE, libelle)}
                  raison={raison}
                  surActivation={() => commandes.ouvrirUneBoite({ sorte: "date", ligne: ligne.id })}
                />
                <Bouton
                  libelle={RETIRER_LA_DATE}
                  nom={commandeSurLEntree(RETIRER_LA_DATE, libelle)}
                  raison={raison}
                  surActivation={() => commandes.retirerLaDate(ligne)}
                />
              </LigneDuPanneau>
            );
          })}
        </LignesDuPanneau>
      )}
      {sansDate.length > visibles.length && (
        <Bouton libelle={AFFICHER_PLUS_DE_LIGNES} surActivation={commandes.plusDeLignes} />
      )}
    </PanneauDeCalendrier>
  );
}
