// La synchronisation de l'espace ouvert, vue de l'interface (F-013) : née dans un effet quand
// l'identifiant de l'espace est connu, fermée quand l'écran de l'espace disparaît. Elle ne retarde
// rien : l'arborescence et l'éditeur s'affichent dès leur relecture locale (F-013-AC1).
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { Droit } from "../espace/appareil.ts";
import { brancherLAcquittement } from "../espace/garde-onglet.ts";
import type { EtatSessionPage } from "../page/session-page.ts";
import type { EtatSessionTable } from "../table/session-table.ts";
import type {
  EtatDeSynchronisation,
  OptionsDeSynchronisation,
  Synchronisation,
} from "../synchronisation/index.ts";

/** Ce que l'interface donne à la fabrique : l'espace ouvert et deux rappels. */
export type EspaceASynchroniser = Pick<
  OptionsDeSynchronisation,
  "idEspace" | "doc" | "lirePages" | "typeDe" | "surDocumentsSupprimes" | "surEffacement"
>;

/** Démarre la synchronisation d'un espace ; l'entrée de l'application y joint l'environnement. */
export type FabriqueDeSynchronisation = (espace: EspaceASynchroniser) => Synchronisation;

export interface Rappels {
  readonly lirePages: OptionsDeSynchronisation["lirePages"];
  /** F-018-AC51 : le type lu de chaque identifiant, page ou table. */
  readonly typeDe?: OptionsDeSynchronisation["typeDe"];
  readonly surDocumentsSupprimes: (ids: readonly string[]) => void;
  readonly surEffacement: (etape: "demande" | "faite") => void;
}

export function useSynchronisation(
  fabrique: FabriqueDeSynchronisation | undefined,
  idEspace: string | undefined,
  doc: OptionsDeSynchronisation["doc"] | undefined,
  rappels: Rappels,
): Synchronisation | undefined {
  const [synchro, setSynchro] = useState<Synchronisation | undefined>(undefined);
  // Les rappels changent à chaque rendu : la synchronisation lit toujours les derniers.
  const derniers = useRef(rappels);
  derniers.current = rappels;
  useEffect(() => {
    if (fabrique === undefined || idEspace === undefined || doc === undefined) {
      return undefined;
    }
    const demarree = fabrique({
      idEspace,
      doc,
      lirePages: () => derniers.current.lirePages(),
      typeDe: (id) => derniers.current.typeDe?.(id),
      surDocumentsSupprimes: (ids) => derniers.current.surDocumentsSupprimes(ids),
      surEffacement: (etape) => derniers.current.surEffacement(etape),
    });
    const debrancher = brancherLAcquittement({
      estAcquitte: demarree.estAcquitte,
      abonner: demarree.abonner,
    });
    setSynchro(demarree);
    return () => {
      debrancher();
      demarree.fermer();
      setSynchro(undefined);
    };
  }, [fabrique, idEspace, doc]);
  return synchro;
}

const SANS_ABONNEMENT = (): (() => void) => () => undefined;

export function useEtatDeSynchronisation(
  synchro: Synchronisation | undefined,
): EtatDeSynchronisation | undefined {
  return useSyncExternalStore(synchro?.abonner ?? SANS_ABONNEMENT, () => synchro?.lireEtat());
}

/**
 * La page affichée, une fois entièrement relue (H14), est donnée à la synchronisation ; le document
 * de son éditeur se lit sur le fragment du contenu que sa façade expose. Une table affichée prend sa
 * place (F-018-AC51) : son document de table est donné tel que sa session le tient.
 */
