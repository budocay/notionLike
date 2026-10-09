// Liste unique des captures de référence (F-004-AC51) : lue par les scénarios de capture et par
// `test/demonstration.test.tsx`. Le dossier est ignoré par git ; Playwright le vide au début de
// chaque lancement, même partiel.
export const DOSSIER_DES_CAPTURES = "test-results/captures";

export const LARGEURS_DE_CAPTURE = [360, 768, 1280] as const;
/** Largeurs de capture sous le seuil étroit : les seules où le tiroir existe. */
export const LARGEURS_ETROITES_DE_CAPTURE = [360, 768] as const;

export const HAUTEUR_DE_FENETRE = 800;

export interface CaptureAttendue {
  readonly ecran: string;
  readonly largeur: number;
}

export interface EcranACapturer {
  readonly ecran: string;
  readonly largeurs: readonly number[];
}

export const PAGE_DE_DEMONSTRATION = "demonstration";

/**
 * Écrans de référence de la spec, par leur lettre. La lettre (f), barre de blocs flottante, est
 * retirée de cette feature : elle est un écran de référence de F-003.
 */
export const ECRANS_DE_REFERENCE = {
  a: "a-accueil",
  b: "b-page",
  c: "c-arborescence",
  d: "d-menu",
  e: "e-renommage",
  g: "g-page-introuvable",
  h: "h-echec-de-persistance",
  i: "i-chargement",
  j: "j-tiroir",
} as const;

export type LettreDEcran = keyof typeof ECRANS_DE_REFERENCE;

/** Largeurs de capture qui reviennent à un écran : le tiroir (j) n'existe que sur écran étroit. */
export function largeursDe(lettre: string): readonly number[] {
  return lettre === "j" ? LARGEURS_ETROITES_DE_CAPTURE : LARGEURS_DE_CAPTURE;
}

/** Écrans capturés et largeurs de chacun : la page de démonstration, puis l'application. */
export const ECRANS_A_CAPTURER: readonly EcranACapturer[] = [
  { ecran: PAGE_DE_DEMONSTRATION, largeurs: LARGEURS_DE_CAPTURE },
  ...Object.entries(ECRANS_DE_REFERENCE).map(([lettre, ecran]) => ({
    ecran,
    largeurs: largeursDe(lettre),
  })),
];

export const CAPTURES_ATTENDUES: readonly CaptureAttendue[] = ECRANS_A_CAPTURER.flatMap(
  ({ ecran, largeurs }) => largeurs.map((largeur) => ({ ecran, largeur })),
);

export function nomDeCapture({ ecran, largeur }: CaptureAttendue): string {
  return `${ecran}-${largeur}.png`;
}
