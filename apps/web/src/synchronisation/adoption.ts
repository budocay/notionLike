// Adoption de l'espace local (F-013-AC12 à AC14, H1, H2) : la déclaration au serveur, et, si son
// identifiant est déjà pris, une seule lecture de l'espace pour savoir si le compte en est membre.
// Rien n'est envoyé d'autre que l'identifiant de l'espace et le nom saisi.
import type { CodeErreur, Role } from "@notionlike/contrats";

import type { Droit } from "./stockage.ts";

export type ErreurDuServeur =
  | { readonly type: "enveloppe"; readonly code: CodeErreur }
  | { readonly type: "trop-de-requetes" }
  | { readonly type: "hors-ligne" }
  | { readonly type: "generique" };

export type ReponseDuServeur<T> =
  | { readonly ok: true; readonly valeur: T }
  | { readonly ok: false; readonly erreur: ErreurDuServeur };

export interface EspaceDuServeur {
  readonly nom: string;
  readonly role: Role;
}

/** Les deux appels des routes de F-011 dont la synchronisation a besoin (client de F-014-AC37). */
export interface ServeurDesEspaces {
  /** `POST /espaces` : `rejouee` vrai pour une réponse 200, création rejouée (F-011-AC2). */
  declarer(
    idEspace: string,
    nom: string,
  ): Promise<ReponseDuServeur<EspaceDuServeur & { readonly rejouee: boolean }>>;
  /** `GET /espaces/:idEspace`. */
  lire(idEspace: string): Promise<ReponseDuServeur<EspaceDuServeur>>;
}

export type IssueDAdoption =
  | {
      readonly sorte: "adopte";
      readonly nom: string;
      readonly rejouee: boolean;
      readonly droit: Droit;
    }
  /** 409 puis 404 : l'identifiant est pris par un espace dont le compte n'est pas membre (AC13). */
  | { readonly sorte: "identifiant-pris" }
  | { readonly sorte: "echec"; readonly erreur: ErreurDuServeur };

export function droitDuRole(role: Role): Droit {
  return role === "lecteur" ? "lecture" : "ecriture";
}

export function estIntrouvable(erreur: ErreurDuServeur): boolean {
  return erreur.type === "enveloppe" && erreur.code === "ressource-introuvable";
}

export async function declarerLEspace(
  serveur: ServeurDesEspaces,
  idEspace: string,
  nom: string,
): Promise<IssueDAdoption> {
  const declaration = await serveur.declarer(idEspace, nom);
  if (declaration.ok) {
    const { valeur } = declaration;
    return {
      sorte: "adopte",
      nom: valeur.nom,
      rejouee: valeur.rejouee,
      droit: droitDuRole(valeur.role),
    };
  }
  const { erreur } = declaration;
  if (erreur.type !== "enveloppe" || erreur.code !== "identifiant-indisponible") {
    return { sorte: "echec", erreur };
  }
  const lecture = await serveur.lire(idEspace);
  if (lecture.ok) {
    return {
      sorte: "adopte",
      nom: lecture.valeur.nom,
      rejouee: true,
      droit: droitDuRole(lecture.valeur.role),
    };
  }
  return estIntrouvable(lecture.erreur)
    ? { sorte: "identifiant-pris" }
    : { sorte: "echec", erreur: lecture.erreur };
}
