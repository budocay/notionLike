// Aides des tests de l'éditeur dans l'application : une page créée et ouverte par l'interface, son
// document relu depuis l'appareil simulé.
import { act, screen } from "@testing-library/react";
import * as Y from "yjs";

import { ouvrirPersistance } from "../src/persistance/index.ts";
import {
  boutonNouvellePage,
  type CoquilleRendue,
  ouvrirCoquille,
  saisirTitre,
} from "./aides-coquille.tsx";
import { ouvrirFacadeDePage } from "./aides-facade-page.ts";
import { attendreEtat, laisserIndexedDbTravailler } from "./aides-persistance.ts";
import { attendreLaZoneDeSaisie } from "./edition/aides-edition.tsx";

export interface PageOuverte extends CoquilleRendue {
  readonly idEspace: string;
  readonly idPage: string;
}

export function idEspaceDe(coquille: CoquilleRendue): string {
  const etat = coquille.session.lireEtat();
  if (etat.phase !== "pret" || etat.idEspace === undefined) {
    throw new Error("L'espace n'est pas ouvert, ou son identifiant n'est pas connu.");
  }
  return etat.idEspace;
}

/** Identifiant de la page que l'adresse désigne. */
export function idPageCourante(): string {
  return decodeURIComponent(window.location.hash.replace(/^#\/page\//, ""));
}

/** Crée une page par la barre latérale, lui donne un titre, et attend son éditeur. */
export async function creerUnePage(coquille: CoquilleRendue, titre: string): Promise<PageOuverte> {
  await coquille.utilisateur.click(await boutonNouvellePage());
  await saisirTitre(coquille.utilisateur, titre);
  await attendreLaZoneDeSaisie();
  await act(() => laisserIndexedDbTravailler());
  return { ...coquille, idEspace: idEspaceDe(coquille), idPage: idPageCourante() };
}

/** Ouvre l'application, crée une page et attend son éditeur. */
export async function ouvrirUnePage(titre = "Page d'essai"): Promise<PageOuverte> {
  return creerUnePage(await ouvrirCoquille(), titre);
}

/** Sélectionne une page par son lien de la barre latérale. */
export async function selectionner(coquille: CoquilleRendue, titre: string): Promise<void> {
  await coquille.utilisateur.click(screen.getByRole("link", { name: titre }));
}

/** Contenu lu d'un fragment : la suite de ses blocs, types, niveaux, imbrication et texte. */
export function contenuLu(doc: Y.Doc): string {
  return ouvrirFacadeDePage(doc).contenu.toString();
}

/**
 * Contenu lu de la base d'une page, relue dans un document vierge par le module de persistance :
 * ce qu'un rechargement retrouverait.
 */
export async function contenuEnregistre(idEspace: string, idPage: string): Promise<string> {
  const doc = new Y.Doc();
  const persistance = ouvrirPersistance(doc, { type: "page", idEspace, idPage });
  await attendreEtat(persistance, "active");
  const contenu = contenuLu(doc);
  persistance.fermer();
  return contenu;
}
