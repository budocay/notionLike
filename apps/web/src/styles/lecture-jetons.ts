// Lecture du fichier des jetons comme un texte, et contraste de deux couleurs (F-004 H4, H7) :
// aucun analyseur CSS, aucune dépendance. Les contrôles statiques et la page de démonstration
// passent par ce seul lecteur ; rien ici ne touche le DOM. Les calculs que seuls les contrôles
// emploient (teinte, saturation, dégradé) sont dans `test/aides-jetons.ts`.

export interface Jeton {
  readonly nom: string;
  readonly valeur: string;
}

export interface JetonsLus {
  /** Déclarations du bloc de thème, dans l'ordre du fichier, `--*` comprise. */
  readonly theme: readonly Jeton[];
  /** En-tête de chaque bloc `@theme` rencontré (« @theme static »). */
  readonly entetesDeTheme: readonly string[];
  /** Images clés déclarées dans le thème : nom, puis propriétés animées. */
  readonly imagesCles: readonly ImageCle[];
  /** Déclarations sur `:root` sous `prefers-reduced-motion: reduce`, après le thème. */
  readonly mouvementReduit: readonly Jeton[];
}

export interface ImageCle {
  readonly nom: string;
  readonly proprietes: readonly string[];
}

export type Rvb = readonly [number, number, number];

const COMMENTAIRE = /\/\*[\s\S]*?\*\//g;
const ENTETE_DE_THEME = /@theme\b[^{]*/g;
const DECLARATION = /(--[\w*-]+)\s*:\s*([^;{}]+);/g;
const IMAGE_CLE = /@keyframes\s+([\w-]+)\s*\{/g;
const PROPRIETE = /(?:^|[{;\s])([a-z-]+)\s*:/g;
const MOUVEMENT_REDUIT = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{\s*:root\s*\{/;
const HEXADECIMAL = /^#[0-9a-f]{6}$/;

/** Rend le bloc ouvert par l'accolade placée à `debut`, sans ses accolades ; `fin` la suit. */
function blocA(texte: string, debut: number): { readonly corps: string; readonly fin: number } {
  let profondeur = 0;
  for (let position = debut; position < texte.length; position += 1) {
    const caractere = texte[position];
    if (caractere === "{") {
      profondeur += 1;
    } else if (caractere === "}") {
      profondeur -= 1;
      if (profondeur === 0) {
        return { corps: texte.slice(debut + 1, position), fin: position + 1 };
      }
    }
  }
  return { corps: texte.slice(debut + 1), fin: texte.length };
}

function declarationsDe(corps: string): Jeton[] {
  return [...corps.matchAll(DECLARATION)].map(([, nom = "", valeur = ""]) => ({
    nom,
    valeur: valeur.replace(/\s+/g, " ").trim(),
  }));
}

function imagesClesDe(corps: string): { readonly images: ImageCle[]; readonly reste: string } {
  const images: ImageCle[] = [];
  let reste = corps;
  for (const trouvee of corps.matchAll(IMAGE_CLE)) {
    const debut = trouvee.index + trouvee[0].length - 1;
    const bloc = blocA(corps, debut);
    const proprietes = [...bloc.corps.matchAll(PROPRIETE)].map(([, nom = ""]) => nom);
    images.push({ nom: trouvee[1] ?? "", proprietes: [...new Set(proprietes)] });
    reste = reste.replace(corps.slice(trouvee.index, bloc.fin), "");
  }
  return { images, reste };
}

export function lireJetons(source: string): JetonsLus {
  const texte = source.replace(COMMENTAIRE, "");
  const entetes = [...texte.matchAll(ENTETE_DE_THEME)];
  const premiere = entetes[0];
  if (premiere === undefined) {
    return { theme: [], entetesDeTheme: [], imagesCles: [], mouvementReduit: [] };
  }
  const bloc = blocA(texte, premiere.index + premiere[0].length);
  const { images, reste } = imagesClesDe(bloc.corps);
  const suite = texte.slice(bloc.fin);
  const reduit = MOUVEMENT_REDUIT.exec(suite);
  const corpsReduit =
    reduit === null ? "" : blocA(suite, reduit.index + reduit[0].length - 1).corps;
  return {
    theme: declarationsDe(reste),
    entetesDeTheme: entetes.map(([entete]) => entete.trim()),
    imagesCles: images,
    mouvementReduit: declarationsDe(corpsReduit),
  };
}

/** Suit les renvois d'un jeton de couleur jusqu'à sa valeur hexadécimale ; `undefined` sinon. */
export function couleurDe(jetons: readonly Jeton[], nom: string): string | undefined {
  const valeurs = new Map(jetons.map((jeton) => [jeton.nom, jeton.valeur]));
  const vus = new Set<string>();
  let courant: string | undefined = nom;
  while (courant !== undefined && !vus.has(courant)) {
    vus.add(courant);
    const valeur = valeurs.get(courant);
    if (valeur === undefined || HEXADECIMAL.test(valeur)) {
      return valeur;
    }
    courant = /^var\(\s*(--[\w-]+)\s*\)$/.exec(valeur)?.[1];
  }
  return undefined;
}

const BASE_HEXADECIMALE = 16;
const CANAL_MAX = 255;
const CANAUX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/;

export function rvbDe(hexadecimal: string): Rvb {
  const [, rouge = "0", vert = "0", bleu = "0"] = CANAUX.exec(hexadecimal) ?? [];
  const canal = (texte: string): number => Number.parseInt(texte, BASE_HEXADECIMALE);
  return [canal(rouge), canal(vert), canal(bleu)];
}

// Luminance relative et rapport de contraste des WCAG 2.2 (MEMORY/VEILLE.md, « Contraste WCAG
// 2.2 ») : les deux seuils de linéarisation connus donnent le même résultat sur 8 bits.
const SEUIL_LINEAIRE = 0.04045;
const DIVISEUR_LINEAIRE = 12.92;
const DECALAGE_GAMMA = 0.055;
const DIVISEUR_GAMMA = 1.055;
const EXPOSANT_GAMMA = 2.4;
const POIDS_ROUGE = 0.2126;
const POIDS_VERT = 0.7152;
const POIDS_BLEU = 0.0722;
const ECLAIRAGE_AMBIANT = 0.05;

function lineaire(canal: number): number {
  const part = canal / CANAL_MAX;
  return part <= SEUIL_LINEAIRE
    ? part / DIVISEUR_LINEAIRE
    : ((part + DECALAGE_GAMMA) / DIVISEUR_GAMMA) ** EXPOSANT_GAMMA;
}

export function luminance([rouge, vert, bleu]: Rvb): number {
  return POIDS_ROUGE * lineaire(rouge) + POIDS_VERT * lineaire(vert) + POIDS_BLEU * lineaire(bleu);
}

export function contraste(premiere: Rvb, seconde: Rvb): number {
  const claire = Math.max(luminance(premiere), luminance(seconde));
  const sombre = Math.min(luminance(premiere), luminance(seconde));
  return (claire + ECLAIRAGE_AMBIANT) / (sombre + ECLAIRAGE_AMBIANT);
}
