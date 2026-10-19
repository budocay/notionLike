// Filtre du menu slash (F-005-AC14) : fonction pure, sans import.

/** Ce que le filtre lit d'une commande : son nom et ses mots-clés. */
interface CommandeFiltrable {
  readonly nom: string;
  readonly motsCles: readonly string[];
}

const DIACRITIQUES = /\p{M}/gu;

/** Le texte sans casse ni accents : « Numérotée » et « numerotee » se valent. */
function sansCasseNiAccents(texte: string): string {
  return texte.normalize("NFD").replace(DIACRITIQUES, "").toLowerCase();
}

/**
 * Les commandes dont le nom ou un mot-clé contient la saisie, sans tenir compte de la casse ni des
 * accents, dans leur ordre d'origine ; toutes pour une saisie vide.
 */
export function commandesFiltrees<C extends CommandeFiltrable>(
  commandes: readonly C[],
  saisie: string,
): C[] {
  const cherche = sansCasseNiAccents(saisie);
  return commandes.filter((commande) =>
    [commande.nom, ...commande.motsCles].some((texte) =>
      sansCasseNiAccents(texte).includes(cherche),
    ),
  );
}
