// Coutures de la vue calendrier (F-021-AC25, AC29, AC30, AC31) : lignes affichées, aucune dépendance
// nouvelle, place dans la liste des vues, section `calendrier` des réglages, aucun réglage dans un
// document, aucune animation ni couleur écrite en dur.
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { lire, lister } from "../aides-disque.ts";
import {
  CLE_DES_REGLAGES,
  caseDuJour,
  choisirLeCalendrier,
  figerLHorloge,
  libellesDe,
  lignesDuPanneau,
  rendreLeCalendrier,
  tableDEssai,
} from "./aides-calendrier.tsx";
import { rendreLaTable } from "./aides-grille.tsx";
import { VUES } from "../../src/vues-de-table/vues.ts";

// Les lignes affichées sont celles qu'une fonction décide (F-018-AC45) : ici, une sur deux, renversées,
// comme le ferait un tri ou un filtre de F-019 ; la vue n'en présente pas d'autres, dans cet ordre.
vi.mock("../../src/vues-de-table/lignes-affichees.ts", async (originales) => {
  const module = await originales<typeof import("../../src/vues-de-table/lignes-affichees.ts")>();
  return {
    ...module,
    lignesAffichees: (table: Parameters<typeof module.lignesAffichees>[0]) =>
      module
        .lignesAffichees(table)
        .filter((ligne) => ligne.cellules[0] !== "Cachée")
        .reverse(),
  };
});

figerLHorloge();

const MODULE = "src/vues-de-table";

function sansCommentaires(texte: string): string {
  return texte.replace(/\/\/.*$|\/\*[^]*?\*\//gm, "");
}

/** Les sources de la vue calendrier : ses fichiers du module et ses composants de présentation. */
function sourcesDuCalendrier(): [string, string][] {
  const duModule = lister(MODULE).filter((chemin) =>
    /calendrier|\/(jours|aujourdhui|repartition)\.ts$/i.test(chemin),
  );
  const chemins = [
    ...duModule,
    "src/interface/composants/Calendrier.tsx",
    "src/interface/composants/calendrier.classes.ts",
  ];
  return chemins.map((chemin) => [chemin, sansCommentaires(lire(chemin))]);
}

describe("lignes affichées dans le calendrier (F-021-AC25)", () => {
  it("F-021-AC25 les cases et le panneau ne présentent que les lignes affichées, dans leur ordre (F-019 n'est pas livrée : ce que la fonction écarte ne paraît nulle part)", () => {
    rendreLeCalendrier([
      { titre: "Premier", date: "2026-10-08" },
      { titre: "Cachée", date: "2026-10-08" },
      { titre: "Second", date: "2026-10-08" },
      { titre: "Libre", date: null },
      { titre: "Cachée", date: null },
    ]);
    expect(libellesDe("2026-10-08")).toEqual(["Second", "Premier"]);
    expect(lignesDuPanneau().map((ligne) => ligne.getAttribute("aria-label"))).toEqual(["Libre"]);
    expect(screen.queryAllByLabelText("Cachée")).toHaveLength(0);
  });
});

describe("aucune dépendance (F-021-AC29)", () => {
  it("F-021-AC29 le paquet de l'application ne déclare ni bibliothèque de calendrier, de dates ou de glisser-déposer", () => {
    const paquet = JSON.parse(lire("package.json")) as Record<string, Record<string, string>>;
    const noms = [
      ...Object.keys(paquet.dependencies ?? {}),
      ...Object.keys(paquet.devDependencies ?? {}),
    ];
    expect(noms.length).toBeGreaterThan(5);
    for (const nom of noms) {
      expect(nom).not.toMatch(
        /calendar|calendrier|date-fns|dayjs|luxon|moment|temporal|day-picker|datepicker/i,
      );
    }
  });

  it("F-021-AC29 les sources du calendrier n'importent que react, le paquet du document et des fichiers du projet", () => {
    const sources = sourcesDuCalendrier();
    expect(sources.length).toBeGreaterThan(10);
    for (const [chemin, texte] of sources) {
      for (const [, source = ""] of texte.matchAll(/from\s+"([^"]+)"/g)) {
        expect(
          source.startsWith(".") || ["react", "@notionlike/document"].includes(source),
          `${chemin} : ${source}`,
        ).toBe(true);
      }
    }
  });
});

