// Aides des tests de l'onglet à plusieurs espaces (F-032, bloc 4) : l'entrée rendue comme
// `main.tsx` la rend, avec le pilote et le magasin réels et la session démarrée par l'aide des
// façades (F-002-AC31) ; une synchronisation simulée qui n'expose que l'interface du module, avec
// une horloge injectée pour l'attente d'acquittement (F-032-AC12) ; des espaces posés sur l'appareil.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, expect } from "vitest";
import * as Y from "yjs";

import type { Compte } from "../src/compte/index.ts";
import {
  type CanalDeLAppareil,
  lireLesPagesDeLaBase,
  type MagasinDeLAppareil,
  type FonctionDeRetrait,
  ouvrirLeMagasinDeLAppareil,
} from "../src/espace/appareil.ts";
import {
  type CibleDeSession,
  type EtatDuPilote,
  piloterLOnglet,
  type PiloteDeLOnglet,
} from "../src/espace/espace-ouvert.ts";
import { EspaceDeLOnglet } from "../src/interface/EspaceDeLOnglet.tsx";
import { avecLesNoms } from "../src/interface/noms-des-espaces.ts";
import type {
  EspaceASynchroniser,
  FabriqueDeSynchronisation,
} from "../src/interface/synchronisation-ouverte.ts";
import {
  type EtatDeSynchronisation,
  type IssueDeLAttente,
  type PageAffichee,
  retirerDeLAppareil,
  type Synchronisation,
} from "../src/synchronisation/index.ts";
import { baseDEspace, poserUneBaseQuiPorte } from "./aides-appareil.ts";
import {
  compteSimule,
  moi200,
  ROUTES,
  type ServeurSimule,
  serveurSimule,
} from "./aides-compte.tsx";
import { creerFacade, demarrerSession } from "./aides-facade.ts";
import { ecrireLaVersion, VERSION_NON_PRISE_EN_CHARGE } from "./aides-format.ts";

export type SessionEspace = ReturnType<typeof demarrerSession>;
export type Ouvert = Extract<EtatDuPilote, { phase: "ouvert" }>;

export const APPAREIL: CibleDeSession = { sorte: "appareil" };
export function ajoute(idEspace: string): CibleDeSession {
  return { sorte: "ajoute", idEspace };
}

export interface Onglet {
  readonly pilote: PiloteDeLOnglet;
  readonly magasin: MagasinDeLAppareil;
  /** Démarrages de session et fermetures de synchronisation, dans l'ordre. */
  readonly journal: string[];
  readonly utilisateur: UserEvent;
  /** Le compte de l'onglet, son client des espaces enveloppé comme l'entrée le fait (F-032-AC3). */
  readonly compte: Compte;
  readonly serveur: ServeurSimule;
  readonly fermer: () => void;
}

const ouverts: Onglet[] = [];

// L'application est démontée avant que le pilote et le magasin soient fermés ; l'aide des façades
// compte ensuite les écouteurs restés sur chaque document (preparation.ts).
afterEach(() => {
  cleanup();
  ouverts.splice(0).forEach((onglet) => onglet.fermer());
});

export function nomDeCible(cible: CibleDeSession): string {
  return cible.sorte === "appareil" ? "appareil" : cible.idEspace;
}

type Reponse = () => Response | Promise<Response>;

export interface OptionsDuLancement {
  readonly synchronisation?: FabriqueDeSynchronisation | undefined;
  /** Une fabrique qui a besoin du compte de l'onglet (synchronisation réelle). */
  readonly synchronisationDuCompte?: ((compte: Compte) => FabriqueDeSynchronisation) | undefined;
  readonly moi?: Reponse | undefined;
  /** Routes de plus du serveur simulé. */
  readonly routes?: Record<string, Reponse> | undefined;
  readonly journal?: string[] | undefined;
  /** Le serveur simulé de l'onglet ; sans, un serveur neuf qui répond `moi` et `routes`. */
  readonly serveur?: ServeurSimule | undefined;
  /** Délai de réponse du client des espaces (F-014-AC31 : 10 secondes sans lui). */
  readonly delaiMs?: number | undefined;
  /**
   * Canaux entre onglets du magasin et du retrait (F-032-AC20, AC22) ; avec eux, le retrait de
   * l'appareil est celui de l'entrée, par la synchronisation.
   */
  readonly ouvrirUnCanal?: ((nom: string) => CanalDeLAppareil) | undefined;
  /** Un retrait de l'appareil à la place de celui de l'entrée (échec simulé, F-007-AC21). */
  readonly retrait?: FonctionDeRetrait | undefined;
}

