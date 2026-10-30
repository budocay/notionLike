// Façade du document de table (F-017 H10, ADR-0016), sur le modèle de celle du document d'espace :
// ouverte sur un `Y.Doc` fourni, elle n'écrit rien à l'ouverture, garde la table lue tant qu'elle ne
// change pas, et ne laisse sortir du paquet ni le nom des types racine ni la forme stockée.
import * as Y from "yjs";

import { type CodeErreurDocument, ErreurDocument } from "./erreurs.ts";
import {
  admettreRang,
  type Cible,
  ecrireCellule,
  ecrireNom,
  ecrireNouvelleColonne,
  ecrireNouvelleLigne,
  ecrireNouvelleOption,
  ecrireRang,
  ecrireSuppression,
  lireColonnes,
  lireEntrees,
  type RangAdmis,
  type RefusDuDocument,
  refusDuDocument,
} from "./format-table.ts";
import { AUCUN_RANG_ADMIS, insertionParmi } from "./rang.ts";
import {
  type ColonneLue,
  estUnTypeDeColonne,
  type EtatTable,
  type IdColonne,
  type IdLigne,
  type IdOption,
  libelleAdmis,
  lireEtatTable,
  LONGUEUR_MAX_LIBELLE,
  LONGUEUR_MAX_NOM,
  memeTable,
  nomAdmis,
  type TableLue,
  type TypeDeColonne,
  type ValeurDeCellule,
  valeurConforme,
} from "./table.ts";

declare const crypto: { randomUUID(): string };
// Le paquet compile sans DOM ni types Node ; `console` existe pourtant sous l'un comme sous l'autre.
declare const console: { error(...donnees: unknown[]): void };

const SIGNALEMENT_DU_RAPPEL_FAUTIF =
  "@notionlike/document : un rappel d'abonné de table a levé pendant la diffusion d'un changement.";

export interface DocumentTable {
  readonly doc: Y.Doc;
  /** Lève `version-non-prise-en-charge` ou `pas-un-document-de-table` si le document est refusé. */
  lire(): TableLue;
  abonner(rappel: () => void): () => void;
  creerColonne(nom: string, type: TypeDeColonne, position?: number): IdColonne;
  renommerColonne(colonne: IdColonne, nom: string): void;
  deplacerColonne(colonne: IdColonne, position: number): void;
  supprimerColonne(colonne: IdColonne): void;
  ajouterOption(colonne: IdColonne, libelle: string, position?: number): IdOption;
  renommerOption(colonne: IdColonne, option: IdOption, libelle: string): void;
  deplacerOption(colonne: IdColonne, option: IdOption, position: number): void;
  retirerOption(colonne: IdColonne, option: IdOption): void;
  /** `valeurs` : par colonne ; `null` laisse la cellule vide. */
  creerLigne(valeurs?: ReadonlyMap<IdColonne, ValeurDeCellule | null>, position?: number): IdLigne;
  deplacerLigne(ligne: IdLigne, position: number): void;
  supprimerLigne(ligne: IdLigne): void;
  /** `null` vide la cellule. */
  ecrireCellule(ligne: IdLigne, colonne: IdColonne, valeur: ValeurDeCellule | null): void;
  /** Retire l'écouteur posé par la façade ; toute opération lève ensuite `facade-fermee`. */
  fermer(): void;
}

/** La table lue, ou le refus du document. */
type Lecture = TableLue | RefusDuDocument;

// Le ramasse-miettes reste actif : une cellule réécrite n'accumule pas son historique (veille,
// constat 8).
export function creerDocumentTable(): DocumentTable {
  return ouvrirDocumentTable(new Y.Doc({ gc: true }));
}

/**
 * Ordre lu des lignes retenues (identifiants et rangs), gardé par la façade entre deux créations
 * (F-034, D-041) : `creerLigne` n'a besoin que de lui, et le relire en entier à chaque création rend
 * n créations quadratiques. Il n'est valide que si aucune transaction autre que la création
 * elle-même n'a touché le document depuis qu'il a été lu.
 */
