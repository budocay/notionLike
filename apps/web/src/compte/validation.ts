// Contrôle des formulaires de compte avant tout envoi (F-010-AC9), par les schémas de
// `packages/contrats` (F-010-AC27) : rien n'est recopié ici, pas même les bornes, lues dans les
// refus du schéma. Le courriel perd ses blancs de bord (H7) ; le mot de passe n'est jamais modifié.
import {
  type CorpsChangementDeMotDePasse,
  type CorpsChangementDeNom,
  type CorpsConnexion,
  type CorpsInscription,
  type CorpsRevocation,
  schemaCorpsChangementDeMotDePasse,
  schemaCorpsChangementDeNom,
  schemaCorpsConnexion,
  schemaCorpsInscription,
  schemaCorpsRevocation,
} from "@notionlike/contrats";

export type { CorpsConnexion, CorpsInscription } from "@notionlike/contrats";

export type ChampDeCompte = "nom" | "courriel" | "motDePasse";

/** Champs des formulaires de la gestion du compte (F-027-AC23). */
export type ChampDeGestion = "nom" | "motDePasseActuel" | "nouveauMotDePasse";

export type Faute =
  | { readonly regle: "obligatoire" | "format" }
  | { readonly regle: "trop-long" | "trop-court"; readonly borne: number };

export type Fautes<C extends string = ChampDeCompte> = Readonly<Partial<Record<C, Faute>>>;

export type Validation<T, C extends string = ChampDeCompte> =
  { readonly ok: true; readonly corps: T } | { readonly ok: false; readonly fautes: Fautes<C> };

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
    : { ok: false, fautes: fautesDe(resultat.error.issues, CHAMPS) };
}

export function validerConnexion(saisie: Saisie): Validation<CorpsConnexion> {
  const corps: CorpsConnexion = { email: saisie.courriel.trim(), password: saisie.motDePasse };
  const resultat = schemaCorpsConnexion.safeParse(corps);
  return resultat.success
    ? { ok: true, corps }
    : { ok: false, fautes: fautesDe(resultat.error.issues, CHAMPS) };
}

type ValidationDeGestion<T> = Validation<T, ChampDeGestion>;

const CHAMPS_DE_GESTION: Readonly<Record<string, ChampDeGestion>> = {
  nom: "nom",
  motDePasseActuel: "motDePasseActuel",
  nouveauMotDePasse: "nouveauMotDePasse",
};

const ACTUEL_OBLIGATOIRE: Fautes<ChampDeGestion> = {
  motDePasseActuel: { regle: "obligatoire" },
};

/** Le nom est envoyé tel que saisi : le schéma refuse un nom fait de blancs (F-027-AC1). */
export function validerChangementDeNom(nom: string): ValidationDeGestion<CorpsChangementDeNom> {
  const corps: CorpsChangementDeNom = { nom };
  const resultat = schemaCorpsChangementDeNom.safeParse(corps);
  return resultat.success
    ? { ok: true, corps }
    : { ok: false, fautes: fautesDe(resultat.error.issues, CHAMPS_DE_GESTION) };
}

/**
 * Nouveau mot de passe aux bornes de F-009-AC4 ; le mot de passe actuel n'a que la borne haute du
 * schéma, et ne part pas vide : un mot de passe vide n'est pas présenté. Aucun n'est modifié.
 */
export function validerChangementDeMotDePasse(
  motDePasseActuel: string,
  nouveauMotDePasse: string,
): ValidationDeGestion<CorpsChangementDeMotDePasse> {
  const corps: CorpsChangementDeMotDePasse = { motDePasseActuel, nouveauMotDePasse };
  const resultat = schemaCorpsChangementDeMotDePasse.safeParse(corps);
  const fautes = resultat.success ? {} : fautesDe(resultat.error.issues, CHAMPS_DE_GESTION);
  const avecActuel = motDePasseActuel === "" ? { ...fautes, ...ACTUEL_OBLIGATOIRE } : fautes;
  return Object.keys(avecActuel).length === 0
    ? { ok: true, corps }
    : { ok: false, fautes: avecActuel };
}

export function validerRevocation(motDePasseActuel: string): ValidationDeGestion<CorpsRevocation> {
  if (motDePasseActuel === "") {
    return { ok: false, fautes: ACTUEL_OBLIGATOIRE };
  }
  const corps: CorpsRevocation = { motDePasseActuel };
  const resultat = schemaCorpsRevocation.safeParse(corps);
  return resultat.success
    ? { ok: true, corps }
    : { ok: false, fautes: fautesDe(resultat.error.issues, CHAMPS_DE_GESTION) };
}

/** La première faute de chaque champ, dans l'ordre des refus du schéma. */
function fautesDe<C extends string>(
  refus: readonly Refus[],
  champs: Readonly<Record<string, C>>,
): Fautes<C> {
  const fautes: Partial<Record<C, Faute>> = {};
  for (const un of refus) {
    const champ = champs[String(un.path[0])];
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
