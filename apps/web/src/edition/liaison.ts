// Ce que le module d'édition sait de la liaison Yjs de l'éditeur : reconnaître une transaction qui
// applique au document de l'éditeur ce que Yjs a reçu ou annulé. Les greffons qui n'agissent que sur
// une saisie locale l'écartent ainsi (marques, bloc code, menu slash).
import type { Transaction } from "@tiptap/pm/state";

// Clé de la liaison Yjs (`new PluginKey("y-sync")`) : une transaction qui la porte avec
// `isChangeOrigin` applique au document de l'éditeur ce que Yjs a reçu ou annulé ; elle n'inscrit
// rien de local.
const CLE_DE_LA_LIAISON = "y-sync$";

export function estAppliqueeDepuisYjs(transaction: Transaction): boolean {
  const meta: unknown = transaction.getMeta(CLE_DE_LA_LIAISON);
  return typeof meta === "object" && meta !== null && "isChangeOrigin" in meta
    ? meta.isChangeOrigin === true
    : false;
}
