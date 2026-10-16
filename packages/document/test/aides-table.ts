// Aides des tests du document de table (F-017) : répliques à identifiant de client fixé, échange des
// mises à jour, refus observés, identifiants reproductibles et suites d'opérations tirées.
import fc from "fast-check";
import { vi } from "vitest";
import * as Y from "yjs";

import {
  type CodeErreurDocument,
  type DocumentTable,
  ErreurDocument,
  ouvrirDocumentTable,
  type TableLue,
  type ValeurDeCellule,
} from "../src/index.ts";

declare const crypto: { randomUUID(): string };

export const ORIGINE_RECUE = "mise à jour reçue";

export interface RepliqueDeTable {
  readonly table: DocumentTable;
  /** Mises à jour nées sur cette réplique, dans l'ordre de leur émission. */
  readonly emises: Uint8Array[];
  /** Nombre de mises à jour de chaque émettrice déjà reçues par cette réplique. */
  readonly recues: Map<RepliqueDeTable, number>;
}

// L'identifiant de client est fixé : Yjs s'en sert pour départager deux écritures simultanées.
export function creerRepliqueDeTable(identifiantDeClient: number): RepliqueDeTable {
  const doc = new Y.Doc({ gc: true });
  doc.clientID = identifiantDeClient;
  const emises: Uint8Array[] = [];
  doc.on("update", (miseAJour: Uint8Array, origine: unknown) => {
    if (origine !== ORIGINE_RECUE) {
      emises.push(miseAJour);
    }
  });
  return { table: ouvrirDocumentTable(doc), emises, recues: new Map() };
}

export function livrer(destinataire: RepliqueDeTable, miseAJour: Uint8Array): void {
  Y.applyUpdate(destinataire.table.doc, miseAJour, ORIGINE_RECUE);
}

/** Les mises à jour de l'émettrice que le destinataire n'a pas encore reçues, dans l'ordre. */
export function nonRecues(destinataire: RepliqueDeTable, emettrice: RepliqueDeTable): Uint8Array[] {
  const deja = destinataire.recues.get(emettrice) ?? 0;
  destinataire.recues.set(emettrice, emettrice.emises.length);
  return emettrice.emises.slice(deja);
}

/** Chaque réplique reçoit tout ce que les autres ont émis et qu'elle n'a pas encore reçu. */
export function echanger(repliques: readonly RepliqueDeTable[]): void {
  for (const emettrice of repliques) {
    for (const destinataire of repliques) {
      if (destinataire !== emettrice) {
        nonRecues(destinataire, emettrice).forEach((miseAJour) => livrer(destinataire, miseAJour));
      }
    }
  }
}

/** Une réplique vierge qui reçoit l'état complet de chaque réplique, dans l'ordre donné. */
export function observateur(repliques: readonly RepliqueDeTable[], client: number): TableLue {
  const vierge = creerRepliqueDeTable(client);
  repliques.forEach((replique) => {
    livrer(vierge, Y.encodeStateAsUpdate(replique.table.doc));
  });
  return vierge.table.lire();
}

export function compterMisesAJour(doc: Y.Doc, action: () => void): number {
  let misesAJour = 0;
  const compter = (): void => {
    misesAJour += 1;
  };
  doc.on("update", compter);
  try {
    action();
  } finally {
    doc.off("update", compter);
  }
  return misesAJour;
}

export interface Refus {
  readonly code: CodeErreurDocument | "aucun" | "autre";
  readonly misesAJour: number;
}

export function refusDe(doc: Y.Doc, operation: () => unknown): Refus {
  let code: Refus["code"] = "aucun";
  const misesAJour = compterMisesAJour(doc, () => {
    try {
      operation();
    } catch (erreur) {
      code = erreur instanceof ErreurDocument ? erreur.code : "autre";
    }
  });
  return { code, misesAJour };
}

export function refus(code: CodeErreurDocument): Refus {
  return { code, misesAJour: 0 };
}

/**
 * Identifiants reproductibles dont l'ordre n'est pas celui des créations : le départage par
 * identifiant ne suit donc pas l'ordre d'écriture.
 */