interface OrdreDesLignes {
  ids: string[];
  rangs: string[];
  valide: boolean;
  /** Transaction ouverte par la création en cours : la seule dont l'effet est déjà dans l'ordre. */
  propre: Y.Transaction | null;
}

export function ouvrirDocumentTable(doc: Y.Doc): DocumentTable {
  let lecture = lectureDe(doc);
  let perimee = false;
  let fermee = false;
  const abonnes = new Set<() => void>();
  const ordre: OrdreDesLignes = { ids: [], rangs: [], valide: false, propre: null };

  // Sans abonné, personne n'attend la relecture : elle se fait à la prochaine lecture ou au prochain
  // abonnement, et rend la même référence tant que la table lue n'a pas changé.
  const rafraichir = (): void => {
    if (perimee) {
      perimee = false;
      const relue = lectureDe(doc);
      if (!memeLecture(relue, lecture)) {
        lecture = relue;
      }
    }
  };

  // Une notification par transaction qui change la table lue, ou qui fait entrer dans un refus ou en
  // sortir (F-017-AC9) : ni `afterTransaction` ni `observeDeep` ne le disent seuls (veille, constat 4).
  const apresTransaction = (transaction: Y.Transaction): void => {
    // Yjs appelle les écouteurs présents au début de l'émission : celui d'une façade fermée entre-temps
    // ne doit ni relire ni notifier.
    if (fermee) {
      return;
    }
    if (transaction !== ordre.propre) {
      ordre.valide = false;
    }
    if (abonnes.size === 0) {
      perimee = true;
      return;
    }
    const relue = lectureDe(doc);
    if (!memeLecture(relue, lecture)) {
      lecture = relue;
      diffuser(abonnes);
    }
  };
  doc.on("afterTransaction", apresTransaction);

  // Contrôlé avant tout autre refus, puis le refus du document (ordre de la conception de F-017).
  const ouverte = <T>(operation: () => T): T => {
    if (fermee) {
      throw new ErreurDocument("facade-fermee", "La façade du document de table est fermée.");
    }
    exigerTableAdmise(doc);
    return operation();
  };

  return {
    doc,
    lire: () => {
      rafraichir();
      return typeof lecture === "string" ? refuser(lecture) : lecture;
    },
    abonner: (rappel) => {
      if (fermee) {
        return () => undefined;
      }
      rafraichir();
      const notifier = (): void => rappel();
      abonnes.add(notifier);
      return () => void abonnes.delete(notifier);
    },
    creerColonne: (nom, type, position) => ouverte(() => creerColonne(doc, nom, type, position)),
    renommerColonne: (colonne, nom) => ouverte(() => renommerColonne(doc, colonne, nom)),
    deplacerColonne: (colonne, position) => ouverte(() => deplacerColonne(doc, colonne, position)),
    supprimerColonne: (colonne) => ouverte(() => supprimerColonne(doc, colonne)),
    ajouterOption: (colonne, libelle, position) =>
      ouverte(() => ajouterOption(doc, colonne, libelle, position)),
    renommerOption: (colonne, option, libelle) =>
      ouverte(() => renommerOption(doc, colonne, option, libelle)),
    deplacerOption: (colonne, option, position) =>
      ouverte(() => deplacerOption(doc, colonne, option, position)),
    retirerOption: (colonne, option) => ouverte(() => retirerOption(doc, colonne, option)),
    creerLigne: (valeurs, position) => ouverte(() => creerLigne(doc, ordre, valeurs, position)),
    deplacerLigne: (ligne, position) => ouverte(() => deplacerLigne(doc, ligne, position)),
    supprimerLigne: (ligne) => ouverte(() => supprimerLigne(doc, ligne)),
    ecrireCellule: (ligne, colonne, valeur) =>
      ouverte(() => ecrireUneCellule(doc, ligne, colonne, valeur)),
    fermer: () => {
      fermee = true;
      abonnes.clear();
      doc.off("afterTransaction", apresTransaction);
    },
  };
}

function lectureDe(doc: Y.Doc): Lecture {
  return refusDuDocument(doc) ?? lireEtat(doc).table;
}

