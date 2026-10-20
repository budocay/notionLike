// Les commandes de bloc (F-005-AC21) : donnée pure, sans import. La barre de blocs et le menu slash
// la lisent toutes deux, et aucune autre liste ; `types-de-bloc.ts` les juge et les applique.

const NIVEAU_DE_TITRE_MAX = 3;
export type NiveauDeTitre = 1 | 2 | typeof NIVEAU_DE_TITRE_MAX;
export const NIVEAUX_DE_TITRE: readonly NiveauDeTitre[] = [1, 2, NIVEAU_DE_TITRE_MAX];

export type NoeudDeListe = "bulletList" | "orderedList";

/** Le nœud du schéma du bloc code (F-005-AC1, ADR-0018). */
export const BLOC_CODE = "codeBlock";

/** Le type qu'une commande donne au bloc : le nœud qu'il devient se déduit de lui seul. */
export type TypeDeBloc =
  | { readonly forme: "paragraphe" }
  | { readonly forme: "titre"; readonly niveau: NiveauDeTitre }
  | { readonly forme: "liste"; readonly noeud: NoeudDeListe }
  | { readonly forme: "code" };

export interface CommandeDeType {
  readonly nom: string;
  /** Ce que la barre montre sur le bouton. */
  readonly repere: string;
  /** Ce que le filtre du menu slash compare à la saisie, en plus du nom (F-005-AC14). */
  readonly motsCles: readonly string[];
  readonly type: TypeDeBloc;
}

/**
 * La liste des commandes de bloc (F-005-AC21) : sept commandes dans l'ordre du vocabulaire de la
 * spec. Aucun mot-clé ne contient « tit » : « /tit » ne garde que les titres (F-005-AC34).
 */
export const LISTE_DES_COMMANDES: readonly CommandeDeType[] = [
  { nom: "Paragraphe", repere: "¶", motsCles: ["texte"], type: { forme: "paragraphe" } },
  ...NIVEAUX_DE_TITRE.map((niveau): CommandeDeType => ({
    nom: `Titre ${niveau}`,
    repere: `T${niveau}`,
    motsCles: [`h${niveau}`],
    type: { forme: "titre", niveau },
  })),
  {
    nom: "Liste à puces",
    repere: "•",
    motsCles: ["puces"],
    type: { forme: "liste", noeud: "bulletList" },
  },
  {
    nom: "Liste numérotée",
    repere: "1.",
    motsCles: ["numéros"],
    type: { forme: "liste", noeud: "orderedList" },
  },
  { nom: "Bloc code", repere: "</>", motsCles: ["code", "pre"], type: { forme: "code" } },
];

export function memeType(a: TypeDeBloc | undefined, b: TypeDeBloc): boolean {
  if (a === undefined) {
    return false;
  }
  if (a.forme === "titre" && b.forme === "titre") {
    return a.niveau === b.niveau;
  }
  if (a.forme === "liste" && b.forme === "liste") {
    return a.noeud === b.noeud;
  }
  return a.forme === b.forme;
}
