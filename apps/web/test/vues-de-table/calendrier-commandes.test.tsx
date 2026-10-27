// Commandes du calendrier (F-021-AC10 à AC14, AC24, AC26) : créer, titrer, supprimer, déplacer au
// clavier comme au pointeur, une seule opération du document par commande, le focus et les annonces,
// les refus du document et la lecture seule.
import { ErreurDocument } from "@notionlike/document";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { messageErreur } from "../../src/interface/messages.ts";
import {
  annonces,
  caseDuJour,
  entree,
  entreesDe,
  figerLHorloge,
  grilleDuCalendrier,
  libellesDe,
  lignesDuPanneau,
  rendreLeCalendrier,
} from "./aides-calendrier.tsx";
import { focus } from "./aides-grille.tsx";

figerLHorloge();

const ALT_MAJ = (touche: string): string => `{Alt>}{Shift>}{${touche}}{/Shift}{/Alt}`;
const bouton = (nom: string | RegExp): HTMLElement => screen.getByRole("button", { name: nom });
const element = (nom: string): HTMLElement => screen.getByRole("menuitem", { name: nom });
const JEUDI = "jeudi 8 octobre 2026";
const UNE = [{ titre: "Dentiste", date: "2026-10-08" }];

function dateDe(table: ReturnType<typeof rendreLeCalendrier>["table"], rang = 0): unknown {
  return table.lire().lignes[rang]?.cellules[1];
}

describe("nouvelle ligne et titre (F-021-AC10)", () => {
  it("F-021-AC10 « Nouvelle ligne » crée, en une seule opération, la dernière ligne datée du jour de la case, puis ouvre la saisie de son titre", async () => {
    const { utilisateur, table, emises } = rendreLeCalendrier(UNE);
    await utilisateur.click(bouton(`Nouvelle ligne le ${JEUDI}`));
    expect(emises).toHaveLength(1);
    expect(table.lire().lignes).toHaveLength(2);
    expect(dateDe(table, 1)).toBe("2026-10-08");
    const champ = within(caseDuJour("2026-10-08")).getByRole("textbox");
    expect(focus()).toBe(champ);
    await utilisateur.keyboard("Réunion{Enter}");
    expect(table.lire().lignes[1]?.cellules[0]).toBe("Réunion");
    expect(libellesDe("2026-10-08")).toEqual(["Dentiste", "Réunion"]);
    expect(focus()).toBe(entree("Réunion"));
  });

  it("F-021-AC10 sans colonne de titre, la ligne est créée sans saisie et « Modifier le titre » est indisponible", async () => {
    const { utilisateur, table } = rendreLeCalendrier();
    act(() => table.supprimerColonne(table.lire().colonnes[0]?.id ?? ""));
    await utilisateur.click(bouton(`Nouvelle ligne le ${JEUDI}`));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(entreesDe("2026-10-08")).toHaveLength(1);
    await utilisateur.click(bouton("Actions de l'entrée Sans titre"));
    const modifier = element("Modifier le titre : Sans titre") as HTMLButtonElement;
    expect(modifier.disabled).toBe(true);
    expect(modifier.textContent).toContain("Aucune colonne de titre.");
  });

  it("F-021-AC10 Entrée et F2 ouvrent la saisie du titre ; Entrée la valide, Échap l'abandonne sans écrire", async () => {
    const { utilisateur, table, emises } = rendreLeCalendrier(UNE);
    act(() => entree("Dentiste").focus());
    await utilisateur.keyboard("{Enter}");
    const champ = within(caseDuJour("2026-10-08")).getByRole("textbox");
    expect((champ as HTMLInputElement).value).toBe("Dentiste");
    await utilisateur.keyboard("{Escape}");
    expect(emises).toHaveLength(0);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(focus()).toBe(entree("Dentiste"));
    await utilisateur.keyboard("{F2}");
    await utilisateur.keyboard("{Control>}a{/Control}Médecin{Enter}");
    expect(table.lire().lignes[0]?.cellules[0]).toBe("Médecin");
    expect(emises).toHaveLength(1);
    expect(focus()).toBe(entree("Médecin"));
  });

  it("F-021-AC10 « Supprimer la ligne » demande une confirmation ; annuler n'écrit rien, confirmer supprime et rend le focus à la case", async () => {
    const { utilisateur, table, emises } = rendreLeCalendrier(UNE);
    await utilisateur.click(bouton("Actions de l'entrée Dentiste"));
    await utilisateur.click(element("Supprimer la ligne : Dentiste"));
    const boite = screen.getByRole("alertdialog");
    await utilisateur.click(within(boite).getByRole("button", { name: "Annuler" }));
    expect(emises).toHaveLength(0);
    await utilisateur.click(bouton("Actions de l'entrée Dentiste"));
    await utilisateur.click(element("Supprimer la ligne : Dentiste"));
    await utilisateur.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Supprimer la ligne" }),
    );
    expect(table.lire().lignes).toHaveLength(0);
    expect(emises).toHaveLength(1);
    expect(entreesDe("2026-10-08")).toHaveLength(0);
    expect(focus()).toBe(caseDuJour("2026-10-08"));
  });
});

