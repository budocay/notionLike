// Écran d'un espace, `#/espaces/<idEspace>` (F-014-AC9 à AC20) : son nom, le rôle du compte, ses
// actions, ses membres et ses invitations. Chaque commande n'est rendue que si le dernier rôle donné
// par le serveur la permet (F-014-AC27) ; le serveur reste seul juge (F-014-AC28).
import { type ReactElement, useSyncExternalStore } from "react";

import type { Compte, ErreurDEspaces } from "../compte/index.ts";
import { fragmentDEcran } from "../navigation/route.ts";
import { ActionsDeLEspace } from "./ActionsDeLEspace.tsx";
import {
  Actions,
  Alerte,
  Annonce,
  Bouton,
  EcranDEspaces,
  Lien,
  Texte,
} from "./composants/Espaces.tsx";
import { useEcranDUnEspace } from "./contexte-espace.ts";
import { InvitationsDeLEspace } from "./InvitationsDeLEspace.tsx";
import {
  CHARGEMENT_DE_L_ESPACE,
  CONNECTEZ_VOUS,
  DEMANDE_UNE_CONNEXION,
  libelleDuRole,
  REESSAYER,
  RELIRE_L_ESPACE,
  RETOUR_AUX_ESPACES,
  texteDEchec,
  TITRE_DES_ESPACES,
  VOTRE_ROLE,
} from "./messages-espaces.ts";
import type { Sortie } from "./outils-espaces.ts";
import { MembresDeLEspace } from "./MembresDeLEspace.tsx";

interface Proprietes {
  readonly compte: Compte;
  readonly idEspace: string;
  readonly revenirALaListe: (sortie: Sortie) => void;
}

export function EcranDUnEspace({ compte, idEspace, revenirALaListe }: Proprietes): ReactElement {
  const etat = useSyncExternalStore(compte.suivi.abonner, compte.suivi.lire);
  const moi = etat.statut === "connecte" ? etat.id : undefined;
  const ecran = useEcranDUnEspace(compte, idEspace, moi, revenirALaListe);
  const { contexte } = ecran;
  const retour = (
    <Actions>
      <Lien libelle={RETOUR_AUX_ESPACES} adresse={fragmentDEcran({ ecran: "espaces" })} />
    </Actions>
  );
  if (etat.statut !== "connecte") {
    return (
      <EcranDEspaces titre={TITRE_DES_ESPACES}>
        {retour}
        <Texte>{etat.statut === "deconnecte" ? CONNECTEZ_VOUS : DEMANDE_UNE_CONNEXION}</Texte>
      </EcranDEspaces>
    );
  }
  if (contexte === undefined) {
    return (
      <EcranDEspaces titre={TITRE_DES_ESPACES}>
        {retour}
        <EspaceNonLu echec={ecran.echecDeLecture} relire={ecran.relireTout} />
      </EcranDEspaces>
    );
  }
  return (
    <EcranDEspaces titre={contexte.espace.nom}>
      {retour}
      <Texte>{`${VOTRE_ROLE} ${libelleDuRole(contexte.espace.role)}`}</Texte>
      <Annonce texte={ecran.annonce ?? ""} />
      {ecran.alerte !== undefined && <Alerte phrases={ecran.alerte} />}
      {ecran.horsLigne && (
        <Actions>
          <Bouton libelle={RELIRE_L_ESPACE} surActivation={ecran.relireTout} />
        </Actions>
      )}
      <ActionsDeLEspace contexte={contexte} />
      <MembresDeLEspace contexte={contexte} />
      <InvitationsDeLEspace contexte={contexte} />
    </EcranDEspaces>
  );
}

/** L'espace pas encore lu : son chargement, ou l'échec de la lecture avec « Réessayer ». */
function EspaceNonLu(props: {
  readonly echec: ErreurDEspaces | undefined;
  readonly relire: () => void;
}): ReactElement {
  if (props.echec === undefined) {
    return <Texte>{CHARGEMENT_DE_L_ESPACE}</Texte>;
  }
  return (
    <>
      <Alerte phrases={texteDEchec(props.echec)} />
      <Actions>
        <Bouton libelle={REESSAYER} surActivation={props.relire} />
      </Actions>
    </>
  );
}
