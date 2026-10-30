// Boîtes de dialogue de la grille (F-018-AC18, AC21, AC25) : la création d'une colonne, et les
// confirmations d'alerte des suppressions, focus sur « Annuler ». Annuler ou Échap ferment sans rien
// modifier et rendent le focus à la commande d'origine.
import type { TypeDeColonne } from "@notionlike/document";
import { type ReactElement, useRef, useState } from "react";

import {
  Actions,
  BoiteDeDialogue,
  Bouton,
  Choix,
  Formulaire,
} from "../interface/composants/Espaces.tsx";
import { ChampDeFormulaire } from "../interface/composants/Table.tsx";
import { ajouterUneColonne, supprimerUneColonne, supprimerUneLigne } from "./actions.ts";
import { touchesDeBoite } from "./boite.ts";
import { PanneauDesOptions } from "./PanneauDesOptions.tsx";
import {
  ANNULER,
  CREER_LA_COLONNE,
  NOM_DE_LA_COLONNE,
  NOUVELLE_COLONNE,
  SUPPRIMER_LA_COLONNE,
  SUPPRIMER_LA_LIGNE,
  TEXTE_DE_LA_SUPPRESSION_DE_COLONNE,
  TEXTE_DE_LA_SUPPRESSION_DE_LIGNE,
  titreDeLaSuppressionDeColonne,
  titreDeLaSuppressionDeLigne,
  TYPE_DE_LA_COLONNE,
  TYPES_DE_COLONNE_AFFICHES,
} from "./textes.ts";
import type { VueTableau } from "./use-vue-tableau.ts";

const OPTIONS_DE_TYPE = (Object.keys(TYPES_DE_COLONNE_AFFICHES) as TypeDeColonne[]).map((type) => ({
  valeur: type,
  libelle: TYPES_DE_COLONNE_AFFICHES[type],
}));

function estUnType(valeur: string): valeur is TypeDeColonne {
  return Object.hasOwn(TYPES_DE_COLONNE_AFFICHES, valeur);
}

function ChoixDuType(props: {
  readonly valeur: TypeDeColonne;
  readonly surChoix: (type: TypeDeColonne) => void;
}): ReactElement {
  return (
    <Choix
      nom={TYPE_DE_LA_COLONNE}
      valeur={props.valeur}
      options={OPTIONS_DE_TYPE}
      surChoix={(valeur) => {
        if (estUnType(valeur)) {
          props.surChoix(valeur);
        }
      }}
    />
  );
}

/**
 * Nom et type de la nouvelle colonne, « Texte » par défaut ; créée en dernière position (AC18). Le
 * kanban l'ouvre avec le type « Sélection » choisi (F-020-AC5).
 */
export function BoiteNouvelleColonne(props: {
  /** Crée la colonne ; rend le message du refus, ou `undefined` (la boîte se ferme). */
  readonly ajouter: (nom: string, type: TypeDeColonne) => string | undefined;
  /** Ferme la boîte ; vrai : le focus revient à la commande d'origine. */
  readonly fermerLaBoite: (rendreLeFocus: boolean) => void;
  readonly typeInitial?: TypeDeColonne | undefined;
}): ReactElement {
  const [nom, setNom] = useState("");
  const [type, setType] = useState<TypeDeColonne>(props.typeInitial ?? "texte");
  const [faute, setFaute] = useState<string | undefined>(undefined);
  const champ = useRef<HTMLInputElement>(null);
  const fermer = (): void => props.fermerLaBoite(true);
  const creer = (): void => {
    const refus = props.ajouter(nom, type);
    setFaute(refus);
    if (refus === undefined) {
      props.fermerLaBoite(false);
    }
  };
  return (
    <BoiteDeDialogue
      alerte={false}
      titre={NOUVELLE_COLONNE}
      phrases={[]}
      initial={champ}
      surTouche={touchesDeBoite(fermer)}
    >
      <Formulaire nom={NOUVELLE_COLONNE} surEnvoi={creer}>
        <ChampDeFormulaire
          refChamp={champ}
          etiquette={NOM_DE_LA_COLONNE}
          faute={faute}
          value={nom}
          onChange={(evenement) => {
            setNom(evenement.target.value);
            setFaute(undefined);
          }}
        />
        <ChoixDuType valeur={type} surChoix={setType} />
        <Actions>
          <Bouton type="submit" libelle={CREER_LA_COLONNE} />
          <Bouton libelle={ANNULER} surActivation={fermer} />
        </Actions>
      </Formulaire>
    </BoiteDeDialogue>
  );
}

export function Confirmation(props: {
  readonly titre: string;
  readonly phrases: readonly string[];
  readonly confirmer: string;
  readonly fermer: () => void;
  readonly surConfirmation: () => void;
}): ReactElement {
  const annuler = useRef<HTMLButtonElement>(null);
  return (
    <BoiteDeDialogue
      alerte
      titre={props.titre}
      phrases={props.phrases}
      initial={annuler}
      surTouche={touchesDeBoite(props.fermer)}
    >
      <Actions>
        <Bouton refBouton={annuler} libelle={ANNULER} surActivation={props.fermer} />
        <Bouton libelle={props.confirmer} surActivation={props.surConfirmation} />
      </Actions>
    </BoiteDeDialogue>
  );
}

function SuppressionDeColonne({ vue, id }: { readonly vue: VueTableau; readonly id: string }) {
  const colonne = vue.colonnes.find((une) => une.id === id);
  if (colonne === undefined) {
    return null;
  }
  return (
    <Confirmation
      titre={titreDeLaSuppressionDeColonne(colonne.nom)}
      phrases={TEXTE_DE_LA_SUPPRESSION_DE_COLONNE}
      confirmer={SUPPRIMER_LA_COLONNE}
      fermer={() => vue.fermerBoite(true)}
      surConfirmation={() => {
        vue.fermerBoite(false);
        supprimerUneColonne(vue.moyens, colonne);
      }}
    />
  );
}

function SuppressionDeLigne({ vue, id }: { readonly vue: VueTableau; readonly id: string }) {
  const rang = vue.proprietes.lignes.findIndex((ligne) => ligne.id === id);
  if (rang < 0) {
    return null;
  }
  return (
    <Confirmation
      titre={titreDeLaSuppressionDeLigne(rang + 1)}
      phrases={TEXTE_DE_LA_SUPPRESSION_DE_LIGNE}
      confirmer={SUPPRIMER_LA_LIGNE}
      fermer={() => vue.fermerBoite(true)}
      surConfirmation={() => {
        vue.fermerBoite(false);
        supprimerUneLigne(vue.moyens, id, vue.courante.courante.colonne);
      }}
    />
  );
}

export function BoiteOuverte({ vue }: { readonly vue: VueTableau }): ReactElement | null {
  const { boite } = vue;
  switch (boite?.sorte) {
    case undefined:
      return null;
    case "nouvelle-colonne":
      return (
        <BoiteNouvelleColonne
          ajouter={(nom, type) => ajouterUneColonne(vue.moyens, nom, type)}
          fermerLaBoite={vue.fermerBoite}
        />
      );
    case "supprimer-colonne":
      return <SuppressionDeColonne vue={vue} id={boite.colonne} />;
    case "supprimer-ligne":
      return <SuppressionDeLigne vue={vue} id={boite.ligne} />;
    case "options":
      return <PanneauDesOptions vue={vue} id={boite.colonne} />;
  }
}