describe("déplacements (F-021-AC11)", () => {
  it.each([
    ["ArrowRight", "2026-10-09"],
    ["ArrowLeft", "2026-10-07"],
    ["ArrowDown", "2026-10-15"],
    ["ArrowUp", "2026-10-01"],
  ])(
    "F-021-AC11 Alt+Maj+%s sur l'entrée écrit la cellule de date du jour %s, en une seule opération et rien d'autre",
    async (touche, jour) => {
      const { utilisateur, table, emises } = rendreLeCalendrier(UNE);
      act(() => entree("Dentiste").focus());
      await utilisateur.keyboard(ALT_MAJ(touche));
      expect(emises).toHaveLength(1);
      expect(dateDe(table)).toBe(jour);
      expect(table.lire().lignes[0]?.cellules[0]).toBe("Dentiste");
      expect(libellesDe(jour)).toEqual(["Dentiste"]);
    },
  );

  it("F-021-AC11 les quatre déplacements, « Changer la date » et « Retirer la date » sont dans le menu de l'entrée, avec leurs raccourcis", async () => {
    const { utilisateur } = rendreLeCalendrier(UNE);
    await utilisateur.click(bouton("Actions de l'entrée Dentiste"));
    const noms = within(screen.getByRole("menu"))
      .getAllByRole("menuitem")
      .map((une) => une.getAttribute("aria-label"));
    expect(noms).toEqual([
      "Modifier le titre : Dentiste",
      "Jour précédent : Dentiste",
      "Jour suivant : Dentiste",
      "Semaine précédente : Dentiste",
      "Semaine suivante : Dentiste",
      "Changer la date : Dentiste",
      "Retirer la date : Dentiste",
      "Supprimer la ligne : Dentiste",
    ]);
    expect(entree("Dentiste").getAttribute("aria-keyshortcuts")).toBe(
      "Alt+Shift+ArrowLeft Alt+Shift+ArrowRight Alt+Shift+ArrowUp Alt+Shift+ArrowDown",
    );
  });

  it("F-021-AC11 « Changer la date » écrit le jour choisi ; le jour que la ligne porte déjà n'émet aucune mise à jour", async () => {
    const { utilisateur, table, emises } = rendreLeCalendrier(UNE);
    await utilisateur.click(bouton("Actions de l'entrée Dentiste"));
    await utilisateur.click(element("Changer la date : Dentiste"));
    const champ = within(screen.getByRole("dialog")).getByLabelText("Date");
    expect((champ as HTMLInputElement).value).toBe("2026-10-08");
    await utilisateur.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Valider" }),
    );
    expect(emises).toHaveLength(0);
    await utilisateur.click(bouton("Actions de l'entrée Dentiste"));
    await utilisateur.click(element("Changer la date : Dentiste"));
    fireEvent.change(within(screen.getByRole("dialog")).getByLabelText("Date"), {
      target: { value: "2026-10-22" },
    });
    await utilisateur.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Valider" }),
    );
    expect(emises).toHaveLength(1);
    expect(dateDe(table)).toBe("2026-10-22");
  });

  it("F-021-AC11 « Retirer la date » vide la cellule en une seule opération ; la ligne passe dans « Sans date »", async () => {
    const { utilisateur, table, emises } = rendreLeCalendrier(UNE);
    await utilisateur.click(bouton("Actions de l'entrée Dentiste"));
    await utilisateur.click(element("Retirer la date : Dentiste"));
    expect(emises).toHaveLength(1);
    expect(dateDe(table)).toBeNull();
    expect(lignesDuPanneau().map((ligne) => ligne.getAttribute("aria-label"))).toEqual([
      "Dentiste",
    ]);
    await utilisateur.click(bouton("Retirer la date : Dentiste"));
    expect(emises).toHaveLength(1);
  });

  it("F-021-AC11 les lignes du panneau « Sans date » offrent « Définir la date » et « Retirer la date »", () => {
    rendreLeCalendrier([{ titre: "Libre", date: null }]);
    expect(bouton("Définir la date : Libre")).toBeDefined();
    expect(bouton("Retirer la date : Libre")).toBeDefined();
  });
});

