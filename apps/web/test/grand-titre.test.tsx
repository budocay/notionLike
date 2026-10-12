// Grand titre de la page (F-003-AC39) : le titre en tête de la colonne de lecture porte le plus grand
// jeton de taille de texte, plus grand que celui d'un bloc « Titre 1 », reste le titre de niveau 1 de
// la zone principale, et dit « Sans titre » en texte atténué quand il n'a aucun caractère visible.
// Les mesures dans un navigateur (360 et 1280, titre de 200 caractères) sont dans
// `e2e/grand-titre.spec.ts`.
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  activerActionDeRangee,
  creerPageNommee,
  ouvrirCoquille,
  saisirTitre,
} from "./aides-coquille.tsx";
import { lire } from "./aides-disque.ts";
import { FEUILLE_D_ENTREE, FICHIER_DES_JETONS } from "./aides-styles.ts";

const SANS_TITRE = "Sans titre";
const CLASSES_DES_ETATS = "src/interface/composants/etats.classes.ts";

function classeDe(cle: string): string {
  return new RegExp(`\\b${cle}:\\s*"([^"]*)"`).exec(lire(CLASSES_DES_ETATS))?.[1] ?? "";
}

/** Tailles de texte du fichier des jetons, en rem, par nom de jeton (`--text-<nom>`). */
function taillesDeTexte(jetons: string): Map<string, number> {
  return new Map(
    [...jetons.matchAll(/--text-([a-z]+(?:-[a-z]+)*):\s*([\d.]+)rem;/g)].map(
      ([, nom, valeur]) => [nom ?? "", Number(valeur)] as const,
    ),
  );
}

/**
 * Fautes du grand titre : chaque taille que portent ses classes doit dépasser celle du « Titre 1 »
 * du contenu, et sa taille d'écran large doit être le plus grand jeton de taille de texte.
 */
function fautesDeGrandTitre(jetons: string, feuille: string, classesDuTitre: string): string[] {
  const tailles = taillesDeTexte(jetons);
  const jetonDuTitre1 = /& h1 \{[^}]*?font-size: var\(--text-([\w-]+)\)/.exec(feuille)?.[1];
  const titre1 = jetonDuTitre1 === undefined ? undefined : tailles.get(jetonDuTitre1);
  const classes = classesDuTitre.split(/\s+/);
  const portees = classes
    .map((classe) => /^(?:etroit:)?text-([\w-]+)$/.exec(classe)?.[1])
    .filter((nom): nom is string => nom !== undefined && tailles.has(nom));
  const large = classes
    .map((classe) => /^etroit:text-([\w-]+)$/.exec(classe)?.[1])
    .find((nom) => nom !== undefined && tailles.has(nom));
  const plusGrande = Math.max(...tailles.values());
  if (titre1 === undefined) {
    return ["taille du « Titre 1 » du contenu introuvable"];
  }
  return [
    ...(portees.length === 0 ? ["aucun jeton de taille sur le titre"] : []),
    ...portees
      .filter((nom) => (tailles.get(nom) ?? 0) <= titre1)
      .map((nom) => `text-${nom} n'est pas plus grand que le « Titre 1 » (text-${jetonDuTitre1})`),
    ...(large !== undefined && tailles.get(large) === plusGrande
      ? []
      : [`sur écran large, le titre ne porte pas le plus grand jeton (${plusGrande}rem)`]),
  ];
}

function titrePrincipal(): HTMLElement {
  return within(screen.getByRole("main")).getByRole("heading", { level: 1 });
}

describe("grand titre de la page", () => {
  it("F-003-AC39 le titre de la page porte le plus grand jeton de taille de texte, strictement plus grand que celui d'un « Titre 1 » du contenu, à toute largeur ; titre vide et titre rempli ont la même taille", () => {
    const jetons = lire(FICHIER_DES_JETONS);
    const feuille = lire(FEUILLE_D_ENTREE);

    expect(fautesDeGrandTitre(jetons, feuille, classeDe("titre"))).toEqual([]);
    expect(fautesDeGrandTitre(jetons, feuille, classeDe("titreVide"))).toEqual([]);
    expect(classeDe("titreVide").replace("text-texte-discret", "text-texte-principal")).toBe(
      classeDe("titre"),
    );
  });

  it("F-003-AC39 témoins : un titre de la taille du « Titre 1 », plus petit sur écran étroit, ou sans le plus grand jeton sur écran large, est nommé", () => {
    const jetons =
      "--text-titre: 2.5rem;\n--text-titre--line-height: 2.75rem;\n--text-titre-etroit: 1.875rem;\n--text-intertitre: 1.25rem;\n--text-courant: 1rem;";
    const feuille = "& h1 {\n    font-size: var(--text-intertitre);\n  }";
    const conforme = "wrap-anywhere text-titre-etroit text-texte-principal etroit:text-titre";

    expect(fautesDeGrandTitre(jetons, feuille, conforme)).toEqual([]);
    expect(
      fautesDeGrandTitre(jetons, feuille, "text-intertitre text-texte-principal etroit:text-titre"),
    ).toEqual(["text-intertitre n'est pas plus grand que le « Titre 1 » (text-intertitre)"]);
    expect(
      fautesDeGrandTitre(jetons, feuille, "text-courant text-texte-principal etroit:text-titre"),
    ).toEqual(["text-courant n'est pas plus grand que le « Titre 1 » (text-intertitre)"]);
    expect(
      fautesDeGrandTitre(jetons, feuille, "text-titre-etroit etroit:text-titre-etroit"),
    ).toEqual(["sur écran large, le titre ne porte pas le plus grand jeton (2.5rem)"]);
    expect(fautesDeGrandTitre(jetons, "& h2 {}", conforme)).toEqual([
      "taille du « Titre 1 » du contenu introuvable",
    ]);
  });

  it("F-003-AC39 titre vide : « Sans titre » en texte atténué, dans le même titre de niveau 1 de la zone principale ; titre rempli, même littéralement « Sans titre », en texte principal", async () => {
    const { utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Agenda");

    const rempli = titrePrincipal();
    expect(rempli.tagName).toBe("H1");
    expect(rempli.textContent).toBe("Agenda");
    expect(rempli.className).toBe(classeDe("titre"));
    expect(rempli.className).toContain("text-texte-principal");

    await activerActionDeRangee(utilisateur, "renommer", "Agenda");
    await saisirTitre(utilisateur, "   ");
    await screen.findByRole("link", { name: SANS_TITRE });

    const vide = titrePrincipal();
    expect(vide.tagName).toBe("H1");
    expect(vide.textContent).toBe(SANS_TITRE);
    expect(vide.className).toBe(classeDe("titreVide"));
    expect(vide.className).toContain("text-texte-discret");
    expect(vide.className).not.toContain("text-texte-principal");

    await activerActionDeRangee(utilisateur, "renommer", SANS_TITRE);
    await saisirTitre(utilisateur, SANS_TITRE);

    expect(titrePrincipal().textContent).toBe(SANS_TITRE);
    expect(titrePrincipal().className).toBe(classeDe("titre"));
  });
});