describe("liste des vues et réglages (F-021-AC30)", () => {
  it("F-021-AC30 « Calendrier » est la dernière place de la liste des vues, après « Tableau »", () => {
    expect(VUES.at(-1)).toMatchObject({ id: "calendrier", libelle: "Calendrier" });
    expect(VUES[0]?.id).toBe("tableau");
  });

  it("F-021-AC30 choisir « Placer selon » n'écrit que la section `calendrier` : les autres sections et clés inconnues sont intactes, et aucun document n'est écrit", async () => {
    localStorage.setItem(
      CLE_DES_REGLAGES,
      JSON.stringify({
        version: 1,
        sections: {
          vue: { active: "calendrier" },
          tableau: { largeurs: { x: 200 } },
          inconnue: { clef: "gardée" },
        },
      }),
    );
    const { utilisateur, table, emises } = rendreLaTable((nouvelle) => {
      tableDEssai([{ titre: "Dentiste", date: "2026-10-08" }])(nouvelle);
      nouvelle.creerColonne("Fin", "date");
    });
    const etat = Y.encodeStateAsUpdate(table.doc);
    const colonne = table.lire().colonnes[2]?.id ?? "";
    await utilisateur.selectOptions(screen.getByRole("combobox", { name: "Placer selon" }), "Fin");
    const apres = JSON.parse(localStorage.getItem(CLE_DES_REGLAGES) ?? "{}") as {
      sections: Record<string, unknown>;
    };
    expect(apres.sections.calendrier).toEqual({ colonne });
    expect(apres.sections.tableau).toEqual({ largeurs: { x: 200 } });
    expect(apres.sections.vue).toEqual({ active: "calendrier" });
    expect(apres.sections.inconnue).toEqual({ clef: "gardée" });
    expect(emises).toHaveLength(0);
    expect(Y.encodeStateAsUpdate(table.doc)).toEqual(etat);
    expect(caseDuJour("2026-10-08").getAttribute("data-hors-du-mois")).toBeNull();
    expect(libellesDe("2026-10-08")).toEqual([]);
  });
});

describe("deux écrivains de la même clé de réglages (F-021-AC30, F-018-AC40)", () => {
  it("F-021-AC30 la section `calendrier` survit aux écritures de la vue Tableau : « Placer selon », bascule sur « Tableau » puis retour", async () => {
    choisirLeCalendrier();
    const { utilisateur } = rendreLaTable((nouvelle) => {
      tableDEssai([{ titre: "Dentiste", date: "2026-10-08" }])(nouvelle);
      nouvelle.creerColonne("Fin", "date");
    });
    const lue = (): { sections: Record<string, unknown> } =>
      JSON.parse(localStorage.getItem(CLE_DES_REGLAGES) ?? "{}") as {
        sections: Record<string, unknown>;
      };
    await utilisateur.selectOptions(screen.getByRole("combobox", { name: "Placer selon" }), "Fin");
    const choisie = lue().sections.calendrier;
    expect(lue().sections.vue).toEqual({ active: "calendrier" });
    expect(choisie).toEqual({ colonne: expect.any(String) });
    // Le sélecteur est rendu par chaque vue : il est relu après chaque bascule.
    const selecteur = (): HTMLElement => screen.getByRole("group", { name: "Vue de la table" });
    await utilisateur.click(within(selecteur()).getByRole("button", { name: "Tableau" }));
    // use-reglages.ts réécrit la clé (la vue active retombe sur la vue par défaut, donc sort de
    // l'enregistrement) : la section du calendrier reste telle quelle.
    expect(lue().sections.vue).toBeUndefined();
    expect(lue().sections.calendrier).toEqual(choisie);
    await utilisateur.click(within(selecteur()).getByRole("button", { name: "Calendrier" }));
    expect(lue().sections.vue).toEqual({ active: "calendrier" });
    expect(lue().sections.calendrier).toEqual(choisie);
    expect(
      (screen.getByRole("combobox", { name: "Placer selon" }) as HTMLSelectElement)
        .selectedOptions[0]?.textContent,
    ).toBe("Fin");
  });
});

describe("jetons et animations (F-021-AC31)", () => {
  it("F-021-AC31 la vue ne déclare aucune animation ni transition, et aucune couleur ou durée écrite en dur", () => {
    for (const [chemin, texte] of sourcesDuCalendrier()) {
      expect(texte, chemin).not.toMatch(/animation|transition|@keyframes|duration-|ease-/);
      expect(texte, chemin).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\[\d+(ms|s)\]/);
    }
  });
});