/** Lance l'onglet comme l'entrée le fait, sous `StrictMode`, sans attendre la fin du chargement. */
export function lancerLOnglet(options: OptionsDuLancement = {}): Onglet {
  const journal = options.journal ?? [];
  const magasin = magasinDeLOnglet(options.ouvrirUnCanal, options.retrait);
  const pilote = piloterLOnglet({
    magasin,
    demarrerSession: (cible) => {
      journal.push(`démarre ${nomDeCible(cible)}`);
      return demarrerSession(cible);
    },
  });
  const serveur =
    options.serveur ??
    serveurSimule({ [ROUTES.moi]: options.moi ?? (() => moi200()), ...options.routes });
  const simule = compteSimule(serveur, options.delaiMs);
  const compte: Compte = { ...simule, espaces: avecLesNoms(simule.espaces, magasin) };
  render(
    <StrictMode>
      <EspaceDeLOnglet
        pilote={pilote}
        magasin={magasin}
        compte={compte}
        synchronisation={options.synchronisation ?? options.synchronisationDuCompte?.(compte)}
      />
    </StrictMode>,
  );
  const onglet: Onglet = {
    pilote,
    magasin,
    journal,
    utilisateur: userEvent.setup(),
    compte,
    serveur,
    fermer: () => {
      pilote.fermer();
      magasin.fermer();
    },
  };
  ouverts.push(onglet);
  return onglet;
}

/** Le magasin de l'appareil comme l'entrée l'ouvre ; sans canaux, ni prévenu ni retrait. */
export function magasinDeLOnglet(
  ouvrirUnCanal: ((nom: string) => CanalDeLAppareil) | undefined,
  retrait?: FonctionDeRetrait,
): MagasinDeLAppareil {
  if (ouvrirUnCanal === undefined) {
    return ouvrirLeMagasinDeLAppareil({ retirerDeLAppareil: retrait });
  }
  return ouvrirLeMagasinDeLAppareil({
    ouvrirUnCanal,
    retirerDeLAppareil:
      retrait ??
      ((idEspace) =>
        retirerDeLAppareil(idEspace, {
          environnement: { ouvrirUnCanal },
          lireLesPages: lireLesPagesDeLaBase,
        })),
  });
}

/** Fermeture de l'onglet, puis un onglet neuf sur les mêmes bases (rechargement). */
export function relancer(onglet: Onglet, options: OptionsDuLancement = {}): Onglet {
  cleanup();
  onglet.fermer();
  ouverts.splice(ouverts.indexOf(onglet), 1);
  return lancerLOnglet(options);
}

/** L'état ouvert du pilote, une fois sa lecture de l'appareil faite. */
export async function ouvert(pilote: PiloteDeLOnglet): Promise<Ouvert> {
  await waitFor(() => expect(pilote.lireEtat().phase).toBe("ouvert"));
  return pilote.lireEtat() as Ouvert;
}

/** L'espace ouvert, quand sa session est prête. */
export function ouvertMaintenant(pilote: PiloteDeLOnglet): Ouvert {
  const etat = pilote.lireEtat();
  if (etat.phase !== "ouvert") {
    throw new Error("Le pilote n'a ouvert aucun espace.");
  }
  return etat;
}

export function operationsDe(session: SessionEspace) {
  const etat = session.lireEtat();
  if (etat.phase !== "pret") {
    throw new Error("La session n'est pas prête.");
  }
  return etat.operations;
}

/** Le sélecteur d'espace de la barre latérale (F-032-AC4). */
export function selecteur(): HTMLElement {
  return screen.getByRole("link", { name: /^Espaces — espace courant : / });
}

/** Un espace posé sur l'appareil : sa base, avec ces pages à la racine. Rend leurs identifiants. */
export async function poserUnEspace(
  idEspace: string,
  titres: readonly string[],
): Promise<string[]> {
  const facade = creerFacade();
  const ids = titres.map((titre) => facade.creerPage(titre));
  await poserUneBaseQuiPorte(baseDEspace(idEspace), Y.encodeStateAsUpdate(facade.doc));
  facade.fermer();
  return ids;
}

/** Un espace dont le document est d'une version que l'application ne prend pas en charge. */
export async function poserUnEspaceDUneAutreVersion(idEspace: string): Promise<void> {
  const doc = new Y.Doc();
  ecrireLaVersion(doc, VERSION_NON_PRISE_EN_CHARGE);
  await poserUneBaseQuiPorte(baseDEspace(idEspace), Y.encodeStateAsUpdate(doc));
}

// ---------------------------------------------------------------------------------------------
// Synchronisation simulée : l'interface du module ; un état par espace, posé par le test ; une
// attente d'acquittement qui suit les règles du module (F-032-AC12) sur une horloge injectée.

export const ETAT_LOCAL: EtatDeSynchronisation = {
  affiche: "local",
  rattachement: "local",
  registreLu: true,
  droit: "ecriture",
  compte: "connecte",
  refusDeConnexion: false,
  detache: false,
  documentsEnErreur: [],
  divergentes: [],
  droitChange: undefined,
};

