// Écran d'invitation, `#/invitation` (F-014-AC21 à AC25) : le jeton reçu par l'adresse n'est tenu
// qu'en mémoire, et n'est envoyé que dans le corps de l'acceptation, sur un geste explicite. Aucune
// requête ne part du seul fait de l'ouverture.
import { type ReactElement, useEffect, useState, useSyncExternalStore } from "react";

import type { Compte, EspaceLu, ErreurDEspaces, EtatDuCompte } from "../compte/index.ts";
import { allerA, allerAuRetour } from "../navigation/fragment.ts";
import { type Destination, fragmentDEcran } from "../navigation/route.ts";
import {
  Actions,
  Alerte,
  Annonce,
  Bouton,
  EcranDEspaces,
  Lien,
  Texte,
} from "./composants/Espaces.tsx";
import { espaceRejoint } from "./messages.ts";
import { CREER_UN_COMPTE, SE_CONNECTER, VERIFICATION_DU_COMPTE } from "./messages-compte.ts";
import {
  ACCEPTATION_DEMANDE_LE_SERVEUR,
  ACCEPTATION_EN_COURS,
  DEJA_MEMBRE,
  ESPACE_COMPLET,
  IGNORER,
  IL_FAUT_UN_COMPTE,
  INVITATION_INVALIDE,
  invitationRecue,
  libelleDuRole,
  REESSAYER,
  REJOINDRE_L_ESPACE,
  REQUETE_EN_COURS,
  ROUVREZ_LE_LIEN,
  texteDEchec,
  TITRE_INVITATION,
  VOIR_CET_ESPACE,
  VOIR_LES_ESPACES,
} from "./messages-espaces.ts";
import type { NavigationDeLEspace } from "./navigation-espaces.ts";
import { codeDe, useVerrou } from "./outils-espaces.ts";

/** Issue d'une acceptation, une fois le jeton effacé. */
type Issue =
  | { readonly sorte: "rejoint"; readonly espace: EspaceLu }
  | { readonly sorte: "invalide" }
  | { readonly sorte: "deja-membre" };

const MS_PAR_SECONDE = 1000;

export function EcranDInvitation(props: {
  readonly compte: Compte;
  readonly navigation: NavigationDeLEspace;
}): ReactElement {
  const { compte, navigation } = props;
  const etat = useSyncExternalStore(compte.suivi.abonner, compte.suivi.lire);
  const [issue, setIssue] = useState<Issue | undefined>(undefined);
  const { invitation } = navigation;
  return (
    <EcranDEspaces titre={TITRE_INVITATION}>
      {issue !== undefined ? (
        <IssueDeLAcceptation issue={issue} />
      ) : invitation.statut === "jeton" ? (
        <Proposition
          compte={compte}
          etat={etat}
          jeton={invitation.jeton}
          navigation={navigation}
          conclure={setIssue}
        />
      ) : (
        <Alerte
          phrases={[invitation.statut === "invalide" ? INVITATION_INVALIDE : ROUVREZ_LE_LIEN]}
        />
      )}
    </EcranDEspaces>
  );
}

function IssueDeLAcceptation({ issue }: { readonly issue: Issue }): ReactElement {
  switch (issue.sorte) {
    case "rejoint":
      return (
        <>
          <Annonce texte={espaceRejoint(issue.espace.nom, libelleDuRole(issue.espace.role))} />
          <Actions>
            <Lien
              libelle={VOIR_CET_ESPACE}
              adresse={fragmentDEcran({ ecran: "espace", idEspace: issue.espace.idEspace })}
            />
          </Actions>
        </>
      );
    case "invalide":
      return <Alerte phrases={[INVITATION_INVALIDE]} />;
    case "deja-membre":
      return (
        <>
          <Alerte phrases={[DEJA_MEMBRE]} />
          <Actions>
            <Lien libelle={VOIR_LES_ESPACES} adresse={fragmentDEcran({ ecran: "espaces" })} />
          </Actions>
        </>
      );
  }
}

interface ProprietesProposition {
  readonly compte: Compte;
  readonly etat: EtatDuCompte;
  readonly jeton: string;
  readonly navigation: NavigationDeLEspace;
  readonly conclure: (issue: Issue) => void;
}

/** « Ignorer » efface le jeton et revient à l'application, sans requête (F-014-AC22). */
function ignorer(navigation: NavigationDeLEspace): void {
  navigation.effacerLInvitation();
  allerAuRetour(navigation.application);
}

