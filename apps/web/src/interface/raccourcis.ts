// Déclaration des raccourcis (F-004-AC31) : la liste unique des combinaisons de touches, chacune
// sous le nom de son action. Aucun composant n'écrit un nom de touche : il lit cette déclaration.
// La portée d'une combinaison est celle de l'élément qui l'écoute (F2 : la rangée de la barre
// latérale qui a le focus) ; F-024 en fera son registre, portées comprises.

export interface Combinaison {
  /** Valeur de `KeyboardEvent.key`. */
  readonly touche: string;
  /** « Mod » vaut ⌘ sur les appareils d'Apple, Ctrl ailleurs. */
  readonly modificateurs: readonly ("Mod" | "Alt" | "Maj")[];
}

export const RACCOURCIS = {
  renommer: { touche: "F2", modificateurs: [] },
  /** Depuis la zone de saisie, mène à la barre de blocs quand elle est affichée (F-003-AC42). */
  barreDeBlocs: { touche: "F10", modificateurs: ["Alt"] },
  /**
   * Depuis la zone de saisie, ouvre le panneau de lien sur une sélection ou dans un lien ; laissé à
   * la palette de commandes de F-024 sur une sélection vide hors d'un lien (F-028-AC6, H12).
   */
  lien: { touche: "k", modificateurs: ["Mod"] },
  // Rangée de la barre latérale qui a le focus : les quatre commandes de déplacement d'une page
  // (F-006-AC10, H5). Une rangée n'est pas une zone de texte : aucun conflit.
  monterLaPage: { touche: "ArrowUp", modificateurs: ["Alt", "Maj"] },
  descendreLaPage: { touche: "ArrowDown", modificateurs: ["Alt", "Maj"] },
  mettreSousLaPagePrecedente: { touche: "ArrowRight", modificateurs: ["Alt", "Maj"] },
  sortirDUnNiveau: { touche: "ArrowLeft", modificateurs: ["Alt", "Maj"] },
  /**
   * Zone de saisie de l'éditeur : déplace le bloc du curseur (F-006-AC18). Sous macOS, ces deux
   * combinaisons étendent la sélection par paragraphe ; l'éditeur les prend (H5, conflit déclaré).
   */
  monterLeBloc: { touche: "ArrowUp", modificateurs: ["Alt", "Maj"] },
  descendreLeBloc: { touche: "ArrowDown", modificateurs: ["Alt", "Maj"] },
  /**
   * Cellule courante de la grille d'une table, hors mode édition : la ligne monte ou descend d'une
   * place (F-018-AC24, convention de F-006 H5). Une cellule n'est pas une zone de texte : aucun
   * conflit.
   */
  monterLaLigne: { touche: "ArrowUp", modificateurs: ["Alt", "Maj"] },
  descendreLaLigne: { touche: "ArrowDown", modificateurs: ["Alt", "Maj"] },
} as const satisfies Readonly<Record<string, Combinaison>>;

/**
 * Carte du kanban qui a le focus (F-020-AC13, AC15) : les quatre commandes de déplacement, sur le
 * modèle de F-006 H5, et l'ouverture du menu des actions. Une carte n'est pas une zone de texte :
 * le conflit de macOS décrit par F-006 H5 ne s'y pose pas.
 */
export const TOUCHES_DE_LA_CARTE = {
  pilePrecedente: { touche: "ArrowLeft", modificateurs: ["Alt", "Maj"] },
  pileSuivante: { touche: "ArrowRight", modificateurs: ["Alt", "Maj"] },
  monter: { touche: "ArrowUp", modificateurs: ["Alt", "Maj"] },
  descendre: { touche: "ArrowDown", modificateurs: ["Alt", "Maj"] },
  menu: { touche: "ContextMenu", modificateurs: [] },
  menuAutrement: { touche: "F10", modificateurs: ["Maj"] },
  /** Le focus se déplace, sans rien écrire (F-020-AC15). */
  haut: { touche: "ArrowUp", modificateurs: [] },
  bas: { touche: "ArrowDown", modificateurs: [] },
  gauche: { touche: "ArrowLeft", modificateurs: [] },
  droite: { touche: "ArrowRight", modificateurs: [] },
  debut: { touche: "Home", modificateurs: [] },
  fin: { touche: "End", modificateurs: [] },
  /** La saisie du titre (F-020-AC7). */
  titre: { touche: "Enter", modificateurs: [] },
  titreAutrement: { touche: "F2", modificateurs: [] },
} as const satisfies Readonly<Record<string, Combinaison>>;