export const ETAT_ADOPTE: EtatDeSynchronisation = {
  ...ETAT_LOCAL,
  affiche: "en-cours",
  rattachement: "adopte",
};

/** Ce que la simulée sait de la connexion d'un espace et de ses modifications en attente. */
export interface Connexion {
  etablie: boolean;
  enAttente: boolean;
}

interface Attente {
  readonly delaiMs: number;
  readonly echeance: number;
  readonly resoudre: (issue: IssueDeLAttente) => void;
}

export interface Simulee {
  readonly fabrique: FabriqueDeSynchronisation;
  /** État posé pour cet espace ; sans, `ETAT_LOCAL`. */
  readonly etats: Map<string, EtatDeSynchronisation>;
  readonly connexions: Map<string, Connexion>;
  poser(idEspace: string, partiel: Partial<EtatDeSynchronisation>): void;
  /** Les attentes demandées, avec leur délai, dans l'ordre. */
  readonly attentes: Attente[];
  /** Le serveur acquitte tout ce qui était en attente. */
  acquitter(idEspace: string): void;
  /** Horloge injectée : fait passer le temps et rend les attentes échues. */
  avancer(delaiMs: number): void;
  /** Pages affichées, dans l'ordre. */
  readonly pages: PageAffichee[];
}

export function synchronisationSimulee(journal: string[] = []): Simulee {
  const etats = new Map<string, EtatDeSynchronisation>();
  const connexions = new Map<string, Connexion>();
  const abonnes = new Map<string, Set<() => void>>();
  const enCours = new Map<string, Set<Attente>>();
  let maintenant = 0;
  const etatDe = (id: string): EtatDeSynchronisation => etats.get(id) ?? ETAT_LOCAL;
  const prevenir = (id: string): void => abonnes.get(id)?.forEach((rappel) => rappel());
  const simulee: Simulee = {
    etats,
    connexions,
    attentes: [],
    pages: [],
    poser: (id, partiel) => {
      etats.set(id, { ...etatDe(id), ...partiel });
      prevenir(id);
    },
    acquitter: (id) => {
      const connexion = connexions.get(id);
      if (connexion !== undefined) {
        connexion.enAttente = false;
      }
      enCours.get(id)?.forEach((attente) => attente.resoudre("acquitte"));
      enCours.get(id)?.clear();
    },
    avancer: (delaiMs) => {
      maintenant += delaiMs;
      for (const attentes of enCours.values()) {
        for (const attente of [...attentes]) {
          if (attente.echeance <= maintenant) {
            attentes.delete(attente);
            attente.resoudre("non-acquitte");
          }
        }
      }
    },
    fabrique: (espace) => synchronisationDe(espace),
  };
  // `StrictMode` démarre, ferme puis redémarre : chaque démarrage rend une interface neuve.
  function synchronisationDe(espace: EspaceASynchroniser): Synchronisation {
    const id = espace.idEspace;
    const miens = abonnes.get(id) ?? new Set<() => void>();
    abonnes.set(id, miens);
    let fermee = false;
    return {
      lireEtat: () => etatDe(id),
      abonner: (rappel) => {
        miens.add(rappel);
        return () => void miens.delete(rappel);
      },
      afficherPage: (page) => void simulee.pages.push(page),
      afficherTable: () => undefined,
      afficherAucun: () => undefined,
      adopter: () => Promise.resolve({ sorte: "echec" } as never),
      reessayer: () => undefined,
      reessayerLeDocument: () => undefined,
      effacerLaCopieLocale: () => Promise.resolve("echec"),
      toutEstAcquitte: () => connexions.get(id)?.enAttente !== true,
      estAcquitte: () => false,
      attendreLAcquittement: (delaiMs) =>
        new Promise<IssueDeLAttente>((resoudre) => {
          const connexion = connexions.get(id) ?? { etablie: false, enAttente: false };
          const attente: Attente = { delaiMs, echeance: maintenant + delaiMs, resoudre };
          simulee.attentes.push(attente);
          // Comme le module : rien en attente, acquitté connexion établie ou non (F-032-AC12, H6).
          if (fermee) {
            resoudre("non-acquitte");
          } else if (!connexion.enAttente) {
            resoudre("acquitte");
          } else if (!connexion.etablie) {
            resoudre("non-acquitte");
          } else {
            const attentes = enCours.get(id) ?? new Set<Attente>();
            enCours.set(id, attentes);
            attentes.add(attente);
          }
        }),
      fermer: () => {
        if (!fermee) {
          fermee = true;
          journal.push(`synchronisation fermée ${id}`);
        }
      },
    };
  }
  return simulee;
}