function lireEtat(doc: Y.Doc): EtatTable {
  const { colonnes, lignes } = lireEntrees(doc);
  return lireEtatTable(colonnes, lignes);
}

function memeLecture(a: Lecture, b: Lecture): boolean {
  return typeof a === "string" || typeof b === "string" ? a === b : memeTable(a, b);
}

// La copie tient à l'écart les abonnés inscrits pendant la diffusion ; le test d'appartenance écarte
// ceux qu'un rappel précédent vient de désabonner, et tous dès que la façade est fermée. Un rappel
// qui lève ne prive pas les suivants et ne remonte pas par la transaction en cours, `Y.applyUpdate`
// compris : son exception va à la console d'erreur, seul canal.
function diffuser(abonnes: ReadonlySet<() => void>): void {
  for (const notifier of [...abonnes]) {
    if (abonnes.has(notifier)) {
      try {
        notifier();
      } catch (exception) {
        console.error(SIGNALEMENT_DU_RAPPEL_FAUTIF, exception);
      }
    }
  }
}

const MESSAGES_DE_REFUS: Readonly<Record<RefusDuDocument, string>> = {
  "version-non-prise-en-charge":
    "La version de format du document de table n'est pas prise en charge.",
  "pas-un-document-de-table": "Ce document n'est pas un document de table.",
};

function refuser(refus: RefusDuDocument): never {
  throw new ErreurDocument(refus, MESSAGES_DE_REFUS[refus]);
}

function exigerTableAdmise(doc: Y.Doc): void {
  const refus = refusDuDocument(doc);
  if (refus !== undefined) {
    refuser(refus);
  }
}

function refus(code: CodeErreurDocument, message: string): never {
  throw new ErreurDocument(code, message);
}

// ── Arguments ────────────────────────────────────────────────────────────────────────────────────

function exigerType(type: unknown): asserts type is TypeDeColonne {
  if (!estUnTypeDeColonne(type)) {
    refus("type-de-colonne-inconnu", `Le type de colonne ${String(type)} n'existe pas.`);
  }
}

// Un nom ou un libellé admis est rendu sous sa forme normalisée : c'est elle qui est écrite, pour que
// la réplique d'origine lise ce que lisent les autres (F-017-AC21).
function exigerNom(nom: unknown): string {
  return (
    nomAdmis(nom) ??
    refus(
      "nom-non-admis",
      `Le nom de colonne doit être une chaîne d'au plus ${LONGUEUR_MAX_NOM} caractères.`,
    )
  );
}

function exigerLibelle(libelle: unknown): string {
  return (
    libelleAdmis(libelle) ??
    refus(
      "libelle-non-admis",
      `Le libellé d'option doit être une chaîne d'au plus ${LONGUEUR_MAX_LIBELLE} caractères.`,
    )
  );
}

// ── Cibles ───────────────────────────────────────────────────────────────────────────────────────

function exigerLigne(etat: EtatTable, ligne: IdLigne): number {
  const indice = etat.table.lignes.findIndex((lue) => lue.id === ligne);
  return indice >= 0 ? indice : refus("ligne-introuvable", `Aucune ligne ${ligne} dans la table.`);
}

function exigerColonne(etat: EtatTable, colonne: IdColonne): number {
  const indice = etat.table.colonnes.findIndex((lue) => lue.id === colonne);
  return indice >= 0
    ? indice
    : refus("colonne-introuvable", `Aucune colonne ${colonne} dans la table.`);
}

function colonneLue(etat: EtatTable, indice: number): ColonneLue {
  const colonne = etat.table.colonnes[indice];
  return colonne ?? refus("colonne-introuvable", "Colonne absente de la table lue.");
}

function exigerColonneAOptions(etat: EtatTable, colonne: IdColonne): ColonneLue {
  const lue = colonneLue(etat, exigerColonne(etat, colonne));
  return lue.type === "selection"
    ? lue
    : refus("colonne-sans-options", `La colonne ${colonne} n'est pas une colonne de sélection.`);
}

