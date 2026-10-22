// Réglages de vue d'une table (F-018-AC40 à AC44) : largeur des colonnes réglée au séparateur, au
// pointeur comme au clavier, conservée sur l'appareil par colonne, jamais dans un document ; vue
// active lue « Tableau » quand l'enregistrée n'est pas livrée.
import type { DocumentTable } from "@notionlike/document";
import { act, cleanup, fireEvent, renderHook, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  lireLesReglages,
  sectionDeLaVue,
  sectionDuTableau,
} from "../../src/vues-de-table/reglages.ts";
import { useReglages } from "../../src/vues-de-table/use-reglages.ts";
import { avecSelecteur } from "../../src/vues-de-table/vues.ts";
import { ESPACE_A } from "../aides-persistance.ts";
import { cleDesReglages } from "../aides-table.ts";
import { cellule, focus, rendreLaTable, TABLE_D_ESSAI } from "./aides-grille.tsx";

const CLE = cleDesReglages({ idEspace: ESPACE_A, idTable: TABLE_D_ESSAI });

function deuxColonnes(table: DocumentTable): void {
  table.creerColonne("Nom", "texte");
  table.creerColonne("Prix", "nombre");
  table.creerLigne();
}

function separateur(nom: string): HTMLElement {
  return screen.getByRole("separator", { name: `Largeur de la colonne ${nom}` });
}

function largeurDeLEnTete(rang: number): string {
  return cellule(1, rang + 1).style.width;
}

