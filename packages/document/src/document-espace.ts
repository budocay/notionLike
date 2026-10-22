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
  type TypeDePage,
} from "./arbre.ts";
import { ErreurDocument } from "./erreurs.ts";
import {
  admettrePlace,
  ecrireMiseALaCorbeille,
  ecrireNouvellePage,
  ecrirePlace,
  ecrireRestauration,
  ecrireTitre,
  ecrireVersion,
  eleverPourLesTables,
  estDeVersionPriseEnCharge,
  lireEntrees,
  LONGUEUR_MAX_TITRE,
  type Place,
  type PlaceAdmise,
  retirerEntree,
} from "./format.ts";
import { AUCUN_RANG_ADMIS, insertionParmi, LONGUEUR_MAX_RANG, type Rang } from "./rang.ts";

declare const crypto: { randomUUID(): string };
// Le paquet compile sans DOM ni types Node ; `console` existe pourtant sous l'un comme sous l'autre.
declare const console: { error(...donnees: unknown[]): void };

const SIGNALEMENT_DU_RAPPEL_FAUTIF =
  "@notionlike/document : un rappel d'abonné a levé pendant la diffusion d'un changement.";

export interface Emplacement {
  readonly parent: IdPage | null;
  readonly position?: number;
}

export interface DocumentEspace {
  readonly doc: Y.Doc;
  lire(): Arborescence;
  abonner(rappel: () => void): () => void;
  creerPage(titre: string, ou?: Emplacement): IdPage;
  /**
   * Inscrit une page de type `table` (F-018) : mêmes contrôles, dans le même ordre, que `creerPage`.
   * La première table élève la version du document à 2, dans la transaction de son inscription.
   */
  creerTable(titre: string, ou?: Emplacement): IdPage;
  renommerPage(id: IdPage, titre: string): void;
  deplacerPage(id: IdPage, ou: Emplacement): void;
  mettreALaCorbeille(id: IdPage): void;
  /** Baisse le drapeau d'une racine de la corbeille (F-007) : rien d'autre n'est écrit. */
  restaurerPage(id: IdPage): void;
  /**
   * Retire du document, en une transaction, l'entrée d'une page de la corbeille et celles de sa
   * descendance lue (F-007). Rend leurs identifiants, la page visée d'abord.
   */
  supprimerDefinitivement(id: IdPage): readonly IdPage[];
  fermer(): void;
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

// Le ramasse-miettes de Yjs reste actif sur tout document d'espace (F-007 H14) : sans lui, le
// contenu d'une entrée retirée resterait dans le document et dans son état encodé (F-007-AC29).
export function creerDocumentEspace(): DocumentEspace {
  const doc = new Y.Doc({ gc: true });
  ecrireVersion(doc);
  return ouvrirDocumentEspace(doc);
}

export function ouvrirDocumentEspace(doc: Y.Doc): DocumentEspace {
  return ouvrirDocumentEspaceBorne(doc, LONGUEUR_MAX_RANG);
}

/**
 * Point d'entrée interne, non réexporté par `index.ts` : la façade, avec une longueur maximale de
 * rang choisie, pour la lecture comme pour l'écriture. Seuls les tests l'abaissent (F-029-AC10).
 */
export function ouvrirDocumentEspaceBorne(doc: Y.Doc, borne: number): DocumentEspace {
  let lecture = lectureAdmise(doc, borne);
  let fermee = false;
  const abonnes = new Set<() => void>();

  const apresTransaction = (): void => {
    // Yjs appelle les écouteurs présents au début de l'émission : celui d'une façade que le rappel
    // d'une autre façade vient de fermer l'est encore une fois, et ne doit ni relire ni notifier.
    if (fermee) {
      return;
    }
    const relue = lectureAdmise(doc, borne);
    if (!memeLecture(relue, lecture)) {
      lecture = relue;
      // La copie tient à l'écart les abonnés inscrits pendant la diffusion ; le test d'appartenance
      // écarte ceux qu'un rappel précédent vient de désabonner, et tous dès que la façade est fermée.
      for (const notifier of [...abonnes]) {
        if (abonnes.has(notifier)) {
          notifierSousGarde(notifier);
        }
      }
    }
  };
  doc.on("afterTransaction", apresTransaction);

  // Contrôlé avant tout autre refus, version du document comprise (ADR-0003, amendement F-002).
  const exigerFacadeOuverte = (): void => {
    if (fermee) {
      throw new ErreurDocument("facade-fermee", "La façade du document d'espace est fermée.");
    }
  };

  return {
    doc,
    lire: () => lecture ?? refuserLaVersion(),
    abonner: (rappel) => {
      if (fermee) {
        return () => undefined;
      }
      const notifier = (): void => rappel();
      abonnes.add(notifier);
      return () => void abonnes.delete(notifier);
    },
    creerPage: (titre, ou = A_LA_RACINE) => {
      exigerFacadeOuverte();
      return creerPage(doc, borne, { titre, type: "page" }, ou);
    },
    creerTable: (titre, ou = A_LA_RACINE) => {
      exigerFacadeOuverte();
      return creerPage(doc, borne, { titre, type: "table" }, ou);
    },
    renommerPage: (id, titre) => {
      exigerFacadeOuverte();
      renommerPage(doc, borne, id, titre);
    },
    deplacerPage: (id, ou) => {
      exigerFacadeOuverte();
      deplacerPage(doc, borne, id, ou);
    },
    mettreALaCorbeille: (id) => {
      exigerFacadeOuverte();
      mettreALaCorbeille(doc, borne, id);
    },
    restaurerPage: (id) => {
      exigerFacadeOuverte();
      restaurerPage(doc, borne, id);
    },
    supprimerDefinitivement: (id) => {
      exigerFacadeOuverte();
      return supprimerDefinitivement(doc, borne, id);
    },
    fermer: () => {
      fermee = true;
      abonnes.clear();
      doc.off("afterTransaction", apresTransaction);
    },
  };
}

// Un rappel qui lève ne prive pas les abonnés suivants et ne remonte pas par la transaction en
// cours, `Y.applyUpdate` compris : son exception va à la console d'erreur, seul canal (F-002-AC29).
function notifierSousGarde(notifier: () => void): void {
  try {
    notifier();
  } catch (exception) {
    console.error(SIGNALEMENT_DU_RAPPEL_FAUTIF, exception);
  }
}

// `undefined` tant que la version du document n'est pas prise en charge : rien n'est alors lu.
function lectureAdmise(doc: Y.Doc, borne: number): Arborescence | undefined {
  return estDeVersionPriseEnCharge(doc) ? lireEtat(doc, borne).arborescence : undefined;
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

// Un seul chemin pour les deux types (F-018-AC1) : seule l'écriture diffère, par l'élévation de la
// version et le champ `type` d'une table.
function creerPage(
  doc: Y.Doc,
  borne: number,
  { titre, type }: { readonly titre: string; readonly type: TypeDePage },
  ou: Emplacement,
): IdPage {
  exigerVersionPriseEnCharge(doc);
  exigerTitreAdmis(titre);
  const etat = lireEtat(doc, borne);
  const soeurs = soeursLues(etat, ou.parent);
  const position = positionAdmise(ou.position, soeurs.length);
  const insertion = insertionALaPosition(etat, soeurs, position, borne);
  const places = placesAdmises(placesDesAutresPages(etat, insertion, undefined), borne);
  const place = admettrePlace({ parent: ou.parent, rang: insertion.rang }, borne);
  const id = crypto.randomUUID();
  doc.transact(() => {
    if (type === "table") {
      eleverPourLesTables(doc);
    }
    ecrireNouvellePage(doc, { id, titre, type, place });
    ecrirePlaces(doc, places);
  });
  return id;
}

function renommerPage(doc: Y.Doc, borne: number, id: IdPage, titre: string): void {
  exigerVersionPriseEnCharge(doc);
  exigerTitreAdmis(titre);
  if (exigerPageLue(lireEtat(doc, borne), id).titre !== titre) {
    doc.transact(() => ecrireTitre(doc, id, titre));
  }
}

function deplacerPage(doc: Y.Doc, borne: number, id: IdPage, ou: Emplacement): void {
  exigerVersionPriseEnCharge(doc);
  const etat = lireEtat(doc, borne);
  const page = exigerPageLue(etat, id);
  const soeurs = soeursLues(etat, ou.parent);
  exigerDestinationHorsDeLaDescendance(page, ou.parent);
  const autresSoeurs = soeurs.filter((soeur) => soeur.id !== id);
  const position = positionAdmise(ou.position, autresSoeurs.length);
  const dejaEnPlace = soeurs[position]?.id === id;
  if (!dejaEnPlace) {
    const insertion = insertionALaPosition(etat, autresSoeurs, position, borne);
    const places = placesDesAutresPages(etat, insertion, ancetreCoupee(etat, id));
    places.set(id, { parent: ou.parent, rang: insertion.rang });
    const admises = placesAdmises(places, borne);
    doc.transact(() => ecrirePlaces(doc, admises));
  }
}

function mettreALaCorbeille(doc: Y.Doc, borne: number, id: IdPage): void {
  exigerVersionPriseEnCharge(doc);
  exigerPageLue(lireEtat(doc, borne), id);
  doc.transact(() => ecrireMiseALaCorbeille(doc, id));
}

// Ordre des contrôles (F-007 H5) : version, page introuvable, page hors corbeille, puis, pour la
// restauration seule, page dont le parent lu est aussi à la corbeille.
function restaurerPage(doc: Y.Doc, borne: number, id: IdPage): void {
  exigerVersionPriseEnCharge(doc);
  const etat = lireEtat(doc, borne);
  exigerPageALaCorbeille(etat, id);
  if (!etat.arborescence.corbeille.some((racine) => racine.id === id)) {
    throw new ErreurDocument(
      "page-a-la-corbeille",
      `La page ${id} est sous une page à la corbeille : seule celle-ci se restaure.`,
    );
  }
  doc.transact(() => ecrireRestauration(doc, id));
}

function supprimerDefinitivement(doc: Y.Doc, borne: number, id: IdPage): readonly IdPage[] {
  exigerVersionPriseEnCharge(doc);
  const retirees = identifiantsDuSousArbre(exigerPageALaCorbeille(lireEtat(doc, borne), id));
  doc.transact(() => retirees.forEach((retiree) => retirerEntree(doc, retiree)));
  return retirees;
}

function lireEtat(doc: Y.Doc, borne: number): EtatLu {
  const entrees = lireEntrees(doc, borne);
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

// La page telle que la corbeille la lit, avec toute sa descendance.
function exigerPageALaCorbeille(etat: EtatLu, id: IdPage): PageLue {
  exigerEntree(etat, id);
  const page = trouverPage(etat.arborescence.corbeille, id);
  if (page === undefined) {
    throw new ErreurDocument("page-hors-corbeille", `La page ${id} n'est pas à la corbeille.`);
  }
  return page;
}

// Parcours itératif : la profondeur d'un arbre reçu n'est pas bornée.
function identifiantsDuSousArbre(racine: PageLue): IdPage[] {
  const aVoir: PageLue[] = [racine];
  for (const page of aVoir) {
    page.enfants.forEach((enfant) => aVoir.push(enfant));
  }
  return aVoir.map((page) => page.id);
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

// Calcul commun aux façades (`insertionParmi`, ADR-0002 « Rangs », F-029) : réattribution d'égalité,
// puis réattribution élargie à la fratrie. Le refus `rang-indisponible` (F-029-AC10) vient après tous
// les autres contrôles de l'opération.
function insertionALaPosition(
  etat: EtatLu,
  soeurs: readonly PageLue[],
  position: number,
  borne: number,
): Insertion {
  const rangs = soeurs.map((soeur) => exigerEntree(etat, soeur.id).rang);
  const insertion = insertionParmi(rangs, position, borne);
  if (insertion === AUCUN_RANG_ADMIS) {
    throw new ErreurDocument(
      "rang-indisponible",
      `Aucun rang admis ne permet de placer la page en position ${position}.`,
    );
  }
  const rangsReattribues = new Map<IdPage, Rang>();
  insertion.reattribues.forEach((rang, indice) => {
    const soeur = soeurs[indice];
    if (soeur !== undefined) {
      rangsReattribues.set(soeur.id, rang);
    }
  });
  return { rang: insertion.rang, rangsReattribues };
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

function placesAdmises(
  places: ReadonlyMap<IdPage, Place>,
  borne: number,
): Map<IdPage, PlaceAdmise> {
  const admises = new Map<IdPage, PlaceAdmise>();
  places.forEach((place, id) => admises.set(id, admettrePlace(place, borne)));
  return admises;
}

function ecrirePlaces(doc: Y.Doc, places: ReadonlyMap<IdPage, PlaceAdmise>): void {
  places.forEach((place, id) => ecrirePlace(doc, id, place));
}
