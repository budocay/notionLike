// Zone de synchronisation, à côté de la zone de compte (F-013-AC31) : un état et un seul de la liste
// fermée, annoncé sans déplacer le focus et jamais porté par la seule couleur, et ses actions. Elle
// ne dit jamais que le serveur a enregistré quoi que ce soit (AC32), ni, pendant une coupure de la
// persistance, que les modifications restent sur cet appareil (AC48).
import { type ReactElement, useEffect, useRef, useState } from "react";

import type {
  DocumentEnErreur,
  EtatDeSynchronisation,
  Synchronisation,
} from "../synchronisation/index.ts";
import { AdoptionDeLEspace } from "./AdoptionDeLEspace.tsx";
import { ActionDeCompte, CadreDeCompte } from "./composants/Compte.tsx";
import { Bouton } from "./composants/Espaces.tsx";
import { EffacementDeLaCopie } from "./EffacementDeLaCopie.tsx";
import {
  COPIE_DIVERGENTE,
  DEMANDE_UNE_CONNEXION_AU_SERVEUR,
  DETACHE_CAUSE,
  DETACHE_PAGES_RESTENT,
  DETACHE_PLUS_PARTAGE,
  DETACHE_PLUS_PARTAGE_SEUL,
  DOCUMENT_D_ESPACE,
  DROIT_DEVENU_ECRITURE,
  DROIT_DEVENU_LECTURE,
  EFFACER_LA_COPIE_LOCALE,
  HORS_LIGNE_SANS_STOCKAGE,
  LECTURE_SEULE,
  NOM_DE_LA_ZONE_DE_SYNCHRONISATION,
  PAGES_CONCERNEES,
  REESSAYER,
  REFUS_DE_CONNEXION,
  SUGGESTION_ONGLETS,
  SYNCHRONISER_CET_ESPACE,
  texteDUneErreur,
  TITRES_DES_ETATS,
  TRANSMISES,
  TRANSMISES_SANS_STOCKAGE,
} from "./messages-synchronisation.ts";
import { titreEntreGuillemets } from "./messages.ts";

export interface ProprietesZoneDeSynchronisation {
  readonly synchro: Synchronisation;
  readonly etat: EtatDeSynchronisation;
  /** Le titre d'une page de l'espace ; `undefined` : le document d'espace. */
  readonly titreDe: (idPage: string | undefined) => string;
  /** Pages de l'arborescence et de la corbeille : la confirmation de l'effacement les cite. */
  readonly nombreDePages: number;
  /** Faux pendant une coupure de la persistance d'un document de l'espace ouvert (F-030). */
  readonly stockageDisponible: boolean;
  /** Ferme la session et les pages de l'onglet avant l'effacement de leurs bases (AC24). */
  readonly avantLEffacement: () => void;
}

type Boite = "adoption" | "effacement" | undefined;

export function ZoneDeSynchronisation(props: ProprietesZoneDeSynchronisation): ReactElement {
  const [boite, setBoite] = useState<Boite>(undefined);
  const [annonce, setAnnonce] = useState<string | undefined>(undefined);
  const origine = useRef<HTMLElement | null>(null);
  const enLigne = useEnLigne();
  const ouvrir = (laquelle: Boite): void => {
    origine.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setBoite(laquelle);
  };
  const fermer = (): void => {
    setBoite(undefined);
    queueMicrotask(() => origine.current?.focus());
  };
  return (
    <>
      <CadreDeCompte
        nom={NOM_DE_LA_ZONE_DE_SYNCHRONISATION}
        phrases={[...phrasesDeLEtat(props), ...(annonce === undefined ? [] : [annonce])]}
      >
        <Actions {...props} enLigne={enLigne} ouvrir={ouvrir} />
      </CadreDeCompte>
      {boite === "adoption" && (
        <AdoptionDeLEspace
          adopter={props.synchro.adopter}
          fermer={fermer}
          surAdoption={(texte) => {
            setAnnonce(texte);
            setBoite(undefined);
          }}
        />
      )}
      {boite === "effacement" && (
        <EffacementDeLaCopie
          pages={props.nombreDePages}
          fermer={fermer}
          effacer={async () => {
            props.avantLEffacement();
            return props.synchro.effacerLaCopieLocale();
          }}
        />
      )}
    </>
  );
}

function useEnLigne(): boolean {
  const [enLigne, setEnLigne] = useState(() => navigator.onLine);
  useEffect(() => {
    const suivre = (): void => setEnLigne(navigator.onLine);
    window.addEventListener("online", suivre);
    window.addEventListener("offline", suivre);
    return () => {
      window.removeEventListener("online", suivre);
      window.removeEventListener("offline", suivre);
    };
  }, []);
  return enLigne;
}

