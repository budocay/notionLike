// État de l'écran d'un espace (F-014-AC9 à AC20, AC28, AC32) : l'espace et le rôle que le serveur
// a donnés en dernier, ses membres et ses invitations, relus après chaque action réussie et au
// retour de l'onglet, jamais conservés. Le serveur reste seul juge : aucune action n'est tenue pour
// faite avant sa réponse.
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  Compte,
  ErreurDEspaces,
  EspaceLu,
  InvitationLue,
  MembreLu,
  Resultat,
} from "../compte/index.ts";
import { peut } from "./commandes-espaces.ts";
import {
  PLUS_ACCESSIBLE,
  PLUS_LE_DROIT,
  REQUETE_EN_COURS,
  SERVEUR_INJOIGNABLE_RAISON,
  texteDEchec,
} from "./messages-espaces.ts";
import { useRelectureAuRetour, useVerrou, type Verrou, type Sortie } from "./outils-espaces.ts";

/** Textes propres au contexte d'une action, par code : ils prennent le pas sur la table. */
export type TextesPropres = Readonly<Partial<Record<string, string>>>;

export interface ContexteDEspace {
  readonly compte: Compte;
  readonly idEspace: string;
  readonly espace: EspaceLu;
  /** Identifiant du compte courant, tel que `GET /api/v1/moi` l'a donné. */
  readonly moi: string;
  readonly membres: readonly MembreLu[] | undefined;
  readonly invitations: readonly InvitationLue[] | undefined;
  /** La dernière lecture des membres, des invitations, a échoué : l'écran le dit et propose de relire. */
  readonly echecDesMembres: boolean;
  readonly echecDesInvitations: boolean;
  readonly verrou: Verrou;
  /** Raison d'une action permise mais momentanément impossible (F-014-AC29). */
  readonly raison: string | undefined;
  readonly annoncer: (texte: string) => void;
  readonly alerter: (phrases: readonly string[]) => void;
  /** Échec d'une action : texte propre, sinon F-014-AC28, sinon la table des codes. */
  readonly echouer: (erreur: ErreurDEspaces, propres?: TextesPropres) => void;
  readonly relireTout: () => void;
  readonly relireInvitations: () => void;
  readonly revenirALaListe: (sortie: Sortie) => void;
  readonly tableauDesMembres: RefObject<HTMLTableElement | null>;
  readonly tableauDesInvitations: RefObject<HTMLTableElement | null>;
}

export interface EtatDeLEcran {
  readonly contexte: ContexteDEspace | undefined;
  readonly annonce: string | undefined;
  readonly alerte: readonly string[] | undefined;
  /** Échec de la première lecture, quand l'espace n'a pas encore pu être lu. */
  readonly echecDeLecture: ErreurDEspaces | undefined;
  /** Le dernier appel a échoué par le réseau : les actions attendent une relecture réussie. */
  readonly horsLigne: boolean;
  readonly relireTout: () => void;
}

interface Lectures {
  readonly espace: EspaceLu | undefined;
  readonly membres: readonly MembreLu[] | undefined;
  readonly invitations: readonly InvitationLue[] | undefined;
  readonly echec: ErreurDEspaces | undefined;
  readonly echecDesMembres: boolean;
  readonly echecDesInvitations: boolean;
  readonly horsLigne: boolean;
}

const RIEN: Lectures = {
  espace: undefined,
  membres: undefined,
  invitations: undefined,
  echec: undefined,
  echecDesMembres: false,
  echecDesInvitations: false,
  horsLigne: false,
};

/** Raison d'une action désactivée (F-014-AC29) : une requête en cours, ou le serveur injoignable. */
function raisonDe(occupe: boolean, horsLigne: boolean): string | undefined {
  if (occupe) {
    return REQUETE_EN_COURS;
  }
  return horsLigne ? SERVEUR_INJOIGNABLE_RAISON : undefined;
}

export function useEcranDUnEspace(
  compte: Compte,
  idEspace: string,
  moi: string | undefined,
  revenirALaListe: (sortie: Sortie) => void,
): EtatDeLEcran {
  const [lectures, setLectures] = useState<Lectures>(RIEN);
  const messages = useMessages();
  const verrou = useVerrou();
  const tableauDesMembres = useRef<HTMLTableElement>(null);
  const tableauDesInvitations = useRef<HTMLTableElement>(null);
  const traiter = useTraitement(compte, revenirALaListe, messages.alerter);
  const relire = useRelecture(compte, idEspace, setLectures, traiter);
  useRelireQuandConnecte(moi, relire.tout);
  const contexte: ContexteDEspace | undefined =
    lectures.espace === undefined || moi === undefined
      ? undefined
      : {
          compte,
          idEspace,
          espace: lectures.espace,
          moi,
          membres: lectures.membres,
          invitations: lectures.invitations,
          echecDesMembres: lectures.echecDesMembres,
          echecDesInvitations: lectures.echecDesInvitations,
          verrou,
          raison: raisonDe(verrou.occupe, lectures.horsLigne),
          annoncer: messages.annoncer,
          alerter: messages.alerter,
          echouer: (erreur, propres = {}) => {
            setLectures((avant) => ({ ...avant, horsLigne: erreur.type === "hors-ligne" }));
            traiter(erreur, propres, relire.espace);
          },
          relireTout: relire.tout,
          relireInvitations: relire.invitations,
          revenirALaListe,
          tableauDesMembres,
          tableauDesInvitations,
        };
  return {
    contexte,
    annonce: messages.annonce,
    alerte: messages.alerte,
    echecDeLecture: lectures.espace === undefined ? lectures.echec : undefined,
    horsLigne: lectures.horsLigne,
    relireTout: relire.tout,
  };
}

