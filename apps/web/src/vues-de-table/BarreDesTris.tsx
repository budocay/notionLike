// Barre « Tris » (F-019-AC7, AC23 à AC27) : la liste des tris de la définition de la table, la même
// pour toutes ses vues. Un tri ajouté commence sur la première colonne libre ; une colonne n'a
// qu'un tri. Les refus passent par l'alerte de la vue.
import type { ReactElement } from "react";

import { Bouton, Choix } from "../interface/composants/Espaces.tsx";
import {
  BarreDeDefinition,
  ElementDeDefinition,
  ListeDeDefinition,
} from "../interface/composants/Table.tsx";
import { LIMITE_DE_TRIS, remplacerA, type Tri } from "./definition.ts";
import {
  AJOUTER_UN_TRI,
  COLONNE_INTROUVABLE,
  COLONNE_SUPPRIMEE,
  DESCENDRE_UN_TRI,
  descendreLeTri,
  LIBELLES_DES_SENS,
  LISTE_DES_TRIS,
  MONTER_UN_TRI,
  monterLeTri,
  nomAffiche,
  nomDeLaColonneDuTri,
  nomDuSensDuTri,
  nombreDeTris,
  RETIRER_UN_ELEMENT,
  retirerLeTri,
  TOUTES_LES_COLONNES_SONT_TRIEES,
  TRIS,
  TROP_DE_TRIS,
} from "./textes.ts";
import { colonneDuTri } from "./tris.ts";
import {
  AJOUTER,
  cleDuBouton,
  type FocusDeLaListe,
  useFocusDeLaListe,
} from "./use-focus-de-la-liste.ts";
import type { VueTableau } from "./use-vue-tableau.ts";

type TableLue = VueTableau["proprietes"]["lue"];
type ColonneLue = TableLue["colonnes"][number];

interface Props {
  readonly vue: VueTableau;
}

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

/** Les tris où celui de `rang` et celui de `vers` ont échangé leur place. */
function trisEchanges(
  tris: readonly Tri[],
  rang: number,
  vers: number,
): readonly Tri[] | undefined {
  const tri = tris[rang];
  const autre = tris[vers];
  if (tri === undefined || autre === undefined) {
    return undefined;
  }
  return tris.map((un, i) => (i === rang ? autre : i === vers ? tri : un));
}

function BoutonsDeLigneDeTri(props: {
  readonly vue: VueTableau;
  readonly rang: number;
  readonly focus: FocusDeLaListe;
  readonly colonne: ColonneLue | undefined;
  readonly retirer: () => void;
}): ReactElement {
  const { vue, rang, focus, colonne, retirer } = props;
  const { definition, changer } = vue.definition;
  // Le focus suit le tri déplacé ; à une extrémité le bouton est inactif : l'autre le reçoit.
  const echanger = (vers: number, candidats: readonly string[]): void => {
    const tris = trisEchanges(definition.tris, rang, vers);
    if (tris !== undefined) {
      focus.apres(candidats);
      changer({ ...definition, tris });
    }
  };
  return (
    <>
      <Bouton
        libelle={MONTER_UN_TRI}
        nom={monterLeTri(colonne?.nom)}
        desactive={rang === 0}
        refBouton={focus.bouton(cleDuBouton("monter", rang))}
        surActivation={() =>
          echanger(rang - 1, [cleDuBouton("monter", rang - 1), cleDuBouton("descendre", rang - 1)])
        }
      />
      <Bouton
        libelle={DESCENDRE_UN_TRI}
        nom={descendreLeTri(colonne?.nom)}
        desactive={rang === definition.tris.length - 1}
        refBouton={focus.bouton(cleDuBouton("descendre", rang))}
        surActivation={() =>
          echanger(rang + 1, [cleDuBouton("descendre", rang + 1), cleDuBouton("monter", rang + 1)])
        }
      />
      <Bouton
        libelle={RETIRER_UN_ELEMENT}
        nom={retirerLeTri(colonne?.nom)}
        refBouton={focus.bouton(cleDuBouton("retirer", rang))}
        surActivation={retirer}
      />
    </>
  );
}

function LigneDeTri(props: {
  readonly vue: VueTableau;
  readonly rang: number;
  readonly focus: FocusDeLaListe;
}): ReactElement | null {
  const { vue, rang, focus } = props;
  const { lue } = vue.proprietes;
  const { definition, changer } = vue.definition;
  const tri = definition.tris[rang];
  if (tri === undefined) {
    return null;
  }
  const colonne = colonneDuTri(lue, tri);
  const remplacer = (suivant: Tri | undefined): void =>
    changer({ ...definition, tris: remplacerA(definition.tris, rang, suivant) });
  // Le focus passe au tri qui prend la place de celui-ci, sinon au précédent.
  const retirer = (): void => {
    focus.apres([cleDuBouton("retirer", rang), cleDuBouton("retirer", rang - 1), AJOUTER]);
    remplacer(undefined);
  };
  return (
    <ElementDeDefinition mention={colonne === undefined ? COLONNE_SUPPRIMEE : undefined}>
      <ChoixDeColonneEtDeSens lue={lue} tris={definition.tris} tri={tri} remplacer={remplacer} />
      <BoutonsDeLigneDeTri
        vue={vue}
        rang={rang}
        focus={focus}
        colonne={colonne}
        retirer={retirer}
      />
    </ElementDeDefinition>
  );
}

export function BarreDesTris({ vue }: Props): ReactElement {
  const { lue } = vue.proprietes;
  const { definition, changer } = vue.definition;
  const focus = useFocusDeLaListe(definition);
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
      commandes={
        <Bouton
          libelle={AJOUTER_UN_TRI}
          refBouton={focus.bouton(AJOUTER)}
          surActivation={ajouter}
        />
      }
    >
      {definition.tris.length > 0 && (
        <ListeDeDefinition nom={LISTE_DES_TRIS}>
          {definition.tris.map((_, rang) => (
            // Un tri se désigne par sa place : changer sa colonne ne remonte pas la ligne, le focus reste.
            <LigneDeTri key={rang} vue={vue} rang={rang} focus={focus} />
          ))}
        </ListeDeDefinition>
      )}
    </BarreDeDefinition>
  );
}
