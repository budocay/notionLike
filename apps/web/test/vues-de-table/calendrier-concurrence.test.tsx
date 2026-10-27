// Mises à jour reçues et déplacements concurrents (F-021-AC22, AC23) : la grille suit la table lue
// sans changer de mois, le focus suit l'entrée par l'identifiant de sa ligne, et deux répliques qui
// convergent voient la même vue, quel que soit l'ordre des mises à jour.
import { creerDocumentTable, ouvrirDocumentTable } from "@notionlike/document";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  caseDuJour,
  demonterLeCalendrier,
  entree,
  entreesDe,
  figerLHorloge,
  grilleDuCalendrier,
  lignesDuPanneau,
  rendreLeCalendrier,
  rendreLeCalendrierDepuis,
  tableDEssai,
} from "./aides-calendrier.tsx";
import { focus, recevoirDansLaTable } from "./aides-grille.tsx";
import { act } from "@testing-library/react";

figerLHorloge();

describe("mise à jour reçue (F-021-AC22)", () => {
  const UNE = [{ titre: "Dentiste", date: "2026-10-08" }];

  it("F-021-AC22 une ligne déplacée par une autre réplique apparaît à son nouveau jour, le focus reste sur la même entrée", () => {
    const { table } = rendreLeCalendrier(UNE);
    act(() => entree("Dentiste").focus());
    const { id: ligne } = table.lire().lignes[0] ?? { id: "" };
    const date = table.lire().colonnes[1]?.id ?? "";
    recevoirDansLaTable(table, (replique) => replique.ecrireCellule(ligne, date, "2026-10-22"));
    expect(entreesDe("2026-10-08")).toHaveLength(0);
    expect(caseDuJour("2026-10-22").contains(entree("Dentiste"))).toBe(true);
    expect(focus()).toBe(entree("Dentiste"));
  });

  it("F-021-AC22 le mois affiché ne change pas, même quand une ligne arrive ou part", async () => {
    const { utilisateur, table } = rendreLeCalendrier(UNE);
    await utilisateur.click(screen.getByRole("button", { name: "Mois suivant" }));
    const nom = table.lire().colonnes[0]?.id ?? "";
    const date = table.lire().colonnes[1]?.id ?? "";
    recevoirDansLaTable(table, (replique) =>
      replique.creerLigne(
        new Map([
          [nom, "Bilan"],
          [date, "2026-11-10"],
        ]),
      ),
    );
    expect(screen.getByRole("heading", { name: "novembre 2026" })).toBeDefined();
    expect(caseDuJour("2026-11-10").contains(entree("Bilan"))).toBe(true);
    const ligne = table.lire().lignes.find((une) => une.cellules[0] === "Bilan")?.id ?? "";
    recevoirDansLaTable(table, (replique) => replique.supprimerLigne(ligne));
    expect(screen.getByRole("heading", { name: "novembre 2026" })).toBeDefined();
    expect(entreesDe("2026-11-10")).toHaveLength(0);
  });

  it("F-021-AC22 une ligne qui perd sa date passe dans « Sans date », sans rechargement, le focus la suit", () => {
    const { table } = rendreLeCalendrier(UNE);
    act(() => entree("Dentiste").focus());
    const ligne = table.lire().lignes[0]?.id ?? "";
    const date = table.lire().colonnes[1]?.id ?? "";
    recevoirDansLaTable(table, (replique) => replique.ecrireCellule(ligne, date, null));
    expect(entreesDe("2026-10-08")).toHaveLength(0);
    expect(lignesDuPanneau()).toHaveLength(1);
    expect(focus()?.closest("[data-sans-date], [data-ligne]")?.getAttribute("aria-label")).toBe(
      "Dentiste",
    );
  });

  it("F-021-AC22 si l'entrée focalisée disparaît, le focus revient à la case qu'elle occupait", () => {
    const { table } = rendreLeCalendrier(UNE);
    act(() => entree("Dentiste").focus());
    const ligne = table.lire().lignes[0]?.id ?? "";
    recevoirDansLaTable(table, (replique) => replique.supprimerLigne(ligne));
    expect(entreesDe("2026-10-08")).toHaveLength(0);
    expect(focus()).toBe(caseDuJour("2026-10-08"));
  });
});

// ── Deux répliques ───────────────────────────────────────────────────────────────────────────────

function etatDeBase(): Uint8Array {
  const table = creerDocumentTable();
  tableDEssai([
    { titre: "Dentiste", date: "2026-10-08" },
    { titre: "Libre", date: null },
  ])(table);
  const etat = Y.encodeStateAsUpdate(table.doc);
  table.fermer();
  return etat;
}

