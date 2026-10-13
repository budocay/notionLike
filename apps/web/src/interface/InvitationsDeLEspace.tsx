// Invitations d'un espace (F-014-AC16 à AC20). Le lien n'est montré qu'à la création, dans une boîte
// de dialogue : le jeton n'est tenu que par l'état de cette boîte, effacé à sa fermeture, et ne
// figure ni dans l'adresse, ni dans le titre, ni dans la console, ni dans un stockage (F-014-AC19).
import { type ReactElement, useRef, useState } from "react";

import type { InvitationCreeeLue, InvitationLue } from "../compte/index.ts";
import { type RoleInvitable, ROLES_INVITABLES } from "../compte/regles-espaces.ts";
import { lienDInvitation } from "../navigation/route.ts";
import { peut } from "./commandes-espaces.ts";
import {
  Actions,
  Annonce,
  BoiteDeDialogue,
  Bouton,
  Choix,
  LienEnLecture,
  Partie,
  Tableau,
  Texte,
} from "./composants/Espaces.tsx";
import type { ContexteDEspace } from "./contexte-espace.ts";
import {
  AUCUNE_INVITATION,
  avertissementDuLien,
  CHARGEMENT_DES_INVITATIONS,
  COLONNE_ACTIONS,
  COLONNE_CREEE_LE,
  COLONNE_EXPIRE_LE,
  COLONNE_ROLE_DU_MEMBRE,
  COPIER_LE_LIEN,
  COPIEZ_A_LA_MAIN,
  CREER_UN_LIEN,
  dateFrancaise,
  expireLe,
  FERMER,
  INVITATION_PLUS_EN_ATTENTE,
  INVITATION_REVOQUEE,
  INVITATIONS,
  LIEN_AFFICHE_A_LA_CREATION,
  LIEN_COPIE,
  LIEN_D_INVITATION,
  LIEN_NE_SERA_PLUS_AFFICHE,
  libelleDuRole,
  LIBELLES_DES_ROLES,
  nomCreerUnLien,
  nomRevoquer,
  QUOTA_D_INVITATIONS,
  REVOQUER,
  ROLE_DE_L_INVITATION,
} from "./messages-espaces.ts";
import { codeDe, useBoite } from "./outils-espaces.ts";

const OPTIONS = ROLES_INVITABLES.map((role) => ({
  valeur: role,
  libelle: LIBELLES_DES_ROLES[role],
}));

export function InvitationsDeLEspace({
  contexte,
}: {
  readonly contexte: ContexteDEspace;
}): ReactElement | null {
  const boite = useBoite<InvitationCreeeLue>(contexte.tableauDesInvitations);
  if (!peut(contexte.espace.role, "voir-invitations")) {
    return null;
  }
  return (
    <Partie titre={INVITATIONS}>
      <Texte>{LIEN_AFFICHE_A_LA_CREATION}</Texte>
      {peut(contexte.espace.role, "creer-invitation") && (
        <Creation contexte={contexte} montrer={boite.ouvrir} />
      )}
      <ListeDesInvitations contexte={contexte} />
      {boite.ouverte !== undefined && <LienCree invitation={boite.ouverte} fermer={boite.fermer} />}
    </Partie>
  );
}

function Creation(props: {
  readonly contexte: ContexteDEspace;
  readonly montrer: (invitation: InvitationCreeeLue) => void;
}): ReactElement {
  const { contexte } = props;
  const [role, setRole] = useState<RoleInvitable>("lecteur");
  const creer = async (): Promise<void> => {
    const resultat = await contexte.verrou.executer(() =>
      contexte.compte.espaces.creerInvitation(contexte.idEspace, { role }),
    );
    if (resultat === undefined) {
      return;
    }
    if (resultat.ok) {
      props.montrer(resultat.valeur);
      contexte.relireInvitations();
    } else {
      contexte.echouer(resultat.erreur, { "quota-atteint": QUOTA_D_INVITATIONS });
    }
  };
  return (
    <Actions>
      <Choix
        nom={ROLE_DE_L_INVITATION}
        valeur={role}
        options={OPTIONS}
        surChoix={(valeur) => setRole(ROLES_INVITABLES.find((un) => un === valeur) ?? role)}
      />
      <Bouton
        libelle={CREER_UN_LIEN}
        nom={nomCreerUnLien(contexte.espace.nom)}
        raison={contexte.raison}
        surActivation={() => void creer()}
      />
    </Actions>
  );
}

