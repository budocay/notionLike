// L'écran des espaces à trois parties (F-032-AC1, AC2, AC26, AC30) : « Espace de cet appareil »,
// « Sur cet appareil » et les rangées de « Espaces du serveur », chaque espace une seule fois. Un
// espace de l'appareil porte son dernier nom connu, le libellé du rôle quand le serveur l'a listé,
// au plus une mention, et « Espace courant » s'il est ouvert, toujours par un texte (AC29).
// « Ne se synchronise plus avec ce compte » est calculé à chaque lecture de la liste, jamais inscrit
// (H9) ; rien de la liste du serveur n'est conservé.
import { type ReactElement, type RefObject, useRef } from "react";

import type { EspaceLu } from "../compte/index.ts";
import type { Role } from "../compte/regles-espaces.ts";
import type { EspaceDeLAppareil } from "../espace/appareil.ts";
import type { CibleDeSession } from "../espace/espace-ouvert.ts";
import { fragmentDEcran } from "../navigation/route.ts";
import type { AjoutALAppareil } from "./ajout-a-l-appareil.ts";
import { type AppareilLu, espaceDeLaCible, estOuvert } from "./appareil-des-ecrans.ts";
import { nomDeLEspace } from "./changement-d-espace.ts";
import { libelleDeLAppareil, peut } from "./commandes-espaces.ts";
import {
  Alerte,
  Annonce,
  Bouton,
  Lien,
  ListeDEspaces,
  Partie,
  type RangeeDEspace,
  Texte,
} from "./composants/Espaces.tsx";
import {
  AUCUN_AUTRE_ESPACE,
  AUCUN_ESPACE_DU_SERVEUR,
  detailsDeLaRangee,
  ESPACE_COURANT,
  ESPACE_DE_CET_APPAREIL,
  libelleDuRole,
  MENTION_DETACHE,
  MENTION_LOCAL,
  MENTION_PREMIERE_SYNCHRONISATION,
  nomOuvrirEspace,
  nomRetirerDeCetAppareil,
  RETRAIT_DE_L_ESPACE_OUVERT,
  SUR_CET_APPAREIL,
  TOUS_SUR_CET_APPAREIL,
} from "./messages-espaces.ts";
import { OuvrirDuServeur, OuvrirSurLAppareil } from "./OuvertureDUnEspace.tsx";
import { type RetraitDeLAppareil, useRetraitDeLAppareil } from "./RetraitDeLAppareil.tsx";

/** La liste du serveur par identifiant, quand le compte est connecté et qu'elle a été lue. */
export type ServeurLu = ReadonlyMap<string, EspaceLu> | undefined;

const APPAREIL: CibleDeSession = { sorte: "appareil" };

/** Les deux parties de l'appareil, avec la boîte du retrait. */
export function PartiesDeLAppareil(props: {
  readonly appareil: AppareilLu;
  readonly serveur: ServeurLu;
}): ReactElement {
  const { appareil, serveur } = props;
  const groupeDeLAppareil = useRef<HTMLDivElement>(null);
  const groupe = useRef<HTMLDivElement>(null);
  const retrait = useRetraitDeLAppareil(appareil.magasin, groupe);
  const { autres } = appareil.etat;
  const rangee = (cible: CibleDeSession, repli: RefObject<HTMLElement | null>) =>
    rangeeDeLAppareil({ appareil, cible, serveur, repli, retrait });
  return (
    <>
      <Partie titre={ESPACE_DE_CET_APPAREIL}>
        <ListeDEspaces
          refGroupe={groupeDeLAppareil}
          rangees={[rangee(APPAREIL, groupeDeLAppareil)]}
        />
      </Partie>
      <Partie titre={SUR_CET_APPAREIL}>
        <ListeDEspaces
          refGroupe={groupe}
          rangees={autres.map(({ idEspace }) => rangee({ sorte: "ajoute", idEspace }, groupe))}
        >
          <Annonce texte={retrait.annonce ?? ""} />
          {retrait.alerte !== undefined && <Alerte phrases={retrait.alerte} />}
          {autres.length === 0 && <Texte>{AUCUN_AUTRE_ESPACE}</Texte>}
        </ListeDEspaces>
      </Partie>
      {retrait.boite}
    </>
  );
}

/**
 * Au plus une mention (F-032-AC1) : l'espace de l'appareil `local`, puis l'espace inscrit que la
 * liste du serveur n'a pas rendu (AC26), puis la marque de première synchronisation (AC8).
 */
function mentionDe(
  espace: EspaceDeLAppareil | undefined,
  cible: CibleDeSession,
  serveur: ServeurLu,
): string | undefined {
  if (espace === undefined) {
    return undefined;
  }
  if (espace.entree === undefined) {
    return cible.sorte === "appareil" ? MENTION_LOCAL : undefined;
  }
  if (serveur !== undefined && !serveur.has(espace.idEspace)) {
    return MENTION_DETACHE;
  }
  return espace.marque ? MENTION_PREMIERE_SYNCHRONISATION : undefined;
}

