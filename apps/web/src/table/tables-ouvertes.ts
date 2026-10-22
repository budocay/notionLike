// Documents de table de l'onglet (F-018-AC13, AC14, AC16, AC49, ADR-0019), sur le modèle des pages
// ouvertes : au plus une session de table, donc au plus une façade ; un document quitté avec une
// modification non enregistrée est conservé en mémoire, sans session, jusqu'à ce que sa persistance
// l'ait écrit, et rendu s'il est rouvert avant.
import * as Y from "yjs";

import { suivreLOnglet } from "../espace/garde-onglet.ts";
import {
  effacerBaseDeDocument,
  effacerReglagesDeVue,
  ErreurPersistance,
  type IssueDEffacement,
  ouvrirPersistance,
  type Persistance,
} from "../persistance/index.ts";
import {
  demarrerSessionTable,
  sessionDeTableIntrouvable,
  type SessionTable,
} from "./session-table.ts";

export interface DesignationDeTable {
  /** `undefined` : le stockage n'a pas encore dit quel espace l'appareil a retenu. */
  readonly idEspace: string | undefined;
  readonly idTable: string;
}

export interface TablesOuvertes {
  /** Ferme la session ouverte s'il y en a une, puis ouvre celle de la table désignée. */
  ouvrir(designation: DesignationDeTable): SessionTable;
  /** Ferme la session ouverte et libère tout document conservé. */
  fermer(): void;
  /**
   * Identifiants retirés du document d'espace (F-018-AC49, F-007-AC32), quel que soit leur type :
   * ferme la session de chacun et libère son document, conservé ou affiché, dans tous les cas ;
   * puis efface sa base de table de l'espace donné et retire ses réglages de vue. `idEspace`
   * absent : rien n'est effacé, l'issue est `echec`. Jamais rejetée.
   */
  effacer(idEspace: string | undefined, ids: readonly string[]): Promise<IssueDEffacement>;
}

/** Un document de table tenu par l'onglet, affiché ou conservé. */
interface Tenue {
  readonly doc: Y.Doc;
  /** Celle de la base de la table ; tant que l'espace est inconnu, une persistance en attente. */
  persistance: Persistance;
  enAttenteDeLEspace: boolean;
  cesserDeSuivreLOnglet: () => void;
  /** Ce qui attend l'écriture d'un document conservé. */
  arrets: (() => void)[];
}

interface Courante {
  readonly idTable: string;
  readonly tenue: Tenue;
  readonly session: SessionTable;
}

export function creerTablesOuvertes(): TablesOuvertes {
  const conservees = new Map<string, Tenue>();
  let courante: Courante | undefined;

  // `conserver` faux : la table est supprimée, son document est libéré même non enregistré.
  const fermerLaCourante = (conserver = true): void => {
    if (courante === undefined) {
      return;
    }
    const { idTable, tenue, session } = courante;
    courante = undefined;
    session.fermer();
    if (conserver && doitEtreConservee(tenue)) {
      conserverJusquALEcriture(conservees, idTable, tenue);
    } else {
      liberer(tenue);
    }
  };

  return {
    ouvrir: (designation) => {
      fermerLaCourante();
      const tenue = tenir(conservees, designation);
      if (tenue === undefined) {
        return sessionDeTableIntrouvable();
      }
      const session = demarrerSessionTable(tenue);
      const ouverte: Courante = { idTable: designation.idTable, tenue, session };
      courante = ouverte;
      return {
        ...session,
        fermer: () => {
          if (courante === ouverte) {
            fermerLaCourante();
          }
        },
      };
    },
    fermer: () => {
      fermerLaCourante();
      libererLesConservees(conservees, [...conservees.keys()]);
    },
    effacer: (idEspace, ids) => {
      if (courante !== undefined && ids.includes(courante.idTable)) {
        fermerLaCourante(false);
      }
      libererLesConservees(conservees, ids);
      return effacerDeLAppareil(idEspace, ids);
    },
  };
}

function conserverJusquALEcriture(
  conservees: Map<string, Tenue>,
  idTable: string,
  tenue: Tenue,
): void {
  conservees.set(idTable, tenue);
  attendreLEcriture(tenue, () => {
    if (conservees.get(idTable) === tenue) {
      conservees.delete(idTable);
      liberer(tenue);
    }
  });
}

