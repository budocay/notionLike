// Zone de compte, dans la tête de la barre latérale (F-010) : l'état du compte, annoncé sans déplacer le
// focus, et ses actions. Elle n'exige rien : l'espace local reste utilisable dans les trois états.
import { type ReactElement, useRef, useState, useSyncExternalStore } from "react";

import type { Compte, EtatDuCompte } from "../compte/index.ts";
import { fragmentDe } from "../navigation/route.ts";
import { ActionDeCompte, CadreDeCompte } from "./composants/Compte.tsx";
import {
  COMPTE_INDISPONIBLE,
  CONNECTE_EN_TANT_QUE,
  CREER_UN_COMPTE,
  DECONNEXION_CONFIRMEE,
  DECONNEXION_DEMANDE_LE_SERVEUR,
  DECONNEXION_EN_COURS,
  DECONNEXION_NON_CONFIRMEE,
  NOM_DE_LA_ZONE_DE_COMPTE,
  NON_CONNECTE,
  REESSAYER,
  REESSAYER_LA_DECONNEXION,
  SE_CONNECTER,
  SE_DECONNECTER,
  VERIFICATION_DU_COMPTE,
  VOS_PAGES_RESTENT,
} from "./messages-compte.ts";

type Deconnexion = "repos" | "en-cours" | "confirmee" | "non-confirmee" | "hors-ligne";

export function ZoneDeCompte({ compte }: { readonly compte: Compte }): ReactElement {
  const etat = useSyncExternalStore(compte.suivi.abonner, compte.suivi.lire);
  const { deconnexion, seDeconnecter } = useDeconnexion(compte);
  return (
    <CadreDeCompte
      nom={NOM_DE_LA_ZONE_DE_COMPTE}
      phrases={[texteDeLEtat(etat), ...phrasesDeLaDeconnexion(deconnexion, etat)]}
    >
      {actions(etat, deconnexion, seDeconnecter, () => void compte.suivi.reverifier())}
    </CadreDeCompte>
  );
}

// Le nom vient du serveur : il est rendu comme du texte, jamais interprété (F-010-AC18).
function texteDeLEtat(etat: EtatDuCompte): string {
  switch (etat.statut) {
    case "inconnu":
      return etat.verification ? VERIFICATION_DU_COMPTE : COMPTE_INDISPONIBLE;
    case "deconnecte":
      return NON_CONNECTE;
    case "connecte":
      return `${CONNECTE_EN_TANT_QUE} ${etat.nom}`;
  }
}

/** Une déconnexion n'est annoncée que si `moi` l'a confirmée par un 401 (F-010-AC12, AC13). */
function phrasesDeLaDeconnexion(deconnexion: Deconnexion, etat: EtatDuCompte): string[] {
  const deconnecte = etat.statut === "deconnecte";
  switch (deconnexion) {
    case "en-cours":
      return [DECONNEXION_EN_COURS];
    case "confirmee":
      return deconnecte ? [DECONNEXION_CONFIRMEE, VOS_PAGES_RESTENT] : [];
    case "non-confirmee":
      return deconnecte ? [] : [DECONNEXION_NON_CONFIRMEE];
    case "hors-ligne":
      return deconnecte ? [] : [DECONNEXION_NON_CONFIRMEE, DECONNEXION_DEMANDE_LE_SERVEUR];
    case "repos":
      return [];
  }
}

function useDeconnexion(compte: Compte): {
  readonly deconnexion: Deconnexion;
  readonly seDeconnecter: () => void;
} {
  const [deconnexion, setDeconnexion] = useState<Deconnexion>("repos");
  const enCours = useRef(false);
  const seDeconnecter = async (): Promise<void> => {
    if (enCours.current) {
      return;
    }
    enCours.current = true;
    setDeconnexion("en-cours");
    const resultat = await compte.client.deconnecter();
    const etat = resultat.ok ? await compte.suivi.reverifier() : undefined;
    enCours.current = false;
    if (etat?.statut === "deconnecte") {
      setDeconnexion("confirmee");
    } else {
      const horsLigne = !resultat.ok && resultat.erreur.type === "hors-ligne";
      setDeconnexion(horsLigne ? "hors-ligne" : "non-confirmee");
    }
  };
  return { deconnexion, seDeconnecter: () => void seDeconnecter() };
}

/** Actions offertes dans chaque état ; aucune pendant la première vérification. */
function actions(
  etat: EtatDuCompte,
  deconnexion: Deconnexion,
  seDeconnecter: () => void,
  reessayer: () => void,
): ReactElement | undefined {
  switch (etat.statut) {
    case "inconnu":
      return etat.verification ? undefined : (
        <ActionDeCompte libelle={REESSAYER} surActivation={reessayer} />
      );
    case "deconnecte":
      return (
        <>
          <ActionDeCompte libelle={SE_CONNECTER} adresse={fragmentDe({ forme: "connexion" })} />
          <ActionDeCompte
            libelle={CREER_UN_COMPTE}
            adresse={fragmentDe({ forme: "inscription" })}
          />
        </>
      );
    case "connecte":
      return (
        <ActionDeCompte
          libelle={
            deconnexion === "non-confirmee" || deconnexion === "hors-ligne"
              ? REESSAYER_LA_DECONNEXION
              : SE_DECONNECTER
          }
          desactivee={deconnexion === "en-cours"}
          surActivation={seDeconnecter}
        />
      );
  }
}
