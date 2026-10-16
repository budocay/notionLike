// Stockage des documents synchronisés (F-012-AC9, AC17 à AC21, AC23, AC24, AC35, AC38, H3, H13,
// H15, F-018-AC57, AC58) : le seul module du serveur qui lit ou écrit un instantané, et le seul qui
// lit une mise à jour Yjs (sa taille, et la version d'un document d'espace). Le serveur n'ouvre
// aucune transaction sur un document servi : il encode son état, et éprouve une mise à jour sur une
// copie.
import "./stockage-local-neutre.ts";

import {
  schemaNomDeDocument,
  VERSION_DU_DOCUMENT_D_ESPACE,
  type DocumentNomme,
} from "@notionlike/contrats";
import { compterDocuments, enregistrerDocument, lireDocument, type Base } from "@notionlike/db";
import * as Y from "yjs";

import type { Journal } from "./journal.ts";
import type { Defaillance, Minuterie, ReglagesSynchro } from "./synchro-reglages.ts";

// Les types de message de synchronisation de `y-protocols` : l'étape 1 ne porte qu'un vecteur
// d'état ; l'étape 2 et la mise à jour portent une mise à jour Yjs.
const ETAPE_1 = 0;

// Le refus qu'un crochet lève vers la bibliothèque : une raison de la liste fermée, sans message,
// pour que la bibliothèque n'écrive rien d'elle-même sur la console.
export interface Refus {
  readonly reason: string;
}

export function refus(motif: string): Refus {
  return { reason: motif };
}

// Ce que le stockage sait d'un document chargé. Un nouvel état à chaque chargement : une relance
// tient le sien, et n'écrit plus rien une fois le document déchargé (F-012-AC21).
interface EtatDocument {
  readonly nom: string;
  readonly cle: DocumentNomme;
  readonly document: Y.Doc;
  stocke: boolean;
  // Taille du dernier instantané stocké, et octets des mises à jour acceptées depuis (F-012-AC23).
  tailleStockee: number;
  accumule: number;
  // Rang de la dernière mise à jour effective ; `enregistre` : celui du dernier enregistrement.
  rang: number;
  enregistre: number;
  // La création de sa ligne a passé le contrôle du quota de l'espace (F-012-AC24).
  creationAdmise: boolean;
  enEchec: boolean;
  abandonne: boolean;
  decharge: boolean;
  annulerLaRelance?: (() => void) | undefined;
  // Les écritures d'un document se suivent : un essai encodé plus tôt ne passe jamais après un autre.
  file: Promise<void>;
}

interface Dependances {
  readonly base: Base;
  readonly journal: Journal;
  readonly reglages: ReglagesSynchro;
  readonly minuterie: Minuterie;
  readonly defaillance?: Defaillance | undefined;
  // Ferme toutes les ouvertures d'un document par ce motif.
  fermerLesOuvertures(nom: string, motif: string): void;
}

export interface Stockage {
  charger(document: Y.Doc, nom: string): Promise<Uint8Array | undefined>;
  enregistrer(document: Y.Doc): Promise<void>;
  noterLeChangement(document: Y.Doc, miseAJour: Uint8Array): void;
  controlerLaMiseAJour(document: Y.Doc, type: number, miseAJour: Uint8Array): Promise<void>;
  // À l'arrêt : un essai pour chaque document dont une relance est en cours (F-012-AC31).
  essayerLesRelances(): Promise<void>;
}

const { typeRacine, cle, typeRacineDesVersions, admises } = VERSION_DU_DOCUMENT_D_ESPACE;

// Règle permanente du format : un document sans clé `version` ni entrée dans `versions` est de
// version 1 (ADR-0002).
const VERSION_ABSENTE = 1;

// La version lue d'un document d'espace, par la règle de l'étape 1 de la lecture (amendement F-018
// de l'ADR-0002, celle que le paquet du document applique) : le plus grand de `meta.version` et des
// entrées de `versions`, 1 en leur absence. `bienFormee` est faux si `meta.version` est présente
// sans être un entier supérieur ou égal à 1, ou si `versions` porte une entrée nommée (l'écriture
// d'un autre type partagé sous ce nom) ou une entrée qui n'est pas un tel entier. `parMeta` :
// `meta.version`, 1 si la clé est absente, la barrière des applications de version 1 (n'a de sens
// que pour un document bien formé).
interface VersionLue {
  readonly lue: number;
  readonly parMeta: number;
  readonly bienFormee: boolean;
}

