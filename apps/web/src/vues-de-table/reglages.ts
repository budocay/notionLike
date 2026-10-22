// Sections des réglages de vue de cette feature (F-018-AC40 à AC44, ADR-0019) : `vue` (la vue active)
// et `tableau` (la largeur des colonnes). L'enveloppe est au module de persistance ; ici, le contenu
// de chaque section est validé, une section mal formée est lue seule à ses valeurs par défaut, une
// section égale à ses valeurs par défaut n'est pas écrite, et un changement ne réécrit que sa
// section, en gardant les clés que cette version ne connaît pas (H4).
import type { IdColonne } from "@notionlike/document";

export const SECTION_VUE = "vue";
export const SECTION_TABLEAU = "tableau";

export const LARGEUR_PAR_DEFAUT = 180;
export const LARGEUR_MIN = 60;
export const LARGEUR_MAX = 800;
/** Pas d'une pression de Flèche gauche ou droite sur le séparateur (AC43). */
export const PAS_DE_LARGEUR = 16;

export interface ReglagesDeLaTable {
  /** Identifiant de la vue active, toujours l'une des vues livrées. */
  readonly vueActive: string;
  /** Largeurs réglées, par colonne ; une colonne absente a la largeur par défaut. */
  readonly largeurs: ReadonlyMap<IdColonne, number>;
}

function estUnObjet(valeur: unknown): valeur is Readonly<Record<string, unknown>> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

export function estUneLargeurAdmise(valeur: unknown): valeur is number {
  return (
    typeof valeur === "number" &&
    Number.isInteger(valeur) &&
    valeur >= LARGEUR_MIN &&
    valeur <= LARGEUR_MAX
  );
}

/** Une largeur entière bornée de 60 à 800 pixels. */
export function largeurBornee(valeur: number): number {
  return Math.min(LARGEUR_MAX, Math.max(LARGEUR_MIN, Math.round(valeur)));
}

function vueLue(section: unknown, vues: readonly string[], parDefaut: string): string {
  if (!estUnObjet(section)) {
    return parDefaut;
  }
  const { active } = section;
  return typeof active === "string" && vues.includes(active) ? active : parDefaut;
}

/** Les largeurs d'une section `tableau` lue ; aucune si elle est mal formée. */
export function largeursLues(section: unknown): ReadonlyMap<IdColonne, number> {
  if (!estUnObjet(section) || !estUnObjet(section.largeurs)) {
    return new Map();
  }
  const entrees = Object.entries(section.largeurs);
  return entrees.every(([, largeur]) => estUneLargeurAdmise(largeur))
    ? new Map(entrees as [IdColonne, number][])
    : new Map();
}

/**
 * Les réglages lus dans les sections ; chaque section mal formée vaut ses valeurs par défaut, et la
 * vue enregistrée absente de la liste des vues vaut la première (« Tableau », AC44).
 */
export function lireLesReglages(
  sections: Readonly<Record<string, unknown>>,
  vues: readonly string[],
): ReglagesDeLaTable {
  const parDefaut = vues[0] ?? "";
  return {
    vueActive: vueLue(sections[SECTION_VUE], vues, parDefaut),
    largeurs: largeursLues(sections[SECTION_TABLEAU]),
  };
}

export function largeurDe(reglages: ReglagesDeLaTable, colonne: IdColonne): number {
  return reglages.largeurs.get(colonne) ?? LARGEUR_PAR_DEFAUT;
}

/**
 * La section lue, une clé de cette version remplacée par `valeur` (`undefined` la retire) ; les clés
 * que cette version ne connaît pas sont gardées telles quelles (AC41, H4). `undefined` (section
 * retirée) quand il ne reste aucune clé.
 */
function remplacerDansLaSection(sectionLue: unknown, cle: string, valeur: unknown): unknown {
  const autres = estUnObjet(sectionLue)
    ? Object.entries(sectionLue).filter(([nom]) => nom !== cle)
    : [];
  const section = Object.fromEntries(valeur === undefined ? autres : [...autres, [cle, valeur]]);
  return Object.keys(section).length === 0 ? undefined : section;
}

/** La section `vue` à écrire ; la vue par défaut n'y est pas écrite (AC40). */
export function sectionDeLaVue(active: string, parDefaut: string, sectionLue: unknown): unknown {
  return remplacerDansLaSection(sectionLue, "active", active === parDefaut ? undefined : active);
}

/**
 * La section `tableau` à écrire : les largeurs des colonnes de la table lue qui s'écartent de la
 * largeur par défaut, celles des colonnes absentes retirées (AC43) ; aucune largeur n'est écrite si
 * aucune ne s'en écarte.
 */
export function sectionDuTableau(
  largeurs: ReadonlyMap<IdColonne, number>,
  colonnesLues: readonly IdColonne[],
  sectionLue: unknown,
): unknown {
  const presentes = new Set(colonnesLues);
  const gardees = [...largeurs].filter(
    ([colonne, largeur]) => presentes.has(colonne) && largeur !== LARGEUR_PAR_DEFAUT,
  );
  return remplacerDansLaSection(
    sectionLue,
    "largeurs",
    gardees.length === 0 ? undefined : Object.fromEntries(gardees),
  );
}
