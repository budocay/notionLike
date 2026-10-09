// Contrôles statiques des fichiers de style d'`apps/web` (F-004-AC3, AC4, AC5, AC6, AC10, AC11, AC13,
// AC14, AC18, AC19, AC23, AC40, AC41, AC47, AC48, AC50). Chaque contrôle reçoit des textes et rend la liste des fautes,
// chacune nommant le fichier et la valeur en cause. Deux régimes : tout fichier source passe les
// interdits (`controlerFichier`) ; les fichiers que Tailwind analyse passent en plus une liste
// blanche, où chaque classe doit être une classe nommée du projet ou bâtie sur un jeton
// (`controlerClasses`). Tailwind ne lisant que ces fichiers-là, une classe écrite ailleurs ne
// produit aucune règle.
import { lireJetons } from "../src/styles/lecture-jetons.ts";
import { COULEUR_LITTERALE, COURBE_LITTERALE, DUREE_LITTERALE, FOND } from "./aides-jetons.ts";

export const FICHIER_DES_JETONS = "src/styles/jetons.css";
export const FEUILLE_D_ENTREE = "src/styles/entree.css";
/** Seconde feuille, réservée à la page de démonstration : elle importe la feuille d'entrée. */
export const FEUILLE_DE_DEMONSTRATION = "src/demonstration/demonstration.css";
export const ENTREE_DE_LA_DEMONSTRATION = "src/demonstration/entree.tsx";

export interface Contexte {
  /** Noms des jetons déclarés, `--color-surface-application` par exemple. */
  readonly jetons: ReadonlySet<string>;
  /** Classes nommées du projet, déclarées par `@utility` dans les feuilles données. */
  readonly utilitaires: ReadonlySet<string>;
  /** Variantes du projet : `@custom-variant` et celles que donnent les seuils. */
  readonly variantes: ReadonlySet<string>;
  /** Animations en boucle : noms des jetons `--animate-*` dont la valeur porte `infinite`. */
  readonly boucles: ReadonlySet<string>;
}

/**
 * Contexte d'un fichier analysé. `feuilles` est le texte des feuilles qui le désignent : la feuille
 * d'entrée seule pour l'application, suivie de la feuille de démonstration pour la page.
 */
export function contexteDe(jetons: string, feuilles: string): Contexte {
  const { theme } = lireJetons(jetons);
  const seuils = theme
    .filter(({ nom }) => nom.startsWith("--breakpoint-"))
    .map(({ nom }) => nom.replace("--breakpoint-", ""));
  const personnalisees = [...feuilles.matchAll(/@custom-variant\s+([\w-]+)/g)].map(
    ([, nom]) => nom,
  );
  return {
    jetons: new Set(theme.map(({ nom }) => nom)),
    utilitaires: new Set([...feuilles.matchAll(/@utility\s+([\w-]+)/g)].map(([, nom = ""]) => nom)),
    variantes: new Set([
      ...personnalisees.filter((nom) => nom !== undefined),
      ...seuils.flatMap((seuil) => [seuil, `min-${seuil}`, `max-${seuil}`]),
    ]),
    boucles: new Set(
      theme
        .filter(({ nom, valeur }) => nom.startsWith("--animate-") && /\binfinite\b/.test(valeur))
        .map(({ nom }) => nom.replace("--animate-", "")),
    ),
  };
}

// ── Interdits, pour tout fichier source ──────────────────────────────────────────────────────────

const EXTENSIONS = new Set(["css", "ts", "tsx", "html"]);
const CHAINE_OU_COMMENTAIRE_CSS = /"[^"\n]*"|\/\*[\s\S]*?\*\//g;

/** Retire les commentaires d'une feuille sans toucher aux chaînes : « ../x/*.ts » n'en ouvre pas un. */
function sansCommentaires(css: string): string {
  return css.replace(CHAINE_OU_COMMENTAIRE_CSS, (trouve) => (trouve.startsWith('"') ? trouve : ""));
}
const RENVOI = /var\(\s*--[\w-]+\s*\)/g;
const COULEUR_DE_THEME = /<meta\s+name="theme-color"\s+content="(#[0-9a-f]{6})"\s*\/?>/;

interface Interdit {
  readonly motif: RegExp;
  readonly faute: string;
  /** Extensions visées ; toutes si absent. */
  readonly pour?: readonly string[];
}