interface Replique {
  readonly doc: Y.Doc;
  readonly table: ReturnType<typeof ouvrirDocumentTable>;
}

function replique(etat: Uint8Array): Replique {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, etat);
  return { doc, table: ouvrirDocumentTable(doc) };
}

function ids(r: Replique): { ligne: string; date: string } {
  const lue = r.table.lire();
  return { ligne: lue.lignes[0]?.id ?? "", date: lue.colonnes[1]?.id ?? "" };
}

/** Ce que la vue montre : chaque case non vide et le panneau, ou le message sans colonne de date. */
function vue(): string {
  if (screen.queryByRole("grid") === null) {
    return `sans grille : ${document.body.textContent ?? ""}`;
  }
  const cases = [...grilleDuCalendrier().querySelectorAll<HTMLElement>("[data-jour]")]
    .map(
      (une) =>
        [
          une.dataset.jour,
          [...une.querySelectorAll("[data-ligne]")].map((e) => e.getAttribute("aria-label")),
        ] as const,
    )
    .filter(([, libelles]) => libelles.length > 0);
  const panneau = lignesDuPanneau().map((ligne) => ligne.getAttribute("aria-label"));
  return JSON.stringify({ cases, panneau });
}

/** Rend la vue de l'état donné, la lit, puis démonte. */
function vueDe(etat: Uint8Array): string {
  const table = rendreLeCalendrierDepuis(etat);
  const lue = vue();
  demonterLeCalendrier();
  table.fermer();
  return lue;
}

/** Les deux ordres d'application des mises à jour de deux répliques à partir de la même base. */
function converger(
  jouerA: (a: Replique) => void,
  jouerB: (b: Replique) => void,
): readonly [Uint8Array, Uint8Array] {
  const base = etatDeBase();
  const a = replique(base);
  const b = replique(base);
  jouerA(a);
  jouerB(b);
  const miseAJourA = Y.encodeStateAsUpdate(a.doc);
  const miseAJourB = Y.encodeStateAsUpdate(b.doc);
  const ab = replique(base);
  Y.applyUpdate(ab.doc, miseAJourA);
  Y.applyUpdate(ab.doc, miseAJourB);
  const ba = replique(base);
  Y.applyUpdate(ba.doc, miseAJourB);
  Y.applyUpdate(ba.doc, miseAJourA);
  const resultat: [Uint8Array, Uint8Array] = [
    Y.encodeStateAsUpdate(ab.doc),
    Y.encodeStateAsUpdate(ba.doc),
  ];
  for (const r of [a, b, ab, ba]) {
    r.table.fermer();
  }
  return resultat;
}

describe("déplacements concurrents (F-021-AC23)", () => {
  it("F-021-AC23 deux répliques déplacent la même ligne vers deux jours, puis convergent : une seule entrée, au même jour sur les deux, l'un des deux choisis", () => {
    const [ab, ba] = converger(
      (a) => {
        const { ligne, date } = ids(a);
        a.table.ecrireCellule(ligne, date, "2026-10-20");
      },
      (b) => {
        const { ligne, date } = ids(b);
        b.table.ecrireCellule(ligne, date, "2026-10-22");
      },
    );
    const premiere = vueDe(ab);
    const seconde = vueDe(ba);
    expect(seconde).toBe(premiere);
    const { cases } = JSON.parse(premiere) as { cases: [string, string[]][] };
    expect(cases).toHaveLength(1);
    const [jour, libelles] = cases[0] ?? ["", []];
    expect(["2026-10-20", "2026-10-22"]).toContain(jour);
    expect(libelles).toEqual(["Dentiste"]);
  });

  it("F-021-AC23 une réplique déplace une ligne pendant que l'autre la supprime : même vue sur les deux, sans exception", () => {
    const [ab, ba] = converger(
      (a) => {
        const { ligne, date } = ids(a);
        a.table.ecrireCellule(ligne, date, "2026-10-20");
      },
      (b) => b.table.supprimerLigne(ids(b).ligne),
    );
    const premiere = vueDe(ab);
    expect(vueDe(ba)).toBe(premiere);
    expect(premiere).not.toContain("Dentiste");
  });

  it("F-021-AC23 une réplique déplace une ligne pendant que l'autre supprime la colonne de date : même vue sur les deux, sans exception", () => {
    const [ab, ba] = converger(
      (a) => {
        const { ligne, date } = ids(a);
        a.table.ecrireCellule(ligne, date, "2026-10-20");
      },
      (b) => b.table.supprimerColonne(ids(b).date),
    );
    const premiere = vueDe(ab);
    expect(vueDe(ba)).toBe(premiere);
    expect(premiere).toContain("Le calendrier place les lignes selon une colonne Date.");
  });
});
