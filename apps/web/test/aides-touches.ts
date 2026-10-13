// Contrôle statique de F-004-AC31 : hors de la déclaration des raccourcis, aucun fichier de `src/`
// ne compare la touche d'un événement clavier à une valeur littérale, ne lit un modificateur d'une
// frappe, ni n'écrit en chaîne un nom de touche de fonction ou de modificateur. Seule exception :
// les touches d'interaction, admises par une liste fermée de couples (touche, fichier). Le contrôle
// reçoit des textes et rend la liste des fautes, chacune nommant le fichier et la touche.

export const DECLARATION = "src/interface/raccourcis.ts";
/** Seul module qui lit les modificateurs d'un clic : il ne lit aucune touche. */
export const MODULE_DES_CLICS = "src/interface/clic.ts";

/**
 * Touches d'interaction : elles valident, annulent, ferment ou déplacent le focus dans un champ, un
 * menu, une liste ou le tiroir, sans modificateur, et ne déclenchent aucune commande.
 */
export const TOUCHES_D_INTERACTION: Readonly<Record<string, readonly string[]>> = {
  // Saisie d'un titre : Entrée valide, Échap annule.
  "src/interface/SaisieTitre.tsx": ["Enter", "Escape"],
  // Menu « ⋯ » : les flèches parcourent les entrées.
  // Barre de blocs de l'éditeur : les flèches parcourent les commandes, Échap rend le focus.
  "src/interface/composants/Edition.tsx": ["ArrowLeft", "ArrowRight", "Escape"],
  "src/interface/composants/MenuActions.tsx": ["ArrowDown", "ArrowUp"],
  // Menu et liste du fil d'Ariane : Échap ferme la surface.
  "src/interface/flottant.ts": ["Escape"],
  // Tiroir : Échap le ferme.
  "src/interface/tiroir.ts": ["Escape"],
};