function exigerOption(colonne: ColonneLue, option: IdOption): number {
  const indice = colonne.options.findIndex((lue) => lue.id === option);
  return indice >= 0
    ? indice
    : refus("option-introuvable", `Aucune option ${option} dans la colonne ${colonne.id}.`);
}

// ── Valeurs ──────────────────────────────────────────────────────────────────────────────────────

// La valeur exposée est celle qui est écrite : un texte sous sa forme normalisée, `-0` en `0`.
function valeurAdmise(colonne: ColonneLue, valeur: ValeurDeCellule | null): ValeurDeCellule | null {
  if (valeur === null) {
    return null;
  }
  const options = new Set(colonne.options.map((option) => option.id));
  return (
    valeurConforme(colonne.type, valeur, options) ??
    refus("valeur-non-conforme", `Valeur non conforme au type ${colonne.type} de la colonne.`)
  );
}

// ── Positions et rangs ───────────────────────────────────────────────────────────────────────────

function positionExigee(position: number, nombre: number): number {
  if (!Number.isInteger(position) || position < 0 || position > nombre) {
    refus(
      "position-invalide",
      `La position ${String(position)} n'est pas un entier entre 0 et ${nombre}.`,
    );
  }
  return position;
}

// Sans position demandée, l'élément créé va en dernier (F-017-AC2, AC3).
function positionAdmise(position: number | undefined, nombre: number): number {
  return position === undefined ? nombre : positionExigee(position, nombre);
}

/** Rang de l'élément placé, et rangs réattribués aux autres, par identifiant, tous admis. */
interface Placement {
  readonly rang: RangAdmis;
  readonly reattribues: ReadonlyMap<string, RangAdmis>;
}

// Le refus `rang-indisponible` vient après tous les autres contrôles de l'opération (F-029-AC10).
function placement(ids: readonly string[], rangs: readonly string[], position: number): Placement {
  const insertion = insertionParmi(rangs, position);
  if (insertion === AUCUN_RANG_ADMIS) {
    refus("rang-indisponible", `Aucun rang admis ne permet de placer l'élément en ${position}.`);
  }
  const reattribues = new Map<string, RangAdmis>();
  insertion.reattribues.forEach((rang, indice) => {
    const id = ids[indice];
    if (id !== undefined) {
      reattribues.set(id, admettreRang(rang));
    }
  });
  return { rang: admettreRang(insertion.rang), reattribues };
}

/** `undefined` si l'élément est déjà à la position demandée : rien à écrire. */
function deplacement(
  ids: readonly string[],
  rangs: readonly string[],
  id: string,
  position: number,
): Placement | undefined {
  const actuelle = ids.indexOf(id);
  const garder = (_: string, indice: number): boolean => indice !== actuelle;
  const cible = positionExigee(position, ids.length - 1);
  return cible === actuelle
    ? undefined
    : placement(ids.filter(garder), rangs.filter(garder), cible);
}

function ecrireReattribues(
  doc: Y.Doc,
  reattribues: ReadonlyMap<string, RangAdmis>,
  cibleDe: (id: string) => Cible,
): void {
  reattribues.forEach((rang, id) => ecrireRang(doc, cibleDe(id), rang));
}

function ecrirePlacement(
  doc: Y.Doc,
  id: string,
  { rang, reattribues }: Placement,
  cibleDe: (id: string) => Cible,
): void {
  doc.transact(() => {
    ecrireRang(doc, cibleDe(id), rang);
    ecrireReattribues(doc, reattribues, cibleDe);
  });
}

const colonneVisee = (id: IdColonne): Cible => ({ sorte: "colonne", id });
const ligneVisee = (id: IdLigne): Cible => ({ sorte: "ligne", id });
const optionVisee =
  (colonne: IdColonne) =>
  (id: IdOption): Cible => ({ sorte: "option", colonne, id });

const identifiants = (elements: readonly { readonly id: string }[]): string[] =>
  elements.map((element) => element.id);

// ── Colonnes ─────────────────────────────────────────────────────────────────────────────────────

