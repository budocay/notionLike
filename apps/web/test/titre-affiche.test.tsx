// Titre affiché d'une page : un titre sans caractère visible se lit « Sans titre » partout, et
// aucune commande ni aucun lien de la barre latérale ne reste sans nom, quel que soit le titre.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SessionEspace } from "../src/espace/session-espace.ts";
import { titreAffiche } from "../src/interface/messages.ts";
import {
  activerActionDeRangee,
  type Coquille,
  creerPageNommee,
  ouvrirCoquille,
  recevoir,
  saisirTitre,
} from "./aides-coquille.tsx";

const SANS_TITRE = "Sans titre";
const NOM_APPLICATION = "notionLike";
const CHAMP_TITRE = { name: "Titre de la page" };

const TITRES_SANS_CARACTERE_VISIBLE: readonly (readonly [string, string])[] = [
  ["vide", ""],
  ["une espace", " "],
  ["trois espaces", "   "],
  ["tabulation et retours à la ligne", "\t\n\r\n"],
  ["espace insécable", "\u00A0"],
  ["espace fine insécable", "\u202F"],
  ["espace idéographique", "\u3000"],
  ["séparateurs de ligne et de paragraphe", "\u2028\u2029"],
  ["espace de largeur nulle U+200B", "\u200B"],
  ["antiliant U+200C", "\u200C"],
  ["liant U+200D", "\u200D"],
  ["gluon de mots U+2060", "\u2060"],
  ["indicateur d'ordre des octets U+FEFF", "\uFEFF"],
  ["les cinq à la suite, entre des espaces", " \u200B\u200C \u200D\u2060\uFEFF "],
  ["caractères de contrôle", "\u0000\u0007\u001B\u007F\u0085"],
  ["marques de direction", "\u200E\u200F\u202A\u202E\u202C\u2066\u2069"],
  ["trait d'union conditionnel", "\u00AD"],
  ["ancres d'annotation interlinéaire", "\uFFF9\uFFFA\uFFFB"],
  ["sélecteurs de variante", "\uFE0F\u{E0100}"],
  ["remplisseurs hangul", "\u115F\u1160\u3164\uFFA0"],
  ["étiquettes invisibles", "\u{E0001}\u{E0041}\u{E007F}"],
  ["braille vide U+2800", "\u2800\u2800"],
  ["deux cents espaces", " ".repeat(200)],
];

const TITRES_VISIBLES: readonly (readonly [string, string])[] = [
  ["une lettre", "a"],
  ["le libellé de remplacement lui-même", SANS_TITRE],
  ["entouré d'espaces", "  Projet  "],
  ["un signe de ponctuation", "."],
  ["deux cents caractères", "é".repeat(200)],
  ["retours à la ligne entre deux mots", "Ligne une\nLigne deux\r\nLigne trois"],
  ["balisage", '<b>gras</b><img src=x onerror="piege()">'],
  ["guillemets français", "« Projet » et « suite »"],
  ["guillemets droits et apostrophe", '"l\'idée"'],
  ["lettre précédée d'une espace de largeur nulle", "\u200Ba"],
  ["émoji composé par un liant", "👩\u200D💻"],
  ["écriture de droite à gauche", "مشروع"],
  ["lettre sous une inversion de direction", "\u202Eabc"],
  ["zéro", "0"],
];

function barreLaterale(): HTMLElement {
  return screen.getByRole("navigation", { name: "Pages" });
}

function titrePrincipal(): string | null {
  return within(screen.getByRole("main")).getByRole("heading", { level: 1 }).textContent;
}

function titresEnregistres(session: SessionEspace): string[] {
  const etat = session.lireEtat();
  if (etat.phase !== "pret") {
    throw new Error("La session n'est pas prête.");
  }
  return etat.arborescence.racines.map((page) => page.titre);
}

// Le nom accessible est rendu sans espace en tête ni en queue, les suites d'espaces réduites à une :
// la même mise à plat sert au nom attendu. Le titre de l'onglet est lu de la même façon.
function aPlat(texte: string): string {
  return texte.trim().replace(/\s+/gu, " ");
}

function sansNom(nom: string): boolean {
  return /^[\s\p{Cc}\p{Cf}]*$/u.test(nom);
}

/** Retrouve un élément par son nom accessible, aux blancs près. */
function nomme(attendu: string): (nom: string) => boolean {
  return (nom) => aPlat(nom) === aPlat(attendu);
}

