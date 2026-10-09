// Aides des tests de la coquille : rendu par le point d'entrée de l'interface, mises à jour reçues.
import type { DocumentEspace } from "@notionlike/document";
import { act, cleanup, render, type RenderResult, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, vi } from "vitest";
import * as Y from "yjs";

import type { SessionEspace } from "../src/espace/session-espace.ts";
import { Application } from "../src/interface/Application.tsx";
import { demarrerSession, ouvrirFacade } from "./aides-facade.ts";

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

/** Rend une session comme l'entrée le fait : sous `StrictMode`, par le point d'entrée de l'interface. */
export function rendreSession(session: SessionEspace): RenderResult {
  return render(
    <StrictMode>
      <Application session={session} />
    </StrictMode>,
  );
}

/** Démarre une session et rend l'application, sans attendre la fin du chargement. */
export function rendreApplication(): Coquille {
  const session = demarrerSession();
  rendreSession(session);
  return { session, utilisateur: userEvent.setup() };
}

/** Rend l'application et attend la barre latérale. */
export async function ouvrirCoquille(): Promise<Coquille> {
  const coquille = rendreApplication();
  await boutonNouvellePage();
  return coquille;
}

/**
 * Fermeture de l'onglet : l'application est démontée et sa session fermée. L'adresse et l'appareil
 * simulé restent, comme dans un navigateur.
 */
export function fermerLOnglet(coquille: Coquille): void {
  cleanup();
  coquille.session.fermer();
}

/** Rechargement de l'onglet : fermeture, puis une nouvelle session démarrée et rendue. */
export function recharger(coquille: Coquille): Promise<Coquille> {
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
  replique.getMap("meta").set("version", 2);
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

export type ActionDeRangee = "renommer" | "ajouter-une-sous-page" | "mettre-a-la-corbeille";

const NOM_DE_L_ACTION: Readonly<Record<ActionDeRangee, (titre: string) => string>> = {
  renommer: (titre) => `Renommer « ${titre} »`,
  "ajouter-une-sous-page": (titre) => `Ajouter une sous-page à « ${titre} »`,
  "mettre-a-la-corbeille": (titre) => `Mettre « ${titre} » à la corbeille`,
};

/**
 * Seul chemin des tests vers une action de rangée : la commande de la page au titre affiché donné,
 * retrouvée par son rôle et son nom accessible, prête à être activée. F-004 déplacera ces commandes
 * dans un menu : seul ce chemin changera, pas les tests (conception, « Ce que F-004 remplacera »).
 */
export function atteindreActionDeRangee(
  action: ActionDeRangee,
  titre: string,
): Promise<HTMLElement> {
  return screen.findByRole("button", { name: NOM_DE_L_ACTION[action](titre) });
}

export async function activerActionDeRangee(
  utilisateur: UserEvent,
  action: ActionDeRangee,
  titre: string,
): Promise<void> {
  await utilisateur.click(await atteindreActionDeRangee(action, titre));
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
