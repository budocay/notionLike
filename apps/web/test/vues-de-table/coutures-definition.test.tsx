// Coutures de F-019 : les vues de la liste ne présentent que les lignes affichées (AC14), les sections
// des réglages de vue se respectent (AC22), les appelants du calcul et l'interface du module sont
// ceux qu'on attend (AC29).
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { effacerReglagesDeVue } from "../../src/persistance/index.ts";
import * as interfaceDuModule from "../../src/vues-de-table/index.ts";
import {
  lireLesReglages,
  SECTION_CALENDRIER,
  SECTION_FILTRES_TRIS,
  SECTION_TABLEAU,
  SECTION_VUE,
} from "../../src/vues-de-table/reglages.ts";
import { IDS_DES_VUES, VUES } from "../../src/vues-de-table/vues.ts";
import { lire, lister } from "../aides-disque.ts";
import { ESPACE_A } from "../aides-persistance.ts";
import { lignesDuPanneau } from "./aides-calendrier.tsx";
import {
  ajouterUnTri,
  choisir,
  CLE_DES_REGLAGES,
  filtrer,
  noms,
  remplirSixLignes,
} from "./aides-barres.tsx";
import { rendreLaTable, TABLE_D_ESSAI } from "./aides-grille.tsx";

afterEach(() => localStorage.clear());

/**
 * Ce que chaque vue de la liste présente : une vue ajoutée à la liste sans lecteur ici fait échouer
 * le test d'énumération (F-019-AC14). Un lecteur lit l'écran, comme le fait une personne.
 */
const LECTEURS_DE_VUES: Readonly<Record<string, () => string[]>> = {
  tableau: () => {
    expect(screen.getByRole("grid").getAttribute("aria-rowcount")).toBe("4");
    return noms();
  },
  // Les six lignes n'ont pas de date : le calendrier les présente toutes dans le panneau « Sans date ».
  calendrier: () => lignesDuPanneau().map((ligne) => ligne.textContent?.split("Définir")[0] ?? ""),
};

describe("couture des vues (F-019-AC14)", () => {
  it("F-019-AC14 chaque vue de la liste a un lecteur dans ce test, et seulement elles", () => {
    expect(Object.keys(LECTEURS_DE_VUES).sort()).toEqual([...IDS_DES_VUES].sort());
  });

  it("F-019-AC14 chaque vue de la liste ne présente que les lignes affichées, dans leur ordre, sous une définition qui filtre et trie", async () => {
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    await filtrer(utilisateur, { depart: "Nom", cible: "État" }, "est", "En cours");
    await ajouterUnTri(utilisateur);
    await choisir(utilisateur, "Sens du tri sur Nom", "Décroissant");

    for (const id of IDS_DES_VUES) {
      const vue = VUES.find((une) => une.id === id);
      await utilisateur.click(screen.getByRole("button", { name: vue?.libelle ?? id }));
      const lecteur = LECTEURS_DE_VUES[id];
      expect(lecteur, `la vue « ${id} » n'a pas de lecteur`).toBeDefined();
      expect(lecteur?.()).toEqual(["Zèbre", "École", "Banane"]);
    }
  });
});

/** Les sections des réglages de vue livrées à la date de ce commit (F-018-AC40, F-019-AC20). */
const SECTIONS_LIVREES = ["vue", "tableau", "filtres-tris", "calendrier"];

