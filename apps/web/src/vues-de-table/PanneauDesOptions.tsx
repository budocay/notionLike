// Panneau « Options » d'une colonne `selection` (F-018-AC22) : ajouter, renommer, monter, descendre
// et retirer une option, chacune par une seule opération du document de table ; le retrait après
// une confirmation qui dit que les cellules qui portent l'option deviendront vides.
import type { ColonneLue, OptionLue } from "@notionlike/document";
import { type KeyboardEvent, type ReactElement, useRef, useState } from "react";

import {
  Actions,
  Alerte,
  BoiteDeDialogue,
  Bouton,
  Formulaire,
} from "../interface/composants/Espaces.tsx";
import {
  ChampDeCellule,
  ChampDeFormulaire,
  LigneDOption,
  ListeDOptions,
} from "../interface/composants/Table.tsx";
import { estLaFrappe, TOUCHES_DE_L_EDITION } from "../interface/raccourcis.ts";
import { touchesDeBoite } from "./boite.ts";
import { ecrire } from "./ecritures.ts";
import {
  AJOUTER_L_OPTION,
  ANNULER,
  AUCUNE_OPTION,
  DESCENDRE,
  descendreLOption,
  FERMER,
  LIBELLE_TROP_LONG,
  LONGUEUR_MAX_LIBELLE,
  MONTER,
  monterLOption,
  NOUVELLE_OPTION,
  nomDuLibelle,
  RETIRER,
  RETIRER_L_OPTION,
  retirerLOption,
  SANS_LIBELLE,
  TEXTE_DU_RETRAIT_D_OPTION,
  titreDesOptions,
  titreDuRetraitDOption,
} from "./textes.ts";
import type { VueTableau } from "./use-vue-tableau.ts";

/** Une opération d'option : un libellé trop long est refusé avant d'écrire (AC22). */
function operer(operation: () => unknown, libelle?: string): string | undefined {
  if (libelle !== undefined && libelle.length > LONGUEUR_MAX_LIBELLE) {
    return LIBELLE_TROP_LONG;
  }
  const issue = ecrire(operation);
  return issue.reussie ? undefined : issue.message;
}

interface Moyens {
  readonly vue: VueTableau;
  readonly colonne: ColonneLue;
  readonly signaler: (faute: string | undefined) => void;
  readonly demanderLeRetrait: (option: OptionLue) => void;
}

function LigneDeLOption(props: Moyens & { readonly option: OptionLue; readonly rang: number }) {
  const { vue, colonne, option, rang, signaler } = props;
  const { table, lectureSeule } = vue.proprietes;
  const [texte, setTexte] = useState(option.libelle);
  const renommer = (): void => {
    if (texte !== option.libelle) {
      signaler(operer(() => table.renommerOption(colonne.id, option.id, texte), texte));
    }
  };
  const deplacer = (vers: number) => () =>
    signaler(operer(() => table.deplacerOption(colonne.id, option.id, vers)));
  return (
    <LigneDOption>
      <ChampDeCellule
        nom={nomDuLibelle(option.libelle)}
        value={texte}
        placeholder={SANS_LIBELLE}
        disabled={lectureSeule !== undefined}
        onChange={(evenement) => setTexte(evenement.target.value)}
        onBlur={renommer}
        onKeyDown={(evenement: KeyboardEvent<HTMLInputElement>) => {
          if (estLaFrappe(evenement, TOUCHES_DE_L_EDITION.validerEtDescendre)) {
            evenement.preventDefault();
            renommer();
          }
        }}
      />
      <Bouton
        libelle={MONTER}
        nom={monterLOption(option.libelle)}
        raison={lectureSeule}
        desactive={rang === 0}
        surActivation={deplacer(rang - 1)}
      />
      <Bouton
        libelle={DESCENDRE}
        nom={descendreLOption(option.libelle)}
        raison={lectureSeule}
        desactive={rang === colonne.options.length - 1}
        surActivation={deplacer(rang + 1)}
      />
      <Bouton
        libelle={RETIRER}
        nom={retirerLOption(option.libelle)}
        raison={lectureSeule}
        surActivation={() => props.demanderLeRetrait(option)}
      />
    </LigneDOption>
  );
}

