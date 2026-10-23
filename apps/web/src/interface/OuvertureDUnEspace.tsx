// « Ouvrir cet espace » (F-032-AC5, AC10, AC28, AC29) : pour un espace de l'appareil, une commande
// de l'appareil qui demande le changement sans requête ; pour un espace du serveur que l'appareil ne
// détient pas, la commande rattachée à `lire-espace`, qui passe par l'ajout à l'appareil ; pour
// l'espace ouvert, le texte « Espace courant ». Rien sans pilote (écrans de F-014 seuls).
import type { ReactElement } from "react";

import type { Role } from "../compte/regles-espaces.ts";
import { type CibleDeSession, memeCible } from "../espace/espace-ouvert.ts";
import type { AjoutALAppareil } from "./ajout-a-l-appareil.ts";
import { cibleSurLAppareil, estOuvert, useAppareilDesEcrans } from "./appareil-des-ecrans.ts";
import { useChangementOffert } from "./changement-d-espace.ts";
import { libelleDeLAppareil, peut } from "./commandes-espaces.ts";
import { Actions, Bouton, Texte } from "./composants/Espaces.tsx";
import { ESPACE_COURANT, nomOuvrirCetEspace, OUVRIR_CET_ESPACE } from "./messages-espaces.ts";

/** Où rendre le focus quand la commande d'origine a disparu (F-032-AC29) : la liste. */
type Repli = { readonly current: HTMLElement | null } | undefined;

/** « Ouvrir cet espace » d'un espace de l'appareil autre que l'espace ouvert : sans requête. */
export function OuvrirSurLAppareil(props: {
  readonly cible: CibleDeSession;
  readonly nom: string;
  readonly repli?: Repli;
}): ReactElement | null {
  const changement = useChangementOffert();
  if (changement === undefined) {
    return null;
  }
  const { cibleEnAttente } = changement;
  // Pendant l'attente d'acquittement, seules les autres demandes sont désactivées (F-032-AC12).
  const autre = cibleEnAttente !== undefined && !memeCible(cibleEnAttente, props.cible);
  return (
    <Bouton
      libelle={libelleDeLAppareil("ouvrir-sur-l-appareil")}
      nom={nomOuvrirCetEspace(props.nom)}
      raison={autre ? changement.attente : undefined}
      surActivation={() =>
        changement.demander({ cible: props.cible, nom: props.nom, repli: props.repli?.current })
      }
    />
  );
}

/** « Ouvrir cet espace » d'un espace du serveur que l'appareil ne détient pas (F-032-AC5, AC28). */
export function OuvrirDuServeur(props: {
  readonly idEspace: string;
  readonly nom: string;
  readonly role: Role;
  readonly ajout: AjoutALAppareil;
  readonly repli?: Repli;
}): ReactElement | null {
  const changement = useChangementOffert();
  if (changement === undefined || !peut(props.role, "ouvrir-espace")) {
    return null;
  }
  const { idEspace, nom, ajout } = props;
  return (
    <Bouton
      libelle={OUVRIR_CET_ESPACE}
      nom={nomOuvrirCetEspace(nom)}
      raison={ajout.raison ?? changement.attente}
      surActivation={() => ajout.ajouter({ idEspace, nom }, props.repli?.current)}
    />
  );
}

/**
 * La commande qui convient à cet espace, sur son écran ou après l'acceptation d'une invitation :
 * « Espace courant » s'il est ouvert, sinon l'une des deux commandes. Sans rôle connu (compte non
 * connecté), seul un espace de l'appareil s'ouvre (F-032-AC2).
 */
export function OuvertureDUnEspace(props: {
  readonly idEspace: string;
  readonly nom: string;
  readonly role: Role | undefined;
  readonly ajout: AjoutALAppareil | undefined;
}): ReactElement | null {
  const appareil = useAppareilDesEcrans();
  if (appareil === undefined) {
    return null;
  }
  const { idEspace, nom, role, ajout } = props;
  const cible = cibleSurLAppareil(appareil.etat, idEspace);
  if (cible !== undefined) {
    return estOuvert(appareil, cible) ? (
      <Texte>{ESPACE_COURANT}</Texte>
    ) : (
      <Actions>
        <OuvrirSurLAppareil cible={cible} nom={nom} />
      </Actions>
    );
  }
  return role === undefined || ajout === undefined ? null : (
    <Actions>
      <OuvrirDuServeur idEspace={idEspace} nom={nom} role={role} ajout={ajout} />
    </Actions>
  );
}
