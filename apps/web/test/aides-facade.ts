// Seul fichier de test d'apps/web qui ouvre une façade de document d'espace ou démarre une session
// d'espace (F-002-AC31). Chaque façade et chaque session ouverte ici est suivie : `preparation.ts`
// les ferme en fin de test et exige que chaque `Y.Doc` ait retrouvé son nombre d'écouteurs de départ.
import {
  creerDocumentEspace,
  type DocumentEspace,
  ouvrirDocumentEspace,
} from "@notionlike/document";
import { vi } from "vitest";
import * as Y from "yjs";

import type { CibleDeSession } from "../src/espace/espace-ouvert.ts";
import * as moduleDeLaSession from "../src/espace/session-espace.ts";

type SessionEspace = moduleDeLaSession.SessionEspace;

const departs = new Map<Y.Doc, number>();
const fermetures: (() => void)[] = [];

/** Une façade pose un écouteur sur cet événement à l'ouverture, et le retire à la fermeture. */
export function ecouteurs(doc: Y.Doc): number {
  return doc._observers.get("afterTransaction")?.size ?? 0;
}

function suivre(facade: DocumentEspace, depart: number): DocumentEspace {
  if (!departs.has(facade.doc)) {
    departs.set(facade.doc, depart);
  }
  fermetures.push(() => facade.fermer());
  return facade;
}

export function ouvrirFacade(doc: Y.Doc): DocumentEspace {
  const depart = ecouteurs(doc);
  return suivre(ouvrirDocumentEspace(doc), depart);
}

export function creerFacade(): DocumentEspace {
  const depart = ecouteurs(new Y.Doc());
  return suivre(creerDocumentEspace(), depart);
}

// Une session construit elle-même son document : son départ est le compte d'un `Y.Doc` neuf. Hors
// contexte sécurisé elle n'a pas de document, et rien n'est à compter.
function suivreLaSession(session: SessionEspace): SessionEspace {
  if (session.doc !== undefined && !departs.has(session.doc)) {
    departs.set(session.doc, ecouteurs(new Y.Doc()));
  }
  fermetures.push(() => session.fermer());
  return session;
}

/**
 * Démarre une session d'espace comme l'entrée le fait, et la suit. Sans cible : l'espace de
 * l'appareil, comme avant F-032 ; avec, l'espace que le pilote de l'onglet ouvre (F-032-AC32).
 */
export function demarrerSession(cible?: CibleDeSession): SessionEspace {
  return suivreLaSession(moduleDeLaSession.demarrerSessionEspace(cible));
}

/**
 * Importe l'entrée de l'application et rend la session qu'elle démarre, suivie comme les autres.
 * L'entrée n'exporte rien : sa session est relevée par un espion posé sur le démarrage. Un module
 * n'est évalué qu'une fois par fichier de test : un second appel ne voit aucun démarrage et lève.
 */
export async function importerEntree(): Promise<SessionEspace> {
  const demarrage = vi.spyOn(moduleDeLaSession, "demarrerSessionEspace");
  let resultats: typeof demarrage.mock.results;
  try {
    await import("../src/main.tsx");
  } finally {
    resultats = [...demarrage.mock.results];
    demarrage.mockRestore();
  }
  const [resultat] = resultats;
  if (resultats.length !== 1 || resultat?.type !== "return") {
    throw new Error(
      `L'entrée devait démarrer exactement une session : ${resultats.length} démarrage(s) vu(s).`,
    );
  }
  return suivreLaSession(resultat.value);
}

/** Nombre d'écouteurs que les documents suivis portent en plus de leur compte de départ. */
export function facadesEncoreOuvertes(): number {
  let ouvertes = 0;
  for (const [doc, depart] of departs) {
    ouvertes += Math.max(0, ecouteurs(doc) - depart);
  }
  return ouvertes;
}

/**
 * Ferme tout ce que les aides ont ouvert et rend le nombre de façades restées ouvertes malgré
 * cela ; les documents ne sont plus suivis ensuite, pour qu'un test ne paie pas pour le précédent.
 */
export function fermerLesFacades(): number {
  fermetures.splice(0).forEach((fermer) => fermer());
  const resteesOuvertes = facadesEncoreOuvertes();
  departs.clear();
  return resteesOuvertes;
}