function estUneVersionEntiere(valeur: unknown): valeur is number {
  return typeof valeur === "number" && Number.isInteger(valeur) && valeur >= VERSION_ABSENTE;
}

function estAdmise(version: number): boolean {
  return (admises as readonly number[]).includes(version);
}

function versionDe(doc: Y.Doc): VersionLue {
  const meta = doc.getMap<unknown>(typeRacine);
  const versions = doc.getArray<unknown>(typeRacineDesVersions);
  const deMeta: unknown = meta.has(cle) ? meta.get(cle) : VERSION_ABSENTE;
  const valeurs = [deMeta, ...versions.toArray()];
  const lue = valeurs
    .filter(estUneVersionEntiere)
    .reduce((plusGrande, version) => Math.max(plusGrande, version), VERSION_ABSENTE);
  return {
    lue,
    parMeta: estUneVersionEntiere(deMeta) ? deMeta : VERSION_ABSENTE,
    bienFormee: versions._map.size === 0 && valeurs.every(estUneVersionEntiere),
  };
}

// La mise à jour est éprouvée sur une copie du document : le document servi n'est pas touché tant
// qu'elle n'est pas admise. Elle l'est si, après elle, le document est bien formé, que sa version
// lue est dans la liste publiée, et que ni elle ni `meta.version` (clé retirée comprise) n'ont
// baissé : la barrière des applications de version 1 ne se lève pas, même quand `versions` garde
// la version (décision du dev du 2026-10-16, F-018-AC58). Une copie illisible, ou un type racine
// déjà lu sous un autre type partagé, refuse. Un document déjà mal formé n'a pas de version à
// défendre : seul l'après compte.
export function versionAdmiseApres(document: Y.Doc, miseAJour: Uint8Array): boolean {
  const copie = new Y.Doc({ gc: true });
  try {
    Y.applyUpdate(copie, Y.encodeStateAsUpdate(document));
    const avant = versionDe(copie);
    Y.applyUpdate(copie, miseAJour);
    const apres = versionDe(copie);
    const sansBaisse = apres.lue >= avant.lue && apres.parMeta >= avant.parMeta;
    return apres.bienFormee && estAdmise(apres.lue) && (!avant.bienFormee || sansBaisse);
  } catch {
    return false;
  } finally {
    copie.destroy();
  }
}

// Les horloges connues d'un document, étendues par les structures d'une mise à jour. Un trou
// d'horloge rend `undefined` : la structure qui le suit resterait en attente.
function horlogesCouvertes(
  document: Y.Doc,
  structures: readonly unknown[],
): Map<number, number> | undefined {
  const connues = Y.decodeStateVector(Y.encodeStateVector(document));
  for (const structure of structures) {
    if (structure instanceof Y.Item || structure instanceof Y.GC) {
      const { client, clock } = structure.id;
      const fin = connues.get(client) ?? 0;
      if (clock > fin) {
        return undefined;
      }
      connues.set(client, Math.max(fin, clock + structure.length));
    }
  }
  return connues;
}

function dependancesConnues(item: Y.Item, connues: ReadonlyMap<number, number>): boolean {
  const parent = item.parent instanceof Y.ID ? item.parent : null;
  return [item.origin, item.rightOrigin, parent].every(
    (id) => id === null || id.clock < (connues.get(id.client) ?? 0),
  );
}

// Une mise à jour qu'aucun état connu ne porte (trou d'horloge ; origine, voisine ou parent
// absents ; suppression d'éléments inconnus) resterait en attente dans le document, et l'instantané
// qui la contiendrait ne se rechargerait plus (F-012-AC20) : elle est refusée avant application.
export function laisseDesStructuresEnAttente(document: Y.Doc, miseAJour: Uint8Array): boolean {
  const { structs, ds } = Y.decodeUpdate(miseAJour);
  const connues = horlogesCouvertes(document, structs);
  if (connues === undefined) {
    return true;
  }
  const items = structs.filter((structure) => structure instanceof Y.Item);
  if (!items.every((item) => dependancesConnues(item, connues))) {
    return true;
  }
  return [...ds.clients].some(([client, suppressions]) =>
    suppressions.some(({ clock, len }) => clock + len > (connues.get(client) ?? 0)),
  );
}

