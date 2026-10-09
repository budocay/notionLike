// Aides des tests de la coquille : rendu par le point d'entrée de l'interface, mises à jour reçues.
import type { DocumentEspace } from "@notionlike/document";
import {
  act,
  cleanup,
  fireEvent,
  render,
  type RenderResult,
  screen,
  within,
} from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, expect, vi } from "vitest";
import * as Y from "yjs";

import type { SessionEspace } from "../src/espace/session-espace.ts";
import { Application } from "../src/interface/Application.tsx";
import { demarrerSession, ouvrirFacade } from "./aides-facade.ts";
import { ecrireLaVersion, VERSION_NON_PRISE_EN_CHARGE } from "./aides-format.ts";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  // Sans événement `hashchange` : le test suivant part de l'accueil, sans notification en retard.
  window.history.replaceState(null, "", window.location.pathname);
});

export interface CoquilleRendue {
  readonly session: SessionEspace;
  readonly utilisateur: UserEvent;
}

/** Rend une session comme l'entrée le fait : sous `StrictMode`, par le point d'entrée de l'interface. */
export function rendreSession(session: SessionEspace): RenderResult {
  return render(
    <StrictMode>
      <Application session={session} />
    </StrictMode>,
  );
}

/** Démarre une session et rend l'application, sans attendre la fin du chargement. */
export function rendreApplication(): CoquilleRendue {
  const session = demarrerSession();
  rendreSession(session);
  return { session, utilisateur: userEvent.setup() };
}

/** Rend l'application et attend la barre latérale. */
export async function ouvrirCoquille(): Promise<CoquilleRendue> {
  const coquille = rendreApplication();
  await boutonNouvellePage();
  return coquille;
}

/**
 * Fermeture de l'onglet : l'application est démontée et sa session fermée. L'adresse et l'appareil
 * simulé restent, comme dans un navigateur.
 */
export function fermerLOnglet(coquille: CoquilleRendue): void {
  cleanup();
  coquille.session.fermer();
}

/** Rechargement de l'onglet : fermeture, puis une nouvelle session démarrée et rendue. */
export function recharger(coquille: CoquilleRendue): Promise<CoquilleRendue> {
  fermerLOnglet(coquille);
  return ouvrirCoquille();
}

export function boutonNouvellePage(): Promise<HTMLElement> {
  return screen.findByRole("button", { name: "Nouvelle page" });
}

export function docDe(session: SessionEspace): Y.Doc {
  if (session.doc === undefined) {
    throw new Error("La session n'a pas de document.");
  }
  return session.doc;
}

/** Mise à jour produite par une autre réplique, partie de l'état courant de la session. */
export function miseAJourDUneAutreReplique(
  session: SessionEspace,
  modifier: (espace: DocumentEspace) => void,
): Uint8Array {
  const replique = new Y.Doc();
  Y.applyUpdate(replique, Y.encodeStateAsUpdate(docDe(session)));
  const etatAvant = Y.encodeStateVector(replique);
  modifier(ouvrirFacade(replique));
  return Y.encodeStateAsUpdate(replique, etatAvant);
}

/** La session reçoit une mise à jour, comme la synchronisation la livrera (F-013). */
export function recevoir(session: SessionEspace, modifier: (espace: DocumentEspace) => void): void {
  const miseAJour = miseAJourDUneAutreReplique(session, modifier);
  act(() => Y.applyUpdate(docDe(session), miseAJour));
}

/** Ce qu'une réplique tenue par une application plus récente enverrait : la version seule change. */
export function versionInconnueVenueDAilleurs(session: SessionEspace): Uint8Array {
  const replique = new Y.Doc();
  Y.applyUpdate(replique, Y.encodeStateAsUpdate(docDe(session)));
  const etatAvant = Y.encodeStateVector(replique);
  ecrireLaVersion(replique, VERSION_NON_PRISE_EN_CHARGE);
  return Y.encodeStateAsUpdate(replique, etatAvant);
}

export function etatEncode(session: SessionEspace): number[] {
  return [...Y.encodeStateAsUpdate(docDe(session))];
}

/** Valide la saisie de titre ouverte, avec le titre donné. */
export async function saisirTitre(utilisateur: UserEvent, titre: string): Promise<void> {
  const champ = await screen.findByRole("textbox", { name: "Titre de la page" });
  await utilisateur.clear(champ);
  if (titre !== "") {
    await utilisateur.type(champ, titre);
  }
  await utilisateur.keyboard("{Enter}");
}

// Avance au clavier seul jusqu'à la commande voulue, où qu'elle soit dans l'ordre de tabulation.
const TABULATIONS_MAX = 20;
export async function tabulerJusqua(
  utilisateur: UserEvent,
  commande: () => HTMLElement,
  sens: { shift?: boolean } = {},
): Promise<void> {
  for (let pas = 0; pas < TABULATIONS_MAX && document.activeElement !== commande(); pas += 1) {
    await utilisateur.tab(sens);
  }
  expect(document.activeElement).toBe(commande());
}

export type ActionDeRangeeVisee = "renommer" | "ajouter-une-sous-page" | "mettre-a-la-corbeille";

/** Entrées du menu « ⋯ » d'une rangée, dans l'ordre où il les affiche (F-004-AC26). */
export const ENTREES_DU_MENU = ["Renommer", "Ajouter une sous-page", "Mettre à la corbeille"];

const ENTREE_DE_L_ACTION: Readonly<Record<ActionDeRangeeVisee, string>> = {
  renommer: "Renommer",
  "ajouter-une-sous-page": "Ajouter une sous-page",
  "mettre-a-la-corbeille": "Mettre à la corbeille",
};

