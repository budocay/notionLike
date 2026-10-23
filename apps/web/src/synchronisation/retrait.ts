// Retrait d'un espace de l'appareil (F-032-AC20, AC22, H8) : il ne touche pas au serveur. Les onglets
// ouverts sur cet espace sont prévenus par le canal du registre, selon le protocole de F-013-AC24
// (`effacement`, puis `efface`) : ils ferment tout et se rechargent, une version de F-013 comprise.
import { estUuidCanonique } from "../identifiants/uuid-canonique.ts";
import type { CanalEntreOnglets, Environnement } from "./environnement.ts";
import { effacerEtOublierLEspace } from "./stockage.ts";

export type IssueDuRetrait = "retire" | "echec";

export interface OptionsDuRetrait {
  readonly environnement: Pick<Environnement, "ouvrirUnCanal">;
  /**
   * Repli quand le navigateur ne permet pas l'énumération des bases (H7) : les identifiants des
   * pages et des tables de l'arborescence et de la corbeille de l'espace, lus dans sa base.
   */
  readonly lireLesPages: (idEspace: string) => Promise<readonly string[]>;
}

/** Les messages du canal du registre de F-013-AC24, que l'orchestre de chaque onglet écoute. */
type MessageDuRegistre = { readonly sorte: "effacement" | "efface" };

// Un envoi sur un canal fermé lève de façon synchrone (veille F-032, point 7).
function envoyer(canal: CanalEntreOnglets | undefined, message: MessageDuRegistre): void {
  try {
    canal?.postMessage(message);
  } catch {
    return;
  }
}

/**
 * Retire l'espace de l'appareil : demande aux autres onglets ouverts sur lui de tout fermer, efface
 * toutes ses bases et aucune autre, retire ce que l'appareil retient de lui, puis leur dit que c'est
 * fait. `retire` si tout a été effacé et oublié ; sinon `echec`, l'entrée du registre étant retirée
 * quand même si elle a pu l'être (F-007-AC21). Jamais rejetée.
 */
export async function retirerDeLAppareil(
  idEspace: string,
  options: OptionsDuRetrait,
): Promise<IssueDuRetrait> {
  if (!estUuidCanonique(idEspace)) {
    return "echec";
  }
  let canal: CanalEntreOnglets | undefined;
  try {
    canal = options.environnement.ouvrirUnCanal(`registre:${idEspace}`);
  } catch {
    canal = undefined;
  }
  envoyer(canal, { sorte: "effacement" });
  const { effacees, oublie } = await effacerEtOublierLEspace(idEspace, () =>
    options.lireLesPages(idEspace),
  );
  envoyer(canal, { sorte: "efface" });
  try {
    canal?.close();
  } catch {
    // Un canal qui lève à sa fermeture n'enverra plus rien.
  }
  return effacees === "effacee" && oublie ? "retire" : "echec";
}
