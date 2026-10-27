// Barres « Filtres » et « Tris » (F-019-AC1, AC6, AC7, AC23 à AC27) : la définition de la table, la
// même pour toutes ses vues. Un élément ajouté commence sur la première colonne libre et se règle sur
// place : colonne, opérateur, valeur ; un filtre sans valeur est sans effet jusqu'à sa saisie. Les
// annonces passent par la zone d'annonce de la vue, les refus par son alerte ; toute valeur est
// rendue comme du texte (AC26).
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
  LIMITE_DE_TRIS,
  type OperateurDeFiltre,
  operateursDe,
  type Tri,
} from "./definition.ts";
import { etatDuFiltre } from "./filtres.ts";
import {
  AFFICHAGE_FIGE,
  AJOUTER_UN_FILTRE,
  AJOUTER_UN_TRI,
  CHOISIR_UNE_OPTION,
  COLONNE_INTROUVABLE,
  COLONNE_SUPPRIMEE,
  DESCENDRE_UN_TRI,
  descendreLeTri,
  FILTRES,
  LIBELLES_DES_OPERATEURS,
  LIBELLES_DES_SENS,
  LISTE_DES_FILTRES,
  LISTE_DES_TRIS,
  libelleAffiche,
  lignesSurTotal,
  MONTER_UN_TRI,
  monterLeTri,
  nomAffiche,
  nomDeLOperateur,
  nomDeLaColonneDuFiltre,
  nomDeLaColonneDuTri,
  nomDeLaValeurDuFiltre,
  nomDuSensDuTri,
  nombreDeFiltres,
  nombreDeTris,
  OPTION_INTROUVABLE,
  OPTION_SUPPRIMEE,
  REAPPLIQUER,
  RETIRER_UN_ELEMENT,
  retirerLeFiltre,
  retirerLeTri,
  TOUT_EFFACER,
  TOUTES_LES_COLONNES_SONT_TRIEES,
  TRIS,
  TROP_DE_FILTRES,
  TROP_DE_TRIS,
} from "./textes.ts";
import { colonneDuTri } from "./tris.ts";
import type { VueTableau } from "./use-vue-tableau.ts";
import { analyserLaValeur, texteDeLaValeur } from "./valeur-de-filtre.ts";

const DATE_MIN = "0001-01-01";
const DATE_MAX = "9999-12-31";

interface Props {
  readonly vue: VueTableau;
}
interface PropsDeRang extends Props {
  readonly rang: number;
}

function remplacerA<T>(liste: readonly T[], rang: number, element: T | undefined): T[] {
  return liste.flatMap((un, i) => (i === rang ? (element === undefined ? [] : [element]) : [un]));
}

// ── Filtres ──────────────────────────────────────────────────────────────────────────────────────

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
  const [refuse, setRefuse] = useState(false);
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

