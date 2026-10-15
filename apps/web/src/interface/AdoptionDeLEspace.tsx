// Boîte de l'adoption de l'espace local (F-013-AC11 à AC14) : elle demande le nom, dit ce que
// l'adoption fait des pages, et n'envoie rien avant la confirmation. Une seule requête à la fois ;
// en cas d'échec, le nom saisi est gardé et l'utilisateur peut réessayer.
import { type ReactElement, type RefObject, useRef, useState } from "react";

import { estUnNomDEspace } from "../compte/regles-espaces.ts";
import type { ErreurDuServeur, IssueDAdoption } from "../synchronisation/index.ts";
import { ChampDeCompte } from "./composants/Compte.tsx";
import { Actions, Alerte, BoiteDeDialogue, Bouton, Formulaire } from "./composants/Espaces.tsx";
import { messageDuCode } from "../compte/messages-erreur.ts";
import { MARQUE_OBLIGATOIRE, SERVEUR_INJOIGNABLE } from "./messages-compte.ts";
import {
  ECHEC_GENERIQUE,
  ETIQUETTE_NOM_D_ESPACE,
  QUOTA_D_ESPACES,
  REGLE_DU_NOM,
} from "./messages-espaces.ts";
import {
  ADOPTION_EN_COURS,
  ANNULER,
  EFFET_DE_L_ADOPTION,
  espaceDejaExistant,
  espaceSynchronise,
  IDENTIFIANT_DEJA_PRIS,
  SYNCHRONISER,
  TITRE_DE_L_ADOPTION,
} from "./messages-synchronisation.ts";
import { touchesDeBoite } from "./outils-espaces.ts";

interface Proprietes {
  readonly adopter: (nom: string) => Promise<IssueDAdoption>;
  readonly fermer: () => void;
  /** L'espace est adopté : la boîte se ferme, la zone annonce ce texte. */
  readonly surAdoption: (annonce: string) => void;
}

/** Le message d'un échec (AC14) : la table des codes de F-010-AC16, sauf le quota (F-011-AC34). */
export function texteDeLEchec(erreur: ErreurDuServeur): string {
  switch (erreur.type) {
    case "enveloppe":
      return erreur.code === "quota-atteint" ? QUOTA_D_ESPACES : messageDuCode(erreur.code);
    case "trop-de-requetes":
      return messageDuCode("trop-de-requetes");
    case "hors-ligne":
      return SERVEUR_INJOIGNABLE;
    case "generique":
      return ECHEC_GENERIQUE;
  }
}

interface Saisie {
  readonly nom: string;
  readonly setNom: (nom: string) => void;
  readonly faute: string | undefined;
  readonly echec: string | undefined;
  readonly enCours: boolean;
  readonly champ: RefObject<HTMLInputElement | null>;
  readonly envoyer: () => void;
}

// Une seule requête à la fois (AC12) ; un nom non conforme n'envoie rien (AC11).
function useAdoption(
  adopter: Proprietes["adopter"],
  surAdoption: Proprietes["surAdoption"],
): Saisie {
  const [nom, setNom] = useState("");
  const [faute, setFaute] = useState<string | undefined>(undefined);
  const [echec, setEchec] = useState<string | undefined>(undefined);
  const [enCours, setEnCours] = useState(false);
  const verrou = useRef(false);
  const champ = useRef<HTMLInputElement>(null);
  const envoyer = async (): Promise<void> => {
    if (verrou.current) {
      return;
    }
    if (!estUnNomDEspace(nom)) {
      setFaute(REGLE_DU_NOM);
      champ.current?.focus();
      return;
    }
    setFaute(undefined);
    verrou.current = true;
    setEnCours(true);
    const issue = await adopter(nom);
    verrou.current = false;
    setEnCours(false);
    if (issue.sorte === "adopte") {
      surAdoption(issue.rejouee ? espaceDejaExistant(issue.nom) : espaceSynchronise(issue.nom));
    } else {
      setEchec(
        issue.sorte === "identifiant-pris" ? IDENTIFIANT_DEJA_PRIS : texteDeLEchec(issue.erreur),
      );
    }
  };
  return { nom, setNom, faute, echec, enCours, champ, envoyer: () => void envoyer() };
}

export function AdoptionDeLEspace({ adopter, fermer, surAdoption }: Proprietes): ReactElement {
  const { nom, setNom, faute, echec, enCours, champ, envoyer } = useAdoption(adopter, surAdoption);
  return (
    <BoiteDeDialogue
      alerte={false}
      titre={TITRE_DE_L_ADOPTION}
      phrases={[EFFET_DE_L_ADOPTION]}
      initial={champ}
      surTouche={touchesDeBoite(fermer)}
    >
      <Formulaire nom={TITRE_DE_L_ADOPTION} surEnvoi={envoyer}>
        <ChampDeCompte
          etiquette={ETIQUETTE_NOM_D_ESPACE}
          marque={MARQUE_OBLIGATOIRE}
          name="nom"
          autoComplete="off"
          value={nom}
          onChange={(evenement) => setNom(evenement.target.value)}
          faute={faute}
          refChamp={champ}
        />
        {echec !== undefined && <Alerte phrases={[echec]} />}
        <Actions>
          <Bouton
            type="submit"
            libelle={SYNCHRONISER}
            raison={enCours ? ADOPTION_EN_COURS : undefined}
          />
          <Bouton libelle={ANNULER} surActivation={fermer} />
        </Actions>
      </Formulaire>
    </BoiteDeDialogue>
  );
}