// Le nom accessible calculé est mis à plat par l'outil de test : le nom attendu l'est de même.
function aPlat(texte: string): string {
  return texte.trim().replace(/\s+/gu, " ");
}

function nomme(attendu: string): (nom: string) => boolean {
  return (nom) => aPlat(nom) === aPlat(attendu);
}

export function nomDuMenu(titre: string): string {
  return `Actions de la page « ${titre} »`;
}

export function nomAjouterSousPage(titre: string): string {
  return `Ajouter une sous-page à « ${titre} »`;
}

/** Nom de la commande de repli : il ne dit plus l'état, que porte `aria-expanded` (F-004-AC56). */
export function nomDuRepli(titre: string): string {
  return `Sous-pages de « ${titre} »`;
}

/** Bouton « ⋯ » de la page au titre affiché donné. */
export function boutonDuMenu(titre: string): Promise<HTMLElement> {
  return screen.findByRole("button", { name: nomme(nomDuMenu(titre)) });
}

/**
 * Seul chemin des tests vers une action de rangée : la commande de la page au titre affiché donné,
 * retrouvée par son rôle et son nom accessible, prête à être activée. Depuis F-004, « Renommer » et
 * « Mettre à la corbeille » sont des entrées du menu « ⋯ » de la rangée, que ce chemin ouvre ;
 * « Ajouter une sous-page » reste un bouton de la rangée (F-004-AC25, AC26).
 */
export async function atteindreActionDeRangee(
  action: ActionDeRangeeVisee,
  titre: string,
): Promise<HTMLElement> {
  if (action === "ajouter-une-sous-page") {
    return screen.findByRole("button", { name: nomme(nomAjouterSousPage(titre)) });
  }
  const bouton = await boutonDuMenu(titre);
  if (bouton.getAttribute("aria-expanded") !== "true") {
    fireEvent.click(bouton);
  }
  const menu = await screen.findByRole("menu", { name: nomme(nomDuMenu(titre)) });
  return within(menu).getByRole("menuitem", { name: ENTREE_DE_L_ACTION[action] });
}

export async function activerActionDeRangee(
  utilisateur: UserEvent,
  action: ActionDeRangeeVisee,
  titre: string,
): Promise<void> {
  if (action !== "ajouter-une-sous-page") {
    await utilisateur.click(await boutonDuMenu(titre));
  }
  await utilisateur.click(await atteindreActionDeRangee(action, titre));
}

/** Même action, au clavier seul : tabulation jusqu'à la commande, flèches dans le menu, Entrée. */
export async function activerActionDeRangeeAuClavier(
  utilisateur: UserEvent,
  action: ActionDeRangeeVisee,
  titre: string,
  touche = "{Enter}",
): Promise<void> {
  if (action === "ajouter-une-sous-page") {
    const bouton = await atteindreActionDeRangee(action, titre);
    await tabulerJusqua(utilisateur, () => bouton);
    await utilisateur.keyboard(touche);
    return;
  }
  const bouton = await boutonDuMenu(titre);
  await tabulerJusqua(utilisateur, () => bouton);
  await utilisateur.keyboard("{Enter}");
  const entrees = within(
    await screen.findByRole("menu", { name: nomme(nomDuMenu(titre)) }),
  ).getAllByRole("menuitem");
  expect(document.activeElement).toBe(entrees[0]);
  const rang = ENTREES_DU_MENU.indexOf(ENTREE_DE_L_ACTION[action]);
  for (let pas = 0; pas < rang; pas += 1) {
    await utilisateur.keyboard("{ArrowDown}");
  }
  expect(document.activeElement).toBe(entrees[rang]);
  await utilisateur.keyboard(touche);
}

/**
 * Nom du menu « ⋯ » de la page et libellés de ses entrées, tels que les attributs les portent ; le
 * menu est refermé par Échap et le focus rendu à l'élément qui l'avait.
 */
export async function commandesDuMenu(titre: string): Promise<string[]> {
  const avant = document.activeElement;
  const entree = await atteindreActionDeRangee("renommer", titre);
  const menu = entree.closest('[role="menu"]');
  const noms = [
    menu?.getAttribute("aria-label") ?? "",
    ...within(menu as HTMLElement)
      .getAllByRole("menuitem")
      .map((element) => element.firstChild?.textContent ?? ""),
  ];
  fireEvent.keyDown(entree, { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  if (avant instanceof HTMLElement && avant.isConnected) {
    act(() => avant.focus());
  }
  return noms;
}

/** Crée une page à la racine et lui donne un titre. */
export async function creerPageNommee(utilisateur: UserEvent, titre: string): Promise<void> {
  await utilisateur.click(await boutonNouvellePage());
  await saisirTitre(utilisateur, titre);
  await screen.findByRole("link", { name: titre });
}

/**
 * Titres de la barre latérale, une liste par fratrie, dans l'ordre d'apparition : les racines,
 * puis les sous-pages de chaque page dépliée. La liste affichée est plate ; la hiérarchie se lit
 * dans `aria-level`.
 */
export function titresParFratrie(barre: HTMLElement): string[][] {
  const fratries: string[][] = [];
  const ouvertes: string[][] = [];
  within(barre)
    .queryAllByRole("listitem")
    .forEach((rangee) => {
      const niveau = Number(rangee.getAttribute("aria-level"));
      ouvertes.length = niveau;
      let fratrie = ouvertes[niveau - 1];
      if (fratrie === undefined) {
        fratrie = [];
        ouvertes[niveau - 1] = fratrie;
        fratries.push(fratrie);
      }
      fratrie.push(rangee.querySelector("a")?.textContent ?? "");
    });
  return fratries;
}