export function useAffichageDuDocument(
  synchro: Synchronisation | undefined,
  idPage: string | undefined,
  page: EtatSessionPage | undefined,
  table?: { readonly idTable: string | undefined; readonly etat: EtatSessionTable | undefined },
): void {
  const pret = page?.phase === "pret" ? page : undefined;
  const doc = pret?.contenu.doc ?? undefined;
  const refuser = pret?.refuserLaVersion;
  const idTable = table?.idTable;
  const docDeTable = table?.etat?.phase === "pret" ? table.etat.table.doc : undefined;
  useEffect(() => {
    if (synchro === undefined) {
      return;
    }
    if (idTable !== undefined && docDeTable !== undefined) {
      synchro.afficherTable({ idTable, doc: docDeTable });
      return;
    }
    if (idPage === undefined || doc === undefined || refuser === undefined) {
      synchro.afficherAucun();
    } else {
      synchro.afficherPage({ idPage, doc, refuserLaVersion: refuser });
    }
  }, [synchro, idPage, doc, refuser, idTable, docDeTable]);
}

/** Ce que l'écran de l'espace lit de sa synchronisation. */
export interface SynchronisationDeLEspace {
  readonly synchro: Synchronisation | undefined;
  readonly etat: EtatDeSynchronisation | undefined;
  /** Raison qui désactive chaque action qui écrit (F-013-AC25) ; `undefined` : modifiable. */
  readonly lectureSeule: string | undefined;
  /** Vrai : un autre onglet efface la copie locale ; l'onglet attend de se recharger (AC24). */
  readonly effaceeAilleurs: boolean;
}

export interface EspaceOuvert {
  readonly fabrique: FabriqueDeSynchronisation | undefined;
  readonly idEspace: string | undefined;
  readonly doc: OptionsDeSynchronisation["doc"] | undefined;
  readonly idPage: string | undefined;
  readonly page: EtatSessionPage | undefined;
  /** F-018-AC51 : la table affichée, et le type lu de chaque identifiant. */
  readonly idTable?: string | undefined;
  readonly table?: EtatSessionTable | undefined;
  readonly typeDe?: OptionsDeSynchronisation["typeDe"];
  readonly lirePages: OptionsDeSynchronisation["lirePages"];
  /**
   * Ferme les documents de page et de table des identifiants supprimés ailleurs, sans effacer leurs
   * bases (AC37, F-018-AC53).
   */
  readonly fermerLesDocuments: (idPages: readonly string[]) => void;
  /** Ferme la session d'espace et les pages de l'onglet (AC24). */
  readonly toutFermer: () => void;
  /**
   * F-032-AC25 : le droit que le registre donnait quand le pilote de l'onglet a ouvert l'espace ;
   * il vaut tant que la synchronisation n'a pas rendu un registre lu. Absent : comme avant F-032.
   */
  readonly droitALOuverture?: Droit | undefined;
}

export function useSynchronisationDeLEspace(
  espace: EspaceOuvert,
  raisonDeLectureSeule: string,
): SynchronisationDeLEspace {
  const [effaceeAilleurs, setEffaceeAilleurs] = useState(false);
  const synchro = useSynchronisation(espace.fabrique, espace.idEspace, espace.doc, {
    lirePages: espace.lirePages,
    typeDe: espace.typeDe,
    surDocumentsSupprimes: espace.fermerLesDocuments,
    surEffacement: (etape) => {
      if (etape === "demande") {
        espace.toutFermer();
        setEffaceeAilleurs(true);
      } else {
        window.location.reload();
      }
    },
  });
  const etat = useEtatDeSynchronisation(synchro);
  useAffichageDuDocument(synchro, espace.idPage, espace.page, {
    idTable: espace.idTable,
    etat: espace.table,
  });
  const lectureSeule = estEnLectureSeule(etat, espace.droitALOuverture)
    ? raisonDeLectureSeule
    : undefined;
  return { synchro, etat, lectureSeule, effaceeAilleurs };
}

/**
 * La règle qui désactive chaque action qui écrit (F-013-AC25) : lecture seule dès le premier rendu,
 * avant toute ouverture acquise et hors ligne compris, d'après le droit lu à l'ouverture
 * (F-032-AC25) ; le registre lu par la synchronisation l'emporte.
 */
export function estEnLectureSeule(
  etat: EtatDeSynchronisation | undefined,
  droitALOuverture: Droit | undefined,
): boolean {
  return (
    (etat?.rattachement === "adopte" && etat.droit === "lecture") ||
    (etat?.registreLu !== true && droitALOuverture === "lecture")
  );
}
