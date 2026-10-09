// Aides des tests de la coquille : rendu par le point d'entrée de l'interface, mises à jour reçues.
import { type DocumentEspace, ouvrirDocumentEspace } from "@notionlike/document";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, vi } from "vitest";
import * as Y from "yjs";

import { demarrerSessionEspace, type SessionEspace } from "../src/espace/session-espace.ts";
import { Application } from "../src/interface/Application.tsx";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  // Sans événement `hashchange` : le test suivant part de l'accueil, sans notification en retard.
  window.history.replaceState(null, "", window.location.pathname);
});

export interface Coquille {
  readonly session: SessionEspace;
  readonly utilisateur: UserEvent;
}

/** Rend l'application comme l'entrée le fait, sans attendre la fin du chargement. */
export function rendreApplication(): Coquille {
  const session = demarrerSessionEspace();
  render(
    <StrictMode>
      <Application session={session} />
    </StrictMode>,
  );
  return { session, utilisateur: userEvent.setup() };
}

/** Rend l'application et attend la barre latérale. */
export async function ouvrirCoquille(): Promise<Coquille> {
  const coquille = rendreApplication();
  await boutonNouvellePage();
  return coquille;
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
  modifier(ouvrirDocumentEspace(replique));
  return Y.encodeStateAsUpdate(replique, etatAvant);
}

/** La session reçoit une mise à jour, comme la synchronisation la livrera (F-013). */
export function recevoir(session: SessionEspace, modifier: (espace: DocumentEspace) => void): void {
  const miseAJour = miseAJourDUneAutreReplique(session, modifier);
  act(() => Y.applyUpdate(docDe(session), miseAJour));
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

/** Crée une page à la racine et lui donne un titre. */
export async function creerPageNommee(utilisateur: UserEvent, titre: string): Promise<void> {
  await utilisateur.click(await boutonNouvellePage());
  await saisirTitre(utilisateur, titre);
  await screen.findByRole("link", { name: titre });
}

export async function nomsDesBases(): Promise<string[]> {
  const bases = await indexedDB.databases();
  return bases.map((base) => base.name ?? "").sort();
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
