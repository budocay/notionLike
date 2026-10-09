// Liste unique des captures de référence (F-004-AC51) : lue par le scénario de capture et par
// `test/demonstration.test.tsx`. Le dossier est ignoré par git ; Playwright le vide au début de
// chaque lancement, même partiel.
export const DOSSIER_DES_CAPTURES = "test-results/captures";

export const LARGEURS_DE_CAPTURE = [360, 768, 1280] as const;

export const HAUTEUR_DE_FENETRE = 800;

export interface CaptureAttendue {
  readonly ecran: string;
  readonly largeur: number;
}

/** Écrans capturés et largeurs de chacun ; les écrans de référence de l'application s'y ajoutent. */
export const ECRANS_A_CAPTURER: readonly {
  readonly ecran: string;
  readonly largeurs: readonly number[];
}[] = [{ ecran: "demonstration", largeurs: LARGEURS_DE_CAPTURE }];

export const CAPTURES_ATTENDUES: readonly CaptureAttendue[] = ECRANS_A_CAPTURER.flatMap(
  ({ ecran, largeurs }) => largeurs.map((largeur) => ({ ecran, largeur })),
);

export function nomDeCapture({ ecran, largeur }: CaptureAttendue): string {
  return `${ecran}-${largeur}.png`;
}
