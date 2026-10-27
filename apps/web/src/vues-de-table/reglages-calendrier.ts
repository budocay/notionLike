// Section `calendrier` des réglages de vue de l'appareil (F-021-AC6, AC30, H6) : la colonne de date
// choisie, par identifiant de colonne. Écrite seule, sans toucher aux autres sections ni aux clés que
// cette version ne connaît pas ; jamais dans un document Yjs. Le mois affiché n'y est pas : il vit en
// mémoire, par onglet (AC2).
import type { IdColonne } from "@notionlike/document";
import { useState } from "react";

import { ecrireReglagesDeVue, lireReglagesDeVue } from "../persistance/index.ts";

export const SECTION_CALENDRIER = "calendrier";
const CLE_DE_LA_COLONNE = "colonne";

function estUnObjet(valeur: unknown): valeur is Readonly<Record<string, unknown>> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

/** La colonne d'une section lue ; aucune si la section est mal formée. */
export function colonneChoisieLue(section: unknown): IdColonne | undefined {
  if (!estUnObjet(section)) {
    return undefined;
  }
  const colonne = section[CLE_DE_LA_COLONNE];
  return typeof colonne === "string" && colonne !== "" ? colonne : undefined;
}

/**
 * La section à écrire : la colonne choisie remplace celle de la section lue, les autres clés sont
 * gardées ; `undefined` (section retirée) quand il ne reste aucune clé.
 */
export function sectionDuCalendrier(colonne: IdColonne | undefined, sectionLue: unknown): unknown {
  const autres = estUnObjet(sectionLue)
    ? Object.entries(sectionLue).filter(([nom]) => nom !== CLE_DE_LA_COLONNE)
    : [];
  const section = Object.fromEntries(
    colonne === undefined ? autres : [...autres, [CLE_DE_LA_COLONNE, colonne]],
  );
  return Object.keys(section).length === 0 ? undefined : section;
}

interface Designation {
  readonly idEspace: string | undefined;
  readonly idTable: string;
}

function cleDe({ idEspace, idTable }: Designation) {
  // Un espace encore inconnu ne désigne aucune clé : aucun choix n'est lu.
  return { idEspace: idEspace ?? "", idTable };
}

/** Le choix de colonne de date de la table, relu si la désignation change ; écrit à chaque choix. */
export function useColonneChoisie(
  designation: Designation,
): readonly [IdColonne | undefined, (colonne: IdColonne) => void] {
  const { idEspace, idTable } = designation;
  const lire = (): IdColonne | undefined =>
    colonneChoisieLue(lireReglagesDeVue(cleDe(designation))[SECTION_CALENDRIER]);
  const [tenu, setTenu] = useState({ idEspace, idTable, colonne: lire() });
  let { colonne } = tenu;
  if (tenu.idEspace !== idEspace || tenu.idTable !== idTable) {
    colonne = lire();
    setTenu({ idEspace, idTable, colonne });
  }
  const choisir = (suivante: IdColonne): void => {
    setTenu({ idEspace, idTable, colonne: suivante });
    const cle = cleDe(designation);
    ecrireReglagesDeVue(cle, {
      [SECTION_CALENDRIER]: sectionDuCalendrier(
        suivante,
        lireReglagesDeVue(cle)[SECTION_CALENDRIER],
      ),
    });
  };
  return [colonne, choisir];
}
