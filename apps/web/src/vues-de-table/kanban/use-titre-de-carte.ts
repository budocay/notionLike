// Saisie du titre d'une carte (F-020-AC6, AC7) : validée et annulée comme une cellule `texte`
// (F-018-AC27, AC32) — Entrée ou la sortie du champ valident, Échap abandonne, un refus garde la
// saisie ouverte avec son message, rien n'est écrit à la frappe ni si le titre ne change pas.
import type { DocumentTable, IdLigne, LigneLue, TableLue } from "@notionlike/document";
import { type RefObject, useRef, useState } from "react";

import type { Surveillance } from "../ecritures.ts";
import { colonneDeTitre } from "../lignes-affichees.ts";
import { valeurDe, validerLeChamp } from "../valider.ts";
import { PAS_DE_COLONNE_DE_TITRE } from "./textes.ts";

export interface SaisieDeTitre {
  readonly carte: IdLigne;
  readonly texte: string;
  readonly erreur: string | undefined;
}

export interface TitreDeCarte {
  readonly saisie: SaisieDeTitre | undefined;
  readonly champ: RefObject<HTMLInputElement | null>;
  /** Vrai si la table a une colonne de titre : sinon la saisie est indisponible (AC7). */
  readonly possible: boolean;
  readonly commencer: (carte: IdLigne, texte: string) => void;
  readonly changer: (texte: string) => void;
  /** Valide la saisie ; vrai si elle est close (écrite, ou sans changement). */
  readonly valider: (sortie: boolean) => boolean;
  readonly abandonner: () => void;
}

interface MoyensDuTitre {
  readonly table: DocumentTable;
  readonly lue: TableLue;
  readonly lignes: readonly LigneLue[];
  readonly lectureSeule: string | undefined;
  /** L'affichage figé est prévenu de l'écriture du titre (F-019-AC17). */
  readonly surveillance: Surveillance;
  readonly signaler: (message: string | undefined) => void;
  /** Rend le focus à la carte, la saisie close. */
  readonly rendre: (carte: IdLigne) => void;
}

// Écrit la saisie dans la cellule de titre ; `undefined` : écrite, sans changement, ou sans objet
// (ligne ou colonne disparue après une mise à jour reçue), sinon le message du refus.
function enregistrer(moyens: MoyensDuTitre, saisie: SaisieDeTitre): string | undefined {
  const { lue, lignes, table } = moyens;
  const colonne = colonneDeTitre(lue);
  const ligne = lignes.find(({ id }) => id === saisie.carte);
  if (colonne === undefined || ligne === undefined) {
    return undefined;
  }
  const rang = lue.colonnes.findIndex(({ id }) => id === colonne.id);
  return validerLeChamp(
    table,
    { ligne: saisie.carte, colonne, avant: valeurDe(ligne, rang) },
    saisie.texte,
    moyens.surveillance,
  );
}

export function useTitreDeCarte(moyens: MoyensDuTitre): TitreDeCarte {
  const [saisie, setSaisie] = useState<SaisieDeTitre | undefined>(undefined);
  const ouverte = useRef<IdLigne | undefined>(undefined);
  const champ = useRef<HTMLInputElement>(null);
  const colonne = colonneDeTitre(moyens.lue);
  const clore = (carte: IdLigne): void => {
    ouverte.current = undefined;
    setSaisie(undefined);
    moyens.rendre(carte);
  };
  return {
    saisie,
    champ,
    possible: colonne !== undefined,
    commencer: (carte, texte) => {
      if (moyens.lectureSeule !== undefined) {
        moyens.signaler(moyens.lectureSeule);
      } else if (colonne === undefined) {
        moyens.signaler(PAS_DE_COLONNE_DE_TITRE);
      } else {
        moyens.signaler(undefined);
        ouverte.current = carte;
        setSaisie({ carte, texte, erreur: undefined });
      }
    },
    changer: (texte) => setSaisie((avant) => avant && { ...avant, texte, erreur: undefined }),
    valider: (sortie) => {
      const carte = ouverte.current;
      if (carte === undefined || saisie?.carte !== carte) {
        return true;
      }
      const refus = enregistrer(moyens, saisie);
      if (refus === undefined) {
        clore(carte);
        return true;
      }
      setSaisie({ ...saisie, erreur: refus });
      if (sortie) {
        queueMicrotask(() => champ.current?.focus());
      }
      return false;
    },
    abandonner: () => {
      if (ouverte.current !== undefined) {
        clore(ouverte.current);
      }
    },
  };
}
