// Changement du mot de passe (F-027-AC4, AC23, AC24). Les deux mots de passe ne vivent que dans
// l'état de ce formulaire : l'actuel est effacé après sa requête, qu'elle réussisse ou échoue ; le
// nouveau, après un succès. Aucun ne figure dans l'adresse, le titre, la console, un message ni un
// stockage.
import { type ReactElement, type RefObject, useRef, useState } from "react";

import { type Fautes, validerChangementDeMotDePasse } from "../compte/validation.ts";
import { ChampDeCompte } from "./composants/Compte.tsx";
import { Actions, Alerte, Bouton, Formulaire, Partie, Texte } from "./composants/Espaces.tsx";
import { MARQUE_OBLIGATOIRE } from "./messages-compte.ts";
import {
  CHANGER_LE_MOT_DE_PASSE,
  EFFET_DU_CHANGEMENT,
  ETIQUETTE_MOT_DE_PASSE_ACTUEL,
  ETIQUETTE_NOUVEAU_MOT_DE_PASSE,
  MOT_DE_PASSE_MODIFIE,
  PARTIE_MOT_DE_PASSE,
  texteDeLaFauteDeGestion,
} from "./messages-gestion-du-compte.ts";
import { type Moyens, phrasesDEchec } from "./outils-gestion-du-compte.ts";

type Champ = "motDePasseActuel" | "nouveauMotDePasse";

interface Saisie {
  readonly actuel: string;
  readonly nouveau: string;
}

const VIDE: Saisie = { actuel: "", nouveau: "" };

export function MotDePasseDuCompte({ moyens }: { readonly moyens: Moyens }): ReactElement {
  const [saisie, setSaisie] = useState<Saisie>(VIDE);
  const refs = {
    motDePasseActuel: useRef<HTMLInputElement>(null),
    nouveauMotDePasse: useRef<HTMLInputElement>(null),
  };
  const envoi = useChangement(moyens, saisie, setSaisie, refs);
  const faute = (champ: Champ): string | undefined => {
    const refus = envoi.fautes[champ];
    return refus === undefined ? undefined : texteDeLaFauteDeGestion(champ, refus);
  };
  return (
    <Partie titre={PARTIE_MOT_DE_PASSE}>
      <Texte>{EFFET_DU_CHANGEMENT}</Texte>
      <Formulaire nom={PARTIE_MOT_DE_PASSE} surEnvoi={envoi.envoyer}>
        <ChampDeCompte
          etiquette={ETIQUETTE_MOT_DE_PASSE_ACTUEL}
          marque={MARQUE_OBLIGATOIRE}
          name="motDePasseActuel"
          type="password"
          autoComplete="current-password"
          value={saisie.actuel}
          onChange={(evenement) => setSaisie({ ...saisie, actuel: evenement.target.value })}
          faute={faute("motDePasseActuel")}
          refChamp={refs.motDePasseActuel}
        />
        <ChampDeCompte
          etiquette={ETIQUETTE_NOUVEAU_MOT_DE_PASSE}
          marque={MARQUE_OBLIGATOIRE}
          name="nouveauMotDePasse"
          type="password"
          autoComplete="new-password"
          value={saisie.nouveau}
          onChange={(evenement) => setSaisie({ ...saisie, nouveau: evenement.target.value })}
          faute={faute("nouveauMotDePasse")}
          refChamp={refs.nouveauMotDePasse}
        />
        {envoi.echec !== undefined && <Alerte phrases={envoi.echec} />}
        <Actions>
          <Bouton type="submit" libelle={CHANGER_LE_MOT_DE_PASSE} raison={moyens.raison} />
        </Actions>
      </Formulaire>
    </Partie>
  );
}

const ORDRE: readonly Champ[] = ["motDePasseActuel", "nouveauMotDePasse"];

function useChangement(
  moyens: Moyens,
  saisie: Saisie,
  setSaisie: (suivante: (avant: Saisie) => Saisie) => void,
  refs: Readonly<Record<Champ, RefObject<HTMLInputElement | null>>>,
): {
  readonly envoyer: () => void;
  readonly fautes: Fautes<Champ | "nom">;
  readonly echec: readonly string[] | undefined;
} {
  const [fautes, setFautes] = useState<Fautes<Champ | "nom">>({});
  const [echec, setEchec] = useState<readonly string[] | undefined>(undefined);
  const envoyer = async (): Promise<void> => {
    if (moyens.raison !== undefined) {
      return;
    }
    setEchec(undefined);
    const validation = validerChangementDeMotDePasse(saisie.actuel, saisie.nouveau);
    if (!validation.ok) {
      setFautes(validation.fautes);
      const premier = ORDRE.find((champ) => validation.fautes[champ] !== undefined);
      refs[premier ?? "motDePasseActuel"].current?.focus();
      return;
    }
    setFautes({});
    moyens.annoncer("");
    const resultat = await moyens.verrou.executer(() =>
      moyens.compte.gestion.changerLeMotDePasse(validation.corps),
    );
    if (resultat === undefined) {
      return;
    }
    setSaisie((avant) => (resultat.ok ? VIDE : { ...avant, actuel: "" }));
    if (resultat.ok) {
      moyens.annoncer(MOT_DE_PASSE_MODIFIE);
      moyens.sessions.relire();
    } else {
      setEchec(phrasesDEchec(resultat.erreur, moyens));
    }
  };
  return { envoyer: () => void envoyer(), fautes, echec };
}
