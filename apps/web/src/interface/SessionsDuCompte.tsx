// Sessions du compte (F-027-AC22, AC24, AC25, AC26) : un tableau des sessions non expirées, dates en
// français dans le fuseau de l'appareil, adresse IP et navigateur tels qu'enregistrés, rendus comme
// du texte. Rien n'en est déduit (ni lieu, ni appareil), envoyé ailleurs ou gardé dans un stockage.
// Fermer une session, ou toutes les autres, demande le mot de passe actuel dans une boîte de dialogue.
import { type ReactElement, type RefObject, useRef } from "react";

import type { SessionLue } from "../compte/index.ts";
import { Actions, Alerte, Bouton, Partie, Tableau, Texte } from "./composants/Espaces.tsx";
import { REESSAYER } from "./messages-compte.ts";
import {
  AUCUNE_AUTRE_SESSION,
  AUCUNE_SESSION,
  CET_APPAREIL,
  CHARGEMENT_DES_SESSIONS,
  COLONNE_ADRESSE_IP,
  COLONNE_DERNIERE_ACTIVITE,
  COLONNE_NAVIGATEUR,
  COLONNE_OUVERTE_LE,
  COLONNE_SESSION,
  dateFrancaise,
  DONNEES_DES_SESSIONS,
  EFFET_D_UNE_FERMETURE,
  FERMER_CETTE_SESSION,
  FERMER_LES_AUTRES,
  NON_ENREGISTRE,
  nomFermerLaSession,
  PARTIE_SESSIONS,
  SESSIONS_NON_LUES,
  SESSIONS_OUVERTES,
  texteDEchec,
} from "./messages-gestion-du-compte.ts";
import type { Moyens } from "./outils-gestion-du-compte.ts";
import { useBoite } from "./outils-espaces.ts";
import { type Cible, Revocation } from "./RevocationDeSession.tsx";

export function SessionsDuCompte({ moyens }: { readonly moyens: Moyens }): ReactElement {
  const tableau = useRef<HTMLTableElement>(null);
  const boite = useBoite<Cible>(tableau);
  return (
    <Partie titre={PARTIE_SESSIONS}>
      <Texte>{DONNEES_DES_SESSIONS}</Texte>
      <Texte>{EFFET_D_UNE_FERMETURE}</Texte>
      <Contenu moyens={moyens} ouvrir={boite.ouvrir} tableau={tableau} />
      {boite.ouverte !== undefined && (
        <Revocation moyens={moyens} cible={boite.ouverte} fermer={boite.fermer} />
      )}
    </Partie>
  );
}

function Contenu(props: {
  readonly moyens: Moyens;
  readonly ouvrir: (cible: Cible) => void;
  readonly tableau: RefObject<HTMLTableElement | null>;
}): ReactElement {
  const { moyens, ouvrir } = props;
  const { liste, relire } = moyens.sessions;
  switch (liste.statut) {
    case "attente":
      return <Texte>{CHARGEMENT_DES_SESSIONS}</Texte>;
    case "echec":
      return (
        <>
          <Alerte phrases={[SESSIONS_NON_LUES, ...texteDEchec(liste.erreur)]} />
          <Actions>
            <Bouton libelle={REESSAYER} surActivation={relire} />
          </Actions>
        </>
      );
    case "pret":
      return (
        <>
          <ListeDesSessions
            sessions={liste.sessions}
            raison={moyens.raison}
            ouvrir={ouvrir}
            tableau={props.tableau}
          />
          <Actions>
            <Bouton
              libelle={FERMER_LES_AUTRES}
              raison={
                liste.sessions.some((session) => !session.courante)
                  ? moyens.raison
                  : AUCUNE_AUTRE_SESSION
              }
              surActivation={() => ouvrir({ sorte: "autres" })}
            />
          </Actions>
        </>
      );
  }
}

function ListeDesSessions(props: {
  readonly sessions: readonly SessionLue[];
  readonly raison: string | undefined;
  readonly ouvrir: (cible: Cible) => void;
  readonly tableau: RefObject<HTMLTableElement | null>;
}): ReactElement {
  if (props.sessions.length === 0) {
    return <Texte>{AUCUNE_SESSION}</Texte>;
  }
  return (
    <Tableau
      legende={SESSIONS_OUVERTES}
      refTableau={props.tableau}
      colonnes={[
        COLONNE_OUVERTE_LE,
        COLONNE_DERNIERE_ACTIVITE,
        COLONNE_ADRESSE_IP,
        COLONNE_NAVIGATEUR,
        COLONNE_SESSION,
      ]}
      lignes={props.sessions.map((session) => ({
        cle: session.idSession,
        cellules: [
          dateFrancaise(session.creeLe),
          dateFrancaise(session.prolongeeLe),
          session.adresseIp ?? NON_ENREGISTRE,
          session.agentUtilisateur ?? NON_ENREGISTRE,
          session.courante ? (
            CET_APPAREIL
          ) : (
            <Bouton
              key="fermer"
              libelle={FERMER_CETTE_SESSION}
              nom={nomFermerLaSession(session.creeLe)}
              raison={props.raison}
              surActivation={() => props.ouvrir({ sorte: "une", session })}
            />
          ),
        ],
      }))}
    />
  );
}
