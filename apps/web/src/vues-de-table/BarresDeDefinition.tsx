// Barres « Filtres » et « Tris » (F-019-AC1, AC6, AC18, AC23 à AC27) : la définition de la table, la
// même pour toutes ses vues. Un filtre ajouté commence sur la première colonne et se règle sur place :
// colonne, opérateur, valeur ; un filtre sans valeur est sans effet jusqu'à sa saisie. Les annonces
// passent par la zone d'annonce de la vue, les refus par son alerte ; toute valeur est rendue comme
// du texte (AC26). La barre « Tris » est dans `BarreDesTris.tsx`.
import type { ColonneLue, TableLue } from "@notionlike/document";
import { type ReactElement, useEffect, useEffectEvent, useRef, useState } from "react";

import { Bouton, Choix } from "../interface/composants/Espaces.tsx";
import { estLaFrappe, TOUCHES_DE_L_EDITION } from "../interface/raccourcis.ts";
import {
  BarreDeDefinition,
  ChampDeDefinition,
  ElementDeDefinition,
  ListeDeDefinition,
} from "../interface/composants/Table.tsx";
import {
  demandeUneValeur,
  type Filtre,
  LIMITE_DE_FILTRES,
  type OperateurDeFiltre,
  operateursDe,
  remplacerA,
} from "./definition.ts";
import { BarreDesTris } from "./BarreDesTris.tsx";
import { etatDuFiltre } from "./filtres.ts";
import { filtresSansResultat } from "./lignes-affichees.ts";
import {
  AFFICHAGE_FIGE,
  AJOUTER_UN_FILTRE,
  AUCUNE_LIGNE_CORRESPONDANTE,
  CHOISIR_UNE_OPTION,
  COLONNE_INTROUVABLE,
  COLONNE_SUPPRIMEE,
  FILTRES,
  LIBELLES_DES_OPERATEURS,
  LISTE_DES_FILTRES,
  libelleAffiche,
  lignesSurTotal,
  nomAffiche,
  nomDeLOperateur,
  nomDeLaColonneDuFiltre,
  nomDeLaValeurDuFiltre,
  nombreDeFiltres,
  OPTION_INTROUVABLE,
  OPTION_SUPPRIMEE,
  REAPPLIQUER,
  RETIRER_UN_ELEMENT,
  retirerLeFiltre,
  TOUT_EFFACER,
  TROP_DE_FILTRES,
} from "./textes.ts";
import {
  AJOUTER,
  cleDuBouton,
  type FocusDeLaListe,
  useFocusDeLaListe,
} from "./use-focus-de-la-liste.ts";
import type { VueTableau } from "./use-vue-tableau.ts";
import { analyserLaValeur, texteDeLaValeur } from "./valeur-de-filtre.ts";

const DATE_MIN = "0001-01-01";
const DATE_MAX = "9999-12-31";

interface Props {
  readonly vue: VueTableau;
}

type Remplacer = (filtre: Filtre | undefined) => void;

interface PropsDeValeur extends Props {
  readonly filtre: Filtre;
  readonly colonne: ColonneLue;
  readonly remplacer: Remplacer;
}

function ChoixDOption({ filtre, colonne, remplacer }: PropsDeValeur): ReactElement {
  const valeur = filtre.valeur === undefined ? "" : String(filtre.valeur);
  const retiree = valeur !== "" && !colonne.options.some(({ id }) => id === valeur);
  return (
    <Choix
      nom={nomDeLaValeurDuFiltre(colonne.nom)}
      valeur={valeur}
      options={[
        { valeur: "", libelle: CHOISIR_UNE_OPTION },
        ...(retiree ? [{ valeur, libelle: OPTION_INTROUVABLE }] : []),
        ...colonne.options.map(({ id, libelle }) => ({
          valeur: id,
          libelle: libelleAffiche(libelle),
        })),
      ]}
      surChoix={(choisie) => remplacer({ ...filtre, valeur: choisie === "" ? undefined : choisie })}
    />
  );
}