describe("bornes du calendrier (F-021-AC12)", () => {
  it("F-021-AC12 le jour visé hors des bornes : commande et raccourci indisponibles, aucune mise à jour", async () => {
    const instant = new Date(2000, 0, 1);
    instant.setFullYear(1, 0, 15);
    vi.setSystemTime(instant);
    const { utilisateur, emises } = rendreLeCalendrier([{ titre: "Origine", date: "0001-01-01" }]);
    expect(entree("Origine").getAttribute("aria-keyshortcuts")).toBe(
      "Alt+Shift+ArrowRight Alt+Shift+ArrowDown",
    );
    await utilisateur.click(bouton("Actions de l'entrée Origine"));
    const precedent = element("Jour précédent : Origine") as HTMLButtonElement;
    expect(precedent.disabled).toBe(true);
    expect(precedent.hasAttribute("aria-keyshortcuts")).toBe(false);
    expect((element("Semaine précédente : Origine") as HTMLButtonElement).disabled).toBe(true);
    expect((element("Jour suivant : Origine") as HTMLButtonElement).disabled).toBe(false);
    await utilisateur.keyboard("{Escape}");
    act(() => entree("Origine").focus());
    await utilisateur.keyboard(ALT_MAJ("ArrowLeft"));
    await utilisateur.keyboard(ALT_MAJ("ArrowUp"));
    expect(emises).toHaveLength(0);
  });

  it("F-021-AC12 le 9999-12-31 n'a pas de lendemain ni de semaine suivante", async () => {
    const instant = new Date(2000, 0, 1);
    instant.setFullYear(9999, 11, 15);
    vi.setSystemTime(instant);
    const { utilisateur, emises } = rendreLeCalendrier([{ titre: "Fin", date: "9999-12-31" }]);
    act(() => entree("Fin").focus());
    await utilisateur.keyboard(ALT_MAJ("ArrowRight"));
    await utilisateur.keyboard(ALT_MAJ("ArrowDown"));
    expect(emises).toHaveLength(0);
    await utilisateur.keyboard(ALT_MAJ("ArrowLeft"));
    expect(emises).toHaveLength(1);
  });
});

