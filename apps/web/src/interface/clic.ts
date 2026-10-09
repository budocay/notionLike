// Clics : seul module, avec la déclaration des raccourcis pour les frappes, qui lit le bouton et
// les modificateurs d'un événement. Il ne connaît que la souris : aucune touche n'y est lue.

interface Bouton {
  readonly button: number;
}

interface Clic extends Bouton {
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

const BOUTON_PRINCIPAL = 0;

/** Vrai pour le bouton principal ; le bouton du milieu et le clic droit gardent leur effet. */
export function estLeBoutonPrincipal(clic: Bouton): boolean {
  return clic.button === BOUTON_PRINCIPAL;
}

/**
 * Vrai pour un clic qui suit un lien sur place : bouton principal, sans modificateur. Avec Ctrl, ⌘,
 * Maj ou Alt, le navigateur ouvre le lien ailleurs ou l'enregistre, et l'écran courant ne change pas.
 */
export function estUnClicSimple(clic: Clic): boolean {
  return (
    estLeBoutonPrincipal(clic) && !clic.ctrlKey && !clic.metaKey && !clic.altKey && !clic.shiftKey
  );
}
