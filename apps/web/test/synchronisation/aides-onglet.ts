// F-032 (bloc 6) : un onglet de l'application sans React, sous Node, contre le serveur réel de la
// fabrique d'essai (F-032-AC33) : le magasin de l'appareil, le pilote de l'onglet et la session
// d'espace réels (démarrée par la seule aide autorisée, F-002-AC31), et, pour chaque espace ouvert,
// la synchronisation de production démarrée comme l'interface la démarre, une fois la session
// prête. `document` et `window` sont deux `EventTarget` : la garde d'onglet de la session s'y abonne.
// L'ajout à l'appareil suit le chemin de l'interface (F-032-AC5) : `GET /api/v1/espaces/:idEspace`
// par le client des espaces de production, droit par `droitDuRole`, `magasin.ajouter`, changement.
import type { ServeurDEssai } from "@notionlike/server/essai";

import { type ClientDesEspaces, creerClientDesEspaces } from "../../src/compte/client-espaces.ts";
import type { EspaceLu, Resultat } from "../../src/compte/index.ts";
import {
  lireLesPagesDeLaBase,
  type MagasinDeLAppareil,
  ouvrirLeMagasinDeLAppareil,
} from "../../src/espace/appareil.ts";
import {
  type CibleDeSession,
  type EspaceOuvertDeLOnglet,
  type PiloteDeLOnglet,
  piloterLOnglet,
} from "../../src/espace/espace-ouvert.ts";
import { avecLesNoms } from "../../src/interface/noms-des-espaces.ts";
import {
  droitDuRole,
  idsDesPages,
  retirerDeLAppareil,
  type Synchronisation,
  typesDesPages,
} from "../../src/synchronisation/index.ts";
import { demarrerSession, fermerLesFacades } from "../aides-facade.ts";
import {
  type Appareil,
  attendreQue,
  type CanalSuivi,
  type CompteDEssai,
  compteDEssai,
  horlogeDEssai,
  nouvelAppareil,
  ouvrirLaBaseDUnePage,
  ouvrirUnCanalSur,
  type PageOuverte,
  requeteurDEssai,
  type Reseau,
  reseauDEssai,
  synchroniserSurLAppareil,
} from "./aides-synchro.ts";

type SessionDEssai = EspaceOuvertDeLOnglet["session"];
type EtatDeLaSession = ReturnType<SessionDEssai["lireEtat"]>;
export type SessionPrete = Extract<EtatDeLaSession, { readonly phase: "pret" }>;

// La garde d'onglet de la session écoute la visibilité du document et le départ de la fenêtre.
function poserLaPageHote(): void {
  if (!("document" in globalThis)) {
    const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
    Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  }
  if (!("window" in globalThis)) {
    Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
  }
}

/** Un espace ouvert par l'onglet : une génération du pilote, et ce que l'interface y tient. */
export interface Generation {
  readonly espace: EspaceOuvertDeLOnglet;
  /** La synchronisation de cet espace, démarrée une fois la session prête. */
  synchro: Synchronisation | undefined;
  readonly pages: PageOuverte[];
}

export type IssueDeLAjout =
  | { readonly sorte: "inscrit"; readonly nom: string }
  | { readonly sorte: "lecture-en-echec"; readonly lecture: Resultat<EspaceLu> }
  | { readonly sorte: "non-inscrit" };

