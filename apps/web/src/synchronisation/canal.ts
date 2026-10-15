// Diffusion entre onglets (F-013-AC36, H9) : un canal par document, nommé d'après son nom de
// document, identifiant d'espace compris (F-013-AC44). Il porte des mises à jour Yjs au format V1,
// sans serveur, sans réseau, sans compte : il sert l'espace `local` comme l'espace adopté.
import * as Y from "yjs";

import type { CanalEntreOnglets, Environnement } from "./environnement.ts";

/** Origine des mises à jour reçues d'un autre onglet : elles ne sont jamais rediffusées. */
export const ORIGINE_DU_CANAL: unique symbol = Symbol("canal entre onglets");

type Message =
  | { readonly sorte: "maj"; readonly maj: Uint8Array }
  | { readonly sorte: "demande"; readonly vecteur: Uint8Array };

function lire(donnee: unknown): Message | undefined {
  if (typeof donnee !== "object" || donnee === null) {
    return undefined;
  }
  const { sorte, maj, vecteur } = donnee as Record<string, unknown>;
  // La charge reçue n'est pas toujours une instance d'`Uint8Array` du domaine courant (H9).
  if (sorte === "maj" && ArrayBuffer.isView(maj)) {
    return { sorte, maj: new Uint8Array(maj.buffer, maj.byteOffset, maj.byteLength) };
  }
  if (sorte === "demande" && ArrayBuffer.isView(vecteur)) {
    return {
      sorte,
      vecteur: new Uint8Array(vecteur.buffer, vecteur.byteOffset, vecteur.byteLength),
    };
  }
  return undefined;
}

export interface OptionsDuCanal {
  readonly doc: Y.Doc;
  readonly nomDeDocument: string;
  readonly environnement: Pick<Environnement, "ouvrirUnCanal">;
  /** Vrai pour une mise à jour reçue d'ailleurs (serveur) : elle ne part pas sur le canal. */
  readonly estRecue: (origine: unknown) => boolean;
}

/**
 * Relie le document à son canal : chaque modification de l'onglet y part, chaque mise à jour reçue
 * est appliquée sous l'origine du canal ; à l'ouverture, le document demande aux autres onglets ce
 * que la relecture de sa base n'aurait pas encore reçu. Rend la fonction qui ferme le canal.
 */
export function relierAuCanal(options: OptionsDuCanal): () => void {
  const { doc } = options;
  let canal: CanalEntreOnglets | undefined;
  try {
    canal = options.environnement.ouvrirUnCanal(options.nomDeDocument);
  } catch {
    return () => undefined;
  }
  const ouvert = canal;
  const envoyer = (message: Message): void => {
    try {
      ouvert.postMessage(message);
    } catch {
      // Un canal fermé ou une charge refusée ne remonte pas dans la frappe.
    }
  };
  const surMiseAJour = (maj: Uint8Array, origine: unknown): void => {
    if (origine !== ORIGINE_DU_CANAL && !options.estRecue(origine)) {
      envoyer({ sorte: "maj", maj });
    }
  };
  ouvert.onmessage = (evenement) => {
    const message = lire(evenement.data);
    if (message?.sorte === "maj") {
      appliquer(doc, message.maj);
    } else if (message?.sorte === "demande") {
      const manque = Y.encodeStateAsUpdate(doc, message.vecteur);
      envoyer({ sorte: "maj", maj: manque });
    }
  };
  doc.on("update", surMiseAJour);
  envoyer({ sorte: "demande", vecteur: Y.encodeStateVector(doc) });
  return () => {
    doc.off("update", surMiseAJour);
    ouvert.onmessage = null;
    ouvert.close();
  };
}

// Une charge illisible est écartée sans rien lever : elle vient d'un autre onglet, pas de la frappe.
function appliquer(doc: Y.Doc, maj: Uint8Array): void {
  try {
    Y.applyUpdate(doc, maj, ORIGINE_DU_CANAL);
  } catch {
    return;
  }
}