describe("focus et annonces (F-021-AC13)", () => {
  it("F-021-AC13 une entrée déplacée garde le focus et son libellé et son nouveau jour sont annoncés", async () => {
    const { utilisateur } = rendreLeCalendrier(UNE);
    act(() => entree("Dentiste").focus());
    await utilisateur.keyboard(ALT_MAJ("ArrowRight"));
    expect(focus()).toBe(entree("Dentiste"));
    expect(caseDuJour("2026-10-09").contains(focus())).toBe(true);
    expect(annonces()).toBe("Dentiste, déplacée au vendredi 9 octobre 2026.");
  });

  it("F-021-AC13 un jour hors de la grille fait afficher son mois, sans perdre le focus de l'entrée", async () => {
    const { utilisateur } = rendreLeCalendrier([{ titre: "Bilan", date: "2026-11-01" }]);
    act(() => entree("Bilan").focus());
    await utilisateur.keyboard(ALT_MAJ("ArrowRight"));
    expect(screen.getByRole("heading", { name: "novembre 2026" })).toBeDefined();
    expect(focus()).toBe(entree("Bilan"));
    expect(caseDuJour("2026-11-02").contains(focus())).toBe(true);
    expect(annonces()).toBe("Bilan, déplacée au lundi 2 novembre 2026.");
  });

  it("F-021-AC13 une case déjà pleine présente toutes ses entrées quand l'entrée déplacée n'y serait pas visible", async () => {
    const { utilisateur } = rendreLeCalendrier([
      { titre: "Un", date: "2026-10-09" },
      { titre: "Deux", date: "2026-10-09" },
      { titre: "Trois", date: "2026-10-09" },
      { titre: "Mobile", date: "2026-10-08" },
    ]);
    act(() => entree("Mobile").focus());
    await utilisateur.keyboard(ALT_MAJ("ArrowRight"));
    expect(libellesDe("2026-10-09")).toEqual(["Un", "Deux", "Trois", "Mobile"]);
    expect(focus()).toBe(entree("Mobile"));
  });

  it("F-021-AC13 une date retirée porte le focus sur la ligne dans « Sans date » et l'annonce", async () => {
    const { utilisateur } = rendreLeCalendrier(UNE);
    await utilisateur.click(bouton("Actions de l'entrée Dentiste"));
    await utilisateur.click(element("Retirer la date : Dentiste"));
    expect(focus()).toBe(lignesDuPanneau()[0]);
    expect(annonces()).toBe("Dentiste, sans date.");
  });
});

describe("pointeur et clavier (F-021-AC14)", () => {
  it("F-021-AC14 chaque commande de F-021-AC11 se déclenche au pointeur, par le menu de l'entrée ; aucune entrée ne se glisse", async () => {
    const { utilisateur, table } = rendreLeCalendrier(UNE);
    expect(grilleDuCalendrier().querySelector('[draggable="true"]')).toBeNull();
    const attendus: [string, string][] = [
      ["Jour suivant", "2026-10-09"],
      ["Jour précédent", "2026-10-08"],
      ["Semaine suivante", "2026-10-15"],
      ["Semaine précédente", "2026-10-08"],
      ["Retirer la date", ""],
    ];
    for (const [commande, jour] of attendus) {
      await utilisateur.click(bouton("Actions de l'entrée Dentiste"));
      await utilisateur.click(element(`${commande} : Dentiste`));
      expect(dateDe(table) ?? "").toBe(jour);
    }
  });

  it("F-021-AC14 le menu de l'entrée s'ouvre au clavier (Maj+F10, touche Menu) et ses commandes aussi", async () => {
    const { utilisateur, table } = rendreLeCalendrier(UNE);
    act(() => entree("Dentiste").focus());
    await utilisateur.keyboard("{Shift>}{F10}{/Shift}");
    const menu = screen.getByRole("menu");
    expect(menu.getAttribute("aria-label")).toBe("Actions de l'entrée Dentiste");
    await utilisateur.click(
      within(menu).getByRole("menuitem", { name: "Jour suivant : Dentiste" }),
    );
    expect(dateDe(table)).toBe("2026-10-09");
  });

  it("F-021-AC14 le menu d'une case propose « Nouvelle ligne », au clavier comme au pointeur", async () => {
    const { utilisateur, table } = rendreLeCalendrier();
    act(() => caseDuJour("2026-10-08").focus());
    await utilisateur.keyboard("{ContextMenu}");
    await utilisateur.click(element(`Nouvelle ligne le ${JEUDI}`));
    expect(table.lire().lignes).toHaveLength(1);
    expect(dateDe(table)).toBe("2026-10-08");
  });
});

