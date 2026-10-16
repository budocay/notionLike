// F-031-AC31 : infra/pile.sh tourne sous le bash de macOS (3.2). `bash -n` ne voit pas les
// constructions de bash 4 et plus (MEMORY/VEILLE.md, 2026-10-16) : elles sont cherchées dans le texte.

interface Construction {
  readonly nom: string;
  readonly motif: RegExp;
}

const NOM_DE_VARIABLE = String.raw`[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]]*\])?`;

const CONSTRUCTIONS_DE_BASH_4: readonly Construction[] = [
  { nom: "tableau associatif (declare -A)", motif: /\b(?:declare|typeset|local)\s+-[a-zA-Z]*A/ },
  { nom: "mapfile", motif: /\bmapfile\b/ },
  { nom: "readarray", motif: /\breadarray\b/ },
  { nom: "${var,,} (minuscules)", motif: new RegExp(String.raw`\$\{${NOM_DE_VARIABLE},,?\}`) },
  { nom: "${var^^} (majuscules)", motif: new RegExp(String.raw`\$\{${NOM_DE_VARIABLE}\^\^?\}`) },
  { nom: "référence nommée (declare -n)", motif: /\b(?:declare|typeset|local)\s+-[a-zA-Z]*n\b/ },
  { nom: "coproc", motif: /\bcoproc\b/ },
  { nom: "redirection &>>", motif: /&>>/ },
  { nom: "tube |&", motif: /\|&/ },
];

/**
 * Les constructions de bash 4 et plus d'un script, avec leur ligne ; les lignes de commentaire ne sont
 * pas lues. Les constats ne recopient pas la ligne.
 */
export function constatsBash4(texte: string): string[] {
  return texte
    .split("\n")
    .flatMap((ligne, rang) =>
      ligne.trim().startsWith("#")
        ? []
        : CONSTRUCTIONS_DE_BASH_4.filter(({ motif }) => motif.test(ligne)).map(
            ({ nom }) => `ligne ${rang + 1} : ${nom}`,
          ),
    );
}