describe("couture des réglages de vue (F-019-AC22)", () => {
  const AUTRES = {
    vue: { active: "tableau" },
    tableau: { largeurs: { "colonne-inconnue": 240 } },
    calendrier: { colonne: "colonne-de-date" },
    avenir: { reglage: [1, 2, 3] },
  };

  it("F-019-AC22 les sections livrées sont celles que le module des réglages nomme", () => {
    expect([SECTION_VUE, SECTION_TABLEAU, SECTION_FILTRES_TRIS, SECTION_CALENDRIER]).toEqual(
      SECTIONS_LIVREES,
    );
    const nommees = [
      ...lire("src/vues-de-table/reglages.ts").matchAll(/SECTION_[A-Z_]+ = "([^"]+)"/g),
    ]
      .map(([, nom]) => nom)
      .sort();
    expect(nommees).toEqual([...SECTIONS_LIVREES].sort());
  });

  it("F-019-AC22 ajouter, modifier et retirer un filtre laisse les autres sections inchangées ; F-018 relit largeurs et vue sans perte", async () => {
    localStorage.setItem(CLE_DES_REGLAGES, JSON.stringify({ version: 1, sections: AUTRES }));
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    const sections = (): Record<string, unknown> =>
      (
        JSON.parse(localStorage.getItem(CLE_DES_REGLAGES) ?? "null") as {
          sections: Record<string, unknown>;
        }
      ).sections;

    await filtrer(utilisateur, { depart: "Nom", cible: "État" }, "est", "En cours");
    expect(Object.keys(sections()).sort()).toEqual([
      "avenir",
      "calendrier",
      "filtres-tris",
      "tableau",
      "vue",
    ]);
    for (const nom of Object.keys(AUTRES) as (keyof typeof AUTRES)[]) {
      expect(sections()[nom]).toEqual(AUTRES[nom]);
    }
    const relus = lireLesReglages(sections(), IDS_DES_VUES);
    expect(relus.vueActive).toBe("tableau");
    expect(relus.largeurs.get("colonne-inconnue")).toBe(240);

    await choisir(utilisateur, "Valeur du filtre sur État", "Terminé");
    for (const nom of Object.keys(AUTRES) as (keyof typeof AUTRES)[]) {
      expect(sections()[nom]).toEqual(AUTRES[nom]);
    }

    await utilisateur.click(screen.getByRole("button", { name: "Retirer le filtre sur État" }));
    expect(sections()).toEqual(AUTRES);
  });

  it("F-019-AC22 effacer les réglages d'une table supprimée définitivement emporte la définition (F-018-AC49)", async () => {
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    await filtrer(utilisateur, { depart: "Nom", cible: "État" }, "est", "En cours");
    expect(localStorage.getItem(CLE_DES_REGLAGES)).not.toBeNull();

    effacerReglagesDeVue(ESPACE_A, [TABLE_D_ESSAI]);
    expect(localStorage.getItem(CLE_DES_REGLAGES)).toBeNull();
  });
});

describe("structure du module (F-019-AC29)", () => {
  const SOURCES = lister("src/vues-de-table").filter((chemin) => /\.tsx?$/.test(chemin));

  it("F-019-AC29 le calcul des lignes affichées n'a qu'un appelant dans l'application : le hook de l'affichage", () => {
    const appelants = lister("src")
      .filter((chemin) => /\.tsx?$/.test(chemin))
      .filter((chemin) => /\blignesAffichees\(/.test(lire(chemin)))
      .filter((chemin) => chemin !== "src/vues-de-table/lignes-affichees.ts");
    expect(appelants).toEqual(["src/vues-de-table/use-affichage.ts"]);
  });

  it("F-019-AC29 le module n'importe que react et @notionlike/document : aucune dépendance nouvelle", () => {
    const sources = new Set(
      SOURCES.flatMap((chemin) =>
        [...lire(chemin).matchAll(/from\s+"([^."][^"]*)"/g)].map(([, source = ""]) => source),
      ),
    );
    expect([...sources].sort()).toEqual(["@notionlike/document", "react"]);
  });

  it("F-019-AC29 l'interface du module reste l'écran de table seul", () => {
    expect(Object.keys(interfaceDuModule)).toEqual(["EcranDeTable"]);
  });

  it("F-019-AC29 les barres sont dans le module des vues de table, rendues par les composants de présentation", () => {
    expect(SOURCES).toContain("src/vues-de-table/BarresDeDefinition.tsx");
    expect(lire("src/interface/composants/Table.tsx")).toContain(
      "export function BarreDeDefinition",
    );
  });
});
