// Aides des tests de F-010 : un serveur simulé derrière `fetch`, dont chaque réponse est validée
// contre les schémas de `packages/contrats` quand il en existe un (F-010-AC27, H8), et le rendu de
// l'application avec son compte.
import {
  CHEMINS_COMPTES,
  type CodeErreur,
  schemaCompte,
  schemaCompteNatif,
  schemaEnveloppeErreur,
} from "@notionlike/contrats";
import { render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach } from "vitest";

import { creerClientDeCompte } from "../src/compte/client-auth.ts";
import { creerClientDesEspaces } from "../src/compte/client-espaces.ts";
import type { Compte } from "../src/compte/index.ts";
import type { Requeter } from "../src/compte/moi.ts";
import { suivreLeCompte } from "../src/compte/suivi-du-compte.ts";
import { Application } from "../src/interface/Application.tsx";
import { boutonNouvellePage } from "./aides-coquille.tsx";
import { demarrerSession } from "./aides-facade.ts";

export const COMPTE = schemaCompte.parse({
  id: "3f0b6a52-6f1e-4f6e-9a57-2b8f0d6e4c11",
  nom: "Alice Martin",
  courriel: "alice@exemple.fr",
});
/** Jeton des corps natifs : il ne doit apparaître nulle part côté client (F-010-AC19, AC20). */
export const JETON = "jeton-de-session-Zx81kQ2vT9";
export const MOT_DE_PASSE = "un mot de passe assez long";
export const ID_REQUETE = "req-7c2e91";

export const ROUTES = {
  moi: `GET ${CHEMINS_COMPTES.moi}`,
  inscription: `POST ${CHEMINS_COMPTES.inscription}`,
  connexion: `POST ${CHEMINS_COMPTES.connexion}`,
  deconnexion: `POST ${CHEMINS_COMPTES.deconnexion}`,
} as const;

export function json(statut: number, corps: unknown, entetes: Record<string, string> = {}) {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { "content-type": "application/json", ...entetes },
  });
}

export function moi200(compte: unknown = COMPTE): Response {
  return json(200, schemaCompte.parse(compte));
}

export function enveloppe(
  statut: number,
  code: CodeErreur,
  entetes: Record<string, string> = {},
): Response {
  return json(
    statut,
    schemaEnveloppeErreur.parse({
      code,
      message: `message anglais ${code}`,
      idRequete: ID_REQUETE,
    }),
    entetes,
  );
}

export function moi401(): Response {
  return enveloppe(401, "non-authentifie");
}

/** Succès natif d'une inscription ou d'une connexion : le jeton et le compte (F-009-AC22). */
export function compteNatif(nom: string = COMPTE.nom): Response {
  const user = schemaCompteNatif.parse({
    id: COMPTE.id,
    name: nom,
    email: COMPTE.courriel,
    emailVerified: false,
  });
  return json(200, { token: JETON, user });
}

/** Corps natif d'erreur de better-auth : `code` en majuscules, `message` en anglais. */
export function natif(statut: number, code: string, entetes: Record<string, string> = {}) {
  return json(statut, { code, message: `native message for ${code}` }, entetes);
}

export function deconnexionReussie(): Response {
  return json(200, { success: true });
}

export function pageHtml(statut = 200): Response {
  return new Response("<!doctype html><title>Vite</title><p>repli</p>", {
    status: statut,
    headers: { "content-type": "text/html" },
  });
}

export function jamais(): Promise<Response> {
  return new Promise<Response>(() => undefined);
}

export interface RequeteVue {
  readonly route: string;
  readonly adresse: URL;
  readonly corps: string | undefined;
  readonly entetes: Headers;
}

type Fabrique = () => Response | Promise<Response>;

export interface ServeurSimule {
  readonly requeter: Requeter;
  readonly requetes: RequeteVue[];
  /** Réponse d'une route ; une route sans réponse échoue par le réseau, comme un serveur absent. */
  poser: (route: string, fabrique: Fabrique) => void;
  retirer: (route: string) => void;
  routesAppelees: () => string[];
}

export function serveurSimule(routes: Record<string, Fabrique> = {}): ServeurSimule {
  const table = new Map(Object.entries(routes));
  const requetes: RequeteVue[] = [];
  const requeter: Requeter = async (entree, init) => {
    const brute = entree instanceof Request ? entree.url : String(entree);
    const adresse = new URL(brute, window.location.origin);
    const route = `${(init?.method ?? "GET").toUpperCase()} ${adresse.pathname}`;
    requetes.push({
      route,
      adresse,
      corps: typeof init?.body === "string" ? init.body : undefined,
      entetes: new Headers(init?.headers),
    });
    const fabrique = table.get(route);
    if (fabrique === undefined) {
      throw new TypeError("Failed to fetch");
    }
    return fabrique();
  };
  return {
    requeter,
    requetes,
    poser: (route, fabrique) => table.set(route, fabrique),
    retirer: (route) => table.delete(route),
    routesAppelees: () => requetes.map(({ route }) => route),
  };
}

const suivis: Compte["suivi"][] = [];

afterEach(() => {
  suivis.splice(0).forEach((suivi) => suivi.fermer());
});

export function compteSimule(serveur: ServeurSimule, delaiMs?: number): Compte {
  const suivi = suivreLeCompte(serveur.requeter, delaiMs);
  suivis.push(suivi);
  return {
    suivi,
    client: creerClientDeCompte({ requeter: serveur.requeter, delaiMs }),
    espaces: creerClientDesEspaces(serveur.requeter, delaiMs),
  };
}

export interface ApplicationAvecCompte {
  readonly session: ReturnType<typeof demarrerSession>;
  readonly compte: Compte;
  readonly utilisateur: UserEvent;
}

/** Rend l'application comme l'entrée, avec un compte branché sur le serveur simulé. */
export function rendreAvecCompte(serveur: ServeurSimule, delaiMs?: number): ApplicationAvecCompte {
  const session = demarrerSession();
  const compte = compteSimule(serveur, delaiMs);
  render(
    <StrictMode>
      <Application session={session} compte={compte} />
    </StrictMode>,
  );
  return { session, compte, utilisateur: userEvent.setup() };
}

export async function ouvrirAvecCompte(
  serveur: ServeurSimule,
  delaiMs?: number,
): Promise<ApplicationAvecCompte> {
  const ouverte = rendreAvecCompte(serveur, delaiMs);
  await boutonNouvellePage();
  return ouverte;
}

export function zoneDeCompte(): HTMLElement {
  return screen.getByRole("region", { name: "Compte" });
}

export function etatAnnonce(): string {
  return within(zoneDeCompte()).getByRole("status").textContent;
}