function phrasesDuDetachement(stockage: boolean): string[] {
  return stockage
    ? [`${DETACHE_CAUSE} ${DETACHE_PAGES_RESTENT} ${DETACHE_PLUS_PARTAGE}`]
    : [`${DETACHE_CAUSE} ${DETACHE_PLUS_PARTAGE_SEUL}`];
}

function phrasesDesErreurs(props: ProprietesZoneDeSynchronisation): string[] {
  const { etat, titreDe, stockageDisponible } = props;
  const phrases: string[] = [TITRES_DES_ETATS.erreur];
  if (etat.refusDeConnexion && etat.compte === "connecte") {
    phrases.push(REFUS_DE_CONNEXION, SUGGESTION_ONGLETS);
  }
  for (const erreur of etat.documentsEnErreur) {
    phrases.push(texteDUneErreur(erreur.cause, titreDe(erreur.idPage), stockageDisponible));
  }
  if (etat.divergentes.length > 0) {
    const titres = etat.divergentes.map((idPage) =>
      idPage === undefined ? DOCUMENT_D_ESPACE : titreEntreGuillemets(titreDe(idPage)),
    );
    phrases.push(COPIE_DIVERGENTE, `${PAGES_CONCERNEES} ${titres.join(", ")}`);
  }
  return phrases;
}

function phrasesPrincipales(props: ProprietesZoneDeSynchronisation): string[] {
  const { etat, stockageDisponible } = props;
  switch (etat.affiche) {
    case "detache":
      return phrasesDuDetachement(stockageDisponible);
    case "erreur":
      return phrasesDesErreurs(props);
    case "hors-ligne":
      return [stockageDisponible ? TITRES_DES_ETATS["hors-ligne"] : HORS_LIGNE_SANS_STOCKAGE];
    case "synchronise":
      return [
        TITRES_DES_ETATS.synchronise,
        stockageDisponible ? TRANSMISES : TRANSMISES_SANS_STOCKAGE,
      ];
    default:
      return [TITRES_DES_ETATS[etat.affiche]];
  }
}

/** Les phrases de la zone : l'état affiché, puis le droit et son changement (AC25, AC26). */
export function phrasesDeLEtat(props: ProprietesZoneDeSynchronisation): string[] {
  const { etat } = props;
  const phrases = phrasesPrincipales(props);
  if (etat.rattachement === "adopte" && etat.droit === "lecture") {
    phrases.push(LECTURE_SEULE);
  }
  if (etat.droitChange !== undefined) {
    phrases.push(etat.droitChange === "lecture" ? DROIT_DEVENU_LECTURE : DROIT_DEVENU_ECRITURE);
  }
  return phrases;
}

interface ProprietesActions extends ProprietesZoneDeSynchronisation {
  readonly enLigne: boolean;
  readonly ouvrir: (boite: Boite) => void;
}

function adoption(props: ProprietesActions): ReactElement[] {
  const { etat } = props;
  if (etat.affiche !== "local" || etat.compte !== "connecte" || !etat.registreLu) {
    return [];
  }
  return [
    <Bouton
      key="adopter"
      libelle={SYNCHRONISER_CET_ESPACE}
      raison={props.enLigne ? undefined : DEMANDE_UNE_CONNEXION_AU_SERVEUR}
      surActivation={() => props.ouvrir("adoption")}
    />,
  ];
}

function reprise(props: ProprietesActions): ReactElement[] {
  const { etat } = props;
  const refus = etat.refusDeConnexion && etat.compte === "connecte";
  return etat.detache || refus
    ? [
        <ActionDeCompte
          key="reessayer"
          libelle={REESSAYER}
          surActivation={props.synchro.reessayer}
        />,
      ]
    : [];
}

function effacement(props: ProprietesActions): ReactElement[] {
  const { etat } = props;
  return etat.detache || etat.divergentes.length > 0
    ? [
        <ActionDeCompte
          key="effacer"
          libelle={EFFACER_LA_COPIE_LOCALE}
          surActivation={() => props.ouvrir("effacement")}
        />,
      ]
    : [];
}

function Actions(props: ProprietesActions): ReactElement | null {
  const actions = [
    ...adoption(props),
    ...reprise(props),
    ...actionsDesDocuments(props.etat.documentsEnErreur, props),
    ...effacement(props),
  ];
  return actions.length === 0 ? null : <>{actions}</>;
}

function actionsDesDocuments(
  erreurs: readonly DocumentEnErreur[],
  props: ProprietesZoneDeSynchronisation,
): ReactElement[] {
  return erreurs
    .filter((erreur) => erreur.reessayable)
    .map((erreur) => (
      <Bouton
        key={`reessayer:${erreur.idPage ?? ""}`}
        libelle={REESSAYER}
        nom={`${REESSAYER} : ${titreEntreGuillemets(props.titreDe(erreur.idPage))}`}
        surActivation={() => props.synchro.reessayerLeDocument(erreur.idPage)}
      />
    ));
}
