// Actions sur l'espace (F-014-AC9 à AC12) : renommer, quitter, supprimer. La suppression se confirme
// en saisissant le nom exact de l'espace ; le départ par une boîte d'alerte (H6). Aucune requête ne
// part avant la confirmation ; Annuler ou Échap ferment la boîte sans rien modifier.
import { type ReactElement, type RefObject, useRef, useState } from "react";

import { estUnNomDEspace } from "../compte/regles-espaces.ts";
import { peut } from "./commandes-espaces.ts";
import { ChampDeCompte } from "./composants/Compte.tsx";
import { Actions, BoiteDeDialogue, Bouton, Formulaire } from "./composants/Espaces.tsx";
import type { ContexteDEspace } from "./contexte-espace.ts";
import { MARQUE_OBLIGATOIRE } from "./messages-compte.ts";
import {
  ANNULER,
  DERNIER_PROPRIETAIRE_QUITTE,
  ESPACE_QUITTE,
  ESPACE_SUPPRIME,
  etiquetteConfirmation,
  ETIQUETTE_NOM_D_ESPACE,
  nomQuitter,
  nomRenommer,
  nomSupprimer,
  QUITTER,
  QUITTER_CET_ESPACE,
  REGLE_DU_NOM,
  RENOMMER,
  SUPPRIMER_CET_ESPACE,
  SUPPRIMER_DEFINITIVEMENT,
  TEXTE_DEPART,
  texteSuppression,
  titreDepart,
  titreSuppression,
  VALIDER_LE_NOM,
} from "./messages-espaces.ts";
import { useBoite } from "./outils-espaces.ts";

type Confirmation = "suppression" | "depart";

export function ActionsDeLEspace({
  contexte,
}: {
  readonly contexte: ContexteDEspace;
}): ReactElement {
  const [renommage, setRenommage] = useState(false);
  const boite = useBoite<Confirmation>(contexte.tableauDesMembres);
  const boutonRenommer = useRef<HTMLButtonElement>(null);
  const finirLeRenommage = (): void => {
    setRenommage(false);
    queueMicrotask(() => boutonRenommer.current?.focus());
  };
  return (
    <>
      {renommage ? (
        <Renommage contexte={contexte} fermer={finirLeRenommage} />
      ) : (
        <BarreDActions
          contexte={contexte}
          boutonRenommer={boutonRenommer}
          renommer={() => setRenommage(true)}
          confirmer={boite.ouvrir}
        />
      )}
      {boite.ouverte === "suppression" && <Suppression contexte={contexte} fermer={boite.fermer} />}
      {boite.ouverte === "depart" && <Depart contexte={contexte} fermer={boite.fermer} />}
    </>
  );
}

function BarreDActions(props: {
  readonly contexte: ContexteDEspace;
  readonly boutonRenommer: RefObject<HTMLButtonElement | null>;
  readonly renommer: () => void;
  readonly confirmer: (confirmation: Confirmation) => void;
}): ReactElement {
  const { espace, raison } = props.contexte;
  return (
    <Actions>
      {peut(espace.role, "renommer") && (
        <Bouton
          refBouton={props.boutonRenommer}
          libelle={RENOMMER}
          nom={nomRenommer(espace.nom)}
          raison={raison}
          surActivation={props.renommer}
        />
      )}
      {peut(espace.role, "quitter") && (
        <Bouton
          libelle={QUITTER_CET_ESPACE}
          nom={nomQuitter(espace.nom)}
          raison={raison}
          surActivation={() => props.confirmer("depart")}
        />
      )}
      {peut(espace.role, "supprimer") && (
        <Bouton
          libelle={SUPPRIMER_CET_ESPACE}
          nom={nomSupprimer(espace.nom)}
          raison={raison}
          surActivation={() => props.confirmer("suppression")}
        />
      )}
    </Actions>
  );
}

