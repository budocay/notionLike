import * as Y from "yjs";

import {
  type Arborescence,
  type ArbreLu,
  type EntreePage,
  estDansLeSousArbre,
  type IdPage,
  lireArbre,
  memeArborescence,
  type PageLue,
  trouverPage,
} from "./arbre.ts";
import { ErreurDocument } from "./erreurs.ts";
import {
  ecrireMiseALaCorbeille,
  ecrireNouvellePage,
  ecrirePlace,
  ecrireTitre,
  ecrireVersion,
  estDeVersionPriseEnCharge,
  lireEntrees,
  LONGUEUR_MAX_TITRE,
  type Place,
} from "./format.ts";
import { BORNE_BASSE, BORNE_HAUTE, type Rang, rangEntre, rangsCroissantsEntre } from "./rang.ts";

declare const crypto: { randomUUID(): string };

export interface Emplacement {
  readonly parent: IdPage | null;
  readonly position?: number;
}

export interface DocumentEspace {
  readonly doc: Y.Doc;
  lire(): Arborescence;
  abonner(rappel: () => void): () => void;
  creerPage(titre: string, ou?: Emplacement): IdPage;
  renommerPage(id: IdPage, titre: string): void;
  deplacerPage(id: IdPage, ou: Emplacement): void;
  mettreALaCorbeille(id: IdPage): void;
}

interface EtatLu extends ArbreLu {
  readonly entrees: ReadonlyMap<IdPage, EntreePage>;
}

// Rang de la page insérée, et nouveaux rangs des sœurs réattribuées pour lui faire place.
interface Insertion {
  readonly rang: Rang;
  readonly rangsReattribues: ReadonlyMap<IdPage, Rang>;
}

const A_LA_RACINE: Emplacement = { parent: null };

export function creerDocumentEspace(): DocumentEspace {
  const doc = new Y.Doc();
  ecrireVersion(doc);
  return ouvrirDocumentEspace(doc);
}

export function ouvrirDocumentEspace(doc: Y.Doc): DocumentEspace {
  let lecture = lectureAdmise(doc);
  const abonnes = new Set<() => void>();

  doc.on("afterTransaction", () => {
    const relue = lectureAdmise(doc);
    if (!memeLecture(relue, lecture)) {
      lecture = relue;
      // La copie tient à l'écart les abonnés inscrits pendant la diffusion ; le test d'appartenance
      // écarte ceux qu'un rappel précédent vient de désabonner.
      for (const notifier of [...abonnes]) {
        if (abonnes.has(notifier)) {
          notifier();
        }
      }
    }
  });

  return {
    doc,
    lire: () => lecture ?? refuserLaVersion(),
    abonner: (rappel) => {
      const notifier = (): void => rappel();
      abonnes.add(notifier);
      return () => void abonnes.delete(notifier);
    },
    creerPage: (titre, ou = A_LA_RACINE) => creerPage(doc, titre, ou),
    renommerPage: (id, titre) => renommerPage(doc, id, titre),
    deplacerPage: (id, ou) => deplacerPage(doc, id, ou),
    mettreALaCorbeille: (id) => mettreALaCorbeille(doc, id),
  };
}

// `undefined` tant que la version du document n'est pas prise en charge : rien n'est alors lu.
function lectureAdmise(doc: Y.Doc): Arborescence | undefined {
  return estDeVersionPriseEnCharge(doc) ? lireEtat(doc).arborescence : undefined;
}

function memeLecture(a: Arborescence | undefined, b: Arborescence | undefined): boolean {
  return a === undefined || b === undefined ? a === b : memeArborescence(a, b);
}

function refuserLaVersion(): never {
  throw new ErreurDocument(
    "version-non-prise-en-charge",
    "La version de format du document n'est pas prise en charge.",
  );
}

function exigerVersionPriseEnCharge(doc: Y.Doc): void {
  if (!estDeVersionPriseEnCharge(doc)) {
    refuserLaVersion();
  }
}

function creerPage(doc: Y.Doc, titre: string, ou: Emplacement): IdPage {
  exigerVersionPriseEnCharge(doc);
  exigerTitreAdmis(titre);
  const etat = lireEtat(doc);
  const soeurs = soeursLues(etat, ou.parent);
  const position = positionAdmise(ou.position, soeurs.length);
  const insertion = insertionALaPosition(etat, soeurs, position);
  const places = placesDesAutresPages(etat, insertion, undefined);
  const id = crypto.randomUUID();
  doc.transact(() => {
    ecrireNouvellePage(doc, { id, titre, parent: ou.parent, rang: insertion.rang });
    ecrirePlaces(doc, places);
  });
  return id;
}

function renommerPage(doc: Y.Doc, id: IdPage, titre: string): void {
  exigerVersionPriseEnCharge(doc);
  exigerTitreAdmis(titre);
  if (exigerPageLue(lireEtat(doc), id).titre !== titre) {
    doc.transact(() => ecrireTitre(doc, id, titre));
  }
}

