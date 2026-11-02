// Aides de F-034 : scénarios dont le résultat a été relevé sur le code d'avant la feature (a64bf5f)
// puis figé en dur dans les tests ; le même code les rejoue ici.
import * as Y from "yjs";

import {
  creerDocumentTable,
  type DocumentTable,
  ErreurDocument,
  type IdLigne,
  ouvrirDocumentTable,
} from "../src/index.ts";
import { fixerDesIdentifiantsDisperses } from "./aides-table.ts";

/** Contenu Yjs d'un document de table, clés triées : types partagés, puis champs de chaque entrée. */
export function contenu(doc: Y.Doc): string {
  const trier = (valeur: unknown): unknown =>
    valeur !== null && typeof valeur === "object"
      ? Object.fromEntries(
          Object.entries(valeur as Record<string, unknown>)
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([cle, v]) => [cle, trier(v)]),
        )
      : valeur;
  const partages: Record<string, unknown> = {};
  for (const nom of [...doc.share.keys()].sort()) {
    const type = doc.share.get(nom);
    partages[nom] = trier(type instanceof Y.Array ? type.toJSON() : doc.getMap(nom).toJSON());
  }
  return JSON.stringify(partages);
}

/** Empreinte FNV-1a 32 bits en hexadécimal, deux passes (graines distinctes) : 64 bits. */
export function empreinte(texte: string): string {
  const passe = (graine: number): string => {
    let h = graine;
    for (let i = 0; i < texte.length; i += 1) {
      h = Math.imul(h ^ texte.charCodeAt(i), 16777619) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  return passe(2166136261) + passe(84696351);
}

function code(operation: () => unknown): string {
  try {
    operation();
    return "ok";
  } catch (exception) {
    if (exception instanceof ErreurDocument) {
      return exception.code;
    }
    throw exception;
  }
}

/** Les identifiants créés dans l'ordre, pour décrire une table lue par numéros d'apparition. */
export interface Suivi {
  readonly table: DocumentTable;
  readonly creees: IdLigne[];
  creer: (position?: number) => IdLigne;
}

export function tableSuivie(lignes: number): Suivi {
  fixerDesIdentifiantsDisperses();
  const table = creerDocumentTable();
  table.creerColonne("Nom", "texte");
  const creees: IdLigne[] = [];
  const creer = (position?: number): IdLigne => {
    const id = table.creerLigne(undefined, position);
    creees.push(id);
    return id;
  };
  for (let i = 0; i < lignes; i += 1) {
    creer();
  }
  return { table, creees, creer };
}

function etat(erreurs: string[], suivi: Suivi, doc: Y.Doc = suivi.table.doc): string {
  const ordre = suivi.table
    .lire()
    .lignes.map((ligne) => String(suivi.creees.indexOf(ligne.id)))
    .join(",");
  return `${erreurs.join("+")}|${ordre}|${empreinte(contenu(doc))}`;
}

export type Perturbation =
  "supprimer-tete" | "supprimer-fin" | "deplacer-tete-fin" | "deplacer-fin-tete";

function perturber(suivi: Suivi, perturbation: Perturbation): void {
  const { table, creees } = suivi;
  const dernier = creees[creees.length - 1] as IdLigne;
  switch (perturbation) {
    case "supprimer-tete":
      table.supprimerLigne(creees[0] as IdLigne);
      break;
    case "supprimer-fin":
      table.supprimerLigne(dernier);
      break;
    case "deplacer-tete-fin":
      table.deplacerLigne(creees[0] as IdLigne, 4);
      break;
    case "deplacer-fin-tete":
      table.deplacerLigne(dernier, 0);
      break;
  }
}

/** Perturbation puis création, dans une même transaction externe ou dans des transactions séparées. */
export function perturbationPuisCreation(
  perturbation: Perturbation,
  position: number | undefined,
  englobante: boolean,
): string {
  const suivi = tableSuivie(5);
  const erreurs: string[] = [];
  const sequence = (): void => {
    perturber(suivi, perturbation);
    erreurs.push(code(() => suivi.creer(position)));
    erreurs.push(code(() => suivi.creer(position === undefined ? 0 : position - 1)));
  };
  if (englobante) {
    suivi.table.doc.transact(sequence);
  } else {
    sequence();
  }
  return etat(erreurs, suivi);
}

/** Écriture directe dans le Y.Doc (sans la façade) puis création. */
export function ecritureDirectePuisCreation(
  ecriture: "supprimer" | "ajouter",
  position: number,
): string {
  const suivi = tableSuivie(5);
  const lignes = suivi.table.doc.getMap<Y.Map<unknown>>("lignes");
  if (ecriture === "supprimer") {
    lignes.get(suivi.creees[2] as IdLigne)?.set("supprimee", true);
  } else {
    const champs = new Y.Map<unknown>();
    champs.set("rang", "0");
    champs.set("supprimee", false);
    champs.set("cellules", new Y.Map<unknown>());
    lignes.set("00000000-0000-4000-8000-0000000000aa", champs);
    suivi.creees.push("00000000-0000-4000-8000-0000000000aa" as IdLigne);
  }
  const erreurs = [code(() => suivi.creer(position))];
  erreurs.push(code(() => suivi.creer(position)));
  return etat(erreurs, suivi);
}

/**
 * Un écouteur d'`afterTransaction` inscrit AVANT la façade appelle `creerLigne` pendant l'émission
 * de la transaction qui a supprimé une ligne en direct.
 */
export function ecouteurAnterieur(position: number | undefined): string {
  fixerDesIdentifiantsDisperses();
  const doc = new Y.Doc({ gc: true });
  const erreurs: string[] = [];
  const creees: IdLigne[] = [];
  const facade: { table?: DocumentTable } = {};
  let declenche = false;
  doc.on("afterTransaction", (transaction: Y.Transaction) => {
    const ouverte = facade.table;
    if (transaction.origin === "declencheur" && !declenche && ouverte !== undefined) {
      declenche = true;
      erreurs.push(code(() => creees.push(ouverte.creerLigne(undefined, position))));
    }
  });
  const table = ouvrirDocumentTable(doc);
  facade.table = table;
  table.creerColonne("Nom", "texte");
  for (let i = 0; i < 5; i += 1) {
    creees.push(table.creerLigne());
  }
  const lignes = doc.getMap<Y.Map<unknown>>("lignes");
  doc.transact(() => lignes.get(creees[1] as IdLigne)?.set("supprimee", true), "declencheur");
  erreurs.push(code(() => table.creerLigne(undefined, 4)));
  const ordre = table
    .lire()
    .lignes.map((ligne) => String(creees.indexOf(ligne.id)))
    .join(",");
  return `${erreurs.join("+")}|${ordre}|${empreinte(contenu(doc))}`;
}

/** `lire()` après `fermer()` : la dernière table lue, quoi qu'il arrive au document ensuite. */
export function lireApresFermer(abonne: boolean): string {
  const suivi = tableSuivie(3);
  if (abonne) {
    suivi.table.abonner(() => undefined);
  }
  suivi.table.fermer();
  const lignes = suivi.table.doc.getMap<Y.Map<unknown>>("lignes");
  lignes.get(suivi.creees[0] as IdLigne)?.set("supprimee", true);
  const premiere = suivi.table.lire().lignes.length;
  lignes.get(suivi.creees[1] as IdLigne)?.set("supprimee", true);
  const seconde = suivi.table.lire().lignes.length;
  const ecriture = code(() => suivi.table.creerLigne());
  return `${premiere},${seconde},${ecriture}`;
}

/** Suite de quelques milliers de créations à positions variées, valeurs variées, cache actif. */
export function grandeSuite(creations: number): string {
  fixerDesIdentifiantsDisperses();
  const table = creerDocumentTable();
  const nom = table.creerColonne("Nom", "texte");
  const quantite = table.creerColonne("Qté", "nombre");
  let graine = 12345;
  const alea = (): number => {
    graine = (Math.imul(graine, 1103515245) + 12345) >>> 0;
    return graine / 2 ** 32;
  };
  for (let i = 0; i < creations; i += 1) {
    const n = i;
    const mode = Math.floor(i / 250) % 4;
    // Quatre régimes par tranche de 250 : en tête (rangs qui s'allongent), en fin, au milieu, au hasard.
    const position =
      mode === 0
        ? 0
        : mode === 1
          ? undefined
          : mode === 2
            ? Math.floor(n / 2)
            : Math.floor(alea() * (n + 1));
    const valeurs = new Map<string, string | number | null>();
    if (i % 3 === 0) valeurs.set(nom, `ligne ${i}`);
    if (i % 5 === 0) valeurs.set(quantite, i);
    table.creerLigne(valeurs, position);
  }
  return empreinte(contenu(table.doc)) + ":" + String(table.lire().lignes.length);
}