/** Rôle lu au serveur, mention, « Espace courant » : chacun par un texte (F-032-AC29). */
function detailsDe(...details: readonly (string | undefined)[]): string | undefined {
  const presents = details.filter((detail) => detail !== undefined);
  return presents.length === 0 ? undefined : detailsDeLaRangee(presents);
}

interface DonneesDeLaRangee {
  readonly appareil: AppareilLu;
  readonly cible: CibleDeSession;
  readonly serveur: ServeurLu;
  readonly repli: RefObject<HTMLElement | null>;
  /** Le retrait ; jamais proposé pour l'espace de l'appareil, que seul F-013-AC24 efface (AC20). */
  readonly retrait: RetraitDeLAppareil;
}

function rangeeDeLAppareil(donnees: DonneesDeLaRangee): RangeeDEspace {
  const { appareil, cible, serveur, retrait } = donnees;
  const espace = espaceDeLaCible(appareil.etat, cible);
  const nom = nomDeLEspace(appareil.etat, cible);
  const lu = espace === undefined ? undefined : serveur?.get(espace.idEspace);
  const ouvert = estOuvert(appareil, cible);
  return {
    cle: cible.sorte === "appareil" ? cible.sorte : cible.idEspace,
    nom,
    lien: lienDe(espace?.idEspace, nom, lu?.role),
    details: detailsDe(
      lu === undefined ? undefined : libelleDuRole(lu.role),
      mentionDe(espace, cible, serveur),
      ouvert ? ESPACE_COURANT : undefined,
    ),
    commandes: (
      <CommandesDeLaRangee
        cible={cible}
        nom={nom}
        ouvert={ouvert}
        repli={donnees.repli}
        retrait={retrait}
      />
    ),
  };
}

/**
 * « Ouvrir cet espace » sauf pour l'espace ouvert ; « Retirer de cet appareil » sauf pour l'espace
 * de l'appareil, désactivé avec sa raison pour l'espace ouvert (F-032-AC20).
 */
function CommandesDeLaRangee(props: {
  readonly cible: CibleDeSession;
  readonly nom: string;
  readonly ouvert: boolean;
  readonly repli: RefObject<HTMLElement | null>;
  readonly retrait: RetraitDeLAppareil;
}): ReactElement {
  const { cible, nom, ouvert, retrait } = props;
  return (
    <>
      {!ouvert && <OuvrirSurLAppareil cible={cible} nom={nom} repli={props.repli} />}
      {cible.sorte === "ajoute" && (
        <Bouton
          libelle={libelleDeLAppareil("retirer-de-l-appareil")}
          nom={nomRetirerDeCetAppareil(nom)}
          raison={ouvert ? RETRAIT_DE_L_ESPACE_OUVERT : undefined}
          surActivation={() => retrait.demander({ idEspace: cible.idEspace, nom })}
        />
      )}
    </>
  );
}

/** Le titre mène à l'écran de l'espace quand le serveur l'a listé (F-014-AC1). */
function lienDe(
  idEspace: string | undefined,
  nom: string,
  role: Role | undefined,
): ReactElement | undefined {
  if (idEspace === undefined || role === undefined || !peut(role, "ouvrir-espace")) {
    return undefined;
  }
  return (
    <Lien
      libelle={nom}
      nom={nomOuvrirEspace(nom)}
      adresse={fragmentDEcran({ ecran: "espace", idEspace })}
      coupe
    />
  );
}

/** Les espaces du serveur que l'appareil ne détient pas, chacun avec « Ouvrir cet espace ». */
export function RangeesDuServeur(props: {
  /** Toute la liste lue, dans l'ordre reçu (F-014-AC1). */
  readonly liste: readonly EspaceLu[];
  /** Vrai pour un espace de l'appareil, déjà listé dans sa partie. */
  readonly surLAppareil: (idEspace: string) => boolean;
  readonly ajout: AjoutALAppareil;
}): ReactElement {
  const groupe = useRef<HTMLDivElement>(null);
  const espaces = props.liste.filter((espace) => !props.surLAppareil(espace.idEspace));
  if (espaces.length === 0) {
    return (
      <Texte>{props.liste.length === 0 ? AUCUN_ESPACE_DU_SERVEUR : TOUS_SUR_CET_APPAREIL}</Texte>
    );
  }
  return (
    <ListeDEspaces
      refGroupe={groupe}
      rangees={espaces.map(({ idEspace, nom, role }) => ({
        cle: idEspace,
        nom,
        lien: lienDe(idEspace, nom, role),
        details: libelleDuRole(role),
        commandes: (
          <OuvrirDuServeur
            idEspace={idEspace}
            nom={nom}
            role={role}
            ajout={props.ajout}
            repli={groupe}
          />
        ),
      }))}
    />
  );
}
