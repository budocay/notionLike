// Seconde barrière de la rencontre de deux versions (F-013-AC34, H8) : le document de la page
// affichée, que l'éditeur lie, n'est jamais celui que le fournisseur et le canal entre onglets
// modifient. Une réplique, que nulle liaison n'observe, reçoit d'abord chaque mise à jour ; sa
// version y est lue, et la mise à jour n'atteint le document lié qu'ensuite, si la version est prise
// en charge. Sinon, plus rien n'est recopié dans un sens ni dans l'autre.
import { lireVersionPage, VERSION_PAGE_PRISE_EN_CHARGE } from "@notionlike/document";
import * as Y from "yjs";

/** Origine des recopies entre la réplique et le document lié : elles ne reviennent jamais. */
export const ORIGINE_DU_MIROIR: unique symbol = Symbol("miroir de la page affichée");

export interface Miroir {
  readonly replique: Y.Doc;
  /** Vrai dès qu'une version non prise en charge a atteint la réplique. */
  estRefuse(): boolean;
  /** Cesse toute recopie et détruit la réplique. */
  fermer(): void;
}

/** La version de la réplique est-elle prise en charge par cette application ? */
export function versionAdmise(doc: Y.Doc): boolean {
  return lireVersionPage(doc) <= VERSION_PAGE_PRISE_EN_CHARGE;
}

/**
 * Crée la réplique d'un document lié, entièrement relu (H14), et les relie. `surRefus` est appelé
 * une fois, avant que la mise à jour refusée n'atteigne le document lié, qui ne la reçoit jamais.
 */
export function creerMiroir(lie: Y.Doc, surRefus: () => void): Miroir {
  const replique = new Y.Doc({ gc: lie.gc });
  Y.applyUpdate(replique, Y.encodeStateAsUpdate(lie), ORIGINE_DU_MIROIR);
  let refuse = !versionAdmise(replique);
  const versLaReplique = (maj: Uint8Array, origine: unknown): void => {
    if (!refuse && origine !== ORIGINE_DU_MIROIR) {
      Y.applyUpdate(replique, maj, ORIGINE_DU_MIROIR);
    }
  };
  const versLeDocumentLie = (maj: Uint8Array, origine: unknown): void => {
    if (refuse || origine === ORIGINE_DU_MIROIR) {
      return;
    }
    if (!versionAdmise(replique)) {
      refuse = true;
      surRefus();
      return;
    }
    Y.applyUpdate(lie, maj, ORIGINE_DU_MIROIR);
  };
  lie.on("update", versLaReplique);
  replique.on("update", versLeDocumentLie);
  return {
    replique,
    estRefuse: () => refuse,
    fermer: () => {
      lie.off("update", versLaReplique);
      replique.off("update", versLeDocumentLie);
      replique.destroy();
    },
  };
}
