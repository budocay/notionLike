// Réglages de vue d'une table (F-018-AC40, AC41, H3, H4, ADR-0019) : seul fichier d'apps/web qui
// nomme `localStorage` et assemble la clé `notionlike:vue:<idEspace>:<idTable>`. Il ne connaît que
// l'enveloppe : des sections nommées, valeurs JSON opaques que le module des vues valide. Rien n'y
// entre du compte, et rien n'en sort vers un document Yjs ni vers le réseau (AC42).
import { estUuidCanonique } from "../identifiants/uuid-canonique.ts";
import { ErreurPersistance } from "./nom-de-base.ts";

/** Sections d'un enregistrement, par nom ; chacune appartient à une feature (`vue`, `tableau`…). */
export type SectionsDeVue = Readonly<Record<string, unknown>>;

export interface DesignationDeVue {
  readonly idEspace: string;
  readonly idTable: string;
}

const VERSION_DES_REGLAGES = 1;
const PREFIXE = "notionlike:vue:";

// Ce que l'onglet tient quand l'appareil ne peut pas l'écrire (stockage absent, qui lève, ou
// enregistrement d'une version plus récente, jamais réécrit) : les réglages valent pour l'onglet.
const enMemoire = new Map<string, SectionsDeVue>();

/**
 * Seule fonction d'apps/web qui assemble la clé des réglages de vue (F-018-AC40), interne au module.
 * Lève `identifiant-invalide` si l'un des identifiants n'est pas un UUID canonique, comme `nomDeBase`.
 */
function cleDesReglagesDeVue({ idEspace, idTable }: DesignationDeVue): string {
  if (!estUuidCanonique(idEspace) || !estUuidCanonique(idTable)) {
    throw new ErreurPersistance(
      "identifiant-invalide",
      "Un identifiant n'est pas un UUID canonique : aucun réglage de vue n'est lu ni écrit.",
    );
  }
  return `${PREFIXE}${idEspace}:${idTable}`;
}

/**
 * Les sections enregistrées pour cette table ; aucune si rien n'est enregistré, si l'enregistrement
 * est illisible ou d'une version supérieure à 1, si le stockage est absent ou lève, ou si un
 * identifiant est refusé. Ne lève jamais et n'écrit rien.
 */
export function lireReglagesDeVue(designation: DesignationDeVue): SectionsDeVue {
  const cle = cleAdmise(designation);
  if (cle === undefined) {
    return {};
  }
  const tenues = enMemoire.get(cle);
  if (tenues !== undefined) {
    return tenues;
  }
  const lu = lireLEnregistrement(cle);
  return lu.sorte === "lisible" ? lu.sections : {};
}

/**
 * Remplace les sections nommées dans `changements` (`undefined` retire la section) et conserve
 * telle quelle toute autre section (AC41). Rien n'est écrit si l'enregistrement n'existe pas et que
 * le résultat est vide (AC40), ni sur un enregistrement d'une version supérieure à 1 ; la clé est
 * retirée quand plus aucune section ne reste. Si le stockage ne peut pas écrire, les réglages sont
 * tenus en mémoire pour l'onglet. Ne lève jamais.
 */
export function ecrireReglagesDeVue(
  designation: DesignationDeVue,
  changements: Readonly<Record<string, unknown>>,
): void {
  const cle = cleAdmise(designation);
  if (cle === undefined) {
    return;
  }
  const lu = lireLEnregistrement(cle);
  const depart = enMemoire.get(cle) ?? (lu.sorte === "lisible" ? lu.sections : {});
  const sections = appliquer(depart, changements);
  if (lu.sorte === "plus-recent" || lu.sorte === "indisponible") {
    enMemoire.set(cle, sections);
    return;
  }
  if (lu.sorte === "absent" && Object.keys(sections).length === 0) {
    enMemoire.delete(cle);
    return;
  }
  if (inscrire(cle, sections)) {
    enMemoire.delete(cle);
  } else {
    enMemoire.set(cle, sections);
  }
}

/**
 * Retire les réglages de ces tables de l'espace (F-018-AC49) : une clé absente n'est pas une
 * erreur, un identifiant refusé ne désigne aucune clé. Ne lève jamais.
 */
export function effacerReglagesDeVue(idEspace: string, idTables: readonly string[]): void {
  for (const idTable of idTables) {
    const cle = cleAdmise({ idEspace, idTable });
    if (cle === undefined) {
      continue;
    }
    enMemoire.delete(cle);
    try {
      localStorage.removeItem(cle);
    } catch {
      // Stockage absent ou qui lève : il n'y a rien à retirer de l'appareil.
    }
  }
}

type Lecture =
  | { readonly sorte: "absent" }
  | { readonly sorte: "lisible"; readonly sections: SectionsDeVue }
  /** Texte qui n'est pas du JSON, ou forme inattendue : lu sans sections, réécrit en entier. */
  | { readonly sorte: "illisible" }
  /** Version supérieure à 1 : lu sans sections, jamais réécrit (AC41, H4). */
  | { readonly sorte: "plus-recent" }
  | { readonly sorte: "indisponible" };

function cleAdmise(designation: DesignationDeVue): string | undefined {
  try {
    return cleDesReglagesDeVue(designation);
  } catch {
    return undefined;
  }
}

function lireLEnregistrement(cle: string): Lecture {
  let texte: string | null;
  try {
    texte = localStorage.getItem(cle);
  } catch {
    return { sorte: "indisponible" };
  }
  if (texte === null) {
    return { sorte: "absent" };
  }
  let valeur: unknown;
  try {
    valeur = JSON.parse(texte);
  } catch {
    return { sorte: "illisible" };
  }
  return lectureDe(valeur);
}

function lectureDe(valeur: unknown): Lecture {
  if (!estUnObjet(valeur)) {
    return { sorte: "illisible" };
  }
  const { version, sections } = valeur;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { sorte: "illisible" };
  }
  if (version > VERSION_DES_REGLAGES) {
    return { sorte: "plus-recent" };
  }
  return estUnObjet(sections) ? { sorte: "lisible", sections } : { sorte: "illisible" };
}

function appliquer(
  depart: SectionsDeVue,
  changements: Readonly<Record<string, unknown>>,
): SectionsDeVue {
  const sections: Record<string, unknown> = { ...depart };
  for (const [nom, valeur] of Object.entries(changements)) {
    if (valeur === undefined) {
      delete sections[nom];
    } else {
      sections[nom] = valeur;
    }
  }
  return sections;
}

// Vrai si l'appareil porte désormais ces sections (ou plus rien, sans section).
function inscrire(cle: string, sections: SectionsDeVue): boolean {
  try {
    if (Object.keys(sections).length === 0) {
      localStorage.removeItem(cle);
    } else {
      localStorage.setItem(cle, JSON.stringify({ version: VERSION_DES_REGLAGES, sections }));
    }
    return true;
  } catch {
    return false;
  }
}

function estUnObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}