function ListeDesInvitations({ contexte }: { readonly contexte: ContexteDEspace }): ReactElement {
  const { invitations } = contexte;
  if (invitations === undefined) {
    return <Texte>{CHARGEMENT_DES_INVITATIONS}</Texte>;
  }
  if (invitations.length === 0) {
    return <Texte>{AUCUNE_INVITATION}</Texte>;
  }
  const revocable = peut(contexte.espace.role, "revoquer-invitation");
  return (
    <Tableau
      refTableau={contexte.tableauDesInvitations}
      legende={INVITATIONS}
      colonnes={[
        COLONNE_ROLE_DU_MEMBRE,
        COLONNE_CREEE_LE,
        COLONNE_EXPIRE_LE,
        ...(revocable ? [COLONNE_ACTIONS] : []),
      ]}
      lignes={invitations.map((invitation) => ({
        cle: invitation.idInvitation,
        cellules: [
          libelleDuRole(invitation.role),
          dateFrancaise(invitation.creeLe),
          dateFrancaise(invitation.expireLe),
          ...(revocable
            ? [<Revocation key="revoquer" contexte={contexte} invitation={invitation} />]
            : []),
        ],
      }))}
    />
  );
}

function Revocation(props: {
  readonly contexte: ContexteDEspace;
  readonly invitation: InvitationLue;
}): ReactElement {
  const { contexte, invitation } = props;
  const revoquer = async (): Promise<void> => {
    const resultat = await contexte.verrou.executer(() =>
      contexte.compte.espaces.revoquerInvitation(contexte.idEspace, invitation.idInvitation),
    );
    if (resultat === undefined) {
      return;
    }
    if (resultat.ok) {
      contexte.annoncer(INVITATION_REVOQUEE);
      contexte.tableauDesInvitations.current?.focus();
      contexte.relireTout();
    } else if (codeDe(resultat) === "ressource-introuvable") {
      // L'invitation n'est plus en attente : la liste est relue (F-014-AC20).
      contexte.alerter([INVITATION_PLUS_EN_ATTENTE]);
      contexte.relireInvitations();
    } else {
      contexte.echouer(resultat.erreur);
    }
  };
  return (
    <Bouton
      libelle={REVOQUER}
      nom={nomRevoquer(invitation.role, dateFrancaise(invitation.creeLe))}
      raison={contexte.raison}
      surActivation={() => void revoquer()}
    />
  );
}

type Copie = "repos" | "copie" | "a-la-main";

/** Le lien créé, une seule fois : sa copie, ou à défaut le lien sélectionné (F-014-AC17, AC18). */
function LienCree(props: {
  readonly invitation: InvitationCreeeLue;
  readonly fermer: () => void;
}): ReactElement {
  const { invitation } = props;
  const [copie, setCopie] = useState<Copie>("repos");
  const copier = useRef<HTMLButtonElement>(null);
  const lien = lienDInvitation(window.location.origin, invitation.jeton);
  const copierLeLien = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(lien);
      setCopie("copie");
    } catch {
      // Presse-papiers absent hors d'un contexte sécurisé, ou écriture refusée.
      setCopie("a-la-main");
    }
  };
  return (
    <BoiteDeDialogue
      alerte={false}
      titre={LIEN_D_INVITATION}
      phrases={[
        expireLe(dateFrancaise(invitation.expireLe)),
        avertissementDuLien(invitation.role),
        LIEN_NE_SERA_PLUS_AFFICHE,
      ]}
      initial={copier}
      surFermeture={props.fermer}
    >
      {copie === "a-la-main" ? (
        <LienEnLecture etiquette={COPIEZ_A_LA_MAIN} valeur={lien} />
      ) : (
        <Texte>{lien}</Texte>
      )}
      <Annonce texte={copie === "copie" ? LIEN_COPIE : ""} />
      <Actions>
        <Bouton
          refBouton={copier}
          libelle={COPIER_LE_LIEN}
          surActivation={() => void copierLeLien()}
        />
        <Bouton libelle={FERMER} surActivation={props.fermer} />
      </Actions>
    </BoiteDeDialogue>
  );
}
