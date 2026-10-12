// Aides des tests de la session de page : une session démarrée sur un document que le test tient,
// rendue par la zone principale comme l'application le fait.
import type { PageLue } from "@notionlike/document";
import { act, render } from "@testing-library/react";
import { type ReactElement, StrictMode, useSyncExternalStore } from "react";
import { afterEach } from "vitest";
import * as Y from "yjs";

import { ZonePrincipale } from "../src/interface/ZonePrincipale.tsx";
import {
  demarrerSessionPage,
  type EtatSessionPage,
  type SessionPage,
} from "../src/page/session-page.ts";
import { ouvrirPersistance, type Persistance } from "../src/persistance/index.ts";
import { type DocumentPage } from "@notionlike/document";
import { miseAJourDUneReplique } from "./aides-facade-page.ts";
import { attendreEtat, ESPACE_A, laisserIndexedDbTravailler } from "./aides-persistance.ts";
import { ecouterLesMisesAJour } from "./edition/aides-edition.tsx";

export const PAGE_A = "11111111-2222-4333-8444-555555555555";
export const PAGE_B = "66666666-7777-4888-9999-aaaaaaaaaaaa";

export interface Designation {
  readonly idEspace: string;
  readonly idPage: string;
}

export const PAGE_A_DE_L_ESPACE_A: Designation = { idEspace: ESPACE_A, idPage: PAGE_A };

/** Nom de la base d'une page, tel que F-003-AC1 l'écrit : seul le module de persistance l'assemble. */
export function nomDeLaBaseDePage({ idEspace, idPage }: Designation): string {
  return ["notionlike", "page", idEspace, idPage].join(":");
}

export interface SessionSuivie {
  readonly doc: Y.Doc;
  readonly persistance: Persistance;
  readonly session: SessionPage;
  /** Mises à jour émises par le document depuis avant l'ouverture de sa persistance. */
  readonly emises: Uint8Array[];
}

const fermetures: (() => void)[] = [];

// Sessions et persistances sont fermées avant que l'éditeur ne soit démonté et que les
// observateurs restés sur chaque document ne soient comptés.
afterEach(() => {
  fermetures.splice(0).forEach((fermer) => fermer());
});

/** Démarre une session de page sur un document, avec la persistance de la base désignée. */
export function demarrerUneSession(
  designation: Designation = PAGE_A_DE_L_ESPACE_A,
  doc: Y.Doc = new Y.Doc(),
): SessionSuivie {
  const emises = ecouterLesMisesAJour(doc);
  const persistance = ouvrirPersistance(doc, { type: "page", ...designation });
  const session = demarrerSessionPage({ doc, persistance });
  fermetures.push(() => {
    session.fermer();
    persistance.fermer();
  });
  return { doc, persistance, session, emises };
}

/** Écrit dans la base d'une page ce qu'une autre application y aurait enregistré. */
export async function enregistrerDansLaBase(
  designation: Designation,
  modifier: (replique: DocumentPage) => void,
): Promise<void> {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, miseAJourDUneReplique(doc, modifier));
  const persistance = ouvrirPersistance(doc, { type: "page", ...designation });
  await attendreEtat(persistance, "active");
  await laisserIndexedDbTravailler();
  persistance.fermer();
  await laisserIndexedDbTravailler();
}

export function attendrePhase(
  session: SessionPage,
  phase: EtatSessionPage["phase"],
): Promise<void> {
  return new Promise((resoudre) => {
    if (session.lireEtat().phase === phase) {
      resoudre();
      return;
    }
    const desabonner = session.abonner(() => {
      if (session.lireEtat().phase === phase) {
        desabonner();
        resoudre();
      }
    });
  });
}

function PageDEssai({ session, page }: { session: SessionPage; page: PageLue }): ReactElement {
  const etat = useSyncExternalStore(session.abonner, session.lireEtat);
  return <ZonePrincipale selection={{ type: "page", page }} espaceVide={false} page={etat} />;
}

/** Rend la page d'une session par la zone principale, sous `StrictMode`. */
export function rendreLaSession(session: SessionPage, idPage: string = PAGE_A): void {
  const page: PageLue = { id: idPage, titre: "Page d'essai", enfants: [] };
  render(
    <StrictMode>
      <PageDEssai session={session} page={page} />
    </StrictMode>,
  );
}

/** Démarre une session, attend qu'elle soit prête et rend sa page : l'éditeur est affiché. */
export async function afficherUnePage(doc: Y.Doc = new Y.Doc()): Promise<SessionSuivie> {
  const suivie = demarrerUneSession(PAGE_A_DE_L_ESPACE_A, doc);
  await attendrePhase(suivie.session, "pret");
  rendreLaSession(suivie.session);
  await act(() => laisserIndexedDbTravailler());
  return suivie;
}
