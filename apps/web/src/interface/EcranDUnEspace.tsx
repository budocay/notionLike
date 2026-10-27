// Écran d'un espace, `#/espaces/<idEspace>` (F-014-AC9 à AC20) : son nom, le rôle du compte, ses
// actions, ses membres et ses invitations. Chaque commande n'est rendue que si le dernier rôle donné
// par le serveur la permet (F-014-AC27) ; le serveur reste seul juge (F-014-AC28). Avec le pilote de
// l'onglet, « Ouvrir cet espace » l'ouvre dans l'éditeur (F-032-AC5, AC10) : sans requête s'il est
// sur l'appareil, compte connecté ou non (AC2), par l'ajout à l'appareil sinon.
import { type ReactElement, useSyncExternalStore } from "react";

import type { Compte, ErreurDEspaces, EspaceLu } from "../compte/index.ts";
import { fragmentDEcran } from "../navigation/route.ts";
import { ActionsDeLEspace } from "./ActionsDeLEspace.tsx";
import { useAjoutALAppareil } from "./ajout-a-l-appareil.ts";
import { cibleSurLAppareil, useAppareilDesEcrans } from "./appareil-des-ecrans.ts";
import { nomDeLEspace } from "./changement-d-espace.ts";
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
  PLUS_ACCESSIBLE,
  REESSAYER,
  RELIRE_L_ESPACE,
  RETOUR_AUX_ESPACES,
  texteDEchec,
  TITRE_DES_ESPACES,
  VOTRE_ROLE,
} from "./messages-espaces.ts";
import type { Sortie } from "./outils-espaces.ts";
import { MembresDeLEspace } from "./MembresDeLEspace.tsx";
import { OuvertureDUnEspace } from "./OuvertureDUnEspace.tsx";

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
        <OuvertureHorsConnexion idEspace={idEspace} />
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
      <OuvertureDepuisLEcran
        compte={compte}
        espace={contexte.espace}
        revenirALaListe={revenirALaListe}
      />
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

/** « Ouvrir cet espace » sur l'écran d'un espace lu au serveur, et l'échec de son ajout (AC6). */
function OuvertureDepuisLEcran(props: {
  readonly compte: Compte;
  readonly espace: EspaceLu;
  readonly revenirALaListe: (sortie: Sortie) => void;
}): ReactElement {
  const { compte, espace, revenirALaListe } = props;
  const ajout = useAjoutALAppareil({
    compte,
    surIntrouvable: () => revenirALaListe({ annonce: undefined, alerte: PLUS_ACCESSIBLE }),
  });
  return (
    <>
      {ajout.alerte !== undefined && <Alerte phrases={ajout.alerte} />}
      <OuvertureDUnEspace
        idEspace={espace.idEspace}
        nom={espace.nom}
        role={espace.role}
        ajout={ajout}
      />
    </>
  );
}

/**
 * Compte non connecté : un espace de l'appareil s'ouvre encore depuis ses bases, sous son dernier
 * nom connu (F-032-AC2, AC24) ; un espace que l'appareil ne détient pas, non.
 */
function OuvertureHorsConnexion({ idEspace }: { readonly idEspace: string }): ReactElement | null {
  const appareil = useAppareilDesEcrans();
  const cible = appareil === undefined ? undefined : cibleSurLAppareil(appareil.etat, idEspace);
  if (appareil === undefined || cible === undefined) {
    return null;
  }
  return (
    <OuvertureDUnEspace
      idEspace={idEspace}
      nom={nomDeLEspace(appareil.etat, cible)}
      role={undefined}
      ajout={undefined}
    />
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