export interface OngletReel {
  readonly appareil: Appareil;
  readonly reseau: Reseau;
  readonly compte: CompteDEssai;
  readonly magasin: MagasinDeLAppareil;
  readonly pilote: PiloteDeLOnglet;
  /** Le client des espaces de production, enveloppé comme l'entrée l'enveloppe (F-032-AC3). */
  readonly client: ClientDesEspaces;
  /** Chaque espace ouvert par l'onglet, dans l'ordre. */
  readonly generations: readonly Generation[];
  /** F-032-AC14 : chaque canal entre onglets ouvert par une synchronisation de l'onglet. */
  readonly canaux: readonly CanalSuivi[];
  /** L'espace ouvert en dernier. */
  ouvert(): Generation;
  /** L'état prêt de la session de l'espace ouvert, attendu. */
  attendreLaSession(): Promise<SessionPrete>;
  /** La synchronisation de l'espace ouvert, attendue. */
  attendreLaSynchronisation(): Promise<Synchronisation>;
  /** Ouvre la page comme l'éditeur l'ouvre, et la donne à la synchronisation comme page affichée. */
  afficherLaPage(idPage: string): Promise<PageOuverte>;
  /**
   * Le changement d'espace du pilote, demandé dans la tâche de l'appelant, avec le `avant()` de
   * l'interface : pages fermées (chacune une fois sa modification écrite), puis la synchronisation.
   */
  changer(cible: CibleDeSession, nom: string): void;
  /**
   * L'ajout à l'appareil (F-032-AC5), comme l'interface le fait ; `avantLeChangement` est appelé
   * une fois l'entrée inscrite, avant la demande de changement.
   */
  ajouter(idEspace: string, avantLeChangement?: () => Promise<void> | void): Promise<IssueDeLAjout>;
  fermer(): void;
}

export interface OptionsDeLOngletReel {
  readonly serveur: ServeurDEssai;
  readonly cookie: string;
  readonly appareil?: Appareil;
  readonly reseau?: Reseau;
  readonly compte?: CompteDEssai;
}

const lances = new Set<OngletReel>();

function pagesDe(session: SessionDEssai): ReadonlySet<string> | undefined {
  const lu = session.lireEtat();
  return lu.phase === "pret" ? idsDesPages(lu.arborescence) : undefined;
}

function typeDe(
  session: SessionDEssai,
  id: string,
): ReturnType<ReturnType<typeof typesDesPages>["get"]> {
  const lu = session.lireEtat();
  return lu.phase === "pret" ? typesDesPages(lu.arborescence).get(id) : undefined;
}

// Comme les pages ouvertes de l'interface : une page dont une modification n'est pas encore écrite
// reste tenue jusqu'à l'écriture, puis sa persistance est fermée.
function fermerLaPage({ doc, persistance }: PageOuverte): void {
  const liberer = (): void => {
    persistance.fermer();
    doc.destroy();
  };
  if (!persistance.aDesModificationsNonEnregistrees()) {
    liberer();
    return;
  }
  const cesser = persistance.abonner(() => {
    if (persistance.lireEtat() === "fermee" || !persistance.aDesModificationsNonEnregistrees()) {
      cesser();
      liberer();
    }
  });
}