function Ajout(props: Moyens): ReactElement {
  const { vue, colonne, signaler } = props;
  const [libelle, setLibelle] = useState("");
  const [faute, setFaute] = useState<string | undefined>(undefined);
  return (
    <Formulaire
      nom={NOUVELLE_OPTION}
      surEnvoi={() => {
        const refus = operer(
          () => vue.proprietes.table.ajouterOption(colonne.id, libelle),
          libelle,
        );
        setFaute(refus);
        signaler(undefined);
        if (refus === undefined) {
          setLibelle("");
        }
      }}
    >
      <ChampDeFormulaire
        etiquette={NOUVELLE_OPTION}
        faute={faute}
        value={libelle}
        disabled={vue.proprietes.lectureSeule !== undefined}
        onChange={(evenement) => setLibelle(evenement.target.value)}
      />
      <Actions>
        <Bouton type="submit" libelle={AJOUTER_L_OPTION} raison={vue.proprietes.lectureSeule} />
      </Actions>
    </Formulaire>
  );
}

function Retrait(props: {
  readonly vue: VueTableau;
  readonly colonne: ColonneLue;
  readonly option: OptionLue;
  readonly fermer: (faute: string | undefined) => void;
}): ReactElement {
  const { vue, colonne, option } = props;
  const annuler = useRef<HTMLButtonElement>(null);
  return (
    <BoiteDeDialogue
      alerte
      titre={titreDuRetraitDOption(option.libelle)}
      phrases={TEXTE_DU_RETRAIT_D_OPTION}
      initial={annuler}
      surTouche={touchesDeBoite(() => props.fermer(undefined))}
    >
      <Actions>
        <Bouton
          refBouton={annuler}
          libelle={ANNULER}
          surActivation={() => props.fermer(undefined)}
        />
        <Bouton
          libelle={RETIRER_L_OPTION}
          surActivation={() =>
            props.fermer(operer(() => vue.proprietes.table.retirerOption(colonne.id, option.id)))
          }
        />
      </Actions>
    </BoiteDeDialogue>
  );
}

function Panneau(props: Moyens & { readonly faute: string | undefined }): ReactElement {
  const { vue, colonne, faute } = props;
  const fermer = useRef<HTMLButtonElement>(null);
  return (
    <BoiteDeDialogue
      alerte={false}
      titre={titreDesOptions(colonne.nom)}
      phrases={[]}
      initial={fermer}
      surTouche={touchesDeBoite(() => vue.fermerBoite(true))}
    >
      {faute !== undefined && <Alerte phrases={[faute]} />}
      <ListeDOptions
        nom={titreDesOptions(colonne.nom)}
        vide={AUCUNE_OPTION}
        nombre={colonne.options.length}
      >
        {colonne.options.map((option, rang) => (
          <LigneDeLOption key={option.id} {...props} option={option} rang={rang} />
        ))}
      </ListeDOptions>
      <Ajout {...props} />
      <Actions>
        <Bouton refBouton={fermer} libelle={FERMER} surActivation={() => vue.fermerBoite(true)} />
      </Actions>
    </BoiteDeDialogue>
  );
}

export function PanneauDesOptions(props: {
  readonly vue: VueTableau;
  readonly id: string;
}): ReactElement | null {
  const { vue } = props;
  const [faute, setFaute] = useState<string | undefined>(undefined);
  const [retrait, setRetrait] = useState<OptionLue | undefined>(undefined);
  const colonne = vue.colonnes.find(({ id }) => id === props.id);
  if (colonne === undefined) {
    return null;
  }
  if (retrait !== undefined) {
    return (
      <Retrait
        vue={vue}
        colonne={colonne}
        option={retrait}
        fermer={(refus) => {
          setFaute(refus);
          setRetrait(undefined);
        }}
      />
    );
  }
  return (
    <Panneau
      vue={vue}
      colonne={colonne}
      signaler={setFaute}
      demanderLeRetrait={setRetrait}
      faute={faute}
    />
  );
}
