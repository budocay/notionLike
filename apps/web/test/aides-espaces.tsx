// Aides des tests de F-014 : identifiants, réponses du serveur simulé validées contre les schémas de
// `packages/contrats` (F-014-AC39 : un changement de contrat fait échouer ces tests), routes, rendu de
// l'application sur un écran des espaces, et inventaire du stockage du navigateur.
import {
  CHEMINS_ESPACES,
  type Role,
  schemaEspace,
  schemaInvitation,
  schemaInvitationCreee,
  schemaListeEspaces,
  schemaListeInvitations,
  schemaListeMembres,
  schemaListeMembresVueParUnProprietaire,
  schemaMembre,
  schemaMembreVuParUnProprietaire,
} from "@notionlike/contrats";
import { act, screen, waitFor } from "@testing-library/react";
import { expect } from "vitest";

import { cheminDe } from "../src/compte/client-espaces.ts";
import {
  type ApplicationAvecCompte,
  COMPTE,
  json,
  moi200,
  ouvrirAvecCompte,
  ROUTES,
  type ServeurSimule,
  serveurSimule,
} from "./aides-compte.tsx";
import { laisserIndexedDbTravailler, nomsDesBases } from "./aides-persistance.ts";

export const ID_ESPACE = "0b9c6c8e-7d1a-4c55-9b0e-2f4b8a6d1e01";
export const ID_AUTRE_ESPACE = "5a2e7f10-3c4d-4e8f-a1b2-c3d4e5f60718";
export const ID_BOB = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
export const ID_INVITATION = "9e8d7c6b-5a49-4382-b716-05f4e3d2c1b0";
/** Jeton de la forme publiée : 43 caractères base64url, `-` et `_` compris. */
export const JETON_INVITATION = "Ab-_0123456789abcdefghijklmnopqrstuvwxyzABC";

export function espace(role: Role, nom = "Projet Atlas", idEspace = ID_ESPACE) {
  return schemaEspace.parse({ idEspace, nom, role });
}

export function membre(idCompte: string, nom: string, role: Role, courriel?: string) {
  return courriel === undefined
    ? schemaMembre.parse({ idCompte, nom, role })
    : schemaMembreVuParUnProprietaire.parse({ idCompte, nom, role, courriel });
}

export const ALICE_PROPRIETAIRE = membre(COMPTE.id, COMPTE.nom, "proprietaire", COMPTE.courriel);
export const BOB_EDITEUR = membre(ID_BOB, "Bob Durand", "editeur", "bob@exemple.fr");

export const INVITATION = schemaInvitation.parse({
  idInvitation: ID_INVITATION,
  role: "lecteur",
  creeLe: "2026-10-13T08:00:00.000Z",
  expireLe: "2026-10-20T08:00:00.000Z",
});

export const R = {
  espaces: `GET ${CHEMINS_ESPACES.espaces}`,
  creer: `POST ${CHEMINS_ESPACES.espaces}`,
  lire: (id = ID_ESPACE) => `GET ${cheminDe(CHEMINS_ESPACES.espace, { idEspace: id })}`,
  renommer: (id = ID_ESPACE) => `PATCH ${cheminDe(CHEMINS_ESPACES.espace, { idEspace: id })}`,
  supprimer: (id = ID_ESPACE) => `DELETE ${cheminDe(CHEMINS_ESPACES.espace, { idEspace: id })}`,
  membres: (id = ID_ESPACE) => `GET ${cheminDe(CHEMINS_ESPACES.membres, { idEspace: id })}`,
  role: (idCompte: string) =>
    `PATCH ${cheminDe(CHEMINS_ESPACES.membre, { idEspace: ID_ESPACE, idCompte })}`,
  retirer: (idCompte: string) =>
    `DELETE ${cheminDe(CHEMINS_ESPACES.membre, { idEspace: ID_ESPACE, idCompte })}`,
  invitations: `GET ${cheminDe(CHEMINS_ESPACES.invitations, { idEspace: ID_ESPACE })}`,
  inviter: `POST ${cheminDe(CHEMINS_ESPACES.invitations, { idEspace: ID_ESPACE })}`,
  revoquer: `DELETE ${cheminDe(CHEMINS_ESPACES.invitation, {
    idEspace: ID_ESPACE,
    idInvitation: ID_INVITATION,
  })}`,
  accepter: `POST ${CHEMINS_ESPACES.acceptation}`,
} as const;

export function liste200(espaces: readonly unknown[]): Response {
  return json(200, schemaListeEspaces.parse({ espaces }));
}

export function espace200(valeur: unknown, statut = 200): Response {
  return json(statut, schemaEspace.parse(valeur));
}

