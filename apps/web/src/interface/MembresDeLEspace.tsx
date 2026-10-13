// Membres d'un espace (F-014-AC13 à AC15) : un tableau à en-têtes de colonne, dans l'ordre reçu, le
// courriel seulement quand la réponse le porte. Le changement de rôle ne se confirme pas ; le retrait
// d'un autre membre, par une boîte d'alerte qui dit ce qu'il ne reprend pas (H6).
import { type ReactElement, type ReactNode, useRef } from "react";

import type { MembreLu } from "../compte/index.ts";
import { type Role, ROLES } from "../compte/regles-espaces.ts";
import { peut } from "./commandes-espaces.ts";
import {
  Actions,
  BoiteDeDialogue,
  Bouton,
  Choix,
  Partie,
  Tableau,
  Texte,
} from "./composants/Espaces.tsx";
import type { ContexteDEspace } from "./contexte-espace.ts";
import {
  ANNULER,
  AVERTISSEMENT_RETRAIT,
  CHARGEMENT_DES_MEMBRES,
  COLONNE_ACTIONS,
  COLONNE_COURRIEL,
  COLONNE_NOM,
  COLONNE_ROLE_DU_MEMBRE,
  DERNIER_PROPRIETAIRE_ROLE,
  libelleDuRole,
  LIBELLES_DES_ROLES,
  MEMBRES,
  membreRetire,
  nomRetirer,
  nomRoleDuMembre,
  RETIRER,
  roleChange,
  titreRetrait,
  VOUS,
} from "./messages-espaces.ts";
import { useBoite } from "./outils-espaces.ts";

const OPTIONS_DE_ROLE = ROLES.map((role) => ({ valeur: role, libelle: LIBELLES_DES_ROLES[role] }));

export function MembresDeLEspace({
  contexte,
}: {
  readonly contexte: ContexteDEspace;
}): ReactElement | null {
  const boite = useBoite<MembreLu>(contexte.tableauDesMembres);
  if (!peut(contexte.espace.role, "voir-membres")) {
    return null;
  }
  const { membres } = contexte;
  return (
    <Partie titre={MEMBRES}>
      {membres === undefined ? (
        <Texte>{CHARGEMENT_DES_MEMBRES}</Texte>
      ) : (
        <TableauDesMembres contexte={contexte} membres={membres} retirer={boite.ouvrir} />
      )}
      {boite.ouverte !== undefined && (
        <Retrait contexte={contexte} membre={boite.ouverte} fermer={boite.fermer} />
      )}
    </Partie>
  );
}

function TableauDesMembres(props: {
  readonly contexte: ContexteDEspace;
  readonly membres: readonly MembreLu[];
  readonly retirer: (membre: MembreLu) => void;
}): ReactElement {
  const { contexte, membres } = props;
  const { role } = contexte.espace;
  const avecCourriel = membres.some((membre) => membre.courriel !== undefined);
  const avecActions = peut(role, "retirer-membre");
  const colonnes = [
    COLONNE_NOM,
    ...(avecCourriel ? [COLONNE_COURRIEL] : []),
    COLONNE_ROLE_DU_MEMBRE,
    ...(avecActions ? [COLONNE_ACTIONS] : []),
  ];
  return (
    <Tableau
      refTableau={contexte.tableauDesMembres}
      legende={MEMBRES}
      colonnes={colonnes}
      lignes={membres.map((membre) => {
        const estMoi = membre.idCompte === contexte.moi;
        const cellules: ReactNode[] = [estMoi ? `${membre.nom} ${VOUS}` : membre.nom];
        if (avecCourriel) {
          cellules.push(membre.courriel ?? "");
        }
        cellules.push(<RoleDuMembre key="role" contexte={contexte} membre={membre} />);
        if (avecActions) {
          cellules.push(
            estMoi ? (
              ""
            ) : (
              <Bouton
                key="retirer"
                libelle={RETIRER}
                nom={nomRetirer(membre.nom)}
                raison={contexte.raison}
                surActivation={() => props.retirer(membre)}
              />
            ),
          );
        }
        return { cle: membre.idCompte, cellules };
      })}
    />
  );
}

/** Rôle d'un membre : un choix pour qui peut le changer, sinon son libellé (F-014-AC14). */
function RoleDuMembre(props: {
  readonly contexte: ContexteDEspace;
  readonly membre: MembreLu;
}): ReactElement {
  const { contexte, membre } = props;
  if (!peut(contexte.espace.role, "changer-role")) {
    return <>{libelleDuRole(membre.role)}</>;
  }
  const changer = async (role: Role): Promise<void> => {
    const resultat = await contexte.verrou.executer(() =>
      contexte.compte.espaces.changerRole(contexte.idEspace, membre.idCompte, { role }),
    );
    if (resultat === undefined) {
      return;
    }
    if (resultat.ok) {
      contexte.annoncer(roleChange(membre.nom, resultat.valeur.role));
    } else {
      contexte.echouer(resultat.erreur, { "dernier-proprietaire": DERNIER_PROPRIETAIRE_ROLE });
    }
    // La commande reprend le rôle que le serveur rend ; le sien changé, tout l'écran suit (AC27).
    contexte.relireTout();
  };
  return (
    <Choix
      nom={nomRoleDuMembre(membre.nom)}
      valeur={membre.role}
      options={OPTIONS_DE_ROLE}
      raison={contexte.raison}
      surChoix={(valeur) => {
        const role = ROLES.find((un) => un === valeur);
        if (role !== undefined) {
          void changer(role);
        }
      }}
    />
  );
}

function Retrait(props: {
  readonly contexte: ContexteDEspace;
  readonly membre: MembreLu;
  readonly fermer: () => void;
}): ReactElement {
  const { contexte, membre, fermer } = props;
  const annuler = useRef<HTMLButtonElement>(null);
  const retirer = async (): Promise<void> => {
    const resultat = await contexte.verrou.executer(() =>
      contexte.compte.espaces.retirerMembre(contexte.idEspace, membre.idCompte),
    );
    if (resultat === undefined) {
      return;
    }
    fermer();
    if (resultat.ok) {
      contexte.annoncer(membreRetire(membre.nom));
      contexte.relireTout();
    } else {
      contexte.echouer(resultat.erreur);
    }
  };
  return (
    <BoiteDeDialogue
      alerte
      titre={titreRetrait(membre.nom)}
      phrases={[AVERTISSEMENT_RETRAIT]}
      initial={annuler}
      surFermeture={fermer}
    >
      <Actions>
        <Bouton refBouton={annuler} libelle={ANNULER} surActivation={fermer} />
        <Bouton
          libelle={RETIRER}
          nom={nomRetirer(membre.nom)}
          raison={contexte.raison}
          surActivation={() => void retirer()}
        />
      </Actions>
    </BoiteDeDialogue>
  );
}