function enregistre(): unknown {
  const texte = localStorage.getItem(CLE);
  return texte === null ? null : JSON.parse(texte);
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("largeur des colonnes (F-018-AC43)", () => {
  it("F-018-AC43 180 pixels par défaut ; au clavier, Flèche droite et Flèche gauche règlent de 16 pixels, bornés de 60 à 800, et la largeur est conservée par colonne", async () => {
    const { table, utilisateur } = rendreLaTable(deuxColonnes);
    const nom = table.lire().colonnes[0]?.id ?? "";
    expect([largeurDeLEnTete(1), largeurDeLEnTete(2)]).toEqual(["180px", "180px"]);
    expect(separateur("Nom").getAttribute("aria-valuenow")).toBe("180");

    act(() => separateur("Nom").focus());
    await utilisateur.keyboard("{ArrowRight}{ArrowRight}");
    expect(largeurDeLEnTete(1)).toBe("212px");
    expect(enregistre()).toEqual({
      version: 1,
      sections: { tableau: { largeurs: { [nom]: 212 } } },
    });
    for (let pas = 0; pas < 15; pas += 1) {
      await utilisateur.keyboard("{ArrowLeft}");
    }
    expect(separateur("Nom").getAttribute("aria-valuenow")).toBe("60");
    await utilisateur.keyboard("{Escape}");
    expect(focus()).toBe(cellule(1, 2));
  });

  it("F-018-AC43 F-018-AC34 au clavier seul, « Régler la largeur » du menu d'en-tête porte le focus sur le séparateur", async () => {
    const { utilisateur } = rendreLaTable(deuxColonnes);
    cellule(1, 3).focus();
    await utilisateur.keyboard("{Enter}");
    const menu = await screen.findByRole("menu", { name: "Actions de la colonne Prix" });
    await utilisateur.click(
      within(menu).getByRole("menuitem", { name: "Régler la largeur de la colonne Prix" }),
    );
    expect(focus()).toBe(separateur("Prix"));
    await utilisateur.keyboard("{ArrowRight}");
    expect(largeurDeLEnTete(2)).toBe("196px");
  });

  it("F-018-AC43 glissé au pointeur, le séparateur suit le geste, borné à 800, et la largeur n'est écrite qu'au lâcher", () => {
    const { table } = rendreLaTable(deuxColonnes);
    fireEvent.pointerDown(separateur("Nom"), { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(separateur("Nom"), { clientX: 250, pointerId: 1 });
    expect(largeurDeLEnTete(1)).toBe("330px");
    expect(localStorage.getItem(CLE)).toBeNull();
    fireEvent.pointerMove(separateur("Nom"), { clientX: 2000, pointerId: 1 });
    fireEvent.pointerUp(separateur("Nom"), { clientX: 2000, pointerId: 1 });
    expect(largeurDeLEnTete(1)).toBe("800px");
    expect(enregistre()).toEqual({
      version: 1,
      sections: { tableau: { largeurs: { [table.lire().colonnes[0]?.id ?? ""]: 800 } } },
    });
    fireEvent.pointerMove(separateur("Nom"), { clientX: 10, pointerId: 1 });
    expect(largeurDeLEnTete(1)).toBe("800px");
  });

  it("F-018-AC43 F-018-AC40 rechargée, la table retrouve ses largeurs ; celles des colonnes absentes de la table lue sont retirées à l'écriture suivante", async () => {
    const premier = rendreLaTable(deuxColonnes);
    const [nom, prix] = premier.table.lire().colonnes.map(({ id }) => id);
    act(() => separateur("Nom").focus());
    await premier.utilisateur.keyboard("{ArrowRight}");
    act(() => separateur("Prix").focus());
    await premier.utilisateur.keyboard("{ArrowLeft}");
    const etat = Y.encodeStateAsUpdate(premier.table.doc);
    cleanup();

    const relu = rendreLaTable((table) => Y.applyUpdate(table.doc, etat));
    expect([largeurDeLEnTete(1), largeurDeLEnTete(2)]).toEqual(["196px", "164px"]);
    act(() => relu.table.supprimerColonne(prix ?? ""));
    act(() => separateur("Nom").focus());
    await relu.utilisateur.keyboard("{ArrowRight}");
    expect(enregistre()).toEqual({
      version: 1,
      sections: { tableau: { largeurs: { [nom ?? ""]: 212 } } },
    });
  });
});

describe("réglages sur l'appareil (F-018-AC40 à AC42)", () => {
  it("F-018-AC40 rien n'est écrit tant qu'aucun réglage ne s'écarte de sa valeur par défaut ; revenu à 180, la clé est retirée", async () => {
    const { utilisateur } = rendreLaTable(deuxColonnes);
    expect(localStorage.length).toBe(0);
    act(() => separateur("Nom").focus());
    await utilisateur.keyboard("{ArrowRight}");
    expect(localStorage.length).toBe(1);
    await utilisateur.keyboard("{ArrowLeft}");
    expect(localStorage.getItem(CLE)).toBeNull();
  });

  it("F-018-AC40 F-018-AC14 table affichée avant que son espace ne soit connu : réglages par défaut, puis, l'espace connu, ceux enregistrés sous sa clé sont relus", () => {
    localStorage.setItem(
      CLE,
      JSON.stringify({ version: 1, sections: { tableau: { largeurs: { c: 300 } } } }),
    );
    const { result, rerender } = renderHook(
      ({ idEspace }: { idEspace: string | undefined }) =>
        useReglages({ idEspace, idTable: TABLE_D_ESSAI }, ["c"]),
      { initialProps: { idEspace: undefined as string | undefined } },
    );
    expect(result.current.largeurDe("c")).toBe(180);

    rerender({ idEspace: ESPACE_A });

    expect(result.current.largeurDe("c")).toBe(300);
  });

  it("F-018-AC41 une section mal formée est lue seule à ses valeurs par défaut, et une section inconnue est gardée à la réécriture", async () => {
    localStorage.setItem(
      CLE,
      JSON.stringify({
        version: 1,
        sections: { tableau: { largeurs: { x: "large" } }, "f-019": [1, 2] },
      }),
    );
    const { table, utilisateur } = rendreLaTable(deuxColonnes);
    expect(largeurDeLEnTete(1)).toBe("180px");
    act(() => separateur("Nom").focus());
    await utilisateur.keyboard("{ArrowRight}");
    expect(enregistre()).toEqual({
      version: 1,
      sections: {
        "f-019": [1, 2],
        tableau: { largeurs: { [table.lire().colonnes[0]?.id ?? ""]: 196 } },
      },
    });
  });

  it("F-018-AC41 F-018-AC44 chaque section est validée seule : une vue absente vaut « Tableau », une largeur hors bornes rend la section à ses valeurs par défaut", () => {
    const vues = ["tableau"];
    expect(
      lireLesReglages({ vue: { active: "kanban" }, tableau: { largeurs: { a: 300 } } }, vues),
    ).toEqual({
      vueActive: "tableau",
      largeurs: new Map([["a", 300]]),
    });
    expect(
      lireLesReglages({ vue: 3, tableau: { largeurs: { a: 300, b: 801 } } }, vues).largeurs,
    ).toEqual(new Map());
    expect(lireLesReglages({ tableau: { largeurs: { a: 59.5 } } }, vues).largeurs).toEqual(
      new Map(),
    );
    expect(lireLesReglages({}, vues)).toEqual({ vueActive: "tableau", largeurs: new Map() });
  });

  it("F-018-AC42 régler une largeur au clavier et au pointeur n'écrit rien dans le document de table : état encodé inchangé, aucune mise à jour Yjs", async () => {
    const { table, utilisateur, emises } = rendreLaTable(deuxColonnes);
    const avant = Y.encodeStateAsUpdate(table.doc);
    act(() => separateur("Nom").focus());
    await utilisateur.keyboard("{ArrowRight}{ArrowLeft}{ArrowLeft}");
    fireEvent.pointerDown(separateur("Prix"), { clientX: 0, pointerId: 1 });
    fireEvent.pointerUp(separateur("Prix"), { clientX: 64, pointerId: 1 });

    expect(localStorage.getItem(CLE)).not.toBeNull();
    expect(emises).toEqual([]);
    expect(Y.encodeStateAsUpdate(table.doc)).toEqual(avant);
  });

  it("F-018-AC40 un enregistrement de réglages ne porte que des identifiants de colonne et des largeurs : ni nom, ni courriel, ni compte, ni jeton", async () => {
    const { utilisateur } = rendreLaTable(deuxColonnes);
    act(() => separateur("Nom").focus());
    await utilisateur.keyboard("{ArrowRight}");
    const texte = localStorage.getItem(CLE) ?? "";
    const lu = JSON.parse(texte) as { sections: { tableau: { largeurs: Record<string, number> } } };
    expect(lu).toEqual({ version: 1, sections: { tableau: { largeurs: expect.any(Object) } } });
    expect(Object.entries(lu.sections.tableau.largeurs)).toEqual([
      [expect.stringMatching(/^[0-9a-f-]{36}$/), 196],
    ]);
  });
});

describe("vue active et sélecteur de vues (F-018-AC44)", () => {
  it("F-018-AC44 la liste ne compte que « Tableau » : aucun sélecteur ; il paraît dès deux vues", () => {
    rendreLaTable(deuxColonnes);
    expect(screen.queryByRole("group", { name: "Vue de la table" })).toBeNull();
    expect(avecSelecteur([{ id: "tableau", libelle: "Tableau" }])).toBe(false);
    expect(
      avecSelecteur([
        { id: "tableau", libelle: "Tableau" },
        { id: "kanban", libelle: "Kanban" },
      ]),
    ).toBe(true);
  });

  it("F-018-AC44 une vue enregistrée absente de la liste : la grille « Tableau » s'affiche, et l'enregistrement n'est pas réécrit à l'ouverture", () => {
    const texte = JSON.stringify({ version: 1, sections: { vue: { active: "kanban" } } });
    localStorage.setItem(CLE, texte);
    rendreLaTable(deuxColonnes);
    expect(screen.getByRole("grid")).toBeDefined();
    expect(localStorage.getItem(CLE)).toBe(texte);
  });
});

describe("un changement n'écrit que sa section (F-018-AC41, F-018-AC44, H4)", () => {
  it("F-018-AC41 F-018-AC44 une vue enregistrée inconnue de cette version reste telle quelle, et la section « tableau » garde ses clés inconnues, quand une largeur change", async () => {
    localStorage.setItem(
      CLE,
      JSON.stringify({
        version: 1,
        sections: {
          vue: { active: "kanban", tri: "f-020" },
          tableau: { largeurs: {}, gelees: 2 },
        },
      }),
    );
    const { table, utilisateur } = rendreLaTable(deuxColonnes);
    act(() => separateur("Nom").focus());
    await utilisateur.keyboard("{ArrowRight}");
    const nom = table.lire().colonnes[0]?.id ?? "";
    expect(enregistre()).toEqual({
      version: 1,
      sections: {
        vue: { active: "kanban", tri: "f-020" },
        tableau: { largeurs: { [nom]: 196 }, gelees: 2 },
      },
    });
    await utilisateur.keyboard("{ArrowLeft}");
    expect(enregistre()).toEqual({
      version: 1,
      sections: { vue: { active: "kanban", tri: "f-020" }, tableau: { gelees: 2 } },
    });
  });
});

describe("sections écrites (F-018-AC40, F-018-AC41, H4)", () => {
  // Couture : `use-reglages.ts` est le seul appelant de `sectionDeLaVue` et `sectionDuTableau`
  // (git grep), et leur passe la section enregistrée lue au moment de l'écriture.
  it("F-018-AC40 F-018-AC41 chaque section garde les clés que cette version ne connaît pas et n'est retirée que vide", () => {
    expect(sectionDeLaVue("tableau", "tableau", undefined)).toBeUndefined();
    expect(sectionDeLaVue("kanban", "tableau", { active: "tableau" })).toEqual({
      active: "kanban",
    });
    expect(sectionDeLaVue("tableau", "tableau", { active: "kanban", tri: 1 })).toEqual({ tri: 1 });
    expect(sectionDeLaVue("tableau", "tableau", [1])).toBeUndefined();
    expect(
      sectionDuTableau(new Map([["a", 180]]), ["a"], { largeurs: { a: 300 } }),
    ).toBeUndefined();
    expect(
      sectionDuTableau(new Map([["a", 300]]), ["a"], { largeurs: { x: "large" }, g: 2 }),
    ).toEqual({ largeurs: { a: 300 }, g: 2 });
    expect(sectionDuTableau(new Map([["b", 300]]), ["a"], "illisible")).toBeUndefined();
  });

  it("F-018-AC44 F-018-AC41 choisir une vue n'écrit que la section « vue » : la section « tableau » enregistrée, et ses clés inconnues, restent telles quelles", () => {
    const tableau = { largeurs: { inconnue: 300 }, gelees: 2 };
    localStorage.setItem(
      CLE,
      JSON.stringify({ version: 1, sections: { vue: { active: "kanban" }, tableau } }),
    );
    const { result } = renderHook(() =>
      useReglages({ idEspace: ESPACE_A, idTable: TABLE_D_ESSAI }, []),
    );
    expect(result.current.vueActive).toBe("tableau");
    act(() => result.current.choisirLaVue("tableau"));
    expect(enregistre()).toEqual({ version: 1, sections: { tableau } });
    act(() => result.current.choisirLaVue("calendrier"));
    expect(enregistre()).toEqual({ version: 1, sections: { tableau } });
  });
});