function ChampDeValeur({ vue, filtre, colonne, remplacer }: PropsDeValeur): ReactElement {
  const [texte, setTexte] = useState(texteDeLaValeur(filtre.valeur));
  const [valeurVue, setValeurVue] = useState(filtre.valeur);
  const [refuse, setRefuse] = useState(false);
  if (valeurVue !== filtre.valeur) {
    // La ligne a reçu un autre filtre (le précédent a été retiré) : le texte suit la valeur
    // enregistrée, sans remonter le champ, qui garde ainsi le focus après une validation.
    setValeurVue(filtre.valeur);
    setTexte(texteDeLaValeur(filtre.valeur));
  }
  const date = colonne.type === "date";
  const valider = (): void => {
    const analyse = analyserLaValeur(colonne, texte);
    setRefuse(analyse.sorte === "refus");
    vue.moyens.signaler(analyse.sorte === "refus" ? analyse.message : undefined);
    if (analyse.sorte === "valeur") {
      // Le champ garde le focus et montre la forme enregistrée de ce qui vient d'être validé.
      setTexte(texteDeLaValeur(analyse.valeur));
      if (analyse.valeur !== filtre.valeur) {
        remplacer({ ...filtre, valeur: analyse.valeur });
      }
    }
  };
  return (
    <ChampDeDefinition
      nom={nomDeLaValeurDuFiltre(colonne.nom)}
      type={date ? "date" : "text"}
      min={date ? DATE_MIN : undefined}
      max={date ? DATE_MAX : undefined}
      idFaute={refuse ? vue.idAlerte : undefined}
      value={texte}
      onChange={(evenement) => setTexte(evenement.target.value)}
      onBlur={valider}
      onKeyDown={(evenement) => {
        if (
          estLaFrappe(evenement, TOUCHES_DE_L_EDITION.validerEtDescendre) &&
          !evenement.nativeEvent.isComposing
        ) {
          evenement.preventDefault();
          valider();
        }
      }}
    />
  );
}

function mentionDuFiltre(lue: TableLue, filtre: Filtre): string | undefined {
  const etat = etatDuFiltre(lue, filtre);
  if (etat.actif) {
    return undefined;
  }
  if (etat.mention === "option-supprimee") {
    return OPTION_SUPPRIMEE;
  }
  return etat.mention === "colonne-supprimee" ? COLONNE_SUPPRIMEE : undefined;
}

/** Le filtre quand sa colonne change : opérateur et valeur gardés si le type est le même (AC1). */
function filtreSurUneAutreColonne(
  filtre: Filtre,
  avant: ColonneLue | undefined,
  apres: ColonneLue,
): Filtre | undefined {
  if (avant?.type === apres.type && apres.type !== "selection") {
    return { ...filtre, colonne: apres.id };
  }
  const operateur = operateursDe(apres.type)[0];
  return operateur === undefined ? undefined : { colonne: apres.id, operateur };
}

function ChoixDeColonneEtDOperateur(props: {
  readonly lue: TableLue;
  readonly filtre: Filtre;
  readonly remplacer: Remplacer;
}): ReactElement {
  const { lue, filtre, remplacer } = props;
  const colonne = lue.colonnes.find(({ id }) => id === filtre.colonne);
  const operateurs: readonly OperateurDeFiltre[] =
    colonne === undefined ? [filtre.operateur] : operateursDe(colonne.type);
  return (
    <>
      <Choix
        nom={nomDeLaColonneDuFiltre(colonne?.nom)}
        valeur={filtre.colonne}
        options={[
          ...(colonne === undefined
            ? [{ valeur: filtre.colonne, libelle: COLONNE_INTROUVABLE }]
            : []),
          ...lue.colonnes.map(({ id, nom }) => ({ valeur: id, libelle: nomAffiche(nom) })),
        ]}
        surChoix={(id) => {
          const suivante = lue.colonnes.find((une) => une.id === id);
          remplacer(suivante && filtreSurUneAutreColonne(filtre, colonne, suivante));
        }}
      />
      <Choix
        nom={nomDeLOperateur(colonne?.nom)}
        valeur={filtre.operateur}
        options={operateurs.map((operateur) => ({
          valeur: operateur,
          libelle: LIBELLES_DES_OPERATEURS[operateur],
        }))}
        surChoix={(choisi) => {
          const admis = operateurs.find((un) => un === choisi);
          if (admis !== undefined) {
            const valeur = demandeUneValeur(admis) ? filtre.valeur : undefined;
            remplacer({ colonne: filtre.colonne, operateur: admis, valeur });
          }
        }}
      />
    </>
  );
}

function LigneDeFiltre(props: {
  readonly vue: VueTableau;
  readonly rang: number;
  readonly focus: FocusDeLaListe;
}): ReactElement | null {
  const { vue, rang, focus } = props;
  const { lue } = vue.proprietes;
  const { definition, changer } = vue.definition;
  const filtre = definition.filtres[rang];
  if (filtre === undefined) {
    return null;
  }
  const colonne = lue.colonnes.find(({ id }) => id === filtre.colonne);
  const remplacer: Remplacer = (suivant) =>
    changer({ ...definition, filtres: remplacerA(definition.filtres, rang, suivant) });
  const propsDeValeur = colonne && { vue, filtre, colonne, remplacer };
  return (
    <ElementDeDefinition mention={mentionDuFiltre(lue, filtre)}>
      <ChoixDeColonneEtDOperateur lue={lue} filtre={filtre} remplacer={remplacer} />
      {propsDeValeur !== undefined && demandeUneValeur(filtre.operateur) && (
        <ValeurDuFiltre key={`${filtre.colonne}:${filtre.operateur}`} {...propsDeValeur} />
      )}
      <Bouton
        libelle={RETIRER_UN_ELEMENT}
        nom={retirerLeFiltre(colonne?.nom)}
        refBouton={focus.bouton(cleDuBouton("retirer", rang))}
        surActivation={() => {
          // Le focus passe au filtre qui prend la place de celui-ci, sinon au précédent.
          focus.apres([cleDuBouton("retirer", rang), cleDuBouton("retirer", rang - 1), AJOUTER]);
          remplacer(undefined);
        }}
      />
    </ElementDeDefinition>
  );
}

