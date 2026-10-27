// Aides des tests des barres « Filtres » et « Tris » (F-019) : une table de six lignes dont les colonnes
// couvrent les types, et les gestes sur les barres par leurs noms accessibles.
import type { DocumentTable } from "@notionlike/document";
import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { expect } from "vitest";

import { ESPACE_A } from "../aides-persistance.ts";
import { cleDesReglages } from "../aides-table.ts";
import { TABLE_D_ESSAI, textesDesLignes } from "./aides-grille.tsx";

export const CLE_DES_REGLAGES = cleDesReglages({ idEspace: ESPACE_A, idTable: TABLE_D_ESSAI });

export interface ColonnesDEssai {
  readonly nom: string;
  readonly prix: string;
  readonly etat: string;
  readonly fait: string;
  readonly echeance: string;
  readonly enCours: string;
  readonly termine: string;
}

/** Remplit la table de six lignes (Nom, Prix, État, Fait, Échéance) ; rend les identifiants créés. */
export function remplirSixLignes(table: DocumentTable): ColonnesDEssai {
  const nom = table.creerColonne("Nom", "texte");
  const prix = table.creerColonne("Prix", "nombre");
  const etat = table.creerColonne("État", "selection");
  const fait = table.creerColonne("Fait", "case");
  const echeance = table.creerColonne("Échéance", "date");
  const enCours = table.ajouterOption(etat, "En cours");
  const termine = table.ajouterOption(etat, "Terminé");
  const lignes: readonly [string, number | null, string][] = [
    ["Zèbre", 3, enCours],
    ["abricot", 10, termine],
    ["École", 7, enCours],
    ["ecole", 7, termine],
    ["Banane", null, enCours],
    ["Cerise", 1, termine],
  ];
  for (const [libelle, montant, option] of lignes) {
    const cellules = new Map<string, string | number | boolean>([
      [nom, libelle],
      [etat, option],
    ]);
    if (montant !== null) {
      cellules.set(prix, montant);
    }
    table.creerLigne(cellules);
  }
  return { nom, prix, etat, fait, echeance, enCours, termine };
}

/** Les noms de la première colonne, rangée par rangée, tels que la grille les affiche. */
export function noms(): string[] {
  return textesDesLignes().map(([texte]) => texte ?? "");
}

export function barre(nom: "Filtres" | "Tris"): HTMLElement {
  return screen.getByRole("region", { name: nom });
}

export async function ajouterUnFiltre(utilisateur: UserEvent): Promise<void> {
  await utilisateur.click(
    within(barre("Filtres")).getByRole("button", { name: "Ajouter un filtre" }),
  );
}

export async function ajouterUnTri(utilisateur: UserEvent): Promise<void> {
  await utilisateur.click(within(barre("Tris")).getByRole("button", { name: "Ajouter un tri" }));
}

export async function choisir(utilisateur: UserEvent, nom: string, libelle: string): Promise<void> {
  await utilisateur.selectOptions(screen.getByRole("combobox", { name: nom }), libelle);
}

/** Ajoute un filtre sur une colonne avec un opérateur, et sa valeur quand elle est donnée. */
export async function filtrer(
  utilisateur: UserEvent,
  colonne: { readonly depart: string; readonly cible: string },
  operateur: string,
  valeur?: string,
): Promise<void> {
  await ajouterUnFiltre(utilisateur);
  if (colonne.cible !== colonne.depart) {
    await choisir(utilisateur, `Colonne du filtre sur ${colonne.depart}`, colonne.cible);
  }
  await choisir(utilisateur, `Opérateur du filtre sur ${colonne.cible}`, operateur);
  if (valeur !== undefined) {
    const champ = screen.queryByRole("combobox", { name: `Valeur du filtre sur ${colonne.cible}` });
    if (champ === null) {
      const saisie = screen.getByRole("textbox", { name: `Valeur du filtre sur ${colonne.cible}` });
      await utilisateur.type(saisie, `${valeur}{Enter}`);
    } else {
      await utilisateur.selectOptions(champ, valeur);
    }
  }
}

/** La zone d'annonce de la vue, une fois le texte attendu écrit. */
export async function annonce(texte: string): Promise<void> {
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe(texte));
}
