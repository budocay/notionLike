// Document témoin (F-030, vocabulaire) : calculs purs sur Yjs, sans entrée ni sortie. Il reçoit ce
// qu'une lecture brute a rendu ; rien ne l'affiche ni ne l'enregistre.
import * as Y from "yjs";

/** Document témoin rempli de ces enregistrements ; `undefined` si l'un d'eux est inapplicable. */
export function temoinDe(enregistrements: readonly Uint8Array[]): Y.Doc | undefined {
  const temoin = new Y.Doc();
  try {
    enregistrements.forEach((enregistrement) => Y.applyUpdate(temoin, enregistrement));
    return temoin;
  } catch {
    temoin.destroy();
    return undefined;
  }
}

/**
 * Vrai si le témoin porte déjà tout cet état : le lui appliquer n'y change rien. Yjs n'émet de mise
 * à jour que pour ce qu'une transaction ajoute ou supprime : les suppressions, qu'un vecteur d'état
 * ne porte pas, sont donc couvertes (F-030 H13, exécuté).
 */
export function porteTout(temoin: Y.Doc, etat: Uint8Array): boolean {
  let change = false;
  const noter = (): void => {
    change = true;
  };
  temoin.on("update", noter);
  try {
    Y.applyUpdate(temoin, etat);
  } finally {
    temoin.off("update", noter);
  }
  return !change;
}