export function fixerDesIdentifiantsDisperses(): void {
  let numero = 0;
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
    numero += 1;
    const disperse = Math.imul(numero, 2654435761) >>> 0;
    return `00000000-0000-4000-8000-0000${disperse.toString(16).padStart(8, "0")}`;
  });
}

/** Les prochains éléments créés, toutes répliques confondues, reçoivent ces identifiants. */
export function fixerLesProchainsIdentifiants(...identifiants: string[]): void {
  const tirage = vi.spyOn(crypto, "randomUUID");
  for (const identifiant of identifiants) {
    tirage.mockReturnValueOnce(identifiant);
  }
}

export function identifiantFixe(numero: number): string {
  return `00000000-0000-4000-8000-${numero.toString().padStart(12, "0")}`;
}

/** Les valeurs de chaque ligne, par nom de colonne : lecture compacte des attendus. */
export function valeursParNom(table: TableLue): Record<string, ValeurDeCellule | null>[] {
  return table.lignes.map((ligne) =>
    Object.fromEntries(
      table.colonnes.map((colonne, indice) => [colonne.nom, ligne.cellules[indice] ?? null]),
    ),
  );
}

// ── Suites d'opérations tirées (F-017-AC9, AC10, AC16) ───────────────────────────────────────────

export const SORTES = [
  "creerColonne",
  "renommerColonne",
  "deplacerColonne",
  "supprimerColonne",
  "ajouterOption",
  "renommerOption",
  "deplacerOption",
  "retirerOption",
  "creerLigne",
  "deplacerLigne",
  "supprimerLigne",
  "ecrireCellule",
] as const;

export interface Commande {
  readonly sorte: (typeof SORTES)[number];
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly texte: string;
}

const TYPES = ["texte", "nombre", "case", "date", "selection"] as const;
const DATES = ["2024-02-29", "0001-01-01", "9999-12-31", "2000-01-15"];

/** Une suite de commandes assez longue pour bâtir une table avant de la modifier. */
export const suiteDeCommandes = (minLength: number, maxLength: number): fc.Arbitrary<Commande[]> =>
  fc.array(commande(), { minLength, maxLength, size: "max" });

export const commande = (): fc.Arbitrary<Commande> =>
  fc.record({
    // Les créations et les écritures de cellules reviennent plus souvent : sans elles, les autres
    // opérations n'ont rien à viser.
    sorte: fc.oneof(
      { weight: 2, arbitrary: fc.constantFrom(...SORTES) },
      {
        weight: 3,
        arbitrary: fc.constantFrom("ecrireCellule", "creerLigne", "creerColonne", "ajouterOption"),
      },
    ),
    a: fc.nat({ max: 1000 }),
    b: fc.nat({ max: 1000 }),
    c: fc.nat({ max: 1000 }),
    // Des unités UTF-16 isolées de temps en temps : le module les écrit normalisées (F-017-AC21).
    texte: fc.oneof(
      { weight: 4, arbitrary: fc.string({ maxLength: 4 }) },
      fc.string({ unit: "binary", maxLength: 4 }),
    ),
  });

function element<T>(elements: readonly T[], indice: number): T | undefined {
  return elements.length === 0 ? undefined : elements[indice % elements.length];
}

// Une valeur tirée du type de la colonne, ou `null` une fois sur cinq.
function valeurPour(table: TableLue, colonne: number, { a, b, c, texte }: Commande) {
  const lue = element(table.colonnes, colonne);
  if (lue === undefined || c % 5 === 0) {
    return { colonne: lue, valeur: null };
  }
  const valeurs: Record<(typeof TYPES)[number], ValeurDeCellule | null> = {
    texte,
    nombre: (a - b) / ((c % 3) + 1),
    case: a % 2 === 0,
    date: DATES[a % DATES.length] ?? null,
    selection: element(lue.options, a)?.id ?? null,
  };
  return { colonne: lue, valeur: valeurs[lue.type] };
}

const OPERATIONS: Readonly<
  Record<Commande["sorte"], (table: DocumentTable, lue: TableLue, c: Commande) => void>
