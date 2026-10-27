// Saisie du titre d'une entrée dans le calendrier (F-021-AC10) : ouverte par Entrée ou F2, ou sur une
// ligne que le calendrier vient de créer ; validée et annulée comme une cellule `texte` (F-018-AC27,
// AC32) : Entrée et la sortie du champ valident, Échap abandonne, un refus garde le champ ouvert.
import type { DocumentTable, IdLigne, LigneLue } from "@notionlike/document";
import { useState } from "react";

import type { ModeleDuCalendrier } from "./modele-calendrier.ts";
import type { SuiviDuFocus } from "./use-suivi-du-focus.ts";
import { validerLeChamp, valeurDe } from "./valider.ts";

export interface SaisieDuTitre {
  readonly ligne: IdLigne;
  readonly texte: string;
  readonly erreur: string | undefined;
}

export interface Saisie {
  readonly saisie: SaisieDuTitre | undefined;
  readonly ouvrir: (ligne: LigneLue) => void;
  /** Ouvre la saisie d'une ligne qui vient d'être créée, vide. */
  readonly ouvrirNeuve: (ligne: IdLigne) => void;
  readonly changer: (texte: string) => void;
  /** Rend vrai si la saisie est validée ou n'a plus d'objet ; faux si le document la refuse. */
  readonly valider: (suite: string) => boolean;
  readonly abandonner: () => void;
}

interface Moyens {
  readonly table: DocumentTable;
  readonly modele: ModeleDuCalendrier;
  readonly lectureSeule: string | undefined;
  readonly suivi: SuiviDuFocus;
  readonly signaler: (message: string | undefined) => void;
}

function saisieDe(ligne: LigneLue, rang: number): SaisieDuTitre {
  const valeur = ligne.cellules[rang];
  return { ligne: ligne.id, texte: typeof valeur === "string" ? valeur : "", erreur: undefined };
}

export function useSaisieDuTitre({ table, modele, lectureSeule, suivi, signaler }: Moyens): Saisie {
  const [saisie, setSaisie] = useState<SaisieDuTitre | undefined>(undefined);
  const rendreLeFocus = (ligne: IdLigne): void => {
    const jour = modele.jourDansLaGrille(ligne);
    if (jour !== undefined) {
      suivi.suivre({ sorte: "entree", ligne, jour });
    }
  };
  const valider = (suite: string): boolean => {
    const ligne = saisie === undefined ? undefined : modele.ligneDe(saisie.ligne);
    const colonne = modele.titreDeColonne;
    if (saisie === undefined || ligne === undefined || colonne === undefined) {
      setSaisie(undefined);
      return true;
    }
    const cible = { ligne: ligne.id, colonne, avant: valeurDe(ligne, modele.rangDuTitre) };
    const refus = validerLeChamp(table, cible, saisie.texte);
    signaler(refus);
    if (refus !== undefined) {
      setSaisie({ ...saisie, erreur: refus });
      return false;
    }
    setSaisie(undefined);
    if (suite !== "sortie") {
      rendreLeFocus(ligne.id);
    }
    return true;
  };
  return {
    // Une ligne disparue pendant la saisie (mise à jour reçue) la ferme.
    saisie: saisie !== undefined && modele.ligneDe(saisie.ligne) !== undefined ? saisie : undefined,
    ouvrir: (ligne) => {
      if (lectureSeule === undefined && modele.rangDuTitre >= 0) {
        setSaisie(saisieDe(ligne, modele.rangDuTitre));
      }
    },
    ouvrirNeuve: (ligne) => setSaisie({ ligne, texte: "", erreur: undefined }),
    changer: (texte) =>
      setSaisie(saisie === undefined ? undefined : { ...saisie, texte, erreur: undefined }),
    valider,
    abandonner: () => {
      signaler(undefined);
      setSaisie(undefined);
      if (saisie !== undefined) {
        rendreLeFocus(saisie.ligne);
      }
    },
  };
}
