// Contrôle des formulaires de compte avant tout envoi (F-010-AC9), par les schémas de
// `packages/contrats` (F-010-AC27) : rien n'est recopié ici, pas même les bornes, lues dans les
// refus du schéma. Le courriel perd ses blancs de bord (H7) ; le mot de passe n'est jamais modifié.
import {
  type CorpsConnexion,
  type CorpsInscription,
  schemaCorpsConnexion,
  schemaCorpsInscription,
} from "@notionlike/contrats";

export type { CorpsConnexion, CorpsInscription } from "@notionlike/contrats";

export type ChampDeCompte = "nom" | "courriel" | "motDePasse";

export type Faute =
  | { readonly regle: "obligatoire" | "format" }
  | { readonly regle: "trop-long" | "trop-court"; readonly borne: number };

export type Fautes = Readonly<Partial<Record<ChampDeCompte, Faute>>>;

export type Validation<T> =
  { readonly ok: true; readonly corps: T } | { readonly ok: false; readonly fautes: Fautes };

export interface Saisie {
  readonly nom: string;
  readonly courriel: string;
  readonly motDePasse: string;
}

const CHAMPS: Readonly<Record<string, ChampDeCompte>> = {
  name: "nom",
  email: "courriel",
  password: "motDePasse",
};

interface Refus {
  readonly code: string;
  readonly path: readonly PropertyKey[];
  readonly minimum?: unknown;
  readonly maximum?: unknown;
}

export function validerInscription(saisie: Saisie): Validation<CorpsInscription> {
  const corps: CorpsInscription = {
    name: saisie.nom,
    email: saisie.courriel.trim(),
    password: saisie.motDePasse,
  };
  const resultat = schemaCorpsInscription.safeParse(corps);
  return resultat.success
    ? { ok: true, corps }
    : { ok: false, fautes: fautesDe(resultat.error.issues) };
}

export function validerConnexion(saisie: Saisie): Validation<CorpsConnexion> {
  const corps: CorpsConnexion = { email: saisie.courriel.trim(), password: saisie.motDePasse };
  const resultat = schemaCorpsConnexion.safeParse(corps);
  return resultat.success
    ? { ok: true, corps }
    : { ok: false, fautes: fautesDe(resultat.error.issues) };
}

/** La première faute de chaque champ, dans l'ordre des refus du schéma. */
function fautesDe(refus: readonly Refus[]): Fautes {
  const fautes: Partial<Record<ChampDeCompte, Faute>> = {};
  for (const un of refus) {
    const champ = CHAMPS[String(un.path[0])];
    if (champ !== undefined && fautes[champ] === undefined) {
      fautes[champ] = fauteDe(un);
    }
  }
  return fautes;
}

function fauteDe(refus: Refus): Faute {
  switch (refus.code) {
    case "too_big":
      return { regle: "trop-long", borne: Number(refus.maximum) };
    case "too_small":
      return { regle: "trop-court", borne: Number(refus.minimum) };
    case "invalid_format":
      return { regle: "format" };
    default:
      return { regle: "obligatoire" };
  }
}
