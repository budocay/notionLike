// Coutures des contrats partagés entre la vue Tableau et la vue Calendrier (F-021) : les fichiers qui
// importent chacun d'eux sont énumérés, et ceux dont la signature a changé restent corrects.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Bouton } from "../../src/interface/composants/Espaces.tsx";
import { lire, lister } from "../aides-disque.ts";

const MODULE = "src/vues-de-table";

/** Les fichiers de `src` (hors la définition) qui importent ce nom depuis ce fichier. */
function importeurs(nom: string, depuis: string): string[] {
  const import_ = new RegExp(
    `import\\s*(?:type\\s*)?\\{[^}]*\\b${nom}\\b[^}]*\\}\\s*from\\s*"[^"]*/${depuis.replace(".", "\\.")}"`,
  );
  return lister("src")
    .filter((chemin) => /\.tsx?$/.test(chemin) && !chemin.endsWith(`/${depuis}`))
    .filter((chemin) => import_.test(lire(chemin)))
    .sort();
}

const CONTRATS: readonly (readonly [string, string, readonly string[]])[] = [
  ["BoiteNouvelleColonne", "Boites.tsx", [`${MODULE}/VueCalendrier.tsx`]],
  ["Confirmation", "Boites.tsx", [`${MODULE}/VueCalendrier.tsx`]],
  [
    "useAnnonce",
    "use-annonce.ts",
    [`${MODULE}/use-vue-calendrier.ts`, `${MODULE}/use-vue-tableau.ts`],
  ],
  ["ecouterLeDehors", "menu-de-grille.ts", [`${MODULE}/use-menu-calendrier.ts`]],
  ["creerUneColonne", "actions.ts", [`${MODULE}/use-ecritures-calendrier.ts`]],
  ["ajouterUneColonne", "actions.ts", [`${MODULE}/Boites.tsx`]],
];

describe("appelants des contrats partagés (F-021)", () => {
  it.each(CONTRATS)(
    "F-021-AC7 « %s » (%s) n'est importé que par les fichiers de la liste",
    (nom, depuis, attendus) => {
      expect(importeurs(nom, depuis)).toEqual([...attendus].sort());
    },
  );

  it("F-021-AC7 la boîte de nouvelle colonne reçoit `ajouter` et `fermer` de ses deux appelants, et plus d'objet de la vue Tableau", () => {
    for (const chemin of [`${MODULE}/Boites.tsx`, `${MODULE}/VueCalendrier.tsx`]) {
      const texte = lire(chemin);
      const appel = /<BoiteNouvelleColonne(.*?)\/>/s.exec(texte)?.[1] ?? "";
      expect(appel, chemin).toMatch(/ajouter=/);
      expect(appel, chemin).toMatch(/fermer=/);
      expect(appel, chemin).not.toMatch(/\bvue=/);
    }
  });

  it("F-021-AC2 `resterFocalisable` n'est demandé que par les deux commandes de mois ; sans lui, un bouton avec raison reste désactivé", () => {
    const demandeurs = lister("src")
      .filter((chemin) => /\.tsx$/.test(chemin) && lire(chemin).includes("resterFocalisable"))
      .sort();
    expect(demandeurs).toEqual([
      "src/interface/composants/Espaces.tsx",
      `${MODULE}/VueCalendrier.tsx`,
    ]);
    expect(lire(`${MODULE}/VueCalendrier.tsx`).match(/resterFocalisable/g)).toHaveLength(2);
    render(<Bouton libelle="Sans" raison="Pas maintenant." />);
    expect((screen.getByRole("button", { name: "Sans" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Sans" }).hasAttribute("aria-disabled")).toBe(false);
  });
});
