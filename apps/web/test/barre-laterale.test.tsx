import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  activerActionDeRangee,
  activerActionDeRangeeAuClavier,
  atteindreActionDeRangee,
  boutonNouvellePage,
  commandesDuMenu,
  creerPageNommee,
  ENTREES_DU_MENU,
  etatEncode,
  nomDuMenu,
  ouvrirCoquille,
  recevoir,
  saisirTitre,
  tabulerJusqua,
  titresParFratrie,
} from "./aides-coquille.tsx";

const CHAMP_TITRE = { name: "Titre de la page" };

function barreLaterale(): HTMLElement {
  return screen.getByRole("navigation", { name: "Pages" });
}

function titresDesListes(): string[][] {
  return titresParFratrie(barreLaterale());
}

function bouton(nom: string): HTMLElement {
  return screen.getByRole("button", { name: nom });
}

function rangees(): HTMLElement[] {
  return within(barreLaterale()).getAllByRole("listitem");
}

describe("barre latérale", () => {
  it("F-002-AC5 « Ajouter une sous-page » crée en dernière position sous la page, déplie le parent et ouvre la saisie", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Parent");
    recevoir(session, (espace) => {
      const parent = espace.lire().racines[0]?.id ?? "";
      espace.creerPage("Aînée", { parent });
    });
    await utilisateur.click(bouton("Sous-pages de « Parent »"));
    expect(screen.queryByRole("link", { name: "Aînée" })).toBeNull();

    await activerActionDeRangee(utilisateur, "ajouter-une-sous-page", "Parent");

    const champ = await screen.findByRole("textbox", CHAMP_TITRE);
    expect(document.activeElement).toBe(champ);
    expect((champ as HTMLInputElement).value).toBe("");
    expect(bouton("Sous-pages de « Parent »").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: "Aînée" })).toBeDefined();
    // La nouvelle rangée est la dernière sous le parent : troisième de la liste, de niveau 2.
    expect(rangees()).toHaveLength(3);
    expect(rangees()[2]?.contains(champ)).toBe(true);
    expect(rangees()[2]?.getAttribute("aria-level")).toBe("2");

    await utilisateur.keyboard("Cadette{Enter}");

    await waitFor(() => expect(titresDesListes()).toEqual([["Parent"], ["Aînée", "Cadette"]]));
  });

  it("F-002-AC5 la saisie du titre s'ouvre à la création d'une page à la racine, le champ a le focus", async () => {
    const { utilisateur } = await ouvrirCoquille();

    await utilisateur.click(await boutonNouvellePage());

    const champ = await screen.findByRole("textbox", CHAMP_TITRE);
    expect(document.activeElement).toBe(champ);
    expect((champ as HTMLInputElement).value).toBe("");
    expect(rangees()).toHaveLength(1);
    expect(rangees()[0]?.contains(champ)).toBe(true);
    expect(rangees()[0]?.getAttribute("aria-level")).toBe("1");

    await utilisateur.keyboard("{Escape}");

    expect(await screen.findByRole("link", { name: "Sans titre" })).toBeDefined();
  });

  it("F-002-AC6 Entrée valide le titre, une seule fois, et le focus revient au lien de la page", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    await utilisateur.click(await boutonNouvellePage());
    const avant = etatEncode(session).length;

    await utilisateur.keyboard("Compte rendu{Enter}");

    const lien = await screen.findByRole("link", { name: "Compte rendu" });
    expect(screen.queryByRole("textbox", { name: "Titre de la page" })).toBeNull();
    expect(document.activeElement).toBe(lien);
    const apresValidation = etatEncode(session);
    expect(apresValidation.length).toBeGreaterThan(avant);

    await utilisateur.tab();
    await utilisateur.click(document.body);

    expect(etatEncode(session)).toEqual(apresValidation);
    expect(screen.getByRole("link", { name: "Compte rendu" })).toBeDefined();
  });

  it("F-002-AC6 la sortie du champ valide le titre saisi, sans reprendre le focus", async () => {
    const { utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Brouillon");
    await activerActionDeRangee(utilisateur, "renommer", "Brouillon");
    const champ = await screen.findByRole("textbox", CHAMP_TITRE);
    expect((champ as HTMLInputElement).value).toBe("Brouillon");

    await utilisateur.clear(champ);
    await utilisateur.type(champ, "Version finale");
    await utilisateur.tab();

    expect(await screen.findByRole("link", { name: "Version finale" })).toBeDefined();
    expect(screen.queryByRole("textbox", { name: "Titre de la page" })).toBeNull();
    // La sortie du champ a porté le focus sur la commande suivante : le lien ne le reprend pas.
    expect(document.activeElement).not.toBe(screen.getByRole("link", { name: "Version finale" }));
    expect(document.activeElement).not.toBe(document.body);
    expect(barreLaterale().contains(document.activeElement)).toBe(true);
  });

  it("F-002-AC6 Échap conserve l'ancien titre, et la sortie du champ qui suit ne renomme rien", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Inchangé");
    const avant = etatEncode(session);
    await activerActionDeRangee(utilisateur, "renommer", "Inchangé");
    const champ = await screen.findByRole("textbox", CHAMP_TITRE);

    await utilisateur.clear(champ);
    await utilisateur.type(champ, "Abandonné");
    await utilisateur.keyboard("{Escape}");

    const lien = await screen.findByRole("link", { name: "Inchangé" });
    expect(screen.queryByRole("textbox", { name: "Titre de la page" })).toBeNull();
    expect(document.activeElement).toBe(lien);
    await utilisateur.click(document.body);
    expect(screen.queryByRole("link", { name: "Abandonné" })).toBeNull();
    expect(etatEncode(session)).toEqual(avant);
  });

  it("F-002-AC7 la mise à la corbeille retire la page et toute sa descendance, le focus va à « Nouvelle page »", async () => {
    const { utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Gardée");
    await creerPageNommee(utilisateur, "Dossier");
    await activerActionDeRangee(utilisateur, "ajouter-une-sous-page", "Dossier");
    await saisirTitre(utilisateur, "Fille");
    await screen.findByRole("link", { name: "Fille" });
    await activerActionDeRangee(utilisateur, "ajouter-une-sous-page", "Fille");
    await saisirTitre(utilisateur, "Petite-fille");
    await screen.findByRole("link", { name: "Petite-fille" });

    await activerActionDeRangee(utilisateur, "mettre-a-la-corbeille", "Dossier");

    await waitFor(() => expect(titresDesListes()).toEqual([["Gardée"]]));
    expect(screen.queryByRole("link", { name: "Fille" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Petite-fille" })).toBeNull();
    expect(document.activeElement).toBe(await boutonNouvellePage());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("F-002-AC8 replier et déplier masque et affiche la descendance sans modifier le document", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    recevoir(session, (espace) => {
      const parent = espace.creerPage("Parent");
      const fille = espace.creerPage("Fille", { parent });
      espace.creerPage("Petite-fille", { parent: fille });
      espace.creerPage("Feuille");
    });
    const avant = etatEncode(session);
    const repli = bouton("Sous-pages de « Parent »");
    expect(repli.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: "Petite-fille" })).toBeDefined();

    await utilisateur.click(repli);

    const depli = bouton("Sous-pages de « Parent »");
    expect(depli.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(depli);
    expect(screen.queryByRole("link", { name: "Fille" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Petite-fille" })).toBeNull();
    expect(screen.getByRole("link", { name: "Parent" })).toBeDefined();
    expect(etatEncode(session)).toEqual(avant);

    await utilisateur.click(depli);

    expect(screen.getByRole("link", { name: "Fille" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Petite-fille" })).toBeDefined();
    expect(etatEncode(session)).toEqual(avant);
  });

  it("F-002-AC8 une page sans sous-page ne propose ni repli ni dépli", async () => {
    const { session } = await ouvrirCoquille();
    recevoir(session, (espace) => {
      const parent = espace.creerPage("Parent");
      espace.creerPage("Fille", { parent });
      espace.creerPage("Feuille");
    });

    expect(screen.queryByRole("button", { name: /^Sous-pages de « Feuille »/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Sous-pages de « Fille »/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Sous-pages de / })).toHaveLength(1);
  });

  it("F-002-AC10 créer, renommer, ajouter une sous-page, replier, déplier et mettre à la corbeille au clavier seul", async () => {
    const { utilisateur } = await ouvrirCoquille();

    await tabulerJusqua(utilisateur, () => bouton("Nouvelle page"));
    await utilisateur.keyboard("{Enter}");
    expect(document.activeElement).toBe(await screen.findByRole("textbox", CHAMP_TITRE));
    await utilisateur.keyboard("Agenda{Enter}");
    expect(document.activeElement).toBe(await screen.findByRole("link", { name: "Agenda" }));

    await activerActionDeRangeeAuClavier(utilisateur, "renommer", "Agenda");
    expect(document.activeElement).toBe(await screen.findByRole("textbox", CHAMP_TITRE));
    await utilisateur.keyboard("Planning{Enter}");
    expect(document.activeElement).toBe(await screen.findByRole("link", { name: "Planning" }));

    await tabulerJusqua(utilisateur, () => bouton("Ajouter une sous-page à « Planning »"));
    await utilisateur.keyboard(" ");
    expect(document.activeElement).toBe(await screen.findByRole("textbox", CHAMP_TITRE));
    await utilisateur.keyboard("Lundi{Enter}");
    expect(document.activeElement).toBe(await screen.findByRole("link", { name: "Lundi" }));

    await tabulerJusqua(utilisateur, () => bouton("Sous-pages de « Planning »"), { shift: true });
    await utilisateur.keyboard("{Enter}");
    expect(screen.queryByRole("link", { name: "Lundi" })).toBeNull();
    expect(document.activeElement).toBe(bouton("Sous-pages de « Planning »"));
    await utilisateur.keyboard(" ");
    expect(screen.getByRole("link", { name: "Lundi" })).toBeDefined();
    expect(document.activeElement).toBe(bouton("Sous-pages de « Planning »"));

    await activerActionDeRangeeAuClavier(utilisateur, "mettre-a-la-corbeille", "Planning");
    await waitFor(() => expect(screen.queryAllByRole("link")).toEqual([]));
    expect(document.activeElement).toBe(await boutonNouvellePage());
  });

  it("F-002-AC10 chaque commande de la barre latérale est native et porte un nom accessible français", async () => {
    const { session } = await ouvrirCoquille();
    recevoir(session, (espace) => {
      const parent = espace.creerPage("Parent");
      espace.creerPage("", { parent });
    });

    const noms = within(barreLaterale())
      .getAllByRole("button")
      .map((commande) => {
        expect(commande.tagName).toBe("BUTTON");
        expect((commande as HTMLButtonElement).type).toBe("button");
        expect(commande.tabIndex).toBe(0);
        return commande.getAttribute("aria-label") ?? commande.textContent;
      });

    expect(noms).toEqual([
      "Nouvelle page",
      "Sous-pages de « Parent »",
      "Ajouter une sous-page à « Parent »",
      "Actions de la page « Parent »",
      "Ajouter une sous-page à « Sans titre »",
      "Actions de la page « Sans titre »",
      // F-007 : l'entrée du pied, après l'arborescence.
      "Corbeille",
    ]);
    // Renommer et mettre à la corbeille sont des entrées du menu de la page, natives elles aussi.
    for (const titre of ["Parent", "Sans titre"]) {
      const menu = (await atteindreActionDeRangee("renommer", titre)).parentElement as HTMLElement;
      for (const entree of within(menu).getAllByRole("menuitem")) {
        expect(entree.tagName).toBe("BUTTON");
        expect((entree as HTMLButtonElement).type).toBe("button");
        expect(entree.tabIndex).toBe(0);
      }
      expect(await commandesDuMenu(titre)).toEqual([nomDuMenu(titre), ...ENTREES_DU_MENU]);
    }
    expect(
      within(barreLaterale())
        .getAllByRole("link")
        .map((lien) => lien.textContent),
    ).toEqual(["Parent", "Sans titre"]);
  });
});

const PROFONDEUR_EPROUVEE = 2_000;

describe("barre latérale : profondeur", () => {
  // Garde-fou : le rendu imbriqué d'origine vidait l'écran dans Chromium dès 1 000 niveaux
  // (« Maximum call stack size exceeded ») et gelait le DOM simulé bien avant.
  it(`F-002-AC5 F-002-AC10 un arbre de ${PROFONDEUR_EPROUVEE} niveaux s'affiche en entier, se sélectionne et se replie`, async () => {
    const { session, utilisateur } = await ouvrirCoquille();

    recevoir(session, (espace) => {
      let parent: string | null = null;
      for (let niveau = 1; niveau <= PROFONDEUR_EPROUVEE; niveau += 1) {
        parent = espace.creerPage(`Niveau ${niveau}`, { parent });
      }
    });

    const liens = within(barreLaterale()).getAllByRole("link");
    expect(liens).toHaveLength(PROFONDEUR_EPROUVEE);
    const derniere = liens.at(-1);
    expect(derniere?.textContent).toBe(`Niveau ${PROFONDEUR_EPROUVEE}`);
    expect(derniere?.closest("li")?.getAttribute("aria-level")).toBe(String(PROFONDEUR_EPROUVEE));

    await utilisateur.click(liens[PROFONDEUR_EPROUVEE - 1] as HTMLElement);

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
        `Niveau ${PROFONDEUR_EPROUVEE}`,
      ),
    );

    await utilisateur.click(bouton("Sous-pages de « Niveau 1 »"));

    expect(titresDesListes()).toEqual([["Niveau 1"]]);
  }, 60_000);
});