function creerColonne(
  doc: Y.Doc,
  nom: string,
  type: TypeDeColonne,
  position: number | undefined,
): IdColonne {
  exigerType(type);
  const admis = exigerNom(nom);
  const etat = lireEtat(doc);
  const colonnes = identifiants(etat.table.colonnes);
  const place = placement(
    colonnes,
    etat.rangsDesColonnes,
    positionAdmise(position, colonnes.length),
  );
  const id = crypto.randomUUID();
  doc.transact(() => {
    ecrireNouvelleColonne(doc, { id, nom: admis, type, rang: place.rang });
    ecrireReattribues(doc, place.reattribues, colonneVisee);
  });
  return id;
}

function renommerColonne(doc: Y.Doc, colonne: IdColonne, nom: string): void {
  const admis = exigerNom(nom);
  const etat = lireEtat(doc);
  if (colonneLue(etat, exigerColonne(etat, colonne)).nom !== admis) {
    doc.transact(() => ecrireNom(doc, { sorte: "colonne", id: colonne }, admis));
  }
}

function deplacerColonne(doc: Y.Doc, colonne: IdColonne, position: number): void {
  const etat = lireEtat(doc);
  exigerColonne(etat, colonne);
  const place = deplacement(
    identifiants(etat.table.colonnes),
    etat.rangsDesColonnes,
    colonne,
    position,
  );
  if (place !== undefined) {
    ecrirePlacement(doc, colonne, place, colonneVisee);
  }
}

function supprimerColonne(doc: Y.Doc, colonne: IdColonne): void {
  exigerColonne(lireEtat(doc), colonne);
  doc.transact(() => ecrireSuppression(doc, colonneVisee(colonne)));
}

// ── Options ──────────────────────────────────────────────────────────────────────────────────────

function ajouterOption(
  doc: Y.Doc,
  colonne: IdColonne,
  libelle: string,
  position: number | undefined,
): IdOption {
  const admis = exigerLibelle(libelle);
  const etat = lireEtat(doc);
  const options = identifiants(exigerColonneAOptions(etat, colonne).options);
  const place = placement(
    options,
    etat.rangsDesOptions.get(colonne) ?? [],
    positionAdmise(position, options.length),
  );
  const id = crypto.randomUUID();
  doc.transact(() => {
    ecrireNouvelleOption(doc, colonne, { id, libelle: admis, rang: place.rang });
    ecrireReattribues(doc, place.reattribues, optionVisee(colonne));
  });
  return id;
}

function renommerOption(doc: Y.Doc, colonne: IdColonne, option: IdOption, libelle: string): void {
  const admis = exigerLibelle(libelle);
  const lue = exigerColonneAOptions(lireEtat(doc), colonne);
  if (lue.options[exigerOption(lue, option)]?.libelle !== admis) {
    doc.transact(() => ecrireNom(doc, { sorte: "option", colonne, id: option }, admis));
  }
}

function deplacerOption(doc: Y.Doc, colonne: IdColonne, option: IdOption, position: number): void {
  const etat = lireEtat(doc);
  const lue = exigerColonneAOptions(etat, colonne);
  exigerOption(lue, option);
  const place = deplacement(
    identifiants(lue.options),
    etat.rangsDesOptions.get(colonne) ?? [],
    option,
    position,
  );
  if (place !== undefined) {
    ecrirePlacement(doc, option, place, optionVisee(colonne));
  }
}

// Les cellules qui portaient l'option se lisent vides (F-017-AC8) : rien d'autre n'est écrit.
function retirerOption(doc: Y.Doc, colonne: IdColonne, option: IdOption): void {
  exigerOption(exigerColonneAOptions(lireEtat(doc), colonne), option);
  doc.transact(() => ecrireSuppression(doc, optionVisee(colonne)(option)));
}

// ── Lignes et cellules ───────────────────────────────────────────────────────────────────────────