/** Renommage : Entrée envoie, Échap rend l'ancien nom sans requête (F-014-AC9). */
function Renommage(props: {
  readonly contexte: ContexteDEspace;
  readonly fermer: () => void;
}): ReactElement {
  const { contexte } = props;
  const [nom, setNom] = useState(contexte.espace.nom);
  const [faute, setFaute] = useState<string | undefined>(undefined);
  const champ = useRef<HTMLInputElement>(null);
  const valider = async (): Promise<void> => {
    if (!estUnNomDEspace(nom)) {
      setFaute(REGLE_DU_NOM);
      champ.current?.focus();
      return;
    }
    const resultat = await contexte.verrou.executer(() =>
      contexte.compte.espaces.renommerEspace(contexte.idEspace, { nom }),
    );
    if (resultat === undefined) {
      return;
    }
    if (resultat.ok) {
      props.fermer();
      contexte.relireTout();
    } else {
      contexte.echouer(resultat.erreur);
    }
  };
  return (
    <Formulaire nom={RENOMMER} surEnvoi={() => void valider()} surEchap={props.fermer}>
      <ChampDeCompte
        etiquette={ETIQUETTE_NOM_D_ESPACE}
        marque={MARQUE_OBLIGATOIRE}
        name="nom"
        value={nom}
        autoFocus
        onChange={(evenement) => setNom(evenement.target.value)}
        faute={faute}
        refChamp={champ}
      />
      <Actions>
        <Bouton type="submit" libelle={VALIDER_LE_NOM} raison={contexte.raison} />
        <Bouton libelle={ANNULER} surActivation={props.fermer} />
      </Actions>
    </Formulaire>
  );
}

interface ProprietesBoite {
  readonly contexte: ContexteDEspace;
  readonly fermer: () => void;
}

function Suppression({ contexte, fermer }: ProprietesBoite): ReactElement {
  const { espace } = contexte;
  const [saisie, setSaisie] = useState("");
  const annuler = useRef<HTMLButtonElement>(null);
  const supprimer = async (): Promise<void> => {
    const resultat = await contexte.verrou.executer(() =>
      contexte.compte.espaces.supprimerEspace(contexte.idEspace),
    );
    if (resultat?.ok === true) {
      contexte.revenirALaListe({ annonce: ESPACE_SUPPRIME, alerte: undefined });
    } else if (resultat !== undefined) {
      fermer();
      contexte.echouer(resultat.erreur);
    }
  };
  return (
    <BoiteDeDialogue
      alerte
      titre={titreSuppression(espace.nom)}
      phrases={texteSuppression(contexte.membres?.length ?? 1)}
      initial={annuler}
      surFermeture={fermer}
    >
      <ChampDeCompte
        etiquette={etiquetteConfirmation(espace.nom)}
        marque={MARQUE_OBLIGATOIRE}
        name="confirmation"
        value={saisie}
        autoComplete="off"
        onChange={(evenement) => setSaisie(evenement.target.value)}
        faute={undefined}
      />
      <Actions>
        <Bouton refBouton={annuler} libelle={ANNULER} surActivation={fermer} />
        <Bouton
          libelle={SUPPRIMER_DEFINITIVEMENT}
          nom={`${SUPPRIMER_DEFINITIVEMENT} : ${espace.nom}`}
          desactive={saisie !== espace.nom}
          raison={contexte.raison}
          surActivation={() => void supprimer()}
        />
      </Actions>
    </BoiteDeDialogue>
  );
}

function Depart({ contexte, fermer }: ProprietesBoite): ReactElement {
  const annuler = useRef<HTMLButtonElement>(null);
  const quitter = async (): Promise<void> => {
    const resultat = await contexte.verrou.executer(() =>
      contexte.compte.espaces.retirerMembre(contexte.idEspace, contexte.moi),
    );
    if (resultat?.ok === true) {
      contexte.revenirALaListe({ annonce: ESPACE_QUITTE, alerte: undefined });
    } else if (resultat !== undefined) {
      fermer();
      contexte.echouer(resultat.erreur, { "dernier-proprietaire": DERNIER_PROPRIETAIRE_QUITTE });
    }
  };
  return (
    <BoiteDeDialogue
      alerte
      titre={titreDepart(contexte.espace.nom)}
      phrases={[TEXTE_DEPART]}
      initial={annuler}
      surFermeture={fermer}
    >
      <Actions>
        <Bouton refBouton={annuler} libelle={ANNULER} surActivation={fermer} />
        <Bouton
          libelle={QUITTER}
          nom={nomQuitter(contexte.espace.nom)}
          raison={contexte.raison}
          surActivation={() => void quitter()}
        />
      </Actions>
    </BoiteDeDialogue>
  );
}
