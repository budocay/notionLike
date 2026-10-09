// Déclaration des raccourcis (F-004-AC31) : la liste unique des combinaisons de touches et de la
// portée de chacune. Aucun composant n'écrit un nom de touche : il lit cette déclaration. F-024 en
// fera son registre.

export interface Raccourci {
  /** Valeur de `KeyboardEvent.key`. */
  readonly touche: string;
  /** « Mod » vaut ⌘ sur les appareils d'Apple, Ctrl ailleurs. */
  readonly modificateurs: readonly ("Mod" | "Alt" | "Maj")[];
  /** Où la combinaison agit : ici, quand une rangée de la barre latérale a le focus. */
  readonly portee: "rangee";
}

export const RACCOURCIS = {
  renommer: { touche: "F2", modificateurs: [], portee: "rangee" },
} as const satisfies Readonly<Record<string, Raccourci>>;

const PLATEFORME_D_APPLE = /^(Mac|iPhone|iPad|iPod)/;
const MODIFICATEUR_D_APPLE = { Mod: "⌘", Alt: "⌥", Maj: "⇧" } as const;
const MODIFICATEUR_COURANT = { Mod: "Ctrl", Alt: "Alt", Maj: "Maj" } as const;
const MODIFICATEUR_ARIA = { Mod: "Control", Alt: "Alt", Maj: "Shift" } as const;
const MODIFICATEUR_ARIA_D_APPLE = { ...MODIFICATEUR_ARIA, Mod: "Meta" } as const;

function plateformeCourante(): string {
  return typeof navigator === "undefined" ? "" : navigator.platform;
}

/** Touches à afficher, une par élément `kbd`, selon la plateforme. */
export function afficherTouches(
  raccourci: Raccourci,
  plateforme: string = plateformeCourante(),
): readonly string[] {
  const noms = PLATEFORME_D_APPLE.test(plateforme) ? MODIFICATEUR_D_APPLE : MODIFICATEUR_COURANT;
  return [...raccourci.modificateurs.map((modificateur) => noms[modificateur]), raccourci.touche];
}

/** Valeur d'`aria-keyshortcuts` : la combinaison est exposée sans entrer dans le nom accessible. */
export function cleAria(raccourci: Raccourci, plateforme: string = plateformeCourante()): string {
  const noms = PLATEFORME_D_APPLE.test(plateforme) ? MODIFICATEUR_ARIA_D_APPLE : MODIFICATEUR_ARIA;
  return [
    ...raccourci.modificateurs.map((modificateur) => noms[modificateur]),
    raccourci.touche,
  ].join("+");
}

interface Frappe {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

/** Vrai si la frappe est exactement la combinaison déclarée. */
export function estLaFrappe(frappe: Frappe, raccourci: Raccourci): boolean {
  const voulus = new Set<string>(raccourci.modificateurs);
  return (
    frappe.key === raccourci.touche &&
    (frappe.ctrlKey || frappe.metaKey) === voulus.has("Mod") &&
    frappe.altKey === voulus.has("Alt") &&
    frappe.shiftKey === voulus.has("Maj")
  );
}
