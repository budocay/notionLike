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
} as const satisfies Readonly<Record<string, Combinaison>>;

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
  combinaison: Combinaison,
  plateforme: string = plateformeCourante(),
): readonly string[] {
  const noms = PLATEFORME_D_APPLE.test(plateforme) ? MODIFICATEUR_D_APPLE : MODIFICATEUR_COURANT;
  return [
    ...combinaison.modificateurs.map((modificateur) => noms[modificateur]),
    combinaison.touche,
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
