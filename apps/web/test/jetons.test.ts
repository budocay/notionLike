// Contrôles statiques du fichier des jetons. Chaque contrôle passe sur le fichier réel, sur un
// fichier conforme donné comme donnée de test, et détecte un cas fautif (F-004-AC21, AC53).
import { describe, expect, it } from "vitest";

import { couleurDe, lireJetons } from "../src/styles/lecture-jetons.ts";
import { lire } from "./aides-disque.ts";
import {
  CATEGORIES,
  CONTRASTE_REPERE,
  CONTRASTE_TEXTE,
  controlerContrastes,
  controlerCouleurs,
  controlerDegrades,
  controlerJetons,
  controlerMouvement,
  controlerStructure,
  controlerTeinte,
  controlerUnites,
  couples,
} from "./aides-jetons.ts";

const jetons = lire("src/styles/jetons.css");

const CONFORME = `
@theme static {
  --*: initial;
  --primitif-nuit: #0e161d;
  --primitif-jour: #efe9dd;
  --primitif-braise: #ffc15e;
  --primitif-rose: #f0567c;
  --color-surface-application: var(--primitif-nuit);
  --color-texte-principal: var(--primitif-jour);
  --color-repere-focus: var(--primitif-braise);
  --color-repere-fin: var(--primitif-rose);
  --degrade-accent: linear-gradient(90deg, var(--color-repere-focus), var(--color-repere-fin));
  --degrade-halo: radial-gradient(var(--color-surface-application), var(--color-surface-application));
  --text-courant: 1rem;
  --text-courant--line-height: 1.5rem;
  --text-courant--letter-spacing: -0.01em;
  --spacing-petit: 0.5rem;
  --radius-petit: 0.25rem;
  --shadow-menu: 0 1rem 2rem rgb(0 0 0 / 0.5);
  --breakpoint-etroit: 51.25rem;
  --duree-rapide: 120ms;
  --duree-boucle-attente: 1400ms;
  --ease-sortie: cubic-bezier(0.2, 0.8, 0.2, 1);
  --animate-attente: battement var(--duree-boucle-attente) var(--ease-sortie) infinite;
  @keyframes battement {
    from {
      opacity: 0;
      transform: scale(0.5);
    }
    to {
      opacity: 1;
    }
  }
}
@media (prefers-reduced-motion: reduce) {
  :root {
    --duree-rapide: 0ms;
    --duree-boucle-attente: 0ms;
  }
}
`;

function avec(avant: string, apres: string): string {
  expect(CONFORME).toContain(avant);
  return CONFORME.replace(avant, apres);
}

describe("fichier des jetons : structure", () => {
  it("F-004-AC1 le fichier réel déclare chaque catégorie, sans doublon ni renvoi perdu", () => {
    expect(controlerStructure(jetons)).toEqual([]);
    const noms = lireJetons(jetons).theme.map(({ nom }) => nom);
    for (const motif of Object.values(CATEGORIES)) {
      expect(noms.some((nom) => motif.test(nom))).toBe(true);
    }
  });

  it("F-004-AC21 F-004-AC1 un fichier conforme passe, une catégorie vide est nommée", () => {
    expect(controlerJetons(CONFORME)).toEqual([]);
    expect(controlerStructure(avec("  --radius-petit: 0.25rem;\n", ""))).toEqual([
      "catégorie vide : rayon",
    ]);
  });

  it("F-004-AC21 F-004-AC1 un nom déclaré deux fois est nommé", () => {
    const fautif = avec(
      "--spacing-petit: 0.5rem;",
      "--spacing-petit: 0.5rem; --spacing-petit: 1rem;",
    );
    expect(controlerStructure(fautif)).toEqual(["--spacing-petit : déclaré deux fois"]);
  });

  it("F-004-AC21 F-004-AC1 un renvoi à un jeton absent est nommé", () => {
    const fautif = avec("var(--primitif-jour)", "var(--primitif-absent)");
    expect(controlerStructure(fautif)).toEqual([
      "--color-texte-principal : renvoie à --primitif-absent, qui n'est pas déclaré",
    ]);
  });

  it("F-004-AC21 F-004-AC1 un nom hors des catégories est refusé", () => {
    expect(controlerStructure(avec("--radius-petit", "--radius-petit: 1rem; --divers-x"))).toEqual([
      "--divers-x : nom hors des catégories de jetons",
    ]);
  });

  it("F-004-AC4 le thème réel est un seul bloc statique qui commence par le vidage", () => {
    const lus = lireJetons(jetons);
    expect(lus.entetesDeTheme).toEqual(["@theme static"]);
    expect(lus.theme[0]).toEqual({ nom: "--*", valeur: "initial" });
    expect(lus.theme.map(({ nom }) => nom)).not.toContain("--spacing");
  });

  it("F-004-AC21 F-004-AC4 le vidage absent ou déplacé est détecté", () => {
    expect(controlerStructure(avec("  --*: initial;\n", ""))).toContainEqual(
      expect.stringContaining("« --*: initial; » attendue"),
    );
    const deplace = avec("  --*: initial;\n", "").replace(
      "--primitif-jour: #efe9dd;",
      "$& --*: initial;",
    );
    expect(controlerStructure(deplace)).toContainEqual(
      expect.stringContaining("« --*: initial; »"),
    );
  });

  it("F-004-AC21 F-004-AC4 une base d'espacement est refusée", () => {
    expect(
      controlerStructure(avec("--spacing-petit: 0.5rem;", "$& --spacing: 0.25rem;")),
    ).toContainEqual(expect.stringContaining("--spacing : la base d'espacement est interdite"));
  });

  it("F-004-AC21 F-004-AC4 un second bloc de thème ou un thème non statique est refusé", () => {
    expect(controlerStructure(`${CONFORME}\n@theme { --radius-grand: 1rem; }`)).toContainEqual(
      expect.stringContaining("un seul bloc « @theme static » attendu"),
    );
    expect(controlerStructure(avec("@theme static {", "@theme {"))).toContainEqual(
      expect.stringContaining("un seul bloc « @theme static » attendu"),
    );
  });
});