/**
 * Grille d'une table, hors mode édition (F-018-AC33) : les touches qui déplacent la cellule
 * courante, chacune sous le nom de son déplacement. Mod+Début et Mod+Fin vont aux coins.
 */
export const TOUCHES_DE_LA_GRILLE = {
  haut: { touche: "ArrowUp", modificateurs: [] },
  bas: { touche: "ArrowDown", modificateurs: [] },
  gauche: { touche: "ArrowLeft", modificateurs: [] },
  droite: { touche: "ArrowRight", modificateurs: [] },
  debutDeLigne: { touche: "Home", modificateurs: [] },
  finDeLigne: { touche: "End", modificateurs: [] },
  premiereCellule: { touche: "Home", modificateurs: ["Mod"] },
  derniereCellule: { touche: "End", modificateurs: ["Mod"] },
  pagePrecedente: { touche: "PageUp", modificateurs: [] },
  pageSuivante: { touche: "PageDown", modificateurs: [] },
} as const satisfies Readonly<Record<string, Combinaison>>;

/**
 * Cellule courante de la grille, hors mode édition (F-018-AC29, AC33) : Entrée ou F2 entrent en
 * mode édition (ou ouvrent le menu d'un en-tête), Suppr ou Retour arrière vident, Espace coche.
 */
export const TOUCHES_DE_LA_CELLULE = {
  editer: { touche: "Enter", modificateurs: [] },
  editerAutrement: { touche: "F2", modificateurs: [] },
  vider: { touche: "Delete", modificateurs: [] },
  viderAutrement: { touche: "Backspace", modificateurs: [] },
  basculer: { touche: " ", modificateurs: [] },
} as const satisfies Readonly<Record<string, Combinaison>>;

/**
 * Mode édition d'une cellule (F-018-AC32, AC33) : Entrée valide et descend, Tab et Maj+Tab valident
 * et passent à la cellule suivante ou précédente, Échap abandonne. Les flèches parcourent une liste
 * de choix ; dans le séparateur de largeur, Flèche gauche et droite règlent (AC43).
 */
export const TOUCHES_DE_L_EDITION = {
  validerEtDescendre: { touche: "Enter", modificateurs: [] },
  validerEtSuivante: { touche: "Tab", modificateurs: [] },
  validerEtPrecedente: { touche: "Tab", modificateurs: ["Maj"] },
  abandonner: { touche: "Escape", modificateurs: [] },
  choixPrecedent: { touche: "ArrowUp", modificateurs: [] },
  choixSuivant: { touche: "ArrowDown", modificateurs: [] },
  retrecir: { touche: "ArrowLeft", modificateurs: [] },
  elargir: { touche: "ArrowRight", modificateurs: [] },
} as const satisfies Readonly<Record<string, Combinaison>>;

/**
 * Touches du geste de glisser-déposer au clavier dans la barre latérale (F-006-AC36, H5), en valeurs
 * de la propriété `code` des événements clavier, que la bibliothèque compare : Espace saisit et dépose, Échap abandonne.
 * Entrée reste au lien de la rangée.
 */
export const TOUCHES_DU_GLISSER = {
  saisir: ["Space"],
  deposer: ["Space"],
  abandonner: ["Escape"],
} as const;

// Touches d'une boîte de dialogue et d'un formulaire des écrans des espaces (F-014-AC35, AC36) : ce
// ne sont pas des raccourcis affichés, mais elles sont déclarées ici, seule source des noms de
// touche : Échap ferme ou abandonne, Tab et Maj+Tab bouclent dans la boîte.
export const TOUCHES_DE_BOITE = {
  fermer: { touche: "Escape", modificateurs: [] },
  suivant: { touche: "Tab", modificateurs: [] },
  precedent: { touche: "Tab", modificateurs: ["Maj"] },
} as const satisfies Readonly<Record<string, Combinaison>>;

/**
 * Entrée du calendrier d'une table qui a le focus, hors saisie de son titre (F-021-AC10, AC11, H5) :
 * une entrée n'est pas une zone de texte, Alt+Maj+Flèche ne s'y confond avec aucune saisie
 * (convention de F-006 H5 et de F-018-AC24).
 */
