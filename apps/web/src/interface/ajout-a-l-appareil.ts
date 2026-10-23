// Ajout à l'appareil d'un espace du serveur qu'il ne détient pas (F-032-AC5, AC6, H4) : l'espace
// est relu au serveur au moment du geste, une fois, par le client des espaces ; sur un 200
// conforme, l'entrée `{ rattachement: "adopte", droit }` est inscrite au registre avec le nom et la
// marque de première synchronisation, puis le changement d'espace est demandé. Rien de l'espace
// (base, WebSocket) n'est ouvert avant l'inscription ; un échec laisse l'onglet sur l'espace ouvert,
// sans entrée au registre. Une demande à la fois : « Requête en cours. » pendant la lecture et
// l'inscription, sans seconde requête.
import { useRef, useState } from "react";

import type { Compte, EspaceLu, Resultat } from "../compte/index.ts";
import type { MagasinDeLAppareil } from "../espace/appareil.ts";
import { droitDuRole } from "../synchronisation/index.ts";
import { cibleSurLAppareil, useAppareilDesEcrans } from "./appareil-des-ecrans.ts";
import { useChangementOffert } from "./changement-d-espace.ts";
import {
  AJOUT_SANS_STOCKAGE,
  PAS_ENCORE_TELECHARGE,
  PLUS_ACCESSIBLE,
  REQUETE_EN_COURS,
  texteDEchec,
} from "./messages-espaces.ts";
import { codeDe } from "./outils-espaces.ts";

/** L'espace du serveur à ajouter, tel que l'écran le montre. */
export interface EspaceAAjouter {
  readonly idEspace: string;
  readonly nom: string;
}

export interface AjoutALAppareil {
  /** « Requête en cours. » pendant la lecture et l'inscription ; sinon `undefined`. */
  readonly raison: string | undefined;
  /** Le dernier échec (F-032-AC6), annoncé sans déplacer le focus ; `undefined` sans échec. */
  readonly alerte: readonly string[] | undefined;
  /** Lance l'ajout ; sans effet pendant un autre, ou sans pilote. */
  readonly ajouter: (espace: EspaceAAjouter, repli?: HTMLElement | null) => void;
}

export interface OptionsDeLAjout {
  readonly compte: Compte;
  /** Un 404 : l'espace n'est plus accessible avec ce compte (F-014-AC28). */
  readonly surIntrouvable: () => void;
}

type Issue =
  | { readonly sorte: "inscrit"; readonly nom: string }
  | { readonly sorte: "introuvable" }
  | { readonly sorte: "echec"; readonly phrases: readonly string[] };

export function useAjoutALAppareil(options: OptionsDeLAjout): AjoutALAppareil {
  const appareil = useAppareilDesEcrans();
  const changement = useChangementOffert();
  const verrou = useRef(false);
  const [occupe, setOccupe] = useState(false);
  const [alerte, setAlerte] = useState<readonly string[] | undefined>(undefined);
  const executer = async (espace: EspaceAAjouter, repli: HTMLElement | null): Promise<void> => {
    if (appareil === undefined || changement === undefined || verrou.current) {
      return;
    }
    const { idEspace } = espace;
    // Déjà sur l'appareil (ajouté par un autre onglet depuis la lecture de la liste) : sans requête.
    if (cibleSurLAppareil(appareil.etat, idEspace) !== undefined) {
      changement.demander({ cible: { sorte: "ajoute", idEspace }, nom: espace.nom, repli });
      return;
    }
    verrou.current = true;
    setOccupe(true);
    setAlerte(undefined);
    const issue = await lireEtInscrire(options.compte, appareil.magasin, idEspace);
    verrou.current = false;
    setOccupe(false);
    if (issue.sorte === "inscrit") {
      changement.demander({ cible: { sorte: "ajoute", idEspace }, nom: issue.nom, repli });
    } else if (issue.sorte === "introuvable") {
      setAlerte([PLUS_ACCESSIBLE]);
      options.surIntrouvable();
    } else {
      setAlerte(issue.phrases);
    }
  };
  return {
    raison: occupe ? REQUETE_EN_COURS : undefined,
    alerte,
    ajouter: (espace, repli) => void executer(espace, repli ?? null),
  };
}

// Jamais rejetée (F-032-AC31) : le client des espaces ne lève pas, le magasin non plus.
async function lireEtInscrire(
  compte: Compte,
  magasin: MagasinDeLAppareil,
  idEspace: string,
): Promise<Issue> {
  const lecture = await compte.espaces.lireEspace(idEspace);
  if (!lecture.ok) {
    return echecDeLecture(compte, lecture);
  }
  const { nom, role } = lecture.valeur;
  const entree = { rattachement: "adopte", droit: droitDuRole(role) } as const;
  const inscrit = await magasin.ajouter(idEspace, entree, nom).catch(() => false);
  return inscrit ? { sorte: "inscrit", nom } : { sorte: "echec", phrases: [AJOUT_SANS_STOCKAGE] };
}

// F-032-AC6 : le réseau ou l'échéance de 10 secondes du client ; 404 (F-014-AC28) ; 401
// (F-010-AC28, l'état du compte est revérifié) ; sinon la table des codes (F-014-AC30, AC31).
function echecDeLecture(
  compte: Compte,
  lecture: Extract<Resultat<EspaceLu>, { readonly ok: false }>,
): Issue {
  const { erreur } = lecture;
  if (erreur.type === "hors-ligne") {
    return { sorte: "echec", phrases: [PAS_ENCORE_TELECHARGE] };
  }
  const code = codeDe(lecture);
  if (code === "ressource-introuvable") {
    return { sorte: "introuvable" };
  }
  if (code === "non-authentifie") {
    void compte.suivi.reverifier();
  }
  return { sorte: "echec", phrases: texteDEchec(erreur) };
}
