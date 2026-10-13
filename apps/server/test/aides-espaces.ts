// Aides des tests des espaces (F-011). Les comptes sont écrits en base avec une session, sans
// passer par l'inscription (Argon2id et plafond d'inscription) : le cookie est celui que better-auth
// poserait pour ce jeton. Tout corps de réponse lu passe par un schéma publié (F-011-AC31).
import { randomBytes, randomUUID } from "node:crypto";

import {
  CHEMINS_ESPACES,
  schemaEnveloppeErreur,
  type CodeErreur,
  type EnveloppeErreur,
  type Role,
} from "@notionlike/contrats";
import { schemaComptes, type Base } from "@notionlike/db";
import { expect } from "vitest";
import { z } from "zod";

import { SECRET_D_ESSAI, URL_PUBLIQUE_D_ESSAI, type ServeurDEssai } from "./aides.ts";
import {
  cookieSigne,
  courrielUnique,
  envoyer,
  executer,
  JOUR_MS,
  NOM_DU_COOKIE,
} from "./aides-comptes.ts";

export interface CompteDEssai {
  readonly id: string;
  readonly nom: string;
  readonly courriel: string;
  // Le jeton de la session, et la paire `nom=valeur` du cookie qui le porte.
  readonly jeton: string;
  readonly cookie: string;
}

let rang = 0;

// Un compte et une session valide sept jours.
// Sous NODE_ENV=production, le cookie porte le nom préfixé par `__Secure-`.
export async function creerUnCompte(
  base: Base,
  etiquette = "membre",
  nomDuCookie = NOM_DU_COOKIE,
): Promise<CompteDEssai> {
  rang += 1;
  const nom = `${etiquette} ${String(rang)}`;
  const courriel = courrielUnique(etiquette);
  const [cree] = await base.db
    .insert(schemaComptes.user)
    .values({ name: nom, email: courriel })
    .returning({ id: schemaComptes.user.id });
  if (cree === undefined) {
    throw new Error("compte non créé");
  }
  const jeton = randomBytes(24).toString("base64url");
  await base.db
    .insert(schemaComptes.session)
    .values({ token: jeton, userId: cree.id, expiresAt: new Date(Date.now() + 7 * JOUR_MS) });
  return {
    id: cree.id,
    nom,
    courriel,
    jeton,
    cookie: cookieSigne(jeton, SECRET_D_ESSAI, nomDuCookie),
  };
}

export function nouvelIdentifiant(): string {
  return randomUUID();
}

// Un chemin publié dont les paramètres `:nom` sont remplacés par les valeurs données.
export function cheminDe(modele: string, valeurs: object = {}): string {
  const lues = new Map(Object.entries(valeurs));
  return modele.replace(/:([A-Za-z]+)/g, (_tout, nom: string) => {
    const valeur: unknown = lues.get(nom);
    return encodeURIComponent(typeof valeur === "string" ? valeur : nouvelIdentifiant());
  });
}

export interface Appel {
  readonly cookie?: string | undefined;
  readonly corps?: unknown;
  // Un corps envoyé tel quel, sans `Content-Type` imposé.
  readonly brut?: string;
  readonly enTetes?: Readonly<Record<string, string>>;
}

// Une requête telle qu'un navigateur servi par l'URL publique l'envoie : une écriture porte son
// origine, un corps est en JSON.
export function appeler(
  serveur: ServeurDEssai,
  methode: string,
  chemin: string,
  appel: Appel = {},
): Promise<Response> {
  const enTetes: Record<string, string> = {};
  if (methode !== "GET") {
    enTetes.Origin = URL_PUBLIQUE_D_ESSAI;
  }
  if (appel.corps !== undefined) {
    enTetes["Content-Type"] = "application/json";
  }
  if (appel.cookie !== undefined) {
    enTetes.Cookie = appel.cookie;
  }
  const corps = appel.brut ?? (appel.corps === undefined ? undefined : JSON.stringify(appel.corps));
  if (methode === "GET" && corps !== undefined) {
    return getAvecCorps(serveur, chemin, { ...enTetes, ...appel.enTetes }, corps);
  }
  return fetch(`${serveur.url}${chemin}`, {
    method: methode,
    headers: { ...enTetes, ...appel.enTetes },
    ...(corps === undefined ? {} : { body: corps }),
  });
}

