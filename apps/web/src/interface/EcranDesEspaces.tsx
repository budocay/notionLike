// Écran des espaces, `#/espaces` (F-014-AC1, AC2, AC7, AC8, AC42) : l'espace de l'appareil à part,
// puis les espaces du serveur dont le compte est membre, lus à chaque ouverture et jamais conservés
// (H10). Sans compte connecté ou sans serveur, seuls les espaces de l'appareil sont montrés, sans
// écran bloquant : la coquille reste utilisable. Avec le pilote de l'onglet (F-032-AC1, AC2), trois
// parties : l'espace de l'appareil, les autres espaces de l'appareil, et les espaces du serveur que
// l'appareil ne détient pas, chacun ouvrable dans l'éditeur ; la mention « Les espaces du serveur ne
// s'ouvrent pas encore dans l'éditeur. » de F-014-AC1 a disparu (amendement de F-014-AC1, F-032 H10).
import {
  type ReactElement,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { Compte, EspaceLu, ErreurDEspaces, EtatDuCompte } from "../compte/index.ts";
import { estUnNomDEspace } from "../compte/regles-espaces.ts";
import { tirerIdentifiantDEspace } from "../espace/identifiant-d-espace.ts";
import { allerALEcran } from "../navigation/fragment.ts";
import { fragmentDEcran } from "../navigation/route.ts";
import { type AjoutALAppareil, useAjoutALAppareil } from "./ajout-a-l-appareil.ts";
import { type AppareilLu, cibleSurLAppareil, useAppareilDesEcrans } from "./appareil-des-ecrans.ts";
import { peut } from "./commandes-espaces.ts";
import { ChampDeCompte } from "./composants/Compte.tsx";
import {
  Actions,
  Alerte,
  Annonce,
  Bouton,
  EcranDEspaces,
  Formulaire,
  Lien,
  Partie,
  Tableau,
  Texte,
} from "./composants/Espaces.tsx";
import { MARQUE_OBLIGATOIRE } from "./messages-compte.ts";
import {
  ANNULER,
  AUCUN_ESPACE_DU_SERVEUR,
  CET_APPAREIL,
  CHARGEMENT_DES_ESPACES,
  COLONNE_NOM,
  COLONNE_ROLE,
  CONNECTEZ_VOUS,
  CONTEXTE_NON_SECURISE_POUR_CREER,
  CREER_L_ESPACE,
  DEMANDE_UNE_CONNEXION,
  ECHEC_GENERIQUE,
  ESPACE_COURANT,
  ESPACE_DE_CET_APPAREIL,
  ESPACES_DU_SERVEUR,
  ETIQUETTE_NOM_D_ESPACE,
  libelleDuRole,
  nomOuvrirEspace,
  NOUVEL_ESPACE,
  QUOTA_D_ESPACES,
  REESSAYER,
  REGLE_DU_NOM,
  REQUETE_EN_COURS,
  texteDEchec,
  TITRE_DES_ESPACES,
  VERIFICATION_EN_COURS,
} from "./messages-espaces.ts";
import { PartiesDeLAppareil, RangeesDuServeur, type ServeurLu } from "./EspacesDeLAppareil.tsx";
import {
  codeDe,
  useRelectureAuRetour,
  useVerrou,
  type Sortie,
  toucheDAbandon,
} from "./outils-espaces.ts";

type Liste =
  | { readonly statut: "attente" }
  | { readonly statut: "pret"; readonly espaces: readonly EspaceLu[] }
  | { readonly statut: "echec"; readonly erreur: ErreurDEspaces };

const ATTENTE: Liste = { statut: "attente" };

export function EcranDesEspaces(props: {
  readonly compte: Compte;
  readonly sortie: Sortie;
}): ReactElement {
  const { compte, sortie } = props;
  const etat = useSyncExternalStore(compte.suivi.abonner, compte.suivi.lire);
  const liste = useListeDesEspaces(compte, etat.statut === "connecte");
  const raison = raisonDeLEtat(etat, liste);
  const appareil = useAppareilDesEcrans();
  const ajout = useAjoutALAppareil({ compte, surIntrouvable: liste.relire });
  return (
    <EcranDEspaces titre={TITRE_DES_ESPACES}>
      <Annonce texte={sortie.annonce ?? ""} />
      {sortie.alerte !== undefined && <Alerte phrases={[sortie.alerte]} />}
      {ajout.alerte !== undefined && <Alerte phrases={ajout.alerte} />}
      {appareil === undefined ? (
        <Partie titre={ESPACE_DE_CET_APPAREIL}>
          <Texte>{`${CET_APPAREIL} — ${ESPACE_COURANT}`}</Texte>
        </Partie>
      ) : (
        <PartiesDeLAppareil appareil={appareil} serveur={serveurLu(etat, liste.liste)} />
      )}
      <Partie titre={ESPACES_DU_SERVEUR}>
        <ContenuDuServeur
          etat={etat}
          liste={liste.liste}
          relire={liste.relire}
          appareil={appareil}
          ajout={ajout}
        />
        <Creation compte={compte} raison={raison} />
      </Partie>
    </EcranDEspaces>
  );
}

/** La liste du serveur par identifiant, seulement compte connecté et liste lue (F-032-AC26). */
function serveurLu(etat: EtatDuCompte, liste: Liste): ServeurLu {
  if (etat.statut !== "connecte" || liste.statut !== "pret") {
    return undefined;
  }
  return new Map(liste.espaces.map((espace) => [espace.idEspace, espace]));
}

/** Raison pour laquelle les actions qui exigent le serveur sont désactivées (F-014-AC2). */
function raisonDeLEtat(etat: EtatDuCompte, liste: { readonly liste: Liste }): string | undefined {
  if (etat.statut === "deconnecte") {
    return CONNECTEZ_VOUS;
  }
  if (etat.statut === "inconnu") {
    return etat.verification ? VERIFICATION_EN_COURS : DEMANDE_UNE_CONNEXION;
  }
  return liste.liste.statut === "echec" ? DEMANDE_UNE_CONNEXION : undefined;
}

function useListeDesEspaces(
  compte: Compte,
  connecte: boolean,
): { readonly liste: Liste; readonly relire: () => void } {
  const [liste, setListe] = useState<Liste>(ATTENTE);
  const relire = useCallback(() => {
    void compte.espaces.listerEspaces().then((resultat) => {
      setListe(
        resultat.ok
          ? { statut: "pret", espaces: resultat.valeur }
          : { statut: "echec", erreur: resultat.erreur },
      );
    });
  }, [compte]);
  useEffect(() => {
    if (connecte) {
      relire();
    }
  }, [connecte, relire]);
  useRelectureAuRetour(() => {
    if (connecte) {
      relire();
    }
  });
  return { liste: connecte ? liste : ATTENTE, relire };
}

function ContenuDuServeur(props: {
  readonly etat: EtatDuCompte;
  readonly liste: Liste;
  readonly relire: () => void;
  /** Avec le pilote : les espaces de l'appareil n'y figurent pas, chacun s'ouvre (F-032-AC1). */
  readonly appareil: AppareilLu | undefined;
  readonly ajout: AjoutALAppareil;
}): ReactElement {
  const { etat, liste, appareil } = props;
  if (etat.statut !== "connecte") {
    return <Texte>{etat.statut === "deconnecte" ? CONNECTEZ_VOUS : DEMANDE_UNE_CONNEXION}</Texte>;
  }
  switch (liste.statut) {
    case "attente":
      return <Texte>{CHARGEMENT_DES_ESPACES}</Texte>;
    case "echec":
      return (
        <>
          <Alerte phrases={[...texteDEchec(liste.erreur), DEMANDE_UNE_CONNEXION]} />
          <Actions>
            <Bouton libelle={REESSAYER} surActivation={props.relire} />
          </Actions>
        </>
      );
    case "pret":
      return appareil === undefined ? (
        <ListeDesEspaces espaces={liste.espaces} />
      ) : (
        <RangeesDuServeur
          liste={liste.espaces}
          surLAppareil={(idEspace) => cibleSurLAppareil(appareil.etat, idEspace) !== undefined}
          ajout={props.ajout}
        />
      );
  }
}

function ListeDesEspaces({ espaces }: { readonly espaces: readonly EspaceLu[] }): ReactElement {
  if (espaces.length === 0) {
    return <Texte>{AUCUN_ESPACE_DU_SERVEUR}</Texte>;
  }
  return (
    <Tableau
      legende={ESPACES_DU_SERVEUR}
      colonnes={[COLONNE_NOM, COLONNE_ROLE]}
      lignes={espaces.map((espace) => ({
        cle: espace.idEspace,
        cellules: [
          peut(espace.role, "ouvrir-espace") ? (
            <Lien
              key="nom"
              libelle={espace.nom}
              nom={nomOuvrirEspace(espace.nom)}
              adresse={fragmentDEcran({ ecran: "espace", idEspace: espace.idEspace })}
            />
          ) : (
            espace.nom
          ),
          libelleDuRole(espace.role),
        ],
      }))}
    />
  );
}

/** « Nouvel espace » : un nom conforme, un identifiant tiré sur l'appareil, puis `POST`. */
function Creation(props: {
  readonly compte: Compte;
  readonly raison: string | undefined;
}): ReactElement {
  const [ouverte, setOuverte] = useState(false);
  const bouton = useRef<HTMLButtonElement>(null);
  const fermer = (): void => {
    setOuverte(false);
    queueMicrotask(() => bouton.current?.focus());
  };
  if (!ouverte) {
    return (
      <Actions>
        <Bouton
          refBouton={bouton}
          libelle={NOUVEL_ESPACE}
          raison={props.raison}
          surActivation={() => setOuverte(true)}
        />
      </Actions>
    );
  }
  return <FormulaireDeCreation compte={props.compte} raison={props.raison} fermer={fermer} />;
}

function FormulaireDeCreation(props: {
  readonly compte: Compte;
  readonly raison: string | undefined;
  readonly fermer: () => void;
}): ReactElement {
  const [nom, setNom] = useState("");
  const champ = useRef<HTMLInputElement>(null);
  const creation = useCreation(props.compte, nom, champ);
  useEffect(() => champ.current?.focus(), []);
  return (
    <Formulaire
      nom={NOUVEL_ESPACE}
      surEnvoi={creation.creer}
      surTouche={toucheDAbandon(props.fermer)}
    >
      <ChampDeCompte
        etiquette={ETIQUETTE_NOM_D_ESPACE}
        marque={MARQUE_OBLIGATOIRE}
        name="nom"
        value={nom}
        onChange={(evenement) => setNom(evenement.target.value)}
        faute={creation.faute}
        refChamp={champ}
      />
      {creation.echec !== undefined && <Alerte phrases={creation.echec} />}
      <Actions>
        <Bouton
          type="submit"
          libelle={CREER_L_ESPACE}
          raison={props.raison ?? (creation.occupe ? REQUETE_EN_COURS : undefined)}
        />
        <Bouton libelle={ANNULER} surActivation={props.fermer} />
      </Actions>
    </Formulaire>
  );
}

/**
 * Création : rien n'est envoyé pour un nom non conforme ni sans `crypto.randomUUID` (F-014-AC8,
 * AC42) ; le nom saisi est conservé dans tous les cas, et rien n'est écrit sur l'appareil.
 */
function useCreation(
  compte: Compte,
  nom: string,
  champ: RefObject<HTMLInputElement | null>,
): {
  readonly creer: () => void;
  readonly faute: string | undefined;
  readonly echec: readonly string[] | undefined;
  readonly occupe: boolean;
} {
  const [faute, setFaute] = useState<string | undefined>(undefined);
  const [echec, setEchec] = useState<readonly string[] | undefined>(undefined);
  const verrou = useVerrou();
  const creer = async (): Promise<void> => {
    setEchec(undefined);
    if (!estUnNomDEspace(nom)) {
      setFaute(REGLE_DU_NOM);
      champ.current?.focus();
      return;
    }
    setFaute(undefined);
    const idEspace = tirerIdentifiantDEspace();
    if (idEspace === undefined) {
      setEchec([CONTEXTE_NON_SECURISE_POUR_CREER]);
      return;
    }
    const resultat = await verrou.executer(() => compte.espaces.creerEspace({ idEspace, nom }));
    if (resultat?.ok === true) {
      allerALEcran({ ecran: "espace", idEspace: resultat.valeur.idEspace });
    } else if (resultat !== undefined) {
      setEchec(echecDeCreation(resultat.erreur, codeDe(resultat)));
      if (codeDe(resultat) === "non-authentifie") {
        void compte.suivi.reverifier();
      }
    }
  };
  return { creer: () => void creer(), faute, echec, occupe: verrou.occupe };
}

/** Textes propres à la création (F-014-AC8) ; sinon, la table des codes. */
function echecDeCreation(erreur: ErreurDEspaces, code: string | undefined): readonly string[] {
  if (code === "quota-atteint") {
    return [QUOTA_D_ESPACES];
  }
  if (code === "identifiant-indisponible") {
    return [ECHEC_GENERIQUE];
  }
  return texteDEchec(erreur);
}
