// Écran du compte, `#/compte` (F-027-AC21 à AC26) : nom, mot de passe, sessions. Sans compte
// connecté, aucun formulaire et aucune requête vers les routes du compte : l'écran dit quoi faire, et
// la coquille reste utilisable. Rien de ce que cet écran fait ne touche un document : changer de nom
// n'écrit dans aucune page (F-027-AC3).
import { type ReactElement, type RefObject, useRef, useState, useSyncExternalStore } from "react";

import type { Compte, EtatDuCompte } from "../compte/index.ts";
import { validerChangementDeNom } from "../compte/validation.ts";
import { fragmentDe } from "../navigation/route.ts";
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
  Texte,
} from "./composants/Espaces.tsx";
import {
  COMPTE_INDISPONIBLE,
  MARQUE_OBLIGATOIRE,
  REESSAYER,
  SE_CONNECTER,
  VERIFICATION_DU_COMPTE,
} from "./messages-compte.ts";
import {
  CONNECTEZ_VOUS_POUR_GERER,
  ENREGISTRER_LE_NOM,
  ETIQUETTE_NOM_DU_COMPTE,
  NOM_MODIFIE,
  PARTIE_NOM,
  texteDeLaFauteDeGestion,
  TITRE_DU_COMPTE,
} from "./messages-gestion-du-compte.ts";
import { MotDePasseDuCompte } from "./MotDePasseDuCompte.tsx";
import { type Moyens, phrasesDEchec, useMoyens } from "./outils-gestion-du-compte.ts";
import { SessionsDuCompte } from "./SessionsDuCompte.tsx";

export function EcranDuCompte({ compte }: { readonly compte: Compte }): ReactElement {
  const etat = useSyncExternalStore(compte.suivi.abonner, compte.suivi.lire);
  const [annonce, setAnnonce] = useState("");
  return (
    <EcranDEspaces titre={TITRE_DU_COMPTE}>
      <Annonce texte={annonce} />
      {etat.statut === "connecte" ? (
        <Gestion compte={compte} nom={etat.nom} annoncer={setAnnonce} />
      ) : (
        <SansCompte etat={etat} reverifier={() => void compte.suivi.reverifier()} />
      )}
    </EcranDEspaces>
  );
}

/** Déconnecté : un lien vers la connexion ; inconnu : le texte et l'action de F-010-AC2. */
function SansCompte(props: {
  readonly etat: EtatDuCompte;
  readonly reverifier: () => void;
}): ReactElement {
  const { etat } = props;
  if (etat.statut === "deconnecte") {
    return (
      <>
        <Texte>{CONNECTEZ_VOUS_POUR_GERER}</Texte>
        <Actions>
          <Lien libelle={SE_CONNECTER} adresse={fragmentDe({ forme: "connexion" })} />
        </Actions>
      </>
    );
  }
  if (etat.statut === "inconnu" && etat.verification) {
    return <Texte>{VERIFICATION_DU_COMPTE}</Texte>;
  }
  return (
    <>
      <Texte>{COMPTE_INDISPONIBLE}</Texte>
      <Actions>
        <Bouton libelle={REESSAYER} surActivation={props.reverifier} />
      </Actions>
    </>
  );
}

function Gestion(props: {
  readonly compte: Compte;
  readonly nom: string;
  readonly annoncer: (texte: string) => void;
}): ReactElement {
  const moyens = useMoyens(props.compte, props.annoncer);
  return (
    <>
      <PartieNom moyens={moyens} nomActuel={props.nom} />
      <MotDePasseDuCompte moyens={moyens} />
      <SessionsDuCompte moyens={moyens} />
    </>
  );
}

/** Nom : contrôlé avant l'envoi, puis l'état du compte est revérifié (F-027-AC24). */
function PartieNom(props: { readonly moyens: Moyens; readonly nomActuel: string }): ReactElement {
  const { moyens } = props;
  const [nom, setNom] = useState(props.nomActuel);
  const champ = useRef<HTMLInputElement>(null);
  const envoi = useChangementDeNom(moyens, nom, champ);
  return (
    <Partie titre={PARTIE_NOM}>
      <Formulaire nom={PARTIE_NOM} surEnvoi={envoi.envoyer}>
        <ChampDeCompte
          etiquette={ETIQUETTE_NOM_DU_COMPTE}
          marque={MARQUE_OBLIGATOIRE}
          name="nom"
          autoComplete="name"
          value={nom}
          onChange={(evenement) => setNom(evenement.target.value)}
          faute={envoi.faute}
          refChamp={champ}
        />
        {envoi.echec !== undefined && <Alerte phrases={envoi.echec} />}
        <Actions>
          <Bouton type="submit" libelle={ENREGISTRER_LE_NOM} raison={moyens.raison} />
        </Actions>
      </Formulaire>
    </Partie>
  );
}

function useChangementDeNom(
  moyens: Moyens,
  nom: string,
  champ: RefObject<HTMLInputElement | null>,
): {
  readonly envoyer: () => void;
  readonly faute: string | undefined;
  readonly echec: readonly string[] | undefined;
} {
  const [faute, setFaute] = useState<string | undefined>(undefined);
  const [echec, setEchec] = useState<readonly string[] | undefined>(undefined);
  const envoyer = async (): Promise<void> => {
    if (moyens.raison !== undefined) {
      return;
    }
    setEchec(undefined);
    const validation = validerChangementDeNom(nom);
    if (!validation.ok) {
      const refus = validation.fautes.nom;
      setFaute(refus === undefined ? undefined : texteDeLaFauteDeGestion("nom", refus));
      champ.current?.focus();
      return;
    }
    setFaute(undefined);
    moyens.annoncer("");
    const resultat = await moyens.verrou.executer(() =>
      moyens.compte.gestion.changerLeNom(validation.corps),
    );
    if (resultat?.ok === true) {
      moyens.annoncer(NOM_MODIFIE);
      void moyens.compte.suivi.reverifier();
    } else if (resultat !== undefined) {
      setEchec(phrasesDEchec(resultat.erreur, moyens));
    }
  };
  return { envoyer: () => void envoyer(), faute, echec };
}
