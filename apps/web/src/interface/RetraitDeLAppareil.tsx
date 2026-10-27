// Retrait d'un espace de l'appareil (F-032-AC20, AC29) : une boîte de dialogue d'alerte qui cite
// l'espace, focus sur « Annuler », Échap équivalent à « Annuler » ; une fois confirmé, le magasin
// fait le retrait (autres onglets prévenus, bases de l'espace effacées, ce que l'appareil retient de
// lui oublié), puis « « <nom> » a été retiré de cet appareil » est annoncé sans déplacer le focus,
// ou l'avertissement de F-007-AC21 si un effacement a échoué. Le focus revient à la commande
// d'origine ou, puisqu'elle disparaît avec sa rangée, à la liste.
import { type ReactElement, type RefObject, useRef, useState } from "react";

import type { IssueDuRetrait, MagasinDeLAppareil } from "../espace/appareil.ts";
import { libelleDeLAppareil } from "./commandes-espaces.ts";
import { Actions, BoiteDeDialogue, Bouton } from "./composants/Espaces.tsx";
import {
  ANNULER,
  espaceRetireDeLAppareil,
  nomRetirerDeCetAppareil,
  RETRAIT_EN_COURS,
  retraitIncomplet,
  texteDuRetraitDeLAppareil,
  titreDuRetraitDeLAppareil,
} from "./messages-espaces.ts";
import { touchesDeBoite, useBoite } from "./outils-espaces.ts";

/** L'espace visé par le retrait, tel que la liste l'affiche. */
export interface EspaceARetirer {
  readonly idEspace: string;
  readonly nom: string;
}

export interface RetraitDeLAppareil {
  /** Ouvre la boîte ; l'origine est la commande qui a le focus. */
  readonly demander: (espace: EspaceARetirer) => void;
  /** La boîte ouverte, à rendre par l'écran ; `undefined` sinon. */
  readonly boite: ReactElement | undefined;
  readonly annonce: string | undefined;
  readonly alerte: readonly string[] | undefined;
}

export function useRetraitDeLAppareil(
  magasin: MagasinDeLAppareil,
  repli: RefObject<HTMLElement | null>,
): RetraitDeLAppareil {
  const boite = useBoite<EspaceARetirer>(repli);
  const [enCours, setEnCours] = useState(false);
  const verrou = useRef(false);
  const [annonce, setAnnonce] = useState<string | undefined>(undefined);
  const [alerte, setAlerte] = useState<readonly string[] | undefined>(undefined);
  const confirmer = async (vise: EspaceARetirer): Promise<void> => {
    if (verrou.current) {
      return;
    }
    verrou.current = true;
    setEnCours(true);
    const issue = await magasin.retirer(vise.idEspace).catch((): IssueDuRetrait => "echec");
    verrou.current = false;
    setEnCours(false);
    boite.fermer();
    setAnnonce(issue === "retire" ? espaceRetireDeLAppareil(vise.nom) : undefined);
    setAlerte(issue === "retire" ? undefined : [retraitIncomplet(vise.nom)]);
  };
  const vise = boite.ouverte;
  return {
    demander: (espace) => {
      setAnnonce(undefined);
      setAlerte(undefined);
      boite.ouvrir(espace);
    },
    boite:
      vise === undefined ? undefined : (
        <BoiteDuRetrait
          vise={vise}
          enCours={enCours}
          confirmer={() => void confirmer(vise)}
          annuler={boite.fermer}
        />
      ),
    annonce,
    alerte,
  };
}

function BoiteDuRetrait(props: {
  readonly vise: EspaceARetirer;
  readonly enCours: boolean;
  readonly confirmer: () => void;
  readonly annuler: () => void;
}): ReactElement {
  const annuler = useRef<HTMLButtonElement>(null);
  const { vise, enCours } = props;
  return (
    <BoiteDeDialogue
      alerte
      titre={titreDuRetraitDeLAppareil(vise.nom)}
      phrases={texteDuRetraitDeLAppareil(vise.nom)}
      initial={annuler}
      surTouche={touchesDeBoite(enCours ? () => undefined : props.annuler)}
    >
      <Actions>
        <Bouton
          libelle={libelleDeLAppareil("retirer-de-l-appareil")}
          nom={nomRetirerDeCetAppareil(vise.nom)}
          raison={enCours ? RETRAIT_EN_COURS : undefined}
          surActivation={props.confirmer}
        />
        <Bouton
          refBouton={annuler}
          libelle={ANNULER}
          desactive={enCours}
          surActivation={props.annuler}
        />
      </Actions>
    </BoiteDeDialogue>
  );
}