describe("fichier des jetons : couleurs", () => {
  it("F-004-AC2 primitifs réels en hexadécimal opaque, sémantiques réels en renvoi", () => {
    expect(controlerCouleurs(jetons)).toEqual([]);
  });

  it("F-004-AC21 F-004-AC2 un primitif transparent, abrégé ou nommé est refusé", () => {
    for (const valeur of ["#0e161d80", "#fff", "rgb(14 22 29)", "navy"]) {
      expect(
        controlerCouleurs(avec("--primitif-nuit: #0e161d;", `--primitif-nuit: ${valeur};`)),
      ).toEqual([`--primitif-nuit : « ${valeur} » n'est pas une couleur #rrggbb opaque`]);
    }
  });

  it("F-004-AC21 F-004-AC2 un jeton sémantique à valeur littérale est refusé", () => {
    expect(controlerCouleurs(avec("var(--primitif-jour)", "#efe9dd"))).toEqual([
      "--color-texte-principal : « #efe9dd » n'est pas un renvoi à un jeton primitif",
    ]);
  });

  it("F-004-AC21 F-004-AC2 une couleur sémantique hors surface, texte et repère est refusée", () => {
    const fautif = avec("--color-texte-principal:", "--color-divers: var(--primitif-jour); $&");
    expect(controlerCouleurs(fautif)).toEqual(["--color-divers : ni surface, ni texte, ni repère"]);
  });

  it("F-004-AC7 chaque texte réel tient 4,5 pour 1 sur chaque surface réelle", () => {
    const liste = couples(jetons, "texte");
    expect(liste.length).toBe(5 * 7);
    for (const { premier, surface, rapport } of liste) {
      expect(rapport, `${premier} sur ${surface}`).toBeGreaterThanOrEqual(CONTRASTE_TEXTE);
    }
  });

  it("F-004-AC8 chaque repère réel tient 3 pour 1 sur chaque surface réelle", () => {
    const liste = couples(jetons, "repere");
    expect(liste.length).toBe(6 * 7);
    for (const { premier, surface, rapport } of liste) {
      expect(rapport, `${premier} sur ${surface}`).toBeGreaterThanOrEqual(CONTRASTE_REPERE);
    }
  });

  it("F-004-AC20 F-004-AC21 un texte trop sombre est nommé avec sa surface et son contraste", () => {
    expect(controlerContrastes(CONFORME)).toEqual([]);
    expect(
      controlerContrastes(avec("--primitif-jour: #efe9dd;", "--primitif-jour: #5b6670;")),
    ).toEqual([
      "--color-texte-principal sur --color-surface-application : contraste 3.11, sous 4.5",
    ]);
  });

  it("F-004-AC20 F-004-AC21 un repère trop sombre est nommé avec sa surface et son contraste", () => {
    expect(
      controlerContrastes(avec("--primitif-braise: #ffc15e;", "--primitif-braise: #3b4650;")),
    ).toEqual(["--color-repere-focus sur --color-surface-application : contraste 1.89, sous 3"]);
  });

  it("F-004-AC7 le calcul suit la formule de la veille : noir sur blanc, puis son exemple", () => {
    const deux = (clair: string, sombre: string): number =>
      couples(avec("#efe9dd", clair).replace("#0e161d", sombre), "texte")[0]?.rapport ?? 0;
    expect(deux("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(deux("#e8e8f0", "#0b0b12")).toBeCloseTo(16.09, 2);
  });
});

describe("fichier des jetons : identité", () => {
  it("F-004-AC46 les surfaces réelles sont teintées, voisines, et le fond est sombre", () => {
    expect(controlerTeinte(jetons)).toEqual([]);
  });

  it("F-004-AC53 F-004-AC46 un gris neutre, une teinte lointaine, un fond clair sont refusés", () => {
    expect(controlerTeinte(CONFORME)).toEqual([]);
    expect(controlerTeinte(avec("--primitif-nuit: #0e161d;", "--primitif-nuit: #161616;"))).toEqual(
      ["--color-surface-application : saturation de 0.0 %, un gris neutre ne sert pas de surface"],
    );
    const lointaine = avec(
      "--color-texte-principal:",
      "--color-surface-autre: var(--primitif-prune); $&",
    ).replace("--primitif-jour:", "--primitif-prune: #1d0e1a; $&");
    expect(controlerTeinte(lointaine)).toEqual([
      expect.stringMatching(/^teintes des surfaces sur un arc de \d+ degrés, plus de 40$/),
    ]);
    expect(controlerTeinte(avec("--primitif-nuit: #0e161d;", "--primitif-nuit: #2f4a5f;"))).toEqual(
      [expect.stringContaining("--color-surface-application : luminance de")],
    );
  });

  it("F-004-AC9 F-004-AC48 les dégradés réels hors accent ne sont faits que de surfaces", () => {
    expect(controlerDegrades(jetons)).toEqual([]);
    const halo = lireJetons(jetons).theme.find(({ nom }) => nom === "--degrade-halo");
    expect(halo?.valeur).toMatch(/var\(--color-surface-halo\).*var\(--color-surface-application\)/);
  });

  it("F-004-AC21 F-004-AC9 un dégradé qui porte un repère, un littéral ou du vide est refusé", () => {
    const halo =
      "radial-gradient(var(--color-surface-application), var(--color-surface-application))";
    expect(
      controlerDegrades(
        avec(halo, "radial-gradient(var(--color-repere-focus), var(--color-surface-application))"),
      ),
    ).toEqual(["--degrade-halo : --color-repere-focus n'est pas un jeton de surface"]);
    for (const intrus of ["#0e161d", "transparent", "rgb(0 0 0 / 0.5)"]) {
      const fautif = avec(
        halo,
        `radial-gradient(var(--color-surface-application), var(--color-surface-application), ${intrus})`,
      );
      expect(controlerDegrades(fautif)).toEqual([
        expect.stringContaining("--degrade-halo : couleur littérale ou transparence"),
      ]);
    }
  });

  it("F-004-AC47 le dégradé d'accent réel est unique, fait de repères, lisible en 16 points", () => {
    const lus = lireJetons(jetons).theme;
    const accents = lus.filter(({ nom }) => nom.startsWith("--degrade-accent"));
    expect(accents).toHaveLength(1);
    expect(accents[0]?.valeur).not.toMatch(/surface|texte|#|transparent/);
    expect(controlerDegrades(jetons)).toEqual([]);
  });

  it("F-004-AC53 F-004-AC47 un second accent, un accent fait d'une surface ou trop sombre est refusé", () => {
    const accent =
      "--degrade-accent: linear-gradient(90deg, var(--color-repere-focus), var(--color-repere-fin));";
    expect(
      controlerDegrades(
        avec(
          accent,
          `${accent} --degrade-accent-bis: linear-gradient(var(--color-repere-focus), var(--color-repere-fin));`,
        ),
      ),
    ).toContainEqual("un seul dégradé d'accent attendu, nommé --degrade-accent : 2 lus");
    expect(
      controlerDegrades(avec("var(--color-repere-fin));", "var(--color-surface-application));")),
    ).toContainEqual("--degrade-accent : --color-surface-application n'est pas un jeton de repère");
    const sombre = controlerDegrades(
      avec("--primitif-rose: #f0567c;", "--primitif-rose: #3b4650;"),
    );
    expect(sombre).toContainEqual(
      expect.stringMatching(
        /^--degrade-accent, point 16 sur 16, sur --color-surface-application : contraste 1\.89, sous 3$/,
      ),
    );
    expect(sombre.some((faute) => faute.includes("point 1 sur 16"))).toBe(false);
  });
});

describe("fichier des jetons : unités et mouvement", () => {
  it("F-004-AC5 F-004-AC41 tailles, hauteurs de ligne et seuils réels sont en rem", () => {
    expect(controlerUnites(jetons)).toEqual([]);
    const seuils = lireJetons(jetons).theme.filter(({ nom }) => nom.startsWith("--breakpoint-"));
    expect(seuils).toEqual([{ nom: "--breakpoint-etroit", valeur: "51.25rem" }]);
  });

  it("F-004-AC53 F-004-AC5 F-004-AC41 une taille, une hauteur ou un seuil en pixels est refusé", () => {
    expect(controlerUnites(avec("--text-courant: 1rem;", "--text-courant: 16px;"))).toEqual([
      "--text-courant : « 16px » n'est pas exprimé en rem",
    ]);
    expect(controlerUnites(avec("--line-height: 1.5rem;", "--line-height: 24px;"))).toEqual([
      "--text-courant--line-height : « 24px » n'est pas exprimé en rem",
    ]);
    expect(
      controlerUnites(avec("--breakpoint-etroit: 51.25rem;", "--breakpoint-etroit: 820px;")),
    ).toEqual(["--breakpoint-etroit : « 820px » n'est pas exprimé en rem"]);
  });

  it("F-004-AC12 F-004-AC13 F-004-AC11 durées, animations et mouvement réduit réels", () => {
    expect(controlerMouvement(jetons)).toEqual([]);
    const lus = lireJetons(jetons);
    const durees = lus.theme.filter(({ nom }) => nom.startsWith("--duree-"));
    expect(durees.length).toBeGreaterThanOrEqual(3);
    expect(lus.mouvementReduit).toEqual(durees.map(({ nom }) => ({ nom, valeur: "0ms" })));
    expect(lus.imagesCles.map(({ nom }) => nom)).toEqual(["apparition", "depliage", "pulsation"]);
  });

  it("F-004-AC21 F-004-AC12 une durée trop longue, en secondes, ou une boucle trop vive est refusée", () => {
    expect(controlerMouvement(avec("--duree-rapide: 120ms;", "--duree-rapide: 301ms;"))).toEqual([
      "--duree-rapide : durée de 301ms, plus de 300 ms",
    ]);
    expect(controlerMouvement(avec("--duree-rapide: 120ms;", "--duree-rapide: 0.12s;"))).toEqual([
      "--duree-rapide : « 0.12s » n'est pas une durée en millisecondes entières",
    ]);
    expect(
      controlerMouvement(avec("--duree-boucle-attente: 1400ms;", "--duree-boucle-attente: 999ms;")),
    ).toEqual(["--duree-boucle-attente : période de 999ms, sous 1000 ms"]);
  });

  it("F-004-AC21 F-004-AC12 une animation à durée ou courbe littérale est refusée", () => {
    expect(
      controlerMouvement(avec("battement var(--duree-boucle-attente)", "battement 2s")),
    ).toEqual([
      "--animate-attente : aucune durée tirée d'un jeton --duree-*",
      "--animate-attente : durée ou courbe littérale dans « battement 2s var(--ease-sortie) infinite »",
    ]);
    expect(controlerMouvement(avec("var(--ease-sortie) infinite", "ease-in-out infinite"))).toEqual(
      [
        "--animate-attente : aucune courbe tirée d'un jeton --ease-*",
        expect.stringContaining("--animate-attente : durée ou courbe littérale"),
      ],
    );
  });

  it("F-004-AC21 F-004-AC11 des images clés qui animent autre chose que transform et opacity", () => {
    expect(controlerMouvement(avec("transform: scale(0.5);", "width: 0;"))).toEqual([
      "@keyframes battement : anime width, ni transform ni opacity",
    ]);
  });

  it("F-004-AC21 F-004-AC13 un jeton de durée non ramené à zéro, ou ramené avant le thème", () => {
    expect(controlerMouvement(avec("    --duree-rapide: 0ms;\n", ""))).toEqual([
      expect.stringContaining("--duree-rapide : non ramené à 0ms"),
    ]);
    const bloc = CONFORME.slice(CONFORME.indexOf("@media"));
    const avant = `${bloc}\n${CONFORME.replace(bloc, "")}`;
    expect(controlerMouvement(avant)).toHaveLength(2);
    expect(controlerMouvement(avec("--duree-rapide: 0ms;", "--duree-rapide: 1ms;"))).toHaveLength(
      1,
    );
  });
});

describe("fichier des jetons : lecture", () => {
  it("F-004-AC2 un jeton sémantique se résout jusqu'à sa couleur primitive", () => {
    const { theme } = lireJetons(jetons);
    expect(couleurDe(theme, "--color-surface-application")).toBe("#10151c");
    expect(couleurDe(theme, "--color-absent")).toBeUndefined();
  });
});