describe("refus du document (F-021-AC24)", () => {
  it("F-021-AC24 une écriture refusée par une erreur typée : un message en français sans code, la vue conforme à la table, toujours utilisable", async () => {
    const { utilisateur, table, emises } = rendreLeCalendrier(UNE);
    const refus = vi.spyOn(table, "ecrireCellule").mockImplementation(() => {
      throw new ErreurDocument("ligne-introuvable", "refus du document");
    });
    act(() => entree("Dentiste").focus());
    await utilisateur.keyboard(ALT_MAJ("ArrowRight"));
    const alerte = screen.getByRole("alert").textContent;
    expect(alerte).toBe(messageErreur("ligne-introuvable"));
    expect(alerte).not.toMatch(/ligne-introuvable|refus du document/);
    expect(libellesDe("2026-10-08")).toEqual(["Dentiste"]);
    refus.mockRestore();
    await utilisateur.keyboard(ALT_MAJ("ArrowRight"));
    expect(emises).toHaveLength(1);
    expect(libellesDe("2026-10-09")).toEqual(["Dentiste"]);
  });

  it("F-021-AC24 une création refusée est dite en français et ne laisse aucune ligne ni saisie ouverte", async () => {
    const { utilisateur, table } = rendreLeCalendrier(UNE);
    vi.spyOn(table, "creerLigne").mockImplementation(() => {
      throw new ErreurDocument("colonne-introuvable", "refus du document");
    });
    await utilisateur.click(bouton(`Nouvelle ligne le ${JEUDI}`));
    expect(screen.getByRole("alert").textContent).toBe(messageErreur("colonne-introuvable"));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(table.lire().lignes).toHaveLength(1);
  });
});

describe("lecture seule (F-021-AC26)", () => {
  const RAISON = "Lecture seule";

  it("F-021-AC26 les commandes d'écriture sont indisponibles avec la raison, la navigation reste utilisable, et l'état encodé du document ne bouge pas d'un octet", async () => {
    const { utilisateur, table, emises } = rendreLeCalendrier(
      [
        { titre: "Dentiste", date: "2026-10-08" },
        { titre: "Libre", date: null },
      ],
      { lectureSeule: RAISON },
    );
    const etat = (): Uint8Array => Y.encodeStateAsUpdate(table.doc);
    const avant = etat();
    const identique = (): void => expect(etat()).toEqual(avant);

    const nouvelle = bouton(`Nouvelle ligne le ${JEUDI}`) as HTMLButtonElement;
    expect(nouvelle.disabled).toBe(true);
    expect(nouvelle.title).toBe(RAISON);
    fireEvent.click(nouvelle);
    identique();

    expect(entree("Dentiste").hasAttribute("aria-keyshortcuts")).toBe(false);
    act(() => entree("Dentiste").focus());
    for (const touche of ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"]) {
      await utilisateur.keyboard(ALT_MAJ(touche));
      identique();
    }
    await utilisateur.keyboard("{Enter}");
    await utilisateur.keyboard("{F2}");
    expect(screen.queryByRole("textbox")).toBeNull();
    identique();

    await utilisateur.click(bouton("Actions de l'entrée Dentiste"));
    for (const nom of [
      "Modifier le titre",
      "Jour précédent",
      "Jour suivant",
      "Semaine précédente",
      "Semaine suivante",
      "Changer la date",
      "Retirer la date",
      "Supprimer la ligne",
    ]) {
      const item = element(`${nom} : Dentiste`) as HTMLButtonElement;
      expect(item.disabled, nom).toBe(true);
      expect(item.textContent, nom).toContain(RAISON);
      fireEvent.click(item);
      identique();
    }
    await utilisateur.keyboard("{Escape}");

    for (const nom of ["Définir la date : Libre", "Retirer la date : Libre"]) {
      const commande = bouton(nom) as HTMLButtonElement;
      expect(commande.disabled, nom).toBe(true);
      fireEvent.click(commande);
      identique();
    }
    expect(emises).toHaveLength(0);

    await utilisateur.click(bouton("Mois suivant"));
    expect(screen.getByRole("heading", { name: "novembre 2026" })).toBeDefined();
    await utilisateur.click(bouton("Aujourd'hui"));
    expect(screen.getByRole("heading", { name: "octobre 2026" })).toBeDefined();
    identique();
  });

  it("F-021-AC26 « Placer selon » reste utilisable en lecture seule", async () => {
    const { utilisateur, table } = rendreLeCalendrier(UNE, { lectureSeule: RAISON });
    act(() => {
      // Une deuxième colonne date arrive : le choix est offert, sans rien écrire dans le document.
      table.creerColonne("Fin", "date");
    });
    const select = screen.getByRole("combobox", { name: "Placer selon" }) as HTMLSelectElement;
    expect(select.disabled).toBe(false);
    const avant = Y.encodeStateAsUpdate(table.doc);
    await utilisateur.selectOptions(select, "Fin");
    expect(Y.encodeStateAsUpdate(table.doc)).toEqual(avant);
  });
});
