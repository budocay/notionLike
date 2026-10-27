// Identifiants que le kanban donne au module de glisser-déposer (F-020-AC25) : une carte et une pile
// n'ont jamais le même, même si une ligne et une option portaient le même identifiant.
import type { IdLigne, IdOption } from "@notionlike/document";

const PREFIXE_DE_CARTE = "carte:";
const PREFIXE_DE_PILE = "pile:";

export function idDeCarte(carte: IdLigne): string {
  return `${PREFIXE_DE_CARTE}${carte}`;
}

/** L'identifiant d'une pile ; la pile « Sans valeur » (`null`) a le sien, sans option. */
export function idDePile(option: IdOption | null): string {
  return `${PREFIXE_DE_PILE}${option ?? ""}`;
}

export function carteDeLIdentifiant(id: string): IdLigne | undefined {
  return id.startsWith(PREFIXE_DE_CARTE) ? id.slice(PREFIXE_DE_CARTE.length) : undefined;
}

/** `undefined` : ce n'est pas une pile ; `{ option: null }` : la pile « Sans valeur ». */
export function pileDeLIdentifiant(id: string): { readonly option: IdOption | null } | undefined {
  if (!id.startsWith(PREFIXE_DE_PILE)) {
    return undefined;
  }
  const option = id.slice(PREFIXE_DE_PILE.length);
  return { option: option === "" ? null : option };
}