/** Liens et commandes de la barre latérale dont le nom accessible est vide. */
function elementsSansNom(): HTMLElement[] {
  const barre = within(barreLaterale());
  return [
    ...barre.queryAllByRole("link", { name: sansNom }),
    ...barre.queryAllByRole("button", { name: sansNom }),
  ];
}

function nomsDesCommandes(): string[] {
  return within(barreLaterale())
    .getAllByRole("button")
    .map((commande) => commande.getAttribute("aria-label") ?? commande.textContent);
}

/** Une page au titre donné, mère d'une sous-page « Fille », reçue d'une autre réplique. */
async function recevoirPageMere(titre: string): Promise<Coquille> {
  const coquille = await ouvrirCoquille();
  recevoir(coquille.session, (espace) => {
    const parent = espace.creerPage(titre);
    espace.creerPage("Fille", { parent });
  });
  return coquille;
}

function premierLien(): HTMLElement {
  const lien = within(barreLaterale()).getAllByRole("link")[0];
  if (lien === undefined) {
    throw new Error("La barre latérale n'a aucun lien.");
  }
  return lien;
}

describe("titre affiché : règle", () => {
  it.each(TITRES_SANS_CARACTERE_VISIBLE)(
    "F-002-AC10 un titre sans caractère visible (%s) s'affiche « Sans titre »",
    (_cas, titre) => {
      expect(titreAffiche(titre)).toBe(SANS_TITRE);
    },
  );

  it.each(TITRES_VISIBLES)(
    "F-002-AC10 un titre qui a un caractère visible (%s) s'affiche tel qu'il est enregistré",
    (_cas, titre) => {
      expect(titreAffiche(titre)).toBe(titre);
    },
  );
});