export function membres200(membres: readonly unknown[]): Response {
  const corps = { membres };
  const parProprietaire = schemaListeMembresVueParUnProprietaire.safeParse(corps);
  return json(
    200,
    parProprietaire.success ? parProprietaire.data : schemaListeMembres.parse(corps),
  );
}

export function invitations200(invitations: readonly unknown[]): Response {
  return json(200, schemaListeInvitations.parse({ invitations }));
}

export function invitationCreee201(role: "editeur" | "lecteur" = "lecteur"): Response {
  return json(
    201,
    schemaInvitationCreee.parse({
      idInvitation: ID_INVITATION,
      role,
      expireLe: "2026-10-20T08:00:00.000Z",
      jeton: JETON_INVITATION,
    }),
  );
}

export function vide204(): Response {
  return new Response(null, { status: 204 });
}

/** Serveur d'un compte connecté, membre d'un espace avec ce rôle. */
export function serveurDeLEspace(role: Role, nom = "Projet Atlas"): ServeurSimule {
  const moi = membre(
    COMPTE.id,
    COMPTE.nom,
    role,
    role === "proprietaire" ? COMPTE.courriel : undefined,
  );
  const bob = role === "proprietaire" ? BOB_EDITEUR : membre(ID_BOB, BOB_EDITEUR.nom, "editeur");
  return serveurSimule({
    [ROUTES.moi]: () => moi200(),
    [R.espaces]: () => liste200([espace(role, nom)]),
    [R.lire()]: () => espace200(espace(role, nom)),
    [R.membres()]: () => membres200([moi, bob]),
    [R.invitations]: () => invitations200([INVITATION]),
  });
}

/** Ouvre l'application, attend le compte connecté, puis va à l'adresse donnée. */
export async function ouvrirA(
  serveur: ServeurSimule,
  fragment: string,
): Promise<ApplicationAvecCompte> {
  const ouverte = await ouvrirAvecCompte(serveur);
  // La première vérification du compte est finie : connecté, déconnecté ou serveur injoignable.
  await waitFor(() =>
    expect(ouverte.compte.suivi.lire()).not.toEqual({ statut: "inconnu", verification: true }),
  );
  aller(fragment);
  return ouverte;
}

export function aller(fragment: string): void {
  act(() => {
    window.location.hash = fragment;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

export function titrePrincipal(): Promise<HTMLElement> {
  return screen.findByRole("heading", { level: 1 });
}

/** Corps JSON des requêtes de cette route, dans l'ordre. */
export function corpsDe(serveur: ServeurSimule, route: string): unknown[] {
  return serveur.requetes
    .filter((requete) => requete.route === route)
    .map((requete) => (requete.corps === undefined ? undefined : JSON.parse(requete.corps)));
}

function demander<T>(demande: IDBRequest<T>): Promise<T> {
  return new Promise((resoudre, rejeter) => {
    demande.onsuccess = () => resoudre(demande.result);
    demande.onerror = () => rejeter(demande.error ?? new Error("demande en échec"));
  });
}

async function contenuDeLaBase(nom: string): Promise<string> {
  const connexion = await demander(indexedDB.open(nom));
  const decodeur = new TextDecoder();
  const textes = await Promise.all(
    [...connexion.objectStoreNames].map(async (magasin) => {
      const lecture = connexion.transaction(magasin).objectStore(magasin);
      const [cles, valeurs] = await Promise.all([
        demander(lecture.getAllKeys()),
        demander(lecture.getAll()),
      ]);
      return [...cles, ...valeurs]
        .map((valeur) =>
          ArrayBuffer.isView(valeur) ? decodeur.decode(valeur) : JSON.stringify(valeur),
        )
        .join(" ");
    }),
  );
  connexion.close();
  return textes.join(" ");
}

/** Tout ce que le navigateur garde pour le script : stockages, bases (noms et contenus), cookies. */
export async function toutLeStockage(): Promise<string> {
  await laisserIndexedDbTravailler();
  const bases = await nomsDesBases();
  const contenus = await Promise.all(bases.map(contenuDeLaBase));
  const stockages = [window.localStorage, window.sessionStorage].flatMap((stockage) =>
    Object.keys(stockage).map((cle) => `${cle}=${stockage.getItem(cle) ?? ""}`),
  );
  return [...stockages, ...bases, ...contenus, document.cookie].join("\n");
}

/** Description accessible : le texte des éléments que nomme `aria-describedby`. */
export function descriptionDe(element: Element): string {
  return (element.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter((id) => id !== "")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

export function estDesactive(element: Element): boolean {
  return element instanceof HTMLButtonElement || element instanceof HTMLSelectElement
    ? element.disabled
    : false;
}

export function valeurDe(element: Element): string {
  return element instanceof HTMLInputElement || element instanceof HTMLSelectElement
    ? element.value
    : "";
}