// Toutes les colonnes visées d'abord, puis toutes les valeurs : l'ordre des refus ne dépend pas de
// celui des entrées. Une valeur `null` ne crée aucune clé.
function cellulesInitiales(
  etat: EtatTable,
  valeurs: ReadonlyMap<IdColonne, ValeurDeCellule | null>,
): Map<IdColonne, ValeurDeCellule> {
  const visees = [...valeurs].map(
    ([colonne, valeur]) => [colonneLue(etat, exigerColonne(etat, colonne)), valeur] as const,
  );
  const cellules = new Map<IdColonne, ValeurDeCellule>();
  for (const [colonne, valeur] of visees) {
    const admise = valeurAdmise(colonne, valeur);
    if (admise !== null) {
      cellules.set(colonne.id, admise);
    }
  }
  return cellules;
}

function relireOrdre(doc: Y.Doc, ordre: OrdreDesLignes): void {
  const etat = lireEtat(doc);
  ordre.ids = identifiants(etat.table.lignes);
  ordre.rangs = [...etat.rangsDesLignes];
  ordre.valide = true;
}

// L'ordre reste celui que la lecture donnerait : la ligne créée prend sa position, et les lignes
// réattribuées gardent la leur, leurs rangs restant strictement croissants (F-029).
function inscrireCreation(
  ordre: OrdreDesLignes,
  id: string,
  position: number,
  place: Placement,
): void {
  ordre.ids.splice(position, 0, id);
  ordre.rangs.splice(position, 0, place.rang);
  if (place.reattribues.size > 0) {
    ordre.ids.forEach((autre, indice) => {
      const rang = place.reattribues.get(autre);
      if (rang !== undefined) {
        ordre.rangs[indice] = rang;
      }
    });
  }
}

// Seules les colonnes sont lues, puis l'ordre des lignes si la façade ne l'a pas déjà : le coût d'une
// création ne croît plus avec les lignes présentes (F-034). Ordre des contrôles inchangé : colonnes,
// valeurs, position, puis `rang-indisponible` (F-029-AC10).
function creerLigne(
  doc: Y.Doc,
  ordre: OrdreDesLignes,
  valeurs: ReadonlyMap<IdColonne, ValeurDeCellule | null> | undefined,
  position: number | undefined,
): IdLigne {
  const cellules = cellulesInitiales(lireEtatTable(lireColonnes(doc), []), valeurs ?? new Map());
  if (!ordre.valide) {
    relireOrdre(doc, ordre);
  }
  const visee = positionAdmise(position, ordre.ids.length);
  const place = placement(ordre.ids, ordre.rangs, visee);
  const id = crypto.randomUUID();
  doc.transact((transaction) => {
    ordre.propre = transaction;
    ecrireNouvelleLigne(doc, { id, rang: place.rang, cellules });
    ecrireReattribues(doc, place.reattribues, ligneVisee);
  });
  ordre.propre = null;
  if (ordre.valide) {
    inscrireCreation(ordre, id, visee, place);
  }
  return id;
}

function deplacerLigne(doc: Y.Doc, ligne: IdLigne, position: number): void {
  const etat = lireEtat(doc);
  exigerLigne(etat, ligne);
  const place = deplacement(identifiants(etat.table.lignes), etat.rangsDesLignes, ligne, position);
  if (place !== undefined) {
    ecrirePlacement(doc, ligne, place, ligneVisee);
  }
}

function supprimerLigne(doc: Y.Doc, ligne: IdLigne): void {
  exigerLigne(lireEtat(doc), ligne);
  doc.transact(() => ecrireSuppression(doc, ligneVisee(ligne)));
}

function ecrireUneCellule(
  doc: Y.Doc,
  ligne: IdLigne,
  colonne: IdColonne,
  valeur: ValeurDeCellule | null,
): void {
  const etat = lireEtat(doc);
  const indiceDeLigne = exigerLigne(etat, ligne);
  const indiceDeColonne = exigerColonne(etat, colonne);
  const admise = valeurAdmise(colonneLue(etat, indiceDeColonne), valeur);
  if (etat.table.lignes[indiceDeLigne]?.cellules[indiceDeColonne] !== admise) {
    doc.transact(() => ecrireCellule(doc, ligne, colonne, admise));
  }
}