const HORS_CSS = ["ts", "tsx", "html"];
const INTERDITS: readonly Interdit[] = [
  { motif: /--primitif-[\w-]+/, faute: "jeton primitif consommé hors du fichier des jetons" },
  { motif: /@theme\b/, faute: "directive @theme hors du fichier des jetons", pour: ["css"] },
  {
    motif: /(?<![\w-])[a-z][a-z0-9-]*-\[[^\]\s]*\]?/,
    faute: "valeur arbitraire entre crochets",
  },
  { motif: /(?<![\w-])dark:/, faute: "variante dark:, qui suit la préférence du système" },
  {
    motif: /(?<![\w-])(?:sm|md|lg|xl|2xl):(?=[a-z-])/,
    faute: "variante d'un seuil par défaut de Tailwind",
  },
  {
    motif: /(?<![\w./-])[a-z]+(?:-[a-z]+)*-\d+(?:\.\d+)?(?:\/\d+)?(?![\w.-])/,
    faute: "classe à nombre nu, hors des jetons du projet",
    pour: HORS_CSS,
  },
  { motif: /(?<![\w-])container(?![\w-])/, faute: "classe container", pour: HORS_CSS },
  {
    motif:
      /(?<![\w-])outline-(?:none|hidden)(?![\w-])|outline(?:-style|-width)?\s*:\s*(?:none|0)\b/,
    faute: "contour de focus supprimé",
  },
  {
    motif: /\b(?:https?|wss?|ftp):\/\/|(?:url\(\s*|src=|href=|@import\s+)["']?\/\//,
    faute: "adresse externe",
  },
  {
    motif: /Enregistré sur cet appareil|Modifications enregistrées/,
    faute: "texte affirmatif d'enregistrement",
  },
  {
    motif: /\(\s*(?:min-|max-)?(?:width|height)\s*[:<>]=?\s*[\d.]+/,
    faute: "requête de largeur à valeur littérale",
  },
  {
    motif: /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix)\(/,
    faute: "couleur littérale",
    pour: HORS_CSS,
  },
  {
    motif: new RegExp(String.raw`["'\`](?:${COULEUR_LITTERALE.source})["'\`]`),
    faute: "couleur littérale",
    pour: HORS_CSS,
  },
  {
    // Une taille de texte ou une hauteur de ligne en unité absolue, en CSS comme en style en ligne.
    motif:
      /(?<![\w-])(?:font-size|fontSize|line-height|lineHeight|font)\s*:\s*[^;{}\n]*?\d(?:px|pt)\b|\bfontSize\s*:\s*\d/,
    faute: "taille de texte ou hauteur de ligne en pixels, hors des unités relatives",
  },
  { motif: DUREE_LITTERALE, faute: "durée littérale", pour: HORS_CSS },
  {
    motif: /\b(?:cubic-bezier|steps)\(|(?<![\w-])ease-(?:in|out|in-out|linear)(?![\w-])/,
    faute: "courbe littérale",
    pour: HORS_CSS,
  },
];

function extensionDe(chemin: string): string {
  return chemin.slice(chemin.lastIndexOf(".") + 1);
}

function fautesDInterdits(chemin: string, texte: string): string[] {
  const extension = extensionDe(chemin);
  return INTERDITS.filter(({ pour }) => pour === undefined || pour.includes(extension)).flatMap(
    ({ motif, faute }) => {
      const trouve = motif.exec(texte);
      return trouve === null ? [] : [`${chemin} : ${faute} : « ${trouve[0]} »`];
    },
  );
}

interface Declaration {
  readonly propriete: string;
  readonly valeur: string;
}

function declarationsCss(texte: string): Declaration[] {
  return [...texte.matchAll(/(?:^|[{;\s])([a-z-]+)\s*:\s*([^;{}]+);/g)].map(
    ([, propriete = "", valeur = ""]) => ({
      propriete,
      valeur: valeur.replace(/\s+/g, " ").trim(),
    }),
  );
}

const PROPRIETES_ANIMABLES = new Set(["opacity", "transform", "none"]);

function fautesDeTransition(chemin: string, { propriete, valeur }: Declaration): string[] {
  if (propriete === "transition-property") {
    return valeur
      .split(",")
      .map((nom) => nom.trim())
      .filter((nom) => !PROPRIETES_ANIMABLES.has(nom))
      .map((nom) => `${chemin} : transition de « ${nom} », ni transform ni opacity`);
  }
  if (propriete !== "transition" || valeur === "none") {
    return [];
  }
  return valeur.split(/,(?![^(]*\))/).flatMap((segment) => {
    const anime = segment.trim().split(/\s+/)[0] ?? "";
    if (!PROPRIETES_ANIMABLES.has(anime)) {
      return [`${chemin} : transition de « ${anime} », ni transform ni opacity`];
    }
    return /var\(\s*--duree-[\w-]+\s*\)/.test(segment)
      ? []
      : [`${chemin} : transition sans durée tirée d'un jeton : « ${segment.trim()} »`];
  });
}

function fautesDeValeurCss(chemin: string, declaration: Declaration): string[] {
  const { propriete, valeur } = declaration;
  const reste = valeur.replace(RENVOI, "");
  const fautes: string[] = [];
  if (COULEUR_LITTERALE.test(reste)) {
    fautes.push(`${chemin} : couleur littérale : « ${propriete}: ${valeur} »`);
  }
  if (/^(transition|animation)/.test(propriete)) {
    if (DUREE_LITTERALE.test(reste)) {
      fautes.push(`${chemin} : durée littérale : « ${propriete}: ${valeur} »`);
    }
    if (COURBE_LITTERALE.test(reste)) {
      fautes.push(`${chemin} : courbe littérale : « ${propriete}: ${valeur} »`);
    }
  }
  if (
    propriete === "animation" &&
    valeur !== "none" &&
    !/^var\(\s*--animate-[\w-]+\s*\)$/.test(valeur)
  ) {
    fautes.push(`${chemin} : animation hors d'un jeton --animate-* : « ${valeur} »`);
  }
  return [...fautes, ...fautesDeTransition(chemin, declaration)];
}

function blocApres(texte: string, debut: number): string {
  let profondeur = 0;
  for (
    let position = texte.indexOf("{", debut);
    position >= 0 && position < texte.length;
    position += 1
  ) {
    profondeur += texte[position] === "{" ? 1 : 0;
    profondeur -= texte[position] === "}" ? 1 : 0;
    if (profondeur === 0) {
      return texte.slice(debut, position + 1);
    }
  }
  return texte.slice(debut);
}

const ARRET_SOUS_MOUVEMENT_REDUIT =
  /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{[^}]*animation\s*:\s*none/;

function fautesDeBoucles(chemin: string, texte: string, boucles: ReadonlySet<string>): string[] {
  return [...texte.matchAll(/@utility\s+([\w-]+)/g)].flatMap((trouvee) => {
    const bloc = blocApres(texte, trouvee.index);
    const enBoucle =
      /\binfinite\b/.test(bloc) ||
      [...bloc.matchAll(/var\(\s*--animate-([\w-]+)\s*\)/g)].some(([, nom = ""]) =>
        boucles.has(nom),
      );
    return enBoucle && !ARRET_SOUS_MOUVEMENT_REDUIT.test(bloc)
      ? [
          `${chemin} : la classe ${trouvee[1]} boucle sans « animation: none » sous mouvement réduit`,
        ]
      : [];
  });
}

function fautesCss(chemin: string, source: string, contexte: Contexte): string[] {
  const texte = sansCommentaires(source);
  const inconnus = [...texte.matchAll(/var\(\s*(--[\w-]+)/g)]
    .map(([, nom = ""]) => nom)
    .filter((nom) => !contexte.jetons.has(nom) && !/^--(tw-|niveau$)/.test(nom))
    .map((nom) => `${chemin} : jeton non déclaré : « ${nom} »`);
  return [
    ...inconnus,
    ...declarationsCss(texte).flatMap((declaration) => fautesDeValeurCss(chemin, declaration)),
    ...fautesDeBoucles(chemin, texte, contexte.boucles),
  ];
}

/** F-004-AC3 et suivants : les interdits d'un fichier de style, quel qu'il soit. */
export function controlerFichier(chemin: string, source: string, contexte: Contexte): string[] {
  const extension = extensionDe(chemin);
  if (!EXTENSIONS.has(extension)) {
    return [`${chemin} : extension « ${extension} » que le contrôle ne sait pas analyser`];
  }
  const texte = extension === "html" ? source.replace(COULEUR_DE_THEME, "") : source;
  const sansCommentaire = extension === "css" ? sansCommentaires(texte) : texte;
  return [
    ...fautesDInterdits(chemin, sansCommentaire),
    ...(extension === "css" ? fautesCss(chemin, texte, contexte) : []),
  ];
}

// ── Liste blanche, pour les fichiers que Tailwind analyse ────────────────────────────────────────

const VARIANTES_STATIQUES = new Set([
  "hover",
  "focus",
  "focus-visible",
  "focus-within",
  "active",
  "disabled",
  "first",
  "last",
  "placeholder",
  "motion-reduce",
  "motion-safe",
  "pointer-coarse",
  "pointer-fine",
  "aria-expanded",
  "aria-invalid",
  "aria-disabled",
]);
const VARIANTES_COMPOSEES = /^(?:group|peer|not|has|in)-(.+)$/;

const MOTS_NUS = new Set(
  (
    "flex inline-flex grid inline-grid block inline inline-block hidden contents relative absolute " +
    "fixed sticky static isolate truncate uppercase italic underline sr-only grow shrink group " +
    "antialiased tabular-nums invisible visible"
  ).split(" "),
);

interface Famille {
  /** Espaces de noms de jetons qui donnent une valeur à cette famille. */
  readonly espaces?: readonly string[];
  readonly mots?: readonly string[];
  /** Renvoi direct admis entre parenthèses, `duration-(--duree-rapide)` par exemple. */
  readonly renvoi?: RegExp;
}

const DIMENSION = ["auto", "full", "fit", "min", "max", "dvh", "dvw"];
const COULEUR = ["transparent", "current", "inherit"];
const ALIGNEMENT = ["start", "center", "end", "baseline", "stretch", "between"];
const COTES = ["", "-t", "-r", "-b", "-l", "-x", "-y", "-s", "-e"];
const COINS = ["-tl", "-tr", "-bl", "-br"];

function familles(noms: readonly string[], famille: Famille): [string, Famille][] {
  return noms.map((nom) => [nom, famille]);
}

const FAMILLES: ReadonlyMap<string, Famille> = new Map([
  ...familles(
    [...COTES.map((cote) => `p${cote.slice(1)}`), ...COTES.map((cote) => `m${cote.slice(1)}`)],
    { espaces: ["spacing"], mots: ["auto"] },
  ),
  ...familles(
    ["gap", "gap-x", "gap-y", "inset", "inset-x", "inset-y", "top", "right", "bottom", "left"],
    {
      espaces: ["spacing"],
      mots: ["auto", "full"],
    },
  ),
  ...familles(["w", "h", "size", "min-w", "min-h", "max-w", "max-h", "basis"], {
    espaces: ["spacing", "container"],
    mots: DIMENSION,
  }),
  ...familles(["bg", "border", "outline", "fill", "stroke", "caret", "decoration"], {
    espaces: ["color"],
    mots: COULEUR,
  }),
  [
    "text",
    {
      espaces: ["color", "text"],
      mots: [...COULEUR, "left", "center", "right", "balance", "pretty"],
    },
  ],
  ["font", { espaces: ["font-weight"] }],
  ["tracking", { espaces: ["tracking"] }],
  ...familles(
    [...COTES, ...COINS].map((cote) => `rounded${cote}`),
    { espaces: ["radius"], mots: ["none", "full"] },
  ),
  ["shadow", { espaces: ["shadow"], mots: ["none"] }],
  ["ease", { espaces: ["ease"] }],
  ["animate", { espaces: ["animate"], mots: ["none"] }],
  ["transition", { mots: ["opacity", "transform", "none"] }],
  ["duration", { renvoi: /^--duree-[\w-]+$/ }],
  ...familles(["items", "justify", "self", "content"], { mots: ALIGNEMENT }),
  ["flex", { mots: ["row", "col", "wrap", "nowrap", "none", "auto"] }],
  ...familles(["overflow", "overflow-x", "overflow-y"], {
    mots: ["hidden", "auto", "visible", "clip"],
  }),
  ["whitespace", { mots: ["nowrap", "normal"] }],
  ["wrap", { mots: ["anywhere", "break-word"] }],
  ["cursor", { mots: ["pointer", "default", "text"] }],
  ["pointer-events", { mots: ["none", "auto"] }],
  ["select", { mots: ["none", "text"] }],
  ["list", { mots: ["none"] }],
  ["appearance", { mots: ["none"] }],
  ["col-span", { mots: ["full"] }],
]);

function variantePermise(variante: string, contexte: Contexte): boolean {
  if (VARIANTES_STATIQUES.has(variante) || contexte.variantes.has(variante)) {
    return true;
  }
  const interieure = VARIANTES_COMPOSEES.exec(variante)?.[1];
  return interieure !== undefined && variantePermise(interieure, contexte);
}

function valeurPermise(prefixe: string, valeur: string, contexte: Contexte): boolean {
  const famille = FAMILLES.get(prefixe);
  if (famille === undefined || valeur.includes("--") !== valeur.startsWith("(--")) {
    return false;
  }
  const renvoi = /^\((--[\w-]+)\)$/.exec(valeur)?.[1];
  if (renvoi !== undefined) {
    return famille.renvoi?.test(renvoi) === true && contexte.jetons.has(renvoi);
  }
  return (
    famille.mots?.includes(valeur) === true ||
    (famille.espaces ?? []).some((espace) => contexte.jetons.has(`--${espace}-${valeur}`))
  );
}

function basePermise(base: string, contexte: Contexte): boolean {
  const nom = base.startsWith("-") ? base.slice(1) : base;
  if (contexte.utilitaires.has(nom) || MOTS_NUS.has(nom)) {
    return true;
  }
  for (let coupe = nom.indexOf("-"); coupe > 0; coupe = nom.indexOf("-", coupe + 1)) {
    if (valeurPermise(nom.slice(0, coupe), nom.slice(coupe + 1), contexte)) {
      return true;
    }
  }
  return false;
}

/** Faute d'une classe, ou `undefined` si elle est une classe nommée du projet ou bâtie sur un jeton. */
export function fauteDeClasse(classe: string, contexte: Contexte): string | undefined {
  const morceaux = classe.split(/:(?![^(]*\))/);
  const base = morceaux.pop() ?? "";
  const variante = morceaux.find((nom) => !variantePermise(nom, contexte));
  if (variante !== undefined) {
    return `variante « ${variante}: » hors des variantes du projet`;
  }
  if (basePermise(base, contexte)) {
    return undefined;
  }
  return /[-/]\d+(?:\.\d+)?$/.test(base)
    ? "classe à nombre nu, hors des jetons du projet"
    : "classe qui n'est ni nommée par le projet ni bâtie sur un jeton";
}

function baseDe(classe: string): string {
  return classe.split(/:(?![^(]*\))/).pop() ?? "";
}

function fautesDeListe(chemin: string, liste: string, contexte: Contexte): string[] {
  const classes = liste.split(/\s+/).filter((classe) => classe !== "");
  const fautes = classes.flatMap((classe) => {
    const faute = fauteDeClasse(classe, contexte);
    return faute === undefined ? [] : [`${chemin} : « ${classe} » : ${faute}`];
  });
  const bases = classes.map(baseDe);
  const transition = bases.some(
    (base) => base === "transition-opacity" || base === "transition-transform",
  );
  if (transition && !bases.some((base) => /^duration-\(--duree-[\w-]+\)$/.test(base))) {
    fautes.push(`${chemin} : transition sans durée tirée d'un jeton : « ${liste.trim()} »`);
  }
  const boucle = bases.some(
    (base) => contexte.boucles.has(base.replace(/^animate-/, "")) && base.startsWith("animate-"),
  );
  if (boucle && !classes.includes("motion-reduce:animate-none")) {
    fautes.push(
      `${chemin} : animation en boucle sans motion-reduce:animate-none : « ${liste.trim()} »`,
    );
  }
  return fautes;
}

const CHAINE = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
const ATTRIBUT_CLASS = /\sclass="([^"]*)"/g;

function listesDeClasses(chemin: string, source: string): string[] {
  const html = extensionDe(chemin) === "html";
  const texte = html ? source : source.replace(/^\s*\/\/.*$/gm, "");
  return [...texte.matchAll(html ? ATTRIBUT_CLASS : CHAINE)].map(([, ...groupes]) =>
    (groupes.find((groupe) => groupe !== undefined) ?? "").replace(/\$\{[A-Z][A-Z_]*\}/g, " "),
  );
}

/** F-004-AC3, AC19 : chaque classe d'un fichier analysé par Tailwind est permise. */
export function controlerClasses(chemin: string, source: string, contexte: Contexte): string[] {
  const fautes: string[] = [];
  if (extensionDe(chemin) !== "html") {
    if (/^\s*import\s/m.test(source)) {
      fautes.push(`${chemin} : un fichier de classes n'importe rien`);
    }
    if (/\$\{(?![A-Z][A-Z_]*\})/.test(source)) {
      fautes.push(`${chemin} : classe composée à l'exécution, que Tailwind ne produit pas`);
    }
  }
  return [
    ...fautes,
    ...listesDeClasses(chemin, source).flatMap((liste) => fautesDeListe(chemin, liste, contexte)),
  ];
}

/** Classes écrites dans un fichier analysé, sans doublon. */
export function classesDe(chemin: string, source: string): string[] {
  const classes = listesDeClasses(chemin, source).flatMap((liste) => liste.split(/\s+/));
  return [...new Set(classes.filter((classe) => classe !== ""))];
}

/**
 * F-004-AC50 : classes que la construction de production ne doit pas porter. Ce sont les classes
 * nommées que la feuille de démonstration déclare, et les classes utilitaires que ses fichiers
 * analysés emploient sans qu'un fichier analysé de la feuille d'entrée les emploie aussi.
 */
export function classesDeLaSeuleDemonstration(
  demonstration: string,
  analysesDeLaPage: ReadonlyMap<string, string>,
  analysesDeLApplication: ReadonlyMap<string, string>,
): string[] {
  const declarees = [...sansCommentaires(demonstration).matchAll(/@utility\s+([\w-]+)/g)].map(
    ([, nom = ""]) => nom,
  );
  const application = new Set(
    [...analysesDeLApplication].flatMap(([chemin, source]) => classesDe(chemin, source)),
  );
  const page = [...analysesDeLaPage].flatMap(([chemin, source]) => classesDe(chemin, source));
  return [...new Set([...declarees, ...page.filter((classe) => !application.has(classe))])].sort();
}

/** Classes de la liste dont une feuille construite porte le sélecteur. */
export function classesPortees(feuille: string, classes: readonly string[]): string[] {
  return classes.filter((classe) => {
    const selecteur = `.${classe.replace(/[^\w-]/g, "\\$&")}`;
    return new RegExp(`${selecteur.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w\\\\-])`).test(
      feuille,
    );
  });
}

// ── Feuille d'entrée et gabarits ─────────────────────────────────────────────────────────────────

function normaliser(chemin: string): string {
  const segments: string[] = [];
  for (const segment of chemin.split("/")) {
    if (segment === "..") {
      segments.pop();
    } else if (segment !== "." && segment !== "") {
      segments.push(segment);
    }
  }
  return segments.join("/");
}

function motifDe(chemin: string): RegExp {
  const echappe = chemin.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${echappe.replace(/\*\*\//g, "(?:.*/)?").replace(/\*/g, "[^/]*")}$`);
}

/** Chemins, depuis `apps/web`, que désignent les directives `@source` d'une feuille. */
export function sourcesDe(texte: string, feuille: string = FEUILLE_D_ENTREE): string[] {
  const dossier = feuille.slice(0, feuille.lastIndexOf("/"));
  return [...sansCommentaires(texte).matchAll(/@source\s+"([^"]+)"/g)].map(([, chemin = ""]) =>
    chemin.startsWith("/") ? chemin : normaliser(`${dossier}/${chemin}`),
  );
}

/** Fichiers du disque que Tailwind analyse pour une feuille. */
export function fichiersAnalyses(
  texte: string,
  disque: readonly string[],
  feuille: string = FEUILLE_D_ENTREE,
): string[] {
  const motifs = sourcesDe(texte, feuille).map(motifDe);
  return disque.filter((chemin) => motifs.some((motif) => motif.test(chemin)));
}

const DANS_LES_SOURCES = /^(?:src\/|[\w-]+\.html$)/;
const DE_LA_DEMONSTRATION = /^(?:src\/demonstration\/|demo\.html$)/;

/** Vrai pour un fichier de la page de démonstration : son code, sa feuille, son gabarit. */
export function estDeLaDemonstration(chemin: string): boolean {
  return DE_LA_DEMONSTRATION.test(chemin);
}

interface Designation {
  readonly feuille: string;
  readonly texte: string;
  readonly disque: readonly string[];
  readonly controles: readonly string[];
}

/** Fautes des `@source` d'une feuille : bornés aux sources, désignant des fichiers contrôlés. */
function fautesDeSources({ feuille, texte, disque, controles }: Designation): string[] {
  const fautes: string[] = [];
  for (const source of sourcesDe(texte, feuille)) {
    if (!DANS_LES_SOURCES.test(source) || source.includes("node_modules")) {
      fautes.push(`${feuille} : @source hors des sources d'apps/web : « ${source} »`);
    } else if (!disque.some((chemin) => motifDe(source).test(chemin))) {
      fautes.push(`${feuille} : @source qui ne désigne aucun fichier : « ${source} »`);
    }
  }
  const suivis = new Set(controles);
  return [
    ...fautes,
    ...fichiersAnalyses(texte, disque, feuille)
      .filter((chemin) => !suivis.has(chemin))
      .map((chemin) => `${chemin} : analysé par Tailwind sans être contrôlé`),
  ];
}

/** F-004-AC23, feuille d'entrée : analyse bornée, rien de la page de démonstration, aucun fichier
 * analysé hors du contrôle. */
export function controlerSources(
  entree: string,
  disque: readonly string[],
  controles: readonly string[],
): string[] {
  const texte = sansCommentaires(entree);
  const fautes: string[] = [];
  if (!/@import\s+"tailwindcss"\s+source\(none\)\s*;/.test(texte)) {
    fautes.push(`${FEUILLE_D_ENTREE} : « @import "tailwindcss" source(none); » attendu`);
  }
  if (!/@import\s+"\.\/jetons\.css"\s*;/.test(texte)) {
    fautes.push(`${FEUILLE_D_ENTREE} : le fichier des jetons n'est pas importé`);
  }
  for (const source of sourcesDe(entree).filter((chemin) => DE_LA_DEMONSTRATION.test(chemin))) {
    fautes.push(
      `${FEUILLE_D_ENTREE} : @source vers la page de démonstration, que la production n'embarque pas : « ${source} »`,
    );
  }
  return [
    ...fautes,
    ...fautesDeSources({ feuille: FEUILLE_D_ENTREE, texte: entree, disque, controles }),
  ];
}

const IMPORT_CSS = /@import\s+(?:url\(\s*)?"([^"]+)"/g;
const IMPORT_DE_LA_FEUILLE_D_ENTREE = "../styles/entree.css";

/** F-004-AC23, feuille de démonstration : elle importe la feuille d'entrée et rien d'autre (ni
 * Tailwind ni les jetons), ne déclare aucun jeton, et ses `@source` sont bornés et contrôlés. */
export function controlerFeuilleDeDemonstration(
  texte: string,
  disque: readonly string[],
  controles: readonly string[],
): string[] {
  const feuille = FEUILLE_DE_DEMONSTRATION;
  const sansCommentaire = sansCommentaires(texte);
  const imports = [...sansCommentaire.matchAll(IMPORT_CSS)].map(([, chemin = ""]) => chemin);
  const fautes = imports
    .filter((chemin) => chemin !== IMPORT_DE_LA_FEUILLE_D_ENTREE)
    .map((chemin) => `${feuille} : import autre que la feuille d'entrée : « ${chemin} »`);
  if (!imports.includes(IMPORT_DE_LA_FEUILLE_D_ENTREE)) {
    fautes.push(`${feuille} : la feuille d'entrée n'est pas importée`);
  }
  const jeton = /@theme\b|(?:^|[{;\s])(--[\w-]+)\s*:/.exec(sansCommentaire);
  if (jeton !== null) {
    fautes.push(
      `${feuille} : jeton déclaré hors du fichier des jetons : « ${jeton[1] ?? "@theme"} »`,
    );
  }
  return [...fautes, ...fautesDeSources({ feuille, texte, disque, controles })];
}

const FEUILLES_ADMISES = [FEUILLE_DE_DEMONSTRATION, FEUILLE_D_ENTREE, FICHIER_DES_JETONS];
const IMPORT_RESERVE = /@import\s+(?:url\(\s*)?"(tailwindcss[^"]*|[^"]*jetons\.css)"/;
const NOM_DE_LA_FEUILLE_DE_DEMONSTRATION = /demonstration\.css/;

const IMPORT_PAR_SON_ENTREE = /^import "\.\/demonstration\.css";$/m;
const SEUL_IMPORTATEUR = "la feuille de démonstration n'est importée que par son entrée";

function fautesDeFeuille(chemin: string, texte: string): string[] {
  const fautes: string[] = [];
  if (!FEUILLES_ADMISES.includes(chemin)) {
    fautes.push(`${chemin} : feuille CSS hors des trois admises`);
  }
  const reserve = IMPORT_RESERVE.exec(texte)?.[1];
  if (reserve !== undefined && chemin !== FEUILLE_D_ENTREE) {
    fautes.push(`${chemin} : import réservé à la feuille d'entrée : « ${reserve} »`);
  }
  if (chemin !== FEUILLE_DE_DEMONSTRATION && NOM_DE_LA_FEUILLE_DE_DEMONSTRATION.test(texte)) {
    fautes.push(`${chemin} : ${SEUL_IMPORTATEUR}`);
  }
  return fautes;
}

function fautesDImportateur(chemin: string, texte: string): string[] {
  return chemin !== ENTREE_DE_LA_DEMONSTRATION && NOM_DE_LA_FEUILLE_DE_DEMONSTRATION.test(texte)
    ? [`${chemin} : ${SEUL_IMPORTATEUR}`]
    : [];
}

/**
 * F-004-AC23, AC50 : les feuilles CSS d'`apps/web`, énumérées depuis le disque. Trois seulement ;
 * Tailwind et les jetons ne sont importés que par la feuille d'entrée ; la feuille de
 * démonstration n'est citée que par l'entrée de la démonstration, qui l'importe.
 */
export function controlerFeuilles(fichiers: ReadonlyMap<string, string>): string[] {
  const fautes = [...fichiers].flatMap(([chemin, texte]) =>
    chemin.endsWith(".css")
      ? fautesDeFeuille(chemin, sansCommentaires(texte))
      : fautesDImportateur(chemin, texte),
  );
  if (!IMPORT_PAR_SON_ENTREE.test(fichiers.get(ENTREE_DE_LA_DEMONSTRATION) ?? "")) {
    fautes.push(`${ENTREE_DE_LA_DEMONSTRATION} : la feuille de démonstration n'est pas importée`);
  }
  return fautes;
}

const PIXELS_PAR_REM = 16;
const CONTOUR_MIN_PX = 2;

function enPixels(valeur: string | undefined): number {
  const [, nombre = "0", unite = ""] = /^([\d.]+)(px|rem)$/.exec(valeur ?? "") ?? [];
  return Number(nombre) * (unite === "rem" ? PIXELS_PAR_REM : 1);
}

/** F-004-AC6, AC10 : thème sombre sur la racine, contour de focus global d'au moins 2 pixels. */
export function controlerBase(entree: string, jetons: string): string[] {
  const texte = sansCommentaires(entree);
  const fautes: string[] = [];
  if (!/:root\s*\{[^}]*color-scheme\s*:\s*dark\s*;/.test(texte)) {
    fautes.push(`${FEUILLE_D_ENTREE} : « color-scheme: dark » manque sur :root`);
  }
  const contour = /(?:^|[\s}]):focus-visible\s*\{([^}]*)\}/.exec(texte)?.[1];
  const trace =
    /outline\s*:\s*var\(\s*(--[\w-]+)\s*\)\s+solid\s+var\(\s*--color-repere-focus\s*\)/.exec(
      contour ?? "",
    );
  if (trace === null) {
    fautes.push(
      `${FEUILLE_D_ENTREE} : règle globale :focus-visible sans contour au jeton --color-repere-focus`,
    );
    return fautes;
  }
  const epaisseur = lireJetons(jetons).theme.find(({ nom }) => nom === trace[1])?.valeur;
  if (enPixels(epaisseur) < CONTOUR_MIN_PX) {
    fautes.push(
      `${trace[1]} : contour de focus de « ${epaisseur} », moins de ${CONTOUR_MIN_PX} pixels`,
    );
  }
  return fautes;
}

/** F-004-AC6 : la couleur de thème du gabarit est celle du jeton de fond de l'application. */
export function controlerCouleurDeTheme(chemin: string, gabarit: string, jetons: string): string[] {
  const { theme } = lireJetons(jetons);
  const primitif = /var\(\s*(--[\w-]+)\s*\)/.exec(
    theme.find(({ nom }) => nom === FOND)?.valeur ?? "",
  )?.[1];
  const fond = theme.find(({ nom }) => nom === primitif)?.valeur;
  const lue = COULEUR_DE_THEME.exec(gabarit)?.[1];
  return lue === fond && fond !== undefined
    ? []
    : [`${chemin} : theme-color « ${lue} », le fond de l'application vaut « ${fond} »`];
}

// ── Emplacements fermés : dégradé d'accent, halo, texte d'échec, classes en dur, animations ──────

// Une feuille consomme le jeton, qu'elle y déclare ou non la classe nommée ; tout autre fichier
// consomme le jeton ou cette classe.
const JETON_DE_L_ACCENT = /--degrade-accent(?![\w-])/g;
const JETON_OU_CLASSE_DE_L_ACCENT = /--degrade-accent(?![\w-])|(?<![\w-])fond-accent(?![\w-])/g;

function emploisDeLAccent(chemin: string, texte: string): number {
  const motif = extensionDe(chemin) === "css" ? JETON_DE_L_ACCENT : JETON_OU_CLASSE_DE_L_ACCENT;
  return texte.match(motif)?.length ?? 0;
}

/**
 * F-004-AC47 : fichiers admis à consommer le dégradé d'accent, liste fermée. La feuille d'entrée le
 * lit une fois, pour en faire la classe nommée ; le repère de page courante et le sceau de l'espace
 * emploient cette classe, une fois chacun. Une case cochée s'y inscrira avec sa feature.
 */
export const EMPLACEMENTS_DE_L_ACCENT: readonly string[] = [
  "src/interface/composants/barre.classes.ts",
  "src/interface/composants/rangee.classes.ts",
  FEUILLE_D_ENTREE,
];

/** F-004-AC47 : tout consommateur hors de la liste est nommé, comme un second emploi ou un absent. */
export function controlerConsommateursDeLAccent(
  fichiers: ReadonlyMap<string, string>,
  admis: readonly string[] = EMPLACEMENTS_DE_L_ACCENT,
): string[] {
  const emplois = new Map(
    [...fichiers]
      .filter(([chemin]) => chemin !== FICHIER_DES_JETONS)
      .map(([chemin, texte]) => [chemin, emploisDeLAccent(chemin, texte)] as const),
  );
  return [
    ...[...emplois]
      .filter(([chemin, nombre]) => nombre > 0 && !admis.includes(chemin))
      .map(([chemin]) => `${chemin} : consomme le dégradé d'accent hors de la liste fermée`),
    ...admis
      .filter((chemin) => (emplois.get(chemin) ?? 0) !== 1)
      .map(
        (chemin) =>
          `${chemin} : ${emplois.get(chemin) ?? 0} emplois du dégradé d'accent, un seul attendu`,
      ),
  ];
}

const UTILITAIRE_DU_HALO = /@utility fond-halo \{\s*background-image: var\(--degrade-halo\);\s*\}/;
const CLASSES_DU_HALO = /\bhalo: "([^"]*)"/;

/** F-004-AC48 : le halo est une classe nommée au jeton, immobile, qui ne reçoit aucun pointeur. */
export function controlerHalo(entree: string, classesDesEtats: string): string[] {
  const fautes: string[] = [];
  if (!UTILITAIRE_DU_HALO.test(sansCommentaires(entree))) {
    fautes.push(
      `${FEUILLE_D_ENTREE} : la classe fond-halo ne peint pas le seul jeton --degrade-halo`,
    );
  }
  const classes = (CLASSES_DU_HALO.exec(classesDesEtats)?.[1] ?? "").split(/\s+/);
  for (const attendue of ["fond-halo", "pointer-events-none", "absolute"]) {
    if (!classes.includes(attendue)) {
      fautes.push(`halo : la classe « ${attendue} » manque`);
    }
  }
  const mouvement = classes.find((classe) =>
    /^(?:animate-|transition|apparition|depliage)/.test(classe),
  );
  if (mouvement !== undefined) {
    fautes.push(`halo : il doit rester immobile, « ${mouvement} » l'anime`);
  }
  return fautes;
}

/** F-004-AC40 : fichiers qui écrivent le texte donné, hors de celui qui en a la charge. */
export function controlerSeulAuteur(
  fichiers: ReadonlyMap<string, string>,
  texte: string,
  auteur: string,
): string[] {
  const auteurs = [...fichiers].filter(([, source]) => source.includes(texte)).map(([un]) => un);
  return [
    ...auteurs
      .filter((chemin) => chemin !== auteur)
      .map((chemin) => `${chemin} : écrit « ${texte} », que seul ${auteur} doit écrire`),
    ...(auteurs.includes(auteur) ? [] : [`${auteur} : n'écrit plus « ${texte} »`]),
  ];
}

const CLASSE_EN_DUR = /className=\{?["'`]/;

/** F-004-AC3 : composants qui écrivent une classe en dur, hors des fichiers que Tailwind analyse. */
export function controlerClassesEnDur(fichiers: ReadonlyMap<string, string>): string[] {
  return [...fichiers]
    .filter(([chemin, texte]) => /\.tsx$/.test(chemin) && CLASSE_EN_DUR.test(texte))
    .map(([chemin]) => `${chemin} : classe écrite en dur dans un composant`);
}

/** F-004-AC14 : chaque animation de base est une classe nommée, déclarée une seule fois. */
export function controlerAnimationsDeBase(entree: string, noms: readonly string[]): string[] {
  const texte = sansCommentaires(entree);
  return noms.flatMap((nom) => {
    const declarations = texte.match(new RegExp(`@utility ${nom} \\{`, "g"))?.length ?? 0;
    return declarations === 1
      ? []
      : [`${FEUILLE_D_ENTREE} : la classe ${nom} est déclarée ${declarations} fois, une attendue`];
  });
}