/** Détour par un écran de compte : la destination de retour est l'écran d'invitation (AC41). */
function detour(navigation: NavigationDeLEspace, forme: "connexion" | "inscription"): void {
  const destination: Destination = "invitation";
  navigation.poserLaDestination(destination);
  allerA({ forme });
}

function Proposition(props: ProprietesProposition): ReactElement {
  const { etat, navigation } = props;
  switch (etat.statut) {
    case "connecte":
      return <Acceptation {...props} nomDuCompte={etat.nom} />;
    case "deconnecte":
      return (
        <>
          <Texte>{IL_FAUT_UN_COMPTE}</Texte>
          <Actions>
            <Bouton libelle={SE_CONNECTER} surActivation={() => detour(navigation, "connexion")} />
            <Bouton
              libelle={CREER_UN_COMPTE}
              surActivation={() => detour(navigation, "inscription")}
            />
            <Bouton libelle={IGNORER} surActivation={() => ignorer(navigation)} />
          </Actions>
        </>
      );
    case "inconnu":
      return etat.verification ? (
        <Texte>{VERIFICATION_DU_COMPTE}</Texte>
      ) : (
        <>
          <Texte>{ACCEPTATION_DEMANDE_LE_SERVEUR}</Texte>
          <Actions>
            <Bouton
              libelle={REESSAYER}
              surActivation={() => void props.compte.suivi.reverifier()}
            />
            <Bouton libelle={IGNORER} surActivation={() => ignorer(navigation)} />
          </Actions>
        </>
      );
  }
}

function Acceptation(
  props: ProprietesProposition & { readonly nomDuCompte: string },
): ReactElement {
  const { compte, navigation, conclure } = props;
  const verrou = useVerrou();
  const [echec, setEchec] = useState<ErreurDEspaces | undefined>(undefined);
  const bloque = useBlocage(echec);
  const rejoindre = async (): Promise<void> => {
    if (bloque) {
      return;
    }
    setEchec(undefined);
    const resultat = await verrou.executer(() =>
      compte.espaces.accepterInvitation({ jeton: props.jeton }),
    );
    if (resultat === undefined) {
      return;
    }
    if (resultat.ok) {
      navigation.effacerLInvitation();
      conclure({ sorte: "rejoint", espace: resultat.valeur });
      return;
    }
    traiterLeRefus(resultat.erreur, codeDe(resultat), props, setEchec);
  };
  return (
    <>
      <Texte>{invitationRecue(props.nomDuCompte)}</Texte>
      <Annonce texte={verrou.occupe ? ACCEPTATION_EN_COURS : ""} />
      {echec !== undefined && <Alerte phrases={texteDuRefus(echec)} />}
      <Actions>
        <Bouton
          libelle={REJOINDRE_L_ESPACE}
          raison={verrou.occupe ? REQUETE_EN_COURS : undefined}
          desactive={bloque}
          surActivation={() => void rejoindre()}
        />
        <Bouton libelle={IGNORER} surActivation={() => ignorer(navigation)} />
      </Actions>
    </>
  );
}

/** Effacer le jeton pour un lien mort ou un membre déjà là ; le garder pour un nouvel essai. */
function traiterLeRefus(
  erreur: ErreurDEspaces,
  code: string | undefined,
  props: ProprietesProposition,
  setEchec: (erreur: ErreurDEspaces) => void,
): void {
  if (code === "invitation-invalide" || code === "deja-membre") {
    props.navigation.effacerLInvitation();
    props.conclure({ sorte: code === "deja-membre" ? "deja-membre" : "invalide" });
    return;
  }
  if (code === "non-authentifie") {
    // L'état du compte est revérifié : déconnecté, l'écran propose la connexion (F-014-AC22).
    void props.compte.suivi.reverifier();
    return;
  }
  setEchec(erreur);
}

function texteDuRefus(erreur: ErreurDEspaces): readonly string[] {
  return erreur.type === "enveloppe" && erreur.code === "quota-atteint"
    ? [ESPACE_COMPLET]
    : texteDEchec(erreur);
}

/** Envoi désactivé pendant le délai qu'un 429 impose (F-010-AC15, F-014-AC24). */
function useBlocage(echec: ErreurDEspaces | undefined): boolean {
  const [bloque, setBloque] = useState(false);
  useEffect(() => {
    if (echec?.type !== "trop-de-requetes") {
      return undefined;
    }
    setBloque(true);
    const minuterie = setTimeout(() => setBloque(false), echec.delaiSecondes * MS_PAR_SECONDE);
    return () => clearTimeout(minuterie);
  }, [echec]);
  return bloque;
}