function deplacerPage(doc: Y.Doc, id: IdPage, ou: Emplacement): void {
  exigerVersionPriseEnCharge(doc);
  const etat = lireEtat(doc);
  const page = exigerPageLue(etat, id);
  const soeurs = soeursLues(etat, ou.parent);
  exigerDestinationHorsDeLaDescendance(page, ou.parent);
  const autresSoeurs = soeurs.filter((soeur) => soeur.id !== id);
  const position = positionAdmise(ou.position, autresSoeurs.length);
  const dejaEnPlace = soeurs[position]?.id === id;
  if (!dejaEnPlace) {
    const insertion = insertionALaPosition(etat, autresSoeurs, position);
    const places = placesDesAutresPages(etat, insertion, ancetreCoupee(etat, id));
    places.set(id, { parent: ou.parent, rang: insertion.rang });
    doc.transact(() => ecrirePlaces(doc, places));
  }
}

function mettreALaCorbeille(doc: Y.Doc, id: IdPage): void {
  exigerVersionPriseEnCharge(doc);
  exigerPageLue(lireEtat(doc), id);
  doc.transact(() => ecrireMiseALaCorbeille(doc, id));
}

function lireEtat(doc: Y.Doc): EtatLu {
  const entrees = lireEntrees(doc);
  return { entrees, ...lireArbre(entrees) };
}

function exigerTitreAdmis(titre: string): void {
  if (titre.length > LONGUEUR_MAX_TITRE) {
    throw new ErreurDocument(
      "titre-trop-long",
      `Le titre compte ${titre.length} caractères ; la limite est de ${LONGUEUR_MAX_TITRE}.`,
    );
  }
}

function exigerEntree(etat: EtatLu, id: IdPage): EntreePage {
  const entree = etat.entrees.get(id);
  if (entree === undefined) {
    throw new ErreurDocument("page-introuvable", `Aucune page ${id} dans le document.`);
  }
  return entree;
}

function exigerPageLue(etat: EtatLu, id: IdPage): PageLue {
  exigerEntree(etat, id);
  const page = trouverPage(etat.arborescence.racines, id);
  if (page === undefined) {
    throw new ErreurDocument("page-a-la-corbeille", `La page ${id} est à la corbeille.`);
  }
  return page;
}

function exigerDestinationHorsDeLaDescendance(page: PageLue, parent: IdPage | null): void {
  if (parent !== null && estDansLeSousArbre(page, parent)) {
    throw new ErreurDocument(
      "deplacement-cyclique",
      `La page ${page.id} ne peut pas aller sous elle-même ni sous sa descendante ${parent}.`,
    );
  }
}

function soeursLues(etat: EtatLu, parent: IdPage | null): readonly PageLue[] {
  return parent === null ? etat.arborescence.racines : exigerPageLue(etat, parent).enfants;
}

function positionAdmise(position: number | undefined, nombreDeSoeurs: number): number {
  if (position === undefined) {
    return nombreDeSoeurs;
  }
  if (!Number.isInteger(position) || position < 0 || position > nombreDeSoeurs) {
    throw new ErreurDocument(
      "position-invalide",
      `La position ${position} n'est pas un entier entre 0 et ${nombreDeSoeurs}.`,
    );
  }
  return position;
}

// Entre deux sœurs de même rang, aucun rang n'existe : celles de ce rang qui suivent la position
// sont réattribuées, jusqu'à la première sœur d'un rang supérieur (ADR-0002, « Rangs »).
function insertionALaPosition(
  etat: EtatLu,
  soeurs: readonly PageLue[],
  position: number,
): Insertion {
  const rangs = soeurs.map((soeur) => exigerEntree(etat, soeur.id).rang);
  const fin = finDesRangsEgauxAuPrecedent(rangs, position);
  const haut = rangs[fin] ?? BORNE_HAUTE;
  const rang = rangEntre(rangs[position - 1] ?? BORNE_BASSE, haut);
  const reattribuees = soeurs.slice(position, fin).map((soeur) => soeur.id);
  return { rang, rangsReattribues: rangsCroissantsEntre(rang, haut, reattribuees) };
}

function finDesRangsEgauxAuPrecedent(rangs: readonly Rang[], position: number): number {
  const precedent = rangs[position - 1];
  let fin = position;
  while (precedent !== undefined && rangs[fin] === precedent) {
    fin += 1;
  }
  return fin;
}

// La page coupée dont `id` descend dans l'arborescence lue : elle est la racine de sa lignée.
function ancetreCoupee(etat: EtatLu, id: IdPage): IdPage | undefined {
  const racine = etat.arborescence.racines.find((page) => estDansLeSousArbre(page, id));
  const descendDUnePageCoupee =
    racine !== undefined && racine.id !== id && etat.pagesCoupees.has(racine.id);
  return descendDUnePageCoupee ? racine.id : undefined;
}

// Une réattribution recopie le parent enregistré ; seule la consolidation écrit la racine, pour
// que la page coupée ne suive pas le parent que le déplacement d'une descendante rendrait valide.
function placesDesAutresPages(
  etat: EtatLu,
  insertion: Insertion,
  consolidee: IdPage | undefined,
): Map<IdPage, Place> {
  const places = new Map<IdPage, Place>();
  if (consolidee !== undefined) {
    places.set(consolidee, { parent: null, rang: exigerEntree(etat, consolidee).rang });
  }
  for (const [soeur, rang] of insertion.rangsReattribues) {
    const parent = soeur === consolidee ? null : exigerEntree(etat, soeur).parent;
    places.set(soeur, { parent, rang });
  }
  return places;
}

function ecrirePlaces(doc: Y.Doc, places: ReadonlyMap<IdPage, Place>): void {
  places.forEach((place, id) => ecrirePlace(doc, id, place));
}
