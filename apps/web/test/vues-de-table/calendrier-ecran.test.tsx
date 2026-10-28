// Écran du calendrier (F-021-AC1 à AC9, AC21, AC27, AC30) : la grille du mois, la navigation, le
// placement des lignes, la colonne de date, le panneau « Sans date » et les cases chargées, rendus
// sous jsdom avec l'horloge figée au jeudi 8 octobre 2026.
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { refusDeLaDate } from "../../src/vues-de-table/dates-visees.ts";
import { jourDeLaLigne, repartir } from "../../src/vues-de-table/repartition.ts";
import {
  annonces,
  caseDuJour,
  cases,
  CLE_DES_REGLAGES,
  choisirLeCalendrier,
  entreesDe,
  figerLHorloge,
  grilleDuCalendrier,
  libellesDe,
  lignesDuPanneau,
  panneau,
  rendreLeCalendrier,
  tableDEssai,
} from "./aides-calendrier.tsx";
import { focus, rendreLaTable } from "./aides-grille.tsx";

figerLHorloge();

const bouton = (nom: string | RegExp): HTMLElement => screen.getByRole("button", { name: nom });
const reglages = (): { sections: Record<string, unknown> } =>
  JSON.parse(localStorage.getItem(CLE_DES_REGLAGES) ?? "{}") as {
    sections: Record<string, unknown>;
  };