function LigneDeFiltre({ vue, rang }: PropsDeRang): ReactElement | null {
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
        surActivation={() => remplacer(undefined)}
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

function BarreDesFiltres({ vue }: Props): ReactElement {
  const { lue, lignes } = vue.proprietes;
  const { definition, changer, total, fige, reappliquer } = vue.definition;
  const ajouter = (): void => {
    const colonne = lue.colonnes[0];
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
  };
  return (
    <BarreDeDefinition
      nom={FILTRES}
      resume={`${nombreDeFiltres(definition.filtres.length)} · ${lignesSurTotal(lignes.length, total)}`}
      commandes={
        <>
          <Bouton libelle={AJOUTER_UN_FILTRE} surActivation={ajouter} />
          {definition.filtres.length > 0 && (
            <Bouton
              libelle={TOUT_EFFACER}
              surActivation={() => {
                vue.moyens.signaler(undefined);
                changer({ ...definition, filtres: [] });
              }}
            />
          )}
          {fige && <Bouton libelle={REAPPLIQUER} surActivation={reappliquer} />}
        </>
      }
    >
      {definition.filtres.length > 0 && (
        <ListeDeDefinition nom={LISTE_DES_FILTRES}>
          {definition.filtres.map((_, rang) => (
            // Un filtre n'a pas d'identité propre : sa place dans la liste le désigne.
            <LigneDeFiltre key={rang} vue={vue} rang={rang} />
          ))}
        </ListeDeDefinition>
      )}
    </BarreDeDefinition>
  );
}

// ── Tris ─────────────────────────────────────────────────────────────────────────────────────────

function ChoixDeColonneEtDeSens(props: {
  readonly lue: TableLue;
  readonly tris: readonly Tri[];
  readonly tri: Tri;
  readonly remplacer: (tri: Tri) => void;
}): ReactElement {
  const { lue, tris, tri, remplacer } = props;
  const colonne = colonneDuTri(lue, tri);
  // Une colonne n'a qu'un tri : celles qui en ont déjà un ne sont pas proposées (AC7).
  const libres = lue.colonnes.filter(
    ({ id }) => id === tri.colonne || !tris.some((autre) => autre.colonne === id),
  );
  return (
    <>
      <Choix
        nom={nomDeLaColonneDuTri(colonne?.nom)}
        valeur={tri.colonne}
        options={[
          ...(colonne === undefined ? [{ valeur: tri.colonne, libelle: COLONNE_INTROUVABLE }] : []),
          ...libres.map(({ id, nom }) => ({ valeur: id, libelle: nomAffiche(nom) })),
        ]}
        surChoix={(id) => remplacer({ ...tri, colonne: id })}
      />
      <Choix
        nom={nomDuSensDuTri(colonne?.nom)}
        valeur={tri.sens}
        options={(["croissant", "decroissant"] as const).map((sens) => ({
          valeur: sens,
          libelle: LIBELLES_DES_SENS[sens],
        }))}
        surChoix={(sens) => {
          if (sens === "croissant" || sens === "decroissant") {
            remplacer({ ...tri, sens });
          }
        }}
      />
    </>
  );
}

function LigneDeTri({ vue, rang }: PropsDeRang): ReactElement | null {
  const { lue } = vue.proprietes;
  const { definition, changer } = vue.definition;
  const tri = definition.tris[rang];
  if (tri === undefined) {
    return null;
  }
  const colonne = colonneDuTri(lue, tri);
  const remplacer = (suivant: Tri | undefined): void =>
    changer({ ...definition, tris: remplacerA(definition.tris, rang, suivant) });
  const echanger = (vers: number): void => {
    const autre = definition.tris[vers];
    if (autre !== undefined) {
      const tris = definition.tris.map((un, i) => (i === rang ? autre : i === vers ? tri : un));
      changer({ ...definition, tris });
    }
  };
  return (
    <ElementDeDefinition mention={colonne === undefined ? COLONNE_SUPPRIMEE : undefined}>
      <ChoixDeColonneEtDeSens lue={lue} tris={definition.tris} tri={tri} remplacer={remplacer} />
      <Bouton
        libelle={MONTER_UN_TRI}
        nom={monterLeTri(colonne?.nom)}
        desactive={rang === 0}
        surActivation={() => echanger(rang - 1)}
      />
      <Bouton
        libelle={DESCENDRE_UN_TRI}
        nom={descendreLeTri(colonne?.nom)}
        desactive={rang === definition.tris.length - 1}
        surActivation={() => echanger(rang + 1)}
      />
      <Bouton
        libelle={RETIRER_UN_ELEMENT}
        nom={retirerLeTri(colonne?.nom)}
        surActivation={() => remplacer(undefined)}
      />
    </ElementDeDefinition>
  );
}

function BarreDesTris({ vue }: Props): ReactElement {
  const { lue } = vue.proprietes;
  const { definition, changer } = vue.definition;
  const ajouter = (): void => {
    const libre = lue.colonnes.find(({ id }) => !definition.tris.some((tri) => tri.colonne === id));
    if (definition.tris.length >= LIMITE_DE_TRIS) {
      vue.moyens.signaler(TROP_DE_TRIS);
    } else if (libre === undefined) {
      vue.moyens.signaler(TOUTES_LES_COLONNES_SONT_TRIEES);
    } else {
      vue.moyens.signaler(undefined);
      changer({
        ...definition,
        tris: [...definition.tris, { colonne: libre.id, sens: "croissant" }],
      });
    }
  };
  return (
    <BarreDeDefinition
      nom={TRIS}
      resume={nombreDeTris(definition.tris.length)}
      commandes={<Bouton libelle={AJOUTER_UN_TRI} surActivation={ajouter} />}
    >
      {definition.tris.length > 0 && (
        <ListeDeDefinition nom={LISTE_DES_TRIS}>
          {definition.tris.map((tri, rang) => (
            <LigneDeTri key={tri.colonne} vue={vue} rang={rang} />
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
  const annoncerLeCompte = useEffectEvent(() =>
    vue.moyens.annoncer(lignesSurTotal(lignes.length, total)),
  );
  const annoncerLeGel = useEffectEvent(() => vue.moyens.annoncer(AFFICHAGE_FIGE));
  useEffect(() => {
    if (precedente.current.definition !== definition) {
      annoncerLeCompte();
    }
    if (!precedente.current.fige && fige) {
      annoncerLeGel();
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