function ValeurDuFiltre(props: PropsDeValeur): ReactElement {
  return props.colonne.type === "selection" ? (
    <ChoixDOption {...props} />
  ) : (
    <ChampDeValeur {...props} />
  );
}

// Un filtre commence sur la première colonne dont le premier opérateur demande une valeur, sinon
// sur la première colonne : sans valeur, il reste sans effet jusqu'à ce que l'utilisateur choisisse
// (AC1). Une colonne `case` n'en offre pas, son premier opérateur n'en demande aucune.
function ajouterUnFiltre(vue: VueTableau): void {
  const { lue } = vue.proprietes;
  const { definition, changer } = vue.definition;
  const colonne =
    lue.colonnes.find(({ type }) => {
      const premier = operateursDe(type)[0];
      return premier !== undefined && demandeUneValeur(premier);
    }) ?? lue.colonnes[0];
  const operateur = colonne === undefined ? undefined : operateursDe(colonne.type)[0];
  if (definition.filtres.length >= LIMITE_DE_FILTRES) {
    vue.moyens.signaler(TROP_DE_FILTRES);
  } else if (colonne !== undefined && operateur !== undefined) {
    vue.moyens.signaler(undefined);
    changer({
      ...definition,
      filtres: [...definition.filtres, { colonne: colonne.id, operateur }],
    });
  }
}

function BarreDesFiltres({ vue }: Props): ReactElement {
  const { lignes } = vue.proprietes;
  const { definition, changer, total, fige, reappliquer } = vue.definition;
  const focus = useFocusDeLaListe(definition, fige);
  return (
    <BarreDeDefinition
      nom={FILTRES}
      resume={`${nombreDeFiltres(definition.filtres.length)} · ${lignesSurTotal(lignes.length, total)}`}
      commandes={
        <>
          <Bouton
            libelle={AJOUTER_UN_FILTRE}
            refBouton={focus.bouton(AJOUTER)}
            surActivation={() => ajouterUnFiltre(vue)}
          />
          {definition.filtres.length > 0 && (
            <Bouton
              libelle={TOUT_EFFACER}
              refBouton={focus.bouton(TOUT_EFFACER)}
              surActivation={() => {
                // Le bouton activé disparaît avec le dernier filtre : le focus va à « Ajouter ».
                vue.moyens.signaler(undefined);
                focus.apres([AJOUTER]);
                changer({ ...definition, filtres: [] });
              }}
            />
          )}
          {fige && (
            <Bouton
              libelle={REAPPLIQUER}
              surActivation={() => {
                // Le bouton activé disparaît avec l'affichage figé : le focus va à « Ajouter ».
                focus.apres([AJOUTER]);
                reappliquer();
              }}
            />
          )}
        </>
      }
    >
      {definition.filtres.length > 0 && (
        <ListeDeDefinition nom={LISTE_DES_FILTRES}>
          {definition.filtres.map((_, rang) => (
            // Un filtre n'a pas d'identité propre : sa place dans la liste le désigne.
            <LigneDeFiltre key={rang} vue={vue} rang={rang} focus={focus} />
          ))}
        </ListeDeDefinition>
      )}
    </BarreDeDefinition>
  );
}

// Annonces de la zone d'annonce de la vue : le compte « N lignes sur M » à chaque changement de la
// définition (AC6), l'apparition de la commande « Réappliquer » (AC18). Rien à l'ouverture.
function useAnnoncesDeLaDefinition(vue: VueTableau): void {
  const { definition, fige, total } = vue.definition;
  const { lignes } = vue.proprietes;
  const precedente = useRef({ definition, fige });
  const annoncerLeCompte = useEffectEvent(() => {
    const compte = lignesSurTotal(lignes.length, total);
    // Les filtres excluent toutes les lignes : l'état vide de la grille est dit avec le compte.
    const vide = filtresSansResultat(lignes.length, total, definition);
    vue.moyens.annoncer(vide ? `${compte}. ${AUCUNE_LIGNE_CORRESPONDANTE}` : compte);
  });
  const annoncerLAffichageFige = useEffectEvent(() => vue.moyens.annoncer(AFFICHAGE_FIGE));
  useEffect(() => {
    if (precedente.current.definition !== definition) {
      annoncerLeCompte();
    }
    if (!precedente.current.fige && fige) {
      annoncerLAffichageFige();
    }
    precedente.current = { definition, fige };
  }, [definition, fige]);
}

export function BarresDeDefinition({ vue }: Props): ReactElement {
  useAnnoncesDeLaDefinition(vue);
  return (
    <>
      <BarreDesFiltres vue={vue} />
      <BarreDesTris vue={vue} />
    </>
  );
}