/** Une annonce ou une alerte à la fois : la dernière issue d'une action. */
function useMessages(): {
  readonly annonce: string | undefined;
  readonly alerte: readonly string[] | undefined;
  readonly annoncer: (texte: string) => void;
  readonly alerter: (phrases: readonly string[]) => void;
} {
  const [annonce, setAnnonce] = useState<string | undefined>(undefined);
  const [alerte, setAlerte] = useState<readonly string[] | undefined>(undefined);
  const annoncer = useCallback((texte: string) => {
    setAlerte(undefined);
    setAnnonce(texte);
  }, []);
  const alerter = useCallback((phrases: readonly string[]) => {
    setAnnonce(undefined);
    setAlerte(phrases);
  }, []);
  return { annonce, alerte, annoncer, alerter };
}

/** Lecture à l'ouverture, une fois le compte connu, et au retour de l'onglet (F-014-AC32). */
function useRelireQuandConnecte(moi: string | undefined, relire: () => void): void {
  useEffect(() => {
    if (moi !== undefined) {
      relire();
    }
  }, [moi, relire]);
  useRelectureAuRetour(() => {
    if (moi !== undefined) {
      relire();
    }
  });
}

type Traiter = (erreur: ErreurDEspaces, propres: TextesPropres, relireLEspace: () => void) => void;

/** F-014-AC28 : 404 renvoie à la liste sans rien dire de plus ; 403 relit le rôle ; 401 le compte. */
function useTraitement(
  compte: Compte,
  revenirALaListe: (sortie: Sortie) => void,
  alerter: (phrases: readonly string[]) => void,
): Traiter {
  return useCallback(
    (erreur, propres, relireLEspace) => {
      const code = erreur.type === "enveloppe" ? erreur.code : undefined;
      const propre = code === undefined ? undefined : propres[code];
      if (propre !== undefined) {
        alerter([propre]);
      } else if (code === "ressource-introuvable") {
        revenirALaListe({ annonce: undefined, alerte: PLUS_ACCESSIBLE });
      } else if (code === "acces-refuse") {
        alerter([PLUS_LE_DROIT]);
        relireLEspace();
      } else {
        alerter(texteDEchec(erreur));
        if (code === "non-authentifie") {
          void compte.suivi.reverifier();
        }
      }
    },
    [compte, revenirALaListe, alerter],
  );
}

interface Relecture {
  readonly tout: () => void;
  readonly espace: () => void;
  readonly invitations: () => void;
}

function useRelecture(
  compte: Compte,
  idEspace: string,
  setLectures: (maj: (avant: Lectures) => Lectures) => void,
  traiter: Traiter,
): Relecture {
  return useMemo(
    () => relectures(compte, idEspace, setLectures, traiter),
    [compte, idEspace, setLectures, traiter],
  );
}

function relectures(
  compte: Compte,
  idEspace: string,
  setLectures: (maj: (avant: Lectures) => Lectures) => void,
  traiter: Traiter,
): Relecture {
  // Un échec de lecture est dit comme celui d'une action ; tant que l'espace n'a pas été lu,
  // l'écran le montre à la place de l'espace, avec « Réessayer ». Un 403 sur une lecture ne
  // relance pas de lecture : une seule relecture suit un refus (pas de boucle).
  const echouer = (erreur: ErreurDEspaces, siEchec: Partial<Lectures>): void => {
    setLectures((avant) => ({
      ...avant,
      ...siEchec,
      echec: erreur,
      horsLigne: erreur.type === "hors-ligne",
    }));
    traiter(erreur, {}, () => undefined);
  };
  const lire = lecteur(setLectures, echouer);
  const lireLEspace = (): Promise<EspaceLu | undefined> =>
    lire(
      () => compte.espaces.lireEspace(idEspace),
      (espace) => ({ espace, echec: undefined }),
      {},
    );
  const lireInvitations = (): void =>
    void lire(
      () => compte.espaces.listerInvitations(idEspace),
      (invitations) => ({ invitations, echecDesInvitations: false }),
      { echecDesInvitations: true },
    );
  const tout = async (): Promise<void> => {
    const espace = await lireLEspace();
    if (espace === undefined) {
      return;
    }
    void lire(
      () => compte.espaces.listerMembres(idEspace),
      (membres) => ({ membres, echecDesMembres: false }),
      { echecDesMembres: true },
    );
    if (peut(espace.role, "voir-invitations")) {
      lireInvitations();
    } else {
      setLectures((avant) => ({ ...avant, invitations: undefined }));
    }
  };
  return {
    tout: () => void tout(),
    espace: () => void lireLEspace(),
    invitations: lireInvitations,
  };
}

type Lire = <T>(
  appel: () => Promise<Resultat<T>>,
  poser: (valeur: T) => Partial<Lectures>,
  siEchec: Partial<Lectures>,
) => Promise<T | undefined>;

/** Une lecture : sa valeur posée dans l'état, ou son échec dit ; rien ne lève. */
function lecteur(
  setLectures: (maj: (avant: Lectures) => Lectures) => void,
  echouer: (erreur: ErreurDEspaces, siEchec: Partial<Lectures>) => void,
): Lire {
  return async (appel, poser, siEchec) => {
    const resultat = await appel();
    if (!resultat.ok) {
      echouer(resultat.erreur, siEchec);
      return undefined;
    }
    setLectures((avant) => ({ ...avant, ...poser(resultat.valeur), horsLigne: false }));
    return resultat.valeur;
  };
}