export const TOUCHES_DE_L_ENTREE = {
  jourPrecedent: { touche: "ArrowLeft", modificateurs: ["Alt", "Maj"] },
  jourSuivant: { touche: "ArrowRight", modificateurs: ["Alt", "Maj"] },
  semainePrecedente: { touche: "ArrowUp", modificateurs: ["Alt", "Maj"] },
  semaineSuivante: { touche: "ArrowDown", modificateurs: ["Alt", "Maj"] },
  entreePrecedente: { touche: "ArrowUp", modificateurs: [] },
  entreeSuivante: { touche: "ArrowDown", modificateurs: [] },
  modifierLeTitre: { touche: "Enter", modificateurs: [] },
  modifierLeTitreAutrement: { touche: "F2", modificateurs: [] },
  rendreLeFocusALaCase: { touche: "Escape", modificateurs: [] },
  menu: { touche: "F10", modificateurs: ["Maj"] },
  menuAutrement: { touche: "ContextMenu", modificateurs: [] },
} as const satisfies Readonly<Record<string, Combinaison>>;

/** Case du calendrier d'une table qui a le focus (F-021-AC20). */
export const TOUCHES_DE_LA_CASE = {
  veille: { touche: "ArrowLeft", modificateurs: [] },
  lendemain: { touche: "ArrowRight", modificateurs: [] },
  semainePrecedente: { touche: "ArrowUp", modificateurs: [] },
  semaineSuivante: { touche: "ArrowDown", modificateurs: [] },
  lundi: { touche: "Home", modificateurs: [] },
  dimanche: { touche: "End", modificateurs: [] },
  moisPrecedent: { touche: "PageUp", modificateurs: [] },
  moisSuivant: { touche: "PageDown", modificateurs: [] },
  entrer: { touche: "Enter", modificateurs: [] },
  menu: { touche: "F10", modificateurs: ["Maj"] },
  menuAutrement: { touche: "ContextMenu", modificateurs: [] },
} as const satisfies Readonly<Record<string, Combinaison>>;

const PLATEFORME_D_APPLE = /^(Mac|iPhone|iPad|iPod)/;
const MODIFICATEUR_D_APPLE = { Mod: "⌘", Alt: "⌥", Maj: "⇧" } as const;
const MODIFICATEUR_COURANT = { Mod: "Ctrl", Alt: "Alt", Maj: "Maj" } as const;
const MODIFICATEUR_ARIA = { Mod: "Control", Alt: "Alt", Maj: "Shift" } as const;
const MODIFICATEUR_ARIA_D_APPLE = { ...MODIFICATEUR_ARIA, Mod: "Meta" } as const;
/** Une flèche s'affiche par son signe ; `aria-keyshortcuts` garde le nom de la touche. */
const TOUCHE_AFFICHEE: Readonly<Record<string, string>> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

function plateformeCourante(): string {
  return typeof navigator === "undefined" ? "" : navigator.platform;
}

/** Touches à afficher, une par élément `kbd`, selon la plateforme. */
export function afficherTouches(
  combinaison: Combinaison,
  plateforme: string = plateformeCourante(),
): readonly string[] {
  const noms = PLATEFORME_D_APPLE.test(plateforme) ? MODIFICATEUR_D_APPLE : MODIFICATEUR_COURANT;
  return [
    ...combinaison.modificateurs.map((modificateur) => noms[modificateur]),
    TOUCHE_AFFICHEE[combinaison.touche] ?? combinaison.touche,
  ];
}

/** Valeur d'`aria-keyshortcuts` : la combinaison est exposée sans entrer dans le nom accessible. */
export function cleAria(
  combinaison: Combinaison,
  plateforme: string = plateformeCourante(),
): string {
  const noms = PLATEFORME_D_APPLE.test(plateforme) ? MODIFICATEUR_ARIA_D_APPLE : MODIFICATEUR_ARIA;
  return [
    ...combinaison.modificateurs.map((modificateur) => noms[modificateur]),
    combinaison.touche,
  ].join("+");
}

interface Frappe {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

/**
 * Le caractère frappé seul, sans Mod ni Alt (Maj admis), ou `undefined` : sur une cellule texte ou
 * nombre, il entre en mode édition et remplace son contenu (F-018-AC33). Sur une case, Espace la
 * coche : la grille le lit avant.
 */
export function caractereSeul(frappe: Frappe): string | undefined {
  const seul = !frappe.ctrlKey && !frappe.metaKey && !frappe.altKey;
  return seul && [...frappe.key].length === 1 ? frappe.key : undefined;
}

/** Vrai si la frappe est exactement la combinaison déclarée. */
export function estLaFrappe(frappe: Frappe, combinaison: Combinaison): boolean {
  const voulus = new Set<string>(combinaison.modificateurs);
  return (
    frappe.key === combinaison.touche &&
    (frappe.ctrlKey || frappe.metaKey) === voulus.has("Mod") &&
    frappe.altKey === voulus.has("Alt") &&
    frappe.shiftKey === voulus.has("Maj")
  );
}
