// Contrôles statiques du fichier des jetons (F-004-AC1, AC2, AC4, AC5, AC7 à AC9, AC12, AC13, AC18,
// AC41, AC46, AC47 ; police à chasse fixe de F-005 H15). Chaque contrôle reçoit le texte d'un
// fichier des jetons et rend la liste des fautes, chacune nommant le jeton et la valeur en cause :
// une liste vide vaut conformité. Ils lisent les sources, jamais la feuille compilée, qui réécrit
// les valeurs (H7).
import {
  contraste,
  couleurDe,
  type Jeton,
  lireJetons,
  luminance,
  type Rvb,
  rvbDe,
} from "../src/styles/lecture-jetons.ts";

export const CATEGORIES: Readonly<Record<string, RegExp>> = {
  "couleur primitive": /^--primitif-/,
  "couleur sémantique": /^--color-(surface|texte|repere)-/,
  dégradé: /^--degrade-/,
  typographie: /^--(text|font|tracking)-/,
  espacement: /^--spacing-./,
  rayon: /^--radius-/,
  ombre: /^--shadow-/,
  durée: /^--duree-/,
  courbe: /^--ease-/,
};
const AUTRES_ESPACES_DE_NOMS = /^--(container|epaisseur|plan|breakpoint|animate)-/;

export const CONTRASTE_TEXTE = 4.5;
export const CONTRASTE_REPERE = 3;
const SATURATION_MIN = 0.08;
const ARC_MAX = 40;
const LUMINANCE_MAX_DU_FOND = 0.03;
const POINTS_DU_DEGRADE = 16;
const DUREE_MAX_MS = 300;
const PERIODE_MIN_MS = 1000;

const SURFACE = /^--color-surface-/;
const TEXTE = /^--color-texte-/;
const REPERE = /^--color-repere-/;
export const FOND = "--color-surface-application";
const DEGRADE_ACCENT = "--degrade-accent";

const NOMS_DE_COULEUR =
  "black|white|red|green|blue|yellow|orange|purple|pink|brown|gray|grey|silver|gold|navy|teal|aqua|cyan|magenta|lime|olive|maroon|fuchsia|indigo|violet|beige|ivory|coral|salmon|crimson|turquoise|tomato|orchid|plum|khaki|lavender|tan|chocolate|azure|snow|wheat|linen|peru|sienna";