/** Lance l'onglet comme l'entrée de l'application le lance, sur l'appareil donné. */
export async function lancerUnOnglet(options: OptionsDeLOngletReel): Promise<OngletReel> {
  poserLaPageHote();
  const appareil = options.appareil ?? nouvelAppareil();
  const reseau = options.reseau ?? reseauDEssai(options.serveur, options.cookie);
  const compte = options.compte ?? compteDEssai();
  const horloge = horlogeDEssai();
  const canaux: CanalSuivi[] = [];
  const generations: Generation[] = [];
  let ferme = false;
  const magasin = appareil.sur(() =>
    ouvrirLeMagasinDeLAppareil({
      ouvrirUnCanal: (nom) => ouvrirUnCanalSur(appareil, nom),
      retirerDeLAppareil: (idEspace) =>
        appareil.sur(() =>
          retirerDeLAppareil(idEspace, {
            environnement: { ouvrirUnCanal: (nom) => ouvrirUnCanalSur(appareil, nom) },
            lireLesPages: lireLesPagesDeLaBase,
          }),
        ),
    }),
  );
  const client = avecLesNoms(
    creerClientDesEspaces(requeteurDEssai(options.serveur, options.cookie)),
    magasin,
  );
  const pilote = appareil.sur(() => piloterLOnglet({ demarrerSession, magasin }));

  // L'interface démarre la synchronisation dans un effet, une fois l'identifiant de l'espace connu.
  const synchroniser = (generation: Generation): void => {
    const { session } = generation.espace;
    const lu = session.lireEtat();
    if (
      ferme ||
      generation !== generations.at(-1) ||
      generation.synchro !== undefined ||
      lu.phase !== "pret" ||
      lu.idEspace === undefined ||
      session.doc === undefined
    ) {
      return;
    }
    generation.synchro = synchroniserSurLAppareil({
      serveur: options.serveur,
      cookie: options.cookie,
      appareil,
      reseau,
      horloge,
      compte,
      idEspace: lu.idEspace,
      doc: session.doc,
      lirePages: () => pagesDe(session),
      typeDe: (id) => typeDe(session, id),
      canaux,
    }).synchro;
  };
  const suivre = (): void => {
    const etat = pilote.lireEtat();
    if (etat.phase !== "ouvert" || generations.at(-1)?.espace === etat) {
      return;
    }
    const generation: Generation = { espace: etat, synchro: undefined, pages: [] };
    generations.push(generation);
    etat.session.abonner(() => appareil.sur(() => synchroniser(generation)));
    synchroniser(generation);
  };
  pilote.abonner(() => appareil.sur(suivre));
  suivre();

  const ouvert = (): Generation => {
    const derniere = generations.at(-1);
    if (derniere === undefined) {
      throw new Error("L'onglet n'a encore ouvert aucun espace.");
    }
    return derniere;
  };
  const quitter = (generation: Generation | undefined): void => {
    generation?.pages.splice(0).forEach(fermerLaPage);
    generation?.synchro?.fermer();
  };
  const attendreLaSession = async (): Promise<SessionPrete> => {
    let pret: SessionPrete | undefined;
    await attendreQue(
      () => {
        const lu = generations.at(-1)?.espace.session.lireEtat();
        pret = lu?.phase === "pret" ? lu : undefined;
        return pret !== undefined;
      },
      15_000,
      "session de l'espace ouvert prête",
    );
    return pret as SessionPrete;
  };
  const attendreLaSynchronisation = async (): Promise<Synchronisation> => {
    await attendreQue(
      () => generations.at(-1)?.synchro !== undefined,
      15_000,
      "synchronisation de l'espace ouvert",
    );
    return ouvert().synchro as Synchronisation;
  };
  const changer = (cible: CibleDeSession, nom: string): void => {
    appareil.sur(() => pilote.changer(cible, { avant: () => quitter(generations.at(-1)), nom }));
  };
  const onglet: OngletReel = {
    appareil,
    reseau,
    compte,
    magasin,
    pilote,
    client,
    generations,
    canaux,
    ouvert,
    attendreLaSession,
    attendreLaSynchronisation,
    afficherLaPage: async (idPage) => {
      const { idEspace } = await attendreLaSession();
      const synchro = await attendreLaSynchronisation();
      const generation = ouvert();
      const page = await ouvrirLaBaseDUnePage(appareil, idEspace as string, idPage);
      generation.pages.push(page);
      synchro.afficherPage({ idPage, doc: page.doc, refuserLaVersion: () => undefined });
      return page;
    },
    changer,
    ajouter: async (idEspace, avantLeChangement) => {
      const lecture = await appareil.sur(() => client.lireEspace(idEspace));
      if (!lecture.ok) {
        return { sorte: "lecture-en-echec", lecture };
      }
      const { nom, role } = lecture.valeur;
      const entree = { rattachement: "adopte", droit: droitDuRole(role) } as const;
      if (!(await appareil.sur(() => magasin.ajouter(idEspace, entree, nom)))) {
        return { sorte: "non-inscrit" };
      }
      await avantLeChangement?.();
      changer({ sorte: "ajoute", idEspace }, nom);
      return { sorte: "inscrit", nom };
    },
    fermer: () => {
      if (ferme) {
        return;
      }
      quitter(generations.at(-1));
      ferme = true;
      pilote.fermer();
      magasin.fermer();
    },
  };
  lances.add(onglet);
  await attendreQue(() => generations.length > 0, 15_000, "lancement de l'onglet");
  return onglet;
}

/** Ferme chaque onglet lancé, puis les sessions que l'aide de la façade suit. */
export function fermerLesOngletsReels(): void {
  lances.forEach((onglet) => onglet.fermer());
  lances.clear();
  fermerLesFacades();
}
