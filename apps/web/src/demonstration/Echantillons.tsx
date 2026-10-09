import type { CSSProperties, ReactElement } from "react";

import { contraste, couleurDe, type Jeton, lireJetons, rvbDe } from "../styles/lecture-jetons.ts";
import { ECHANTILLONS } from "./page.classes.ts";

const PHRASE = "Portez ce vieux whisky au juge blond qui fume";
const ROLES = [
  { titre: "Surfaces", prefixe: "--color-surface-" },
  { titre: "Textes", prefixe: "--color-texte-" },
  { titre: "Repères", prefixe: "--color-repere-" },
] as const;

function nommes(theme: readonly Jeton[], prefixe: string): readonly Jeton[] {
  return theme.filter(({ nom }) => nom.startsWith(prefixe));
}

/** Plus petit contraste d'une couleur avec les surfaces ; `undefined` pour une surface. */
function contrasteMinimal(theme: readonly Jeton[], nom: string): string | undefined {
  const couleur = couleurDe(theme, nom);
  if (couleur === undefined || nom.startsWith("--color-surface-")) {
    return undefined;
  }
  const rapports = nommes(theme, "--color-surface-").flatMap((surface) => {
    const fond = couleurDe(theme, surface.nom);
    return fond === undefined ? [] : [contraste(rvbDe(couleur), rvbDe(fond))];
  });
  return `${Math.min(...rapports).toFixed(2)} : 1 au moins`;
}

function Couleur({
  theme,
  jeton,
}: {
  readonly theme: readonly Jeton[];
  readonly jeton: Jeton;
}): ReactElement {
  const minimum = contrasteMinimal(theme, jeton.nom);
  return (
    <li className={ECHANTILLONS.carte}>
      <span className={ECHANTILLONS.pastille} style={{ backgroundColor: `var(${jeton.nom})` }} />
      <span className={ECHANTILLONS.legende}>
        <span className={ECHANTILLONS.nom}>{jeton.nom.replace("--color-", "")}</span>
        <span className={ECHANTILLONS.valeur}>{couleurDe(theme, jeton.nom)}</span>
        {minimum !== undefined && <span className={ECHANTILLONS.valeur}>{minimum}</span>}
      </span>
    </li>
  );
}

function Degrade({ jeton }: { readonly jeton: Jeton }): ReactElement {
  return (
    <li className={ECHANTILLONS.carte}>
      <span className={ECHANTILLONS.degrade} style={{ backgroundImage: `var(${jeton.nom})` }} />
      <span className={ECHANTILLONS.legende}>
        <span className={ECHANTILLONS.nom}>{jeton.nom.replace("--", "")}</span>
      </span>
    </li>
  );
}

function Taille({
  theme,
  jeton,
}: {
  readonly theme: readonly Jeton[];
  readonly jeton: Jeton;
}): ReactElement {
  const hauteur = theme.find(({ nom }) => nom === `${jeton.nom}--line-height`);
  const style: CSSProperties = {
    fontSize: `var(${jeton.nom})`,
    lineHeight: `var(${jeton.nom}--line-height)`,
  };
  return (
    <li className={ECHANTILLONS.ligne}>
      <span className={ECHANTILLONS.valeur}>
        {jeton.nom.replace("--text-", "")} · {jeton.valeur} / {hauteur?.valeur}
      </span>
      <span className={ECHANTILLONS.exemple} style={style}>
        {PHRASE}
      </span>
    </li>
  );
}

export interface GroupeDEchantillons {
  readonly titre: string;
  readonly contenu: ReactElement;
}

/** Échantillons lus dans le fichier des jetons lui-même : la page ne recopie aucune valeur. */
export function echantillonsDe(jetons: string): GroupeDEchantillons[] {
  const { theme } = lireJetons(jetons);
  const couleurs = ROLES.map(({ titre, prefixe }) => ({
    titre,
    contenu: (
      <ul className={ECHANTILLONS.grille}>
        {nommes(theme, prefixe).map((jeton) => (
          <Couleur key={jeton.nom} theme={theme} jeton={jeton} />
        ))}
      </ul>
    ),
  }));
  const tailles = nommes(theme, "--text-").filter(({ nom }) => !nom.slice(2).includes("--"));
  return [
    ...couleurs,
    {
      titre: "Dégradés",
      contenu: (
        <ul className={ECHANTILLONS.grille}>
          {nommes(theme, "--degrade-").map((jeton) => (
            <Degrade key={jeton.nom} jeton={jeton} />
          ))}
        </ul>
      ),
    },
    {
      titre: "Échelle typographique",
      contenu: (
        <ul className={ECHANTILLONS.echelle}>
          {tailles.map((jeton) => (
            <Taille key={jeton.nom} theme={theme} jeton={jeton} />
          ))}
        </ul>
      ),
    },
  ];
}