function libererLesConservees(conservees: Map<string, Tenue>, ids: readonly string[]): void {
  for (const id of ids) {
    const conservee = conservees.get(id);
    conservees.delete(id);
    if (conservee !== undefined) {
      liberer(conservee);
    }
  }
}

// Rien de ce que l'onglet tenait sur ces tables n'existe plus : une persistance rouverte sur un
// document resté en mémoire réécrirait son contenu dans une base recréée (F-007 H17).
async function effacerDeLAppareil(
  idEspace: string | undefined,
  ids: readonly string[],
): Promise<IssueDEffacement> {
  if (idEspace === undefined) {
    return "echec";
  }
  effacerReglagesDeVue(idEspace, ids);
  const issues = await Promise.all(
    [...new Set(ids)].map((idTable) => effacerBaseDeDocument({ type: "table", idEspace, idTable })),
  );
  return issues.every((issue) => issue === "effacee") ? "effacee" : "echec";
}

// Le document conservé de cette table s'il y en a un, sinon un document vierge. `undefined` : la
// fonction de nommage du module de persistance refuse l'un des identifiants, rien n'est ouvert.
function tenir(conservees: Map<string, Tenue>, designation: DesignationDeTable): Tenue | undefined {
  const { idEspace, idTable } = designation;
  const conservee = conservees.get(idTable);
  conservees.delete(idTable);
  conservee?.arrets.splice(0).forEach((arreter) => arreter());
  const tenue = conservee ?? nouvelleTenue();
  if (!tenue.enAttenteDeLEspace || idEspace === undefined) {
    return tenue;
  }
  try {
    const persistance = ouvrirPersistance(tenue.doc, { type: "table", idEspace, idTable });
    tenue.persistance.fermer();
    tenue.persistance = persistance;
    tenue.enAttenteDeLEspace = false;
    // La confirmation avant de quitter est tenue tant qu'une modification n'est pas écrite, que la
    // table soit affichée ou conservée (F-030-AC16).
    tenue.cesserDeSuivreLOnglet = suivreLOnglet(persistance, tenue.doc);
  } catch (erreur) {
    liberer(tenue);
    if (erreur instanceof ErreurPersistance) {
      return undefined;
    }
    throw erreur;
  }
  return tenue;
}

// Ramasse-miettes actif, explicitement : une cellule réécrite n'accumule pas son historique (H13).
function nouvelleTenue(): Tenue {
  const doc = new Y.Doc({ gc: true });
  return {
    doc,
    persistance: persistanceEnAttente(doc),
    enAttenteDeLEspace: true,
    cesserDeSuivreLOnglet: () => undefined,
    arrets: [],
  };
}

// Tant que le stockage n'a pas dit quel espace l'appareil a retenu, aucune base ne peut être
// nommée : le document vit en mémoire sous une persistance coupée, qui ne tente rien et retient
// seulement qu'il a été modifié.
function persistanceEnAttente(doc: Y.Doc): Persistance {
  let modifie = false;
  let fermee = false;
  const noter = (): void => {
    modifie = true;
  };
  doc.on("update", noter);
  return {
    lireEtat: () => (fermee ? "fermee" : "coupee"),
    abonner: () => () => undefined,
    fermer: () => {
      fermee = true;
      doc.off("update", noter);
    },
    reessayer: () => undefined,
    aDesModificationsNonEnregistrees: () => modifie,
    aReluLaBase: () => false,
    aLaisseDesBasesNonRattachees: () => false,
    soumettreLEtatRelu: () => undefined,
  };
}

// Une persistance fermée ne retient rien : elle n'écrira plus (refus de version, F-030-AC11).
function doitEtreConservee({ persistance }: Tenue): boolean {
  return persistance.lireEtat() !== "fermee" && persistance.aDesModificationsNonEnregistrees();
}

// Les tentatives de la persistance se poursuivent sans session, jusqu'à l'écriture.
function attendreLEcriture({ persistance, arrets }: Tenue, surEcriture: () => void): void {
  const verifier = (): void => {
    if (persistance.lireEtat() === "fermee" || !persistance.aDesModificationsNonEnregistrees()) {
      surEcriture();
    }
  };
  arrets.push(persistance.abonner(verifier));
}

function liberer(tenue: Tenue): void {
  tenue.arrets.splice(0).forEach((arreter) => arreter());
  tenue.cesserDeSuivreLOnglet();
  tenue.persistance.fermer();
  tenue.doc.destroy();
}
