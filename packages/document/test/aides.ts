import { vi } from "vitest";
import * as Y from "yjs";

import {
  type Arborescence,
  type DocumentEspace,
  type IdPage,
  ouvrirDocumentEspace,
} from "../src/index.ts";

declare const crypto: { randomUUID(): string };

export const GRAINE = 20261008;
export const NOMBRE_EXECUTIONS = 300;

const ORIGINE_RECUE = "mise à jour reçue";
const PREMIER_CLIENT_OBSERVATEUR = 1000;

export interface Replique {
  readonly espace: DocumentEspace;
  /** Mises à jour nées sur cette réplique, dans l'ordre de leur émission. */
  readonly emises: Uint8Array[];
}

// L'identifiant de client est fixé : Yjs s'en sert pour départager deux écritures simultanées,
// et un tirage au hasard rendrait les tests différents d'une exécution à l'autre.
export function creerReplique(identifiantDeClient: number): Replique {
  const doc = new Y.Doc();
  doc.clientID = identifiantDeClient;
  const emises: Uint8Array[] = [];
  doc.on("update", (miseAJour: Uint8Array, origine: unknown) => {
    if (origine !== ORIGINE_RECUE) {
      emises.push(miseAJour);
    }
  });
  return { espace: ouvrirDocumentEspace(doc), emises };
}

export function livrer(destinataire: Replique, miseAJour: Uint8Array): void {
  Y.applyUpdate(destinataire.espace.doc, miseAJour, ORIGINE_RECUE);
}

export function livrerToutesLesEmises(destinataire: Replique, emettrice: Replique): void {
  emettrice.emises.forEach((miseAJour) => livrer(destinataire, miseAJour));
}

/** Chaque réplique reçoit tout ce que les autres ont émis depuis leur naissance. */
export function echanger(repliques: readonly Replique[]): void {
  for (const emettrice of repliques) {
    for (const destinataire of repliques) {
      if (destinataire !== emettrice) {
        livrerToutesLesEmises(destinataire, emettrice);
      }
    }
  }
}

/**
 * Lectures après échange complet : celle de chaque réplique, puis celle d'un observateur vierge
 * par ordre possible des émettrices (il reçoit tout d'une réplique avant de passer à la suivante).
 */
export function lecturesDansTousLesOrdres(repliques: readonly Replique[]): Arborescence[] {
  echanger(repliques);
  const observateurs = ordresPossibles(repliques).map((ordre, numero) => {
    const observateur = creerReplique(PREMIER_CLIENT_OBSERVATEUR + numero);
    ordre.forEach((emettrice) => livrerToutesLesEmises(observateur, emettrice));
    return observateur;
  });
  return [...repliques, ...observateurs].map((replique) => replique.espace.lire());
}

export function ordresPossibles<T>(elements: readonly T[]): T[][] {
  if (elements.length === 0) {
    return [[]];
  }
  return elements.flatMap((premier, indice) =>
    ordresPossibles(elements.filter((_, autre) => autre !== indice)).map((suite) => [
      premier,
      ...suite,
    ]),
  );
}

export function identifiantFixe(numero: number): IdPage {
  return `00000000-0000-4000-8000-00000000000${numero}`;
}

/** Les prochaines pages créées, toutes répliques confondues, reçoivent ces identifiants. */
export function fixerLesProchainsIdentifiants(...identifiants: IdPage[]): void {
  const tirage = vi.spyOn(crypto, "randomUUID");
  for (const identifiant of identifiants) {
    tirage.mockReturnValueOnce(identifiant);
  }
}

/**
 * Identifiants reproductibles dont l'ordre n'est pas celui des créations : le départage par
 * identifiant et la coupure des cycles ne suivent donc pas l'ordre d'écriture.
 */
export function fixerDesIdentifiantsDisperses(): void {
  let numero = 0;
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
    numero += 1;
    const disperse = Math.imul(numero, 2654435761) >>> 0;
    return `00000000-0000-4000-8000-0000${disperse.toString(16).padStart(8, "0")}`;
  });
}
