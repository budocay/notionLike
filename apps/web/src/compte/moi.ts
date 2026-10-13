// Lecture de l'état du compte par `GET /api/v1/moi`, seule source de cet état (F-010-AC4). Aucune
// exception ne sort d'ici : tout ce qui n'est ni un 200 conforme au schéma strict ni un 401 portant
// l'enveloppe d'erreur rend l'état inconnu (F-010-AC2).
import { CHEMINS_COMPTES, schemaCompte, schemaEnveloppeErreur } from "@notionlike/contrats";

/** Forme de `fetch` : le seul appelant réel est `reseau.ts`, les tests en passent une simulée. */
export type Requeter = (entree: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type EtatDuCompte =
  /** `verification` : aucune réponse encore, la requête est en cours. */
  | { readonly statut: "inconnu"; readonly verification: boolean }
  | { readonly statut: "deconnecte" }
  /** L'identifiant et le nom tels que `moi` les a donnés, en mémoire seulement (F-010 H3). */
  | { readonly statut: "connecte"; readonly id: string; readonly nom: string };

/** Délai de F-010 H11, commun à `moi` et aux trois appels du client d'authentification. */
export const DELAI_DE_REPONSE_MS = 10_000;

export const VERIFICATION: EtatDuCompte = { statut: "inconnu", verification: true };
export const INDISPONIBLE: EtatDuCompte = { statut: "inconnu", verification: false };
const DECONNECTE: EtatDuCompte = { statut: "deconnecte" };
const STATUT_OK = 200;
const STATUT_NON_AUTHENTIFIE = 401;

export async function demanderMoi(
  requeter: Requeter,
  delaiMs: number = DELAI_DE_REPONSE_MS,
): Promise<EtatDuCompte> {
  const controleur = new AbortController();
  const lecture = (async () => {
    const reponse = await requeter(CHEMINS_COMPTES.moi, {
      method: "GET",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal: controleur.signal,
    });
    return lireReponse(reponse);
  })();
  try {
    return await avecDelai(lecture, delaiMs, controleur);
  } catch {
    return INDISPONIBLE;
  }
}

/**
 * Rend la promesse, ou rejette après le délai en abandonnant la requête. La promesse abandonnée
 * reste suivie par `Promise.race` : son rejet tardif n'est jamais un rejet non géré.
 */
export function avecDelai<T>(
  promesse: Promise<T>,
  delaiMs: number,
  controleur: AbortController,
): Promise<T> {
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  const expiration = new Promise<never>((_, rejeter) => {
    minuterie = setTimeout(() => {
      controleur.abort();
      rejeter(new Error("Délai de réponse dépassé."));
    }, delaiMs);
  });
  return Promise.race([promesse, expiration]).finally(() => clearTimeout(minuterie));
}

async function lireReponse(reponse: Response): Promise<EtatDuCompte> {
  if (reponse.status !== STATUT_OK && reponse.status !== STATUT_NON_AUTHENTIFIE) {
    return INDISPONIBLE;
  }
  const corps: unknown = await reponse.json();
  if (reponse.status === STATUT_NON_AUTHENTIFIE) {
    return schemaEnveloppeErreur.safeParse(corps).success ? DECONNECTE : INDISPONIBLE;
  }
  const compte = schemaCompte.safeParse(corps);
  return compte.success
    ? { statut: "connecte", id: compte.data.id, nom: compte.data.nom }
    : INDISPONIBLE;
}
