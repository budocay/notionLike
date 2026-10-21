// Écran de la corbeille (F-007) : les racines de la corbeille, chacune avec sa descendance en
// lecture seule ; restaurer une racine, supprimer définitivement toute page après confirmation.
// Rien n'est modifié avant la confirmation ; Annuler ou Échap ferment la boîte sans rien modifier.
// Les opérations lui sont données : l'application les fait sur le document et traduit les refus.
import type { PageLue } from "@notionlike/document";
import { type ReactElement, type RefObject, useRef, useState } from "react";

import {
  type LigneDeCorbeille,
  ListeDeCorbeille,
  type RacineDeCorbeille,
} from "./composants/Corbeille.tsx";
import {
  Actions,
  Alerte,
  Annonce,
  BoiteDeDialogue,
  Bouton,
  EcranDEspaces,
} from "./composants/Espaces.tsx";
import { nomRestaurer, nomSupprimer, titreAffiche, titreDeLaConfirmation } from "./messages.ts";
import {
  ANNULER_LA_SUPPRESSION,
  CONTENU_NON_EFFACE,
  CORBEILLE_VIDE,
  ENTREE_CORBEILLE,
  nombreDeSousPages,
  PAGE_RESTAUREE,
  PAGE_SUPPRIMEE,
  PAGES_DE_LA_CORBEILLE,
  RESTAURER,
  SUPPRIMER_DEFINITIVEMENT,
  texteDeLaConfirmation,
} from "./messages-corbeille.ts";
import { MARQUE_DE_TABLE } from "./messages-tables.ts";
import { touchesDeBoite, useBoite } from "./outils-espaces.ts";

/** Issue d'une suppression : le message d'un refus, ou l'effacement des bases qui suit. */
export type IssueDeSuppression =
  | { readonly refus: string }
  | { readonly refus: undefined; readonly effacement: Promise<"effacee" | "echec"> };

export interface OperationsDeLaCorbeille {
  /** Rend le message du refus, ou `undefined` si la page est restaurée. */
  readonly restaurer: (page: PageLue) => string | undefined;
  readonly supprimer: (page: PageLue) => IssueDeSuppression;
}

interface Proprietes {
  /** La corbeille lue : ses racines, chacune avec toute sa descendance. */
  readonly corbeille: readonly PageLue[];
  readonly operations: OperationsDeLaCorbeille;
  /** Raison qui désactive restaurer et supprimer : lecture seule (F-013-AC25). */
  readonly lectureSeule?: string | undefined;
}

interface Retour {
  readonly annonce: string | undefined;
  readonly alerte: readonly string[] | undefined;
}

const SANS_RETOUR: Retour = { annonce: undefined, alerte: undefined };
const NIVEAU_D_UNE_RACINE = 1;

/** Nombre de pages sous celle-ci, à toute profondeur ; parcours itératif. */
function compterLaDescendance(page: PageLue): number {
  const aVoir = [...page.enfants];
  for (const vue of aVoir) {
    vue.enfants.forEach((enfant) => aVoir.push(enfant));
  }
  return aVoir.length;
}

/** La descendance à plat, dans l'ordre lu, chacune avec son niveau ; parcours itératif. */
function descendanceAPlat(racine: PageLue): { page: PageLue; niveau: number }[] {
  const lignes: { page: PageLue; niveau: number }[] = [];
  const enfantsDe = (page: PageLue, niveau: number): { page: PageLue; niveau: number }[] =>
    page.enfants.map((enfant) => ({ page: enfant, niveau: niveau + 1 })).reverse();
  const aVoir = enfantsDe(racine, NIVEAU_D_UNE_RACINE);
  for (let suivante = aVoir.pop(); suivante !== undefined; suivante = aVoir.pop()) {
    lignes.push(suivante);
    aVoir.push(...enfantsDe(suivante.page, suivante.niveau));
  }
  return lignes;
}

interface Commandes {
  readonly restaurer: (page: PageLue) => void;
  readonly demanderLaSuppression: (page: PageLue) => void;
  readonly raison: string | undefined;
}