// Un nom de touche de raccourci écrit en chaîne : touche de fonction, ou modificateur.
const TOUCHE_EN_CHAINE = /["'`](?:F\d{1,2}|Mod|Ctrl|Cmd|⌘|Alt|Meta|Control)(?:\+[^"'`]*)?["'`]/u;
const MODIFICATEUR = /\b(?:ctrlKey|metaKey|altKey|shiftKey|getModifierState)\b/;
const CLAVIER = /\.(?:key|code|keyCode|which|charCode)\b|KeyboardEvent|\bkey(?:down|up|press)\b/i;
const COMMENTAIRE = /\/\*[\s\S]*?\*\/|(?<=^|\s)\/\/.*$/gm;

// Ce à quoi une touche est comparée : un littéral, ou un nom à résoudre dans le fichier.
const OPERANDE = String.raw`(?:(?<guillemet>["'\`])(?<litteral>[^"'\`]*)\k<guillemet>|(?<nom>[A-Za-z_$][\w$.]*))`;
const LECTURE = String.raw`[\w$.?]*\.(?<propriete>key|code)\b`;
const COMPARAISON = new RegExp(String.raw`${LECTURE}\s*[!=]==?\s*${OPERANDE}`, "g");
const COMPARAISON_INVERSE = new RegExp(String.raw`${OPERANDE}\s*[!=]==?\s*${LECTURE}`, "g");
const TABLE = /([A-Za-z_$][\w$]*)\s*\[\s*[\w$.?]*\.(key|code)\s*\]/g;
const TOUTE_LECTURE = /\.(?:key|keyCode|which|charCode)\b/g;
// Valeurs de `KeyboardEvent.code` : celles de `key`, et les codes de position.
const CODE_DE_TOUCHE =
  /^(?:Key[A-Z]|Digit\d|Numpad\w+|F\d{1,2}|Arrow\w+|Enter|Escape|Space|Tab|Backspace|Delete|Insert|Home|End|Page(?:Up|Down)|(?:Control|Shift|Alt|Meta)(?:Left|Right))$/;

interface Lecture {
  /** Touches littérales auxquelles le fichier compare une frappe. */
  readonly touches: string[];
  readonly fautes: string[];
}

function constante(texte: string, nom: string): string | undefined {
  return new RegExp(String.raw`\bconst ${nom}\b[^=]*=\s*(["'\`])([^"'\`]*)\1`).exec(texte)?.[2];
}

function clesDeTable(texte: string, nom: string): string[] | undefined {
  const corps = new RegExp(String.raw`\bconst ${nom}\b[^=]*=\s*\{([^}]*)\}`).exec(texte)?.[1];
  return corps === undefined
    ? undefined
    : [...corps.matchAll(/(?:^|,)\s*(?:["'`]([^"'`]*)["'`]|([\w$]+))\s*:/g)].map(
        ([, entreGuillemets, nue = ""]) => entreGuillemets ?? nue,
      );
}

/** Une comparaison d'une touche : la propriété lue, la valeur comparée si elle se lit, le texte. */
interface Comparaison {
  readonly propriete: string;
  readonly valeur: string | undefined;
  readonly vue: string;
}

function comparaisonsDirectes(texte: string): Comparaison[] {
  return [...texte.matchAll(COMPARAISON), ...texte.matchAll(COMPARAISON_INVERSE)].map((trouve) => {
    const { propriete = "", litteral, nom = "" } = trouve.groups ?? {};
    return { propriete, valeur: litteral ?? constante(texte, nom), vue: trouve[0] };
  });
}

/** Une table indexée par la touche compare la frappe à chacune de ses clés. */
function comparaisonsParTable(texte: string): Comparaison[][] {
  return [...texte.matchAll(TABLE)].map(([vue, nom = "", propriete = ""]) => {
    const cles = clesDeTable(texte, nom) ?? [undefined];
    return cles.map((valeur) => ({ propriete, valeur, vue }));
  });
}

/** Touches auxquelles un fichier compare une frappe, et lectures que le contrôle ne sait pas lire. */
function lireLesTouches(chemin: string, texte: string): Lecture {
  const directes = comparaisonsDirectes(texte);
  const tables = comparaisonsParTable(texte);
  const toutes = [...directes, ...tables.flat()];
  const fautes = toutes
    .filter(({ valeur }) => valeur === undefined)
    .map(
      ({ vue }) => `${chemin} : touche comparée à une valeur que le contrôle ne lit pas : ${vue}`,
    );
  // Chaque comparaison directe et chaque table lit la touche une fois : toute autre lecture
  // (un `switch`, une valeur passée ailleurs) échappe au contrôle, et se refuse.
  const comprises = [...directes, ...tables.map(([premiere]) => premiere)].filter(
    (comparaison) => comparaison?.propriete === "key",
  ).length;
  if ((texte.match(TOUTE_LECTURE)?.length ?? 0) > comprises) {
    fautes.push(`${chemin} : touche lue hors d'une comparaison que le contrôle sait lire`);
  }
  const touches = toutes.flatMap(({ propriete, valeur }) =>
    valeur !== undefined && (propriete === "key" || CODE_DE_TOUCHE.test(valeur)) ? [valeur] : [],
  );
  return { touches, fautes };
}

function fautesDuFichier(
  chemin: string,
  texte: string,
  admises: readonly string[],
): { readonly fautes: string[]; readonly touches: string[] } {
  if (chemin === MODULE_DES_CLICS) {
    const clavier = CLAVIER.exec(texte);
    return {
      touches: [],
      fautes:
        clavier === null ? [] : [`${chemin} : le module des clics lit le clavier : ${clavier[0]}`],
    };
  }
  const { touches, fautes } = lireLesTouches(chemin, texte);
  const enChaine = TOUCHE_EN_CHAINE.exec(texte);
  const modificateur = MODIFICATEUR.exec(texte);
  return {
    touches,
    fautes: [
      ...(enChaine === null ? [] : [`${chemin} : touche en dur ${enChaine[0]}`]),
      ...(modificateur === null
        ? []
        : [`${chemin} : modificateur lu hors de la déclaration : ${modificateur[0]}`]),
      ...fautes,
      ...[...new Set(touches)]
        .filter((touche) => !admises.includes(touche))
        .map((touche) => `${chemin} : touche « ${touche} » comparée hors de la déclaration`),
    ],
  };
}

/** F-004-AC31 : fautes des fichiers donnés, et couples de la liste que le code ne contient plus. */
export function fautesDeTouches(
  fichiers: ReadonlyMap<string, string>,
  admises: Readonly<Record<string, readonly string[]>> = TOUCHES_D_INTERACTION,
): string[] {
  const fautes: string[] = [];
  const vues = new Map<string, readonly string[]>();
  for (const [chemin, source] of fichiers) {
    if (chemin !== DECLARATION) {
      const resultat = fautesDuFichier(
        chemin,
        source.replace(COMMENTAIRE, ""),
        admises[chemin] ?? [],
      );
      fautes.push(...resultat.fautes);
      vues.set(chemin, resultat.touches);
    }
  }
  for (const [chemin, touches] of Object.entries(admises)) {
    for (const touche of touches.filter((une) => !(vues.get(chemin) ?? []).includes(une))) {
      fautes.push(
        `liste des touches d'interaction : (${touche}, ${chemin}) n'est plus dans le code`,
      );
    }
  }
  return fautes;
}