// `fetch` refuse un GET qui porte un corps : la requête est alors écrite telle quelle.
async function getAvecCorps(
  serveur: ServeurDEssai,
  chemin: string,
  enTetes: Readonly<Record<string, string>>,
  corps: string,
): Promise<Response> {
  const brute = await envoyer(serveur, { methode: "GET", chemin, enTetes, corps });
  const type = brute.enTetes["content-type"];
  return new Response(brute.texte, {
    status: brute.statut,
    headers: typeof type === "string" ? { "Content-Type": type } : {},
  });
}

// La réponse d'erreur, validée par le schéma publié, avec son statut et son code attendus.
export async function erreurDe(
  reponse: Response,
  statut: number,
  code: CodeErreur,
): Promise<EnveloppeErreur> {
  const enveloppe = schemaEnveloppeErreur.parse(await reponse.json());
  expect({ statut: reponse.status, code: enveloppe.code }).toEqual({ statut, code });
  return enveloppe;
}

// Le corps d'une réponse réussie, validé par le schéma publié, avec son statut attendu.
export async function corpsDe<T>(
  reponse: Response,
  statut: number,
  schema: z.ZodType<T>,
): Promise<T> {
  const texte = await reponse.text();
  expect(reponse.status, texte).toBe(statut);
  return schema.parse(JSON.parse(texte));
}

export interface EspaceDEssai {
  readonly idEspace: string;
  readonly proprietaire: CompteDEssai;
  readonly editeur: CompteDEssai;
  readonly lecteur: CompteDEssai;
  readonly nonMembre: CompteDEssai;
}

export async function ajouterUnMembre(
  base: Base,
  idEspace: string,
  idCompte: string,
  role: Role,
): Promise<void> {
  await executer(
    base,
    `insert into "adhesion" ("idEspace", "idCompte", "role") values ('${idEspace}', '${idCompte}', '${role}')`,
  );
}

// Un espace créé par son propriétaire par la route, et ses membres écrits en base.
export async function preparerUnEspace(
  serveur: ServeurDEssai,
  base: Base,
  nomDuCookie = NOM_DU_COOKIE,
): Promise<EspaceDEssai> {
  const [proprietaire, editeur, lecteur, nonMembre] = await Promise.all(
    ["proprietaire", "editeur", "lecteur", "non-membre"].map((etiquette) =>
      creerUnCompte(base, etiquette, nomDuCookie),
    ),
  );
  if (!proprietaire || !editeur || !lecteur || !nonMembre) {
    throw new Error("comptes non créés");
  }
  const idEspace = nouvelIdentifiant();
  const reponse = await appeler(serveur, "POST", CHEMINS_ESPACES.espaces, {
    cookie: proprietaire.cookie,
    corps: { idEspace, nom: "Équipe" },
  });
  expect(reponse.status).toBe(201);
  await ajouterUnMembre(base, idEspace, editeur.id, "editeur");
  await ajouterUnMembre(base, idEspace, lecteur.id, "lecteur");
  return { idEspace, proprietaire, editeur, lecteur, nonMembre };
}

const schemaLignes = z.object({ rows: z.array(z.record(z.string(), z.unknown())) });

// Les lignes d'une lecture SQL écrite par le test.
export async function lignesSql(base: Base, instruction: string) {
  return schemaLignes.parse(await base.db.execute(instruction)).rows;
}

// Tout ce que la base contient des espaces, en texte : pour comparer avant et après un refus.
export async function etatDesEspaces(base: Base): Promise<string> {
  const tables = ["espace", "adhesion", "invitation"];
  const lignes = await Promise.all(
    tables.map((table) => lignesSql(base, `select * from "${table}" order by 1, 2`)),
  );
  return JSON.stringify(lignes);
}