// Restaurer sur les seules racines, supprimer sur toute page de la corbeille (F-007-AC8).
function ligneDe(page: PageLue, niveau: number, commandes: Commandes): LigneDeCorbeille {
  const titre = titreAffiche(page.titre);
  return {
    cle: page.id,
    titre,
    detail: nombreDeSousPages(compterLaDescendance(page)),
    niveau,
    marque: page.type === "table" ? MARQUE_DE_TABLE : undefined,
    commandes: (
      <>
        {niveau === NIVEAU_D_UNE_RACINE && (
          <Bouton
            libelle={RESTAURER}
            nom={nomRestaurer(titre)}
            raison={commandes.raison}
            surActivation={() => commandes.restaurer(page)}
          />
        )}
        <Bouton
          libelle={SUPPRIMER_DEFINITIVEMENT}
          nom={nomSupprimer(titre)}
          raison={commandes.raison}
          surActivation={() => commandes.demanderLaSuppression(page)}
        />
      </>
    ),
  };
}

function racinesDe(corbeille: readonly PageLue[], commandes: Commandes): RacineDeCorbeille[] {
  return corbeille.map((racine) => ({
    ...ligneDe(racine, NIVEAU_D_UNE_RACINE, commandes),
    descendance: descendanceAPlat(racine).map(({ page, niveau }) =>
      ligneDe(page, niveau, commandes),
    ),
  }));
}

interface Suivi {
  readonly retour: Retour;
  readonly restaurer: (page: PageLue) => void;
  /** Ferme la confirmation, supprime, puis signale un effacement en échec (F-007-AC21). */
  readonly supprimer: (page: PageLue) => void;
}

function useSuivi(
  operations: OperationsDeLaCorbeille,
  liste: RefObject<HTMLElement | null>,
  fermerLaBoite: () => void,
): Suivi {
  const [retour, setRetour] = useState<Retour>(SANS_RETOUR);
  return {
    retour,
    restaurer: (page) => {
      const refus = operations.restaurer(page);
      if (refus !== undefined) {
        setRetour({ annonce: undefined, alerte: [refus] });
        return;
      }
      setRetour({ annonce: PAGE_RESTAUREE, alerte: undefined });
      // La commande disparaît avec la page restaurée : le focus revient à la liste.
      liste.current?.focus();
    },
    supprimer: (page) => {
      const issue = operations.supprimer(page);
      fermerLaBoite();
      if (issue.refus !== undefined) {
        setRetour({ annonce: undefined, alerte: [issue.refus] });
        return;
      }
      setRetour({ annonce: PAGE_SUPPRIMEE, alerte: undefined });
      void issue.effacement.then((effacement) => {
        if (effacement === "echec") {
          setRetour({ annonce: PAGE_SUPPRIMEE, alerte: [CONTENU_NON_EFFACE] });
        }
      });
    },
  };
}

export function EcranDeLaCorbeille({
  corbeille,
  operations,
  lectureSeule,
}: Proprietes): ReactElement {
  const liste = useRef<HTMLElement>(null);
  const boite = useBoite<PageLue>(liste);
  const suivi = useSuivi(operations, liste, boite.fermer);
  const { retour } = suivi;
  const visee = boite.ouverte;
  const commandes: Commandes = {
    restaurer: suivi.restaurer,
    demanderLaSuppression: (page) => boite.ouvrir(page),
    raison: lectureSeule,
  };
  return (
    <EcranDEspaces titre={ENTREE_CORBEILLE}>
      {retour.annonce !== undefined && <Annonce texte={retour.annonce} />}
      {retour.alerte !== undefined && <Alerte phrases={retour.alerte} />}
      <ListeDeCorbeille
        nom={PAGES_DE_LA_CORBEILLE}
        vide={CORBEILLE_VIDE}
        racines={racinesDe(corbeille, commandes)}
        refListe={liste}
      />
      {visee !== undefined && (
        <Confirmation page={visee} fermer={boite.fermer} confirmer={() => suivi.supprimer(visee)} />
      )}
    </EcranDEspaces>
  );
}

function Confirmation(props: {
  readonly page: PageLue;
  readonly fermer: () => void;
  readonly confirmer: () => void;
}): ReactElement {
  const annuler = useRef<HTMLButtonElement>(null);
  const titre = titreAffiche(props.page.titre);
  return (
    <BoiteDeDialogue
      alerte
      titre={titreDeLaConfirmation(titre)}
      phrases={texteDeLaConfirmation(compterLaDescendance(props.page))}
      initial={annuler}
      surTouche={touchesDeBoite(props.fermer)}
    >
      <Actions>
        <Bouton refBouton={annuler} libelle={ANNULER_LA_SUPPRESSION} surActivation={props.fermer} />
        <Bouton
          libelle={SUPPRIMER_DEFINITIVEMENT}
          nom={nomSupprimer(titre)}
          surActivation={props.confirmer}
        />
      </Actions>
    </BoiteDeDialogue>
  );
}