describe("grille du mois (F-021-AC1)", () => {
  it("F-021-AC1 le calendrier s'ouvre sur octobre 2026 : titre, en-têtes de lundi à dimanche, une case par jour avec son numéro", () => {
    rendreLeCalendrier();
    expect(screen.getByRole("heading", { name: "octobre 2026" })).toBeDefined();
    expect(grilleDuCalendrier().getAttribute("aria-label")).toBe(
      "Calendrier de la table Budget, octobre 2026",
    );
    expect(
      within(grilleDuCalendrier())
        .getAllByRole("columnheader")
        .map((en) => en.textContent),
    ).toEqual(["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]);
    const jours = cases().map((une) => une.getAttribute("data-jour"));
    expect(jours).toHaveLength(35);
    expect(jours[0]).toBe("2026-09-28");
    expect(jours.at(-1)).toBe("2026-11-01");
    expect(caseDuJour("2026-10-08").textContent).toContain("8");
    expect(screen.getAllByRole("row")).toHaveLength(6);
  });

  it("F-021-AC1 les jours hors du mois sont présents avec leurs entrées et marqués par le texte (mois abrégé), pas par la couleur seule", () => {
    rendreLeCalendrier([
      { titre: "Fin septembre", date: "2026-09-30" },
      { titre: "Début novembre", date: "2026-11-01" },
    ]);
    expect(libellesDe("2026-09-30")).toEqual(["Fin septembre"]);
    expect(libellesDe("2026-11-01")).toEqual(["Début novembre"]);
    expect(caseDuJour("2026-09-30").textContent).toContain("30 sept.");
    expect(caseDuJour("2026-11-01").textContent).toContain("1 nov.");
    expect(caseDuJour("2026-09-30").hasAttribute("data-hors-du-mois")).toBe(true);
    expect(caseDuJour("2026-10-15").hasAttribute("data-hors-du-mois")).toBe(false);
    expect(caseDuJour("2026-10-15").textContent).not.toContain("oct.");
  });
});

describe("navigation entre les mois (F-021-AC2, AC3)", () => {
  it("F-021-AC2 « Mois suivant », « Mois précédent » et « Aujourd'hui » changent de mois, annoncent le titre et gardent le focus sur la commande", async () => {
    const { utilisateur } = rendreLeCalendrier();
    await utilisateur.click(bouton("Mois suivant"));
    expect(screen.getByRole("heading", { name: "novembre 2026" })).toBeDefined();
    expect(annonces()).toContain("novembre 2026");
    expect(focus()).toBe(bouton("Mois suivant"));
    await utilisateur.click(bouton("Mois précédent"));
    await utilisateur.click(bouton("Mois précédent"));
    expect(screen.getByRole("heading", { name: "septembre 2026" })).toBeDefined();
    expect(annonces()).toContain("septembre 2026");
    expect(focus()).toBe(bouton("Mois précédent"));
    await utilisateur.click(bouton("Aujourd'hui"));
    expect(screen.getByRole("heading", { name: "octobre 2026" })).toBeDefined();
    expect(focus()).toBe(bouton("Aujourd'hui"));
  });

  it("F-021-AC2 le mois affiché n'est inscrit ni dans un document, ni dans les réglages, ni dans l'adresse, et la vue rouvre sur le mois d'aujourd'hui", async () => {
    const adresse = window.location.href;
    const { utilisateur, emises } = rendreLaTableCalendrier();
    const avant = localStorage.getItem(CLE_DES_REGLAGES);
    await utilisateur.click(bouton("Mois suivant"));
    await utilisateur.click(bouton("Mois suivant"));
    expect(emises).toHaveLength(0);
    expect(localStorage.getItem(CLE_DES_REGLAGES)).toBe(avant);
    expect(window.location.href).toBe(adresse);
    expect(sessionStorage.length).toBe(0);
    expect(avant).not.toContain("2026");
    expect(screen.getByRole("heading", { name: "décembre 2026" })).toBeDefined();
  });

  it("F-021-AC2 après un démontage, le calendrier rouvre sur octobre 2026", async () => {
    const { utilisateur } = rendreLeCalendrier();
    await utilisateur.click(bouton("Mois suivant"));
    cleanup();
    rendreLeCalendrier();
    expect(screen.getByRole("heading", { name: "octobre 2026" })).toBeDefined();
  });

  it("F-021-AC3 sur janvier de l'an 1, « Mois précédent » est indisponible et la grille ne compte aucune case avant le 0001-01-01", () => {
    const instant = new Date(2000, 0, 1);
    instant.setFullYear(1, 0, 15);
    vi.setSystemTime(instant);
    rendreLeCalendrier();
    expect(screen.getByRole("heading", { name: "janvier 1" })).toBeDefined();
    expect(bouton("Mois précédent").getAttribute("aria-disabled")).toBe("true");
    expect(bouton("Mois suivant").hasAttribute("aria-disabled")).toBe(false);
    const jours = cases().map((une) => une.getAttribute("data-jour"));
    expect(jours[0]).toBe("0001-01-01");
    expect(jours).toHaveLength(35);
  });

  it("F-021-AC3 sur décembre 9999, « Mois suivant » est indisponible et la grille s'arrête au 9999-12-31", () => {
    const instant = new Date(2000, 0, 1);
    instant.setFullYear(9999, 11, 15);
    vi.setSystemTime(instant);
    rendreLeCalendrier();
    expect(screen.getByRole("heading", { name: "décembre 9999" })).toBeDefined();
    expect(bouton("Mois suivant").getAttribute("aria-disabled")).toBe("true");
    expect(bouton("Mois précédent").hasAttribute("aria-disabled")).toBe(false);
    expect(cases().at(-1)?.getAttribute("data-jour")).toBe("9999-12-31");
  });

  it("F-021-AC2 F-021-AC3 atteindre le mois limite par la commande garde le focus sur elle : indisponible par aria-disabled, sans disabled natif, et sans effet", async () => {
    const instant = new Date(2000, 0, 1);
    instant.setFullYear(1, 1, 15);
    vi.setSystemTime(instant);
    const { utilisateur } = rendreLeCalendrier();
    expect(screen.getByRole("heading", { name: "février 1" })).toBeDefined();
    await utilisateur.click(bouton("Mois précédent"));
    expect(screen.getByRole("heading", { name: "janvier 1" })).toBeDefined();
    expect(focus()).toBe(bouton("Mois précédent"));
    expect(document.activeElement).not.toBe(document.body);
    expect((bouton("Mois précédent") as HTMLButtonElement).disabled).toBe(false);
    expect(bouton("Mois précédent").getAttribute("aria-disabled")).toBe("true");
    expect(bouton("Mois précédent").getAttribute("aria-describedby")).not.toBeNull();
    await utilisateur.click(bouton("Mois précédent"));
    expect(screen.getByRole("heading", { name: "janvier 1" })).toBeDefined();
    expect(focus()).toBe(bouton("Mois précédent"));
  });

  it("F-021-AC2 F-021-AC3 depuis novembre 9999, « Mois suivant » garde le focus à la borne de décembre 9999", async () => {
    const instant = new Date(2000, 0, 1);
    instant.setFullYear(9999, 10, 15);
    vi.setSystemTime(instant);
    const { utilisateur } = rendreLeCalendrier();
    await utilisateur.click(bouton("Mois suivant"));
    expect(screen.getByRole("heading", { name: "décembre 9999" })).toBeDefined();
    expect(focus()).toBe(bouton("Mois suivant"));
    expect(bouton("Mois suivant").getAttribute("aria-disabled")).toBe("true");
  });
});

function rendreLaTableCalendrier(): ReturnType<typeof rendreLeCalendrier> {
  return rendreLeCalendrier([{ titre: "A", date: "2026-10-08" }]);
}

describe("aujourd'hui (F-021-AC4)", () => {
  it("F-021-AC4 la case d'aujourd'hui porte « date courante » et un numéro souligné ; aucune autre ; elle disparaît d'un autre mois", async () => {
    const { utilisateur } = rendreLeCalendrier();
    const courantes = cases().filter((une) => une.getAttribute("aria-current") === "date");
    expect(courantes.map((une) => une.getAttribute("data-jour"))).toEqual(["2026-10-08"]);
    expect(courantes[0]?.querySelector("span")?.className).toContain("underline");
    expect(caseDuJour("2026-10-07").querySelector("span")?.className).not.toContain("underline");
    await utilisateur.click(bouton("Mois suivant"));
    expect(cases().some((une) => une.hasAttribute("aria-current"))).toBe(false);
  });

  it("F-021-AC4 à minuit passé, la case suivante devient la case courante", () => {
    vi.setSystemTime(new Date(2026, 9, 9, 0, 0, 1));
    rendreLeCalendrier();
    expect(caseDuJour("2026-10-09").getAttribute("aria-current")).toBe("date");
    expect(caseDuJour("2026-10-08").hasAttribute("aria-current")).toBe(false);
  });
});

describe("placement des lignes (F-021-AC5)", () => {
  it("F-021-AC5 chaque ligne datée du mois est une entrée dans la case de son jour, une seule fois, dans l'ordre des lignes", () => {
    rendreLeCalendrier([
      { titre: "Deuxième", date: "2026-10-08" },
      { titre: "Autre jour", date: "2026-10-20" },
      { titre: "Premier", date: "2026-10-08" },
    ]);
    expect(libellesDe("2026-10-08")).toEqual(["Deuxième", "Premier"]);
    expect(libellesDe("2026-10-20")).toEqual(["Autre jour"]);
    expect(grilleDuCalendrier().querySelectorAll("[data-ligne]")).toHaveLength(3);
    expect(cases().filter((une) => entreesDe(une.dataset.jour ?? "").length > 0)).toHaveLength(2);
  });

  it("F-021-AC5 la comparaison est celle des chaînes : une date d'un autre mois n'est ni dans une case ni dans « Sans date »", () => {
    rendreLeCalendrier([
      { titre: "Noël", date: "2026-12-25" },
      { titre: "Sans", date: null },
    ]);
    expect(grilleDuCalendrier().querySelectorAll("[data-ligne]")).toHaveLength(0);
    expect(lignesDuPanneau().map((ligne) => ligne.getAttribute("aria-label"))).toEqual(["Sans"]);
  });

  it("F-021-AC5 la répartition est une fonction sans DOM qui compare des chaînes AAAA-MM-JJ", () => {
    const grille = ["2026-10-07", "2026-10-08"];
    const ligne = (id: string, cellule: unknown) => ({ id, cellules: [cellule as string | null] });
    const lignes = [ligne("a", "2026-10-08"), ligne("b", "2026-10-8"), ligne("c", null)];
    const repartition = repartir(lignes, 0, grille);
    expect(repartition.parJour.get("2026-10-08")?.map((une) => une.id)).toEqual(["a"]);
    expect(repartition.parJour.get("2026-10-07")).toEqual([]);
    expect(repartition.sansDate.map((une) => une.id)).toEqual(["b", "c"]);
    expect(jourDeLaLigne(ligne("d", 5), 0)).toBeUndefined();
  });
});

describe("colonne de date (F-021-AC6, AC7)", () => {
  const deuxDates = (table: Parameters<ReturnType<typeof tableDEssai>>[0]): void => {
    const nom = table.creerColonne("Nom", "texte");
    const debut = table.creerColonne("Début", "date");
    const fin = table.creerColonne("Fin", "date");
    table.creerLigne(
      new Map([
        [nom, "Chantier"],
        [debut, "2026-10-05"],
        [fin, "2026-10-12"],
      ]),
    );
  };

  it("F-021-AC6 la première colonne date sert de repère ; « Placer selon » offre le choix, conservé par identifiant dans la section « calendrier » sans toucher aux autres", async () => {
    choisirLeCalendrier({ tableau: { largeurs: { x: 200 }, inconnue: 1 } });
    const { utilisateur, table, emises } = rendreLaTable(deuxDates);
    expect(libellesDe("2026-10-05")).toEqual(["Chantier"]);
    const choix = screen.getByRole("combobox", { name: "Placer selon" });
    await utilisateur.selectOptions(choix, "Fin");
    expect(libellesDe("2026-10-12")).toEqual(["Chantier"]);
    expect(libellesDe("2026-10-05")).toEqual([]);
    const fin = table.lire().colonnes.find((colonne) => colonne.nom === "Fin")?.id;
    expect(reglages().sections).toEqual({
      vue: { active: "calendrier" },
      tableau: { largeurs: { x: 200 }, inconnue: 1 },
      calendrier: { colonne: fin },
    });
    expect(emises).toHaveLength(0);
  });

  it("F-021-AC6 une colonne choisie supprimée par une mise à jour reçue : retour à la première", async () => {
    choisirLeCalendrier();
    const { table, utilisateur } = rendreLaTable(deuxDates);
    await utilisateur.selectOptions(screen.getByRole("combobox", { name: "Placer selon" }), "Fin");
    const fin = table.lire().colonnes.find((colonne) => colonne.nom === "Fin")?.id ?? "";
    act(() => table.supprimerColonne(fin));
    expect(libellesDe("2026-10-05")).toEqual(["Chantier"]);
    expect(screen.queryByRole("combobox", { name: "Placer selon" })).toBeNull();
  });

  it("F-021-AC6 avec une seule colonne date, aucun « Placer selon »", () => {
    rendreLeCalendrier();
    expect(screen.queryByRole("combobox", { name: "Placer selon" })).toBeNull();
  });

  it("F-021-AC7 sans colonne date : le message et « Ajouter une colonne Date », qui ouvre l'ajout avec le type Date ; aucune colonne créée par la vue", async () => {
    choisirLeCalendrier();
    const { utilisateur, table, emises } = rendreLaTable((vide) => {
      vide.creerColonne("Nom", "texte");
    });
    expect(screen.queryByRole("grid", { name: /^Calendrier/ })).toBeNull();
    expect(
      screen.getByText("Le calendrier place les lignes selon une colonne Date."),
    ).toBeDefined();
    expect(emises).toHaveLength(0);
    await utilisateur.click(bouton("Ajouter une colonne Date"));
    const boite = screen.getByRole("dialog");
    expect((within(boite).getByRole("combobox") as HTMLSelectElement).value).toBe("date");
    expect(table.lire().colonnes).toHaveLength(1);
    await utilisateur.click(within(boite).getByRole("button", { name: "Annuler" }));
    expect(table.lire().colonnes).toHaveLength(1);
    expect(emises).toHaveLength(0);
    // Le focus revient à la commande d'origine (F-021-AC7, F-018-AC21).
    expect(focus()).toBe(bouton("Ajouter une colonne Date"));
  });

  it("F-021-AC7 le focus revient à « Ajouter une colonne Date » après Échap sur la boîte", async () => {
    choisirLeCalendrier();
    const { utilisateur } = rendreLaTable((vide) => {
      vide.creerColonne("Nom", "texte");
    });
    await utilisateur.click(bouton("Ajouter une colonne Date"));
    await utilisateur.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(focus()).toBe(bouton("Ajouter une colonne Date"));
  });

  it("F-021-AC7 la colonne créée par la boîte met le calendrier en place", async () => {
    choisirLeCalendrier();
    const { utilisateur, table } = rendreLaTable((vide) => {
      vide.creerColonne("Nom", "texte");
    });
    await utilisateur.click(bouton("Ajouter une colonne Date"));
    const boite = screen.getByRole("dialog");
    await utilisateur.type(within(boite).getByRole("textbox"), "Échéance");
    await utilisateur.click(within(boite).getByRole("button", { name: "Créer la colonne" }));
    expect(table.lire().colonnes.map((colonne) => [colonne.nom, colonne.type])).toEqual([
      ["Nom", "texte"],
      ["Échéance", "date"],
    ]);
    expect(screen.getByRole("grid", { name: /^Calendrier/ })).toBeDefined();
    // Le focus passe à la case focalisable de la grille, pas au corps de la page.
    expect(focus()).toBe(caseDuJour("2026-10-08"));
  });

  it("F-021-AC7 une colonne créée d'un autre type que Date laisse l'invitation, qui reprend le focus", async () => {
    choisirLeCalendrier();
    const { utilisateur } = rendreLaTable((vide) => {
      vide.creerColonne("Nom", "texte");
    });
    await utilisateur.click(bouton("Ajouter une colonne Date"));
    const boite = screen.getByRole("dialog");
    await utilisateur.selectOptions(within(boite).getByRole("combobox"), "texte");
    await utilisateur.type(within(boite).getByRole("textbox"), "Notes");
    await utilisateur.click(within(boite).getByRole("button", { name: "Créer la colonne" }));
    expect(screen.queryByRole("grid", { name: /^Calendrier/ })).toBeNull();
    expect(focus()).toBe(bouton("Ajouter une colonne Date"));
  });
});

describe("panneau « Sans date » (F-021-AC8)", () => {
  const sansDate = (nombre: number) =>
    Array.from({ length: nombre }, (_, rang) => ({ titre: `Ligne ${String(rang)}`, date: null }));

  it("F-021-AC8 le panneau titre le nombre de lignes sans date et en liste les 100 premières puis « Afficher 100 lignes de plus »", async () => {
    const { utilisateur } = rendreLeCalendrier(sansDate(150));
    expect(screen.getByRole("heading", { name: "Sans date (150)" })).toBeDefined();
    expect(lignesDuPanneau()).toHaveLength(100);
    await utilisateur.click(bouton("Afficher 100 lignes de plus"));
    expect(lignesDuPanneau()).toHaveLength(150);
    expect(screen.queryByRole("button", { name: "Afficher 100 lignes de plus" })).toBeNull();
  });

  it("F-021-AC8 sans ligne sans date, le panneau le dit", () => {
    rendreLeCalendrier([{ titre: "A", date: "2026-10-08" }]);
    expect(within(panneau()).getByText("Toutes les lignes ont une date.")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Sans date (0)" })).toBeDefined();
  });

  it("F-021-AC8 une valeur non conforme ou hors des bornes se lit sans date", () => {
    const grille = ["2026-10-08"];
    const ligne = (id: string, cellule: unknown) => ({ id, cellules: [cellule as string | null] });
    const repartition = repartir(
      [ligne("1", "hier"), ligne("2", "0000-01-01"), ligne("3", "2026-02-30"), ligne("4", 42)],
      0,
      grille,
    );
    expect(repartition.sansDate.map((une) => une.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("F-021-AC8 « Définir la date » ouvre le champ de date ; valider place la ligne dans la case de son jour et la retire du panneau", async () => {
    const { utilisateur, table } = rendreLeCalendrier([{ titre: "Sans jour", date: null }]);
    await utilisateur.click(bouton("Définir la date : Sans jour"));
    const boite = screen.getByRole("dialog");
    fireEvent.change(within(boite).getByLabelText("Date"), { target: { value: "2026-10-20" } });
    await utilisateur.click(within(boite).getByRole("button", { name: "Valider" }));
    expect(libellesDe("2026-10-20")).toEqual(["Sans jour"]);
    expect(lignesDuPanneau()).toHaveLength(0);
    expect(table.lire().lignes[0]?.cellules[1]).toBe("2026-10-20");
  });

  // jsdom assainit en chaîne vide une année inférieure à 1 : « 0000-12-31 » n'atteint pas la
  // validation par le champ (le cas est prouvé plus bas, par la fonction de refus).
  it.each([
    ["vide", ""],
    ["après l'an 9999", "10000-01-01"],
  ])(
    "F-021-AC8 un jour %s est refusé par la boîte, en français : aucune mise à jour du document, et la ligne reste dans « Sans date »",
    async (_cas, saisie) => {
      const { utilisateur, table, emises } = rendreLeCalendrier([
        { titre: "Sans jour", date: null },
      ]);
      await utilisateur.click(bouton("Définir la date : Sans jour"));
      const boite = screen.getByRole("dialog");
      const champ = within(boite).getByLabelText("Date") as HTMLInputElement;
      fireEvent.change(champ, { target: { value: saisie } });
      expect(champ.value).toBe(saisie);
      await utilisateur.click(within(boite).getByRole("button", { name: "Valider" }));
      expect(within(boite).getByRole("alert").textContent).toContain("Saisissez une date valide.");
      expect(table.lire().lignes[0]?.cellules[1]).toBeNull();
      expect(emises).toHaveLength(0);
      expect(lignesDuPanneau()).toHaveLength(1);
      expect(screen.getByRole("heading", { name: "Sans date (1)" })).toBeDefined();
    },
  );
});

describe("refus d'une date saisie (F-021-AC8, F-018-AC30)", () => {
  it.each(["", "0000-12-31", "10000-01-01", "2026-02-30", "2026-13-01", "abc", "2026-1-5"])(
    "F-021-AC8 %j est refusé avec le message de F-018-AC30, sans rien écrire",
    (saisie) => {
      const ecrire = vi.fn<(jour: string) => string | undefined>(() => undefined);
      expect(refusDeLaDate(saisie, ecrire)).toBe("Saisissez une date valide.");
      expect(ecrire).not.toHaveBeenCalled();
    },
  );

  it.each(["0001-01-01", "2026-10-20", "9999-12-31"])(
    "F-021-AC8 %s est transmis tel quel à l'écriture, dont le refus est rendu",
    (saisie) => {
      const ecrire = vi.fn<(jour: string) => string | undefined>(() => "Refusé par le document.");
      expect(refusDeLaDate(saisie, ecrire)).toBe("Refusé par le document.");
      expect(ecrire).toHaveBeenCalledExactlyOnceWith(saisie);
      expect(refusDeLaDate(saisie, () => undefined)).toBeUndefined();
    },
  );
});

describe("cases chargées (F-021-AC9)", () => {
  const cinq = Array.from({ length: 5 }, (_, rang) => ({
    titre: `Réunion ${String(rang + 1)}`,
    date: "2026-10-08",
  }));

  it("F-021-AC9 une case montre ses trois premières entrées et « 2 autres » ; la commande les présente toutes, jusqu'au changement de mois", async () => {
    const { utilisateur } = rendreLeCalendrier(cinq);
    expect(libellesDe("2026-10-08")).toEqual(["Réunion 1", "Réunion 2", "Réunion 3"]);
    await utilisateur.click(bouton("2 autres le jeudi 8 octobre 2026"));
    expect(libellesDe("2026-10-08")).toHaveLength(5);
    expect(screen.queryByRole("button", { name: /autres/ })).toBeNull();
    await utilisateur.click(bouton("Mois suivant"));
    await utilisateur.click(bouton("Mois précédent"));
    expect(libellesDe("2026-10-08")).toHaveLength(3);
  });

  it("F-021-AC9 le nom accessible d'une case est le jour en toutes lettres et le nombre de ses entrées", () => {
    rendreLeCalendrier(cinq);
    expect(caseDuJour("2026-10-08").getAttribute("aria-label")).toBe(
      "jeudi 8 octobre 2026, 5 entrées",
    );
    expect(caseDuJour("2026-10-09").getAttribute("aria-label")).toBe(
      "vendredi 9 octobre 2026, aucune entrée",
    );
    expect(caseDuJour("2026-10-01").getAttribute("aria-label")).toBe(
      "jeudi 1er octobre 2026, aucune entrée",
    );
  });
});

describe("grille accessible (F-021-AC21)", () => {
  it("F-021-AC21 la grille a des rangées de semaine, des en-têtes de colonne et des cases ; chaque entrée est nommée par son libellé", () => {
    rendreLeCalendrier([{ titre: "Dentiste", date: "2026-10-08" }]);
    const rangs = within(grilleDuCalendrier()).getAllByRole("row");
    expect(rangs).toHaveLength(6);
    expect(within(rangs[1] as HTMLElement).getAllByRole("gridcell")).toHaveLength(7);
    expect(within(grilleDuCalendrier()).getByRole("group", { name: "Dentiste" })).toBeDefined();
  });

  it("F-021-AC21 les noms de mois et de jours viennent de listes fixes : aucune lecture de la langue de l'appareil", () => {
    const intl = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new Error("la langue de l'appareil ne doit pas être lue");
    });
    const locale = vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(() => {
      throw new Error("la langue de l'appareil ne doit pas être lue");
    });
    rendreLeCalendrier([{ titre: "Dentiste", date: "2026-10-08" }]);
    expect(caseDuJour("2026-10-08").getAttribute("aria-label")).toBe(
      "jeudi 8 octobre 2026, 1 entrée",
    );
    expect(intl).not.toHaveBeenCalled();
    expect(locale).not.toHaveBeenCalled();
  });
});

describe("contenu d'une table (F-021-AC27)", () => {
  const BALISE = '<img src=x onerror="alert(1)">';

  it("F-021-AC27 un libellé et un nom de colonne balisés s'affichent comme du texte dans les cases, le panneau et les noms accessibles", () => {
    const requete = vi.fn();
    vi.stubGlobal("fetch", requete);
    choisirLeCalendrier();
    rendreLaTable((table) => {
      const nom = table.creerColonne("Nom", "texte");
      const date = table.creerColonne("<b>Échéance</b>", "date");
      table.creerColonne("<i>Autre</i>", "date");
      table.creerLigne(
        new Map([
          [nom, BALISE],
          [date, "2026-10-08"],
        ]),
      );
      table.creerLigne(
        new Map([
          [nom, "<script>x</script>"],
          [date, null],
        ]),
      );
    });
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("b, i")).toBeNull();
    // Deux colonnes de date : « Placer selon » est rendu, et nomme les colonnes comme du texte.
    const choix = screen.getByRole("combobox", { name: "Placer selon" });
    expect(
      within(choix)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["<b>Échéance</b>", "<i>Autre</i>"]);
    expect(within(choix).getByRole("option", { name: "<b>Échéance</b>" })).toBeDefined();
    expect(entreesDe("2026-10-08")[0]?.textContent).toContain(BALISE);
    expect(entreesDe("2026-10-08")[0]?.getAttribute("aria-label")).toBe(BALISE);
    expect(lignesDuPanneau()[0]?.textContent).toContain("<script>x</script>");
    expect(requete).not.toHaveBeenCalled();
  });

  it("F-021-AC27 les annonces d'un déplacement citent le libellé balisé comme du texte", async () => {
    choisirLeCalendrier();
    const { utilisateur } = rendreLaTable((table) => {
      const nom = table.creerColonne("Nom", "texte");
      const date = table.creerColonne("Échéance", "date");
      table.creerLigne(
        new Map([
          [nom, BALISE],
          [date, "2026-10-08"],
        ]),
      );
    });
    await utilisateur.click(bouton(`Actions de l'entrée ${BALISE}`));
    await utilisateur.click(screen.getByRole("menuitem", { name: `Jour suivant : ${BALISE}` }));
    expect(annonces()).toBe(`${BALISE}, déplacée au vendredi 9 octobre 2026.`);
    expect(document.querySelector("img")).toBeNull();
  });
});