/** Couleur littérale : hexadécimale, fonction de couleur ou couleur nommée (F-004-AC3). */
export const COULEUR_LITTERALE = new RegExp(
  String.raw`#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(|(?<![\w-])(?:${NOMS_DE_COULEUR})(?![\w-])`,
);
export const DUREE_LITTERALE = /(?<![\w.-])\d*\.?\d+m?s\b/;
export const COURBE_LITTERALE =
  /\b(?:cubic-bezier|steps)\(|\blinear\(|(?<![\w-])(?:ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end)(?![\w(-])/;

function sansRenvois(valeur: string): string {
  return valeur.replace(/var\(\s*--[\w-]+\s*\)/g, "");
}

function themeDe(source: string): readonly Jeton[] {
  return lireJetons(source).theme;
}

function nommes(jetons: readonly Jeton[], motif: RegExp): readonly Jeton[] {
  return jetons.filter(({ nom }) => motif.test(nom));
}

function fautesDeBloc(source: string): string[] {
  const { entetesDeTheme, theme } = lireJetons(source);
  const fautes: string[] = [];
  if (entetesDeTheme.length !== 1 || entetesDeTheme[0] !== "@theme static") {
    fautes.push(`un seul bloc « @theme static » attendu, lu : ${entetesDeTheme.join(" | ")}`);
  }
  const premiere = theme[0];
  if (premiere?.nom !== "--*" || premiere.valeur !== "initial") {
    fautes.push(
      `première déclaration du thème : « --*: initial; » attendue, lue : ${premiere?.nom}`,
    );
  }
  if (theme.some(({ nom }) => nom === "--spacing")) {
    fautes.push("--spacing : la base d'espacement est interdite, les espacements sont nommés");
  }
  return fautes;
}

function fautesDeNoms(theme: readonly Jeton[]): string[] {
  const jetons = theme.filter(({ nom }) => nom !== "--*");
  const fautes: string[] = [];
  const vus = new Set<string>();
  for (const { nom } of jetons) {
    if (vus.has(nom)) {
      fautes.push(`${nom} : déclaré deux fois`);
    }
    vus.add(nom);
    const connu =
      Object.values(CATEGORIES).some((motif) => motif.test(nom)) ||
      AUTRES_ESPACES_DE_NOMS.test(nom);
    if (!connu) {
      fautes.push(`${nom} : nom hors des catégories de jetons`);
    }
  }
  for (const [categorie, motif] of Object.entries(CATEGORIES)) {
    if (nommes(jetons, motif).length === 0) {
      fautes.push(`catégorie vide : ${categorie}`);
    }
  }
  return fautes;
}

function fautesDeRenvois(theme: readonly Jeton[]): string[] {
  const declares = new Set(theme.map(({ nom }) => nom));
  return theme.flatMap(({ nom, valeur }) =>
    renvoisDe(valeur)
      .filter((cible) => !declares.has(cible))
      .map((cible) => `${nom} : renvoie à ${cible}, qui n'est pas déclaré`),
  );
}

/** F-004-AC1, AC4 : bloc unique, thème vidé, catégories, noms uniques, renvois résolus. */
export function controlerStructure(source: string): string[] {
  const theme = themeDe(source);
  return [...fautesDeBloc(source), ...fautesDeNoms(theme), ...fautesDeRenvois(theme)];
}

/** F-004-AC2 : primitifs en hexadécimal opaque, sémantiques en renvoi à un primitif. */
export function controlerCouleurs(source: string): string[] {
  const theme = themeDe(source);
  const primitifs = nommes(theme, /^--primitif-/)
    .filter(({ valeur }) => !/^#[0-9a-f]{6}$/.test(valeur))
    .map(({ nom, valeur }) => `${nom} : « ${valeur} » n'est pas une couleur #rrggbb opaque`);
  const semantiques = nommes(theme, /^--color-/).flatMap(({ nom, valeur }) => {
    const fautes: string[] = [];
    if (!CATEGORIES["couleur sémantique"]?.test(nom)) {
      fautes.push(`${nom} : ni surface, ni texte, ni repère`);
    }
    if (!/^var\(\s*--primitif-[\w-]+\s*\)$/.test(valeur)) {
      fautes.push(`${nom} : « ${valeur} » n'est pas un renvoi à un jeton primitif`);
    }
    return fautes;
  });
  return [...primitifs, ...semantiques];
}

interface Couleur {
  readonly nom: string;
  readonly rvb: Rvb;
}

function couleursDe(theme: readonly Jeton[], motif: RegExp): Couleur[] {
  return nommes(theme, motif).flatMap(({ nom }) => {
    const valeur = couleurDe(theme, nom);
    return valeur === undefined ? [] : [{ nom, rvb: rvbDe(valeur) }];
  });
}

export interface Couple {
  readonly premier: string;
  readonly surface: string;
  readonly rapport: number;
}

/** Tous les couples d'une famille de jetons avec chaque surface, et leur contraste. */
export function couples(source: string, famille: "texte" | "repere"): Couple[] {
  const theme = themeDe(source);
  const surfaces = couleursDe(theme, SURFACE);
  return couleursDe(theme, famille === "texte" ? TEXTE : REPERE).flatMap((premier) =>
    surfaces.map((surface) => ({
      premier: premier.nom,
      surface: surface.nom,
      rapport: contraste(premier.rvb, surface.rvb),
    })),
  );
}

function fautesDeContraste(liste: readonly Couple[], seuil: number): string[] {
  return liste
    .filter(({ rapport }) => rapport < seuil)
    .map(
      ({ premier, surface, rapport }) =>
        `${premier} sur ${surface} : contraste ${rapport.toFixed(2)}, sous ${seuil}`,
    );
}

/** F-004-AC7, AC8, AC20 : chaque texte et chaque repère sur chaque surface. */
export function controlerContrastes(source: string): string[] {
  return [
    ...fautesDeContraste(couples(source, "texte"), CONTRASTE_TEXTE),
    ...fautesDeContraste(couples(source, "repere"), CONTRASTE_REPERE),
  ];
}

/** F-004-AC46 : surfaces teintées, teintes voisines, fond sombre. */
export function controlerTeinte(source: string): string[] {
  const theme = themeDe(source);
  const surfaces = couleursDe(theme, SURFACE);
  const fautes = surfaces
    .filter(({ rvb }) => teinteEtSaturation(rvb).saturation < SATURATION_MIN)
    .map(({ nom, rvb }) => {
      const pourcent = (teinteEtSaturation(rvb).saturation * 100).toFixed(1);
      return `${nom} : saturation de ${pourcent} %, un gris neutre ne sert pas de surface`;
    });
  const arc = arcDesTeintes(surfaces.map(({ rvb }) => teinteEtSaturation(rvb).teinte));
  if (arc > ARC_MAX) {
    fautes.push(`teintes des surfaces sur un arc de ${arc.toFixed(0)} degrés, plus de ${ARC_MAX}`);
  }
  const fond = surfaces.find(({ nom }) => nom === FOND);
  if (fond === undefined) {
    fautes.push(`${FOND} : jeton de fond de l'application absent`);
  } else if (luminance(fond.rvb) > LUMINANCE_MAX_DU_FOND) {
    fautes.push(`${FOND} : luminance de ${luminance(fond.rvb).toFixed(3)}, plus de 0,03`);
  }
  return fautes;
}

function fautesDeComposition(degrade: Jeton, attendu: RegExp, sorte: string): string[] {
  const fautes = renvoisDe(degrade.valeur)
    .filter((cible) => !attendu.test(cible))
    .map((cible) => `${degrade.nom} : ${cible} n'est pas un jeton de ${sorte}`);
  const reste = sansRenvois(degrade.valeur);
  if (COULEUR_LITTERALE.test(reste) || /\btransparent\b/.test(reste)) {
    fautes.push(`${degrade.nom} : couleur littérale ou transparence dans « ${degrade.valeur} »`);
  }
  if (renvoisDe(degrade.valeur).length < 2) {
    fautes.push(`${degrade.nom} : un dégradé demande au moins deux jetons de ${sorte}`);
  }
  return fautes;
}

function fautesDAccent(theme: readonly Jeton[], accent: Jeton): string[] {
  if (/%/.test(accent.valeur)) {
    return [`${accent.nom} : arrêts à position fixée, l'échantillonnage les suppose équidistants`];
  }
  const arrets = renvoisDe(accent.valeur).flatMap((cible) => {
    const valeur = couleurDe(theme, cible);
    return valeur === undefined ? [] : [rvbDe(valeur)];
  });
  const surfaces = couleursDe(theme, SURFACE);
  return echantillonner(arrets, POINTS_DU_DEGRADE).flatMap((point, rang) =>
    surfaces
      .filter((surface) => contraste(point, surface.rvb) < CONTRASTE_REPERE)
      .map(
        (surface) =>
          `${accent.nom}, point ${rang + 1} sur ${POINTS_DU_DEGRADE}, sur ${surface.nom} : ` +
          `contraste ${contraste(point, surface.rvb).toFixed(2)}, sous ${CONTRASTE_REPERE}`,
      ),
  );
}

/** F-004-AC9, AC47, AC48 : dégradés faits de surfaces ; un seul accent, fait de repères. */
export function controlerDegrades(source: string): string[] {
  const theme = themeDe(source);
  const degrades = nommes(theme, /^--degrade-/);
  const accents = degrades.filter(({ nom }) => nom.startsWith(DEGRADE_ACCENT));
  const fautes = degrades.flatMap((degrade) =>
    degrade.nom === DEGRADE_ACCENT
      ? fautesDeComposition(degrade, REPERE, "repère")
      : fautesDeComposition(degrade, SURFACE, "surface"),
  );
  const accent = accents[0];
  if (accents.length !== 1 || accent?.nom !== DEGRADE_ACCENT) {
    fautes.push(
      `un seul dégradé d'accent attendu, nommé ${DEGRADE_ACCENT} : ${accents.length} lus`,
    );
    return fautes;
  }
  return [...fautes, ...fautesDAccent(theme, accent)];
}

/** F-004-AC5, AC41 : tailles de texte, hauteurs de ligne et seuils de largeur en rem. */
export function controlerUnites(source: string): string[] {
  const enRem = /^\d*\.?\d+rem$/;
  return themeDe(source)
    .filter(({ nom }) => /^--text-[\w-]+?(--line-height)?$|^--breakpoint-/.test(nom))
    .filter(({ nom }) => !/--(letter-spacing|font-weight)$/.test(nom))
    .filter(({ valeur }) => !enRem.test(valeur))
    .map(({ nom, valeur }) => `${nom} : « ${valeur} » n'est pas exprimé en rem`);
}

function fautesDeDurees(durees: readonly Jeton[]): string[] {
  return durees.flatMap(({ nom, valeur }) => {
    const millisecondes = /^(\d+)ms$/.exec(valeur)?.[1];
    if (millisecondes === undefined) {
      return [`${nom} : « ${valeur} » n'est pas une durée en millisecondes entières`];
    }
    const boucle = nom.startsWith("--duree-boucle-");
    if (boucle && Number(millisecondes) < PERIODE_MIN_MS) {
      return [`${nom} : période de ${valeur}, sous ${PERIODE_MIN_MS} ms`];
    }
    if (!boucle && Number(millisecondes) > DUREE_MAX_MS) {
      return [`${nom} : durée de ${valeur}, plus de ${DUREE_MAX_MS} ms`];
    }
    return [];
  });
}

function fautesDAnimations(source: string): string[] {
  const { theme, imagesCles } = lireJetons(source);
  const noms = new Set(imagesCles.map(({ nom }) => nom));
  const animations = nommes(theme, /^--animate-/).flatMap(({ nom, valeur }) => {
    const fautes: string[] = [];
    const cibles = renvoisDe(valeur);
    const reste = sansRenvois(valeur);
    if (!cibles.some((cible) => cible.startsWith("--duree-"))) {
      fautes.push(`${nom} : aucune durée tirée d'un jeton --duree-*`);
    }
    if (!cibles.some((cible) => cible.startsWith("--ease-"))) {
      fautes.push(`${nom} : aucune courbe tirée d'un jeton --ease-*`);
    }
    if (DUREE_LITTERALE.test(reste) || COURBE_LITTERALE.test(reste)) {
      fautes.push(`${nom} : durée ou courbe littérale dans « ${valeur} »`);
    }
    if (!noms.has(reste.trim().split(/\s+/)[0] ?? "")) {
      fautes.push(`${nom} : images clés introuvables dans « ${valeur} »`);
    }
    return fautes;
  });
  const images = imagesCles.flatMap(({ nom, proprietes }) =>
    proprietes
      .filter((propriete) => propriete !== "opacity" && propriete !== "transform")
      .map((propriete) => `@keyframes ${nom} : anime ${propriete}, ni transform ni opacity`),
  );
  return [...animations, ...images];
}

function fautesDeMouvementReduit(source: string): string[] {
  const { theme, mouvementReduit } = lireJetons(source);
  const reduites = new Map(mouvementReduit.map(({ nom, valeur }) => [nom, valeur]));
  return nommes(theme, /^--duree-/)
    .filter(({ nom }) => reduites.get(nom) !== "0ms")
    .map(
      ({ nom }) =>
        `${nom} : non ramené à 0ms sur :root sous prefers-reduced-motion, après le bloc de thème`,
    );
}

/** F-004-AC11 (images clés), AC12, AC13 : durées, courbes, animations, mouvement réduit. */
export function controlerMouvement(source: string): string[] {
  return [
    ...fautesDeDurees(nommes(themeDe(source), /^--duree-/)),
    ...fautesDAnimations(source),
    ...fautesDeMouvementReduit(source),
  ];
}

const FAMILLE_GENERIQUE = /^(?:monospace|sans-serif|serif|system-ui)$/;

/**
 * F-004-AC18, F-005 H15 : une famille de polices (`--font-<nom>`, graisses mises à part) est une
 * liste de polices du système qui finit par une famille générique ; ni adresse, ni renvoi, ni
 * fonction : aucune police n'est chargée.
 */
export function controlerPolices(source: string): string[] {
  return nommes(themeDe(source), /^--font-(?!weight-)/).flatMap(({ nom, valeur }) => {
    const fautes: string[] = [];
    if (/\(/.test(valeur)) {
      fautes.push(`${nom} : « ${valeur} » porte une fonction, une police ne se charge pas`);
    }
    const derniere = valeur.split(",").at(-1)?.trim() ?? "";
    if (!FAMILLE_GENERIQUE.test(derniere)) {
      fautes.push(`${nom} : « ${valeur} » ne finit pas par une famille générique`);
    }
    return fautes;
  });
}

/** Tous les contrôles du fichier des jetons, dans l'ordre des critères. */
export function controlerJetons(source: string): string[] {
  return [
    ...controlerStructure(source),
    ...controlerCouleurs(source),
    ...controlerUnites(source),
    ...controlerPolices(source),
    ...controlerContrastes(source),
    ...controlerDegrades(source),
    ...controlerMouvement(source),
    ...controlerTeinte(source),
  ];
}

// ── Calculs que seuls ces contrôles emploient : renvois, teinte, saturation, dégradé ─────────────

const RENVOI = /var\(\s*(--[\w-]+)\s*\)/g;
const CANAL_MAX = 255;

function renvoisDe(valeur: string): string[] {
  return [...valeur.matchAll(RENVOI)].map(([, nom = ""]) => nom);
}

const TOUR = 360;
const SECTEUR = 60;
const SECTEUR_DU_VERT = 2;
const SECTEUR_DU_BLEU = 4;
const NOMBRE_DE_SECTEURS = 6;

function teinteDe([rouge, vert, bleu]: Rvb, max: number, ecart: number): number {
  if (ecart === 0) {
    return 0;
  }
  if (max === rouge) {
    return (((vert - bleu) / ecart + NOMBRE_DE_SECTEURS) % NOMBRE_DE_SECTEURS) * SECTEUR;
  }
  const secteur =
    max === vert
      ? (bleu - rouge) / ecart + SECTEUR_DU_VERT
      : (rouge - vert) / ecart + SECTEUR_DU_BLEU;
  return secteur * SECTEUR;
}

/** Teinte en degrés et saturation de 0 à 1, modèle TSL. */
function teinteEtSaturation(rvb: Rvb): {
  readonly teinte: number;
  readonly saturation: number;
} {
  const parts = rvb.map((canal) => canal / CANAL_MAX) as unknown as Rvb;
  const max = Math.max(...parts);
  const min = Math.min(...parts);
  const ecart = max - min;
  const clarte = (max + min) / 2;
  const saturation = ecart === 0 ? 0 : ecart / (1 - Math.abs(2 * clarte - 1));
  return { teinte: teinteDe(parts, max, ecart), saturation };
}

/** Plus petit arc, en degrés, qui contient toutes les teintes données. */
function arcDesTeintes(teintes: readonly number[]): number {
  if (teintes.length < 2) {
    return 0;
  }
  const triees = [...teintes].sort((a, b) => a - b);
  const ecarts = triees.map((teinte, rang) => {
    const suivante = triees[rang + 1] ?? (triees[0] ?? 0) + TOUR;
    return suivante - teinte;
  });
  return TOUR - Math.max(...ecarts);
}

/** Couleurs d'un dégradé linéaire à arrêts équidistants, interpolées canal par canal en sRGB. */
function echantillonner(arrets: readonly Rvb[], nombre: number): Rvb[] {
  const dernier = arrets.length - 1;
  return Array.from({ length: nombre }, (_, rang) => {
    const position = (rang / (nombre - 1)) * dernier;
    const debut = Math.min(Math.floor(position), Math.max(dernier - 1, 0));
    const part = position - debut;
    const de = arrets[debut] ?? [0, 0, 0];
    const vers = arrets[debut + 1] ?? de;
    return de.map(
      (canal, indice) => canal + ((vers[indice] ?? canal) - canal) * part,
    ) as unknown as Rvb;
  });
}