function aDesStructuresEnAttente(doc: Y.Doc): boolean {
  return doc.store.pendingStructs !== null || doc.store.pendingDs !== null;
}

// Un instantané illisible, ou qui laisse des structures en attente, ne s'applique pas (F-012-AC20).
function sAppliqueSeul(instantane: Uint8Array): boolean {
  const essai = new Y.Doc({ gc: true });
  try {
    Y.applyUpdate(essai, instantane);
    return !aDesStructuresEnAttente(essai);
  } catch {
    return false;
  } finally {
    essai.destroy();
  }
}

export function creerStockage(dependances: Dependances): Stockage {
  const { base, journal, reglages, minuterie } = dependances;
  const etats = new WeakMap<Y.Doc, EtatDocument>();
  const relances = new Set<EtatDocument>();

  function echec(type: "chargement-en-echec" | "enregistrement-en-echec", nom: string, e: unknown) {
    journal.evenementDeSynchro({ type, document: nom, erreur: e });
  }

  function annulerLaRelance(etat: EtatDocument): void {
    etat.annulerLaRelance?.();
    etat.annulerLaRelance = undefined;
    relances.delete(etat);
  }

  // F-012-AC21 : un document déchargé avant qu'un essai réussisse n'est plus jamais écrit.
  function decharger(etat: EtatDocument): void {
    etat.decharge = true;
    annulerLaRelance(etat);
    if (etat.enEchec && !etat.abandonne) {
      journal.evenementDeSynchro({ type: "instantane-non-enregistre", document: etat.nom });
    }
  }

  function abandonner(etat: EtatDocument, motif: string): void {
    etat.abandonne = true;
    annulerLaRelance(etat);
    journal.evenementDeSynchro({ type: "enregistrement-abandonne", document: etat.nom, motif });
  }

  function programmerLaRelance(etat: EtatDocument): void {
    relances.add(etat);
    etat.annulerLaRelance = minuterie.programmer(() => {
      etat.annulerLaRelance = undefined;
      relances.delete(etat);
      void essayer(etat);
    }, reglages.relanceDEnregistrementMs);
  }

  async function ecrire(etat: EtatDocument): Promise<void> {
    dependances.defaillance?.("enregistrement", etat.nom);
    // Jamais d'instantané qui porte des structures en attente : l'essai échoue, et sera relancé.
    if (aDesStructuresEnAttente(etat.document)) {
      throw new TypeError("structures en attente");
    }
    const rang = etat.rang;
    // L'état courant, au moment de l'essai (F-012-AC21).
    const instantane = Y.encodeStateAsUpdate(etat.document);
    const { issue } = await enregistrerDocument(base.db, {
      ...etat.cle,
      instantane,
      enregistreLe: new Date(minuterie.maintenant()),
      plafondDocumentsParEspace: reglages.documentsParEspace,
    });
    if (issue === "cree" || issue === "remplace") {
      Object.assign(etat, { stocke: true, tailleStockee: instantane.byteLength, enEchec: false });
      etat.accumule = 0;
      etat.enregistre = rang;
    } else if (issue === "quota-atteint") {
      abandonner(etat, issue);
      dependances.fermerLesOuvertures(etat.nom, issue);
    } else {
      // L'espace a été supprimé : rien n'est recréé (F-012-AC21, AC31).
      abandonner(etat, issue);
    }
  }

  // Aucune erreur ne remonte à la bibliothèque, qui ne relancerait rien (F-012-AC21, H13) ; un
  // échange sans effet n'écrit rien (F-012-AC35, H15).
  function essayer(etat: EtatDocument): Promise<void> {
    etat.file = etat.file.then(() => essayerSeul(etat));
    return etat.file;
  }

  async function essayerSeul(etat: EtatDocument): Promise<void> {
    if (etat.decharge || etat.abandonne || etat.rang === etat.enregistre) {
      return;
    }
    annulerLaRelance(etat);
    try {
      await ecrire(etat);
    } catch (erreur) {
      echec("enregistrement-en-echec", etat.nom, erreur);
      etat.enEchec = true;
      if (!etat.decharge) {
        programmerLaRelance(etat);
      }
    }
  }

  async function controlerLeQuota(etat: EtatDocument): Promise<void> {
    if (etat.stocke || etat.creationAdmise) {
      return;
    }
    let nombre: number;
    try {
      nombre = await compterDocuments(base.db, etat.cle.idEspace);
    } catch (erreur) {
      echec("enregistrement-en-echec", etat.nom, erreur);
      throw refus("erreur-interne");
    }
    if (nombre >= reglages.documentsParEspace) {
      journal.evenementDeSynchro({
        type: "limite-atteinte",
        document: etat.nom,
        motif: "quota-atteint",
      });
      throw refus("quota-atteint");
    }
    etat.creationAdmise = true;
  }

  return {
    // F-012-AC19, AC20 : l'instantané stocké, ou rien pour un document jamais stocké (servi vide,
    // F-012-AC17). Un échec refuse l'ouverture, sans servir de document vide à la place.
    async charger(document, nom) {
      const cle = schemaNomDeDocument.parse(nom);
      let lu: Awaited<ReturnType<typeof lireDocument>>;
      try {
        dependances.defaillance?.("chargement", nom);
        lu = await lireDocument(base.db, cle);
      } catch (erreur) {
        echec("chargement-en-echec", nom, erreur);
        throw refus("erreur-interne");
      }
      if (lu !== undefined && !sAppliqueSeul(lu.instantane)) {
        echec("chargement-en-echec", nom, new TypeError("instantané illisible"));
        throw refus("erreur-interne");
      }
      const etat: EtatDocument = {
        nom,
        cle,
        document,
        stocke: lu !== undefined,
        tailleStockee: lu?.taille ?? 0,
        accumule: 0,
        rang: 0,
        enregistre: 0,
        creationAdmise: false,
        enEchec: false,
        abandonne: false,
        decharge: false,
        file: Promise.resolve(),
      };
      etats.set(document, etat);
      document.once("destroy", () => {
        decharger(etat);
      });
      return lu?.instantane;
    },
    async enregistrer(document) {
      const etat = etats.get(document);
      if (etat !== undefined) {
        await essayer(etat);
      }
    },
    noterLeChangement(document, miseAJour) {
      const etat = etats.get(document);
      if (etat !== undefined) {
        etat.rang += 1;
        etat.accumule += miseAJour.byteLength;
      }
    },
    // Avant toute application d'une mise à jour d'une ouverture en écriture : un message qui
    // n'apporte rien passe sans contrôle (F-012-AC35) ; sinon la version (F-012-AC38), la taille
    // comptée (F-012-AC23), puis le quota de l'espace pour un document jamais stocké (F-012-AC24).
    async controlerLaMiseAJour(document, type, miseAJour) {
      const etat = etats.get(document);
      if (etat === undefined || type === ETAPE_1) {
        return;
      }
      let apport: Uint8Array;
      let incomplete: boolean;
      try {
        if (Y.snapshotContainsUpdate(Y.snapshot(document), miseAJour)) {
          return;
        }
        apport = Y.diffUpdate(miseAJour, Y.encodeStateVector(document));
        incomplete = laisseDesStructuresEnAttente(document, miseAJour);
      } catch {
        throw refus("erreur-interne");
      }
      if (incomplete) {
        journal.evenementDeSynchro({
          type: "mise-a-jour-incomplete",
          document: etat.nom,
          motif: "erreur-interne",
        });
        throw refus("erreur-interne");
      }
      if (etat.cle.type === "espace" && !versionAdmiseApres(document, miseAJour)) {
        journal.evenementDeSynchro({
          type: "limite-atteinte",
          document: etat.nom,
          motif: "version-refusee",
        });
        throw refus("version-refusee");
      }
      if (etat.tailleStockee + etat.accumule + apport.byteLength > reglages.octetsParDocument) {
        journal.evenementDeSynchro({
          type: "limite-atteinte",
          document: etat.nom,
          motif: "document-trop-grand",
        });
        throw refus("document-trop-grand");
      }
      await controlerLeQuota(etat);
    },
    async essayerLesRelances() {
      await Promise.all([...relances].map((etat) => essayer(etat)));
    },
  };
}
