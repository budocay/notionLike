// Documents de page de l'onglet (F-003-AC5, AC18) : au plus une session de page ouverte, donc au
// plus une façade ; un document quitté avec une modification non enregistrée est conservé en
// mémoire, sans session, jusqu'à ce que sa persistance l'ait écrit.
import * as Y from "yjs";

import { suivreLOnglet } from "../espace/garde-onglet.ts";
import {
  effacerBaseDePage,
  ErreurPersistance,
  type IssueDEffacement,
  ouvrirPersistance,
  type Persistance,
} from "../persistance/index.ts";
import { demarrerSessionPage, type SessionPage, sessionDePageIntrouvable } from "./session-page.ts";

export interface DesignationDePage {
  /** `undefined` : le stockage n'a pas encore dit quel espace l'appareil a retenu. */
  readonly idEspace: string | undefined;
  readonly idPage: string;
}

export interface PagesOuvertes {
  /** Ferme la session ouverte s'il y en a une, puis ouvre celle de la page désignée. */
  ouvrir(designation: DesignationDePage): SessionPage;
  /** Ferme la session ouverte et libère tout document conservé. Les pages restent utilisables. */
  fermer(): void;
  /**
   * Pages supprimées définitivement (F-007-AC11, AC32) : ferme la session de chacune et libère son
   * document, conservé ou affiché, persistance fermée et `Y.Doc` détruit, puis efface sa base de
   * l'espace donné. Rend `echec` si une base au moins n'a pas pu être effacée ; jamais rejetée.
   */
  effacer(idEspace: string, idPages: readonly string[]): Promise<IssueDEffacement>;
}

/** Un document de page tenu par l'onglet, affiché ou conservé. */
interface Tenue {
  readonly doc: Y.Doc;
  /** Celle de la base de la page ; tant que l'espace est inconnu, une persistance en attente. */
  persistance: Persistance;
  /** Vrai tant que l'espace est inconnu : aucune base n'est ouverte pour ce document. */
  enAttenteDeLEspace: boolean;
  /** Cesse de suivre l'onglet pour la persistance, tenue aussi longtemps que le document. */
  cesserDeSuivreLOnglet: () => void;
  /** Ce qui attend l'écriture d'un document conservé. */
  arrets: (() => void)[];
}

interface Courante {
  readonly idPage: string;
  readonly tenue: Tenue;
  readonly session: SessionPage;
}

export function creerPagesOuvertes(): PagesOuvertes {
  const conservees = new Map<string, Tenue>();
  let courante: Courante | undefined;

  // `conserver` faux : la page est supprimée, son document est libéré même non enregistré.
  const fermerLaCourante = (conserver = true): void => {
    if (courante === undefined) {
      return;
    }
    const { idPage, tenue, session } = courante;
    courante = undefined;
    session.fermer();
    if (conserver && doitEtreConservee(tenue)) {
      conserverJusquALEcriture(conservees, idPage, tenue);
    } else {
      liberer(tenue);
    }
  };

  return {
    ouvrir: (designation) => {
      fermerLaCourante();
      const tenue = tenir(conservees, designation);
      if (tenue === undefined) {
        return sessionDePageIntrouvable();
      }
      const session = demarrerSessionPage(tenue);
      const ouverte: Courante = { idPage: designation.idPage, tenue, session };
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
    effacer: (idEspace, idPages) => {
      if (courante !== undefined && idPages.includes(courante.idPage)) {
        fermerLaCourante(false);
      }
      libererLesConservees(conservees, idPages);
      return effacerLesBases(idEspace, idPages);
    },
  };
}

function conserverJusquALEcriture(
  conservees: Map<string, Tenue>,
  idPage: string,
  tenue: Tenue,
): void {
  conservees.set(idPage, tenue);
  attendreLEcriture(tenue, () => {
    if (conservees.get(idPage) === tenue) {
      conservees.delete(idPage);
      liberer(tenue);
    }
  });
}

function libererLesConservees(conservees: Map<string, Tenue>, idPages: readonly string[]): void {
  for (const idPage of idPages) {
    const conservee = conservees.get(idPage);
    conservees.delete(idPage);
    if (conservee !== undefined) {
      liberer(conservee);
    }
  }
}

// Rien de ce que l'onglet tenait sur ces pages n'existe plus : une persistance rouverte sur un
// document resté en mémoire réécrirait son contenu dans une base recréée (F-007 H17).
async function effacerLesBases(
  idEspace: string,
  idPages: readonly string[],
): Promise<IssueDEffacement> {
  const issues = await Promise.all(
    [...new Set(idPages)].map((idPage) => effacerBaseDePage({ idEspace, idPage })),
  );
  return issues.every((issue) => issue === "effacee") ? "effacee" : "echec";
}

// Le document conservé de cette page s'il y en a un, sinon un document vierge. `undefined` : la
// fonction de nommage du module de persistance refuse l'un des identifiants, rien n'est ouvert.
function tenir(conservees: Map<string, Tenue>, designation: DesignationDePage): Tenue | undefined {
  const { idEspace, idPage } = designation;
  const conservee = conservees.get(idPage);
  conservees.delete(idPage);
  conservee?.arrets.splice(0).forEach((arreter) => arreter());
  const tenue = conservee ?? nouvelleTenue();
  if (!tenue.enAttenteDeLEspace || idEspace === undefined) {
    return tenue;
  }
  try {
    const persistance = ouvrirPersistance(tenue.doc, { type: "page", idEspace, idPage });
    tenue.persistance.fermer();
    tenue.persistance = persistance;
    tenue.enAttenteDeLEspace = false;
    // La garde d'onglet tient la confirmation avant de quitter tant qu'une modification n'est pas
    // écrite, que la page soit affichée ou conservée (F-030-AC16).
    tenue.cesserDeSuivreLOnglet = suivreLOnglet(persistance);
  } catch (erreur) {
    liberer(tenue);
    if (erreur instanceof ErreurPersistance) {
      return undefined;
    }
    throw erreur;
  }
  return tenue;
}

function nouvelleTenue(): Tenue {
  const doc = new Y.Doc();
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
// seulement qu'il a été modifié. La base est ouverte sur ce même document dès que l'espace est connu.
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