// Couture : tout module qui lit le titre d'une page le montre par `titreAffiche`. La seule lecture
// brute admise est celle qui remplit le champ de renommage, où le titre enregistré est attendu.
describe("titre affiché : lectures du titre dans le code", () => {
  const LECTURE = /(titreAffiche\()?((?:[A-Za-z]+\.)*page\.titre)\b/gu;
  const sources = import.meta.glob<string>("../src/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  });

  function lectures(): { affichees: string[]; brutes: string[] } {
    const affichees: string[] = [];
    const brutes: string[] = [];
    for (const [chemin, texte] of Object.entries(sources)) {
      for (const ligne of texte.split("\n")) {
        for (const lecture of ligne.matchAll(LECTURE)) {
          (lecture[1] === undefined ? brutes : affichees).push(`${chemin} : ${ligne.trim()}`);
        }
      }
    }
    return { affichees: affichees.sort(), brutes: brutes.sort() };
  }

  it("F-002-AC10 F-002-AC11 chaque lecture du titre d'une page passe par `titreAffiche`, sauf le champ de renommage", () => {
    expect(lectures()).toEqual({
      affichees: [
        '../src/interface/Application.tsx : const titre = selection.type === "page" ? titreAffiche(selection.page.titre) : undefined;',
        "../src/interface/RangeePage.tsx : const titre = titreAffiche(page.titre);",
        "../src/interface/ZonePrincipale.tsx : <h1>{titreAffiche(selection.page.titre)}</h1>",
      ],
      brutes: ["../src/interface/RangeePage.tsx : titreInitial={page.titre}"],
    });
  });
});

describe("titre affiché : barre latérale, zone principale, onglet", () => {
  it("F-002-AC10 F-002-AC6 une page renommée en espaces se retrouve par le nom « Sans titre » : lien, trois actions, zone principale, onglet ; le titre enregistré reste celui saisi et la saisie rouvre sur lui", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Agenda");

    await activerActionDeRangee(utilisateur, "renommer", "Agenda");
    await saisirTitre(utilisateur, "   ");

    const barre = within(barreLaterale());
    const lien = await barre.findByRole("link", { name: SANS_TITRE });
    expect(lien.textContent).toBe(SANS_TITRE);
    expect(lien.getAttribute("aria-current")).toBe("page");
    expect(barre.getByRole("button", { name: "Renommer « Sans titre »" })).toBeDefined();
    expect(
      barre.getByRole("button", { name: "Ajouter une sous-page à « Sans titre »" }),
    ).toBeDefined();
    expect(
      barre.getByRole("button", { name: "Mettre « Sans titre » à la corbeille" }),
    ).toBeDefined();
    expect(elementsSansNom()).toEqual([]);
    expect(titrePrincipal()).toBe(SANS_TITRE);
    await waitFor(() => expect(document.title).toBe(`${SANS_TITRE} · ${NOM_APPLICATION}`));

    expect(titresEnregistres(session)).toEqual(["   "]);
    await activerActionDeRangee(utilisateur, "renommer", SANS_TITRE);
    const champ = await screen.findByRole<HTMLInputElement>("textbox", CHAMP_TITRE);
    expect(champ.value).toBe("   ");
    expect(champ.selectionStart).toBe(0);
    expect(champ.selectionEnd).toBe(3);

    await utilisateur.keyboard("{Escape}");
    expect(titresEnregistres(session)).toEqual(["   "]);
    expect(await barre.findByRole("link", { name: SANS_TITRE })).toBeDefined();
  });

  it("F-002-AC10 F-002-AC6 un titre d'espaces validé par la sortie du champ donne le même lien « Sans titre », au clavier seul", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Agenda");

    await utilisateur.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Renommer « Agenda »" }),
    );
    await utilisateur.keyboard("{Enter}");
    await screen.findByRole("textbox", CHAMP_TITRE);
    await utilisateur.keyboard("  ");
    await utilisateur.tab();

    expect(await screen.findByRole("link", { name: SANS_TITRE })).toBeDefined();
    expect(elementsSansNom()).toEqual([]);
    expect(titresEnregistres(session)).toEqual(["  "]);
  });

  it.each(TITRES_SANS_CARACTERE_VISIBLE)(
    "F-002-AC10 F-002-AC11 titre reçu sans caractère visible (%s) : lien, commandes, zone principale et onglet disent « Sans titre »",
    async (_cas, titre) => {
      const { session, utilisateur } = await recevoirPageMere(titre);

      expect(elementsSansNom()).toEqual([]);
      expect(premierLien().textContent).toBe(SANS_TITRE);
      expect(nomsDesCommandes().slice(0, 5)).toEqual([
        "Nouvelle page",
        "Replier « Sans titre »",
        "Renommer « Sans titre »",
        "Ajouter une sous-page à « Sans titre »",
        "Mettre « Sans titre » à la corbeille",
      ]);
      expect(titresEnregistres(session)).toEqual([titre]);

      await utilisateur.click(premierLien());
      await waitFor(() => {
        expect(titrePrincipal()).toBe(SANS_TITRE);
        expect(document.title).toBe(`${SANS_TITRE} · ${NOM_APPLICATION}`);
      });
      expect(premierLien().getAttribute("aria-current")).toBe("page");

      await utilisateur.click(screen.getByRole("button", { name: "Replier « Sans titre »" }));
      expect(screen.getByRole("button", { name: "Déplier « Sans titre »" })).toBeDefined();
      expect(elementsSansNom()).toEqual([]);
    },
  );

  it.each(TITRES_VISIBLES)(
    "F-002-AC10 F-002-AC11 F-002-AC18 titre reçu visible (%s) : le même titre nomme le lien, les commandes, la zone principale et l'onglet, sans élément sans nom",
    async (_cas, titre) => {
      const { session, utilisateur } = await recevoirPageMere(titre);
      const barre = within(barreLaterale());

      expect(elementsSansNom()).toEqual([]);
      expect(premierLien().textContent).toBe(titre);
      expect(barre.getByRole("link", { name: nomme(titre) })).toBe(premierLien());
      for (const nom of [
        `Replier « ${titre} »`,
        `Renommer « ${titre} »`,
        `Ajouter une sous-page à « ${titre} »`,
        `Mettre « ${titre} » à la corbeille`,
      ]) {
        expect(barre.getByRole("button", { name: nomme(nom) }).getAttribute("aria-label")).toBe(
          nom,
        );
      }
      expect(barreLaterale().querySelector("b, img, script")).toBeNull();
      expect(titresEnregistres(session)).toEqual([titre]);

      await utilisateur.click(premierLien());
      await waitFor(() => {
        expect(titrePrincipal()).toBe(titre);
        expect(document.title).toBe(aPlat(`${titre} · ${NOM_APPLICATION}`));
      });
      expect(screen.getByRole("main").querySelector("b, img, script")).toBeNull();
    },
  );
});
