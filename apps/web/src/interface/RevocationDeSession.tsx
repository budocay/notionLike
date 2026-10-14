// Fermeture d'une session, ou de toutes les autres (F-027-AC10, AC12, AC23, AC24, AC25) : une boîte
// de dialogue demande le mot de passe actuel, l'envoie dans le corps de cette seule requête, puis
// l'efface, que la requête réussisse ou échoue. Le mot de passe n'est tenu que par l'état de la boîte.
import { type ReactElement, useRef, useState } from "react";

import type { SessionLue } from "../compte/index.ts";
import { validerRevocation } from "../compte/validation.ts";
import { ChampDeCompte } from "./composants/Compte.tsx";
import { Actions, Alerte, BoiteDeDialogue, Bouton, Formulaire } from "./composants/Espaces.tsx";
import { MARQUE_OBLIGATOIRE } from "./messages-compte.ts";
import {
  ANNULER,
  EFFET_D_UNE_FERMETURE,
  ETIQUETTE_MOT_DE_PASSE_ACTUEL,
  FERMER_LA_SESSION,
  FERMER_LES_AUTRES,
  SESSION_DEJA_FERMEE,
  SESSION_FERMEE,
  sessionsFermees,
  texteDeLaFauteDeGestion,
  titreFermerLaSession,
} from "./messages-gestion-du-compte.ts";
import { codeDe, touchesDeBoite } from "./outils-espaces.ts";
import { type Moyens, phrasesDEchec } from "./outils-gestion-du-compte.ts";

export type Cible =
  { readonly sorte: "une"; readonly session: SessionLue } | { readonly sorte: "autres" };

interface Proprietes {
  readonly moyens: Moyens;
  readonly cible: Cible;
  readonly fermer: () => void;
}

export function Revocation({ moyens, cible, fermer }: Proprietes): ReactElement {
  const [motDePasse, setMotDePasse] = useState("");
  const champ = useRef<HTMLInputElement>(null);
  const envoi = useRevocation({ moyens, cible, fermer }, motDePasse, () => {
    setMotDePasse("");
  });
  const titre =
    cible.sorte === "une" ? titreFermerLaSession(cible.session.creeLe) : FERMER_LES_AUTRES;
  return (
    <BoiteDeDialogue
      alerte={false}
      titre={titre}
      phrases={[EFFET_D_UNE_FERMETURE]}
      initial={champ}
      surTouche={touchesDeBoite(fermer)}
    >
      <Formulaire nom={titre} surEnvoi={() => envoi.envoyer(champ.current)}>
        <ChampDeCompte
          etiquette={ETIQUETTE_MOT_DE_PASSE_ACTUEL}
          marque={MARQUE_OBLIGATOIRE}
          name="motDePasseActuel"
          type="password"
          autoComplete="current-password"
          value={motDePasse}
          onChange={(evenement) => setMotDePasse(evenement.target.value)}
          faute={envoi.faute}
          refChamp={champ}
        />
        {envoi.echec !== undefined && <Alerte phrases={envoi.echec} />}
        <Actions>
          <Bouton
            type="submit"
            libelle={cible.sorte === "une" ? FERMER_LA_SESSION : FERMER_LES_AUTRES}
            raison={moyens.raison}
          />
          <Bouton libelle={ANNULER} surActivation={fermer} />
        </Actions>
      </Formulaire>
    </BoiteDeDialogue>
  );
}

function useRevocation(
  { moyens, cible, fermer }: Proprietes,
  motDePasse: string,
  effacer: () => void,
): {
  readonly envoyer: (champ: HTMLInputElement | null) => void;
  readonly faute: string | undefined;
  readonly echec: readonly string[] | undefined;
} {
  const [faute, setFaute] = useState<string | undefined>(undefined);
  const [echec, setEchec] = useState<readonly string[] | undefined>(undefined);
  const envoyer = async (champ: HTMLInputElement | null): Promise<void> => {
    if (moyens.raison !== undefined) {
      return;
    }
    const validation = validerRevocation(motDePasse);
    if (!validation.ok) {
      const refus = validation.fautes.motDePasseActuel;
      setFaute(
        refus === undefined ? undefined : texteDeLaFauteDeGestion("motDePasseActuel", refus),
      );
      champ?.focus();
      return;
    }
    setFaute(undefined);
    setEchec(undefined);
    moyens.annoncer("");
    const fin = await revoquer(moyens, cible, validation.corps);
    effacer();
    if (fin === "fermer") {
      fermer();
    } else if (fin !== "rien") {
      setEchec(fin);
    }
  };
  return { envoyer: (champ) => void envoyer(champ), faute, echec };
}

type Fin = "fermer" | "rien" | readonly string[];

/**
 * Envoie la révocation ; rend « fermer » quand la boîte doit se fermer (succès, session déjà
 * fermée, session perdue), sinon les phrases de l'échec, montrées dans la boîte.
 */
async function revoquer(
  moyens: Moyens,
  cible: Cible,
  corps: { readonly motDePasseActuel: string },
): Promise<Fin> {
  const { gestion } = moyens.compte;
  const resultat = await moyens.verrou.executer(() =>
    cible.sorte === "une"
      ? gestion.revoquerUneSession(cible.session.idSession, corps)
      : gestion.revoquerLesAutres(corps),
  );
  if (resultat === undefined) {
    return "rien";
  }
  if (resultat.ok) {
    if (cible.sorte === "une") {
      moyens.sessions.retirer(cible.session.idSession);
      moyens.annoncer(SESSION_FERMEE);
    } else {
      moyens.annoncer(sessionsFermees(Number(resultat.valeur)));
      moyens.sessions.relire();
    }
    return "fermer";
  }
  const code = codeDe(resultat);
  if (code === "ressource-introuvable" && cible.sorte === "une") {
    moyens.annoncer(SESSION_DEJA_FERMEE);
    moyens.sessions.relire();
    return "fermer";
  }
  const phrases = phrasesDEchec(resultat.erreur, moyens);
  return code === "non-authentifie" ? "fermer" : phrases;
}