> = {
  creerColonne: (table, lue, { a, b, texte }) =>
    void table.creerColonne(
      texte,
      TYPES[a % TYPES.length] ?? "texte",
      b % (lue.colonnes.length + 1),
    ),
  renommerColonne: (table, lue, { a, texte }) => {
    const colonne = element(lue.colonnes, a);
    if (colonne !== undefined) table.renommerColonne(colonne.id, texte);
  },
  deplacerColonne: (table, lue, { a, b }) => {
    const colonne = element(lue.colonnes, a);
    if (colonne !== undefined) table.deplacerColonne(colonne.id, b % lue.colonnes.length);
  },
  supprimerColonne: (table, lue, { a }) => {
    const colonne = element(lue.colonnes, a);
    if (colonne !== undefined) table.supprimerColonne(colonne.id);
  },
  ajouterOption: (table, lue, { a, b, texte }) => {
    const colonne = element(
      lue.colonnes.filter((lu) => lu.type === "selection"),
      a,
    );
    if (colonne !== undefined)
      table.ajouterOption(colonne.id, texte, b % (colonne.options.length + 1));
  },
  renommerOption: (table, lue, { a, b, texte }) => {
    const colonne = element(
      lue.colonnes.filter((lu) => lu.options.length > 0),
      a,
    );
    const option = colonne === undefined ? undefined : element(colonne.options, b);
    if (colonne !== undefined && option !== undefined)
      table.renommerOption(colonne.id, option.id, texte);
  },
  deplacerOption: (table, lue, { a, b, c }) => {
    const colonne = element(
      lue.colonnes.filter((lu) => lu.options.length > 0),
      a,
    );
    const option = colonne === undefined ? undefined : element(colonne.options, b);
    if (colonne !== undefined && option !== undefined)
      table.deplacerOption(colonne.id, option.id, c % colonne.options.length);
  },
  retirerOption: (table, lue, { a, b }) => {
    const colonne = element(
      lue.colonnes.filter((lu) => lu.options.length > 0),
      a,
    );
    const option = colonne === undefined ? undefined : element(colonne.options, b);
    if (colonne !== undefined && option !== undefined) table.retirerOption(colonne.id, option.id);
  },
  creerLigne: (table, lue, commande) => {
    const { colonne, valeur } = valeurPour(lue, commande.a, commande);
    const valeurs = new Map(colonne === undefined ? [] : [[colonne.id, valeur]]);
    table.creerLigne(valeurs, commande.b % (lue.lignes.length + 1));
  },
  deplacerLigne: (table, lue, { a, b }) => {
    const ligne = element(lue.lignes, a);
    if (ligne !== undefined) table.deplacerLigne(ligne.id, b % lue.lignes.length);
  },
  supprimerLigne: (table, lue, { a }) => {
    const ligne = element(lue.lignes, a);
    if (ligne !== undefined) table.supprimerLigne(ligne.id);
  },
  ecrireCellule: (table, lue, commande) => {
    const ligne = element(lue.lignes, commande.b);
    const { colonne, valeur } = valeurPour(lue, commande.a, commande);
    if (ligne !== undefined && colonne !== undefined)
      table.ecrireCellule(ligne.id, colonne.id, valeur);
  },
};

/** Applique la commande à la table telle qu'elle est lue ; aucune erreur n'est attendue. */
export function appliquer(table: DocumentTable, c: Commande): void {
  OPERATIONS[c.sorte](table, table.lire(), c);
}

/**
 * Oracle de date de test, indépendant du module (F-017-AC18, H13) : un jour `AAAA-MM-JJ` du
 * `0001-01-01` au `9999-12-31`, jugé par un `Date` UTC à l'année posée par `setUTCFullYear` (sans le
 * décalage des années 0 à 99).
 */
export function dateSelonLOracle(texte: string): boolean {
  const morceaux = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texte);
  if (morceaux === null) return false;
  const [annee = 0, mois = 0, jour = 0] = morceaux.slice(1).map(Number);
  if (annee < 1) return false;
  const date = new Date(0);
  date.setUTCFullYear(annee, mois - 1, jour);
  return (
    date.getUTCFullYear() === annee && date.getUTCMonth() === mois - 1 && date.getUTCDate() === jour
  );
}
